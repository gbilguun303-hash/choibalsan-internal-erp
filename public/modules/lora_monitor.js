import { state, api, toast, escapeHtml } from './common.js';

const CAN_MANAGE = ["director","chief_engineer"];
const CAN_ENTER  = ["director","chief_engineer","engineer"];

let _devices = [];
let _summary = [];
let _tab = "devices";
let _dayFilters = { device_id:"", date_from:"", date_to:"" };

const canManage = () => CAN_MANAGE.includes(state.me?.role);
const canEnter  = () => CAN_ENTER.includes(state.me?.role);

function fmtNum(v, dec=1) { return v != null ? Number(v).toFixed(dec) : "—"; }
function fmtDt(iso) { if (!iso) return "—"; return iso.slice(0,16).replace("T"," "); }
function todayStr() { return new Date().toISOString().slice(0,10); }
function daysAgo(n) { return new Date(Date.now()-n*864e5).toISOString().slice(0,10); }

function statusBadge(status, isActive) {
  if (!isActive) return `<span style="background:#f2f4f7;color:#667085;padding:2px 8px;border-radius:20px;font-size:11px">Идэвхгүй</span>`;
  const cfg = {
    on:      ["#d1fae5","#065f46","💡 Асаалттай"],
    off:     ["#f3f4f6","#374151","🔌 Унтраасан"],
    fault:   ["#fee2e2","#991b1b","⚡ Гэмтэлтэй"],
    unknown: ["#f9fafb","#9ca3af","❓ Тодорхойгүй"],
  };
  const [bg,col,lbl] = cfg[status] || cfg.unknown;
  return `<span style="background:${bg};color:${col};padding:2px 8px;border-radius:20px;font-size:11px">${lbl}</span>`;
}

// ── Main entry ────────────────────────────────────────────────
async function lora_monitor() {
  if (typeof window.iot_monitor === "function") {
    await window.iot_monitor();
    return;
  }
  const el = document.getElementById("main");
  el.innerHTML = `
    <div style="padding:24px;max-width:1200px">
      <div style="margin-bottom:20px">
        <h2 style="margin:0;font-size:20px">📡 LoRaWAN хяналтын систем</h2>
        <p style="margin:4px 0 0;color:#667085;font-size:13px">AWD300 / AWD310 · Гэрэлтүүлгийн хэмжих хэрэгсэл · Хүчдэл · Гүйдэл · Чадал</p>
      </div>

      <div style="display:flex;gap:0;border-bottom:2px solid #e5e7eb;margin-bottom:20px">
        ${[["devices","📋 Хэрэгслүүд"],["daily","📊 Өдрийн уншилт"],["faults","⚡ Гэмтэлтэй өдрүүд"]]
          .map(([k,l])=>`<button id="lmTab_${k}" onclick="lmSetTab('${k}')"
            style="padding:9px 22px;border:none;background:none;cursor:pointer;font-size:13px;
                   border-bottom:${_tab===k?"2px solid #3b82f6;color:#3b82f6;margin-bottom:-2px":"none;color:#667085"}">${l}</button>`).join("")}
      </div>

      <div id="lmContent"></div>
    </div>

    <div id="lmDevModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center"
         onclick="if(event.target===this)lmCloseDevModal()">
      <div id="lmDevInner" style="background:#fff;border-radius:12px;padding:28px;width:540px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)"></div>
    </div>

    <div id="lmDayModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center"
         onclick="if(event.target===this)lmCloseDayModal()">
      <div id="lmDayInner" style="background:#fff;border-radius:12px;padding:28px;width:500px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)"></div>
    </div>
  `;

  await _loadData();
  _renderTab();
}

async function _loadData() {
  try {
    [_summary, _devices] = await Promise.all([
      api("/api/lora-summary"),
      api("/api/lora-devices"),
    ]);
  } catch(e) { toast("Мэдээлэл татахад алдаа гарлаа"); }
}

function lmSetTab(k) {
  _tab = k;
  document.querySelectorAll("[id^='lmTab_']").forEach(b => {
    const tk = b.id.replace("lmTab_","");
    b.style.borderBottom = tk===k ? "2px solid #3b82f6" : "none";
    b.style.color        = tk===k ? "#3b82f6" : "#667085";
    b.style.marginBottom = tk===k ? "-2px" : "0";
  });
  _renderTab();
}

function _renderTab() {
  const el = document.getElementById("lmContent");
  if (!el) return;
  if (_tab==="devices")      { el.innerHTML = _devTab(); }
  else if (_tab==="daily")   { el.innerHTML = _dayTabShell(); _loadDayTable(); }
  else                       { el.innerHTML = "<div id='lmFaultTbl'>Ачааллаж байна...</div>"; _loadFaultTable(); }
}

// ── DEVICES TAB ───────────────────────────────────────────────
function _devTab() {
  const active = _summary.filter(d=>d.is_active).length;
  const faults = _summary.filter(d=>d.last_status==="fault").length;
  const online = _summary.filter(d=>d.last_status==="on").length;
  return `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px">
      ${[["📡","Нийт хэрэгсэл",_summary.length,"#eff6ff","#3b82f6"],
         ["✅","Идэвхтэй",active,"#f0fdf4","#16a34a"],
         ["💡","Асаалттай",online,"#fefce8","#d97706"],
         ["⚡","Гэмтэлтэй",faults,"#fef2f2","#dc2626"]]
        .map(([ic,l,v,bg,c])=>`
          <div style="background:${bg};border-radius:10px;padding:16px;border:1px solid ${c}22">
            <div style="font-size:12px;color:#667085">${ic} ${l}</div>
            <div style="font-size:30px;font-weight:700;color:${c};margin-top:4px">${v}</div>
          </div>`).join("")}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-weight:600;font-size:15px">Бүртгэлтэй хэрэгслүүд</div>
      ${canManage() ? `<button class="btn" onclick="lmOpenDevForm()" style="padding:7px 16px;font-size:12px">+ Хэрэгсэл нэмэх</button>` : ""}
    </div>
    <div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f9fafb">
          ${["Нэр","Загвар","EUI","Байршил","Фаз","Хэмжилт (V / A / кВт)","Сүүлийн холболт","Төлөв",""].map(h=>`
            <th style="padding:9px 12px;text-align:left;font-size:11px;color:#667085;font-weight:600;border-bottom:1px solid #e5e7eb;white-space:nowrap">${h}</th>`).join("")}
        </tr></thead>
        <tbody>
          ${_summary.length===0
            ? `<tr><td colspan="9" style="padding:40px;text-align:center;color:#9ca3af">Хэрэгсэл бүртгэгдээгүй байна</td></tr>`
            : _summary.map(d=>`
              <tr style="border-bottom:1px solid #f3f4f6;${!d.is_active?"opacity:.55":""}">
                <td style="padding:9px 12px;font-weight:500">${escapeHtml(d.device_name)}</td>
                <td style="padding:9px 12px"><span style="background:#eff6ff;color:#3b82f6;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600">${d.model}</span></td>
                <td style="padding:9px 12px;font-size:11px;color:#667085;font-family:monospace">${d.device_eui||"—"}</td>
                <td style="padding:9px 12px;font-size:12px;max-width:180px">${escapeHtml(d.sl_point_name||d.ger_name||d.location_desc||"—")}</td>
                <td style="padding:9px 12px">${d.phase||"1Ф"}</td>
                <td style="padding:9px 12px;font-family:monospace;font-size:12px;white-space:nowrap">
                  ${fmtNum(d.last_voltage,1)}V / ${fmtNum(d.last_current,2)}A / ${fmtNum(d.last_power,3)}кВт
                </td>
                <td style="padding:9px 12px;font-size:11px;color:#667085;white-space:nowrap">${fmtDt(d.last_seen)}</td>
                <td style="padding:9px 12px">${statusBadge(d.last_status,d.is_active)}</td>
                <td style="padding:9px 12px">
                  ${canManage() ? `<button class="btn secondary" style="padding:3px 9px;font-size:11px" onclick="lmOpenDevForm(${d.id})">✏️</button>` : ""}
                </td>
              </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// ── DAILY TAB ─────────────────────────────────────────────────
function _dayTabShell() {
  if (!_dayFilters.date_from) _dayFilters.date_from = daysAgo(30);
  if (!_dayFilters.date_to)   _dayFilters.date_to   = todayStr();
  return `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px">
      <div>
        <div style="font-size:11px;color:#667085;margin-bottom:4px">Хэрэгсэл</div>
        <select id="lmDyDevSel" style="padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px" onchange="lmDayFilter()">
          <option value="">— Бүгд —</option>
          ${_devices.map(d=>`<option value="${d.id}" ${_dayFilters.device_id==d.id?"selected":""}>${escapeHtml(d.device_name)}</option>`).join("")}
        </select>
      </div>
      <div>
        <div style="font-size:11px;color:#667085;margin-bottom:4px">Эхлэх огноо</div>
        <input type="date" id="lmDyFrom" value="${_dayFilters.date_from}"
               style="padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px" onchange="lmDayFilter()">
      </div>
      <div>
        <div style="font-size:11px;color:#667085;margin-bottom:4px">Дуусах огноо</div>
        <input type="date" id="lmDyTo" value="${_dayFilters.date_to}"
               style="padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px" onchange="lmDayFilter()">
      </div>
      ${canEnter() ? `<button class="btn" onclick="lmOpenDayForm()" style="padding:8px 18px;font-size:13px">+ Уншилт оруулах</button>` : ""}
    </div>
    <div id="lmDayTbl">Ачааллаж байна...</div>`;
}

async function _loadDayTable() {
  const el = document.getElementById("lmDayTbl");
  if (!el) return;
  try {
    const p = new URLSearchParams();
    if (_dayFilters.device_id) p.set("device_id", _dayFilters.device_id);
    if (_dayFilters.date_from)  p.set("date_from",  _dayFilters.date_from);
    if (_dayFilters.date_to)    p.set("date_to",    _dayFilters.date_to);
    const rows = await api(`/api/lora-daily?${p}`);
    el.innerHTML = `
      <div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:8px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f9fafb">
            ${["Огноо","Хэрэгсэл","Загвар","Асах","Унтрах","V","A","кВт","кВт·ч","PF","Эх үүсвэр","Төлөв",""].map(h=>`
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#667085;font-weight:600;border-bottom:1px solid #e5e7eb;white-space:nowrap">${h}</th>`).join("")}
          </tr></thead>
          <tbody>
            ${rows.length===0
              ? `<tr><td colspan="13" style="padding:40px;text-align:center;color:#9ca3af">Уншилт олдсонгүй</td></tr>`
              : rows.map(r=>`
                <tr style="border-bottom:1px solid #f3f4f6;${r.is_fault?"background:#fef9f9":""}">
                  <td style="padding:8px 10px;font-weight:500;white-space:nowrap">${r.date}</td>
                  <td style="padding:8px 10px">${escapeHtml(r.device_name)}</td>
                  <td style="padding:8px 10px"><span style="background:#eff6ff;color:#3b82f6;padding:1px 6px;border-radius:4px;font-size:11px">${r.model}</span></td>
                  <td style="padding:8px 10px">${r.on_time||"—"}</td>
                  <td style="padding:8px 10px">${r.off_time||"—"}</td>
                  <td style="padding:8px 10px;font-family:monospace">${fmtNum(r.voltage_v,1)}</td>
                  <td style="padding:8px 10px;font-family:monospace">${fmtNum(r.current_a,2)}</td>
                  <td style="padding:8px 10px;font-family:monospace">${fmtNum(r.power_kw,3)}</td>
                  <td style="padding:8px 10px;font-family:monospace;font-weight:600">${fmtNum(r.energy_kwh,3)}</td>
                  <td style="padding:8px 10px;font-family:monospace">${fmtNum(r.power_factor,2)}</td>
                  <td style="padding:8px 10px;font-size:11px;color:#667085">${r.source==="lorawan"?"📡 LoRa":"✍️ Гараар"}</td>
                  <td style="padding:8px 10px">
                    ${r.is_fault
                      ? `<span style="color:#dc2626;font-size:11px" title="${escapeHtml(r.fault_note)}">⚡ Гэмтэл</span>`
                      : `<span style="color:#16a34a;font-size:11px">✓ Хэвийн</span>`}
                  </td>
                  <td style="padding:8px 10px;white-space:nowrap">
                    ${canEnter() ? `<button class="btn secondary" style="padding:2px 8px;font-size:11px" onclick="lmOpenDayForm(${r.id},${r.device_id},'${r.date}')">✏️</button>` : ""}
                    ${canManage() ? ` <button class="btn secondary" style="padding:2px 8px;font-size:11px;color:#dc2626" onclick="lmDelDay(${r.id})">🗑</button>` : ""}
                  </td>
                </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  } catch(e) { el.innerHTML = `<p style="color:#dc2626">Алдаа: ${escapeHtml(e.message)}</p>`; }
}

async function lmDayFilter() {
  _dayFilters.device_id = document.getElementById("lmDyDevSel")?.value || "";
  _dayFilters.date_from = document.getElementById("lmDyFrom")?.value  || "";
  _dayFilters.date_to   = document.getElementById("lmDyTo")?.value    || "";
  await _loadDayTable();
}

// ── FAULTS TAB ────────────────────────────────────────────────
async function _loadFaultTable() {
  const el = document.getElementById("lmFaultTbl");
  if (!el) return;
  try {
    const rows = await api("/api/lora-daily?is_fault=1");
    el.innerHTML = `
      <div style="font-weight:600;margin-bottom:14px;color:#dc2626;font-size:15px">⚡ Гэмтэлтэй өдрүүд — нийт ${rows.length} бичлэг</div>
      <div style="overflow-x:auto;border:1px solid #fca5a5;border-radius:8px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#fef2f2">
            ${["Огноо","Хэрэгсэл","Загвар","Байршил","V","A","кВт","кВт·ч","Гэмтлийн тайлбар","Оруулагч"].map(h=>`
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#667085;font-weight:600;border-bottom:1px solid #fca5a5;white-space:nowrap">${h}</th>`).join("")}
          </tr></thead>
          <tbody>
            ${rows.length===0
              ? `<tr><td colspan="10" style="padding:40px;text-align:center;color:#9ca3af">Гэмтэлтэй бичлэг олдсонгүй 🎉</td></tr>`
              : rows.map(r=>`
                <tr style="border-bottom:1px solid #fef2f2">
                  <td style="padding:8px 12px;font-weight:500;color:#dc2626;white-space:nowrap">${r.date}</td>
                  <td style="padding:8px 12px">${escapeHtml(r.device_name)}</td>
                  <td style="padding:8px 12px"><span style="background:#fee2e2;color:#dc2626;padding:1px 6px;border-radius:4px;font-size:11px">${r.model}</span></td>
                  <td style="padding:8px 12px;font-size:12px;color:#667085">${escapeHtml(r.sl_point_name||r.ger_name||"—")}</td>
                  <td style="padding:8px 12px;font-family:monospace">${fmtNum(r.voltage_v,1)}</td>
                  <td style="padding:8px 12px;font-family:monospace">${fmtNum(r.current_a,2)}</td>
                  <td style="padding:8px 12px;font-family:monospace">${fmtNum(r.power_kw,3)}</td>
                  <td style="padding:8px 12px;font-family:monospace">${fmtNum(r.energy_kwh,3)}</td>
                  <td style="padding:8px 12px;color:#dc2626">${escapeHtml(r.fault_note||"—")}</td>
                  <td style="padding:8px 12px;font-size:11px;color:#667085">${escapeHtml(r.entered_by_name||r.source||"—")}</td>
                </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  } catch(e) { el.innerHTML = `<p style="color:#dc2626">Алдаа: ${escapeHtml(e.message)}</p>`; }
}

// ── DEVICE FORM ───────────────────────────────────────────────
async function lmOpenDevForm(id) {
  const modal = document.getElementById("lmDevModal");
  const inner = document.getElementById("lmDevInner");
  modal.style.display = "flex";

  const dev = id ? (_devices.find(d=>d.id===id)||null) : null;
  let slPts = [];
  try { slPts = await api("/api/sl-points"); } catch(e) {}

  inner.innerHTML = `
    <h3 style="margin:0 0 20px;font-size:16px">${id ? "✏️ Хэрэгсэл засах" : "+ Шинэ хэрэгсэл бүртгэх"}</h3>
    <div style="display:grid;gap:14px">
      <div>
        <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Нэр *</label>
        <input id="lmDvName" value="${escapeHtml(dev?.device_name||"")}" placeholder="Жш: Баянгол-01 AWD300"
               style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Загвар</label>
          <select id="lmDvModel" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
            ${["AWD300","AWD310"].map(m=>`<option ${(dev?.model||"AWD300")===m?"selected":""}>${m}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Фаз</label>
          <select id="lmDvPhase" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
            ${["1Ф","3Ф"].map(p=>`<option ${(dev?.phase||"1Ф")===p?"selected":""}>${p}</option>`).join("")}
          </select>
        </div>
      </div>
      <div>
        <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Device EUI</label>
        <input id="lmDvEUI" value="${escapeHtml(dev?.device_eui||"")}" placeholder="70B3D57ED0..."
               style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:monospace;box-sizing:border-box">
      </div>
      <div>
        <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Авто замын гэрлийн цэг (холбох)</label>
        <select id="lmDvSlPt" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          <option value="">— Холбоогүй —</option>
          ${slPts.map(p=>`<option value="${p.id}" ${dev?.sl_point_id===p.id?"selected":""}>${escapeHtml(p.name||p.code||String(p.id))}</option>`).join("")}
        </select>
      </div>
      <div>
        <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Байршлын тайлбар</label>
        <input id="lmDvLoc" value="${escapeHtml(dev?.location_desc||"")}" placeholder="Байршлын дэлгэрэнгүй тайлбар"
               style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Суурилуулсан огноо</label>
          <input type="date" id="lmDvDate" value="${dev?.installed_date||""}"
                 style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding-top:22px">
          <input type="checkbox" id="lmDvActive" ${!id||dev?.is_active?"checked":""} style="width:16px;height:16px">
          <label for="lmDvActive" style="font-size:13px">Идэвхтэй</label>
        </div>
      </div>
      <div>
        <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Тэмдэглэл</label>
        <textarea id="lmDvNotes" rows="2" placeholder="Нэмэлт тэмдэглэл"
                  style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">${escapeHtml(dev?.notes||"")}</textarea>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
        ${id&&canManage() ? `<button class="btn secondary" style="padding:8px 16px;color:#dc2626;margin-right:auto" onclick="lmDelDev(${id})">🗑 Устгах</button>` : ""}
        <button class="btn secondary" onclick="lmCloseDevModal()" style="padding:8px 20px">Болих</button>
        <button class="btn" onclick="lmSaveDev(${id||"null"})" style="padding:8px 20px">💾 Хадгалах</button>
      </div>
    </div>`;
}

function lmCloseDevModal() { document.getElementById("lmDevModal").style.display = "none"; }

async function lmSaveDev(id) {
  const name = document.getElementById("lmDvName").value.trim();
  if (!name) { toast("Нэр оруулна уу"); return; }
  const body = {
    device_name:    name,
    model:          document.getElementById("lmDvModel").value,
    phase:          document.getElementById("lmDvPhase").value,
    device_eui:     document.getElementById("lmDvEUI").value.trim().toUpperCase() || null,
    sl_point_id:    document.getElementById("lmDvSlPt").value || null,
    location_desc:  document.getElementById("lmDvLoc").value.trim(),
    installed_date: document.getElementById("lmDvDate").value || null,
    is_active:      document.getElementById("lmDvActive").checked,
    notes:          document.getElementById("lmDvNotes").value.trim(),
  };
  try {
    if (id) await api(`/api/lora-devices/${id}`, { method:"PUT", body:JSON.stringify(body) });
    else     await api("/api/lora-devices", { method:"POST", body:JSON.stringify(body) });
    toast("Амжилттай хадгаллаа ✓");
    lmCloseDevModal();
    await _loadData();
    _tab = "devices";
    _renderTab();
  } catch(e) { toast("Алдаа: " + e.message); }
}

async function lmDelDev(id) {
  if (!confirm("Энэ хэрэгслийг устгах уу? Холбогдох бүх уншилтууд устана.")) return;
  try {
    await api(`/api/lora-devices/${id}`, { method:"DELETE" });
    toast("Устгагдлаа ✓");
    lmCloseDevModal();
    await _loadData();
    _renderTab();
  } catch(e) { toast("Алдаа: " + e.message); }
}

// ── DAILY FORM ────────────────────────────────────────────────
async function lmOpenDayForm(id, deviceId, date) {
  const modal = document.getElementById("lmDayModal");
  const inner = document.getElementById("lmDayInner");
  modal.style.display = "flex";

  let row = null;
  if (id && deviceId && date) {
    try {
      const rows = await api(`/api/lora-daily?device_id=${deviceId}&date_from=${date}&date_to=${date}`);
      row = rows.find(r=>r.id===id) || null;
    } catch(e) {}
  }

  inner.innerHTML = `
    <h3 style="margin:0 0 20px;font-size:16px">${id ? "✏️ Уншилт засах" : "+ Өдрийн уншилт оруулах"}</h3>
    <div style="display:grid;gap:13px">
      <div>
        <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Хэрэгсэл *</label>
        <select id="lmDyDev" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          <option value="">— Сонгох —</option>
          ${_devices.filter(d=>d.is_active).map(d=>`<option value="${d.id}" ${(row?.device_id||deviceId)==d.id?"selected":""}>${escapeHtml(d.device_name)}</option>`).join("")}
        </select>
      </div>
      <div>
        <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Огноо *</label>
        <input type="date" id="lmDyDate" value="${row?.date||date||todayStr()}"
               style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Асах цаг</label>
          <input type="time" id="lmDyOn" value="${row?.on_time||""}"
                 style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Унтрах цаг</label>
          <input type="time" id="lmDyOff" value="${row?.off_time||""}"
                 style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Хүчдэл (V)</label>
          <input type="number" id="lmDyVolt" value="${row?.voltage_v||""}" step="0.1" placeholder="220.0"
                 style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Гүйдэл (A)</label>
          <input type="number" id="lmDyCurr" value="${row?.current_a||""}" step="0.01" placeholder="5.00"
                 style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Чадал (кВт)</label>
          <input type="number" id="lmDyPow" value="${row?.power_kw||""}" step="0.001" placeholder="1.100"
                 style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Эрчим (кВт·ч)</label>
          <input type="number" id="lmDyEnergy" value="${row?.energy_kwh||""}" step="0.001" placeholder="8.800"
                 style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Power Factor</label>
          <input type="number" id="lmDyPF" value="${row?.power_factor||""}" step="0.01" min="0" max="1" placeholder="0.95"
                 style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding-top:22px">
          <input type="checkbox" id="lmDyFaultCk" ${row?.is_fault?"checked":""} style="width:16px;height:16px"
                 onchange="document.getElementById('lmDyFaultRow').style.display=this.checked?'block':'none'">
          <label for="lmDyFaultCk" style="font-size:13px;color:#dc2626">⚡ Гэмтэлтэй</label>
        </div>
      </div>
      <div id="lmDyFaultRow" style="display:${row?.is_fault?"block":"none"}">
        <label style="font-size:12px;color:#667085;display:block;margin-bottom:4px">Гэмтлийн тайлбар</label>
        <input type="text" id="lmDyFaultTxt" value="${escapeHtml(row?.fault_note||"")}" placeholder="Гэмтлийн тайлбар..."
               style="width:100%;padding:8px 10px;border:1px solid #fca5a5;border-radius:6px;font-size:13px;box-sizing:border-box">
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
        <button class="btn secondary" onclick="lmCloseDayModal()" style="padding:8px 20px">Болих</button>
        <button class="btn" onclick="lmSaveDay(${id||"null"})" style="padding:8px 20px">💾 Хадгалах</button>
      </div>
    </div>`;
}

function lmCloseDayModal() { document.getElementById("lmDayModal").style.display = "none"; }

async function lmSaveDay() {
  const device_id = document.getElementById("lmDyDev").value;
  const date      = document.getElementById("lmDyDate").value;
  if (!device_id || !date) { toast("Хэрэгсэл болон огноо оруулна уу"); return; }
  const isFault = document.getElementById("lmDyFaultCk").checked;
  const body = {
    device_id,
    date,
    on_time:      document.getElementById("lmDyOn").value    || null,
    off_time:     document.getElementById("lmDyOff").value   || null,
    voltage_v:    parseFloat(document.getElementById("lmDyVolt").value)   || null,
    current_a:    parseFloat(document.getElementById("lmDyCurr").value)   || null,
    power_kw:     parseFloat(document.getElementById("lmDyPow").value)    || null,
    energy_kwh:   parseFloat(document.getElementById("lmDyEnergy").value) || null,
    power_factor: parseFloat(document.getElementById("lmDyPF").value)     || null,
    is_fault:     isFault,
    fault_note:   isFault ? (document.getElementById("lmDyFaultTxt")?.value.trim()||"") : "",
  };
  try {
    await api("/api/lora-daily", { method:"POST", body:JSON.stringify(body) });
    toast("Амжилттай хадгаллаа ✓");
    lmCloseDayModal();
    await _loadDayTable();
  } catch(e) { toast("Алдаа: " + e.message); }
}

async function lmDelDay(id) {
  if (!confirm("Энэ өдрийн уншилтыг устгах уу?")) return;
  try {
    await api(`/api/lora-daily/${id}`, { method:"DELETE" });
    toast("Устгагдлаа ✓");
    await _loadDayTable();
  } catch(e) { toast("Алдаа: " + e.message); }
}

// ── Register ──────────────────────────────────────────────────
Object.assign(window, {
  lora_monitor,
  lmSetTab,
  lmOpenDevForm, lmCloseDevModal, lmSaveDev, lmDelDev,
  lmOpenDayForm, lmCloseDayModal, lmSaveDay, lmDelDay,
  lmDayFilter,
});
