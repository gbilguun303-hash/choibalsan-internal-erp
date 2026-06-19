"use strict";

const { all, get } = require("../db");

function ymStart(y, m) {
  return `${Number(y)}-${String(Number(m)).padStart(2, "0")}-01`;
}
function nextMonthStart(y, m) {
  const d = new Date(Date.UTC(Number(y), Number(m), 1));
  return d.toISOString().slice(0, 10);
}

async function buildMonthlyReport(year, month) {
  const y = Number(year);
  const m = Number(month);
  const start = ymStart(y, m);
  const end   = nextMonthStart(y, m);
  const prefix = start.slice(0, 7);

  const [
    workRows,
    byCategory,
    openRisks,
    hseSnap,
    matByWork,
    cashRows,
    expenseRows,
    hrRows,
    vehicleRows,
  ] = await Promise.all([
    // Work orders for this month (overlap: start < month_end AND effective_end >= month_start)
    all(`SELECT id,title,category,status,progress,work_date,start_date,end_date,assigned_to,
                habea_pre_status,habea_post_status
         FROM asset_events
         WHERE COALESCE(NULLIF(start_date,''), NULLIF(work_date,'')) < ?
           AND COALESCE(NULLIF(end_date,''), NULLIF(start_date,''), NULLIF(work_date,'')) >= ?`
      , [end, start]).catch(() => []),

    // By category
    all(`SELECT category,
               COUNT(*) total,
               SUM(CASE WHEN status IN ('Хаагдсан','Дууссан') THEN 1 ELSE 0 END) closed,
               SUM(CASE WHEN status IN ('Явцтай','Эхэлсэн') THEN 1 ELSE 0 END) active,
               SUM(CASE WHEN status='Дууссан гэж илгээсэн' THEN 1 ELSE 0 END) hse_wait,
               SUM(CASE WHEN status='ХАБЭА шалгасан' THEN 1 ELSE 0 END) pend_final,
               SUM(CASE WHEN status='Буцаагдсан' THEN 1 ELSE 0 END) rejected,
               ROUND(AVG(progress),0) avg_progress
         FROM asset_events
         WHERE COALESCE(NULLIF(start_date,''), NULLIF(work_date,'')) < ?
           AND COALESCE(NULLIF(end_date,''), NULLIF(start_date,''), NULLIF(work_date,'')) >= ?
         GROUP BY category ORDER BY total DESC`, [end, start]).catch(() => []),

    // Open risks
    all(`SELECT risk_level, workflow_status
         FROM safety_reports WHERE workflow_status != 'Хаасан'`).catch(() => []),

    // Saved HSE snapshot for this month (if any)
    get(`SELECT data_json, source, created_at, title
         FROM hse_report_snapshots
         WHERE period_type='monthly' AND year=? AND month=?`, [y, m]).catch(() => null),

    // Material usage by work for this month
    all(`SELECT COALESCE(NULLIF(w.title,''), NULLIF(t.work_ref,''), 'Холбоосгүй') work_label,
               t.work_log_id, m.name material_name, m.unit,
               SUM(t.qty) total_qty, SUM(t.amount) total_amount
         FROM wh_transactions t
         LEFT JOIN wh_materials m ON m.id=t.material_id
         LEFT JOIN asset_events w ON w.id=t.work_log_id
         WHERE t.txn_type IN ('EXPENSE','INTERNAL_OUT')
           AND t.txn_date>=? AND t.txn_date<?
         GROUP BY t.work_log_id, t.work_ref, t.material_id
         ORDER BY work_label, m.name`, [start, end]).catch(() => []),

    // Cash journal
    get(`SELECT
           SUM(CASE WHEN txn_type='Орлого' THEN amount ELSE 0 END) income,
           SUM(CASE WHEN txn_type='Зарлага' THEN amount ELSE 0 END) expense
         FROM cash_journal WHERE txn_date>=? AND txn_date<?`, [start, end]).catch(() => null),

    // Expenses
    get(`SELECT COUNT(*) count, SUM(amount) total
         FROM expenses WHERE expense_date>=? AND expense_date<?`, [start, end]).catch(() => null),

    // HR records
    all(`SELECT record_type, COUNT(*) count
         FROM hr_records WHERE start_date>=? AND start_date<?
         GROUP BY record_type ORDER BY count DESC`, [start, end]).catch(() => []),

    // Vehicles in repair
    all(`SELECT status, COUNT(*) count
         FROM vehicles GROUP BY status`).catch(() => []),
  ]);

  // ── Work stats ────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const closed    = workRows.filter(w => ['Хаагдсан','Дууссан'].includes(w.status));
  const active    = workRows.filter(w => ['Явцтай','Эхэлсэн'].includes(w.status));
  const hseWait   = workRows.filter(w => w.status === 'Дууссан гэж илгээсэн');
  const pendFinal = workRows.filter(w => w.status === 'ХАБЭА шалгасан');
  const rejected  = workRows.filter(w => w.status === 'Буцаагдсан');
  const overdue   = workRows.filter(w =>
    ['Явцтай','Эхэлсэн'].includes(w.status) &&
    w.end_date && w.end_date < today);
  const avgProg   = workRows.length
    ? Math.round(workRows.reduce((s, w) => s + Number(w.progress || 0), 0) / workRows.length)
    : 0;

  // ── HSE stats (from live data) ────────────────────────────────
  const openRiskCount = openRisks.length;
  const highRisks = openRisks.filter(r => ['Маш өндөр','Өндөр'].includes(r.risk_level));
  const newRisks  = openRisks.filter(r => (r.workflow_status || 'Шинэ') === 'Шинэ');

  // ── Materials ─────────────────────────────────────────────────
  const matTotal = matByWork.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const matWorkMap = new Map();
  matByWork.forEach(r => {
    const k = r.work_log_id || r.work_label;
    const g = matWorkMap.get(k) || { label: r.work_label, total: 0, lines: [] };
    g.total += Number(r.total_amount || 0);
    g.lines.push({ name: r.material_name, qty: r.total_qty, unit: r.unit, amount: r.total_amount });
    matWorkMap.set(k, g);
  });
  const matByWorkGrouped = [...matWorkMap.values()].sort((a, b) => b.total - a.total);

  // ── Finance ───────────────────────────────────────────────────
  const finIncome   = Number(cashRows?.income  || 0);
  const finExpense  = Number(cashRows?.expense || 0);
  const opExpenses  = Number(expenseRows?.total || 0);

  // ── Vehicles ─────────────────────────────────────────────────
  const inRepair = vehicleRows.filter(v => ['Засварт','Их засвартай'].includes(v.status))
    .reduce((s, v) => s + v.count, 0);
  const totalVehicles = vehicleRows.reduce((s, v) => s + v.count, 0);

  return {
    period: { year: y, month: m, start, end, prefix },
    work: {
      total: workRows.length,
      closed: closed.length,
      active: active.length,
      hse_waiting: hseWait.length,
      pending_final: pendFinal.length,
      rejected: rejected.length,
      overdue: overdue.length,
      avg_progress: avgProg,
      by_category: byCategory,
    },
    hse: {
      snapshot: hseSnap ? {
        saved_at: hseSnap.created_at,
        source: hseSnap.source,
        title: hseSnap.title,
        data: (() => { try { return JSON.parse(hseSnap.data_json || '{}'); } catch { return {}; } })(),
      } : null,
      open_risks: openRiskCount,
      high_risks: highRisks.length,
      new_risks: newRisks.length,
    },
    materials: {
      total_amount: matTotal,
      by_work: matByWorkGrouped,
    },
    finance: {
      income: finIncome,
      expense: finExpense,
      op_expenses: opExpenses,
    },
    hr: {
      records: hrRows,
      total: hrRows.reduce((s, r) => s + r.count, 0),
    },
    vehicles: {
      total: totalVehicles,
      in_repair: inRepair,
    },
  };
}

module.exports = { buildMonthlyReport };
