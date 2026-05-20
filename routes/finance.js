const express = require("express");
const { run, all, get, auth, audit, upload } = require("../db");
const { requireRole, requirePermission } = require("../middleware/roles");

const router = express.Router();

// ── Cash Journal (Мөнгөн хөрөнгийн журнал) ──────────────────

router.get("/cash-journal", auth, async (req, res) => {
  const { from, to, txn_type } = req.query;
  let sql = `SELECT cj.*, u.full_name created_name
    FROM cash_journal cj LEFT JOIN users u ON u.id=cj.created_by WHERE 1=1`;
  const params = [];
  if (from)     { sql += " AND cj.txn_date >= ?"; params.push(from); }
  if (to)       { sql += " AND cj.txn_date <= ?"; params.push(to); }
  if (txn_type) { sql += " AND cj.txn_type = ?";  params.push(txn_type); }
  sql += " ORDER BY cj.txn_date DESC, cj.id DESC";
  try { res.json(await all(sql, params)); } catch (e) { res.json([]); }
});

router.post("/cash-journal", auth, requirePermission("finance_write"), async (req, res) => {
  const b = req.body; b.counterparty = b.counterparty || "";
  if (!b.txn_date || !b.txn_type || !b.description || !b.amount)
    return res.status(400).json({ error: "Шаардлагатай талбарууд дутуу байна" });
  try {
    const r = await run(
      `INSERT INTO cash_journal(txn_date,doc_no,txn_type,description,counterparty,register_no,
         corr_account,cash_flow_type,excess,purpose,source_fund,econ_category,transferor,receiver,
         debit_account,credit_account,amount,currency,exchange_rate,cashier,note,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.txn_date, b.doc_no||"", b.txn_type, b.description, b.counterparty||"",
       b.register_no||"", b.corr_account||"", b.cash_flow_type||"", b.excess||"",
       b.purpose||"", b.source_fund||"", b.econ_category||"", b.transferor||"", b.receiver||"",
       b.debit_account||"", b.credit_account||"", Number(b.amount||0),
       b.currency||"MNT", Number(b.exchange_rate||1), b.cashier||"",
       b.note||"", req.user.id]);
    await audit(req.user.id, "CREATE", "cash_journal", r.id,
      `${b.txn_type}: ${b.description} ${b.amount}₮`);
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/cash-journal/:id", auth, requirePermission("finance_write"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE cash_journal SET txn_date=?,doc_no=?,txn_type=?,description=?,counterparty=?,
     register_no=?,corr_account=?,cash_flow_type=?,excess=?,purpose=?,source_fund=?,
     econ_category=?,transferor=?,receiver=?,
     debit_account=?,credit_account=?,amount=?,currency=?,exchange_rate=?,
     cashier=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.txn_date, b.doc_no||"", b.txn_type, b.description, b.counterparty||"",
     b.register_no||"", b.corr_account||"", b.cash_flow_type||"", b.excess||"",
     b.purpose||"", b.source_fund||"", b.econ_category||"", b.transferor||"", b.receiver||"",
     b.debit_account||"", b.credit_account||"", Number(b.amount||0),
     b.currency||"MNT", Number(b.exchange_rate||1), b.cashier||"",
     b.note||"", req.params.id]);
  await audit(req.user.id, "UPDATE", "cash_journal", req.params.id, b.description);
  res.json({ ok: true });
});

router.delete("/cash-journal/:id", auth, requireRole("director"), async (req, res) => {
  await run("DELETE FROM cash_journal WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "cash_journal", req.params.id, "");
  res.json({ ok: true });
});

router.delete("/cash-journal-all", auth, requireRole("director"), async (req, res) => {
  const r = await run("DELETE FROM cash_journal");
  await audit(req.user.id, "DELETE", "cash_journal", 0, `Бүх бичилт устгасан: ${r.changes} мөр`);
  res.json({ deleted: r.changes });
});

router.delete("/cash-journal-range", auth, requireRole("director"), async (req, res) => {
  const { from, to } = req.query;
  let sql = "DELETE FROM cash_journal WHERE 1=1";
  const params = [];
  if (from) { sql += " AND txn_date >= ?"; params.push(from); }
  if (to)   { sql += " AND txn_date <= ?"; params.push(to); }
  const r = await run(sql, params);
  await audit(req.user.id, "DELETE", "cash_journal", 0, `Устгасан мөр: ${r.changes}`);
  res.json({ deleted: r.changes });
});

// ── Accounts Payable (Өглөг) ─────────────────────────────────

router.get("/payables", auth, async (req, res) => {
  try {
    res.json(await all(
      `SELECT ap.*, u.full_name created_name FROM accounts_payable ap
       LEFT JOIN users u ON u.id=ap.created_by
       ORDER BY ap.due_date ASC, ap.id DESC`));
  } catch (e) { res.json([]); }
});

router.post("/payables", auth, requirePermission("finance_write"), async (req, res) => {
  const b = req.body;
  try {
    const r = await run(
      `INSERT INTO accounts_payable(vendor_name,invoice_no,invoice_date,due_date,amount,paid_amount,status,description,category,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [b.vendor_name, b.invoice_no||"", b.invoice_date, b.due_date||"",
       Number(b.amount||0), Number(b.paid_amount||0),
       b.status||"Төлөгдөөгүй", b.description||"", b.category||"", req.user.id]);
    await audit(req.user.id, "CREATE", "accounts_payable", r.id,
      `${b.vendor_name}: ${b.amount}₮`);
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/payables/:id", auth, requirePermission("finance_write"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE accounts_payable SET vendor_name=?,invoice_no=?,invoice_date=?,due_date=?,
     amount=?,paid_amount=?,status=?,description=?,category=?,
     updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.vendor_name, b.invoice_no||"", b.invoice_date, b.due_date||"",
     Number(b.amount||0), Number(b.paid_amount||0),
     b.status||"Төлөгдөөгүй", b.description||"", b.category||"", req.params.id]);
  await audit(req.user.id, "UPDATE", "accounts_payable", req.params.id, b.vendor_name);
  res.json({ ok: true });
});

router.delete("/payables/:id", auth, requireRole("director"), async (req, res) => {
  await run("DELETE FROM accounts_payable WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "accounts_payable", req.params.id, "");
  res.json({ ok: true });
});

// ── Accounts Receivable (Авлага) ─────────────────────────────

router.get("/receivables", auth, async (req, res) => {
  try {
    res.json(await all(
      `SELECT ar.*, u.full_name created_name FROM accounts_receivable ar
       LEFT JOIN users u ON u.id=ar.created_by
       ORDER BY ar.due_date ASC, ar.id DESC`));
  } catch (e) { res.json([]); }
});

router.post("/receivables", auth, requirePermission("finance_write"), async (req, res) => {
  const b = req.body;
  try {
    const r = await run(
      `INSERT INTO accounts_receivable(debtor_name,invoice_no,invoice_date,due_date,amount,received_amount,status,description,category,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [b.debtor_name, b.invoice_no||"", b.invoice_date, b.due_date||"",
       Number(b.amount||0), Number(b.received_amount||0),
       b.status||"Хүлээгдэж буй", b.description||"", b.category||"", req.user.id]);
    await audit(req.user.id, "CREATE", "accounts_receivable", r.id,
      `${b.debtor_name}: ${b.amount}₮`);
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/receivables/:id", auth, requirePermission("finance_write"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE accounts_receivable SET debtor_name=?,invoice_no=?,invoice_date=?,due_date=?,
     amount=?,received_amount=?,status=?,description=?,category=?,
     updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.debtor_name, b.invoice_no||"", b.invoice_date, b.due_date||"",
     Number(b.amount||0), Number(b.received_amount||0),
     b.status||"Хүлээгдэж буй", b.description||"", b.category||"", req.params.id]);
  await audit(req.user.id, "UPDATE", "accounts_receivable", req.params.id, b.debtor_name);
  res.json({ ok: true });
});

router.delete("/receivables/:id", auth, requireRole("director"), async (req, res) => {
  await run("DELETE FROM accounts_receivable WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "accounts_receivable", req.params.id, "");
  res.json({ ok: true });
});

// ── Payroll Timesheet (Цалингийн тооцоо) ─────────────────────

router.get("/payroll", auth, async (req, res) => {
  const { year, month } = req.query;
  let sql = `SELECT pt.*, u.full_name, u.position, u.department, u.salary base_salary_profile
    FROM payroll_timesheet pt LEFT JOIN users u ON u.id=pt.user_id WHERE 1=1`;
  const params = [];
  if (year)  { sql += " AND pt.year=?";  params.push(Number(year)); }
  if (month) { sql += " AND pt.month=?"; params.push(Number(month)); }
  sql += " ORDER BY u.full_name";
  try { res.json(await all(sql, params)); } catch (e) { res.json([]); }
});

router.post("/payroll", auth, requirePermission("payroll_write"), async (req, res) => {
  const b = req.body;
  try {
    const existing = await get(
      "SELECT id FROM payroll_timesheet WHERE user_id=? AND year=? AND month=?",
      [b.user_id, Number(b.year), Number(b.month)]);
    if (existing) {
      await run(
        `UPDATE payroll_timesheet SET work_days=?,overtime_hours=?,absent_days=?,late_times=?,
         base_salary=?,overtime_pay=?,deductions=?,bonuses=?,net_salary=?,note=?,status=?,
         updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [b.work_days||0, b.overtime_hours||0, b.absent_days||0, b.late_times||0,
         b.base_salary||0, b.overtime_pay||0, b.deductions||0, b.bonuses||0,
         b.net_salary||0, b.note||"", b.status||"Тооцсон", existing.id]);
      await audit(req.user.id, "UPDATE", "payroll_timesheet", existing.id,
        `${b.year}/${b.month} - ${b.net_salary}₮`);
      return res.json({ id: existing.id });
    }
    const r = await run(
      `INSERT INTO payroll_timesheet(user_id,year,month,work_days,overtime_hours,absent_days,late_times,base_salary,overtime_pay,deductions,bonuses,net_salary,note,status,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.user_id, Number(b.year), Number(b.month),
       b.work_days||0, b.overtime_hours||0, b.absent_days||0, b.late_times||0,
       b.base_salary||0, b.overtime_pay||0, b.deductions||0, b.bonuses||0,
       b.net_salary||0, b.note||"", b.status||"Тооцсон", req.user.id]);
    await audit(req.user.id, "CREATE", "payroll_timesheet", r.id,
      `${b.year}/${b.month} - ${b.net_salary}₮`);
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/payroll/:id", auth, requirePermission("finance_write"), async (req, res) => {
  await run("DELETE FROM payroll_timesheet WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "payroll_timesheet", req.params.id, "");
  res.json({ ok: true });
});

// ── Fixed Assets Ledger (Үндсэн хөрөнгийн нягтлан бүртгэл) ──

router.get("/fixed-ledger", auth, async (req, res) => {
  try {
    res.json(await all(
      `SELECT fl.*, a.name asset_name, a.asset_code, a.category, a.purchase_price,
              a.installed_date, a.useful_life_years
       FROM fixed_assets_ledger fl LEFT JOIN assets a ON a.id=fl.asset_id
       ORDER BY fl.id DESC`));
  } catch (e) { res.json([]); }
});

router.post("/fixed-ledger", auth, requirePermission("finance_write"), async (req, res) => {
  const b = req.body;
  try {
    const r = await run(
      `INSERT INTO fixed_assets_ledger(asset_id,account_code,asset_code_manual,asset_name_manual,unit,unit_value,initial_qty,acquisition_date,initial_value,useful_life_months,depreciation_method,accumulated_depreciation,book_value,last_depreciation_date,note,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.asset_id||null, b.account_code||"", b.asset_code_manual||"",
       b.asset_name_manual||"", b.unit||"ш",
       Number(b.unit_value||0), Number(b.initial_qty||0),
       b.acquisition_date, Number(b.initial_value||0), Number(b.useful_life_months||120),
       b.depreciation_method||"Шулуун шугам",
       Number(b.accumulated_depreciation||0),
       Number(b.book_value||b.initial_value||0),
       b.last_depreciation_date||b.acquisition_date||"",
       b.note||"", req.user.id]);
    await audit(req.user.id, "CREATE", "fixed_assets_ledger", r.id,
      `${b.acquisition_date}: ${b.initial_value}₮`);
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/fixed-ledger/:id", auth, requirePermission("finance_write"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE fixed_assets_ledger SET asset_id=?,account_code=?,asset_code_manual=?,
     asset_name_manual=?,unit=?,unit_value=?,initial_qty=?,acquisition_date=?,
     initial_value=?,useful_life_months=?,depreciation_method=?,
     accumulated_depreciation=?,book_value=?,last_depreciation_date=?,note=?,
     updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.asset_id||null, b.account_code||"", b.asset_code_manual||"",
     b.asset_name_manual||"", b.unit||"ш",
     Number(b.unit_value||0), Number(b.initial_qty||0),
     b.acquisition_date, Number(b.initial_value||0), Number(b.useful_life_months||120),
     b.depreciation_method||"Шулуун шугам",
     Number(b.accumulated_depreciation||0), Number(b.book_value||0),
     b.last_depreciation_date||"", b.note||"", req.params.id]);
  await audit(req.user.id, "UPDATE", "fixed_assets_ledger", req.params.id, "");
  res.json({ ok: true });
});

router.delete("/fixed-ledger/:id", auth, requireRole("director"), async (req, res) => {
  await run("DELETE FROM fixed_assets_ledger WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "fixed_assets_ledger", req.params.id, "");
  res.json({ ok: true });
});

router.delete("/fixed-ledger-all", auth, requireRole("director"), async (req, res) => {
  const r = await get("SELECT COUNT(*) as cnt FROM fixed_assets_ledger");
  await run("DELETE FROM fixed_assets_ledger");
  await audit(req.user.id, "DELETE", "fixed_assets_ledger", 0, `Бүх бичилт устгагдлаа: ${r.cnt}`);
  res.json({ deleted: r.cnt });
});

// ── Finance Summary for Dashboard ────────────────────────────

router.get("/finance-summary", auth, async (req, res) => {
  try {
    const [cashIn, cashOut, payables, receivables, payroll] = await Promise.all([
      get(`SELECT COALESCE(SUM(amount),0) as total FROM cash_journal WHERE txn_type='Орлого'`),
      get(`SELECT COALESCE(SUM(amount),0) as total FROM cash_journal WHERE txn_type='Зарлага'`),
      get(`SELECT COALESCE(SUM(amount-paid_amount),0) as total FROM accounts_payable WHERE status != 'Төлөгдсөн'`),
      get(`SELECT COALESCE(SUM(amount-received_amount),0) as total FROM accounts_receivable WHERE status != 'Хүлээн авсан'`),
      get(`SELECT COALESCE(SUM(net_salary),0) as total FROM payroll_timesheet
          WHERE year=CAST(strftime('%Y',CURRENT_DATE) AS INTEGER)
            AND month=CAST(strftime('%m',CURRENT_DATE) AS INTEGER)`)
    ]);
    res.json({
      cash_in:          cashIn.total,
      cash_out:         cashOut.total,
      cash_balance:     cashIn.total - cashOut.total,
      total_payable:    payables.total,
      total_receivable: receivables.total,
      current_payroll:  payroll.total
    });
  } catch (e) { res.json({ cash_in:0, cash_out:0, cash_balance:0, total_payable:0, total_receivable:0, current_payroll:0 }); }
});

// ── Excel Import (parse uploaded file) ───────────────────────

router.post("/finance-import/parse", auth, requirePermission("finance_write"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл оруулаагүй байна" });
  try {
    let xlsx;
    try { xlsx = require("xlsx"); } catch (e) {
      return res.status(500).json({ error: "xlsx сан суулгаагүй байна" });
    }
    const wb = xlsx.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const headers = rows[0] || [];
    const data = rows.slice(1, 201);
    res.json({ headers, data, total: data.length });
  } catch (e) { res.status(500).json({ error: "Excel файл уншихад алдаа гарлаа: " + e.message }); }
});

// Convert Excel date serial to ISO string
function excelDateToISO(val) {
  const n = Number(val);
  if (!isNaN(n) && n > 1000) {
    const d = new Date(Math.round((n - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  return String(val || "").slice(0, 10);
}

router.post("/finance-import/commit", auth, requirePermission("finance_write"), async (req, res) => {
  const { table: tbl, mapping, rows } = req.body;
  if (!["cash_journal","accounts_payable","accounts_receivable"].includes(tbl))
    return res.status(400).json({ error: "Зөвшөөрөгдөөгүй хүснэгт" });
  let inserted = 0, errors = [];
  for (const row of rows) {
    const record = {};
    for (const [field, colIdx] of Object.entries(mapping)) {
      record[field] = row[colIdx] ?? "";
    }
    record.created_by = req.user.id;
    try {
      if (tbl === "cash_journal") {
        const txnDate = excelDateToISO(record.txn_date);
        const orlogo  = Number(record.orlogo_amount  || 0);
        const zarlaga = Number(record.zarlaga_amount || 0);
        // Skip rows where both amounts are 0
        if (orlogo === 0 && zarlaga === 0 && !record.description) continue;
        const txnType = zarlaga > 0 && orlogo === 0 ? "Зарлага" : "Орлого";
        const amount  = txnType === "Зарлага" ? zarlaga : orlogo;
        await run(
          `INSERT INTO cash_journal(txn_date,doc_no,txn_type,description,counterparty,amount,note,created_by)
           VALUES(?,?,?,?,?,?,?,?)`,
          [txnDate, record.doc_no||"", txnType,
           record.description||"", record.counterparty||"",
           amount, record.note||"", req.user.id]);
      } else if (tbl === "accounts_payable") {
        await run(
          `INSERT INTO accounts_payable(vendor_name,invoice_no,invoice_date,due_date,amount,status,description,created_by)
           VALUES(?,?,?,?,?,?,?,?)`,
          [record.vendor_name||"", record.invoice_no||"", record.invoice_date||"",
           record.due_date||"", Number(record.amount||0),
           record.status||"Төлөгдөөгүй", record.description||"", req.user.id]);
      } else if (tbl === "accounts_receivable") {
        await run(
          `INSERT INTO accounts_receivable(debtor_name,invoice_no,invoice_date,due_date,amount,status,description,created_by)
           VALUES(?,?,?,?,?,?,?,?)`,
          [record.debtor_name||"", record.invoice_no||"", record.invoice_date||"",
           record.due_date||"", Number(record.amount||0),
           record.status||"Хүлээгдэж буй", record.description||"", req.user.id]);
      }
      inserted++;
    } catch (e) { errors.push(e.message); }
  }
  await audit(req.user.id, "IMPORT", tbl, 0, `${inserted} мөр оруулав`);
  res.json({ inserted, errors });
});

module.exports = router;
