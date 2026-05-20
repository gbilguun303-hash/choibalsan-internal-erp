// Import гэрэлтүүлэг and гэрлэн дохио from бүртгэл-2026.xlsx into assets table
// Usage: node db/import-lights.js

const XLSX = require("xlsx");
const path = require("path");
const { run, get } = require("../db");

const FILE = path.join(__dirname, "../data/бүртгэл-2026.xlsx");
const CREATED_BY = 1;

function pad(n, width) {
  return String(n).padStart(width, "0");
}

// ── Parse гэрэлтүүлэг sheet ─────────────────────────────────
// Cols: [0]№  [1]Байршил  [2]Шон  [3]Толгой/шон  [4]Нийт толгой  [5]Чадал/Вт  [6]Нийт хүч/кВт  [7]Урт/м
function parseLights(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const items = [];

  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[1] || "").trim();
    if (!name || name === "Нийт") continue;

    const poles   = r[2] !== "" ? r[2] : "";
    const heads   = r[4] !== "" ? r[4] : "";
    const power   = String(r[5] || "").trim();
    const totalKw = r[6] !== "" ? r[6] : "";

    const specParts = [];
    if (poles   !== "") specParts.push(`Шон: ${poles}`);
    if (heads   !== "") specParts.push(`Толгой: ${heads}`);
    if (power)          specParts.push(`Чадал: ${power} Вт`);
    if (totalKw !== "") specParts.push(`Нийт хүч: ${totalKw} кВт`);

    items.push({ name, specs: specParts.join(", ") });
  }
  return items;
}

// ── Parse гэрлэн дохио sheet ────────────────────────────────
// Cols: [0]№  [1]Байршил  [2]Тээврийн подор  [3]Явган подор  [4]Удирдлага
function parseTraffic(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const items = [];

  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[1] || "").trim();
    if (!name || name === "Нийт") continue;

    items.push({
      name,
      specs: `Тээврийн подор: ${r[2]}, Явган: ${r[3]}, Удирдлага: ${r[4]}`
    });
  }
  return items;
}

// ── Next available code ──────────────────────────────────────
async function nextCode(prefix, width) {
  const like = `${prefix}-%`;
  const row = await get(
    `SELECT asset_code FROM assets WHERE asset_code LIKE ? ORDER BY asset_code DESC LIMIT 1`,
    [like]
  );
  if (!row) return `${prefix}-${pad(1, width)}`;
  const num = parseInt(row.asset_code.split("-")[1], 10) || 0;
  return `${prefix}-${pad(num + 1, width)}`;
}

// ── Insert one asset ─────────────────────────────────────────
async function insertAsset({ name, specs, category, sub_category, codePrefix, codeWidth }) {
  const existing = await get("SELECT id FROM assets WHERE name=? AND category=?", [name, category]);
  if (existing) {
    console.log(`  SKIP (exists): ${name}`);
    return;
  }
  const code = await nextCode(codePrefix, codeWidth);
  await run(
    `INSERT INTO assets(asset_code,name,category,sub_category,specs,status,created_by)
     VALUES(?,?,?,?,?,?,?)`,
    [code, name, category, sub_category, specs, "Идэвхтэй", CREATED_BY]
  );
  console.log(`  INSERT ${code}: ${name}`);
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const wb = XLSX.readFile(FILE);

  // гэрэлтүүлэг
  console.log("\n── Гэрэлтүүлэг ─────────────────────────────────────");
  const lightSheet = wb.Sheets["гэрэлтүүлэг"];
  if (!lightSheet) { console.error('Sheet "гэрэлтүүлэг" not found'); process.exit(1); }

  for (const item of parseLights(lightSheet)) {
    await insertAsset({
      ...item,
      category: "Гэрэлтүүлэг",
      sub_category: "Гудамжны гэрэлтүүлэг",
      codePrefix: "LIGHT",
      codeWidth: 3
    });
  }

  // гэрлэн дохио
  console.log("\n── Гэрлэн дохио ─────────────────────────────────────");
  const trafSheet = wb.Sheets["гэрлэн дохио"];
  if (!trafSheet) { console.error('Sheet "гэрлэн дохио" not found'); process.exit(1); }

  for (const item of parseTraffic(trafSheet)) {
    await insertAsset({
      ...item,
      category: "Гэрлэн дохио",
      sub_category: "Гэрлэн дохио",
      codePrefix: "TRAF",
      codeWidth: 3
    });
  }

  console.log("\nДуусгалаа.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
