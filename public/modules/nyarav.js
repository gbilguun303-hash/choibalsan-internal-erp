import { state, api, toast, escapeHtml, today } from './common.js';

const canWrite = () => ["director","chief_engineer","storekeeper","accountant"].includes(state.me?.role);
const fmt  = n => Number(n || 0).toLocaleString("mn-MN");
const fmtD = s => s ? s.slice(0, 10) : "—";

const TXN_LABELS = {
  INCOME:       { text: "Орлого",         bg: "#dcfce7", color: "#16a34a" },
  INTERNAL_IN:  { text: "Дотоод орлого",  bg: "#dbeafe", color: "#2563eb" },
  EXPENSE:      { text: "Зарлага",        bg: "#fee2e2", color: "#dc2626" },
  INTERNAL_OUT: { text: "Дотоод зарлага", bg: "#fef3c7", color: "#d97706" },
  CORRECTION:   { text: "Засвар",         bg: "#f3e8ff", color: "#7c3aed" },
};

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
      id: m.id, name: m.name, unit: m.unit || "", price: m.unit_price || 0, balance: m.current_qty || 0
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
  document.getElementById(prefix + "Drop").style.display = "block";
}

function matSearchClose(prefix) {
  const d = document.getElementById(prefix + "Drop");
  if (d) d.style.display = "none";
}

function matSearchFilter(prefix) {
  const q    = (document.getElementById(prefix + "Search")?.value || "").toLowerCase();
  const raw  = document.getElementById(prefix + "Data")?.value || "[]";
  let mats;
  try { mats = JSON.parse(raw); } catch(_) { mats = []; }
  const filtered = q ? mats.filter(m => m.name.toLowerCase().includes(q)) : mats;
  const drop = document.getElementById(prefix + "Drop");
  if (!drop) return;
  drop.style.display = "block";
  if (!filtered.length) {
    drop.innerHTML = `<div style="padding:10px 14px;color:#94a3b8;font-size:13px">Олдсонгүй</div>`;
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
  try {
    [materials, rows] = await Promise.all([
      api("/api/nyarav/materials"),
      api("/api/nyarav/income")
    ]);
  } catch (_) {}
  _inMats = materials;

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
              <th style="min-width:320px">Материал *</th>
              <th style="min-width:100px">Тоо хэмжээ *</th>
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
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">Орлогын бүртгэл (${rows.length})</div>
    <div style="overflow:auto">
      <table class="table table-sm table-hover mb-0">
        <thead class="table-light">
          <tr><th>Баримт №</th><th>Огноо</th><th>Материал</th><th>Тоо</th><th class="text-end">Нэгж үнэ</th><th class="text-end">Нийт</th><th>Нийлүүлэгч</th><th>Төрөл</th><th>Тайлбар</th></tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(r => `<tr>
            <td><code class="small">${escapeHtml(r.txn_no || r.doc_no || "")}</code></td>
            <td class="small text-muted">${fmtD(r.txn_date)}</td>
            <td class="small">${escapeHtml(r.material_name || "")}</td>
            <td><strong>${fmt(r.qty)}</strong> <span class="text-muted small">${escapeHtml(r.unit || "")}</span></td>
            <td class="text-end small">${fmt(r.unit_price)}₮</td>
            <td class="text-end small fw-bold text-success">${fmt(r.amount)}₮</td>
            <td class="small">${escapeHtml(r.supplier || "—")}</td>
            <td>${txnBadge(r.txn_type)}</td>
            <td class="small text-muted">${escapeHtml(r.notes || "")}</td>
          </tr>`).join("") : `<tr><td colspan="9" class="text-center text-muted py-4">Орлого бүртгэгдээгүй байна</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;

  // Start with one empty line
  inLineAdd();
}

let _inLineSeq = 0;
function inLineAdd() {
  const idx = _inLineSeq++;
  const body = document.getElementById("inLinesBody");
  if (!body) return;
  const tr = document.createElement("tr");
  tr.id = `inLine_${idx}`;
  tr.innerHTML = `
    <td style="padding:4px 6px">
      ${matSearchHtml("iln" + idx, _inMats)}
    </td>
    <td style="padding:4px 6px">
      <div class="d-flex align-items-center gap-1">
        <input type="number" id="ilnQty${idx}" class="form-control form-control-sm"
          placeholder="0" min="0.001" step="any" style="width:80px"
          oninput="inLineCalc(${idx})">
        <span id="ilnUnit${idx}" class="text-muted small" style="white-space:nowrap"></span>
      </div>
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
    const unitEl   = document.getElementById(`ilnUnit${idx}`);
    if (mat) {
      if (priceEl && !priceEl.value) priceEl.value = mat.unit_price || "";
      if (unitEl) unitEl.textContent = mat.unit || "";
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

async function nyarav_intake_save() {
  const date     = document.getElementById("inDate")?.value;
  const doc_no   = document.getElementById("inDoc")?.value || "";
  const supplier = document.getElementById("inSupplier")?.value || "";
  const txn_type = document.getElementById("inType")?.value || "INCOME";
  const notes    = document.getElementById("inNotes")?.value || "";
  if (!date) { toast("Огноо оруулна уу"); return; }

  const lines = [];
  document.querySelectorAll("#inLinesBody tr").forEach(tr => {
    const idx = tr.id?.replace("inLine_", "");
    if (!idx) return;
    const mat_id = document.getElementById(`iln${idx}Id`)?.value;
    const qty    = parseFloat(document.getElementById(`ilnQty${idx}`)?.value || 0);
    const price  = parseFloat(document.getElementById(`ilnPrice${idx}`)?.value || 0);
    if (mat_id && qty > 0) lines.push({ material_id: Number(mat_id), qty, unit_price: price });
  });

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
  toast(`✅ ${ok} мөр бүртгэгдлээ${fail ? ` (${fail} алдаа)` : ""}`);
  nyarav_intake();
}

// ── 3. Зарлагын бүртгэл (multi-line) ───────────────────────────
let _exMats = [];

async function nyarav_issue() {
  main.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;
  let materials = [], rows = [];
  try {
    [materials, rows] = await Promise.all([
      api("/api/nyarav/materials"),
      api("/api/nyarav/expense")
    ]);
  } catch (_) {}
  _exMats = materials;

  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <h1 style="margin:0">📤 Зарлагын бүртгэл</h1>
    <button class="btn btn-sm btn-outline-secondary" onclick="nyarav_issue()">↺ Шинэчлэх</button>
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
          <input id="exReceiver" type="text" class="form-control form-control-sm" placeholder="Овог нэр">
        </div>
        <div class="col-md-3">
          <label class="form-label small">Аль ажилд ашигласан</label>
          <input id="exWork" type="text" class="form-control form-control-sm" placeholder="Ажлын нэр / work order">
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
              <th style="min-width:320px">Материал *</th>
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
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">Зарлагын бүртгэл (${rows.length})</div>
    <div style="overflow:auto">
      <table class="table table-sm table-hover mb-0">
        <thead class="table-light">
          <tr><th>Шаардах №</th><th>Огноо</th><th>Материал</th><th>Тоо</th><th class="text-end">Нэгж үнэ</th><th class="text-end">Нийт</th><th>Хүлээн авсан</th><th>Ажил</th><th>Asset</th><th>Тайлбар</th></tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(r => `<tr>
            <td><code class="small">${escapeHtml(r.txn_no || r.doc_no || "")}</code></td>
            <td class="small text-muted">${fmtD(r.txn_date)}</td>
            <td class="small">${escapeHtml(r.material_name || "")}</td>
            <td><strong>${fmt(r.qty)}</strong> <span class="text-muted small">${escapeHtml(r.unit || "")}</span></td>
            <td class="text-end small">${fmt(r.unit_price)}₮</td>
            <td class="text-end small fw-bold text-danger">${fmt(r.amount)}₮</td>
            <td class="small">${escapeHtml(r.received_by || "—")}</td>
            <td class="small">${escapeHtml(r.work_ref || "—")}</td>
            <td class="small">${escapeHtml(r.asset_ref || "—")}</td>
            <td class="small text-muted">${escapeHtml(r.notes || "")}</td>
          </tr>`).join("") : `<tr><td colspan="10" class="text-center text-muted py-4">Зарлага бүртгэгдээгүй байна</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;

  exLineAdd();
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
      ${matSearchHtml("eln" + idx, _exMats)}
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
    const balEl   = document.getElementById(`elnBalance${idx}`);
    if (mat) {
      if (priceEl && !priceEl.value) priceEl.value = mat.unit_price || "";
      if (unitEl)  unitEl.textContent  = mat.unit || "";
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
  const doc_no    = document.getElementById("exDoc")?.value || "";
  const received  = document.getElementById("exReceiver")?.value || "";
  const work_ref  = document.getElementById("exWork")?.value || "";
  const asset_ref = document.getElementById("exAsset")?.value || "";
  const notes     = document.getElementById("exNotes")?.value || "";
  if (!date) { toast("Огноо оруулна уу"); return; }

  const lines = [];
  document.querySelectorAll("#exLinesBody tr").forEach(tr => {
    const idx = tr.id?.replace("exLine_", "");
    if (!idx) return;
    const mat_id = document.getElementById(`eln${idx}Id`)?.value;
    const qty    = parseFloat(document.getElementById(`elnQty${idx}`)?.value || 0);
    const price  = parseFloat(document.getElementById(`elnPrice${idx}`)?.value || 0);
    if (mat_id && qty > 0) lines.push({ material_id: Number(mat_id), qty, unit_price: price });
  });

  if (!lines.length) { toast("Хамгийн багадаа нэг материал нэмнэ үү"); return; }

  let ok = 0, fail = 0, lastErr = "";
  for (const line of lines) {
    try {
      await api("/api/nyarav/expense", {
        method: "POST",
        body: JSON.stringify({ ...line, txn_date: date, doc_no, received_by: received, work_ref, asset_ref, notes })
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
async function nyarav_report() {
  const now = new Date();
  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <h1 style="margin:0">📊 Нярав тайлан</h1>
  </div>

  <div class="panel mb-3">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">БМ журналын сарын тайлан</div>
    <div style="padding:14px 16px" class="d-flex gap-2 align-items-end flex-wrap">
      <div>
        <label class="form-label small">Он</label>
        <input id="rpYear" type="number" class="form-control form-control-sm" value="${now.getFullYear()}" style="width:90px">
      </div>
      <div>
        <label class="form-label small">Сар</label>
        <select id="rpMonth" class="form-select form-select-sm" style="width:100px">
          ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===now.getMonth()+1?"selected":""}>${i+1}-р сар</option>`).join("")}
        </select>
      </div>
      <button class="btn btn-primary btn-sm" onclick="nyarav_report_monthly()">Тайлан харах</button>
    </div>
    <div id="monthlyReport"></div>
  </div>

  <div class="panel mb-3">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">Ажилтнаар — хэн юу авсан</div>
    <div style="padding:14px 16px" class="d-flex gap-2 align-items-end flex-wrap">
      <div>
        <label class="form-label small">Эхлэх огноо</label>
        <input id="wrFrom" type="date" class="form-control form-control-sm" value="${now.getFullYear()}-01-01">
      </div>
      <div>
        <label class="form-label small">Дуусах огноо</label>
        <input id="wrTo" type="date" class="form-control form-control-sm" value="${today()}">
      </div>
      <button class="btn btn-primary btn-sm" onclick="nyarav_report_worker()">Харах</button>
    </div>
    <div id="workerReport"></div>
  </div>

  <div class="panel">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">Ажлаар — аль ажилд юу зарцуулсан</div>
    <div style="padding:14px 16px" class="d-flex gap-2 align-items-end flex-wrap">
      <div>
        <label class="form-label small">Эхлэх огноо</label>
        <input id="wkFrom" type="date" class="form-control form-control-sm" value="${now.getFullYear()}-01-01">
      </div>
      <div>
        <label class="form-label small">Дуусах огноо</label>
        <input id="wkTo" type="date" class="form-control form-control-sm" value="${today()}">
      </div>
      <button class="btn btn-primary btn-sm" onclick="nyarav_report_work()">Харах</button>
    </div>
    <div id="workReport"></div>
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
  nyarav_dash, nyarav_intake, nyarav_issue, nyarav_stock, nyarav_order, nyarav_report,
  nyarav_bootstrap_panel, nyarav_do_bootstrap,
  nyarav_intake_fill, nyarav_intake_calc, nyarav_intake_save,
  nyarav_issue_fill,  nyarav_issue_calc,  nyarav_issue_save,
  nyarav_stock_filter, nyarav_delete_mat, nyarav_delete_all,
  nyarav_order_save, nyarav_order_approve,
  nyarav_report_monthly, nyarav_report_worker, nyarav_report_work,
  // searchable picker internals
  matSearchOpen, matSearchClose, matSearchFilter, matSearchSelect,
  // intake multi-line
  inLineAdd, inLineRemove, inLineCalc, inLineSummary,
  // issue multi-line
  exLineAdd, exLineRemove, exLineCalc, exLineSummary,
});
