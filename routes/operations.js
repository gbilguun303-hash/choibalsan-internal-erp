const express = require("express");
const fs = require("fs");
const path = require("path");
const { run, all, get, auth, audit, upload, UPLOAD_DIR } = require("../db");

const router = express.Router();

function canSeeAll(role) {
  return ["director", "chief_engineer"].includes(role);
}

// ── Asset Events (work-logs) ─────────────────────────────────

router.get("/work-logs", auth, async (req, res) => {
  const where = canSeeAll(req.user.role) ? "" : "WHERE w.created_by=? OR w.assigned_to=?";
  const params = canSeeAll(req.user.role) ? [] : [req.user.id, req.user.id];
  res.json(await all(`SELECT w.*, u.full_name created_name, a.full_name assigned_name,
    c.full_name confirmed_name,
    (SELECT COUNT(*) FROM work_photos p WHERE p.work_log_id=w.id) photo_count
    FROM asset_events w
    LEFT JOIN users u ON u.id=w.created_by
    LEFT JOIN users a ON a.id=w.assigned_to
    LEFT JOIN users c ON c.id=w.confirmed_by
    ${where}
    ORDER BY w.work_date DESC, w.id DESC`, params));
});

router.post("/work-logs", auth, async (req, res) => {
  const b = req.body;
  if (!b.title?.trim()) return res.status(400).json({ error: "Ажлын нэр шаардлагатай" });
  if (!b.work_date)     return res.status(400).json({ error: "Огноо шаардлагатай" });
  const r = await run(
    `INSERT INTO asset_events(title,category,department,location,description,status,progress,
      assigned_to,created_by,work_date,start_date,end_date,start_time,end_time,
      cost_amount,material_note,asset_id,ger_inventory_id,sl_point_id,sl_sub_category)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [b.title.trim(), b.category, b.department || "", b.location || "", b.description || "",
     b.status || "Явцтай", b.progress || 0, b.assigned_to || null, req.user.id,
     b.work_date, b.start_date || b.work_date || null, b.end_date || b.work_date || null,
     b.start_time || null, b.end_time || null, b.cost_amount || 0, b.material_note || "",
     b.asset_id || null, b.ger_inventory_id || null,
     b.sl_point_id || null, b.sl_sub_category || null]);
  await audit(req.user.id, "CREATE", "asset_events", r.id, b.title.trim());
  res.json({ id: r.id });
});

router.put("/work-logs/:id", auth, async (req, res) => {
  const canEdit = ["director", "chief_engineer", "engineer", "camera_engineer"].includes(req.user.role);
  if (!canEdit) return res.status(403).json({ error: "Эрх хүрэхгүй" });
  const b = req.body;
  await run(`UPDATE asset_events SET title=?,category=?,department=?,location=?,description=?,
    status=?,progress=?,assigned_to=?,work_date=?,start_date=?,end_date=?,cost_amount=?,
    material_note=?,asset_id=?,ger_inventory_id=?,sl_point_id=?,sl_sub_category=?,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.title, b.category, b.department || "", b.location || "", b.description || "",
     b.status || "Явцтай", b.progress || 0, b.assigned_to || null,
     b.work_date, b.start_date || null, b.end_date || null,
     b.cost_amount || 0, b.material_note || "", b.asset_id || null,
     b.ger_inventory_id || null, b.sl_point_id || null, b.sl_sub_category || null,
     req.params.id]);
  await audit(req.user.id, "UPDATE", "asset_events", req.params.id, b.title);
  res.json({ ok: true });
});

// Зөвхөн огноо шинэчлэх (Gantt drag)
router.patch("/work-logs/:id/dates", auth, async (req, res) => {
  const canEdit = ["director", "chief_engineer", "engineer", "camera_engineer"].includes(req.user.role);
  if (!canEdit) return res.status(403).json({ error: "Эрх хүрэхгүй" });
  const { start_date, end_date } = req.body;
  await run("UPDATE asset_events SET start_date=?,end_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    [start_date, end_date, req.params.id]);
  res.json({ ok: true });
});

router.patch("/executions/:id/dates", auth, async (req, res) => {
  const canEdit = ["director", "chief_engineer", "engineer", "camera_engineer"].includes(req.user.role);
  if (!canEdit) return res.status(403).json({ error: "Эрх хүрэхгүй" });
  const { start_date, end_date } = req.body;
  await run("UPDATE work_executions SET start_date=?,end_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    [start_date, end_date, req.params.id]);
  res.json({ ok: true });
});

router.delete("/work-logs/:id", auth, async (req, res) => {
  const canDel = ["director", "chief_engineer"].includes(req.user.role);
  if (!canDel) return res.status(403).json({ error: "Устгах эрх хүрэхгүй" });
  await run("DELETE FROM asset_events WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "asset_events", req.params.id, "Ажил устгагдсан");
  res.json({ ok: true });
});

// ── Work completion confirmation ──────────────────────────────

router.post("/work-logs/:id/confirm", auth, upload.single("confirm_image"), async (req, res) => {
  const canConfirm = ["director", "chief_engineer"].includes(req.user.role);
  if (!canConfirm) return res.status(403).json({ error: "Батлах эрх хүрэхгүй" });
  const row = await get("SELECT * FROM asset_events WHERE id=?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Олдсонгүй" });
  if (row.status !== "Дууссан")
    return res.status(400).json({ error: "Зөвхөн 'Дууссан' ажлыг батлах боломжтой" });
  const note      = req.body.confirm_note || "";
  const image_url = req.file ? `/uploads/${req.file.filename}` : "";
  await run(
    `UPDATE asset_events SET confirm_status='confirmed', confirmed_by=?, confirmed_at=CURRENT_TIMESTAMP,
     confirm_note=?, confirm_image_url=?, reject_note='', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [req.user.id, note, image_url, req.params.id]
  );
  await audit(req.user.id, "CONFIRM", "asset_events", req.params.id, `${row.title}${note?" — "+note:""}`);
  const updated = await get(
    `SELECT w.*, u.full_name confirmed_name
     FROM asset_events w LEFT JOIN users u ON u.id=w.confirmed_by WHERE w.id=?`,
    [req.params.id]
  );
  res.json(updated);
});

router.post("/work-logs/:id/reject", auth, async (req, res) => {
  const canConfirm = ["director", "chief_engineer"].includes(req.user.role);
  if (!canConfirm) return res.status(403).json({ error: "Буцаах эрх хүрэхгүй" });
  const { note } = req.body;
  const row = await get("SELECT * FROM asset_events WHERE id=?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Олдсонгүй" });
  await run(
    `UPDATE asset_events SET confirm_status='rejected', confirmed_by=?, confirmed_at=CURRENT_TIMESTAMP,
     reject_note=?, status='Явцтай', progress=90, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [req.user.id, note || "Буцаагдсан", req.params.id]
  );
  await audit(req.user.id, "REJECT", "asset_events", req.params.id, `${row.title} — ${note || ""}`);
  res.json({ ok: true });
});

// ── Work Executions ──────────────────────────────────────────

router.get("/work-logs/:id/executions", auth, async (req, res) => {
  res.json(await all(`
    SELECT e.*, u.full_name created_name,
      (SELECT COUNT(*) FROM execution_photos p WHERE p.execution_id=e.id) photo_count
    FROM work_executions e
    LEFT JOIN users u ON u.id=e.created_by
    WHERE e.work_log_id=?
    ORDER BY e.start_date ASC, e.id ASC`, [req.params.id]));
});

router.post("/work-logs/:id/executions", auth, async (req, res) => {
  const canEdit = ["director", "chief_engineer", "engineer", "camera_engineer"].includes(req.user.role);
  if (!canEdit) return res.status(403).json({ error: "Эрх хүрэхгүй" });
  const b = req.body;
  const r = await run(
    `INSERT INTO work_executions
      (work_log_id,title,start_date,end_date,status,progress,note,workers,safety_note,created_by)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [req.params.id, b.title, b.start_date, b.end_date,
     b.status || "Явцтай", b.progress || 0, b.note || "",
     b.workers || "", b.safety_note || "", req.user.id]);
  await audit(req.user.id, "CREATE", "work_executions", r.id, b.title);
  res.json({ id: r.id });
});

router.get("/my-tasks", auth, async (req, res) => {
  const u = await get("SELECT full_name FROM users WHERE id=?", [req.user.id]);
  if (!u?.full_name) return res.json([]);
  const rows = await all(`
    SELECT e.id, e.title, e.status, e.progress, e.start_date, e.end_date, e.workers,
           w.id work_log_id, w.title work_title, w.category, w.location
    FROM work_executions e
    LEFT JOIN asset_events w ON w.id=e.work_log_id
    WHERE e.workers LIKE ? AND e.status != 'Дууссан'
    ORDER BY e.start_date ASC, e.id ASC`, [`%${u.full_name}%`]);
  res.json(rows);
});

router.get("/executions", auth, async (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  const cat  = req.query.category || null;
  let sql = `SELECT e.*, w.title work_title, w.category, w.location,
    (SELECT COUNT(*) FROM execution_photos p WHERE p.execution_id=e.id) photo_count
    FROM work_executions e
    LEFT JOIN asset_events w ON w.id=e.work_log_id
    WHERE (e.start_date LIKE ? OR e.end_date LIKE ?)`;
  const params = [`${year}%`, `${year}%`];
  if (cat) { sql += " AND w.category=?"; params.push(cat); }
  sql += " ORDER BY e.start_date ASC, e.id ASC";
  res.json(await all(sql, params));
});

router.put("/executions/:id", auth, async (req, res) => {
  const canEdit = ["director", "chief_engineer", "engineer", "camera_engineer"].includes(req.user.role);
  if (!canEdit) return res.status(403).json({ error: "Эрх хүрэхгүй" });
  const b = req.body;
  await run(`UPDATE work_executions SET
    title=?,start_date=?,end_date=?,status=?,progress=?,
    note=?,workers=?,safety_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.title, b.start_date, b.end_date, b.status || "Явцтай",
     b.progress || 0, b.note || "", b.workers || "", b.safety_note || "", req.params.id]);
  await audit(req.user.id, "UPDATE", "work_executions", req.params.id, b.title);
  res.json({ ok: true });
});

router.delete("/executions/:id", auth, async (req, res) => {
  const canDel = ["director", "chief_engineer"].includes(req.user.role);
  if (!canDel) return res.status(403).json({ error: "Устгах эрх хүрэхгүй" });
  await run("DELETE FROM work_executions WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "work_executions", req.params.id, "Гүйцэтгэл устгагдсан");
  res.json({ ok: true });
});

// ── Execution photos ─────────────────────────────────────────

router.get("/executions/:id/photos", auth, async (req, res) => {
  res.json(await all(`SELECT p.*, u.full_name uploaded_name
    FROM execution_photos p LEFT JOIN users u ON u.id=p.uploaded_by
    WHERE execution_id=? ORDER BY id DESC`, [req.params.id]));
});

router.post("/executions/:id/photos", auth, upload.single("photo"), async (req, res) => {
  const ex = await get(
    `SELECT e.*, w.title work_title, w.location
     FROM work_executions e LEFT JOIN asset_events w ON w.id=e.work_log_id WHERE e.id=?`,
    [req.params.id]);
  if (!ex) return res.status(404).json({ error: "Гүйцэтгэл олдсонгүй" });
  const stamp = req.body.stamp_text || `${ex.title} | ${ex.work_title || ""} | ${new Date().toLocaleString("mn-MN")}`;
  const relative = "/uploads/" + req.file.filename;
  const r = await run(
    `INSERT INTO execution_photos(execution_id,file_path,stamp_text,uploaded_by) VALUES(?,?,?,?)`,
    [req.params.id, relative, stamp, req.user.id]);
  await audit(req.user.id, "UPLOAD_PHOTO", "execution_photos", r.id, stamp);
  res.json({ id: r.id, file_path: relative });
});

router.delete("/execution-photos/:id", auth, async (req, res) => {
  const canDel = ["director", "chief_engineer", "engineer", "camera_engineer"].includes(req.user.role);
  if (!canDel) return res.status(403).json({ error: "Эрх хүрэхгүй" });
  const photo = await get("SELECT * FROM execution_photos WHERE id=?", [req.params.id]);
  if (photo) {
    fs.unlink(path.join(UPLOAD_DIR, path.basename(photo.file_path)), () => {});
    await run("DELETE FROM execution_photos WHERE id=?", [req.params.id]);
  }
  res.json({ ok: true });
});

// ── Work-log photos ──────────────────────────────────────────

router.post("/work-logs/:id/photos", auth, upload.single("photo"), async (req, res) => {
  const work = await get("SELECT * FROM asset_events WHERE id=?", [req.params.id]);
  if (!work) return res.status(404).json({ error: "Ажил олдсонгүй" });
  const stamp = req.body.stamp_text || `${work.title} | ${work.location || ""} | ${new Date().toLocaleString("mn-MN")}`;
  const relative = "/uploads/" + req.file.filename;
  const r = await run(
    `INSERT INTO work_photos(work_log_id,file_path,stamp_text,uploaded_by) VALUES(?,?,?,?)`,
    [work.id, relative, stamp, req.user.id]);
  await audit(req.user.id, "UPLOAD_PHOTO", "work_photos", r.id, stamp);
  res.json({ id: r.id, file_path: relative });
});

router.get("/work-logs/:id/photos", auth, async (req, res) => {
  res.json(await all(
    `SELECT p.*, u.full_name uploaded_name FROM work_photos p
     LEFT JOIN users u ON u.id=p.uploaded_by WHERE work_log_id=? ORDER BY id DESC`,
    [req.params.id]));
});


// ── Plans ────────────────────────────────────────────────────

router.post("/plans", auth, async (req, res) => {
  const b = req.body;
  const r = await run(
    `INSERT INTO plans(plan_type,year,month,title,department,budget,status,created_by) VALUES(?,?,?,?,?,?,?,?)`,
    [b.plan_type, b.year, b.month || null, b.title, b.department || "",
     b.budget || 0, b.status || "Төлөвлөсөн", req.user.id]);
  await audit(req.user.id, "CREATE", "plans", r.id, b.title);
  res.json({ id: r.id });
});

router.get("/plans", auth, async (_, res) => {
  res.json(await all(
    `SELECT p.*, u.full_name created_name FROM plans p
     LEFT JOIN users u ON u.id=p.created_by ORDER BY year DESC, month DESC, id DESC`));
});

// ── Correspondence (incoming/outgoing letters) ───────────────

router.post("/correspondence", auth, async (req, res) => {
  const b = req.body;
  const r = await run(
    `INSERT INTO correspondence(doc_type,doc_no,doc_date,source_org,subject,assigned_to,due_date,status,decision,created_by)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [b.doc_type, b.doc_no || "", b.doc_date, b.source_org || "", b.subject,
     b.assigned_to || null, b.due_date || null, b.status || "Шинэ", b.decision || "", req.user.id]);
  await audit(req.user.id, "CREATE", "correspondence", r.id, b.subject);
  res.json({ id: r.id });
});

router.get("/correspondence", auth, async (_, res) => {
  res.json(await all(
    `SELECT d.*, a.full_name assigned_name, c.full_name created_name
     FROM correspondence d
     LEFT JOIN users a ON a.id=d.assigned_to
     LEFT JOIN users c ON c.id=d.created_by
     ORDER BY doc_date DESC, id DESC`));
});

// ── Reports ──────────────────────────────────────────────────

router.get("/reports/summary", auth, async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  const month = req.query.month ? Number(req.query.month) : null;
  const start = month ? `${year}-${String(month).padStart(2, "0")}-01` : `${year}-01-01`;
  const endMonth = month ? month + 1 : 13;
  const endYear = endMonth === 13 ? year + 1 : year;
  const end = month
    ? `${endYear}-${String(endMonth).padStart(2, "0")}-01`
    : `${year + 1}-01-01`;

  const work = await get(
    `SELECT COUNT(*) count, SUM(cost_amount) total_cost, AVG(progress) avg_progress
     FROM asset_events WHERE work_date>=? AND work_date<?`, [start, end]);
  const expenses = await get(
    `SELECT COUNT(*) count, SUM(amount) total FROM expenses WHERE expense_date>=? AND expense_date<?`,
    [start, end]);
  const materials = await all(
    `SELECT item_name, SUM(CASE WHEN move_type='Орлого' THEN qty ELSE -qty END) balance
     FROM material_moves GROUP BY item_name ORDER BY item_name`);
  const byCategory = await all(
    `SELECT category, COUNT(*) count, SUM(cost_amount) cost
     FROM asset_events WHERE work_date>=? AND work_date<? GROUP BY category ORDER BY count DESC`,
    [start, end]);
  const hr = await all(
    `SELECT record_type, COUNT(*) count FROM hr_records
     WHERE start_date>=? AND start_date<? GROUP BY record_type`, [start, end]);
  const docs = await all(
    `SELECT status, COUNT(*) count FROM correspondence
     WHERE doc_date>=? AND doc_date<? GROUP BY status`, [start, end]);
  const safety = await all(
    `SELECT risk_level, COUNT(*) count FROM safety_reports
     WHERE report_date>=? AND report_date<? GROUP BY risk_level`, [start, end]);

  res.json({ period: { year, month }, work, expenses, materials, byCategory, hr, docs, safety });
});

router.get("/reports/annual-plan-suggestion", auth, async (req, res) => {
  const baseYear = Number(req.query.baseYear || new Date().getFullYear());
  const rows = await all(
    `SELECT category, department, COUNT(*) work_count, SUM(cost_amount) total_cost, AVG(cost_amount) avg_cost
     FROM asset_events WHERE work_date>=? AND work_date<? GROUP BY category, department ORDER BY work_count DESC`,
    [`${baseYear}-01-01`, `${baseYear + 1}-01-01`]);
  const suggestions = rows.map(r => ({
    title: `${r.department || "Ерөнхий"} - ${r.category} чиглэлийн давтамжит ажил`,
    reason: `${baseYear} онд ${r.work_count} удаа бүртгэгдсэн.`,
    estimated_budget: Math.round((r.total_cost || 0) * 1.12),
    suggested_frequency: r.work_count > 20 ? "Сар бүр" : r.work_count > 6 ? "Улирал бүр" : "Шаардлагатай үед"
  }));
  res.json({ baseYear, targetYear: baseYear + 1, suggestions });
});

module.exports = router;
