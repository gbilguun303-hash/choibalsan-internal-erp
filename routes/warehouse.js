const express = require("express");
const { run, all, get, auth, audit } = require("../db");
const { requirePermission } = require("../middleware/roles");

const router = express.Router();

// ── Warehouse items (materials) ──────────────────────────────

router.post("/materials", auth, async (req, res) => {
  const b = req.body;
  if (!b.item_name || !b.item_name.trim())
    return res.status(400).json({ error: "Материалын нэр шаардлагатай" });

  const balance = Number(b.balance || 0);
  const price   = Number(b.price   || 0);
  const warnLvl = Number(b.warning_level || 0);
  if (isNaN(balance) || balance < 0) return res.status(400).json({ error: "Үлдэгдэл 0-ээс их байх ёстой" });
  if (isNaN(price)   || price   < 0) return res.status(400).json({ error: "Үнэ 0-ээс их байх ёстой" });

  try {
    const r = await run(
      `INSERT INTO warehouse_items(item_name,unit,balance,warning_level,price,note,created_by) VALUES(?,?,?,?,?,?,?)`,
      [b.item_name.trim(), b.unit || "", balance, warnLvl, price, b.note || "", req.user.id]);
    await audit(req.user.id, "CREATE", "warehouse_items", r.id, b.item_name.trim());
    res.json({ id: r.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/materials", auth, async (_, res) => {
  try {
    res.json(await all("SELECT * FROM warehouse_items ORDER BY item_name"));
  } catch (e) {
    res.json([]);
  }
});

router.delete("/materials/:id", auth, requirePermission("warehouse_delete"), async (req, res) => {
  const rec = await get("SELECT item_name FROM warehouse_items WHERE id=?", [req.params.id]);
  if (!rec) return res.status(404).json({ error: "Олдсонгүй" });
  await run("DELETE FROM warehouse_items WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "warehouse_items", req.params.id, rec.item_name);
  res.json({ ok: true });
});

// ── Expenses ─────────────────────────────────────────────────

router.post("/expenses", auth, async (req, res) => {
  const b = req.body;
  if (!b.expense_date) return res.status(400).json({ error: "Зарлагын огноо шаардлагатай" });
  if (!b.type)         return res.status(400).json({ error: "Зарлагын төрөл шаардлагатай" });
  if (b.amount === undefined || b.amount === null || b.amount === "")
    return res.status(400).json({ error: "Зарлагын дүн шаардлагатай" });
  const amount = Number(b.amount);
  if (isNaN(amount) || amount <= 0)
    return res.status(400).json({ error: "Зарлагын дүн 0-ээс их байх ёстой" });

  const r = await run(
    `INSERT INTO expenses(expense_date,type,amount,related_work_id,note,created_by) VALUES(?,?,?,?,?,?)`,
    [b.expense_date, b.type, amount, b.related_work_id || null, b.note || "", req.user.id]);
  await audit(req.user.id, "CREATE", "expenses", r.id, b.type);
  res.json({ id: r.id });
});

router.get("/expenses", auth, async (_, res) => {
  res.json(await all(
    `SELECT e.*, u.full_name created_name FROM expenses e
     LEFT JOIN users u ON u.id=e.created_by ORDER BY expense_date DESC, id DESC`));
});

module.exports = router;
