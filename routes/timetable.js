const express = require("express");
const fs = require("fs");
const path = require("path");
const { run, all, get, auth, upload, UPLOAD_DIR } = require("../db");

const router = express.Router();

// ── Feed list ──────────────────────────────────────────────────
router.get("/daily-feed", auth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const rows = await all(
    `SELECT f.*, u.full_name, u.position, u.department
     FROM daily_feed f
     JOIN users u ON u.id = f.user_id
     WHERE f.feed_date = ?
     ORDER BY f.created_at ASC`,
    [date]
  );
  // Attach reactions for each entry
  for (const row of rows) {
    const rxs = await all(
      `SELECT r.reaction, COUNT(*) cnt, GROUP_CONCAT(u.full_name) names
       FROM daily_feed_reactions r
       JOIN users u ON u.id = r.user_id
       WHERE r.feed_id = ?
       GROUP BY r.reaction`,
      [row.id]
    );
    row.reactions = rxs;
  }
  res.json(rows);
});

// ── Day summary ────────────────────────────────────────────────
router.get("/daily-feed/summary", auth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const total   = await get("SELECT COUNT(*) n FROM daily_feed WHERE feed_date=?", [date]);
  const byStatus = await all(
    `SELECT status, COUNT(*) n FROM daily_feed WHERE feed_date=? AND status!='' GROUP BY status`,
    [date]
  );
  const byCat = await all(
    `SELECT category, COUNT(*) n FROM daily_feed WHERE feed_date=? AND category!='' GROUP BY category ORDER BY n DESC LIMIT 5`,
    [date]
  );
  const shifted = await all(
    `SELECT s.clock_in, s.clock_out, u.full_name
     FROM shift_logs s JOIN users u ON u.id=s.user_id
     WHERE s.shift_date=? ORDER BY s.clock_in`,
    [date]
  );
  res.json({ total: total.n, byStatus, byCat, shifted });
});

// ── Post (text only) ──────────────────────────────────────────
router.post("/daily-feed", auth, async (req, res) => {
  const { content, status, location, category } = req.body;
  if (!content || !content.trim())
    return res.status(400).json({ error: "Агуулга хоосон байна" });
  const date = new Date().toISOString().slice(0, 10);
  const r = await run(
    `INSERT INTO daily_feed (user_id, content, image_url, before_image_url, status, location, category, feed_date)
     VALUES (?,?,?,?,?,?,?,?)`,
    [req.user.id, content.trim(), "", "",
     status || "", location || "", category || "", date]
  );
  const row = await get(
    `SELECT f.*, u.full_name, u.position, u.department
     FROM daily_feed f JOIN users u ON u.id=f.user_id WHERE f.id=?`,
    [r.id]
  );
  row.reactions = [];
  res.json(row);
});

// ── Post with images (after / before+after) ───────────────────
const multiUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "before_image", maxCount: 1 }
]);

router.post("/daily-feed/upload", auth, multiUpload, async (req, res) => {
  const content  = (req.body.content  || "").trim();
  const status   = req.body.status   || "";
  const location = req.body.location || "";
  const category = req.body.category || "";

  const afterFile  = req.files?.image?.[0];
  const beforeFile = req.files?.before_image?.[0];

  if (!content && !afterFile)
    return res.status(400).json({ error: "Агуулга эсвэл зураг шаардлагатай" });

  const image_url        = afterFile  ? `/uploads/${afterFile.filename}`  : "";
  const before_image_url = beforeFile ? `/uploads/${beforeFile.filename}` : "";
  const date = new Date().toISOString().slice(0, 10);

  const r = await run(
    `INSERT INTO daily_feed (user_id, content, image_url, before_image_url, status, location, category, feed_date)
     VALUES (?,?,?,?,?,?,?,?)`,
    [req.user.id, content || "", image_url, before_image_url,
     status, location, category, date]
  );
  const row = await get(
    `SELECT f.*, u.full_name, u.position, u.department
     FROM daily_feed f JOIN users u ON u.id=f.user_id WHERE f.id=?`,
    [r.id]
  );
  row.reactions = [];
  res.json(row);
});

// ── Delete entry ──────────────────────────────────────────────
router.delete("/daily-feed/:id", auth, async (req, res) => {
  const row = await get("SELECT * FROM daily_feed WHERE id=?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Олдсонгүй" });
  if (row.user_id !== req.user.id && req.user.role !== "director")
    return res.status(403).json({ error: "Зөвшөөрөл байхгүй" });
  for (const field of ["image_url", "before_image_url"]) {
    if (row[field]) fs.unlink(path.join(__dirname, "..", row[field]), () => {});
  }
  await run("DELETE FROM daily_feed_reactions WHERE feed_id=?", [req.params.id]);
  await run("DELETE FROM daily_feed WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

// ── Reactions ─────────────────────────────────────────────────
router.post("/daily-feed/:id/react", auth, async (req, res) => {
  const { reaction } = req.body;
  if (!["👍","⚠️","✅"].includes(reaction))
    return res.status(400).json({ error: "Буруу reaction" });
  const existing = await get(
    "SELECT id FROM daily_feed_reactions WHERE feed_id=? AND user_id=? AND reaction=?",
    [req.params.id, req.user.id, reaction]
  );
  if (existing) {
    await run("DELETE FROM daily_feed_reactions WHERE id=?", [existing.id]);
  } else {
    await run(
      "INSERT INTO daily_feed_reactions(feed_id,user_id,reaction) VALUES(?,?,?)",
      [req.params.id, req.user.id, reaction]
    );
  }
  const rxs = await all(
    `SELECT r.reaction, COUNT(*) cnt, GROUP_CONCAT(u.full_name) names
     FROM daily_feed_reactions r JOIN users u ON u.id=r.user_id
     WHERE r.feed_id=? GROUP BY r.reaction`,
    [req.params.id]
  );
  res.json(rxs);
});

// ── Shift: clock in ───────────────────────────────────────────
router.post("/shift-log/clock-in", auth, async (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  const now  = new Date().toISOString();
  const existing = await get(
    "SELECT * FROM shift_logs WHERE user_id=? AND shift_date=?",
    [req.user.id, date]
  );
  if (existing) {
    if (existing.clock_in) return res.json({ already: true, shift: existing });
    await run("UPDATE shift_logs SET clock_in=? WHERE id=?", [now, existing.id]);
  } else {
    await run(
      "INSERT INTO shift_logs(user_id,shift_date,clock_in) VALUES(?,?,?)",
      [req.user.id, date, now]
    );
  }
  const shift = await get(
    "SELECT * FROM shift_logs WHERE user_id=? AND shift_date=?",
    [req.user.id, date]
  );
  res.json({ ok: true, shift });
});

// ── Shift: clock out ──────────────────────────────────────────
router.post("/shift-log/clock-out", auth, async (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  const now  = new Date().toISOString();
  const shift = await get(
    "SELECT * FROM shift_logs WHERE user_id=? AND shift_date=?",
    [req.user.id, date]
  );
  if (!shift || !shift.clock_in)
    return res.status(400).json({ error: "Эхлээд ажил эхэлсэн гэж тэмдэглэнэ үү" });
  if (shift.clock_out)
    return res.json({ already: true, shift });

  // build summary
  const posts = await all(
    "SELECT status, location, category FROM daily_feed WHERE user_id=? AND feed_date=?",
    [req.user.id, date]
  );
  const summary = {
    total_posts: posts.length,
    done: posts.filter(p => p.status === "Дууссан").length,
    in_progress: posts.filter(p => p.status === "Явж байна").length,
    blocked: posts.filter(p => p.status === "Саатсан").length,
    locations: [...new Set(posts.map(p => p.location).filter(Boolean))]
  };
  await run(
    "UPDATE shift_logs SET clock_out=?, summary_json=? WHERE id=?",
    [now, JSON.stringify(summary), shift.id]
  );
  res.json({ ok: true, summary });
});

// ── Shift: get today ──────────────────────────────────────────
router.get("/shift-log/today", auth, async (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  const shift = await get(
    "SELECT * FROM shift_logs WHERE user_id=? AND shift_date=?",
    [req.user.id, date]
  );
  res.json(shift || null);
});

module.exports = router;
