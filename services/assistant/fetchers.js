"use strict";
const { get, all } = require("../../db");
const { cyrillize } = require("./normalize");

function localDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function parseBillMonth(question) {
  const q = cyrillize(String(question || "").toLowerCase());
  const now = new Date();
  let year = now.getFullYear();
  const yearM = q.match(/(20\d{2})/);
  if (yearM) year = Number(yearM[1]);
  const numM = q.match(/\b(\d{1,2})\s*(?:-?р|r)?\s*сарын/);
  const shortM = q.match(/\b(\d{1,2})\s*(?:-?р|r)?\s*sariinh\b/);
  if (shortM) {
    const month = Number(shortM[1]);
    if (month >= 1 && month <= 12) return { year, month };
  }
  if (numM) {
    const month = Number(numM[1]);
    if (month >= 1 && month <= 12) return { year, month };
  }
  const mn = [
    ["нэгдүгээр",1],["хоёрдугаар",2],["гуравдугаар",3],["дөрөвдүгээр",4],
    ["тавдугаар",5],["зургадугаар",6],["долдугаар",7],["наймдугаар",8],
    ["есдүгээр",9],["аравдугаар",10],["арваннэгдүгээр",11],["арванхоёрдугаар",12],
  ];
  for (const [name, month] of mn) {
    if (q.includes(name)) return { year, month };
  }
  return null;
}

function extractFaultSearchTerm(question) {
  const q = cyrillize(String(question || "").toLowerCase());
  const code = q.match(/гт-\s*\d+/i);
  if (code) return code[0].replace(/\s+/g, "").toUpperCase();
  const known = ["чойбалсан", "мэнэн", "хэрлэн", "ламжав", "шинэ мэнэн", "зүүн чойбалсан"];
  return known.find(k => q.includes(k)) || "";
}

function extractLightLocationTerm(question) {
  let q = cyrillize(String(question || "").toLowerCase())
    .replace(/[?!.,;:()[\]{}'"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const code = q.match(/гт-\s*\d+/i);
  if (code) return code[0].replace(/\s+/g, "").toUpperCase();
  if ((q.includes("бүх") || q.includes("нийт")) && q.includes("гудамж")) return "__ALL_ROAD__";
  const row = q.match(/(\d{1,2})\s*(?:-?\s*р)?\s*эгнээ/);
  const known = ["зүүн чойбалсан", "чойбалсан", "ялалт", "мэнэн", "шинэ мэнэн", "хэрлэн", "ламжав", "төмөр зам"];
  const place = known.find(k => q.includes(k)) || "";
  if (place && row) return `${place} ${row[1]} эгнээ`;
  if (row) return `${row[1]} эгнээ`;
  if (place) return place;
  return q
    .replace(/(надад|өгөөч|өгөө|өг|харуулаач|гудамжийн|гудамж|асалтыг|асалтын|асалт|гэрэлтүүлгийн|гэрэл|хэр|байна|байн|bna|ve|uu|юу|нийт|мэдээлэл|iig|ig|ug)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normLocationText(text) {
  return cyrillize(String(text || "").toLowerCase())
    .replace(/[^\dа-яөүёa-z-]+/gi, " ")
    .replace(/(гийн|ийн|ын|ий|ы|ны|ний)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function periodFromQuestion(question) {
  const q = cyrillize(String(question || "").toLowerCase());
  const today = localDate();
  if (q.includes("өнөөдөр")) return { from: today, to: today, label: "өнөөдөр" };
  if (q.includes("өнгөрсөн 7 хоног") || q.includes("7 хоног")) {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return { from: d.toISOString().slice(0, 10), to: today, label: "өнгөрсөн 7 хоног" };
  }
  return { from: today, to: today, label: "өнөөдөр" };
}

async function fetchAssistantContext() {
  const today = localDate();
  const [faults, traffic, work, lightSchedules] = await Promise.all([
    all("SELECT status, COUNT(*) count, COALESCE(SUM(broken_count),0) broken FROM sl_faults GROUP BY status").catch(() => []),
    all("SELECT status, COUNT(*) count FROM assets WHERE category='Гэрлэн дохио' GROUP BY status").catch(() => []),
    all("SELECT status, COUNT(*) count FROM asset_events GROUP BY status").catch(() => []),
    fetchCurrentLightSchedules(today).catch(() => []),
  ]);
  return { today, faults, traffic, work, lightSchedules };
}

async function fetchCurrentLightSchedules(today) {
  const rows = await all(
    `SELECT category,valid_from,on_time,off_time,is_always_off,notes
     FROM light_schedule_logs WHERE valid_from<=?
     ORDER BY category, valid_from DESC, id DESC`,
    [today]
  );
  const seen = new Set(), current = [];
  for (const r of rows) {
    if (seen.has(r.category)) continue;
    seen.add(r.category);
    current.push(r);
  }
  return current;
}

async function fetchOpenFaults() {
  const [lighting, work] = await Promise.all([
    all(`SELECT status, COUNT(*) count, COALESCE(SUM(broken_count),0) broken_heads
         FROM sl_faults WHERE status IN ('Нээлттэй','Явцтай')
         GROUP BY status`).catch(() => []),
    all(`SELECT status, COUNT(*) count FROM asset_events
         WHERE status NOT IN ('Дууссан','Цуцалсан') GROUP BY status`).catch(() => []),
  ]);
  return { lighting, work };
}

async function fetchOpenLightFaults() {
  const [total, byType] = await Promise.all([
    get(`SELECT COUNT(*) count, COALESCE(SUM(broken_count),0) broken, COALESCE(SUM(fixed_count),0) fixed
         FROM sl_faults WHERE status IN ('Нээлттэй','Явцтай')`).catch(() => ({ count:0, broken:0, fixed:0 })),
    all(`SELECT category, COUNT(*) cnt, COALESCE(SUM(broken_count),0) broken
         FROM sl_faults WHERE status IN ('Нээлттэй','Явцтай')
         GROUP BY category ORDER BY broken DESC`).catch(() => []),
  ]);
  return { total, byType };
}

async function fetchLocationLightFaults(question) {
  const term = extractFaultSearchTerm(question);
  if (!term) return { term: "", rows: [] };
  const like = `%${term}%`;
  const rows = await all(
    `SELECT f.id, f.category, f.location_name, f.total_heads, f.broken_count, f.fixed_count,
            f.status, f.report_date, f.notes, p.code point_code, p.name point_name
     FROM sl_faults f
     LEFT JOIN sl_points p ON p.id=f.location_id
     WHERE (LOWER(f.location_name) LIKE LOWER(?)
        OR LOWER(COALESCE(p.name,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(p.code,'')) LIKE LOWER(?)
        OR CAST(f.location_id AS TEXT) LIKE ?)
       AND f.status IN ('Нээлттэй','Явцтай')
      ORDER BY f.broken_count DESC, f.report_date DESC, f.id DESC
      LIMIT 10`,
    [like, like, like, like]
  ).catch(() => []);
  return { term, rows };
}

async function fetchLightLocationStatus(question) {
  const term = extractLightLocationTerm(question);
  if (!term) return { term: "", point: null, faults: [] };
  if (term === "__ALL_ROAD__") {
    const [points, faults] = await Promise.all([
      all(`SELECT id, code, name, location, meter_no, lamp_count, head_count, total_heads,
                  wattage_per_lamp, light_type, needs_poles, status, notes
           FROM sl_points
           WHERE status='active' AND code LIKE 'ГТ-%'
           ORDER BY code`).catch(() => []),
      all(`SELECT id, category, location_id, location_name, location_type, total_heads,
                  broken_count, fixed_count, status, report_date, notes
           FROM sl_faults
           WHERE status IN ('Нээлттэй','Явцтай')
           ORDER BY report_date DESC, broken_count DESC, id DESC`).catch(() => []),
    ]);
    return { term: "бүх гудамж", point: null, faults, points };
  }
  const parts = normLocationText(term).split(/\s+/).filter(Boolean);
  const rowParts = parts.filter(p => /^\d+$/.test(p));
  const pointParts = parts.filter(p => p !== "эгнээ" && !/^\d+$/.test(p));
  const [points, allFaults] = await Promise.all([
    all(`SELECT id, code, name, location, meter_no, lamp_count, head_count, total_heads,
                wattage_per_lamp, light_type, needs_poles, status, notes
         FROM sl_points`).catch(() => []),
    all(`SELECT id, category, location_id, location_name, location_type, total_heads,
                broken_count, fixed_count, status, report_date, notes
         FROM sl_faults
         WHERE status IN ('Нээлттэй','Явцтай')
         ORDER BY report_date DESC, broken_count DESC, id DESC`).catch(() => []),
  ]);
  const point = points
    .map(p => {
      const text = normLocationText(`${p.code} ${p.name} ${p.location}`);
      const romanText = romanizeName(`${p.code} ${p.name} ${p.location}`).replace(/[^a-z0-9]+/g, " ");
      const nameText = normLocationText(p.name);
      const locText = normLocationText(p.location);
      const exactBonus = pointParts.length && (nameText === pointParts.join(" ") || locText === pointParts.join(" ")) ? 50 : 0;
      const score = pointParts.reduce((s, part) => {
        const latin = romanizeName(part).replace(/[^a-z0-9]/g, "");
        return s +
          (text.includes(part) ? part.length + 5 : 0) +
          (latin && romanText.replace(/\s+/g, "").includes(latin) ? latin.length + 5 : 0);
      }, 0) + exactBonus;
      return { row: p, score };
    })
    .filter(x => x.score > 0 && (!pointParts.length || x.score >= pointParts[0].length + 5))
    .sort((a, b) => b.score - a.score)[0]?.row || null;
  const faults = allFaults.filter(f => {
    const text = normLocationText(f.location_name);
    const romanText = romanizeName(f.location_name).replace(/[^a-z0-9]/g, "");
    const pointIsRoad = String(point?.code || "").startsWith("ГТ-");
    const faultIsRoad = String(f.category || "").includes("Авто зам");
    const pointIdOk = point &&
      f.location_type === "sl_point" &&
      Number(f.location_id || 0) === Number(point.id || 0);
    const placeOk = pointParts.length ? pointParts.every(p => {
      const latin = romanizeName(p).replace(/[^a-z0-9]/g, "");
      return text.includes(p) || (latin && romanText.includes(latin));
    }) : true;
    const rowOk = rowParts.length ? rowParts.every(p => text.includes(p)) && text.includes("эгнээ") : true;
    if (pointIdOk && rowOk) return true;
    if (pointIsRoad && !faultIsRoad) return false;
    if (placeOk && rowOk) return true;
    if (!pointParts.length && rowOk) return true;
    return false;
  }).slice(0, 8);
  return { term, point, faults };
}

async function fetchEmployeeGender(question) {
  const q = cyrillize(String(question || "").toLowerCase());
  const gender = q.includes("эрэгт") ? "Эрэгтэй" : "Эмэгтэй";
  const rows = await all(
    `SELECT full_name, position, department, gender FROM users WHERE active=1 AND gender=? ORDER BY department, full_name`,
    [gender]
  ).catch(() => []);
  return { gender, rows };
}

async function fetchTrafficStatus() {
  const [byStatus, assets, faults, recentLogs] = await Promise.all([
    all(`SELECT status, COUNT(*) count
         FROM assets
         WHERE category='Гэрлэн дохио'
         GROUP BY status`).catch(() => []),
    all(`SELECT id, asset_code, name, location, status, condition, installed_date,
                warranty_until, description, specs, notes
         FROM assets
         WHERE category='Гэрлэн дохио'
         ORDER BY name
         LIMIT 30`).catch(() => []),
    all(`SELECT id, category, location_name, total_heads, broken_count, fixed_count,
                status, report_date, notes
         FROM sl_faults
         WHERE category='Гэрлэн дохио'
           AND status IN ('Нээлттэй','Явцтай')
         ORDER BY report_date DESC, broken_count DESC, id DESC
         LIMIT 20`).catch(() => []),
    all(`SELECT l.id, l.asset_id, l.status, l.started_at, l.ended_at, l.source,
                l.evidence_no, l.notes, a.name asset_name, a.location asset_location
         FROM traffic_signal_status_logs l
         LEFT JOIN assets a ON a.id=l.asset_id
         ORDER BY l.started_at DESC
         LIMIT 10`).catch(() => []),
  ]);
  return { byStatus, assets, faults, recentLogs };
}

async function fetchTrafficSignalLog(question) {
  const q = cyrillize(String(question || "").toLowerCase());
  const dtMatch = q.match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2}(?:\s+\d{1,2}:\d{2})?)/);
  const at = dtMatch ? dtMatch[1].replace(/[./]/g, "-") : null;

  const [recentLogs, assets] = await Promise.all([
    all(`SELECT l.*, a.name asset_name, a.location asset_location, u.full_name recorded_by_name
         FROM traffic_signal_status_logs l
         LEFT JOIN assets a ON a.id=l.asset_id
         LEFT JOIN users u ON u.id=l.recorded_by
         ORDER BY l.started_at DESC LIMIT 8`).catch(() => []),
    all(`SELECT id, name, location FROM assets WHERE category='Гэрлэн дохио' ORDER BY name LIMIT 20`).catch(() => []),
  ]);

  let matchedAt = null;
  if (at) {
    matchedAt = await get(
      `SELECT l.*, a.name asset_name, a.location asset_location, u.full_name recorded_by_name
       FROM traffic_signal_status_logs l
       LEFT JOIN assets a ON a.id=l.asset_id
       LEFT JOIN users u ON u.id=l.recorded_by
       WHERE l.started_at<=? AND (l.ended_at IS NULL OR l.ended_at='' OR l.ended_at>=?)
       ORDER BY l.started_at DESC LIMIT 1`,
      [at, at]
    ).catch(() => null);
  }

  return { at, matchedAt, recentLogs, assets };
}

async function fetchLowStock() {
  return all(`
    SELECT m.name, m.unit, m.min_qty,
      ROUND(
        m.opening_qty
        + COALESCE((SELECT SUM(CASE WHEN txn_type IN ('INCOME','INTERNAL_IN') THEN qty ELSE 0 END)
                    FROM wh_transactions t WHERE t.material_id=m.id),0)
        - COALESCE((SELECT SUM(CASE WHEN txn_type IN ('EXPENSE','INTERNAL_OUT') THEN qty ELSE 0 END)
                    FROM wh_transactions t WHERE t.material_id=m.id),0)
      ,2) AS balance
    FROM wh_materials m
    WHERE m.min_qty > 0
    HAVING balance <= m.min_qty
    ORDER BY (balance - m.min_qty) ASC
    LIMIT 10
  `).catch(() => []);
}

async function fetchMonthlyExpenses() {
  const ym = localDate().slice(0, 7);
  return all(
    `SELECT type, ROUND(SUM(amount),0) total FROM expenses WHERE strftime('%Y-%m',expense_date)=? GROUP BY type ORDER BY total DESC`,
    [ym]
  ).catch(() => []);
}

async function fetchBudgetProgress() {
  const year = localDate().slice(0, 4);
  const [spent, planned] = await Promise.all([
    get(`SELECT COALESCE(SUM(cost_amount),0) total FROM asset_events WHERE strftime('%Y',created_at)=?`, [year]).catch(() => ({ total:0 })),
    get(`SELECT COALESCE(SUM(budget),0) total FROM plans WHERE year=?`, [year]).catch(() => ({ total:0 })),
  ]);
  return { year, spent: Number(spent.total||0), planned: Number(planned.total||0) };
}

async function fetchOpenSafetyReports() {
  return all(
    `SELECT COALESCE(risk_level,'Тодорхойгүй') risk_level, COUNT(*) count
     FROM safety_reports
     WHERE COALESCE(workflow_status,'Шинэ') NOT IN ('Хаасан','Дууссан')
       AND COALESCE(status,'Нээлттэй') NOT IN ('Хаагдсан','Цуцлагдсан')
     GROUP BY COALESCE(risk_level,'Тодорхойгүй') ORDER BY count DESC`
  ).catch(() => []);
}

async function fetchHabeaWorkStatus() {
  const [missing, recent] = await Promise.all([
    all(`SELECT w.title, w.category, w.work_date, w.status,
              pre.full_name pre_by_name, w.habea_pre_status,
              post.full_name post_by_name, w.habea_post_status
         FROM asset_events w
         LEFT JOIN users pre  ON pre.id  = w.habea_pre_by
         LEFT JOIN users post ON post.id = w.habea_post_by
         WHERE w.status NOT IN ('Цуцалсан')
           AND date(COALESCE(w.work_date,w.created_at)) >= date('now','-30 days')
           AND (w.habea_pre_status IS NULL OR w.habea_pre_status=''
             OR w.habea_post_status IS NULL OR w.habea_post_status='')
         ORDER BY COALESCE(w.work_date,w.created_at) DESC LIMIT 10`).catch(() => []),
    all(`SELECT w.title, w.category, w.work_date, w.status,
              w.habea_pre_status, w.habea_pre_at, w.habea_pre_note,
              w.habea_post_status, w.habea_post_at, w.habea_post_note,
              pre.full_name pre_by_name, post.full_name post_by_name
         FROM asset_events w
         LEFT JOIN users pre  ON pre.id  = w.habea_pre_by
         LEFT JOIN users post ON post.id = w.habea_post_by
         WHERE w.habea_pre_status IS NOT NULL AND w.habea_pre_status!=''
         ORDER BY COALESCE(w.work_date,w.created_at) DESC LIMIT 5`).catch(() => []),
  ]);
  return { missing, recent };
}

async function fetchContractExpiry() {
  return all(`
    SELECT title, counterparty, end_date,
      CAST(julianday(end_date) - julianday('now') AS INTEGER) days_left
    FROM org_contracts
    WHERE end_date IS NOT NULL AND end_date != ''
      AND julianday(end_date) >= julianday('now')
      AND julianday(end_date) - julianday('now') <= 60
      AND status='Хүчинтэй'
    ORDER BY end_date ASC LIMIT 5
  `).catch(() => []);
}

async function fetchAssetWarranty() {
  return all(`
    SELECT name, category, warranty_until,
      CAST(julianday(warranty_until) - julianday('now') AS INTEGER) days_left
    FROM assets
    WHERE warranty_until IS NOT NULL AND warranty_until != ''
      AND julianday(warranty_until) >= julianday('now')
      AND julianday(warranty_until) - julianday('now') <= 90
    ORDER BY warranty_until ASC LIMIT 5
  `).catch(() => []);
}

async function fetchTrainingSchedule() {
  return all(`
    SELECT title, type, start_date, end_date, location, status
    FROM trainings
    WHERE (start_date >= date('now') OR status='Явагдаж байна') AND status != 'Цуцалсан'
    ORDER BY start_date ASC LIMIT 5
  `).catch(() => []);
}

async function fetchOverdueWork() {
  const [row, items] = await Promise.all([
    get(`SELECT COUNT(*) count FROM asset_events
         WHERE status NOT IN ('Дууссан','Цуцалсан')
           AND end_date IS NOT NULL AND end_date!=''
           AND end_date < date('now')`).catch(() => ({ count:0 })),
    all(`SELECT title, category, end_date, status,
          CAST(julianday('now') - julianday(end_date) AS INTEGER) days_over
         FROM asset_events
         WHERE status NOT IN ('Дууссан','Цуцалсан')
           AND end_date IS NOT NULL AND end_date!=''
           AND end_date < date('now')
         ORDER BY end_date ASC LIMIT 5`).catch(() => []),
  ]);
  return { count: Number(row.count||0), items };
}

async function fetchEmployeeCount() {
  const [total, byStatus, byDept] = await Promise.all([
    get("SELECT COUNT(*) count FROM users WHERE active=1").catch(() => ({ count:0 })),
    all(`SELECT COALESCE(status_hr,'Идэвхтэй') status, COUNT(*) count
         FROM users WHERE active=1 GROUP BY COALESCE(status_hr,'Идэвхтэй')`).catch(() => []),
    all(`SELECT COALESCE(department,'Бусад') department, COUNT(*) count
         FROM users WHERE active=1
         GROUP BY COALESCE(department,'Бусад') ORDER BY count DESC LIMIT 6`).catch(() => []),
  ]);
  return { total: Number(total.count||0), byStatus, byDept };
}

async function fetchEmployeeByRole(question) {
  const q = cyrillize(question.toLowerCase());
  const isCamera = q.includes("камер");
  const roleMap = [
    { keywords: ["хүний нөөц","hr менежер","hr ажилтан"], roles: ["hr"] },
    { keywords: ["камерын инженер","камер инженер","камер"], roles: ["camera_engineer"] },
    { keywords: ["цахилгааны инженер"], roles: ["engineer","chief_engineer"] },
    { keywords: ["цахилгааны инженер","инженер"], roles: ["engineer","chief_engineer"] },
    { keywords: ["цахилгаанчин"],                 roles: ["electric"] },
    { keywords: ["нягтлан"],                      roles: ["accountant"] },
    { keywords: ["нярав"],                        roles: ["storekeeper"] },
    { keywords: ["хабэа","аюулгүй"],              roles: ["safety"] },
    { keywords: ["захирал"],                      roles: ["director"] },
    { keywords: ["ажилчид","бүх ажилтан","нэрсийг","нэрс"],
                                                  roles: ["director","chief_engineer","engineer","electric","safety","storekeeper","hr","accountant","camera_engineer","worker"] },
    { keywords: ["ажилтан"],                      roles: ["engineer","electric","safety","storekeeper","hr","accountant","camera_engineer","worker"] },
  ];
  let roles = [];
  for (const { keywords, roles: r } of roleMap) {
    if (keywords.some(k => q.includes(k))) { roles = r; break; }
  }
  if (!roles.length) return [];
  if (isCamera) {
    return all(
      `SELECT full_name, position, department, role, phone FROM users
       WHERE active=1 AND (role='camera_engineer' OR LOWER(position) LIKE '%камер%' OR LOWER(department) LIKE '%камер%')
       ORDER BY CASE WHEN role='camera_engineer' THEN 0 ELSE 1 END, full_name`
    ).catch(() => []);
  }
  const ph = roles.map(() => "?").join(",");
  const rows = await all(
    `SELECT full_name, position, department, role, phone FROM users WHERE active=1 AND role IN (${ph}) ORDER BY full_name`,
    roles
  ).catch(() => []);
  const nameHit = rows.filter(r => {
    const parts = String(r.full_name || "").toLowerCase().split(/\s+/).filter(Boolean);
    return parts.some(p => p.length >= 3 && q.includes(p));
  });
  return nameHit.length ? nameHit : rows;
}

async function fetchEmployeeSalaryLookup(question, user = {}) {
  const canSeeSalary = ["director", "hr"].includes(user.role);
  if (!canSeeSalary) return { canSeeSalary, rows: [], target: "" };

  const q = cyrillize(String(question || "").toLowerCase());
  const roleMap = [
    { target: "хүний нөөцийн ажилтан", keywords: ["хүний нөөц", "hr"], roles: ["hr"] },
    { target: "цахилгааны инженер", keywords: ["цахилгааны инженер", "инженер"], roles: ["engineer", "chief_engineer"] },
    { target: "нягтлан", keywords: ["нягтлан"], roles: ["accountant"] },
    { target: "нярав", keywords: ["нярав"], roles: ["storekeeper"] },
    { target: "хабэа ажилтан", keywords: ["хабэа", "аюулгүй"], roles: ["safety"] },
    { target: "камерын ажилтан", keywords: ["камер"], roles: ["camera_engineer"] },
  ];

  for (const item of roleMap) {
    if (!item.keywords.some(k => q.includes(k))) continue;
    const ph = item.roles.map(() => "?").join(",");
    const rows = await all(
      `SELECT full_name, position, department, salary, skill_allowance, tenure_allowance, meal_allowance
       FROM users WHERE active=1 AND role IN (${ph}) ORDER BY full_name`,
      item.roles
    ).catch(() => []);
    return { canSeeSalary, rows, target: item.target };
  }

  const users = await all(
    `SELECT full_name, position, department, salary, skill_allowance, tenure_allowance, meal_allowance
     FROM users WHERE active=1 ORDER BY full_name`
  ).catch(() => []);
  const rows = users.filter(r => {
    const parts = String(r.full_name || "").toLowerCase().split(/\s+/).filter(p => p.length >= 3);
    return parts.some(p => q.includes(p));
  });
  return { canSeeSalary, rows, target: rows[0]?.full_name || "" };
}

async function fetchMyPhone(userId) {
  return get(
    `SELECT full_name, position, department, phone FROM users WHERE id=?`,
    [userId]
  ).catch(() => null);
}

async function fetchElectricityBill(question) {
  const target = parseBillMonth(question);
  if (target) {
    const bill = await get(
      `SELECT * FROM electricity_bill_imports
       WHERE billing_year=? AND billing_month=?
       ORDER BY CASE status WHEN 'confirmed' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, id DESC LIMIT 1`,
      [target.year, target.month]
    ).catch(() => null);
    return { target, bill, latest: false };
  }
  const bill = await get(
    `SELECT * FROM electricity_bill_imports ORDER BY billing_year DESC, billing_month DESC, id DESC LIMIT 1`
  ).catch(() => null);
  return { target: bill ? { year: bill.billing_year, month: bill.billing_month } : null, bill, latest: true };
}

async function resolveActivityUsers(question, convHistory = []) {
  const { lastEmployeeNameFromHistory } = require("./intent");
  const q = cyrillize(String(question || "").toLowerCase());
  let rows = [];
  if (q.includes("хүний нөөц")) rows = await fetchEmployeeByRole("хүний нөөц нэр");
  else if (q.includes("хабэа")) rows = await fetchEmployeeByRole("хабэа нэр");
  else if (q.includes("камер")) rows = await fetchEmployeeByRole("камерын инженер нэр");
  else if (q.includes("билгүүн")) rows = await all(`SELECT full_name, position, department, role, phone, id FROM users WHERE active=1 AND LOWER(full_name) LIKE '%билгүүн%'`).catch(() => []);
  else {
    const name = lastEmployeeNameFromHistory(convHistory);
    if (name) rows = await all(`SELECT full_name, position, department, role, phone, id FROM users WHERE active=1 AND LOWER(full_name) LIKE LOWER(?)`, [`%${name}%`]).catch(() => []);
  }
  if (rows.length && rows[0].id) return rows;
  if (!rows.length) return [];
  const names = rows.map(r => r.full_name).filter(Boolean);
  if (!names.length) return [];
  const ph = names.map(() => "?").join(",");
  return all(`SELECT id, full_name, position, department, role, phone FROM users WHERE full_name IN (${ph})`, names).catch(() => []);
}

async function fetchWorkActivity(question, convHistory = []) {
  const period = periodFromQuestion(question);
  const users = await resolveActivityUsers(question, convHistory);
  if (!users.length) return { period, users: [], works: [], audits: [] };
  const ids = users.map(u => u.id).filter(Boolean);
  const ph = ids.map(() => "?").join(",");
  const params = [period.from, period.to, ...ids, ...ids, ...ids, ...ids, ...ids];
  const works = await all(
    `SELECT w.title, w.category, w.department, w.status, w.progress, w.work_date, w.created_at,
            c.full_name created_name, a.full_name assigned_name
     FROM asset_events w
     LEFT JOIN users c ON c.id=w.created_by
     LEFT JOIN users a ON a.id=w.assigned_to
     WHERE date(COALESCE(w.work_date,w.created_at)) BETWEEN ? AND ?
       AND (w.created_by IN (${ph}) OR w.assigned_to IN (${ph}) OR w.confirmed_by IN (${ph})
         OR w.habea_pre_by IN (${ph}) OR w.habea_post_by IN (${ph}))
     ORDER BY COALESCE(w.work_date,w.created_at) DESC, w.id DESC LIMIT 12`,
    params
  ).catch(() => []);
  const auditParams = [period.from, period.to, ...ids];
  const audits = await all(
    `SELECT action, entity, entity_id, detail, created_at
     FROM audit_logs
     WHERE date(created_at) BETWEEN ? AND ? AND user_id IN (${ph})
     ORDER BY created_at DESC LIMIT 12`,
    auditParams
  ).catch(() => []);
  return { period, users, works, audits };
}

async function fetchMyWork(user) {
  const rows = await all(
    `SELECT w.title, w.category, w.department, w.status, w.progress, w.work_date,
            w.start_date, w.end_date, w.created_at,
            c.full_name created_name, a.full_name assigned_name
     FROM asset_events w
     LEFT JOIN users c ON c.id=w.created_by
     LEFT JOIN users a ON a.id=w.assigned_to
     WHERE w.created_by=? OR w.assigned_to=? OR w.confirmed_by=?
        OR w.habea_pre_by=? OR w.habea_post_by=?
     ORDER BY CASE WHEN COALESCE(w.status,'') IN ('Хаагдсан','Дууссан','Цуцалсан') THEN 1 ELSE 0 END,
              COALESCE(w.work_date,w.start_date,w.created_at) DESC, w.id DESC LIMIT 12`,
    [user.id, user.id, user.id, user.id, user.id]
  ).catch(() => []);
  return { user, rows };
}

async function fetchTodayAttendance(today) {
  const [activeRow, rows] = await Promise.all([
    get("SELECT COUNT(*) count FROM users WHERE active=1 AND COALESCE(status_hr,'Идэвхтэй')='Идэвхтэй'").catch(() => ({ count:0 })),
    all(`SELECT record_type, COUNT(DISTINCT user_id) count FROM hr_records
         WHERE start_date<=? AND COALESCE(end_date,start_date)>=? GROUP BY record_type`, [today, today]).catch(() => []),
  ]);
  const by = Object.fromEntries(rows.map(r => [r.record_type, Number(r.count||0)]));
  const present = (by["Ажилласан"]||0) + (by["Хоцорсон"]||0) + (by["Илүү цаг"]||0);
  return { today, active: Number(activeRow.count||0), present, by };
}

async function fetchMySalary(userId) {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth() + 1;
  const [payroll, user] = await Promise.all([
    get(`SELECT * FROM payroll_timesheet WHERE user_id=? AND year=? AND month=?`, [userId, year, month]).catch(() => null),
    get(`SELECT salary,skill_allowance,tenure_allowance,meal_allowance FROM users WHERE id=?`, [userId]).catch(() => null),
  ]);
  return { year, month, payroll, user };
}

async function fetchCameraCount() {
  const [byStatus, totals, openRepairs] = await Promise.all([
    all(`SELECT COALESCE(status,'Идэвхтэй') status, COUNT(*) count
         FROM assets
         WHERE category LIKE '%амер%' OR category LIKE '%камер%' OR name LIKE '%камер%' OR name LIKE '%camera%'
         GROUP BY COALESCE(status,'Идэвхтэй') ORDER BY count DESC`).catch(() => []),
    get(`SELECT COUNT(*) points,
                COALESCE(SUM(COALESCE(camera_count,1)),0) capacity,
                COALESCE(SUM(COALESCE(camera_broken_count,0)),0) broken
         FROM assets
         WHERE category LIKE '%амер%' OR category LIKE '%камер%' OR name LIKE '%камер%' OR name LIKE '%camera%'`).catch(() => ({ points: 0, capacity: 0, broken: 0 })),
    get(`SELECT COUNT(*) count
         FROM asset_events
         WHERE (category LIKE '%амер%засвар%' OR category LIKE '%камер%засвар%')
           AND status NOT IN ('Дууссан','Хаагдсан')`).catch(() => ({ count: 0 })),
  ]);
  const capacity = Number(totals.capacity || 0);
  const broken = Number(totals.broken || 0);
  return {
    byStatus,
    total: Number(totals.points || 0),
    capacity,
    broken,
    working: Math.max(0, capacity - broken),
    openRepairs: Number(openRepairs.count || 0),
    availabilityPct: capacity > 0 ? Math.max(0, (capacity - broken) / capacity * 100) : null,
  };
}

async function fetchPoleCount(question = "") {
  const q = cyrillize(String(question || "").toLowerCase());
  const focus = q.includes("гэр хороолол") ? "ger" : q.includes("цамхаг") ? "tower" : "all";
  const [road, ger, tower, gerRows, towerRows, faults] = await Promise.all([
    get(`SELECT COUNT(*) locations, COALESCE(SUM(lamp_count),0) poles,
          COALESCE(SUM(CASE WHEN total_heads>0 THEN total_heads ELSE lamp_count END),0) heads
         FROM sl_points WHERE code LIKE 'ГТ-%'`).catch(() => ({ locations:0, poles:0, heads:0 })),
    get(`SELECT COUNT(*) locations, COALESCE(SUM(total_count),0) poles,
          COALESCE(SUM(CASE WHEN head_count>0 THEN head_count ELSE total_count END),0) heads
         FROM sl_ger_inventory WHERE category='Гэр хороолол'`).catch(() => ({ locations:0, poles:0, heads:0 })),
    get(`SELECT COUNT(*) locations, COALESCE(SUM(total_count),0) poles,
          COALESCE(SUM(CASE WHEN head_count>0 THEN head_count ELSE total_count END),0) heads
         FROM sl_ger_inventory WHERE category='Цамхаг'`).catch(() => ({ locations:0, poles:0, heads:0 })),
    all(`SELECT id, bag_no, location_name, category, total_count, head_count,
                light_type, meter_no, install_date, notes
         FROM sl_ger_inventory
         WHERE category='Гэр хороолол'
         ORDER BY bag_no, location_name
         LIMIT 30`).catch(() => []),
    all(`SELECT id, bag_no, location_name, category, total_count, head_count,
                light_type, meter_no, install_date, notes
         FROM sl_ger_inventory
         WHERE category='Цамхаг'
         ORDER BY bag_no, location_name
         LIMIT 30`).catch(() => []),
    all(`SELECT id, category, location_id, location_name, location_type, total_heads,
                broken_count, fixed_count, status, report_date, notes
         FROM sl_faults
         WHERE category IN ('Гэр хорооллын гэрэл','Цамхагийн гэрэл')
           AND status IN ('Нээлттэй','Явцтай')
         ORDER BY report_date DESC, broken_count DESC, id DESC`).catch(() => []),
  ]);
  const totalPoles = Number(road.poles||0) + Number(ger.poles||0) + Number(tower.poles||0);
  const totalHeads = Number(road.heads||0) + Number(ger.heads||0) + Number(tower.heads||0);
  return { focus, road, ger, tower, gerRows, towerRows, faults, totalPoles, totalHeads };
}

async function fetchAssetValue() {
  const [fixed, assets, oldWH, newWH, finance] = await Promise.all([
    get(`SELECT COUNT(*) count,
          COALESCE(SUM(book_value),0) book_value,
          COALESCE(SUM(initial_value),0) initial_value
         FROM fixed_assets_ledger`).catch(() => ({ count:0, book_value:0, initial_value:0 })),
    get(`SELECT COUNT(*) count,
          COALESCE(SUM(CASE WHEN current_value>0 THEN current_value ELSE purchase_price END),0) value
         FROM assets`).catch(() => ({ count:0, value:0 })),
    get(`SELECT COALESCE(SUM(balance*price),0) value FROM warehouse_items`).catch(() => ({ value:0 })),
    get(`SELECT COALESCE(SUM(
          (m.opening_qty
           + COALESCE((SELECT SUM(CASE WHEN txn_type IN ('INCOME','INTERNAL_IN') THEN qty ELSE 0 END)
                       FROM wh_transactions t WHERE t.material_id=m.id),0)
           - COALESCE((SELECT SUM(CASE WHEN txn_type IN ('EXPENSE','INTERNAL_OUT') THEN qty ELSE 0 END)
                       FROM wh_transactions t WHERE t.material_id=m.id),0)
          ) * m.unit_price
        ),0) value FROM wh_materials m`).catch(() => ({ value:0 })),
    get(`SELECT
          COALESCE((SELECT SUM(amount) FROM cash_journal WHERE txn_type='Орлого'),0)
        - COALESCE((SELECT SUM(amount) FROM cash_journal WHERE txn_type='Зарлага'),0) cash_balance,
          COALESCE((SELECT SUM(amount-received_amount) FROM accounts_receivable WHERE status!='Хүлээн авсан'),0) receivable,
          COALESCE((SELECT SUM(amount-paid_amount) FROM accounts_payable WHERE status!='Төлөгдсөн'),0) payable`).catch(() => ({ cash_balance:0, receivable:0, payable:0 })),
  ]);
  const fixedVal = Number(fixed.book_value||0) > 0 ? Number(fixed.book_value) : Number(fixed.initial_value||0);
  const regVal   = Number(assets.value||0);
  const whVal    = Number(oldWH.value||0) + Number(newWH.value||0);
  const finNet   = Number(finance.cash_balance||0) + Number(finance.receivable||0) - Number(finance.payable||0);
  return { fixed, assets, fixedVal, regVal, whVal, finNet, total: (fixedVal || regVal) + whVal + finNet };
}

function compactNameText(text) {
  return cyrillize(String(text || "").toLowerCase())
    .replace(/['"`.,!?;:()[\]{}]/g, " ")
    .replace(/(утасны|утас|дугаарыг|дугаарын|дугаар|настай|нас|боловсролтой|боловсролын|боловсрол|төрсөн өдөр|төрсөн|хүйс|үндэс|email|имэйл|мэйл|ажилд|ажил|хийдэг|орсон|хэзээ|хэдэн|онд|манай|байгууллагад|хаяг|хэлээд|өгөөч|өгөө|хэд|ямар|вэ|ve|be|нь|iin)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function romanizeName(text) {
  const map = {
    "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"j","з":"z","и":"i","й":"i",
    "к":"k","л":"l","м":"m","н":"n","о":"o","ө":"u","п":"p","р":"r","с":"s","т":"t","у":"u",
    "ү":"u","ф":"f","х":"kh","ц":"ts","ч":"ch","ш":"sh","щ":"sh","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya",
  };
  return String(text || "").toLowerCase().split("").map(ch => map[ch] ?? ch).join("");
}

function editDistance(a, b) {
  if (!a || !b) return Math.max(a.length, b.length);
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function hasNearSubstring(haystack, needle, maxDist = 1) {
  if (!haystack || !needle || haystack.length < Math.max(3, needle.length - maxDist)) return false;
  const minLen = Math.max(3, needle.length - maxDist);
  const maxLen = needle.length + maxDist;
  for (let len = minLen; len <= maxLen; len++) {
    for (let i = 0; i <= haystack.length - len; i++) {
      if (editDistance(haystack.slice(i, i + len), needle) <= maxDist) return true;
    }
  }
  return false;
}

function nameFromQuestion(question) {
  const q = compactNameText(question);
  return canonicalEmployeeAlias(q)
    .replace(/(ийн|ын|ий|ы|н)$/g, "")
    .trim();
}

function canonicalEmployeeAlias(text) {
  let q = String(text || "").toLowerCase().trim();
  const aliases = [
    { patterns: ["болороо", "boloroo", "bolroo"], name: "энхболор" },
    { patterns: ["пүүжээ", "пvжээ", "пvvжээ", "puujee", "pvvjee", "pujee", "pvjee"], name: "пүрэвсүрэн" },
    { patterns: ["пүрэвсүрэн", "purevsuren", "purewsuren"], name: "пүрэвсүрэн" },
    { patterns: ["ундраа", "undraa"], name: "ундраа" },
    { patterns: ["цэлмэг", "tselmeg"], name: "цэлмэг" },
    { patterns: ["билгүүн", "bilguun", "bilgvvn"], name: "билгүүн" },
    { patterns: ["гэрлээ", "gerlee", "гэрэлтод", "gereltod"], name: "гэрэлт-од" },
    { patterns: ["нэмэхээ", "nemehee", "нэмэхбаяр", "nemehbayar", "nemeh bayr"], name: "нэмэхбаяр" },
    { patterns: ["тунгаа", "tungaa", "тунгалаг", "tungalag"], name: "тунгалаг" },
  ];
  for (const a of aliases) {
    if (a.patterns.some(p => q.includes(p))) return a.name;
  }
  return q;
}

function employeeNameScore(row, query) {
  const q = compactNameText(query);
  const qc = q.replace(/\s+/g, "");
  const qLatin = String(query || "").toLowerCase().replace(/[^a-z]/g, "");
  const qCompactLatin = romanizeName(q).replace(/[^a-z]/g, "").replace(/(iin|yn|ii|i|n)$/g, "");
  const roman = romanizeName(row.full_name).replace(/[^a-z]/g, "");
  const parts = String(row.full_name || "").toLowerCase().split(/\s+/).filter(Boolean);
  let score = 0;
  for (const p of parts) {
    const pc = p.replace(/\s+/g, "");
    if (pc.length >= 3 && qc.includes(pc)) score += pc.length + 10;
    else if (pc.length >= 3 && q.includes(p)) score += pc.length + 6;
    const rp = romanizeName(p).replace(/[^a-z]/g, "");
    if (rp.length >= 3 && qLatin.includes(rp)) score += rp.length + 9;
    else if (rp.length >= 4) {
      const qTokens = String(query || "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
      if (qTokens.some(t => t.length >= 4 && editDistance(t, rp) <= 1)) score += rp.length + 5;
    }
  }
  if (roman.length >= 3 && qLatin.includes(roman)) score += roman.length + 12;
  for (const p of parts) {
    const rp = romanizeName(p).replace(/[^a-z]/g, "");
    const qName = qLatin.replace(/(iin|yn|ii|i|n)$/g, "");
    if (rp.length >= 4 && qName.length >= 4 && editDistance(qName, rp) <= 2) score += rp.length + 4;
    if (rp.length >= 4 && qCompactLatin.length >= 4 && editDistance(qCompactLatin, rp) <= 2) score += rp.length + 8;
    if (rp.length >= 4 && hasNearSubstring(qCompactLatin || qLatin, rp, 2)) score += rp.length + 7;
    if (rp.length >= 4 && hasNearSubstring(rp, qCompactLatin || qLatin, 2)) score += rp.length + 6;
  }
  return score;
}

function bestEmployeeMatch(rows, name, question) {
  return rows
    .map(r => ({ row: r, score: employeeNameScore(r, `${name || ""} ${question || ""}`) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.row || null;
}

async function fetchEmployeePhoneFromHistory(question, convHistory, user) {
  const { lastEmployeeNameFromHistory } = require("./intent");
  const canSeePhone = ["director", "hr"].includes(user.role);
  const name = nameFromQuestion(question) || lastEmployeeNameFromHistory(convHistory);
  if (!name) return { name: "", row: null, canSeePhone };
  const directLike = `%${name}%`;
  let row = await get(
      `SELECT full_name, position, department, phone, emergency_contact FROM users
     WHERE active=1 AND LOWER(full_name) LIKE LOWER(?) ORDER BY LENGTH(full_name) ASC LIMIT 1`,
    [directLike]
  ).catch(() => null);
  if (!row) {
    const rows = await all(
      `SELECT full_name, position, department, phone, emergency_contact FROM users WHERE active=1 ORDER BY full_name`
    ).catch(() => []);
    row = bestEmployeeMatch(rows, name, question);
  }
  return { name, row, canSeePhone };
}

function requestedEmployeeFields(question) {
  const q = cyrillize(String(question || "").toLowerCase());
  const fields = [];
  if (q.includes("утас") || q.includes("дугаар")) fields.push("phone");
  if (q.includes("нас")) fields.push("age");
  if (q.includes("боловсрол")) fields.push("education");
  if (q.includes("төрсөн")) fields.push("birthdate");
  if (q.includes("хүйс")) fields.push("gender");
  if (q.includes("үндэс")) fields.push("nationality");
  if (q.includes("email") || q.includes("имэйл") || q.includes("мэйл")) fields.push("email");
  if ((q.includes("ажил") && q.includes("орсон")) || q.includes("байгууллагад")) fields.push("hire_date");
  if (q.includes("албан тушаал") || (q.includes("ямар") && q.includes("ажил")) || (q.includes("ажил") && q.includes("хийдэг"))) fields.push("position");
  if (!fields.length) fields.push("summary");
  return fields;
}

async function findEmployeeByQuestionName(question, convHistory = []) {
  const { lastEmployeeNameFromHistory } = require("./intent");
  const name = nameFromQuestion(question) || lastEmployeeNameFromHistory(convHistory);
  if (!name) return { name: "", row: null };
  const historyName = lastEmployeeNameFromHistory(convHistory);
  let row = await get(
    `SELECT id, full_name, position, department, phone, emergency_contact, email, education, gender,
            birthdate, nationality, hire_date, status_hr
     FROM users
     WHERE active=1 AND LOWER(full_name) LIKE LOWER(?)
     ORDER BY LENGTH(full_name) ASC LIMIT 1`,
    [`%${name}%`]
  ).catch(() => null);
  if (!row) {
    const rows = await all(
      `SELECT id, full_name, position, department, phone, emergency_contact, email, education, gender,
              birthdate, nationality, hire_date, status_hr
       FROM users WHERE active=1 ORDER BY full_name`
    ).catch(() => []);
    row = bestEmployeeMatch(rows, name, question);
    if (!row && historyName && historyName !== name) row = bestEmployeeMatch(rows, historyName, "");
  }
  return { name, row };
}

async function fetchEmployeeDetail(question, convHistory, user) {
  const canSeePrivate = ["director", "hr"].includes(user.role);
  const canSeeEmployee = ["director", "hr", "chief_engineer"].includes(user.role);
  const found = await findEmployeeByQuestionName(question, convHistory);
  return {
    ...found,
    fields: requestedEmployeeFields(question),
    canSeePrivate,
    canSeeEmployee,
  };
}

async function fetchMonthlyReportSummary(question) {
  const { buildMonthlyReport } = require("../report_builder");
  const target = parseBillMonth(question);
  const now = new Date();
  const year  = target?.year  || now.getFullYear();
  const month = target?.month || (now.getMonth() + 1);
  const d = await buildMonthlyReport(year, month).catch(() => null);
  return { year, month, d };
}

module.exports = {
  localDate,
  parseBillMonth,
  fetchAssistantContext,
  fetchCurrentLightSchedules,
  fetchOpenFaults,
  fetchOpenLightFaults,
  fetchLocationLightFaults,
  fetchLightLocationStatus,
  fetchEmployeeGender,
  fetchTrafficStatus,
  fetchTrafficSignalLog,
  fetchLowStock,
  fetchMonthlyExpenses,
  fetchBudgetProgress,
  fetchOpenSafetyReports,
  fetchHabeaWorkStatus,
  fetchContractExpiry,
  fetchAssetWarranty,
  fetchTrainingSchedule,
  fetchOverdueWork,
  fetchEmployeeCount,
  fetchEmployeeByRole,
  fetchEmployeeSalaryLookup,
  fetchMyPhone,
  fetchElectricityBill,
  fetchWorkActivity,
  fetchMyWork,
  fetchTodayAttendance,
  fetchMySalary,
  fetchCameraCount,
  fetchPoleCount,
  fetchAssetValue,
  fetchEmployeePhoneFromHistory,
  fetchEmployeeDetail,
  fetchMonthlyReportSummary,
};
