const express = require("express");
const fs = require("fs");
const path = require("path");
const { run, all, get, auth, audit, upload, UPLOAD_DIR } = require("../db");
const { requireRole, requirePermission } = require("../middleware/roles");

const router = express.Router();

function genAssetCode(category) {
  const prefix = {
    "Гэрэлтүүлэг": "LIGHT", "Камер": "CAM", "Шилэн кабель": "FIBER",
    "Шит/Самбар": "PANEL", "Гэрлэн дохио": "TRAF", "Техник": "VEH",
    "Барилга": "BLDG", "Бусад": "ASSET"
  }[category] || "ASSET";
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

// Must be before /assets/:id to avoid "summary" being treated as an id param
router.get("/assets/summary/by-category", auth, async (req, res) => {
  res.json(await all(`SELECT category,
    COUNT(*) total,
    SUM(CASE WHEN status='Идэвхтэй' OR status='Асаалтай' THEN 1 ELSE 0 END) active,
    SUM(CASE WHEN condition='Засвар хэрэгтэй' THEN 1 ELSE 0 END) needs_repair,
    SUM(purchase_price) total_value
    FROM assets GROUP BY category ORDER BY total DESC`));
});

router.get("/assets", auth, async (req, res) => {
  const cat = req.query.category;
  let sql = `SELECT a.*, u.full_name assigned_name,
    (SELECT COUNT(*) FROM asset_files f WHERE f.asset_id=a.id) file_count,
    (SELECT COUNT(*) FROM asset_events w WHERE w.asset_id=a.id) work_count
    FROM assets a LEFT JOIN users u ON u.id=a.assigned_to`;
  const params = [];
  if (cat) { sql += " WHERE a.category=?"; params.push(cat); }
  sql += " ORDER BY a.category, a.name";
  res.json(await all(sql, params));
});

router.get("/assets/:id", auth, async (req, res) => {
  const asset = await get(`SELECT a.*, u.full_name assigned_name
    FROM assets a LEFT JOIN users u ON u.id=a.assigned_to WHERE a.id=?`, [req.params.id]);
  if (!asset) return res.status(404).json({ error: "Хөрөнгө олдсонгүй" });
  const files = await all("SELECT * FROM asset_files WHERE asset_id=? ORDER BY id DESC", [req.params.id]);
  const history = await all(`SELECT w.*, u.full_name created_name
    FROM asset_events w LEFT JOIN users u ON u.id=w.created_by
    WHERE w.asset_id=? ORDER BY w.work_date DESC LIMIT 50`, [req.params.id]);
  res.json({ ...asset, files, history });
});

router.post("/assets", auth, requirePermission("assets_write"), async (req, res) => {
  const b = req.body;
  const code = b.asset_code || genAssetCode(b.category);
  const r = await run(`INSERT INTO assets(asset_code,name,category,sub_category,location,
    gps_lat,gps_lng,status,condition,assigned_to,installed_date,warranty_until,
    purchase_price,current_value,useful_life_years,description,specs,notes,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [code, b.name, b.category, b.sub_category || "", b.location || "",
     b.gps_lat || null, b.gps_lng || null,
     b.status || "Идэвхтэй", b.condition || "Хэвийн",
     b.assigned_to || null, b.installed_date || null, b.warranty_until || null,
     b.purchase_price || 0, b.current_value || 0, b.useful_life_years || 10,
     b.description || "", b.specs || "", b.notes || "", req.user.id]);
  await audit(req.user.id, "CREATE", "assets", r.id, `${b.category}: ${b.name}`);
  res.json({ id: r.id, asset_code: code });
});

router.patch("/assets/:id/status", auth, requirePermission("assets_write"), async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status шаардлагатай" });
  await run("UPDATE assets SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", [status, req.params.id]);
  await audit(req.user.id, "UPDATE", "assets", req.params.id, `Төлөв: ${status}`);
  res.json({ ok: true });
});

router.put("/assets/:id", auth, requirePermission("assets_write"), async (req, res) => {
  const b = req.body;
  await run(`UPDATE assets SET name=?,category=?,sub_category=?,location=?,
    gps_lat=?,gps_lng=?,status=?,condition=?,assigned_to=?,installed_date=?,
    warranty_until=?,purchase_price=?,current_value=?,useful_life_years=?,
    description=?,specs=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.name, b.category, b.sub_category || "", b.location || "",
     b.gps_lat || null, b.gps_lng || null,
     b.status || "Идэвхтэй", b.condition || "Хэвийн",
     b.assigned_to || null, b.installed_date || null, b.warranty_until || null,
     b.purchase_price || 0, b.current_value || 0, b.useful_life_years || 10,
     b.description || "", b.specs || "", b.notes || "", req.params.id]);
  await audit(req.user.id, "UPDATE", "assets", req.params.id, b.name);
  res.json({ ok: true });
});

router.delete("/assets/:id", auth, requirePermission("assets_delete"), async (req, res) => {
  await run("DELETE FROM assets WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "assets", req.params.id, "Хөрөнгө устгагдсан");
  res.json({ ok: true });
});

router.post("/assets/:id/files", auth, requirePermission("assets_write"), upload.single("file"), async (req, res) => {
  const relative = "/uploads/" + req.file.filename;
  const r = await run(
    `INSERT INTO asset_files(asset_id,file_type,file_path,file_name,description,uploaded_by) VALUES(?,?,?,?,?,?)`,
    [req.params.id, req.body.file_type || "photo",
     relative, req.file.originalname, req.body.description || "", req.user.id]);
  await audit(req.user.id, "UPLOAD", "asset_files", r.id, req.file.originalname);
  res.json({ id: r.id, file_path: relative });
});

router.delete("/asset-files/:id", auth, async (req, res) => {
  const f = await get("SELECT * FROM asset_files WHERE id=?", [req.params.id]);
  if (f) {
    fs.unlink(path.join(UPLOAD_DIR, path.basename(f.file_path)), () => {});
    await run("DELETE FROM asset_files WHERE id=?", [req.params.id]);
  }
  res.json({ ok: true });
});

// ── Asset flags (буруу бүртгэл) ──────────────────────────────
router.get("/asset-flags", auth, async (req, res) => {
  const rows = await all(`
    SELECT f.*, u.full_name flagged_by_name, r.full_name resolved_by_name
    FROM asset_flags f
    LEFT JOIN users u ON u.id = f.flagged_by
    LEFT JOIN users r ON r.id = f.resolved_by
    ORDER BY f.flagged_at DESC`);
  res.json(rows);
});

router.post("/asset-flags", auth, async (req, res) => {
  const { table_name, record_id, flag_note } = req.body;
  if (!table_name || !record_id) return res.status(400).json({ error: "Дутуу мэдээлэл" });
  const valid = ["sl_ger_inventory", "sl_points", "assets"];
  if (!valid.includes(table_name)) return res.status(400).json({ error: "Хүснэгт буруу" });
  await run(`INSERT INTO asset_flags(table_name,record_id,flag_note,flagged_by,is_resolved)
    VALUES(?,?,?,?,0)
    ON CONFLICT(table_name,record_id) DO UPDATE SET
      flag_note=excluded.flag_note, flagged_by=excluded.flagged_by,
      flagged_at=CURRENT_TIMESTAMP, is_resolved=0, resolved_by=NULL, resolved_at=NULL`,
    [table_name, record_id, flag_note || "", req.user.id]);
  res.json({ ok: true });
});

router.put("/asset-flags/:id/resolve", auth, async (req, res) => {
  await run(`UPDATE asset_flags SET is_resolved=1, resolved_by=?, resolved_at=CURRENT_TIMESTAMP WHERE id=?`,
    [req.user.id, req.params.id]);
  res.json({ ok: true });
});

router.delete("/asset-flags/:id", auth, async (req, res) => {
  await run("DELETE FROM asset_flags WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
