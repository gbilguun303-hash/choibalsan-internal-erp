"use strict";
const { all, get } = require("../../db");
const { lightingCategoryTotals } = require("../lighting_snapshots");
const { invalid, noData } = require("./errors");
const {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  boundedInt,
  validateDateRange,
} = require("./validation");

const CATEGORY_DB = {
  road: "Авто замын гэрэл",
  ger_district: "Гэр хорооллын гэрэл",
  tower: "Цамхагийн гэрэл",
  traffic_light: "Гэрлэн дохио",
};
const GER_CATEGORY_DB = { ger_district: "Гэр хороолол", tower: "Цамхаг" };

function availability(total, broken) {
  return total > 0 ? Number((((total - broken) / total) * 100).toFixed(2)) : 100;
}

async function categorySummary(date = null) {
  const requested = validateDateRange(date, date, { fieldFrom: "date", fieldTo: "date" }).from;
  if (requested) {
    const rows = await all(
      `SELECT category,total_count,broken_count,availability_pct,fault_count
       FROM sl_daily_status WHERE snapshot_date=?`,
      [requested]
    );
    if (rows.length) return rows;
  }
  const totals = await lightingCategoryTotals();
  const faults = await all(
    `SELECT category,COUNT(*) fault_count,COALESCE(SUM(broken_count),0) broken_count
     FROM sl_faults WHERE status!='Дууссан' GROUP BY category`
  );
  const faultMap = Object.fromEntries(faults.map(row => [row.category, row]));
  const traffic = await get(
    `SELECT COUNT(*) total_count,
       SUM(CASE WHEN status IN ('Асаалттай','Идэвхтэй','Хэвийн') THEN 0 ELSE 1 END) broken_count
     FROM assets WHERE category='Гэрлэн дохио'`
  );
  return Object.entries(totals).map(([category, total]) => {
    const issue = category === CATEGORY_DB.traffic_light ? traffic : faultMap[category];
    const broken = Number(issue?.broken_count || 0);
    return {
      category,
      total_count: Number(total || 0),
      broken_count: broken,
      fault_count: Number(issue?.fault_count || broken),
      availability_pct: availability(Number(total || 0), broken),
    };
  });
}

function publicDashboardShape(rows, scope) {
  const byName = Object.fromEntries(rows.map(row => [row.category, row]));
  const shape = key => {
    const row = byName[CATEGORY_DB[key]] || {};
    const total = Number(row.total_count || 0);
    const faulty = Number(row.broken_count || 0);
    return {
      total_lights: total,
      active_lights: Math.max(0, total - faulty),
      faulty_lights: faulty,
      fault_records: Number(row.fault_count || 0),
      lighting_rate: Number(row.availability_pct ?? availability(total, faulty)),
    };
  };
  const road = shape("road");
  const ger = shape("ger_district");
  const tower = shape("tower");
  const traffic = shape("traffic_light");
  const selected = scope === "traffic_light" ? [traffic]
    : scope === "camera" ? []
    : scope === "lighting" ? [road, ger, tower]
    : [road, ger, tower, traffic];
  const total = selected.reduce((sum, item) => sum + item.total_lights, 0);
  const faulty = selected.reduce((sum, item) => sum + item.faulty_lights, 0);
  return {
    total_lights: total,
    active_lights: Math.max(0, total - faulty),
    faulty_lights: faulty,
    lighting_rate: availability(total, faulty),
    road_lights: road,
    ger_district_lights: ger,
    tower_lights: tower,
    traffic_lights: traffic,
  };
}

async function getDashboardSummary(input) {
  const scope = input.scope || "all";
  if (!["lighting", "camera", "traffic_light", "all"].includes(scope)) invalid("Invalid scope.");
  const rows = await categorySummary(input.date);
  const result = publicDashboardShape(rows, scope);
  if (scope === "camera") {
    const camera = await get(
      `SELECT COALESCE(SUM(camera_count),0) total,
              COALESCE(SUM(camera_broken_count),0) broken
       FROM assets WHERE category LIKE '%Камер%'`
    );
    result.camera = {
      total: Number(camera?.total || 0),
      active: Math.max(0, Number(camera?.total || 0) - Number(camera?.broken || 0)),
      faulty: Number(camera?.broken || 0),
    };
  }
  return result;
}

async function getLightingSummary(input) {
  const rows = await categorySummary(input.date);
  const category = input.category || "all";
  if (!["road", "ger_district", "tower", "traffic_light", "all"].includes(category)) invalid("Invalid category.");
  const filtered = category === "all" ? rows : rows.filter(row => row.category === CATEGORY_DB[category]);
  if (!filtered.length) noData();
  return {
    date: input.date || new Date().toISOString().slice(0, 10),
    ...publicDashboardShape(filtered, "all"),
    by_category: filtered.map(row => ({
      category: row.category,
      total: Number(row.total_count || 0),
      faulty: Number(row.broken_count || 0),
      fault_records: Number(row.fault_count || 0),
      lighting_rate: Number(row.availability_pct || 0),
    })),
  };
}

async function getLightingObjects(input) {
  const category = input.category || "all";
  if (!["road", "ger_district", "tower", "all"].includes(category)) invalid("Invalid category.");
  const limit = boundedInt(input.limit, DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT, "limit");
  const offset = boundedInt(input.offset, 0, 0, 100000, "offset");
  const search = String(input.search || "").trim().slice(0, 100);
  if (category === "all") {
    const results = await Promise.allSettled(
      ["road", "ger_district", "tower"].map(itemCategory =>
        getLightingObjects({ category: itemCategory, search, limit: MAX_LIST_LIMIT, offset: 0 })
      )
    );
    const data = results
      .filter(result => result.status === "fulfilled")
      .map(result => result.value);
    const combined = data.flatMap(result => result.items)
      .sort((a, b) => b.fault_count - a.fault_count || a.name.localeCompare(b.name));
    const items = combined.slice(offset, offset + limit);
    if (!items.length) noData();
    return { items, total: data.reduce((sum, result) => sum + result.total, 0), limit, offset };
  }
  const items = [];
  let total = 0;

  if (category === "road") {
    const where = search ? "AND (p.code LIKE ? OR p.name LIKE ?)" : "";
    const params = search ? [`%${search}%`, `%${search}%`] : [];
    const count = await get(`SELECT COUNT(*) count FROM sl_points p WHERE p.code LIKE 'ГТ-%' ${where}`, params);
    total += Number(count?.count || 0);
    const rows = await all(
      `SELECT p.code,p.name,p.lamp_count,p.total_heads,p.needs_poles,p.light_type,
        COALESCE((SELECT SUM(f.broken_count) FROM sl_faults f
          WHERE f.status!='Дууссан' AND f.category=? AND
            (f.location_id=p.id OR f.location_name=p.name)),0) fault_count
       FROM sl_points p WHERE p.code LIKE 'ГТ-%' ${where}
       ORDER BY fault_count DESC,p.code LIMIT ? OFFSET ?`,
      [CATEGORY_DB.road, ...params, limit, offset]
    );
    items.push(...rows.map(row => {
      const heads = Number(row.total_heads > 0 ? row.total_heads : row.lamp_count || 0);
      const faults = Number(row.fault_count || 0);
      return {
        code: row.code,
        name: row.name,
        pole_count: Number(row.lamp_count || 0),
        head_count: heads,
        fault_count: faults,
        missing_pole_count: Number(row.needs_poles || 0),
        lighting_rate: availability(heads, faults),
        lamp_type: row.light_type || "",
      };
    }));
  }

  if ((category === "ger_district" || category === "tower") && items.length < limit) {
    const categories = [GER_CATEGORY_DB[category]];
    const placeholders = categories.map(() => "?").join(",");
    const where = search ? "AND g.location_name LIKE ?" : "";
    const params = [...categories, ...(search ? [`%${search}%`] : [])];
    const count = await get(`SELECT COUNT(*) count FROM sl_ger_inventory g WHERE g.category IN (${placeholders}) ${where}`, params);
    total += Number(count?.count || 0);
    const remaining = limit - items.length;
    const rows = await all(
      `SELECT g.id,g.location_name,g.category,g.total_count,g.head_count,g.needs_poles,g.light_type,
        COALESCE((SELECT SUM(f.broken_count) FROM sl_faults f
          WHERE f.status!='Дууссан' AND (f.location_id=g.id OR f.location_name=g.location_name)),0) fault_count
       FROM sl_ger_inventory g WHERE g.category IN (${placeholders}) ${where}
       ORDER BY fault_count DESC,g.location_name LIMIT ? OFFSET ?`,
      [...params, remaining, offset]
    );
    items.push(...rows.map(row => {
      const heads = Number(row.head_count > 0 ? row.head_count : row.total_count || 0);
      const faults = Number(row.fault_count || 0);
      return {
        code: `${row.category === GER_CATEGORY_DB.tower ? "TOWER" : "GER"}-${row.id}`,
        name: row.location_name,
        pole_count: Number(row.total_count || 0),
        head_count: heads,
        fault_count: faults,
        missing_pole_count: Number(row.needs_poles || 0),
        lighting_rate: availability(heads, faults),
        lamp_type: row.light_type || "",
      };
    }));
  }
  if (!items.length) noData();
  return { items, total, limit, offset };
}

async function getFaultSummary(input) {
  const category = input.category || "all";
  const status = input.status || "all";
  const ageBucket = input.age_bucket || "all";
  if (!["road", "ger_district", "tower", "traffic_light", "all"].includes(category)) invalid("Invalid category.");
  if (!["open", "closed", "all"].includes(status)) invalid("Invalid status.");
  if (!["0-3", "4-7", "8-30", "30+", "all"].includes(ageBucket)) invalid("Invalid age_bucket.");
  const where = [], params = [];
  if (category !== "all") { where.push("category=?"); params.push(CATEGORY_DB[category]); }
  if (status === "open") where.push("status!='Дууссан'");
  if (status === "closed") where.push("status='Дууссан'");
  const ageSql = {
    "0-3": "julianday('now')-julianday(report_date) BETWEEN 0 AND 3",
    "4-7": "julianday('now')-julianday(report_date) BETWEEN 4 AND 7",
    "8-30": "julianday('now')-julianday(report_date) BETWEEN 8 AND 30",
    "30+": "julianday('now')-julianday(report_date) > 30",
  };
  if (ageBucket !== "all") where.push(ageSql[ageBucket]);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [summary, byCategory, oldest] = await Promise.all([
    get(`SELECT COUNT(*) total_faults,
      SUM(CASE WHEN status!='Дууссан' THEN 1 ELSE 0 END) open_faults,
      SUM(CASE WHEN status='Дууссан' THEN 1 ELSE 0 END) closed_faults
      FROM sl_faults ${clause}`, params),
    all(`SELECT category,COUNT(*) fault_records,COALESCE(SUM(broken_count),0) faulty_heads
      FROM sl_faults ${clause} GROUP BY category ORDER BY faulty_heads DESC`, params),
    all(`SELECT id,category,location_name,broken_count,status,report_date,
      CAST(julianday('now')-julianday(report_date) AS INTEGER) age_days
      FROM sl_faults ${clause} ORDER BY report_date,id LIMIT 10`, params),
  ]);
  let totalFaults = Number(summary?.total_faults || 0);
  let openFaults = Number(summary?.open_faults || 0);
  let closedFaults = Number(summary?.closed_faults || 0);
  if ((category === "traffic_light" || category === "all") && status !== "closed" && ageBucket === "all") {
    const traffic = await all(
      `SELECT id,asset_code,name,status,updated_at
       FROM assets
       WHERE category='Гэрлэн дохио' AND status NOT IN ('Асаалттай','Идэвхтэй','Хэвийн')
       ORDER BY updated_at,id LIMIT 10`
    );
    if (traffic.length) {
      totalFaults += traffic.length;
      openFaults += traffic.length;
      byCategory.push({
        category: CATEGORY_DB.traffic_light,
        fault_records: traffic.length,
        faulty_heads: traffic.length,
      });
      oldest.push(...traffic.map(row => ({
        id: `traffic-${row.id}`,
        category: CATEGORY_DB.traffic_light,
        location_name: row.name || row.asset_code,
        broken_count: 1,
        status: row.status,
        report_date: String(row.updated_at || "").slice(0, 10) || null,
        age_days: null,
      })));
      oldest.sort((a, b) => String(a.report_date || "").localeCompare(String(b.report_date || "")));
      oldest.splice(10);
    }
  }
  return {
    total_faults: totalFaults,
    open_faults: openFaults,
    closed_faults: closedFaults,
    by_category: byCategory,
    oldest_faults: oldest,
  };
}

async function searchWorkOrders(input) {
  const status = input.status || "all";
  const category = input.category || "all";
  if (!["open", "in_progress", "done", "all"].includes(status)) invalid("Invalid status.");
  if (!["lighting", "camera", "traffic_light", "all"].includes(category)) invalid("Invalid category.");
  const limit = boundedInt(input.limit, DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT, "limit");
  const where = [], params = [];
  if (status === "open") where.push("w.status IN ('Хүлээгдэж байгаа','Буцаагдсан')");
  if (status === "in_progress") where.push("w.status IN ('Эхэлсэн','Явцтай','Дууссан гэж илгээсэн','ХАБЭА шалгасан','Инженер баталсан')");
  if (status === "done") where.push("w.status IN ('Дууссан','Хаагдсан')");
  const categorySearch = {
    lighting: "%гэрэл%",
    camera: "%камер%",
    traffic_light: "%дохио%",
  };
  if (category !== "all") {
    where.push("(lower(w.category) LIKE ? OR lower(w.sl_sub_category) LIKE ? OR lower(w.title) LIKE ?)");
    params.push(categorySearch[category], categorySearch[category], categorySearch[category]);
  }
  const { from, to } = validateDateRange(input.date_from, input.date_to, { maxDays: 366 });
  if (from) { where.push("w.work_date>=?"); params.push(from); }
  if (to) { where.push("w.work_date<=?"); params.push(to); }
  const search = String(input.search || "").trim().slice(0, 100);
  if (search) {
    where.push("(w.title LIKE ? OR w.location LIKE ? OR w.description LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = await get(`SELECT COUNT(*) total FROM asset_events w ${clause}`, params);
  const items = await all(
    `SELECT w.id,w.title,w.category,w.sl_sub_category,w.department,w.location,w.status,w.progress,
            w.work_date,w.start_date,w.end_date,w.updated_at
     FROM asset_events w ${clause}
     ORDER BY w.work_date DESC,w.id DESC LIMIT ?`,
    [...params, limit]
  );
  if (!items.length) noData();
  return { items, total: Number(totalRow?.total || 0), limit };
}

async function getInventoryStatus(input) {
  const category = input.category || "all";
  if (!["LED", "cable", "breaker", "meter", "pole", "all"].includes(category)) invalid("Invalid category.");
  const patterns = {
    LED: ["%LED%", "%лед%", "%ЛЕД%"],
    cable: ["%кабель%", "%Кабель%", "%КАБЕЛЬ%"],
    breaker: ["%автомат%", "%Автомат%", "%таслуур%"],
    meter: ["%тоолуур%", "%Тоолуур%"],
    pole: ["%шон%", "%Шон%"],
  };
  const where = [], params = [];
  const limit = boundedInt(input.limit, DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT, "limit");
  const offset = boundedInt(input.offset, 0, 0, 100000, "offset");
  if (category !== "all") {
    const matches = patterns[category];
    where.push(`(${matches.map(() => "(m.name LIKE ? OR m.category_name LIKE ?)").join(" OR ")})`);
    for (const pattern of matches) params.push(pattern, pattern);
  }
  const balanceSql = `(m.opening_qty
    + COALESCE(SUM(CASE WHEN t.txn_type IN ('INCOME','INTERNAL_IN') THEN t.qty ELSE 0 END),0)
    - COALESCE(SUM(CASE WHEN t.txn_type IN ('EXPENSE','INTERNAL_OUT') THEN t.qty ELSE 0 END),0))`;
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  let having = "";
  if (input.low_stock_only === true) having = `HAVING ${balanceSql}<=m.min_qty`;
  const rows = await all(
    `SELECT m.name item_name,m.unit,m.min_qty minimum_quantity,${balanceSql} quantity
     FROM wh_materials m LEFT JOIN wh_transactions t ON t.material_id=m.id
     ${clause} GROUP BY m.id ${having} ORDER BY quantity,m.name LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  if (!rows.length) noData();
  const countRow = await get(
    `SELECT COUNT(*) total FROM (
       SELECT m.id,${balanceSql} quantity
       FROM wh_materials m LEFT JOIN wh_transactions t ON t.material_id=m.id
       ${clause} GROUP BY m.id ${having}
     )`,
    params
  );
  return {
    items: rows.map(row => {
      const quantity = Number(row.quantity || 0);
      const minimum = Number(row.minimum_quantity || 0);
      return {
        item_name: row.item_name,
        unit: row.unit || "",
        quantity,
        minimum_quantity: minimum,
        status: quantity <= 0 ? "empty" : minimum > 0 && quantity <= minimum ? "low" : "ok",
      };
    }),
    total: Number(countRow?.total || 0),
    limit,
    offset,
  };
}

async function getAttendanceSummary(input) {
  const today = new Date().toISOString().slice(0, 10);
  const range = validateDateRange(input.date_from || today, input.date_to || input.date_from || today, { maxDays: 31 });
  const from = range.from;
  const to = range.to;
  const [employees, records] = await Promise.all([
    get("SELECT COUNT(*) count FROM users WHERE active=1 AND can_login=1"),
    all(
      `SELECT record_type,COUNT(*) record_count,COUNT(DISTINCT user_id) employee_count
       FROM hr_records WHERE start_date<=? AND COALESCE(end_date,start_date)>=?
       GROUP BY record_type ORDER BY record_count DESC`,
      [to, from]
    ),
  ]);
  return {
    date_from: from,
    date_to: to,
    active_employee_count: Number(employees?.count || 0),
    by_record_type: records,
    privacy: "Summary only. No employee private fields are included.",
  };
}

function getElectricityCostSummary(input) {
  const power = Number(input.lamp_power_w);
  const count = Number(input.count);
  const hours = Number(input.annual_hours);
  const tariff = input.tariff_mnt_per_kwh == null ? 241 : Number(input.tariff_mnt_per_kwh);
  const vatPercent = input.vat_percent == null ? 10 : Number(input.vat_percent);
  for (const [field, value] of Object.entries({ lamp_power_w: power, count, annual_hours: hours, tariff_mnt_per_kwh: tariff, vat_percent: vatPercent })) {
    if (!Number.isFinite(value) || value < 0) invalid(`${field} must be a non-negative number.`);
  }
  if (count > 1000000 || hours > 8784 || power > 100000) invalid("Electricity calculation input is outside the allowed range.");
  const annualKwh = power * count * hours / 1000;
  const energyCost = annualKwh * tariff;
  const vat = energyCost * vatPercent / 100;
  const total = energyCost + vat;
  return {
    annual_kwh: Number(annualKwh.toFixed(2)),
    energy_cost: Number(energyCost.toFixed(2)),
    vat: Number(vat.toFixed(2)),
    total_without_capacity_charge: Number(total.toFixed(2)),
    monthly_average: Number((total / 12).toFixed(2)),
    capacity_charge_included: false,
    note: input.include_capacity_charge
      ? "Capacity charge was requested but is not calculated because no approved capacity tariff was supplied."
      : "Capacity charge is excluded.",
  };
}

function draftDevRequest(input) {
  const description = String(input.description || "").trim();
  if (description.length < 8 || description.length > 2000) invalid("description must be 8-2000 characters.");
  return {
    draft_only: true,
    title: String(input.title || description.split(/[.!?\n]/)[0]).slice(0, 120),
    module: String(input.module || "unknown").slice(0, 80),
    description,
    next_step: "Review this draft in ERP and submit it through the existing authenticated dev-request form.",
  };
}

module.exports = {
  getDashboardSummary,
  getLightingSummary,
  getLightingObjects,
  getFaultSummary,
  searchWorkOrders,
  getInventoryStatus,
  getAttendanceSummary,
  getElectricityCostSummary,
  draftDevRequest,
};
