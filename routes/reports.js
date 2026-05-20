const express = require("express");
const { run, all, get, auth, audit } = require("../db");
const { requirePermission } = require("../middleware/roles");

const router = express.Router();

// GET all schedules
router.get("/report-schedules", auth, async (req, res) => {
  try {
    res.json(await all(
      `SELECT rs.*, u.full_name created_name
       FROM report_schedules rs
       LEFT JOIN users u ON u.id = rs.created_by
       ORDER BY rs.next_due ASC`
    ));
  } catch(e) { res.json([]); }
});

// GET upcoming (due within warn_days of today)
router.get("/report-schedules/upcoming", auth, async (req, res) => {
  try {
    const rows = await all(
      `SELECT * FROM report_schedules
       WHERE is_active = 1
         AND date(next_due) <= date('now', '+' || warn_days || ' days')
       ORDER BY next_due ASC`
    );
    res.json(rows);
  } catch(e) { res.json([]); }
});

// POST create
router.post("/report-schedules", auth, requirePermission("reports_write"), async (req, res) => {
  const b = req.body;
  if (!b.name || !b.frequency || !b.next_due)
    return res.status(400).json({ error: "Шаардлагатай талбар дутуу" });
  try {
    const r = await run(
      `INSERT INTO report_schedules(name,frequency,next_due,responsible,recipient,warn_days,note,created_by)
       VALUES(?,?,?,?,?,?,?,?)`,
      [b.name, b.frequency, b.next_due, b.responsible||"", b.recipient||"",
       Number(b.warn_days||7), b.note||"", req.user.id]
    );
    await audit(req.user.id, "CREATE", "report_schedules", r.id, b.name);
    res.json({ id: r.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT update
router.put("/report-schedules/:id", auth, requirePermission("reports_write"), async (req, res) => {
  const b = req.body;
  try {
    await run(
      `UPDATE report_schedules SET name=?,frequency=?,next_due=?,responsible=?,
       recipient=?,warn_days=?,note=?,is_active=? WHERE id=?`,
      [b.name, b.frequency, b.next_due, b.responsible||"", b.recipient||"",
       Number(b.warn_days||7), b.note||"", b.is_active!==undefined?b.is_active:1, req.params.id]
    );
    await audit(req.user.id, "UPDATE", "report_schedules", req.params.id, b.name);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST mark as sent — advances next_due by frequency
router.post("/report-schedules/:id/mark-sent", auth, async (req, res) => {
  const rec = await get("SELECT * FROM report_schedules WHERE id=?", [req.params.id]);
  if (!rec) return res.status(404).json({ error: "Олдсонгүй" });

  const today = new Date().toISOString().split("T")[0];
  const due = new Date(rec.next_due);
  let isActive = 1;

  switch (rec.frequency) {
    case "Өдөр тутам":   due.setDate(due.getDate() + 1);          break;
    case "7 хоног":      due.setDate(due.getDate() + 7);          break;
    case "Сар тутам":    due.setMonth(due.getMonth() + 1);        break;
    case "Улирал тутам": due.setMonth(due.getMonth() + 3);        break;
    case "Хагас жил":    due.setMonth(due.getMonth() + 6);        break;
    case "Жил тутам":    due.setFullYear(due.getFullYear() + 1);  break;
    case "Нэг удаа":     isActive = 0;                            break;
  }

  const nextDue = due.toISOString().split("T")[0];
  try {
    await run(
      `UPDATE report_schedules SET last_sent=?, next_due=?, is_active=? WHERE id=?`,
      [today, nextDue, isActive, req.params.id]
    );
    await audit(req.user.id, "SENT", "report_schedules", req.params.id, rec.name);
    res.json({ ok: true, next_due: nextDue });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE
router.delete("/report-schedules/:id", auth, requirePermission("reports_write"), async (req, res) => {
  const rec = await get("SELECT name FROM report_schedules WHERE id=?", [req.params.id]);
  if (!rec) return res.status(404).json({ error: "Олдсонгүй" });
  await run("DELETE FROM report_schedules WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "report_schedules", req.params.id, rec.name);
  res.json({ ok: true });
});

module.exports = router;
