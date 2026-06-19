import { state, api, toast, escapeHtml, today } from './common.js';

const canWrite = () => ["director","chief_engineer","storekeeper","accountant"].includes(state.me?.role);
const fmt  = n => Number(n || 0).toLocaleString("mn-MN");
const fmtD = s => s ? s.slice(0, 10) : "—";

const NYARAV_TABS = [
  ["nyarav_dash",   "📦", "Самбар"],
  ["nyarav_intake", "📥", "Орлого"],
  ["nyarav_issue",  "📤", "Зарлага"],
  ["nyarav_stock",  "🔢", "Үлдэгдэл"],
  ["nyarav_order",  "📝", "Захиалга"],
  ["nyarav_report", "📊", "Тайлан"],
];

const NYARAV_EXEC_CATEGORIES = ["Гэрэлтүүлэг", "Камер", "Техник", "Машин", "Авто гараж", "Аж ахуй", "Захиргаа", "Бусад"];

let _nyaravTab = "nyarav_dash";

function nyaravNavHtml() {
  return `
    <div id="nyaravShellNav" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:14px;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap">
        <div>
          <div style="font-size:18px;font-weight:900;color:#0f172a">📦 Няравын ажлын талбар</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px">Агуулахын орлого, зарлага, үлдэгдэл, захиалга, тайлан</div>
        </div>
        ${canWrite() ? `<button class="btn btn-sm btn-primary" onclick="nyarav_bootstrap_panel()">📥 Excel-ээс татах</button>` : ""}
      </div>
      <div style="display:flex;gap:0;overflow-x:auto;padding:0 12px">
        ${NYARAV_TABS.map(([key, icon, label]) => `
          <button onclick="nyaravOpen('${key}')" id="nyaravTab_${key}"
            style="padding:12px 14px;font-size:13px;font-weight:700;border:none;background:transparent;
                   color:${_nyaravTab===key ? '#2563eb' : '#64748b'};cursor:pointer;white-space:nowrap;
                   display:flex;align-items:center;gap:6px;border-bottom:${_nyaravTab===key ? '3px solid #2563eb' : '3px solid transparent'}">
            <span>${icon}</span>${label}
          </button>`).join("")}
      </div>
    </div>`;
}

function injectNyaravNav() {
  const mainEl = document.getElementById("main");
  if (!mainEl || document.getElementById("nyaravShellNav")) return;
  mainEl.insertAdjacentHTML("afterbegin", nyaravNavHtml());
}

async function nyarav() {
  await nyaravOpen(_nyaravTab || "nyarav_dash");
}

async function nyaravOpen(tab = "nyarav_dash") {
  _nyaravTab = NYARAV_TABS.some(([key]) => key === tab) ? tab : "nyarav_dash";
  const fn = window[_nyaravTab];
  if (typeof fn === "function") await fn();
  injectNyaravNav();
}

const TXN_LABELS = {
  INCOME:       { text: "Орлого",         bg: "#dcfce7", color: "#16a34a" },
  INTERNAL_IN:  { text: "Дотоод орлого",  bg: "#dbeafe", color: "#2563eb" },
  EXPENSE:      { text: "Зарлага",        bg: "#fee2e2", color: "#dc2626" },
  INTERNAL_OUT: { text: "Дотоод зарлага", bg: "#fef3c7", color: "#d97706" },
  CORRECTION:   { text: "Засвар",         bg: "#f3e8ff", color: "#7c3aed" },
};

const NYARAV_UNITS = ["ширхэг", "ш", "кг", "тн", "боодол", "хайрцаг", "метр", "уут", "м3", "м2", "л", "ком", "багц"];

function unitSelectHtml(id, selected = "") {
  return `<select id="${id}" class="form-select form-select-sm" style="min-width:105px"
    onchange="if(this.id.startsWith('elnUnitSel')){const i=this.id.replace('elnUnitSel','');const u=document.getElementById('elnUnit'+i);if(u)u.textContent=this.value;}">
    <option value="">— Нэгж —</option>
    ${NYARAV_UNITS.map(u => `<option value="${u}" ${selected === u ? "selected" : ""}>${u}</option>`).join("")}
  </select>`;
}

function txnBadge(type) {
  const t = TXN_LABELS[type] || { text: type, bg: "#f1f5f9", color: "#64748b" };
  return `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${t.bg};color:${t.color}">${t.text}</span>`;
}

// ── Searchable material picker ───────────────────────────────────
// Usage: matSearchHtml("inMat", materials)
// Selected value stored in hidden input #inMatId, #inMatPrice, #inMatUnit, #inMatBalance
function matSearchHtml(prefix, materials) {
  const dataAttr = encodeURIComponent(JSON.stringify(
    materials.map(m => ({
      id: m.id,
      name: m.name,
      unit: m.unit || "",
      price: m.unit_price || 0,
      balance: m.current_qty || 0,
      category_code: m.category_code || "",
      category_name: m.category_name || ""
    }))
  ));
  return `
    <div style="position:relative" id="${prefix}Wrap">
      <input type="text" id="${prefix}Search" autocomplete="off"
        class="form-control form-control-sm" placeholder="🔍 Нэрээр хайх… (${materials.length} материал)"
        oninput="matSearchFilter('${prefix}')"
        onfocus="matSearchOpen('${prefix}')"
        onblur="setTimeout(()=>matSearchClose('${prefix}'),200)">
      <input type="hidden" id="${prefix}Id">
      <input type="hidden" id="${prefix}Price">
      <input type="hidden" id="${prefix}Unit">
      <input type="hidden" id="${prefix}Balance">
      <input type="hidden" id="${prefix}Data" value="${escapeHtml(decodeURIComponent(dataAttr))}">
      <div id="${prefix}Drop" style="display:none;position:absolute;z-index:9999;background:#fff;border:1px solid #e2e6ed;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);max-height:300px;overflow-y:auto;width:100%;top:calc(100% + 4px);left:0">
      </div>
    </div>`;
}

function matSearchOpen(prefix) {
  matSearchFilter(prefix);
  matSearchPlace(prefix);
}

function matSearchClose(prefix) {
  const d = document.getElementById(prefix + "Drop");
  if (d) d.style.display = "none";
}

function matSearchFilter(prefix) {
  const q    = (document.getElementById(prefix + "Search")?.value || "").toLowerCase();
  const cat  = document.getElementById(prefix + "Category")?.value || "";
  const raw  = document.getElementById(prefix + "Data")?.value || "[]";
  let mats;
  try { mats = JSON.parse(raw); } catch(_) { mats = []; }
  const isIssue = prefix.startsWith("eln");
  const byCategory = cat ? mats.filter(m => String(m.category_code || "") === String(cat)) : mats;
  const available = isIssue ? byCategory.filter(m => Number(m.balance || 0) > 0) : byCategory;
  const filtered = q
    ? available.filter(m => (m.name || "").toLowerCase().startsWith(q))
    : available;
  const drop = document.getElementById(prefix + "Drop");
  if (!drop) return;
  drop.style.display = "block";
  matSearchPlace(prefix);
  if (!filtered.length) {
    drop.innerHTML = `<div style="padding:10px 14px;color:#94a3b8;font-size:13px">${isIssue ? "Үлдэгдэлтэй, энэ үсгээр эхэлсэн материал олдсонгүй" : "Олдсонгүй"}</div>`;
    return;
  }
  drop.innerHTML = filtered.slice(0, 80).map(m => `
    <div onclick="matSearchSelect('${prefix}',${m.id},'${escapeHtml(m.name).replace(/'/g,"\\'")}',${m.price},'${escapeHtml(m.unit)}',${m.balance})"
      style="padding:8px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center"
      onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background=''">
      <span>${escapeHtml(m.name)} <span style="color:#94a3b8;font-size:11px">(${escapeHtml(m.unit)})</span></span>
      <span style="font-size:11px;color:${m.balance <= 0 ? '#dc2626' : '#16a34a'};font-weight:700">үлдэгдэл: ${fmt(m.balance)}</span>
    </div>`).join("") + (filtered.length > 80 ? `<div style="padding:8px 14px;color:#94a3b8;font-size:12px">… нийт ${filtered.length} илэрц. Хайлтыг нарийсгана уу.</div>` : "");
}

function matSearchPlace(prefix) {
  const input = document.getElementById(prefix + "Search");
  const drop = document.getElementById(prefix + "Drop");
  if (!input || !drop) return;
  const r = input.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - 8;
  const above = r.top - 8;
  const openUp = below < 180 && above > below;
  drop.style.position = "fixed";
  drop.style.zIndex = "5000";
  drop.style.left = `${r.left}px`;
  drop.style.width = `${r.width}px`;
  drop.style.maxHeight = `${Math.max(140, Math.min(300, openUp ? above : below))}px`;
  drop.style.top = openUp ? "auto" : `${r.bottom + 4}px`;
  drop.style.bottom = openUp ? `${window.innerHeight - r.top + 4}px` : "auto";
}

function matSearchSelect(prefix, id, name, price, unit, balance) {
  document.getElementById(prefix + "Search").value  = name;
  document.getElementById(prefix + "Id").value      = id;
  document.getElementById(prefix + "Price").value   = price;
  document.getElementById(prefix + "Unit").value    = unit;
  document.getElementById(prefix + "Balance").value = balance;
  document.getElementById(prefix + "Drop").style.display = "none";
  // Trigger fill callback
  if (typeof window[prefix + "Fill"] === "function") window[prefix + "Fill"]();
}

function matSearchSetCategory(prefix) {
  const search = document.getElementById(prefix + "Search");
  const id     = document.getElementById(prefix + "Id");
  const price  = document.getElementById(prefix + "Price");
  const unit   = document.getElementById(prefix + "Unit");
  const bal    = document.getElementById(prefix + "Balance");
  if (search) search.value = "";
  if (id) id.value = "";
  if (price) price.value = "";
  if (unit) unit.value = "";
  if (bal) bal.value = "";
  matSearchFilter(prefix);
}

function matCategorySelectHtml(prefix, materials) {
  const cats = [];
  const seen = new Set();
  for (const m of materials || []) {
    const code = String(m.category_code || "");
    if (!code || seen.has(code)) continue;
    seen.add(code);
    cats.push({ code, name: m.category_name || "" });
  }
  cats.sort((a, b) => a.code.localeCompare(b.code, "mn"));
  return `<select id="${prefix}Category" class="form-select form-select-sm" style="min-width:180px"
    onchange="matSearchSetCategory('${prefix}')">
    <option value="">-- Бүлэг сонгох --</option>
    ${cats.map(c => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.code)} ${escapeHtml(c.name)}</option>`).join("")}
  </select>`;
}

function statCard(label, val, color, sub) {
  return `<div style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;padding:14px 16px;border-top:3px solid ${color}">
    <div style="font-size:11px;color:#667085;text-transform:uppercase;margin-bottom:4px">${label}</div>
    <div style="font-size:22px;font-weight:800;color:${color}">${val}</div>
    ${sub ? `<div style="font-size:11px;color:#94a3b8;margin-top:3px">${sub}</div>` : ""}
  </div>`;
}

// ── 1. Агуулахын самбар ──────────────────────────────────────────
async function nyarav_dash() {
  main.innerHTML = `<div style="text-align:center;padding:60px 0;color:#94a3b8"><div class="spinner-border text-primary spinner-border-sm"></div></div>`;
  let s = {};
  try { s = await api("/api/nyarav/summary"); } catch (_) {}

  const low   = s.lowStock || [];
  const moves = s.recentMoves || [];

  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <div>
      <h1 style="margin:0 0 4px">📦 Агуулахын самбар</h1>
      <div style="font-size:12px;color:#667085">БМ журнал · Нярав · ${new Date().toLocaleDateString("mn-MN")}</div>
    </div>
    <div class="d-flex gap-2">
      <button class="btn btn-sm btn-outline-secondary" onclick="nyarav_dash()">↺ Шинэчлэх</button>
      ${canWrite() ? `<button class="btn btn-sm btn-primary" onclick="nyarav_bootstrap_panel()">📥 Excel-ээс татах</button>` : ""}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
    ${statCard("Нийт материал", fmt(s.totalItems?.total || 0) + " нэр", "#2563eb")}
    ${statCard("Нийт дүн", fmt(s.totalValue?.total || 0) + "₮", "#16a34a")}
    ${statCard("Бага үлдэгдэл", (low.length || 0) + " нэр", "#dc2626", "Анхаарал шаардлагатай")}
    ${statCard("Энэ сарын зарлага", fmt(s.monthExpense?.total || 0) + "₮", "#d97706", "Энэ сарын орлого: " + fmt(s.monthIncome?.total || 0) + "₮")}
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
    <div class="panel">
      <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">⚠️ Дуусах дөхсөн материал</div>
      ${low.length ? `<div style="overflow:auto;max-height:260px"><table class="table table-sm mb-0">
        <thead class="table-light"><tr><th>Материал</th><th>Үлдэгдэл</th><th>Доод хэмжээ</th></tr></thead>
        <tbody>${low.map(r => `<tr>
          <td class="small">${escapeHtml(r.name)}</td>
          <td style="color:#dc2626;font-weight:700">${fmt(r.current_qty)} ${escapeHtml(r.unit || "")}</td>
          <td style="color:#94a3b8">${fmt(r.min_qty)}</td>
        </tr>`).join("")}</tbody>
      </table></div>` : `<div style="padding:24px;text-align:center;color:#94a3b8">Бага үлдэгдэлтэй материал байхгүй</div>`}
    </div>

    <div class="panel">
      <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">🔄 Сүүлийн хөдөлгөөнүүд</div>
      ${moves.length ? `<div style="overflow:auto;max-height:260px"><table class="table table-sm mb-0">
        <thead class="table-light"><tr><th>Огноо</th><th>Төрөл</th><th>Материал</th><th>Тоо</th></tr></thead>
        <tbody>${moves.map(r => `<tr>
          <td class="small text-muted">${fmtD(r.txn_date)}</td>
          <td>${txnBadge(r.txn_type)}</td>
          <td class="small">${escapeHtml(r.material_name || "")}</td>
          <td class="small">${fmt(r.qty)} ${escapeHtml(r.unit || "")}</td>
        </tr>`).join("")}</tbody>
      </table></div>` : `<div style="padding:24px;text-align:center;color:#94a3b8">Хөдөлгөөн байхгүй</div>`}
    </div>
  </div>

  <div id="bootstrapPanel"></div>`;
}

function nyarav_bootstrap_panel() {
  const el = document.getElementById("bootstrapPanel");
  if (!el) return;
  el.innerHTML = `
  <div class="panel mt-3">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700">📥 БМ журнал.xlsx-ээс материал татах</div>
    <div style="padding:16px">
      <p class="text-muted small mb-2">БМ журналын Excel файлыг оруулснаар 200+ материалын жагсаалт автоматаар бүртгэгдэнэ. Аль хэдийн бүртгэгдсэн (barcode давхцасан) материалыг давтаж оруулахгүй.</p>
      <div class="d-flex align-items-center gap-2">
        <input type="file" id="bootstrapFile" accept=".xlsx,.xls" class="form-control" style="max-width:320px">
        <button class="btn btn-success" onclick="nyarav_do_bootstrap()">Татах</button>
      </div>
      <div id="bootstrapResult" class="mt-2"></div>
    </div>
  </div>`;
}

async function nyarav_do_bootstrap() {
  const inp = document.getElementById("bootstrapFile");
  if (!inp?.files?.length) { toast("Excel файл сонгоно уу"); return; }
  const res = document.getElementById("bootstrapResult");
  if (res) res.innerHTML = `<div class="spinner-border spinner-border-sm text-primary"></div> Боловсруулж байна…`;
  const fd = new FormData();
  fd.append("file", inp.files[0]);
  try {
    const r = await fetch("/api/nyarav/bootstrap", {
      method: "POST",
      headers: { Authorization: "Bearer " + state.token },
      body: fd
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    if (res) res.innerHTML = `<div class="alert alert-success py-2">✅ ${d.imported} материал бүртгэгдлээ. ${d.skipped ? `(${d.skipped} давхцсан алгасав)` : ""}</div>`;
    toast(`✅ ${d.imported} материал татагдлаа`);
  } catch (e) {
    if (res) res.innerHTML = `<div class="alert alert-danger py-2">⚠️ ${e.message}</div>`;
    toast("⚠️ " + e.message);
  }
}

// ── 2. Орлогын бүртгэл (multi-line) ────────────────────────────
let _inMats = [];  // cached for line rows

async function nyarav_intake() {
  main.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;
  let materials = [], rows = [];
  [materials, rows] = await Promise.all([
    api("/api/nyarav/materials").catch(() => []),
    api("/api/nyarav/income").catch(() => []),
  ]);
  _inMats = materials;
  _inRows = rows;

  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <h1 style="margin:0">📥 Орлогын бүртгэл</h1>
    <button class="btn btn-sm btn-outline-secondary" onclick="nyarav_intake()">↺ Шинэчлэх</button>
  </div>

  ${canWrite() ? `
  <div class="panel mb-3">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">+ Шинэ орлого бүртгэх</div>
    <div style="padding:14px 16px">
      <div class="row g-2 mb-3">
        <div class="col-md-2">
          <label class="form-label small">Огноо *</label>
          <input id="inDate" type="date" class="form-control form-control-sm" value="${today()}">
        </div>
        <div class="col-md-3">
          <label class="form-label small">Баримт №</label>
          <input id="inDoc" type="text" class="form-control form-control-sm" placeholder="НБ-2026-0001">
        </div>
        <div class="col-md-3">
          <label class="form-label small">Нийлүүлэгч</label>
          <input id="inSupplier" type="text" class="form-control form-control-sm" placeholder="Компанийн нэр">
        </div>
        <div class="col-md-2">
          <label class="form-label small">Төрөл</label>
          <select id="inType" class="form-select form-select-sm">
            <option value="INCOME">Гадаад орлого</option>
            <option value="INTERNAL_IN">Дотоод орлого</option>
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small">Тайлбар</label>
          <input id="inNotes" type="text" class="form-control form-control-sm" placeholder="...">
        </div>
      </div>

      <!-- Multi-line items table -->
      <div style="overflow:auto;margin-bottom:10px">
        <table class="table table-sm table-bordered mb-0" id="inLinesTable">
          <thead class="table-light">
            <tr>
              <th style="min-width:200px">Бүлэг</th>
              <th style="min-width:320px">Материал *</th>
              <th style="min-width:120px">Хэмжих нэгж</th>
              <th style="min-width:90px">Тоо хэмжээ *</th>
              <th style="min-width:120px">Нэгж үнэ ₮</th>
              <th style="min-width:120px">Нийт дүн ₮</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="inLinesBody"></tbody>
        </table>
      </div>

      <div class="d-flex gap-2 align-items-center mb-3">
        <button class="btn btn-outline-primary btn-sm" onclick="inLineAdd()">+ Мөр нэмэх</button>
        <span id="inLineSummary" class="text-muted small"></span>
      </div>
      <button class="btn btn-success btn-sm px-4" onclick="nyarav_intake_save()">✅ Бүгдийг хадгалах</button>
    </div>
  </div>` : ""}

  <div class="panel">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">Барааны орлогын бүртгэл (${rows.length} мөр)</div>
    <div style="overflow:auto">
      <table class="table table-sm table-hover mb-0" style="min-width:1180px">
        <thead class="table-light">
          <tr>
            <th>Баримт №</th>
            <th>Огноо</th>
            <th>Нийлүүлэгч</th>
            <th>Материал</th>
            <th class="text-end">Тоо хэмжээ</th>
            <th>Нэгж</th>
            <th class="text-end">Нэгж үнэ</th>
            <th class="text-end">Нийт дүн</th>
            <th>Төрөл</th>
            <th>Тайлбар</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(r => `<tr>
            <td><code class="small text-primary">${escapeHtml(r.doc_no || r.txn_no || "")}</code></td>
            <td class="small text-muted">${fmtD(r.txn_date)}</td>
            <td class="small">${escapeHtml(r.supplier || "—")}</td>
            <td><strong>${escapeHtml(r.material_name || "")}</strong></td>
            <td class="text-end fw-bold text-success">${fmt(r.qty)}</td>
            <td class="small">${escapeHtml(r.unit || "—")}</td>
            <td class="text-end small">${fmt(r.unit_price)}₮</td>
            <td class="text-end fw-bold text-success">${fmt(r.amount)}₮</td>
            <td>${txnBadge(r.txn_type)}</td>
            <td class="small text-muted">${escapeHtml(r.notes || "")}</td>
            <td style="white-space:nowrap">
              ${canWrite() ? `<button class="btn btn-outline-primary btn-sm" style="padding:1px 7px;font-size:11px"
                onclick="nyaravTxnEditById(${r.id},'income')">✏️</button>
              <button class="btn btn-outline-danger btn-sm" style="padding:1px 7px;font-size:11px"
                onclick="nyaravTxnDel(${r.id},'income')">🗑</button>` : ""}
            </td>
          </tr>`).join("") : `<tr><td colspan="11" class="text-center text-muted py-4">Орлого бүртгэгдээгүй байна</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;

  // Start with one empty line
  inLineAdd();
}

let _inRows = [];
let _inLineSeq = 0;
function inLineAdd() {
  const idx = _inLineSeq++;
  const body = document.getElementById("inLinesBody");
  if (!body) return;
  const tr = document.createElement("tr");
  tr.id = `inLine_${idx}`;
  tr.innerHTML = `
    <td style="padding:4px 6px">
      ${matCategorySelectHtml("iln" + idx, _inMats)}
    </td>
    <td style="padding:4px 6px">
      ${matSearchHtml("iln" + idx, _inMats)}
    </td>
    <td style="padding:4px 6px">
      ${unitSelectHtml(`ilnUnitSel${idx}`)}
    </td>
    <td style="padding:4px 6px">
      <input type="number" id="ilnQty${idx}" class="form-control form-control-sm"
        placeholder="0" min="0.001" step="any" style="width:80px"
        oninput="inLineCalc(${idx})">
    </td>
    <td style="padding:4px 6px">
      <input type="number" id="ilnPrice${idx}" class="form-control form-control-sm"
        placeholder="0" step="any" oninput="inLineCalc(${idx})">
    </td>
    <td style="padding:4px 6px">
      <input type="text" id="ilnTotal${idx}" class="form-control form-control-sm"
        readonly style="background:#f8fafc;width:110px">
    </td>
    <td style="padding:4px 6px;text-align:center">
      <button class="btn btn-outline-danger btn-sm" style="padding:2px 6px;font-size:11px"
        onclick="inLineRemove(${idx})">✕</button>
    </td>`;
  body.appendChild(tr);
  // Register fill callback for this line's picker
  window[`iln${idx}Fill`] = () => {
    const price = parseFloat(document.getElementById(`iln${idx}Price`)?.value || "");
    const stored = parseFloat(document.getElementById(`iln${idx}Price`)?.value || 0);
    const matPrice = parseFloat(document.getElementById(`iln${idx}Price`)?.value || 0);
    // Use stored unit_price from hidden input
    const hp = document.getElementById(`iln${idx}Price`);
    const hu = document.getElementById(`iln${idx}Unit`);
    const hiddenPrice = document.getElementById(`iln${idx}Price`);
    const hiddenUnit  = document.getElementById(`iln${idx}Unit`);
    if (hp && !hp.value) hp.value = document.getElementById(`iln${idx}Price`)?.value || "";
    // Set unit label and pre-fill price from material
    const matPrice2 = parseFloat(document.getElementById(`iln${idx}Id`)?.value ? _inMats.find(m=>m.id==document.getElementById(`iln${idx}Id`).value)?.unit_price || 0 : 0);
    const priceEl   = document.getElementById(`ilnPrice${idx}`);
    const unitEl    = document.getElementById(`ilnUnit${idx}`);
    if (priceEl && !priceEl.value) priceEl.value = matPrice2 || "";
    if (unitEl)  unitEl.textContent = document.getElementById(`iln${idx}Unit`)?.value || "";
    inLineCalc(idx);
  };
  // Simpler: override fill to read hidden fields properly
  window[`iln${idx}Fill`] = () => {
    const matId    = document.getElementById(`iln${idx}Id`)?.value;
    const mat      = _inMats.find(m => String(m.id) === String(matId));
    const priceEl  = document.getElementById(`ilnPrice${idx}`);
    const unitSel  = document.getElementById(`ilnUnitSel${idx}`);
    if (mat) {
      if (priceEl && !priceEl.value) priceEl.value = mat.unit_price || "";
      if (unitSel && mat.unit) {
        if (!NYARAV_UNITS.includes(mat.unit)) unitSel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(mat.unit)}">${escapeHtml(mat.unit)}</option>`);
        unitSel.value = mat.unit;
      }
    }
    inLineCalc(idx);
  };
}

function inLineRemove(idx) {
  document.getElementById(`inLine_${idx}`)?.remove();
  inLineSummary();
}

function inLineCalc(idx) {
  const qty   = parseFloat(document.getElementById(`ilnQty${idx}`)?.value || 0);
  const price = parseFloat(document.getElementById(`ilnPrice${idx}`)?.value || 0);
  const tot   = document.getElementById(`ilnTotal${idx}`);
  if (tot) tot.value = fmt(qty * price) + "₮";
  inLineSummary();
}

function inLineSummary() {
  let total = 0, count = 0;
  document.querySelectorAll("#inLinesBody tr").forEach(tr => {
    const idx = tr.id?.replace("inLine_", "");
    if (!idx) return;
    const qty   = parseFloat(document.getElementById(`ilnQty${idx}`)?.value || 0);
    const price = parseFloat(document.getElementById(`ilnPrice${idx}`)?.value || 0);
    if (qty > 0) { total += qty * price; count++; }
  });
  const el = document.getElementById("inLineSummary");
  if (el) el.textContent = count ? `${count} нэр, нийт дүн: ${fmt(total)}₮` : "";
}

function nyarav_intake_fill() {} // kept for compat
function nyarav_intake_calc() {} // kept for compat

function nyaravResolveMaterialId(prefix, materials) {
  const selectedId = document.getElementById(prefix + "Id")?.value;
  if (selectedId) return Number(selectedId);
  const q = (document.getElementById(prefix + "Search")?.value || "").trim().toLowerCase();
  if (!q) return 0;
  const exact = (materials || []).find(m => String(m.name || "").trim().toLowerCase() === q);
  if (exact) {
    matSearchSelect(prefix, exact.id, exact.name || "", exact.unit_price || 0, exact.unit || "", exact.current_qty || 0);
    return Number(exact.id);
  }
  const starts = (materials || []).filter(m => String(m.name || "").trim().toLowerCase().startsWith(q));
  if (starts.length === 1) {
    const m = starts[0];
    matSearchSelect(prefix, m.id, m.name || "", m.unit_price || 0, m.unit || "", m.current_qty || 0);
    return Number(m.id);
  }
  return 0;
}

function nyaravManualMaterialDraft(prefix) {
  const name = (document.getElementById(prefix + "Search")?.value || "").trim();
  const categoryCode = document.getElementById(prefix + "Category")?.value || "";
  const categorySelect = document.getElementById(prefix + "Category");
  const categoryText = categorySelect?.selectedOptions?.[0]?.textContent || "";
  const categoryName = categoryCode ? categoryText.replace(categoryCode, "").trim() : "";
  return {
    name,
    category_code: categoryCode,
    category_name: categoryName,
    unit: document.getElementById(prefix.replace("iln", "ilnUnitSel"))?.value || "",
    unit_price: Number(document.getElementById(prefix.replace("iln", "ilnPrice"))?.value || 0),
    notes: "Орлогын бүртгэлээс гараар нэмсэн"
  };
}

async function nyaravCreateManualMaterial(prefix) {
  const draft = nyaravManualMaterialDraft(prefix);
  if (!draft.name) return 0;
  const saved = await api("/api/nyarav/materials", {
    method: "POST",
    body: JSON.stringify(draft)
  });
  const material = {
    id: saved.id,
    name: draft.name,
    category_code: draft.category_code,
    category_name: draft.category_name,
    unit: draft.unit,
    unit_price: draft.unit_price,
    current_qty: 0
  };
  _inMats.push(material);
  matSearchSelect(prefix, material.id, material.name, material.unit_price, material.unit, 0);
  return Number(material.id);
}

async function nyarav_intake_save() {
  const date     = document.getElementById("inDate")?.value;
  const rawDoc   = (document.getElementById("inDoc")?.value || "").trim();
  const supplier = document.getElementById("inSupplier")?.value || "";
  const txn_type = document.getElementById("inType")?.value || "INCOME";
  const notes    = document.getElementById("inNotes")?.value || "";
  if (!date) { toast("Огноо оруулна уу"); return; }
  // Shared doc_no for the whole batch — keeps multi-line saves as one document
  const doc_no = rawDoc || `НБ-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

  const rowIds = [];
  document.querySelectorAll("#inLinesBody tr").forEach(tr => {
    const idx = tr.id?.replace("inLine_", "");
    if (idx) rowIds.push(idx);
  });

  const lines = [];
  let badQty = 0;
  let createdMaterials = 0;
  for (const idx of rowIds) {
    const prefix = `iln${idx}`;
    let mat_id = nyaravResolveMaterialId(prefix, _inMats);
    const qty    = parseFloat(document.getElementById(`ilnQty${idx}`)?.value || 0);
    const price  = parseFloat(document.getElementById(`ilnPrice${idx}`)?.value || 0);
    const unit   = document.getElementById(`ilnUnitSel${idx}`)?.value || "";
    const hasAny = mat_id || qty > 0 || price > 0 || (document.getElementById(`iln${idx}Search`)?.value || "").trim();
    if (!hasAny) continue;
    if (!mat_id) {
      if (!unit) { toast("Шинэ материал нэмэх бол хэмжих нэгж сонгоно уу"); return; }
      try {
        mat_id = await nyaravCreateManualMaterial(prefix);
        createdMaterials++;
      } catch(e) {
        toast(e.message || "Шинэ материал үүсгэхэд алдаа гарлаа");
        return;
      }
    }
    if (!mat_id) continue;
    if (!(qty > 0)) { badQty++; continue; }
    lines.push({ material_id: Number(mat_id), qty, unit, unit_price: price });
  }

  if (badQty) { toast("Тоо хэмжээг 0-ээс их оруулна уу"); return; }
  if (!lines.length) { toast("Хамгийн багадаа нэг материал нэмнэ үү"); return; }

  let ok = 0, fail = 0;
  for (const line of lines) {
    try {
      await api("/api/nyarav/income", {
        method: "POST",
        body: JSON.stringify({ ...line, txn_date: date, doc_no, supplier, txn_type, notes })
      });
      ok++;
    } catch (_) { fail++; }
  }
  toast(`✅ ${ok} мөр бүртгэгдлээ${createdMaterials ? ` · ${createdMaterials} шинэ материал` : ""}${fail ? ` (${fail} алдаа)` : ""}`);
  nyarav_intake();
}

// ── Transaction edit / delete helpers ───────────────────────────
async function nyaravTxnDel(id, reloadTab) {
  if (!confirm("Энэ бүртгэлийг устгах уу?")) return;
  try {
    await api(`/api/nyarav/transactions/${id}`, { method: "DELETE" });
    toast("✅ Устгагдлаа");
    if (reloadTab === "income") nyarav_intake();
    else nyarav_issue();
  } catch(e) { toast("❌ " + e.message); }
}

function nyaravTxnEdit(r) {
  const isIncome = ["INCOME","INTERNAL_IN"].includes(r.txn_type);
  const units = ["ширхэг","ш","кг","тн","боодол","хайрцаг","метр","уут","м3","м2","л","ком","багц"];
  const unitOpts = units.map(u => `<option value="${u}" ${r.unit===u?"selected":""}>${u}</option>`).join("");

  const modal = document.createElement("div");
  modal.id = "nyaravEditModal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center";
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:24px;width:480px;max-width:95vw">
      <div style="font-weight:800;font-size:16px;margin-bottom:18px">✏️ Бүртгэл засах — ${escapeHtml(r.txn_no||r.doc_no||"")}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div><label style="font-size:12px;font-weight:600">Огноо</label>
          <input id="etDate" type="date" class="form-control form-control-sm" value="${r.txn_date||""}"></div>
        <div><label style="font-size:12px;font-weight:600">Баримт №</label>
          <input id="etDoc" type="text" class="form-control form-control-sm" value="${escapeHtml(r.doc_no||"")}"></div>
        <div><label style="font-size:12px;font-weight:600">Тоо хэмжээ</label>
          <input id="etQty" type="number" class="form-control form-control-sm" value="${r.qty}" step="any" min="0.001"></div>
        <div><label style="font-size:12px;font-weight:600">Хэмжих нэгж</label>
          <select id="etUnit" class="form-select form-select-sm">
            <option value="">— Нэгж —</option>${unitOpts}
          </select></div>
        <div><label style="font-size:12px;font-weight:600">Нэгж үнэ ₮</label>
          <input id="etPrice" type="number" class="form-control form-control-sm" value="${r.unit_price}" step="any" min="0"></div>
        <div><label style="font-size:12px;font-weight:600">${isIncome?"Нийлүүлэгч":"Хүлээн авагч"}</label>
          <input id="etSupplier" type="text" class="form-control form-control-sm" value="${escapeHtml(r.supplier||"")}"></div>
      </div>
      <div style="margin-bottom:14px"><label style="font-size:12px;font-weight:600">Тайлбар</label>
        <input id="etNotes" type="text" class="form-control form-control-sm" value="${escapeHtml(r.notes||"")}"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline-secondary btn-sm" onclick="document.getElementById('nyaravEditModal').remove()">Цуцлах</button>
        <button class="btn btn-primary btn-sm" onclick="nyaravTxnSaveEdit(${r.id},'${isIncome?"income":"issue"}')">💾 Хадгалах</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
}

async function nyaravTxnSaveEdit(id, reloadTab) {
  try {
    await api(`/api/nyarav/transactions/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        txn_date:   document.getElementById("etDate")?.value,
        doc_no:     document.getElementById("etDoc")?.value,
        qty:        parseFloat(document.getElementById("etQty")?.value || 0),
        unit:       document.getElementById("etUnit")?.value,
        unit_price: parseFloat(document.getElementById("etPrice")?.value || 0),
        supplier:   document.getElementById("etSupplier")?.value,
        notes:      document.getElementById("etNotes")?.value,
      })
    });
    document.getElementById("nyaravEditModal")?.remove();
    toast("✅ Хадгалагдлаа");
    if (reloadTab === "income") nyarav_intake();
    else nyarav_issue();
  } catch(e) { toast("❌ " + e.message); }
}

function nyaravTxnEditById(id, tab) {
  const r = _inRows.find(x => x.id === id) || _exRows.find(x => x.id === id);
  if (r) nyaravTxnEdit(r);
  else toast("Мэдээлэл олдсонгүй");
}

function nyaravIntakeDetail(docNo) {
  const lines = _inRows.filter(r => r.doc_no === docNo || r.txn_no === docNo);
  if (!lines.length) { toast("Мэдээлэл олдсонгүй"); return; }
  const d = lines[0];
  const total = lines.reduce((s, r) => s + Number(r.amount || 0), 0);

  const modal = document.createElement("div");
  modal.id = "nyaravDetailModal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px";
  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:760px;max-width:98vw;max-height:90vh;overflow:auto">
      <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:17px;font-weight:900;color:#0f172a">📥 ${escapeHtml(docNo)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px">${fmtD(d.txn_date)} · ${escapeHtml(d.supplier||"—")} · ${txnBadge(d.txn_type)}</div>
        </div>
        <button onclick="document.getElementById('nyaravDetailModal').remove()"
          style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
      </div>
      <div style="padding:16px 24px">
        <table class="table table-sm table-bordered mb-0">
          <thead class="table-light">
            <tr><th>#</th><th>Материал</th><th>Хэмжих нэгж</th><th class="text-end">Тоо</th><th class="text-end">Нэгж үнэ</th><th class="text-end">Нийт дүн</th>${canWrite()?"<th></th>":""}</tr>
          </thead>
          <tbody>
            ${lines.map((r, i) => `<tr>
              <td class="text-muted small">${i+1}</td>
              <td><strong>${escapeHtml(r.material_name||"")}</strong></td>
              <td class="small">${escapeHtml(r.unit||"—")}</td>
              <td class="text-end"><strong>${fmt(r.qty)}</strong></td>
              <td class="text-end small">${fmt(r.unit_price)}₮</td>
              <td class="text-end fw-bold text-success">${fmt(r.amount)}₮</td>
              ${canWrite()?`<td style="white-space:nowrap">
                <button class="btn btn-outline-primary btn-sm" style="padding:1px 6px;font-size:11px"
                  onclick="document.getElementById('nyaravDetailModal').remove();nyaravTxnEditById(${r.id})">✏️</button>
                <button class="btn btn-outline-danger btn-sm" style="padding:1px 6px;font-size:11px"
                  onclick="nyaravLineDelFromDetail(${r.id},'${escapeHtml(docNo)}')">🗑</button>
              </td>`:""}
            </tr>`).join("")}
          </tbody>
          <tfoot>
            <tr class="table-light">
              <td colspan="${canWrite()?5:5}" class="text-end fw-bold">Нийт дүн:</td>
              <td class="text-end fw-bold text-success">${fmt(total)}₮</td>
              ${canWrite()?"<td></td>":""}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
}

async function nyaravLineDelFromDetail(id, docNo) {
  if (!confirm("Энэ мөрийг устгах уу?")) return;
  try {
    await api(`/api/nyarav/transactions/${id}`, { method: "DELETE" });
    toast("✅ Устгагдлаа");
    document.getElementById("nyaravDetailModal")?.remove();
    await nyarav_intake();
  } catch(e) { toast("❌ " + e.message); }
}

async function nyaravDocDel(docNo, reloadTab) {
  if (!confirm(`"${docNo}" баримтын бүх мөрийг устгах уу?`)) return;
  const pool = reloadTab === "issue" ? _exRows : _inRows;
  const lines = pool.filter(r => r.doc_no === docNo || r.txn_no === docNo);
  let ok = 0;
  for (const r of lines) {
    try { await api(`/api/nyarav/transactions/${r.id}`, { method: "DELETE" }); ok++; } catch(_) {}
  }
  toast(`✅ ${ok} мөр устгагдлаа`);
  if (reloadTab === "income") nyarav_intake();
  else nyarav_issue();
}

// ── 3. Зарлагын бүртгэл (multi-line) ───────────────────────────
let _exMats = [];
let _exExecutions = [];
let _exRows = [];

async function nyarav_issue() {
  main.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;
  const currentMonth = today().slice(0, 7);
  let materials = [], rows = [], docs = [], executions = [], summary = {};
  [materials, rows, docs, executions, summary] = await Promise.all([
    api("/api/nyarav/materials").catch(() => []),
    api("/api/nyarav/expense").catch(() => []),
    api("/api/nyarav/expense-docs").catch(() => []),
    api(`/api/executions?year=${new Date().getFullYear()}`).catch(() => []),
    api(`/api/nyarav/summary?month=${currentMonth}`).catch(() => ({})),
  ]);
  _exMats = materials;
  _exRows = rows;
  _exExecutions = (executions || []).filter(e => (e.status || "") !== "Дууссан");
  const employees = (state.users || []).filter(u => u.active !== 0);

  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <h1 style="margin:0">📤 Зарлагын бүртгэл</h1>
    <button class="btn btn-sm btn-outline-secondary" onclick="nyarav_issue()">↺ Шинэчлэх</button>
  </div>

  <div class="panel mb-3">
    <div style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:1px solid #e2e6ed">
      <div style="font-weight:700;font-size:14px">Сарын орлого, зарлага</div>
      <input id="nyaravSummaryMonth" type="month" class="form-control form-control-sm"
        style="width:160px" value="${currentMonth}" onchange="nyarav_issue_summary_load()">
    </div>
    <div id="nyaravIssueSummary">${nyaravIssueSummaryHtml(summary)}</div>
  </div>

  ${canWrite() ? `
  <div class="panel mb-3">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">+ Шинэ зарлага — Шаардах хуудас</div>
    <div style="padding:14px 16px">
      <div class="row g-2 mb-3">
        <div class="col-md-2">
          <label class="form-label small">Огноо *</label>
          <input id="exDate" type="date" class="form-control form-control-sm" value="${today()}">
        </div>
        <div class="col-md-2">
          <label class="form-label small">Шаардах хуудас №</label>
          <input id="exDoc" type="text" class="form-control form-control-sm" placeholder="ШХ-2026-0001">
        </div>
        <div class="col-md-3">
          <label class="form-label small">Хүлээн авсан ажилтан</label>
          <select id="exReceiver" class="form-select form-select-sm">
            <option value="">— Ажилтан сонгох —</option>
            ${employees.map(u => `<option value="${escapeHtml(u.full_name || "")}">${escapeHtml(u.full_name || "")}${u.position ? " · " + escapeHtml(u.position) : ""}</option>`).join("")}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small">Аль ажил / гүйцэтгэлд ашигласан</label>
          <select id="exWorkCat" class="form-select form-select-sm mb-1" onchange="nyarav_issue_category_pick()">
            <option value="">— Бүх төрөл —</option>
            ${NYARAV_EXEC_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("")}
          </select>
          <select id="exWork" class="form-select form-select-sm" onchange="nyarav_issue_work_pick()">
            <option value="">— Явагдаж буй гүйцэтгэл сонгох —</option>
            ${_exExecutions.map(e => {
              const label = nyaravExecutionLabel(e);
              return `<option value="${escapeHtml(label)}" data-id="${e.id}" data-work-id="${e.work_log_id || ""}">${escapeHtml(label)}</option>`;
            }).join("")}
          </select>
          <div id="exWorkHint" class="small text-muted mt-1">${_exExecutions.length} явагдаж буй гүйцэтгэл</div>
        </div>
        <div class="col-md-2">
          <label class="form-label small">Asset холболт</label>
          <input id="exAsset" type="text" class="form-control form-control-sm" placeholder="Asset код / нэр">
        </div>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-md-4">
          <label class="form-label small">Тайлбар</label>
          <input id="exNotes" type="text" class="form-control form-control-sm" placeholder="...">
        </div>
      </div>

      <!-- Multi-line items -->
      <div style="overflow:auto;margin-bottom:10px">
        <table class="table table-sm table-bordered mb-0" id="exLinesTable">
          <thead class="table-light">
            <tr>
              <th style="min-width:200px">Бүлэг</th>
              <th style="min-width:320px">Материал *</th>
              <th style="min-width:120px">Хэмжих нэгж</th>
              <th style="min-width:80px">Үлдэгдэл</th>
              <th style="min-width:100px">Тоо хэмжээ *</th>
              <th style="min-width:120px">Нэгж үнэ ₮</th>
              <th style="min-width:120px">Нийт дүн ₮</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="exLinesBody"></tbody>
        </table>
      </div>

      <div class="d-flex gap-2 align-items-center mb-3">
        <button class="btn btn-outline-primary btn-sm" onclick="exLineAdd()">+ Мөр нэмэх</button>
        <span id="exLineSummary" class="text-muted small"></span>
      </div>
      <button class="btn btn-danger btn-sm px-4" onclick="nyarav_issue_save()">📤 Бүгдийг хадгалах</button>
    </div>
  </div>` : ""}

  <div class="panel">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">Зарлагын бүртгэл (${docs.length} баримт)</div>
    <div style="overflow:auto">
      <table class="table table-sm table-hover mb-0">
        <thead class="table-light">
          <tr><th>Шаардах №</th><th>Огноо</th><th>Хүлээн авсан</th><th>Материал тоо</th><th class="text-end">Нийт дүн</th><th>Төрөл</th><th>Ажил</th><th>Тайлбар</th><th></th></tr>
        </thead>
        <tbody>
          ${docs.length ? docs.map(d => `<tr style="cursor:pointer" onclick="nyaravIssueDetail('${escapeHtml(d.doc_no)}')">
            <td><code class="small text-danger">${escapeHtml(d.doc_no || "")}</code></td>
            <td class="small text-muted">${fmtD(d.txn_date)}</td>
            <td class="small">${escapeHtml(d.received_by || "—")}</td>
            <td class="small text-center"><span style="background:#fee2e2;color:#b91c1c;padding:2px 10px;border-radius:20px;font-weight:700;font-size:12px">${d.line_count} нэр</span></td>
            <td class="text-end fw-bold text-danger">${fmt(d.total_amount)}₮</td>
            <td>${txnBadge(d.txn_type)}</td>
            <td class="small text-muted">${escapeHtml(d.work_title || d.work_ref || "—")}</td>
            <td class="small text-muted">${escapeHtml(d.notes || "")}</td>
            <td style="white-space:nowrap" onclick="event.stopPropagation()">
              <button class="btn btn-outline-danger btn-sm" style="padding:1px 7px;font-size:11px"
                onclick="nyaravIssueDetail('${escapeHtml(d.doc_no)}')">👁 Дэлгэрэнгүй</button>
              ${canWrite() ? `<button class="btn btn-outline-danger btn-sm" style="padding:1px 7px;font-size:11px"
                onclick="nyaravDocDel('${escapeHtml(d.doc_no)}','issue')">🗑</button>` : ""}
            </td>
          </tr>`).join("") : `<tr><td colspan="9" class="text-center text-muted py-4">Зарлага бүртгэгдээгүй байна</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;

  exLineAdd();
}

function nyaravIssueSummaryHtml(summary = {}) {
  const income = Number(summary.monthIncome?.total || 0);
  const expense = Number(summary.monthExpense?.total || 0);
  const difference = income - expense;
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding:14px 16px">
      <div style="padding:14px;border:1px solid #bbf7d0;border-radius:10px;background:#f0fdf4">
        <div style="font-size:12px;color:#64748b">Орлого</div>
        <div style="font-size:22px;font-weight:900;color:#16a34a;margin-top:4px">${fmt(income)}₮</div>
      </div>
      <div style="padding:14px;border:1px solid #fecaca;border-radius:10px;background:#fef2f2">
        <div style="font-size:12px;color:#64748b">Зарлага</div>
        <div style="font-size:22px;font-weight:900;color:#dc2626;margin-top:4px">${fmt(expense)}₮</div>
      </div>
      <div style="padding:14px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff">
        <div style="font-size:12px;color:#64748b">Зөрүү</div>
        <div style="font-size:22px;font-weight:900;color:${difference >= 0 ? "#2563eb" : "#dc2626"};margin-top:4px">${fmt(difference)}₮</div>
      </div>
    </div>`;
}

async function nyarav_issue_summary_load() {
  const month = document.getElementById("nyaravSummaryMonth")?.value;
  const el = document.getElementById("nyaravIssueSummary");
  if (!month || !el) return;
  el.innerHTML = `<div style="padding:18px;color:#64748b"><div class="spinner-border spinner-border-sm text-primary"></div> Уншиж байна...</div>`;
  try {
    const summary = await api(`/api/nyarav/summary?month=${encodeURIComponent(month)}`);
    el.innerHTML = nyaravIssueSummaryHtml(summary);
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger m-3">${escapeHtml(e.message)}</div>`;
  }
}

function nyaravIssueDetail(docNo) {
  const lines = _exRows.filter(r => r.doc_no === docNo || r.txn_no === docNo);
  if (!lines.length) { toast("Мэдээлэл олдсонгүй"); return; }
  const d = lines[0];
  const total = lines.reduce((s, r) => s + Number(r.amount || 0), 0);

  const modal = document.createElement("div");
  modal.id = "nyaravIssueDetailModal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px";
  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:820px;max-width:98vw;max-height:90vh;overflow:auto">
      <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:17px;font-weight:900;color:#0f172a">📤 ${escapeHtml(docNo)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px">${fmtD(d.txn_date)} · ${escapeHtml(d.received_by||"—")} · ${txnBadge(d.txn_type)}${(d.work_title || d.work_ref) ? ` · <span style="color:#64748b">${escapeHtml(d.work_title || d.work_ref)}</span>` : ""}</div>
        </div>
        <button onclick="document.getElementById('nyaravIssueDetailModal').remove()"
          style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8">✕</button>
      </div>
      <div style="padding:16px 24px">
        <table class="table table-sm table-bordered mb-0">
          <thead class="table-light">
            <tr><th>#</th><th>Материал</th><th>Хэмжих нэгж</th><th class="text-end">Тоо</th><th class="text-end">Нэгж үнэ</th><th class="text-end">Нийт дүн</th>${canWrite()?"<th></th>":""}</tr>
          </thead>
          <tbody>
            ${lines.map((r, i) => `<tr>
              <td class="text-muted small">${i+1}</td>
              <td><strong>${escapeHtml(r.material_name||"")}</strong></td>
              <td class="small">${escapeHtml(r.unit||"—")}</td>
              <td class="text-end"><strong>${fmt(r.qty)}</strong></td>
              <td class="text-end small">${fmt(r.unit_price)}₮</td>
              <td class="text-end fw-bold text-danger">${fmt(r.amount)}₮</td>
              ${canWrite()?`<td style="white-space:nowrap">
                <button class="btn btn-outline-primary btn-sm" style="padding:1px 6px;font-size:11px"
                  onclick="document.getElementById('nyaravIssueDetailModal').remove();nyaravTxnEditById(${r.id},'issue')">✏️</button>
                <button class="btn btn-outline-danger btn-sm" style="padding:1px 6px;font-size:11px"
                  onclick="nyaravIssueLineDelFromDetail(${r.id},'${escapeHtml(docNo)}')">🗑</button>
              </td>`:""}
            </tr>`).join("")}
          </tbody>
          <tfoot>
            <tr class="table-light">
              <td colspan="5" class="text-end fw-bold">Нийт дүн:</td>
              <td class="text-end fw-bold text-danger">${fmt(total)}₮</td>
              ${canWrite()?"<td></td>":""}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
}

async function nyaravIssueLineDelFromDetail(id, docNo) {
  if (!confirm("Энэ мөрийг устгах уу?")) return;
  try {
    await api(`/api/nyarav/transactions/${id}`, { method: "DELETE" });
    toast("✅ Устгагдлаа");
    document.getElementById("nyaravIssueDetailModal")?.remove();
    await nyarav_issue();
  } catch(e) { toast("❌ " + e.message); }
}

function nyaravExecutionLabel(e) {
  return [
    e.category,
    e.work_title,
    e.title,
    e.location ? `@ ${e.location}` : "",
    e.start_date ? `(${fmtD(e.start_date)})` : "",
  ].filter(Boolean).join(" · ");
}

function nyarav_issue_work_pick() {
  const sel = document.getElementById("exWork");
  const opt = sel?.selectedOptions?.[0];
  const id = opt?.dataset?.id;
  const ex = _exExecutions.find(e => String(e.id) === String(id));
  const asset = document.getElementById("exAsset");
  if (asset && ex?.location && !asset.value) asset.value = ex.location;
  const notes = document.getElementById("exNotes");
  if (notes && ex && !notes.value) {
    const bits = [];
    if (ex.workers) bits.push(`Гүйцэтгэгч: ${ex.workers}`);
    if (ex.progress != null) bits.push(`Явц: ${ex.progress}%`);
    notes.value = bits.join(" · ");
  }
}

function nyarav_issue_category_pick() {
  const cat = document.getElementById("exWorkCat")?.value || "";
  const workSel = document.getElementById("exWork");
  if (!workSel) return;
  const rows = _exExecutions.filter(e => !cat || nyaravExecutionCategory(e) === cat);
  workSel.innerHTML = `<option value="">— Явагдаж буй гүйцэтгэл сонгох —</option>` + rows.map(e => {
    const label = nyaravExecutionLabel(e);
    return `<option value="${escapeHtml(label)}" data-id="${e.id}" data-work-id="${e.work_log_id || ""}">${escapeHtml(label)}</option>`;
  }).join("");
  const hint = document.getElementById("exWorkHint");
  if (hint) hint.textContent = `${rows.length} явагдаж буй гүйцэтгэл`;
  const asset = document.getElementById("exAsset");
  if (asset) asset.value = "";
}

function nyaravExecutionCategory(e) {
  const text = [e.category, e.work_title, e.title].join(" ").toLowerCase();
  if (/гэрэлт|гэрэл|гудамж/.test(text)) return "Гэрэлтүүлэг";
  if (/камер/.test(text)) return "Камер";
  if (/техник|засвар/.test(text)) return "Техник";
  if (/машин|тээвэр/.test(text)) return "Машин";
  if (/авто|гараж/.test(text)) return "Авто гараж";
  if (/аж ахуй|хашаа|байр|барилга/.test(text)) return "Аж ахуй";
  if (/захиргаа|office|erp/.test(text)) return "Захиргаа";
  return "Бусад";
}

let _exLineSeq = 0;
function exLineAdd() {
  const idx = _exLineSeq++;
  const body = document.getElementById("exLinesBody");
  if (!body) return;
  const tr = document.createElement("tr");
  tr.id = `exLine_${idx}`;
  tr.innerHTML = `
    <td style="padding:4px 6px">
      ${matCategorySelectHtml("eln" + idx, _exMats)}
    </td>
    <td style="padding:4px 6px">
      ${matSearchHtml("eln" + idx, _exMats)}
    </td>
    <td style="padding:4px 6px">
      ${unitSelectHtml(`elnUnitSel${idx}`)}
    </td>
    <td style="padding:4px 6px">
      <span id="elnBalance${idx}" class="small fw-bold text-muted">—</span>
    </td>
    <td style="padding:4px 6px">
      <div class="d-flex align-items-center gap-1">
        <input type="number" id="elnQty${idx}" class="form-control form-control-sm"
          placeholder="0" min="0.001" step="any" style="width:80px"
          oninput="exLineCalc(${idx})">
        <span id="elnUnit${idx}" class="text-muted small" style="white-space:nowrap"></span>
      </div>
    </td>
    <td style="padding:4px 6px">
      <input type="number" id="elnPrice${idx}" class="form-control form-control-sm"
        placeholder="0" step="any" oninput="exLineCalc(${idx})">
    </td>
    <td style="padding:4px 6px">
      <input type="text" id="elnTotal${idx}" class="form-control form-control-sm"
        readonly style="background:#f8fafc;width:110px">
    </td>
    <td style="padding:4px 6px;text-align:center">
      <button class="btn btn-outline-danger btn-sm" style="padding:2px 6px;font-size:11px"
        onclick="exLineRemove(${idx})">✕</button>
    </td>`;
  body.appendChild(tr);
  window[`eln${idx}Fill`] = () => {
    const matId   = document.getElementById(`eln${idx}Id`)?.value;
    const mat     = _exMats.find(m => String(m.id) === String(matId));
    const priceEl = document.getElementById(`elnPrice${idx}`);
    const unitEl  = document.getElementById(`elnUnit${idx}`);
    const unitSel = document.getElementById(`elnUnitSel${idx}`);
    const balEl   = document.getElementById(`elnBalance${idx}`);
    if (mat) {
      if (priceEl && !priceEl.value) priceEl.value = mat.unit_price || "";
      if (unitSel && mat.unit) {
        if (!NYARAV_UNITS.includes(mat.unit)) unitSel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(mat.unit)}">${escapeHtml(mat.unit)}</option>`);
        unitSel.value = mat.unit;
      }
      if (unitEl)  unitEl.textContent  = unitSel?.value || mat.unit || "";
      if (balEl)   balEl.textContent   = fmt(mat.current_qty) + " " + (mat.unit || "");
      balEl.style.color = (mat.current_qty <= 0) ? "#dc2626" : "#16a34a";
    }
    exLineCalc(idx);
  };
}

function exLineRemove(idx) {
  document.getElementById(`exLine_${idx}`)?.remove();
  exLineSummary();
}

function exLineCalc(idx) {
  const qty   = parseFloat(document.getElementById(`elnQty${idx}`)?.value || 0);
  const price = parseFloat(document.getElementById(`elnPrice${idx}`)?.value || 0);
  const tot   = document.getElementById(`elnTotal${idx}`);
  if (tot) tot.value = fmt(qty * price) + "₮";
  exLineSummary();
}

function exLineSummary() {
  let total = 0, count = 0;
  document.querySelectorAll("#exLinesBody tr").forEach(tr => {
    const idx = tr.id?.replace("exLine_", "");
    if (!idx) return;
    const qty   = parseFloat(document.getElementById(`elnQty${idx}`)?.value || 0);
    const price = parseFloat(document.getElementById(`elnPrice${idx}`)?.value || 0);
    if (qty > 0) { total += qty * price; count++; }
  });
  const el = document.getElementById("exLineSummary");
  if (el) el.textContent = count ? `${count} нэр, нийт дүн: ${fmt(total)}₮` : "";
}

function nyarav_issue_fill() {} // kept for compat
function nyarav_issue_calc()  {} // kept for compat

async function nyarav_issue_save() {
  const date      = document.getElementById("exDate")?.value;
  const rawDoc    = (document.getElementById("exDoc")?.value || "").trim();
  const received  = document.getElementById("exReceiver")?.value || "";
  const workSel   = document.getElementById("exWork");
  const work_ref  = workSel?.value || "";
  const work_log_id = Number(workSel?.selectedOptions?.[0]?.dataset?.workId || 0) || null;
  const asset_ref = document.getElementById("exAsset")?.value || "";
  const notes     = document.getElementById("exNotes")?.value || "";
  if (!date) { toast("Огноо оруулна уу"); return; }
  // Shared batch doc_no so all lines appear as one document
  const doc_no = rawDoc || `ШХ-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

  const lines = [];
  document.querySelectorAll("#exLinesBody tr").forEach(tr => {
    const idx = tr.id?.replace("exLine_", "");
    if (!idx) return;
    const mat_id = document.getElementById(`eln${idx}Id`)?.value;
    const qty    = parseFloat(document.getElementById(`elnQty${idx}`)?.value || 0);
    const price  = parseFloat(document.getElementById(`elnPrice${idx}`)?.value || 0);
    const unit   = document.getElementById(`elnUnitSel${idx}`)?.value || "";
    if (mat_id && qty > 0) lines.push({ material_id: Number(mat_id), qty, unit, unit_price: price });
  });

  if (!lines.length) { toast("Хамгийн багадаа нэг материал нэмнэ үү"); return; }

  let ok = 0, fail = 0, lastErr = "";
  for (const line of lines) {
    try {
      await api("/api/nyarav/expense", {
        method: "POST",
        body: JSON.stringify({ ...line, txn_date: date, doc_no, received_by: received, work_ref, work_log_id, asset_ref, notes })
      });
      ok++;
    } catch (e) { fail++; lastErr = e.message; }
  }
  if (fail) toast(`⚠️ ${ok} бүртгэгдлээ, ${fail} алдаа: ${lastErr}`);
  else toast(`✅ ${ok} зарлага бүртгэгдлээ`);
  nyarav_issue();
}

// ── 4. Үлдэгдлийн самбар (БМ журналын үлдэгдлийн тайлан) ────────
async function nyarav_stock() {
  main.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;
  let rows = [], cats = [];
  try {
    [rows, cats] = await Promise.all([
      api("/api/nyarav/balance"),
      api("/api/nyarav/categories")
    ]);
  } catch (_) {}

  const totalVal = rows.reduce((s, r) => s + (r.current_qty * r.unit_price), 0);

  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <div>
      <h1 style="margin:0 0 2px">🔢 Үлдэгдлийн самбар</h1>
      <div style="font-size:12px;color:#667085">Нийт ${rows.length} нэр төрлийн материал · Нийт дүн: ${fmt(totalVal)}₮</div>
    </div>
    <div class="d-flex gap-2 align-items-center">
      <select id="catFilter" class="form-select form-select-sm" style="width:220px" onchange="nyarav_stock_filter()">
        <option value="">— Бүлэг бүгд —</option>
        ${cats.map(c => `<option value="${escapeHtml(c.category_code)}">${escapeHtml(c.category_code)} — ${escapeHtml(c.category_name)}</option>`).join("")}
      </select>
      <input id="stockSearch" type="text" class="form-control form-control-sm" placeholder="🔍 Хайх..." style="width:180px" oninput="nyarav_stock_filter()">
      <label class="form-check-label small d-flex align-items-center gap-1">
        <input type="checkbox" id="lowOnly" class="form-check-input" onchange="nyarav_stock_filter()">
        Бага үлдэгдэл
      </label>
      <button class="btn btn-sm btn-outline-secondary" onclick="nyarav_stock()">↺</button>
      ${canWrite() ? `<button class="btn btn-sm btn-danger" onclick="nyarav_delete_all()">🗑 Бүгдийг устгах</button>` : ""}
    </div>
  </div>

  <div class="panel">
    <div style="overflow:auto;max-height:calc(100vh - 220px)">
      <table class="table table-sm table-hover mb-0" id="stockTable">
        <thead class="table-light" style="position:sticky;top:0">
          <tr>
            <th>Бүлэг</th>
            <th>Материал</th>
            <th>Нэгж</th>
            <th class="text-end">Эхний үлдэгдэл</th>
            <th class="text-end">Нийт орлого</th>
            <th class="text-end">Нийт зарлага</th>
            <th class="text-end">Одоогийн үлдэгдэл</th>
            <th class="text-end">Нэгж үнэ</th>
            <th class="text-end">Нийт дүн</th>
            <th>Төлөв</th>
            ${canWrite() ? `<th></th>` : ""}
          </tr>
        </thead>
        <tbody id="stockBody">
          ${renderStockRows(rows)}
        </tbody>
        <tfoot class="table-secondary fw-bold">
          <tr>
            <td colspan="8" class="text-end">НИЙТ ДҮН:</td>
            <td class="text-end">${fmt(totalVal)}₮</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>`;

  window._stockRows = rows;
  window._stockCanWrite = canWrite();
}

function renderStockRows(rows) {
  const cw = window._stockCanWrite;
  const cols = cw ? 11 : 10;
  if (!rows.length) return `<tr><td colspan="${cols}" class="text-center text-muted py-4">Материал бүртгэгдээгүй</td></tr>`;
  return rows.map(r => {
    const qty  = Number(r.current_qty || 0);
    const isLow = r.min_qty > 0 && qty <= r.min_qty;
    const val  = qty * (r.unit_price || 0);
    const safeName = escapeHtml(r.name).replace(/'/g, "\\'");
    return `<tr data-cat="${escapeHtml(r.category_code || "")}" data-name="${escapeHtml(r.name || "").toLowerCase()}" data-low="${isLow ? 1 : 0}" style="${isLow ? "background:#fff5f5" : ""}">
      <td class="small text-muted">${escapeHtml(r.category_code || "")} <span class="d-none d-lg-inline">${escapeHtml(r.category_name || "")}</span></td>
      <td class="small fw-semibold">${escapeHtml(r.name)}</td>
      <td class="small">${escapeHtml(r.unit || "")}</td>
      <td class="text-end small">${fmt(r.opening_qty)}</td>
      <td class="text-end small text-success">${fmt(r.total_income_qty)}</td>
      <td class="text-end small text-danger">${fmt(r.total_expense_qty)}</td>
      <td class="text-end fw-bold ${isLow ? "text-danger" : ""}">${fmt(qty)}</td>
      <td class="text-end small">${fmt(r.unit_price)}₮</td>
      <td class="text-end small">${fmt(val)}₮</td>
      <td>${isLow
        ? `<span class="badge bg-danger">Бага</span>`
        : `<span class="badge bg-success" style="font-size:10px">Хэвийн</span>`}
      </td>
      ${cw ? `<td><button class="btn btn-sm" style="color:#dc2626;padding:2px 6px;font-size:12px" onclick="nyarav_delete_mat(${r.id},'${safeName}')">🗑</button></td>` : ""}
    </tr>`;
  }).join("");
}

async function nyarav_delete_all() {
  if (!confirm("⚠️ АНХААР!\n\nБүх материал болон гүйлгээний бүртгэлийг устгах гэж байна.\nЭнэ үйлдлийг буцааж болохгүй!\n\nҮргэлжлүүлэх үү?")) return;
  if (!confirm("Та итгэлтэй байна уу? Бүх өгөгдөл устна.")) return;
  try {
    await api("/api/nyarav/materials/all", { method: "DELETE" });
    toast("✅ Бүх материал болон гүйлгээ устгагдлаа");
    nyarav_stock();
  } catch(e) { toast("⚠️ " + e.message); }
}

async function nyarav_delete_mat(id, name) {
  if (!confirm(`"${name}" материалыг устгах уу?\n\nАнхааруулга: Гүйлгээтэй материалыг устгах боломжгүй.`)) return;
  try {
    await api(`/api/nyarav/materials/${id}`, { method: "DELETE" });
    toast("Материал устгагдлаа");
    nyarav_stock();
  } catch(e) { toast("⚠️ " + e.message); }
}

function nyarav_stock_filter() {
  const cat  = document.getElementById("catFilter")?.value || "";
  const q    = (document.getElementById("stockSearch")?.value || "").toLowerCase();
  const low  = document.getElementById("lowOnly")?.checked;
  const rows = window._stockRows || [];
  const filtered = rows.filter(r => {
    if (cat && r.category_code !== cat) return false;
    if (q   && !r.name.toLowerCase().includes(q)) return false;
    if (low && !(r.min_qty > 0 && r.current_qty <= r.min_qty)) return false;
    return true;
  });
  const body = document.getElementById("stockBody");
  if (body) body.innerHTML = renderStockRows(filtered);
}

// ── 5. Захиалга (material orders — kept simple) ──────────────────
async function nyarav_order() {
  main.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;
  let rows = [], mats = [];
  try {
    [rows, mats] = await Promise.all([
      api("/api/nyarav/orders").catch(() => []),
      api("/api/nyarav/materials")
    ]);
  } catch (_) {}

  const matOpts = mats.map(m =>
    `<option value="${escapeHtml(m.name)}" data-unit="${escapeHtml(m.unit || "")}">${escapeHtml(m.name)}</option>`
  ).join("");

  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <h1 style="margin:0">📝 Материалын захиалга</h1>
    <button class="btn btn-sm btn-outline-secondary" onclick="nyarav_order()">↺</button>
  </div>

  ${canWrite() ? `
  <div class="panel mb-3">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">+ Шинэ захиалга</div>
    <div style="padding:16px">
      <div class="row g-2 mb-2">
        <div class="col-md-4">
          <label class="form-label small">Материалын нэр *</label>
          <input id="orMat" class="form-control form-control-sm" list="matList" placeholder="Материал хайх...">
          <datalist id="matList">${matOpts}</datalist>
        </div>
        <div class="col-md-2">
          <label class="form-label small">Огноо *</label>
          <input id="orDate" type="date" class="form-control form-control-sm" value="${today()}">
        </div>
        <div class="col-md-1">
          <label class="form-label small">Тоо *</label>
          <input id="orQty" type="number" class="form-control form-control-sm" placeholder="0">
        </div>
        <div class="col-md-2">
          <label class="form-label small">Нэгж</label>
          <input id="orUnit" type="text" class="form-control form-control-sm" placeholder="ш/кг/м...">
        </div>
        <div class="col-md-2">
          <label class="form-label small">Хүссэн</label>
          <input id="orReq" type="text" class="form-control form-control-sm" placeholder="Овог нэр">
        </div>
      </div>
      <div class="row g-2 mb-2">
        <div class="col-md-3">
          <label class="form-label small">Зориулалт</label>
          <input id="orPurpose" type="text" class="form-control form-control-sm" placeholder="Ямар зорилгоор">
        </div>
        <div class="col-md-2">
          <label class="form-label small">Тооцоолсон үнэ ₮</label>
          <input id="orPrice" type="number" class="form-control form-control-sm" placeholder="0">
        </div>
        <div class="col-md-4">
          <label class="form-label small">Тайлбар</label>
          <input id="orNote" type="text" class="form-control form-control-sm" placeholder="...">
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="nyarav_order_save()">Захиалга илгээх</button>
    </div>
  </div>` : ""}

  <div class="panel">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">Захиалгын жагсаалт</div>
    <div style="overflow:auto">
      <table class="table table-sm table-hover mb-0">
        <thead class="table-light">
          <tr><th>Огноо</th><th>Материал</th><th>Тоо</th><th>Зориулалт</th><th>Хүссэн</th><th>Төлөв</th><th></th></tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(r => {
            const stColor = r.status === "Батлагдсан" ? "success" : r.status === "Цуцлагдсан" ? "secondary" : "warning";
            return `<tr>
              <td class="small">${fmtD(r.order_date)}</td>
              <td class="small">${escapeHtml(r.item_name)}</td>
              <td class="small">${fmt(r.qty)} ${escapeHtml(r.unit || "")}</td>
              <td class="small">${escapeHtml(r.purpose || "—")}</td>
              <td class="small">${escapeHtml(r.requested_by || "—")}</td>
              <td><span class="badge bg-${stColor}">${escapeHtml(r.status)}</span></td>
              <td>
                ${canWrite() && r.status === "Хүлээгдэж буй" ? `
                  <button class="btn btn-xs btn-outline-success" onclick="nyarav_order_approve(${r.id},'Батлагдсан')">✓</button>
                  <button class="btn btn-xs btn-outline-secondary" onclick="nyarav_order_approve(${r.id},'Цуцлагдсан')">✗</button>
                ` : ""}
              </td>
            </tr>`;
          }).join("") : `<tr><td colspan="7" class="text-center text-muted py-4">Захиалга байхгүй</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

async function nyarav_order_save() {
  const name = document.getElementById("orMat")?.value?.trim();
  const qty  = document.getElementById("orQty")?.value;
  const date = document.getElementById("orDate")?.value;
  if (!name) { toast("Материалын нэр оруулна уу"); return; }
  if (!qty || Number(qty) <= 0) { toast("Тоо хэмжээ оруулна уу"); return; }
  try {
    await api("/api/nyarav/orders", {
      method: "POST",
      body: JSON.stringify({
        item_name:       name,
        qty:             Number(qty),
        unit:            document.getElementById("orUnit")?.value || "",
        order_date:      date,
        purpose:         document.getElementById("orPurpose")?.value || "",
        estimated_price: Number(document.getElementById("orPrice")?.value || 0),
        requested_by:    document.getElementById("orReq")?.value || "",
        note:            document.getElementById("orNote")?.value || ""
      })
    });
    toast("✅ Захиалга илгээгдлээ");
    nyarav_order();
  } catch (e) { toast("⚠️ " + e.message); }
}

async function nyarav_order_approve(id, status) {
  try {
    await api(`/api/nyarav/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
    toast(status === "Батлагдсан" ? "✅ Батлагдлаа" : "Цуцлагдлаа");
    nyarav_order();
  } catch (e) { toast("⚠️ " + e.message); }
}

// ── 6. Тайлан ───────────────────────────────────────────────────
// ── 6. Ажлын төлөвлөгөө / To-do ────────────────────────────────
let _nyaravTodoRows = [];
let _nyaravTodoMonth = today().slice(0, 7);

const TODO_ASSIGN_ROLES_FE = ["director", "chief_engineer", "hr", "safety"];
const TODO_STATUS_LABELS = { todo: "Хийх", doing: "Явцтай", done: "Дууссан", postponed: "Хойшилсон" };
const TODO_PRIORITY_LABELS = { low: "Бага", normal: "Энгийн", high: "Чухал", urgent: "Яаралтай" };

function nyaravTodoCanAssign() {
  return TODO_ASSIGN_ROLES_FE.includes(state.me?.role);
}

function nyaravTodoUserOptions(selected) {
  return (state.users || []).map(u => `
    <option value="${u.id}" ${String(selected) === String(u.id) ? "selected" : ""}>
      ${escapeHtml(u.full_name || "")}${u.position ? " · " + escapeHtml(u.position) : ""}
    </option>`).join("");
}

function nyaravTodoYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nyaravTodoMonthDays(month) {
  const [y, m] = String(month).split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => nyaravTodoYmd(new Date(y, m - 1, i + 1)));
}

function nyaravTodoDateLabel(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const weekdays = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} · ${weekdays[d.getDay()]}`;
}

function nyaravTodoMonthLabel(month) {
  const [y, m] = String(month).split("-");
  return `${y} оны ${Number(m)}-р сар`;
}

function nyaravTodoStats(rows) {
  return {
    total: rows.length,
    done: rows.filter(r => r.status === "done").length,
    doing: rows.filter(r => r.status === "doing").length,
    late: rows.filter(r => r.status !== "done" && (r.due_date || r.work_date) < today()).length,
  };
}

function nyaravTodoCard(r) {
  const checked = r.status === "done" ? "checked" : "";
  const late = r.status !== "done" && (r.due_date || r.work_date) < today();
  return `
    <div class="todo-item priority-${escapeHtml(r.priority || "normal")} status-${escapeHtml(r.status || "todo")} ${late ? "is-late" : ""}">
      <label class="todo-check">
        <input type="checkbox" ${checked} onchange="nyarav_todo_status(${r.id}, this.checked ? 'done' : 'todo')">
        <span></span>
      </label>
      <div class="todo-main">
        <div class="todo-title">${escapeHtml(r.title)}</div>
        ${r.note ? `<div class="todo-desc">${escapeHtml(r.note)}</div>` : ""}
        <div class="todo-meta">
          <span class="todo-pill status-${escapeHtml(r.status || "todo")}">${TODO_STATUS_LABELS[r.status] || r.status}</span>
          <span class="todo-pill priority-${escapeHtml(r.priority || "normal")}">${TODO_PRIORITY_LABELS[r.priority] || r.priority}</span>
          ${r.assigned_by_name ? `<span>${escapeHtml(r.assigned_by_name)} оноосон</span>` : `<span>Өөрийн төлөвлөгөө</span>`}
          ${r.note_count ? `<span>${r.note_count} note</span>` : ""}
        </div>
      </div>
      <div class="todo-actions">
        <select onchange="nyarav_todo_status(${r.id}, this.value)" title="Төлөв">
          ${Object.entries(TODO_STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${r.status === k ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <button class="todo-icon-btn" onclick="nyarav_todo_note(${r.id})" title="Тэмдэглэл">✎</button>
      </div>
    </div>`;
}

function nyaravTodoRender(rows) {
  _nyaravTodoRows = rows || [];
  const stats = nyaravTodoStats(_nyaravTodoRows);
  const days = nyaravTodoMonthDays(_nyaravTodoMonth);
  const byDay = {};
  for (const d of days) byDay[d] = [];
  for (const r of _nyaravTodoRows) {
    const key = (r.work_date || "").slice(0, 10);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(r);
  }
  const selectedUserId = document.getElementById("todoAssigneeFilter")?.value || state.me?.id;
  const selectedUser = selectedUserId === "all"
    ? { full_name: "Бүх ажилтан", position: "Сарын нэгдсэн төлөвлөгөө" }
    : ((state.users || []).find(u => String(u.id) === String(selectedUserId)) || state.me || {});
  const list = document.getElementById("nyaravTodoList");
  if (list) {
    list.innerHTML = days.map(d => `
      <section class="todo-day ${d === today() ? "is-today" : ""}">
        <div class="todo-day-head">
          <strong>${nyaravTodoDateLabel(d)}</strong>
          <span>${(byDay[d] || []).length} ажил</span>
          <button class="todo-add-day" onclick="nyarav_todo_open('${d}')" title="Энэ өдөр төлөвлөгөө нэмэх">+</button>
        </div>
        <div class="todo-day-list">
          ${(byDay[d] || []).length ? byDay[d].map(nyaravTodoCard).join("") : `<div class="todo-empty">Төлөвлөсөн ажил алга</div>`}
        </div>
      </section>`).join("");
  }
  const summary = document.getElementById("nyaravTodoSummary");
  if (summary) {
    summary.innerHTML = `
      <div class="todo-person">
        <div class="todo-avatar">${escapeHtml((selectedUser.full_name || "?").slice(0, 1))}</div>
        <div>
          <h2>${escapeHtml(selectedUser.full_name || "Миний төлөвлөгөө")}</h2>
          <p>${escapeHtml(selectedUser.position || selectedUser.role || "")} · ${nyaravTodoMonthLabel(_nyaravTodoMonth)}</p>
        </div>
      </div>
      <div class="todo-stat-row">
        <div><b>${stats.total}</b><span>Нийт</span></div>
        <div><b>${stats.done}</b><span>Дууссан</span></div>
        <div><b>${stats.doing}</b><span>Явцтай</span></div>
        <div><b>${stats.late}</b><span>Хэтэрсэн</span></div>
      </div>`;
  }
}

async function nyarav_plan() {
  const canAssign = nyaravTodoCanAssign();
  main.innerHTML = `
    <div class="todo-page">
      <div class="todo-hero">
        <div id="nyaravTodoSummary"></div>
        <div class="todo-toolbar">
          <div class="todo-view-switch">
            <button class="active" type="button">Сар</button>
            <button type="button" title="Дараагийн хувилбарт">7 хоног</button>
            <button type="button" title="Дараагийн хувилбарт">Жил</button>
          </div>
          <input id="todoMonth" type="month" value="${_nyaravTodoMonth}" onchange="nyarav_plan_load()">
          ${canAssign ? `<select id="todoAssigneeFilter" onchange="nyarav_plan_load()">
            <option value="${state.me?.id || ""}">Миний ажил</option>
            <option value="all">Бүх ажилтан</option>
            ${nyaravTodoUserOptions(state.me?.id)}
          </select>` : ""}
          <button class="btn secondary sm" onclick="nyarav_plan_load()">Шинэчлэх</button>
          <button class="btn sm" onclick="nyarav_todo_print()">Хэвлэх</button>
        </div>
      </div>

      <div class="todo-layout">
        <main class="todo-calendar">
          <div class="todo-section-title">
            <span>${nyaravTodoMonthLabel(_nyaravTodoMonth)}</span>
            <small>Өдөр бүрийн card дээрх + товчоор төлөвлөгөө нэмнэ</small>
          </div>
          <div id="nyaravTodoList" class="todo-days"></div>
        </main>
      </div>
    </div>`;
  await nyarav_plan_load();
}

async function nyarav_plan_load() {
  _nyaravTodoMonth = document.getElementById("todoMonth")?.value || _nyaravTodoMonth || today().slice(0, 7);
  const assigned = document.getElementById("todoAssigneeFilter")?.value || state.me?.id || "";
  const qs = new URLSearchParams({ month: _nyaravTodoMonth, module: "personal" });
  if (assigned) qs.set("assigned_to", assigned);
  const list = document.getElementById("nyaravTodoList");
  if (list) list.innerHTML = `<div class="todo-loading">Уншиж байна...</div>`;
  try {
    const rows = await api(`/api/nyarav/todos?${qs.toString()}`);
    nyaravTodoRender(rows);
  } catch(e) {
    if (list) list.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

function nyarav_todo_open(workDate = today()) {
  const canAssign = nyaravTodoCanAssign();
  document.querySelector(".todo-modal")?.remove();
  const modal = document.createElement("div");
  modal.className = "todo-modal";
  modal.innerHTML = `
    <div class="todo-add-card">
      <button class="todo-modal-close" onclick="this.closest('.todo-modal').remove()">×</button>
      <div class="todo-add-head">
        <div>
          <h3>Төлөвлөгөө нэмэх</h3>
          <p>${nyaravTodoDateLabel(workDate)}</p>
        </div>
        <span>Checklist</span>
      </div>
      <label>Ажил</label>
      <input id="todoTitle" class="input" placeholder="Жишээ: сарын удирдлага шалгах" autofocus>
      <div class="todo-add-grid">
        <div>
          <label>Огноо</label>
          <input id="todoDate" class="input" type="date" value="${workDate}">
        </div>
        <div>
          <label>Ач холбогдол</label>
          <select id="todoPriority">
            <option value="normal">Энгийн</option>
            <option value="high">Чухал</option>
            <option value="urgent">Яаралтай</option>
            <option value="low">Бага</option>
          </select>
        </div>
      </div>
      <label>Хэнд</label>
      <select id="todoAssignedTo" ${canAssign ? "" : "disabled"}>${nyaravTodoUserOptions(state.me?.id)}</select>
      <label>Тайлбар</label>
      <textarea id="todoNote" placeholder="Анхны тэмдэглэл, сануулах зүйл..."></textarea>
      <div class="todo-add-actions">
        <button class="btn secondary" onclick="document.querySelector('.todo-modal')?.remove()">Болих</button>
        <button class="btn" onclick="nyarav_todo_save()">Ажил нэмэх</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => document.getElementById("todoTitle")?.focus(), 30);
}

async function nyarav_todo_save() {
  const title = document.getElementById("todoTitle")?.value.trim();
  if (!title) { toast("Ажлын гарчиг оруулна уу"); return; }
  const workDate = document.getElementById("todoDate")?.value || today();
  try {
    await api("/api/nyarav/todos", {
      method: "POST",
      body: JSON.stringify({
        module: "personal",
        title,
        work_date: workDate,
        due_date: workDate,
        assigned_to: document.getElementById("todoAssignedTo")?.value || state.me?.id,
        priority: document.getElementById("todoPriority")?.value || "normal",
        note: document.getElementById("todoNote")?.value || "",
      })
    });
    toast("Ажил нэмэгдлээ");
    document.querySelector(".todo-modal")?.remove();
    await nyarav_plan_load();
  } catch(e) { toast("⚠ " + e.message); }
}

async function nyarav_todo_status(id, status) {
  const r = _nyaravTodoRows.find(x => Number(x.id) === Number(id));
  if (!r) return;
  try {
    await api(`/api/nyarav/todos/${id}`, { method: "PUT", body: JSON.stringify({ ...r, status }) });
    await nyarav_plan_load();
  } catch(e) { toast("⚠ " + e.message); }
}

async function nyarav_todo_note(id) {
  const r = _nyaravTodoRows.find(x => Number(x.id) === Number(id));
  if (!r) return;
  const modal = document.createElement("div");
  modal.className = "todo-modal";
  modal.innerHTML = `
    <div class="todo-note-card">
      <button class="todo-modal-close" onclick="this.closest('.todo-modal').remove()">×</button>
      <h3>${escapeHtml(r.title)}</h3>
      <p>${escapeHtml(r.assigned_name || "")} · ${fmtD(r.work_date)}</p>
      <textarea id="todoNewNote" placeholder="Энэ ажил дээр тэмдэглэл нэмэх..."></textarea>
      <div class="todo-note-actions"><button class="btn sm" onclick="nyarav_todo_add_note(${id})">Note хадгалах</button></div>
      <div id="todoNoteHistory" class="todo-note-history">Уншиж байна...</div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  try {
    const notes = await api(`/api/nyarav/todos/${id}/notes`);
    const hist = document.getElementById("todoNoteHistory");
    if (hist) hist.innerHTML = notes.length ? notes.map(n => `
      <div class="todo-note">
        <b>${escapeHtml(n.user_name || "")}</b>
        <span>${fmtD(n.created_at)}</span>
        <div>${escapeHtml(n.note)}</div>
      </div>`).join("") : `<div class="todo-empty">Одоогоор note алга</div>`;
  } catch(e) {
    const hist = document.getElementById("todoNoteHistory");
    if (hist) hist.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

async function nyarav_todo_add_note(id) {
  const note = document.getElementById("todoNewNote")?.value.trim();
  if (!note) { toast("Тэмдэглэл бичнэ үү"); return; }
  try {
    await api(`/api/nyarav/todos/${id}/notes`, { method: "POST", body: JSON.stringify({ note }) });
    toast("Note хадгалагдлаа");
    document.querySelector(".todo-modal")?.remove();
    await nyarav_plan_load();
  } catch(e) { toast("⚠ " + e.message); }
}

function nyarav_todo_print() {
  window.print();
}

async function nyarav_report() {
  const now = new Date();
  main.innerHTML = `
  <div class="nyarav-report-page">
  <div class="nyarav-report-title" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <h1 style="margin:0">📊 Нярав тайлан</h1>
  </div>

  <div class="panel mb-3 nyarav-report-card">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">БМ журналын сарын тайлан</div>
    <div style="padding:14px 16px" class="nyarav-report-filters nyarav-report-filters-month">
      <div class="nyarav-field">
        <label class="form-label small">Он</label>
        <input id="rpYear" type="number" class="form-control form-control-sm" value="${now.getFullYear()}">
      </div>
      <div class="nyarav-field">
        <label class="form-label small">Сар</label>
        <select id="rpMonth" class="form-select form-select-sm">
          ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===now.getMonth()+1?"selected":""}>${i+1}-р сар</option>`).join("")}
        </select>
      </div>
      <button class="btn btn-primary btn-sm nyarav-report-action" onclick="nyarav_report_monthly()">Тайлан харах</button>
    </div>
    <div id="monthlyReport"></div>
  </div>

  <div class="panel mb-3 nyarav-report-card">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">Ажилтнаар — хэн юу авсан</div>
    <div style="padding:14px 16px" class="nyarav-report-filters">
      <div class="nyarav-field">
        <label class="form-label small">Эхлэх огноо</label>
        <input id="wrFrom" type="date" class="form-control form-control-sm" value="${now.getFullYear()}-01-01">
      </div>
      <div class="nyarav-field">
        <label class="form-label small">Дуусах огноо</label>
        <input id="wrTo" type="date" class="form-control form-control-sm" value="${today()}">
      </div>
      <button class="btn btn-primary btn-sm nyarav-report-action" onclick="nyarav_report_worker()">Харах</button>
    </div>
    <div id="workerReport"></div>
  </div>

  <div class="panel nyarav-report-card">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">Ажлаар — аль ажилд юу зарцуулсан</div>
    <div style="padding:14px 16px" class="nyarav-report-filters">
      <div class="nyarav-field">
        <label class="form-label small">Эхлэх огноо</label>
        <input id="wkFrom" type="date" class="form-control form-control-sm" value="${now.getFullYear()}-01-01">
      </div>
      <div class="nyarav-field">
        <label class="form-label small">Дуусах огноо</label>
        <input id="wkTo" type="date" class="form-control form-control-sm" value="${today()}">
      </div>
      <button class="btn btn-primary btn-sm nyarav-report-action" onclick="nyarav_report_work()">Харах</button>
    </div>
    <div id="workReport"></div>
  </div>
  </div>`;
}

async function nyarav_report_monthly() {
  const year  = document.getElementById("rpYear")?.value;
  const month = document.getElementById("rpMonth")?.value;
  const el    = document.getElementById("monthlyReport");
  if (!el) return;
  el.innerHTML = `<div style="padding:12px"><div class="spinner-border spinner-border-sm text-primary"></div> Уншиж байна…</div>`;
  try {
    const rows = await api(`/api/nyarav/report/monthly?year=${year}&month=${month}`);
    if (!rows.length) { el.innerHTML = `<div class="p-3 text-muted">Энэ сард мэдээлэл алга</div>`; return; }

    let curCat = "";
    const bodyRows = rows.map(r => {
      const closing = r.opening_qty + r.income_qty + r.int_in_qty - r.expense_qty - r.int_out_qty;
      const closingAmt = closing * r.unit_price;
      let catHeader = "";
      if (r.category_code !== curCat) {
        curCat = r.category_code;
        catHeader = `<tr class="table-secondary"><td colspan="13" class="fw-bold small">${escapeHtml(r.category_code)} — ${escapeHtml(r.category_name)}</td></tr>`;
      }
      return catHeader + `<tr>
        <td class="small">${escapeHtml(r.name)}</td>
        <td class="small text-muted">${escapeHtml(r.unit || "")}</td>
        <td class="text-end small">${fmt(r.opening_qty)}</td>
        <td class="text-end small">${fmt(r.opening_amount)}₮</td>
        <td class="text-end small text-success">${fmt(r.income_qty)}</td>
        <td class="text-end small text-success">${fmt(r.income_amount)}₮</td>
        <td class="text-end small">${fmt(r.int_in_qty)}</td>
        <td class="text-end small">${fmt(r.int_in_amount)}₮</td>
        <td class="text-end small text-danger">${fmt(r.expense_qty)}</td>
        <td class="text-end small text-danger">${fmt(r.expense_amount)}₮</td>
        <td class="text-end small">${fmt(r.int_out_qty)}</td>
        <td class="text-end small fw-bold">${fmt(closing)}</td>
        <td class="text-end small fw-bold">${fmt(closingAmt)}₮</td>
      </tr>`;
    }).join("");

    el.innerHTML = `
    <div style="overflow:auto;max-height:500px">
      <table class="table table-sm table-bordered mb-0" style="font-size:12px">
        <thead class="table-light" style="position:sticky;top:0">
          <tr>
            <th rowspan="2">Материал</th>
            <th rowspan="2">Нэгж</th>
            <th colspan="2" class="text-center">Эхний үлдэгдэл</th>
            <th colspan="2" class="text-center bg-success bg-opacity-10">Орлого</th>
            <th colspan="2" class="text-center">Дотоод орлого</th>
            <th colspan="2" class="text-center bg-danger bg-opacity-10">Зарлага</th>
            <th colspan="2" class="text-center">Дотоод зарлага</th>
            <th colspan="2" class="text-center">Эцсийн үлдэгдэл</th>
          </tr>
          <tr>
            <th class="text-end">Тоо</th><th class="text-end">Дүн</th>
            <th class="text-end">Тоо</th><th class="text-end">Дүн</th>
            <th class="text-end">Тоо</th><th class="text-end">Дүн</th>
            <th class="text-end">Тоо</th><th class="text-end">Дүн</th>
            <th class="text-end">Тоо</th><th class="text-end">Дүн</th>
            <th class="text-end">Тоо</th><th class="text-end">Дүн</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger m-2">${e.message}</div>`;
  }
}

async function nyarav_report_worker() {
  const from = document.getElementById("wrFrom")?.value;
  const to   = document.getElementById("wrTo")?.value;
  const el   = document.getElementById("workerReport");
  if (!el) return;
  el.innerHTML = `<div style="padding:12px"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;
  try {
    const rows = await api(`/api/nyarav/report/by-worker?from=${from}&to=${to}`);
    if (!rows.length) { el.innerHTML = `<div class="p-3 text-muted">Энэ хугацаанд мэдээлэл алга</div>`; return; }
    let curWorker = "";
    const body = rows.map(r => {
      let h = "";
      if (r.received_by !== curWorker) {
        curWorker = r.received_by;
        h = `<tr class="table-secondary"><td colspan="4" class="fw-bold small">👤 ${escapeHtml(r.received_by)}</td></tr>`;
      }
      return h + `<tr>
        <td></td>
        <td class="small">${escapeHtml(r.material_name || "")}</td>
        <td class="small">${fmt(r.total_qty)} ${escapeHtml(r.unit || "")}</td>
        <td class="text-end small">${fmt(r.total_amount)}₮</td>
      </tr>`;
    }).join("");
    el.innerHTML = `<div style="overflow:auto;max-height:360px"><table class="table table-sm mb-0">
      <thead class="table-light"><tr><th></th><th>Материал</th><th>Нийт тоо</th><th class="text-end">Нийт дүн</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
  } catch (e) { el.innerHTML = `<div class="alert alert-danger m-2">${e.message}</div>`; }
}

async function nyarav_report_work() {
  const from = document.getElementById("wkFrom")?.value;
  const to   = document.getElementById("wkTo")?.value;
  const el   = document.getElementById("workReport");
  if (!el) return;
  el.innerHTML = `<div style="padding:12px"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;
  try {
    const rows = await api(`/api/nyarav/report/by-work?from=${from}&to=${to}`);
    if (!rows.length) { el.innerHTML = `<div class="p-3 text-muted">Энэ хугацаанд мэдээлэл алга</div>`; return; }
    let curWork = "";
    const body = rows.map(r => {
      let h = "";
      if (r.work_ref !== curWork) {
        curWork = r.work_ref;
        h = `<tr class="table-secondary"><td colspan="4" class="fw-bold small">🔧 ${escapeHtml(r.work_ref)}</td></tr>`;
      }
      return h + `<tr>
        <td></td>
        <td class="small">${escapeHtml(r.material_name || "")}</td>
        <td class="small">${fmt(r.total_qty)} ${escapeHtml(r.unit || "")}</td>
        <td class="text-end small">${fmt(r.total_amount)}₮</td>
      </tr>`;
    }).join("");
    el.innerHTML = `<div style="overflow:auto;max-height:360px"><table class="table table-sm mb-0">
      <thead class="table-light"><tr><th></th><th>Материал</th><th>Нийт тоо</th><th class="text-end">Нийт дүн</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
  } catch (e) { el.innerHTML = `<div class="alert alert-danger m-2">${e.message}</div>`; }
}

Object.assign(window, {
  nyarav, nyaravOpen,
  nyarav_dash, nyarav_intake, nyarav_issue, nyarav_stock, nyarav_order, nyarav_plan, nyarav_report,
  nyarav_bootstrap_panel, nyarav_do_bootstrap,
  nyarav_intake_fill, nyarav_intake_calc, nyarav_intake_save,
  nyarav_issue_fill,  nyarav_issue_calc,  nyarav_issue_save,
  nyarav_issue_summary_load,
  nyarav_issue_work_pick, nyarav_issue_category_pick,
  nyarav_stock_filter, nyarav_delete_mat, nyarav_delete_all,
  nyarav_order_save, nyarav_order_approve,
  nyarav_plan_load, nyarav_todo_open, nyarav_todo_save, nyarav_todo_status, nyarav_todo_note, nyarav_todo_add_note, nyarav_todo_print,
  nyarav_report_monthly, nyarav_report_worker, nyarav_report_work,
  // searchable picker internals
  matSearchOpen, matSearchClose, matSearchFilter, matSearchSelect, matSearchSetCategory,
  // intake multi-line
  inLineAdd, inLineRemove, inLineCalc, inLineSummary,
  // issue multi-line
  exLineAdd, exLineRemove, exLineCalc, exLineSummary,
  // transaction edit/delete/detail
  nyaravTxnEdit, nyaravTxnEditById, nyaravTxnDel, nyaravTxnSaveEdit,
  nyaravIntakeDetail, nyaravLineDelFromDetail, nyaravDocDel,
  nyaravIssueDetail, nyaravIssueLineDelFromDetail,
});
