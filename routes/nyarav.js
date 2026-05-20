"use strict";
const express = require("express");
const { run, all, get, auth, audit, upload } = require("../db");
const { requireRole, requirePermission } = require("../middleware/roles");
const router  = express.Router();

// ── helpers ──────────────────────────────────────────────────────
async function nextDocNo(prefix) {
  const year = new Date().getFullYear();
  const row  = await get(
    `SELECT COUNT(*) as cnt FROM wh_transactions WHERE txn_no LIKE ?`,
    [`${prefix}-${year}-%`]);
  const seq  = (row?.cnt || 0) + 1;
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

async function computeBalance(material_id) {
  const m = await get("SELECT opening_qty FROM wh_materials WHERE id=?", [material_id]);
  if (!m) return 0;
  const t = await get(
    `SELECT
      COALESCE(SUM(CASE WHEN txn_type IN ('INCOME','INTERNAL_IN')  THEN qty ELSE 0 END),0) as total_in,
      COALESCE(SUM(CASE WHEN txn_type IN ('EXPENSE','INTERNAL_OUT') THEN qty ELSE 0 END),0) as total_out
     FROM wh_transactions WHERE material_id=?`, [material_id]);
  return (m.opening_qty || 0) + (t?.total_in || 0) - (t?.total_out || 0);
}

const BALANCE_SQL = `
  (m.opening_qty
    + COALESCE((SELECT SUM(CASE WHEN txn_type IN ('INCOME','INTERNAL_IN')  THEN qty ELSE 0 END) FROM wh_transactions t WHERE t.material_id=m.id),0)
    - COALESCE((SELECT SUM(CASE WHEN txn_type IN ('EXPENSE','INTERNAL_OUT') THEN qty ELSE 0 END) FROM wh_transactions t WHERE t.material_id=m.id),0)
  ) as current_qty`;

// ── Dashboard summary ────────────────────────────────────────────
router.get("/nyarav/summary", auth, async (req, res) => {
  try {
    const month = new Date().toISOString().slice(0, 7);
    const [totalItems, totalValue, lowStock, recentMoves, monthIncome, monthExpense] = await Promise.all([
      get(`SELECT COUNT(*) as total FROM wh_materials`),
      get(`SELECT COALESCE(SUM(
             (m.opening_qty
               + COALESCE((SELECT SUM(CASE WHEN txn_type IN ('INCOME','INTERNAL_IN')  THEN qty ELSE 0 END) FROM wh_transactions t WHERE t.material_id=m.id),0)
               - COALESCE((SELECT SUM(CASE WHEN txn_type IN ('EXPENSE','INTERNAL_OUT') THEN qty ELSE 0 END) FROM wh_transactions t WHERE t.material_id=m.id),0)
             ) * m.unit_price
           ),0) as total FROM wh_materials m`),
      all(`SELECT m.id, m.name, m.unit, m.unit_price, m.min_qty, ${BALANCE_SQL}
           FROM wh_materials m WHERE current_qty <= m.min_qty AND m.min_qty > 0
           ORDER BY current_qty ASC LIMIT 10`),
      all(`SELECT t.*, m.name material_name, m.unit, u.full_name created_name
           FROM wh_transactions t
           LEFT JOIN wh_materials m ON m.id=t.material_id
           LEFT JOIN users u ON u.id=t.created_by
           ORDER BY t.created_at DESC LIMIT 15`),
      get(`SELECT COALESCE(SUM(amount),0) as total FROM wh_transactions
           WHERE txn_type IN ('INCOME','INTERNAL_IN') AND txn_date LIKE ?`, [month + "%"]),
      get(`SELECT COALESCE(SUM(amount),0) as total FROM wh_transactions
           WHERE txn_type IN ('EXPENSE','INTERNAL_OUT') AND txn_date LIKE ?`, [month + "%"])
    ]);
    res.json({ totalItems, totalValue, lowStock, recentMoves, monthIncome, monthExpense });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Materials catalog ────────────────────────────────────────────
router.get("/nyarav/materials", auth, async (req, res) => {
  try {
    const { q, category } = req.query;
    let sql = `SELECT m.*, ${BALANCE_SQL} FROM wh_materials m WHERE 1=1`;
    const params = [];
    if (q)        { sql += " AND m.name LIKE ?";          params.push(`%${q}%`); }
    if (category) { sql += " AND m.category_code = ?";    params.push(category); }
    sql += " ORDER BY m.category_code, m.name";
    res.json(await all(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/nyarav/materials/:id", auth, async (req, res) => {
  try {
    const m = await get(`SELECT m.*, ${BALANCE_SQL} FROM wh_materials m WHERE m.id=?`, [req.params.id]);
    if (!m) return res.status(404).json({ error: "Олдсонгүй" });
    res.json(m);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/nyarav/materials", auth, requirePermission("warehouse_write"), async (req, res) => {
  const b = req.body;
  if (!b.name) return res.status(400).json({ error: "Нэр заавал шаардлагатай" });
  try {
    const r = await run(
      `INSERT INTO wh_materials(barcode,name,category_code,category_name,unit,unit_price,
         opening_qty,opening_amount,min_qty,custodian,notes,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.barcode || null, b.name.trim(), b.category_code || "", b.category_name || "",
       b.unit || "", Number(b.unit_price || 0), Number(b.opening_qty || 0),
       Number(b.opening_amount || 0), Number(b.min_qty || 0),
       b.custodian || "", b.notes || "", req.user.id]);
    await audit(req.user.id, "CREATE", "wh_materials", r.id, b.name);
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/nyarav/materials/:id", auth, requirePermission("warehouse_write"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE wh_materials SET barcode=?,name=?,category_code=?,category_name=?,unit=?,
       unit_price=?,min_qty=?,custodian=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.barcode || null, b.name, b.category_code || "", b.category_name || "",
     b.unit || "", Number(b.unit_price || 0), Number(b.min_qty || 0),
     b.custodian || "", b.notes || "", req.params.id]);
  await audit(req.user.id, "UPDATE", "wh_materials", req.params.id, b.name);
  res.json({ ok: true });
});

router.delete("/nyarav/materials/all", auth, requireRole("director"), async (req, res) => {
  await run("DELETE FROM wh_transactions");
  await run("DELETE FROM wh_materials");
  await audit(req.user.id, "DELETE_ALL", "wh_materials", 0, "Бүх материал болон гүйлгээ устгагдлаа");
  res.json({ ok: true });
});

router.delete("/nyarav/materials/:id", auth, requirePermission("warehouse_write"), async (req, res) => {
  const rec = await get("SELECT name FROM wh_materials WHERE id=?", [req.params.id]);
  if (!rec) return res.status(404).json({ error: "Олдсонгүй" });
  const txns = await get("SELECT COUNT(*) as cnt FROM wh_transactions WHERE material_id=?", [req.params.id]);
  if (txns.cnt > 0) return res.status(400).json({ error: `"${rec.name}" материалд ${txns.cnt} гүйлгээ байна. Устгах боломжгүй.` });
  await run("DELETE FROM wh_materials WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "wh_materials", req.params.id, rec.name);
  res.json({ ok: true });
});

// ── Income (Орлого) ──────────────────────────────────────────────
router.get("/nyarav/income", auth, async (req, res) => {
  const { from, to, material_id } = req.query;
  let sql = `SELECT t.*, m.name material_name, m.unit, u.full_name created_name
    FROM wh_transactions t
    LEFT JOIN wh_materials m ON m.id=t.material_id
    LEFT JOIN users u ON u.id=t.created_by
    WHERE t.txn_type IN ('INCOME','INTERNAL_IN')`;
  const params = [];
  if (from)        { sql += " AND t.txn_date >= ?"; params.push(from); }
  if (to)          { sql += " AND t.txn_date <= ?"; params.push(to); }
  if (material_id) { sql += " AND t.material_id=?"; params.push(material_id); }
  sql += " ORDER BY t.txn_date DESC, t.id DESC";
  try { res.json(await all(sql, params)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/nyarav/income", auth, requirePermission("warehouse_write"), async (req, res) => {
  const b = req.body;
  if (!b.material_id || !b.qty || !b.txn_date)
    return res.status(400).json({ error: "material_id, qty, txn_date шаардлагатай" });
  try {
    const txn_type = b.txn_type === "INTERNAL_IN" ? "INTERNAL_IN" : "INCOME";
    const docNo    = await nextDocNo("ОР");
    const qty      = Number(b.qty);
    const price    = Number(b.unit_price || 0);
    const r = await run(
      `INSERT INTO wh_transactions(txn_no,txn_date,txn_type,material_id,qty,unit_price,amount,doc_no,supplier,notes,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [docNo, b.txn_date, txn_type, b.material_id, qty, price, qty * price,
       b.doc_no || docNo, b.supplier || "", b.notes || "", req.user.id]);
    await audit(req.user.id, "CREATE", "wh_transactions", r.id, `${txn_type}: mat=${b.material_id} qty=${qty}`);
    res.json({ id: r.id, txn_no: docNo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Expense (Зарлага) ────────────────────────────────────────────
router.get("/nyarav/expense", auth, async (req, res) => {
  const { from, to, material_id, received_by } = req.query;
  let sql = `SELECT t.*, m.name material_name, m.unit, u.full_name created_name
    FROM wh_transactions t
    LEFT JOIN wh_materials m ON m.id=t.material_id
    LEFT JOIN users u ON u.id=t.created_by
    WHERE t.txn_type IN ('EXPENSE','INTERNAL_OUT')`;
  const params = [];
  if (from)        { sql += " AND t.txn_date >= ?"; params.push(from); }
  if (to)          { sql += " AND t.txn_date <= ?"; params.push(to); }
  if (material_id) { sql += " AND t.material_id=?"; params.push(material_id); }
  if (received_by) { sql += " AND t.received_by LIKE ?"; params.push(`%${received_by}%`); }
  sql += " ORDER BY t.txn_date DESC, t.id DESC";
  try { res.json(await all(sql, params)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/nyarav/expense", auth, requirePermission("warehouse_write"), async (req, res) => {
  const b = req.body;
  if (!b.material_id || !b.qty || !b.txn_date)
    return res.status(400).json({ error: "material_id, qty, txn_date шаардлагатай" });
  try {
    const balance = await computeBalance(b.material_id);
    if (Number(b.qty) > balance)
      return res.status(400).json({ error: `Үлдэгдэл хүрэлцэхгүй (үлдэгдэл: ${balance.toFixed(2)})` });

    const txn_type = b.txn_type === "INTERNAL_OUT" ? "INTERNAL_OUT" : "EXPENSE";
    const docNo    = await nextDocNo("ШХ");
    const qty      = Number(b.qty);
    const mat      = await get("SELECT unit_price FROM wh_materials WHERE id=?", [b.material_id]);
    const price    = Number(b.unit_price) || Number(mat?.unit_price || 0);
    const r = await run(
      `INSERT INTO wh_transactions(txn_no,txn_date,txn_type,material_id,qty,unit_price,amount,
         doc_no,received_by,work_ref,asset_ref,notes,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [docNo, b.txn_date, txn_type, b.material_id, qty, price, qty * price,
       b.doc_no || docNo, b.received_by || "", b.work_ref || "", b.asset_ref || "",
       b.notes || "", req.user.id]);
    await audit(req.user.id, "CREATE", "wh_transactions", r.id, `${txn_type}: mat=${b.material_id} qty=${qty}`);
    res.json({ id: r.id, txn_no: docNo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Balance ledger ───────────────────────────────────────────────
router.get("/nyarav/balance", auth, async (req, res) => {
  try {
    const rows = await all(`
      SELECT m.*,
        COALESCE((SELECT SUM(CASE WHEN txn_type IN ('INCOME','INTERNAL_IN')  THEN qty ELSE 0 END) FROM wh_transactions t WHERE t.material_id=m.id),0) as total_income_qty,
        COALESCE((SELECT SUM(CASE WHEN txn_type IN ('INCOME','INTERNAL_IN')  THEN amount ELSE 0 END) FROM wh_transactions t WHERE t.material_id=m.id),0) as total_income_amount,
        COALESCE((SELECT SUM(CASE WHEN txn_type IN ('EXPENSE','INTERNAL_OUT') THEN qty ELSE 0 END) FROM wh_transactions t WHERE t.material_id=m.id),0) as total_expense_qty,
        COALESCE((SELECT SUM(CASE WHEN txn_type IN ('EXPENSE','INTERNAL_OUT') THEN amount ELSE 0 END) FROM wh_transactions t WHERE t.material_id=m.id),0) as total_expense_amount,
        ${BALANCE_SQL}
      FROM wh_materials m ORDER BY m.category_code, m.name`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Monthly journal report (БМ журналын бүтэц) ──────────────────
router.get("/nyarav/report/monthly", auth, async (req, res) => {
  const year  = req.query.year  || new Date().getFullYear();
  const month = req.query.month || (new Date().getMonth() + 1);
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  try {
    const rows = await all(`
      SELECT m.category_code, m.category_name, m.name, m.unit, m.unit_price,
        m.opening_qty, m.opening_qty * m.unit_price as opening_amount,
        COALESCE(SUM(CASE WHEN t.txn_type='INCOME'       AND t.txn_date LIKE ? THEN t.qty ELSE 0 END),0) as income_qty,
        COALESCE(SUM(CASE WHEN t.txn_type='INCOME'       AND t.txn_date LIKE ? THEN t.amount ELSE 0 END),0) as income_amount,
        COALESCE(SUM(CASE WHEN t.txn_type='INTERNAL_IN'  AND t.txn_date LIKE ? THEN t.qty ELSE 0 END),0) as int_in_qty,
        COALESCE(SUM(CASE WHEN t.txn_type='INTERNAL_IN'  AND t.txn_date LIKE ? THEN t.amount ELSE 0 END),0) as int_in_amount,
        COALESCE(SUM(CASE WHEN t.txn_type='EXPENSE'      AND t.txn_date LIKE ? THEN t.qty ELSE 0 END),0) as expense_qty,
        COALESCE(SUM(CASE WHEN t.txn_type='EXPENSE'      AND t.txn_date LIKE ? THEN t.amount ELSE 0 END),0) as expense_amount,
        COALESCE(SUM(CASE WHEN t.txn_type='INTERNAL_OUT' AND t.txn_date LIKE ? THEN t.qty ELSE 0 END),0) as int_out_qty,
        COALESCE(SUM(CASE WHEN t.txn_type='INTERNAL_OUT' AND t.txn_date LIKE ? THEN t.amount ELSE 0 END),0) as int_out_amount
      FROM wh_materials m
      LEFT JOIN wh_transactions t ON t.material_id=m.id
      GROUP BY m.id ORDER BY m.category_code, m.name`,
      Array(8).fill(prefix + "%"));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/nyarav/report/by-worker", auth, async (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT t.received_by, m.name material_name, m.unit,
      SUM(t.qty) as total_qty, SUM(t.amount) as total_amount
    FROM wh_transactions t LEFT JOIN wh_materials m ON m.id=t.material_id
    WHERE t.txn_type IN ('EXPENSE','INTERNAL_OUT') AND t.received_by != ''`;
  const params = [];
  if (from) { sql += " AND t.txn_date >= ?"; params.push(from); }
  if (to)   { sql += " AND t.txn_date <= ?"; params.push(to); }
  sql += " GROUP BY t.received_by, t.material_id ORDER BY t.received_by, m.name";
  try { res.json(await all(sql, params)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/nyarav/report/by-work", auth, async (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT t.work_ref, m.name material_name, m.unit,
      SUM(t.qty) as total_qty, SUM(t.amount) as total_amount
    FROM wh_transactions t LEFT JOIN wh_materials m ON m.id=t.material_id
    WHERE t.txn_type IN ('EXPENSE','INTERNAL_OUT') AND t.work_ref != ''`;
  const params = [];
  if (from) { sql += " AND t.txn_date >= ?"; params.push(from); }
  if (to)   { sql += " AND t.txn_date <= ?"; params.push(to); }
  sql += " GROUP BY t.work_ref, t.material_id ORDER BY t.work_ref, m.name";
  try { res.json(await all(sql, params)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Excel bootstrap (БМ журнал.xlsx import) ──────────────────────
router.post("/nyarav/bootstrap", auth, requirePermission("warehouse_write"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл оруулаагүй" });
  try {
    const xlsx = require("xlsx");
    const wb   = xlsx.readFile(req.file.path);
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });
    let imported = 0, skipped = 0;
    for (const row of rows.slice(5)) {
      const [cat, name, unit, barcode, unit_price, opening_qty, opening_amount] = row;
      if (!name || !String(name).trim()) continue;
      const catStr  = String(cat || "");
      if (catStr.startsWith("Хөтөлсөн") || catStr.startsWith("Шалгасан")) continue;
      const catCode = catStr.match(/^(\d+)/)?.[1] || "";
      const catName = catStr.replace(/^\d+-/, "").trim();
      try {
        await run(
          `INSERT OR IGNORE INTO wh_materials(barcode,name,category_code,category_name,unit,unit_price,opening_qty,opening_amount,created_by)
           VALUES(?,?,?,?,?,?,?,?,?)`,
          [String(barcode || ""), String(name).trim(), catCode, catName, String(unit || ""),
           Number(unit_price || 0), Number(opening_qty || 0), Number(opening_amount || 0), req.user.id]);
        imported++;
      } catch (_) { skipped++; }
    }
    await audit(req.user.id, "IMPORT", "wh_materials", 0, `БМ журнал bootstrap: ${imported} материал`);
    res.json({ imported, skipped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Orders (Захиалга) — uses legacy nyarav_orders table ──────────
router.get("/nyarav/orders", auth, async (req, res) => {
  try {
    res.json(await all(
      `SELECT no.*, u.full_name created_name, a.full_name approved_name
       FROM nyarav_orders no
       LEFT JOIN users u ON u.id=no.created_by
       LEFT JOIN users a ON a.id=no.approved_by
       ORDER BY no.created_at DESC`));
  } catch (_) { res.json([]); }
});

router.post("/nyarav/orders", auth, async (req, res) => {
  const b = req.body;
  if (!b.item_name || !b.qty || !b.order_date)
    return res.status(400).json({ error: "Шаардлагатай талбарууд дутуу байна" });
  try {
    const r = await run(
      `INSERT INTO nyarav_orders(order_date,item_name,qty,unit,estimated_price,purpose,requested_by,status,note,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [b.order_date, b.item_name, Number(b.qty), b.unit || "",
       Number(b.estimated_price || 0), b.purpose || "",
       b.requested_by || "", "Хүлээгдэж буй", b.note || "", req.user.id]);
    await audit(req.user.id, "CREATE", "nyarav_orders", r.id, `${b.item_name} x${b.qty}`);
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/nyarav/orders/:id", auth, requirePermission("warehouse_write"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE nyarav_orders SET status=?,approved_by=?,approval_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.status, req.user.id, b.approval_note || "", req.params.id]);
  await audit(req.user.id, "UPDATE", "nyarav_orders", req.params.id, b.status);
  res.json({ ok: true });
});

// ── Categories list ──────────────────────────────────────────────
router.get("/nyarav/categories", auth, async (req, res) => {
  try {
    res.json(await all(
      `SELECT DISTINCT category_code, category_name FROM wh_materials
       WHERE category_code != '' ORDER BY category_code`));
  } catch (e) { res.json([]); }
});

module.exports = router;
