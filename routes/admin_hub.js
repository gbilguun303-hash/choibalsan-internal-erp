const express = require("express");
const fs = require("fs");
const path = require("path");
const { run, all, get, auth, audit, upload } = require("../db");
const { requireRole, requirePermission } = require("../middleware/roles");

const router = express.Router();

// ── Work categories (Ажлын категориуд) ──────────────────────────

router.get("/work-categories", auth, async (req, res) => {
  try {
    const cats = await all("SELECT * FROM work_categories WHERE is_active=1 ORDER BY sort_order, id");
    res.json(cats);
  } catch(e) { res.json([]); }
});

router.post("/work-categories", auth, requirePermission("engineering"), async (req, res) => {
  const { name, icon, color, department, sort_order } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Нэр оруулна уу" });
  try {
    const r = await run(
      "INSERT INTO work_categories (name,icon,color,department,sort_order) VALUES (?,?,?,?,?)",
      [name.trim(), icon||"📋", color||"#2563eb", department||"", Number(sort_order)||99]
    );
    await audit(req.user.id, "CREATE", "work_categories", r.id, name.trim());
    res.json({ id: r.id });
  } catch(e) {
    res.status(400).json({ error: "Нэр давхцаж байна" });
  }
});

router.put("/work-categories/:id", auth, requirePermission("engineering"), async (req, res) => {
  const { name, icon, color, department, sort_order, is_active } = req.body;
  try {
    await run(
      "UPDATE work_categories SET name=?,icon=?,color=?,department=?,sort_order=?,is_active=? WHERE id=?",
      [name||"", icon||"📋", color||"#2563eb", department||"",
       Number(sort_order)||99, is_active!==undefined?Number(is_active):1, req.params.id]
    );
    await audit(req.user.id, "UPDATE", "work_categories", req.params.id, name||"");
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

router.delete("/work-categories/:id", auth, requireRole("director"), async (req, res) => {
  await run("UPDATE work_categories SET is_active=0 WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "work_categories", req.params.id, "");
  res.json({ ok: true });
});

// ── Dashboard / Smart alerts ─────────────────────────────────

router.get("/admin-hub/dashboard", auth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const in30  = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const in7   = new Date(Date.now() +  7 * 864e5).toISOString().slice(0, 10);
  const ago7  = new Date(Date.now() -  7 * 864e5).toISOString().slice(0, 10);
  try {
    const [expiringContracts, dueDocs, recentLeave, archiveNeeded, openSafety, newCorr] = await Promise.all([
      all(`SELECT id, full_name, contract_type, contract_end, position, department,
                  CAST(julianday(contract_end) - julianday('now') AS INTEGER) days_left
           FROM users WHERE active=1 AND contract_end IS NOT NULL
             AND contract_end >= ? AND contract_end <= ? ORDER BY contract_end`,
          [today, in30]),
      all(`SELECT id, doc_no, doc_date, subject, due_date, status, source_org,
                  CAST(julianday(due_date) - julianday('now') AS INTEGER) days_left
           FROM correspondence WHERE status NOT IN ('Хаасан','Биелсэн')
             AND due_date IS NOT NULL AND due_date != '' AND due_date <= ? ORDER BY due_date`,
          [in7]),
      all(`SELECT h.*, u.full_name employee_name FROM hr_records h
           LEFT JOIN users u ON u.id = h.user_id
           WHERE h.record_type IN ('Чөлөө','Өвчтэй','Ээлжийн амралт','Сургалт','Томилолт')
             AND h.created_at >= ? ORDER BY h.created_at DESC LIMIT 8`,
          [ago7]),
      get(`SELECT COUNT(*) cnt FROM archive_docs WHERE status='Шилжүүлэх'`),
      all(`SELECT id, title, risk_level, report_date, location FROM safety_reports
           WHERE status='Нээлттэй'
             AND date(report_date) <= date('now','-14 days') ORDER BY report_date LIMIT 6`),
      get(`SELECT COUNT(*) cnt FROM correspondence WHERE status='Шинэ'
             AND doc_date >= date('now','-3 days')`)
    ]);
    res.json({ expiringContracts, dueDocs, recentLeave,
               archiveNeeded: archiveNeeded?.cnt || 0,
               openSafety, newCorrCount: newCorr?.cnt || 0 });
  } catch (e) {
    res.json({ expiringContracts:[], dueDocs:[], recentLeave:[], archiveNeeded:0, openSafety:[], newCorrCount:0 });
  }
});

// ── Correspondence update / delete ───────────────────────────

router.put("/correspondence/:id", auth, requirePermission("admin_hr"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE correspondence SET doc_type=?,doc_no=?,doc_date=?,source_org=?,subject=?,
     assigned_to=?,due_date=?,status=?,decision=? WHERE id=?`,
    [b.doc_type||"Ирсэн", b.doc_no||"", b.doc_date||"", b.source_org||"",
     b.subject||"", b.assigned_to||null, b.due_date||null,
     b.status||"Шинэ", b.decision||"", req.params.id]);
  await audit(req.user.id, "UPDATE", "correspondence", req.params.id, b.subject||"");
  res.json({ ok: true });
});

router.delete("/correspondence/:id", auth, requirePermission("hr_write"), async (req, res) => {
  await run("DELETE FROM correspondence WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "correspondence", req.params.id, "");
  res.json({ ok: true });
});

// ── Orders / Decisions (Тушаал / Шийдвэр) ────────────────────

router.get("/admin-hub/orders", auth, async (req, res) => {
  try {
    res.json(await all(
      `SELECT o.*, u.full_name created_name, r.full_name related_name
       FROM orders_decisions o
       LEFT JOIN users u ON u.id = o.created_by
       LEFT JOIN users r ON r.id = o.related_user
       ORDER BY o.doc_date DESC, o.id DESC`));
  } catch (e) { res.json([]); }
});

router.post("/admin-hub/orders", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  if (!b.title || !b.doc_date) return res.status(400).json({ error: "Шаардлагатай талбар дутуу" });
  try {
    const r = await run(
      `INSERT INTO orders_decisions(doc_no,title,doc_type,doc_date,description,status,related_user,created_by)
       VALUES(?,?,?,?,?,?,?,?)`,
      [b.doc_no||"", b.title, b.doc_type||"Тушаал", b.doc_date,
       b.description||"", b.status||"Хүчинтэй", b.related_user||null, req.user.id]);
    await audit(req.user.id, "CREATE", "orders_decisions", r.id, `${b.doc_type||"Тушаал"}: ${b.title}`);
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/admin-hub/orders/:id", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE orders_decisions SET doc_no=?,title=?,doc_type=?,doc_date=?,description=?,
     status=?,related_user=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.doc_no||"", b.title, b.doc_type||"Тушаал", b.doc_date,
     b.description||"", b.status||"Хүчинтэй", b.related_user||null, req.params.id]);
  await audit(req.user.id, "UPDATE", "orders_decisions", req.params.id, b.title);
  res.json({ ok: true });
});

router.delete("/admin-hub/orders/:id", auth, requirePermission("hr_write"), async (req, res) => {
  await run("DELETE FROM orders_decisions WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "orders_decisions", req.params.id, "");
  res.json({ ok: true });
});

// ── Archive documents ────────────────────────────────────────

router.get("/admin-hub/archive", auth, async (req, res) => {
  const { category, status, q } = req.query;
  let sql = `SELECT a.*, u.full_name created_name FROM archive_docs a
    LEFT JOIN users u ON u.id = a.created_by WHERE 1=1`;
  const params = [];
  if (category) { sql += " AND a.category=?"; params.push(category); }
  if (status)   { sql += " AND a.status=?";   params.push(status); }
  if (q)        { sql += " AND (a.title LIKE ? OR a.doc_no LIKE ? OR a.description LIKE ?)"; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  sql += " ORDER BY a.date_archived DESC, a.id DESC";
  try { res.json(await all(sql, params)); } catch (e) { res.json([]); }
});

router.post("/admin-hub/archive", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  if (!b.title || !b.date_archived) return res.status(400).json({ error: "Шаардлагатай талбар дутуу" });
  try {
    const r = await run(
      `INSERT INTO archive_docs(title,category,doc_no,doc_date,date_archived,box_no,shelf_no,retention_years,status,description,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [b.title, b.category||"Бусад", b.doc_no||"", b.doc_date||"",
       b.date_archived, b.box_no||"", b.shelf_no||"",
       Number(b.retention_years||10), b.status||"Идэвхтэй",
       b.description||"", req.user.id]);
    await audit(req.user.id, "CREATE", "archive_docs", r.id, b.title);
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/admin-hub/archive/:id", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE archive_docs SET title=?,category=?,doc_no=?,doc_date=?,date_archived=?,
     box_no=?,shelf_no=?,retention_years=?,status=?,description=?,
     updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.title, b.category||"Бусад", b.doc_no||"", b.doc_date||"",
     b.date_archived, b.box_no||"", b.shelf_no||"",
     Number(b.retention_years||10), b.status||"Идэвхтэй",
     b.description||"", req.params.id]);
  await audit(req.user.id, "UPDATE", "archive_docs", req.params.id, b.title);
  res.json({ ok: true });
});

router.delete("/admin-hub/archive/:id", auth, requireRole("director"), async (req, res) => {
  await run("DELETE FROM archive_docs WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "archive_docs", req.params.id, "");
  res.json({ ok: true });
});

// ── Байгуулллагын тохиргоо ──────────────────────────────────

router.get("/org-settings", auth, async (req, res) => {
  const rows = await all(`SELECT key, value FROM org_settings`);
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

router.put("/org-settings", auth, requirePermission("hr_write"), async (req, res) => {
  const allowed = ["org_name","director","address","phone","register","email","notice"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      await run(`INSERT INTO org_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        [key, req.body[key] || ""]);
    }
  }
  await audit(req.user.id, "UPDATE", "org_settings", 0, "org info updated");
  res.json({ ok: true });
});

// ── Байгуулллагын гэрээ (org contracts) ─────────────────────

router.get("/org-contracts", auth, async (req, res) => {
  const { type } = req.query;
  let sql = `SELECT c.*, u.full_name created_name FROM org_contracts c
    LEFT JOIN users u ON u.id = c.created_by WHERE 1=1`;
  const params = [];
  if (type) { sql += " AND c.contract_type=?"; params.push(type); }
  sql += " ORDER BY c.created_at DESC, c.id DESC";
  try { res.json(await all(sql, params)); } catch (e) { res.json([]); }
});

router.post("/org-contracts", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  if (!b.title) return res.status(400).json({ error: "Гэрээний нэр оруулна уу" });
  try {
    const r = await run(
      `INSERT INTO org_contracts(contract_no,title,contract_type,counterparty,start_date,end_date,amount,status,description,
       register_no,phone,email,signed_date,responsible_person,details,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.contract_no||"", b.title, b.contract_type||"Бусад", b.counterparty||"",
       b.start_date||"", b.end_date||"", Number(b.amount||0),
       b.status||"Хүчинтэй", b.description||"",
       b.register_no||"", b.phone||"", b.email||"",
       b.signed_date||"", b.responsible_person||"", b.details||"{}", req.user.id]);
    await audit(req.user.id, "CREATE", "org_contracts", r.id, `${b.contract_type}: ${b.title}`);
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/org-contracts/:id", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE org_contracts SET contract_no=?,title=?,contract_type=?,counterparty=?,
     start_date=?,end_date=?,amount=?,status=?,description=?,
     register_no=?,phone=?,email=?,signed_date=?,responsible_person=?,details=?,
     updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.contract_no||"", b.title, b.contract_type||"Бусад", b.counterparty||"",
     b.start_date||"", b.end_date||"", Number(b.amount||0),
     b.status||"Хүчинтэй", b.description||"",
     b.register_no||"", b.phone||"", b.email||"",
     b.signed_date||"", b.responsible_person||"", b.details||"{}",
     req.params.id]);
  await audit(req.user.id, "UPDATE", "org_contracts", req.params.id, b.title);
  res.json({ ok: true });
});

router.delete("/org-contracts/:id", auth, requirePermission("hr_write"), async (req, res) => {
  await run("DELETE FROM org_contracts WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "org_contracts", req.params.id, "");
  res.json({ ok: true });
});

// Deprecated: see docs/deprecated-endpoints.md
router.post("/org-contracts/:id/scan", auth, requirePermission("hr_write"), upload.single("scan"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл олдсонгүй" });
  const url = "/uploads/" + req.file.filename;
  await run("UPDATE org_contracts SET scan_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    [url, req.params.id]);
  await audit(req.user.id, "UPDATE", "org_contracts", req.params.id, "scan uploaded");
  res.json({ url });
});

// ── Contract scans (multiple) ─────────────────────────────────
router.get("/org-contracts/:id/scans", auth, async (req, res) => {
  const rows = await all("SELECT * FROM contract_scans WHERE contract_id=? ORDER BY id ASC", [req.params.id]);
  res.json(rows);
});

router.post("/org-contracts/:id/scans", auth, requirePermission("hr_write"), upload.single("scan"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл олдсонгүй" });
  const url = "/uploads/" + req.file.filename;
  const r = await run(
    "INSERT INTO contract_scans(contract_id,url,filename,uploaded_by) VALUES(?,?,?,?)",
    [req.params.id, url, req.file.originalname, req.user.id]
  );
  await audit(req.user.id, "CREATE", "contract_scans", r.lastID, "scan uploaded");
  res.json({ id: r.lastID, url, filename: req.file.originalname });
});

router.delete("/org-contracts/:id/scans/:scanId", auth, requirePermission("hr_write"), async (req, res) => {
  await run("DELETE FROM contract_scans WHERE id=? AND contract_id=?", [req.params.scanId, req.params.id]);
  res.json({ ok: true });
});

// ── HR records PUT (leave approve/update) ────────────────────

router.put("/hr-records/:id", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE hr_records SET record_type=?,start_date=?,end_date=?,note=? WHERE id=?`,
    [b.record_type, b.start_date, b.end_date||null, b.note||"", req.params.id]);
  await audit(req.user.id, "UPDATE", "hr_records", req.params.id, b.record_type);
  res.json({ ok: true });
});

router.delete("/hr-records/:id", auth, requirePermission("hr_write"), async (req, res) => {
  await run("DELETE FROM hr_records WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "hr_records", req.params.id, "");
  res.json({ ok: true });
});

// ── Doc Attachments (scan upload for any document type) ───────

router.get("/doc-attachments", auth, async (req, res) => {
  const { entity_type, entity_id } = req.query;
  if (!entity_type || !entity_id)
    return res.status(400).json({ error: "entity_type, entity_id шаардлагатай" });
  const rows = await all(
    `SELECT d.*, u.full_name uploaded_name
     FROM doc_attachments d
     LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.entity_type=? AND d.entity_id=?
     ORDER BY d.uploaded_at ASC`,
    [entity_type, Number(entity_id)]
  );
  res.json(rows);
});

router.post("/doc-attachments/upload", auth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл шаардлагатай" });
  const { entity_type, entity_id, note } = req.body;
  if (!entity_type || !entity_id)
    return res.status(400).json({ error: "entity_type, entity_id шаардлагатай" });
  const file_url  = `/uploads/${req.file.filename}`;
  const file_name = Buffer.from(req.file.originalname, "latin1").toString("utf8");
  const r = await run(
    `INSERT INTO doc_attachments(entity_type,entity_id,file_url,file_name,note,uploaded_by)
     VALUES(?,?,?,?,?,?)`,
    [entity_type, Number(entity_id), file_url, file_name, note||"", req.user.id]
  );
  const row = await get(
    `SELECT d.*, u.full_name uploaded_name FROM doc_attachments d
     LEFT JOIN users u ON u.id=d.uploaded_by WHERE d.id=?`, [r.id]
  );
  res.json(row);
});

router.put("/doc-attachments/:id", auth, async (req, res) => {
  const { note } = req.body;
  await run("UPDATE doc_attachments SET note=? WHERE id=?", [note||"", req.params.id]);
  res.json({ ok: true });
});

router.delete("/doc-attachments/:id", auth, async (req, res) => {
  const row = await get("SELECT * FROM doc_attachments WHERE id=?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Олдсонгүй" });
  if (row.uploaded_by !== req.user.id && !["director","hr"].includes(req.user.role))
    return res.status(403).json({ error: "Эрх хүрэхгүй" });
  try {
    const fp = require("path").join(__dirname, "..", row.file_url);
    require("fs").unlink(fp, () => {});
  } catch(_) {}
  await run("DELETE FROM doc_attachments WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

// ── Asset categories (Хөрөнгийн ангилал) ─────────────────────

router.get("/asset-categories", auth, async (req, res) => {
  try {
    res.json(await all("SELECT * FROM asset_categories WHERE is_active=1 ORDER BY sort_order, id"));
  } catch(e) { res.json([]); }
});

router.post("/asset-categories", auth, requirePermission("engineering"), async (req, res) => {
  const { name, icon, color, bg, border, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: "Нэр оруулна уу" });
  try {
    const r = await run(
      `INSERT INTO asset_categories(name,icon,color,bg,border,sort_order) VALUES(?,?,?,?,?,?)`,
      [name, icon||"📦", color||"#94a3b8", bg||"#f8fafc", border||"#e2e8f0", sort_order||99]);
    res.json({ id: r.id });
  } catch(e) {
    res.status(400).json({ error: "Нэр давхцаж байна" });
  }
});

router.put("/asset-categories/:id", auth, requirePermission("engineering"), async (req, res) => {
  const { name, icon, color, bg, border, sort_order, is_active } = req.body;
  try {
    await run(`UPDATE asset_categories SET name=?,icon=?,color=?,bg=?,border=?,sort_order=?,is_active=? WHERE id=?`,
      [name, icon||"📦", color||"#94a3b8", bg||"#f8fafc", border||"#e2e8f0",
       sort_order||99, is_active??1, req.params.id]);
    res.json({ ok: true });
  } catch(e) {
    res.status(400).json({ error: "Нэр давхцаж байна" });
  }
});

router.delete("/asset-categories/:id", auth, requireRole("director"), async (req, res) => {
  await run("UPDATE asset_categories SET is_active=0 WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
