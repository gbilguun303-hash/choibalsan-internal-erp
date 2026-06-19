"use strict";

const { run, all, get } = require("../db");

function ymStart(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function nextMonthStart(year, month) {
  const d = new Date(Date.UTC(Number(year), Number(month), 1));
  return d.toISOString().slice(0, 10);
}

function prevYearMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

function safeJson(raw, fallback = null) {
  try { return JSON.parse(raw || ""); } catch { return fallback; }
}

async function buildHseMonthlySnapshot(year, month) {
  const y = Number(year);
  const m = Number(month);
  const start = ymStart(y, m);
  const end = nextMonthStart(y, m);
  const prev = prevYearMonth(y, m);
  const prevSnap = await get(
    "SELECT data_json FROM hse_report_snapshots WHERE period_type='monthly' AND year=? AND month=?",
    [prev.year, prev.month]
  ).catch(() => null);
  const prevData = safeJson(prevSnap?.data_json, {});
  const openingItems = Array.isArray(prevData?.closing_open_items) ? prevData.closing_open_items : [];

  const [riskRows, ptwRows, worksPre, worksPost, dailyRows, monthlyRows, repairRows, vehicles, routeRows, accidentRows, diseaseRows] = await Promise.all([
    all(`SELECT * FROM safety_reports WHERE report_date>=? AND report_date<? ORDER BY report_date DESC, id DESC`, [start, end]).catch(() => []),
    all(`SELECT * FROM safety_reports WHERE work_log_id IS NOT NULL AND report_date>=? AND report_date<? ORDER BY report_date DESC, id DESC`, [start, end]).catch(() => []),
    all(`SELECT id,title,category,location,habea_pre_at,habea_pre_status FROM asset_events WHERE habea_pre_at>=? AND habea_pre_at<? ORDER BY habea_pre_at DESC`, [start, end]).catch(() => []),
    all(`SELECT id,title,category,location,habea_post_at,habea_post_status,status FROM asset_events WHERE habea_post_at>=? AND habea_post_at<? ORDER BY habea_post_at DESC`, [start, end]).catch(() => []),
    all(`SELECT * FROM vehicle_daily_inspections WHERE insp_date>=? AND insp_date<? ORDER BY insp_date DESC`, [start, end]).catch(() => []),
    all(`SELECT * FROM vehicle_monthly_inspections WHERE insp_year=? AND insp_month=? ORDER BY id DESC`, [y, m]).catch(() => []),
    all(`SELECT * FROM vehicle_repairs WHERE repair_date>=? AND repair_date<? ORDER BY repair_date DESC`, [start, end]).catch(() => []),
    all(`SELECT id,plate_no,vehicle_type,status FROM vehicles ORDER BY plate_no`).catch(() => []),
    all(`SELECT * FROM safety_route_plans WHERE route_date>=? AND route_date<? ORDER BY route_date DESC, id DESC`, [start, end]).catch(() => []),
    all(`SELECT * FROM safety_accidents WHERE accident_date>=? AND accident_date<? ORDER BY accident_date DESC, id DESC`, [start, end]).catch(() => []),
    all(`SELECT * FROM safety_occupational_diseases WHERE detected_date>=? AND detected_date<? ORDER BY detected_date DESC, id DESC`, [start, end]).catch(() => []),
  ]);

  const closingOpen = await all(
    `SELECT id, report_date, location, risk_type, risk_level, workflow_status, assigned_to, deadline, work_log_id
     FROM safety_reports
     WHERE report_date < ? AND COALESCE(workflow_status,'Шинэ') != 'Хаасан'
     ORDER BY report_date DESC, id DESC`,
    [end]
  ).catch(() => []);

  const count = (rows, fn) => rows.filter(fn).length;
  const byLevel = {};
  ["Бага", "Дунд", "Өндөр", "Маш өндөр"].forEach(level => { byLevel[level] = count(riskRows, r => r.risk_level === level); });
  const byWorkflow = {};
  ["Шинэ", "Танилцсан", "Арга хэмжээ өгсөн", "Хэрэгжиж байна", "Хаасан"].forEach(wf => {
    byWorkflow[wf] = count(riskRows, r => (r.workflow_status || "Шинэ") === wf);
  });

  return {
    period_type: "monthly",
    year: y,
    month: m,
    period: `${y}-${String(m).padStart(2, "0")}`,
    opening_open_count: openingItems.length,
    opening_open_items: openingItems,
    risk_total: riskRows.length,
    risk_closed: count(riskRows, r => (r.workflow_status || "Шинэ") === "Хаасан"),
    risk_high: count(riskRows, r => ["Өндөр", "Маш өндөр"].includes(r.risk_level)),
    risk_by_level: byLevel,
    risk_by_workflow: byWorkflow,
    ppe_filled: count(riskRows, r => (safeJson(r.ppe_checklist, []) || []).length > 0),
    action_filled: count(riskRows, r => r.action_plan || r.action_note),
    ptw_total: ptwRows.length,
    ptw_approved: count(ptwRows, r => r.status === "Батлагдсан"),
    ptw_closed: count(ptwRows, r => r.status === "Хаагдсан"),
    pre_approved: worksPre.length,
    post_checked: worksPost.length,
    post_rejected: count(worksPost, w => w.habea_post_status === "rejected"),
    vehicle_total: vehicles.length,
    daily_inspections: dailyRows.length,
    daily_failed: count(dailyRows, d => Number(d.overall_ok) !== 1),
    monthly_inspections: monthlyRows.length,
    repairs_total: repairRows.length,
    repairs_done: count(repairRows, r => r.repair_status === "Дууссан"),
    repairs_active: count(repairRows, r => r.repair_status !== "Дууссан"),
    route_total: routeRows.length,
    route_active: count(routeRows, r => (r.status || "Батлагдсан") !== "Цуцлагдсан"),
    accident_total: accidentRows.length,
    accident_open: count(accidentRows, r => (r.status || "Нээлттэй") !== "Хаасан"),
    accident_serious: count(accidentRows, r => ["Хүнд", "Ноцтой", "Нас баралт"].includes(r.severity)),
    occupational_disease_total: diseaseRows.length,
    occupational_disease_active: count(diseaseRows, r => (r.status || "Хяналтад") !== "Хаасан"),
    route_items: routeRows.slice(0, 30),
    accident_items: accidentRows.slice(0, 30),
    occupational_disease_items: diseaseRows.slice(0, 30),
    closing_open_count: closingOpen.length,
    closing_open_items: closingOpen,
    generated_at: new Date().toISOString(),
  };
}

async function saveHseMonthlySnapshot(year, month, source = "manual", createdBy = 0) {
  const data = await buildHseMonthlySnapshot(year, month);
  const title = `ХАБЭА сарын тайлан ${year}-${String(month).padStart(2, "0")}`;
  await run(
    `INSERT INTO hse_report_snapshots(period_type,year,month,title,data_json,source,status,created_by)
     VALUES('monthly',?,?,?,?,?,?,?)
     ON CONFLICT(period_type,year,month) DO UPDATE SET
       title=excluded.title,
       data_json=excluded.data_json,
       source=excluded.source,
       updated_at=CURRENT_TIMESTAMP`,
    [Number(year), Number(month), title, JSON.stringify(data), source, source === "auto" ? "auto_saved" : "draft", createdBy]
  );
  return data;
}

async function buildHseAnnualSnapshot(year) {
  const y = Number(year);
  const monthlyRows = await all(
    "SELECT * FROM hse_report_snapshots WHERE period_type='monthly' AND year=? ORDER BY month ASC",
    [y]
  ).catch(() => []);
  const months = monthlyRows.map(r => safeJson(r.data_json, {})).filter(Boolean);
  const sum = key => months.reduce((s, m) => s + Number(m[key] || 0), 0);
  const last = months[months.length - 1] || {};
  return {
    period_type: "annual",
    year: y,
    months_saved: months.length,
    months,
    risk_total: sum("risk_total"),
    risk_closed: sum("risk_closed"),
    risk_high: sum("risk_high"),
    ptw_total: sum("ptw_total"),
    pre_approved: sum("pre_approved"),
    post_checked: sum("post_checked"),
    post_rejected: sum("post_rejected"),
    daily_inspections: sum("daily_inspections"),
    monthly_inspections: sum("monthly_inspections"),
    repairs_total: sum("repairs_total"),
    repairs_done: sum("repairs_done"),
    route_total: sum("route_total"),
    accident_total: sum("accident_total"),
    accident_serious: sum("accident_serious"),
    occupational_disease_total: sum("occupational_disease_total"),
    closing_open_count: Number(last.closing_open_count || 0),
    closing_open_items: Array.isArray(last.closing_open_items) ? last.closing_open_items : [],
    generated_at: new Date().toISOString(),
  };
}

async function saveHseAnnualSnapshot(year, source = "manual", createdBy = 0) {
  const data = await buildHseAnnualSnapshot(year);
  const title = `ХАБЭА жилийн тайлан ${year}`;
  await run(
    `INSERT INTO hse_report_snapshots(period_type,year,month,title,data_json,source,status,created_by)
     VALUES('annual',?,0,?,?,?,?,?)
     ON CONFLICT(period_type,year,month) DO UPDATE SET
       title=excluded.title,
       data_json=excluded.data_json,
       source=excluded.source,
       updated_at=CURRENT_TIMESTAMP`,
    [Number(year), title, JSON.stringify(data), source, source === "auto" ? "auto_saved" : "draft", createdBy]
  );
  return data;
}

function isLastDayOfMonth(date = new Date()) {
  const tomorrow = new Date(date.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getMonth() !== date.getMonth();
}

function isWorkingDay(date = new Date()) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function isLastWorkingDayOfMonth(date = new Date()) {
  if (!isWorkingDay(date)) return false;
  const month = date.getMonth();
  const cursor = new Date(date.getTime());
  cursor.setDate(cursor.getDate() + 1);
  while (cursor.getMonth() === month) {
    if (isWorkingDay(cursor)) return false;
    cursor.setDate(cursor.getDate() + 1);
  }
  return true;
}

module.exports = {
  buildHseMonthlySnapshot,
  saveHseMonthlySnapshot,
  buildHseAnnualSnapshot,
  saveHseAnnualSnapshot,
  isLastDayOfMonth,
  isLastWorkingDayOfMonth,
};
