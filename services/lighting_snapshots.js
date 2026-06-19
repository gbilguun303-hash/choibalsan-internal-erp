const { run, all, get } = require("../db");

const LIGHTING_CATEGORIES = ["Авто замын гэрэл", "Гэр хорооллын гэрэл", "Цамхагийн гэрэл", "Гэрлэн дохио"];
const GOOD_SIGNAL_STATUSES = new Set(["Асаалтай", "Идэвхтэй", "Хэвийн"]);

function dayOnly(value) {
  return String(value || new Date().toISOString().slice(0, 10)).slice(0, 10);
}

function availability(total, broken) {
  total = Number(total || 0);
  broken = Number(broken || 0);
  return total > 0 ? Math.max(0, (total - broken) / total * 100) : 100;
}

async function lightingCategoryTotals() {
  const [road, ger, tower, signals] = await Promise.all([
    get(`SELECT COALESCE(SUM(CASE WHEN total_heads > 0 THEN total_heads ELSE lamp_count END),0) total
         FROM sl_points WHERE code LIKE 'ГТ-%'`),
    get(`SELECT COALESCE(SUM(CASE WHEN head_count > 0 THEN head_count ELSE total_count END),0) total
         FROM sl_ger_inventory WHERE category='Гэр хороолол'`),
    get(`SELECT COALESCE(SUM(CASE WHEN head_count > 0 THEN head_count ELSE total_count END),0) total
         FROM sl_ger_inventory WHERE category='Цамхаг'`),
    get(`SELECT COUNT(*) total FROM assets WHERE category='Гэрлэн дохио'`),
  ]);

  return {
    "Авто замын гэрэл": Number(road?.total || 0),
    "Гэр хорооллын гэрэл": Number(ger?.total || 0),
    "Цамхагийн гэрэл": Number(tower?.total || 0),
    "Гэрлэн дохио": Number(signals?.total || 0),
  };
}

async function currentLightingOpenIssues() {
  const rows = await all(
    `SELECT category, COUNT(*) fault_count, COALESCE(SUM(broken_count),0) broken_count
     FROM sl_faults
     WHERE status!='Дууссан'
     GROUP BY category`
  );
  const byCategory = {};
  LIGHTING_CATEGORIES.forEach(category => { byCategory[category] = { fault_count: 0, broken_count: 0 }; });
  rows.forEach(r => {
    byCategory[r.category] = {
      fault_count: Number(r.fault_count || 0),
      broken_count: Number(r.broken_count || 0),
    };
  });

  const traffic = await all(`SELECT status FROM assets WHERE category='Гэрлэн дохио'`);
  const badSignals = traffic.filter(r => !GOOD_SIGNAL_STATUSES.has(r.status || "")).length;
  byCategory["Гэрлэн дохио"] = {
    fault_count: badSignals,
    broken_count: badSignals,
  };
  return byCategory;
}

async function saveLightingDailySnapshot(date = null, source = "auto") {
  const snapshotDate = dayOnly(date);
  const [totals, issues] = await Promise.all([
    lightingCategoryTotals(),
    currentLightingOpenIssues(),
  ]);

  for (const category of LIGHTING_CATEGORIES) {
    const total = Number(totals[category] || 0);
    const broken = Number(issues[category]?.broken_count || 0);
    const faultCount = Number(issues[category]?.fault_count || 0);
    await run(
      `INSERT INTO sl_daily_status(snapshot_date,category,total_count,broken_count,availability_pct,fault_count,source)
       VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(snapshot_date,category) DO UPDATE SET
         total_count=excluded.total_count,
         broken_count=excluded.broken_count,
         availability_pct=excluded.availability_pct,
         fault_count=excluded.fault_count,
         source=excluded.source,
         updated_at=CURRENT_TIMESTAMP`,
      [snapshotDate, category, total, broken, availability(total, broken), faultCount, source]
    );
  }
}

async function listLightingDailySnapshots({ year, category } = {}) {
  let sql = `SELECT * FROM sl_daily_status WHERE 1=1`;
  const params = [];
  if (year) {
    sql += ` AND snapshot_date>=? AND snapshot_date<?`;
    params.push(`${year}-01-01`, `${Number(year) + 1}-01-01`);
  }
  if (category) {
    sql += ` AND category=?`;
    params.push(category);
  }
  sql += ` ORDER BY snapshot_date, category`;
  return all(sql, params);
}

module.exports = {
  LIGHTING_CATEGORIES,
  lightingCategoryTotals,
  saveLightingDailySnapshot,
  listLightingDailySnapshots,
};
