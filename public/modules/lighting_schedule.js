import { state, api, toast, escapeHtml } from './common.js';

// ── Чойбалсан хотын координат ────────────────────────────────
const LAT = 48.0714, LNG = 114.5357, UTC_OFFSET = 8;

const MONTH_NAMES = ["1-р сар","2-р сар","3-р сар","4-р сар","5-р сар","6-р сар",
                     "7-р сар","8-р сар","9-р сар","10-р сар","11-р сар","12-р сар"];

const SCHED_CATS = ["Авто замын гэрэл", "Гэр хорооллын гэрэл", "Цамхагийн гэрэл"];

// ── Иргэний бүрэнхийн цаг тооцоо (civil twilight) ───────────
function civilTwilight(year, month1, day = 15) {
  const toR = d => d * Math.PI / 180;
  const date = new Date(year, month1 - 1, day);
  const dayOfYear = Math.round((date - new Date(year, 0, 1)) / 86400000) + 1;

  const decl = 23.45 * Math.sin(toR(360 / 365 * (dayOfYear - 81)));
  const B = toR(360 / 365 * (dayOfYear - 81));
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes

  const stdMeridian = UTC_OFFSET * 15; // 120°
  const solarNoon = 12 + (LNG - stdMeridian) / 15 + eot / 60;

  // Hour angle for civil twilight (sun at –6°)
  const cosH = (Math.sin(toR(-6)) - Math.sin(toR(LAT)) * Math.sin(toR(decl)))
             / (Math.cos(toR(LAT)) * Math.cos(toR(decl)));

  if (Math.abs(cosH) > 1) return null;
  const halfDay = Math.acos(cosH) * 180 / Math.PI / 15;

  return {
    evening: solarNoon + halfDay,  // гэрэл асах цаг (жаргалт дараа)
    morning: solarNoon - halfDay,  // гэрэл унтах цаг (мандалт өмнө)
  };
}

function hFmt(h) {
  if (h == null || isNaN(h)) return "—";
  const t = Math.round(((h % 24) + 24) % 24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2,'0')}:${String(t % 60).padStart(2,'0')}`;
}

function hoursFromStr(s) {
  if (!s) return null;
  const [hh, mm] = s.split(":").map(Number);
  return hh + mm / 60;
}

// Find the active schedule log entry for a given month (use 15th as representative)
function activeLogForMonth(logs, year, month1) {
  const target = `${year}-${String(month1).padStart(2,'0')}-15`;
  // Most recent log whose valid_from <= target
  const matching = logs.filter(l => l.valid_from <= target);
  if (!matching.length) return null;
  return matching[0]; // already sorted DESC by valid_from
}

let _lsYear = new Date().getFullYear();
let _lsCat  = "Авто замын гэрэл";

export async function sl_light_sched() {
  const canEdit = ["director","chief_engineer","accountant"].includes(state.me.role);
  const el = document.getElementById("main");

  el.innerHTML = `
  <div style="padding:24px 28px;max-width:1100px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:800">🌙 Гэрэлтүүлгийн цаг тохиргоо</h1>
        <div style="font-size:12px;color:#667085">Чойбалсан хот · 48.07°N 114.54°E · UTC+8 · Иргэний бүрэнхий (Civil Twilight)</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select id="lsYearSel" class="input" style="width:90px"
          onchange="window._lsYear=parseInt(this.value);sl_light_sched()">
          ${[2024,2025,2026,2027].map(y=>`<option value="${y}" ${y===_lsYear?"selected":""}>${y}</option>`).join("")}
        </select>
        <select id="lsCatSel" class="input" style="width:210px"
          onchange="window._lsCat=this.value;sl_light_sched()">
          ${SCHED_CATS.map(c=>`<option value="${escapeHtml(c)}" ${c===_lsCat?"selected":""}>${c}</option>`).join("")}
        </select>
        ${canEdit ? `<button class="btn" onclick="lsOpenAdd()">+ Тохируулга нэмэх</button>` : ""}
      </div>
    </div>

    <div id="lsBody">
      <div style="text-align:center;padding:40px;color:#94a3b8">Ачааллаж байна...</div>
    </div>

    <div id="lsModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;align-items:center;justify-content:center"
      onclick="if(event.target===this)lsCloseModal()">
      <div id="lsModalInner" style="background:#fff;border-radius:14px;width:min(480px,96vw);padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.25)"></div>
    </div>
  </div>`;

  window._lsYear = _lsYear;
  window._lsCat  = _lsCat;

  await lsRender();
}

async function lsRender() {
  _lsYear = window._lsYear || new Date().getFullYear();
  _lsCat  = window._lsCat  || "Авто замын гэрэл";
  const canEdit = ["director","chief_engineer","accountant"].includes(state.me.role);

  let logs = [];
  try { logs = await api(`/api/light-schedules?category=${encodeURIComponent(_lsCat)}&year=${_lsYear}`); }
  catch(e) {}

  // Build monthly rows
  const rows = MONTH_NAMES.map((mName, i) => {
    const month1 = i + 1;
    const tw = civilTwilight(_lsYear, month1);
    const log = activeLogForMonth(logs, _lsYear, month1);

    const astEve = tw ? hFmt(tw.evening) : "—";
    const astMor = tw ? hFmt(tw.morning) : "—";

    let actualOn = "—", actualOff = "—", logBadge = "", logId = null;
    if (log) {
      logId = log.id;
      if (log.is_always_off) {
        actualOn = actualOff = "";
        logBadge = `<span style="background:#fef2f2;color:#dc2626;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700">Унтраасан</span>`;
      } else {
        actualOn  = escapeHtml(log.on_time  || "—");
        actualOff = escapeHtml(log.off_time || "—");

        // Compare with astronomical
        const diffOn  = tw && log.on_time  ? Math.round((hoursFromStr(log.on_time)  - tw.evening) * 60) : null;
        const diffOff = tw && log.off_time ? Math.round((hoursFromStr(log.off_time) - tw.morning) * 60) : null;

        const fmtDiff = (d) => {
          if (d === null) return "";
          const abs = Math.abs(d);
          const sign = d > 0 ? "+" : "–";
          return `<span style="font-size:10px;color:${Math.abs(d)<=15?"#16a34a":"#d97706"}">${sign}${abs}мин</span>`;
        };
        logBadge = `${fmtDiff(diffOn)} ${fmtDiff(diffOff)}`;
      }
    }

    const rowBg = month1 % 2 === 0 ? "#fafafa" : "#fff";

    return `<tr style="background:${rowBg}">
      <td style="font-weight:700;padding:10px 14px">${mName}</td>
      <td style="text-align:center;color:#d97706;font-weight:600">${astEve}</td>
      <td style="text-align:center;color:#0ea5e9;font-weight:600">${astMor}</td>
      <td style="text-align:center">
        ${log && !log.is_always_off ? `<span style="font-weight:700;color:#f59e0b;font-size:14px">${actualOn}</span>` : logBadge || `<span style="color:#d1d5db">—</span>`}
      </td>
      <td style="text-align:center">
        ${log && !log.is_always_off ? `<span style="font-weight:700;color:#2563eb;font-size:14px">${actualOff}</span>` : ""}
      </td>
      <td style="font-size:11px;color:#667085;text-align:center">${logBadge && !log?.is_always_off ? logBadge : (log?.is_always_off ? logBadge : "")}</td>
      <td style="font-size:11px;color:#94a3b8;text-align:center">${log ? escapeHtml(log.adjusted_date||"") : ""}</td>
      <td style="font-size:11px;color:#94a3b8">${log ? escapeHtml(log.adjusted_by_name||"") : ""}</td>
      <td style="font-size:11px;color:#667085;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${log ? escapeHtml(log.notes||"") : ""}</td>
    </tr>`;
  }).join("");

  // Full log history
  const histRows = logs.length ? logs.map(l => `
    <tr>
      <td style="font-size:12px;font-family:monospace">${escapeHtml(l.adjusted_date||"")}</td>
      <td style="font-size:12px;font-family:monospace">${escapeHtml(l.valid_from||"")}</td>
      <td style="text-align:center">
        ${l.is_always_off
          ? `<span style="background:#fef2f2;color:#dc2626;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700">Унтраасан</span>`
          : `<span style="font-weight:700;color:#f59e0b">${escapeHtml(l.on_time||"—")}</span>`}
      </td>
      <td style="text-align:center">
        ${l.is_always_off ? "" : `<span style="font-weight:700;color:#2563eb">${escapeHtml(l.off_time||"—")}</span>`}
      </td>
      <td style="font-size:12px">${escapeHtml(l.adjusted_by_name||"")}</td>
      <td style="font-size:11px;color:#667085;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(l.notes||"")}</td>
      <td style="text-align:center">
        ${["director","chief_engineer","accountant"].includes(state.me.role) ? `
        <div style="display:flex;gap:4px;justify-content:center">
          <button class="btn secondary" style="padding:2px 8px;font-size:11px" onclick="lsOpenEdit(${l.id})">✏️</button>
          <button class="btn danger" style="padding:2px 8px;font-size:11px" onclick="lsDelete(${l.id},'${escapeHtml(l.valid_from)}')">🗑</button>
        </div>` : ""}
      </td>
    </tr>`).join("") :
    `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px">Тохируулга бүртгэгдээгүй байна</td></tr>`;

  document.getElementById("lsBody").innerHTML = `
    <div class="panel" style="margin-bottom:20px">
      <div style="padding:14px 18px;border-bottom:1px solid #e2e6ed;font-size:14px;font-weight:700">
        🌅 Астрономик лавлагаа + Бодит тохируулга — ${_lsYear} он
        <span style="font-size:11px;font-weight:400;color:#94a3b8;margin-left:8px">
          Асах = иргэний бүрэнхийн эцэс (жаргалт) · Унтах = иргэний бүрэнхийн эхлэл (мандалт)
        </span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Сар</th>
            <th style="text-align:center;color:#d97706">🌇 Астро. асах</th>
            <th style="text-align:center;color:#0ea5e9">🌅 Астро. унтах</th>
            <th style="text-align:center">💡 Бодит асах</th>
            <th style="text-align:center">🔌 Бодит унтах</th>
            <th style="text-align:center">Зөрүү</th>
            <th style="text-align:center">Тохирч. огноо</th>
            <th>Тохирч. хүн</th>
            <th>Тайлбар</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div style="padding:14px 18px;border-bottom:1px solid #e2e6ed;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:14px;font-weight:700">📋 Тохируулгын бүрэн түүх — ${escapeHtml(_lsCat)}</span>
        <span style="font-size:12px;color:#94a3b8">${logs.length} бүртгэл</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Тохирч. огноо</th>
            <th>Хүчинтэй огноо</th>
            <th style="text-align:center">Асах цаг</th>
            <th style="text-align:center">Унтах цаг</th>
            <th>Хэн тохируулсан</th>
            <th>Тайлбар</th>
            <th></th>
          </tr></thead>
          <tbody>${histRows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Modal: Add ────────────────────────────────────────────────
window.lsOpenAdd = function() {
  const today = new Date().toISOString().slice(0,10);
  document.getElementById("lsModalInner").innerHTML = `
    <div style="font-size:15px;font-weight:800;margin-bottom:16px">+ Тохируулга бүртгэх</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div style="grid-column:1/-1">
        <div style="font-size:11px;color:#667085;margin-bottom:4px">Ангилал</div>
        <select class="input" id="lsf_cat">
          ${SCHED_CATS.map(c=>`<option value="${escapeHtml(c)}" ${c===_lsCat?"selected":""}>${c}</option>`).join("")}
        </select>
      </div>
      <div>
        <div style="font-size:11px;color:#667085;margin-bottom:4px">Тохируулсан огноо *</div>
        <input class="input" type="date" id="lsf_adj" value="${today}">
      </div>
      <div>
        <div style="font-size:11px;color:#667085;margin-bottom:4px">Хүчинтэй болох огноо *</div>
        <input class="input" type="date" id="lsf_from" value="${today}">
      </div>
      <div>
        <div style="font-size:11px;color:#667085;margin-bottom:4px">💡 Асах цаг</div>
        <input class="input" type="time" id="lsf_on" value="19:00">
      </div>
      <div>
        <div style="font-size:11px;color:#667085;margin-bottom:4px">🔌 Унтах цаг</div>
        <input class="input" type="time" id="lsf_off" value="07:00">
      </div>
      <div style="grid-column:1/-1">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="lsf_alwaysoff" onchange="lsToggleOff(this)">
          <span style="color:#dc2626;font-weight:600">🔴 Унтраасан (гэрэл бүрэн асахгүй)</span>
        </label>
      </div>
      <div style="grid-column:1/-1">
        <div style="font-size:11px;color:#667085;margin-bottom:4px">Тайлбар</div>
        <input class="input" id="lsf_notes" placeholder="Жишээ: Зун улирлын тохируулга...">
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" onclick="lsSave(null)">Хадгалах</button>
      <button class="btn secondary" onclick="lsCloseModal()">Болих</button>
    </div>`;
  document.getElementById("lsModal").style.display = "flex";
};

window.lsToggleOff = function(cb) {
  const on  = document.getElementById("lsf_on");
  const off = document.getElementById("lsf_off");
  if (on) on.disabled  = cb.checked;
  if (off) off.disabled = cb.checked;
};

window.lsOpenEdit = async function(id) {
  let rec;
  try { const all = await api(`/api/light-schedules?category=${encodeURIComponent(_lsCat)}&year=2020`);
        const all2 = await api(`/api/light-schedules?category=${encodeURIComponent(_lsCat)}&year=${_lsYear}`);
        rec = [...all, ...all2].find(r => r.id === id); } catch(e){}
  if (!rec) { toast("Бүртгэл олдсонгүй"); return; }

  document.getElementById("lsModalInner").innerHTML = `
    <div style="font-size:15px;font-weight:800;margin-bottom:16px">✏️ Тохируулга засах</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div style="grid-column:1/-1">
        <div style="font-size:11px;color:#667085;margin-bottom:4px">Ангилал</div>
        <select class="input" id="lsf_cat">
          ${SCHED_CATS.map(c=>`<option value="${escapeHtml(c)}" ${c===rec.category?"selected":""}>${c}</option>`).join("")}
        </select>
      </div>
      <div>
        <div style="font-size:11px;color:#667085;margin-bottom:4px">Тохируулсан огноо *</div>
        <input class="input" type="date" id="lsf_adj" value="${rec.adjusted_date||""}">
      </div>
      <div>
        <div style="font-size:11px;color:#667085;margin-bottom:4px">Хүчинтэй болох огноо *</div>
        <input class="input" type="date" id="lsf_from" value="${rec.valid_from||""}">
      </div>
      <div>
        <div style="font-size:11px;color:#667085;margin-bottom:4px">💡 Асах цаг</div>
        <input class="input" type="time" id="lsf_on" value="${rec.on_time||""}" ${rec.is_always_off?"disabled":""}>
      </div>
      <div>
        <div style="font-size:11px;color:#667085;margin-bottom:4px">🔌 Унтах цаг</div>
        <input class="input" type="time" id="lsf_off" value="${rec.off_time||""}" ${rec.is_always_off?"disabled":""}>
      </div>
      <div style="grid-column:1/-1">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="lsf_alwaysoff" ${rec.is_always_off?"checked":""} onchange="lsToggleOff(this)">
          <span style="color:#dc2626;font-weight:600">🔴 Унтраасан</span>
        </label>
      </div>
      <div style="grid-column:1/-1">
        <div style="font-size:11px;color:#667085;margin-bottom:4px">Тайлбар</div>
        <input class="input" id="lsf_notes" value="${escapeHtml(rec.notes||"")}">
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" onclick="lsSave(${id})">Хадгалах</button>
      <button class="btn secondary" onclick="lsCloseModal()">Болих</button>
    </div>`;
  document.getElementById("lsModal").style.display = "flex";
};

window.lsSave = async function(id) {
  const g = el => (document.getElementById(el)||{}).value||"";
  const from = g("lsf_from");
  if (!from) { toast("Хүчинтэй огноо оруулна уу"); return; }
  const isOff = document.getElementById("lsf_alwaysoff")?.checked || false;
  const body = {
    category: g("lsf_cat"),
    adjusted_date: g("lsf_adj") || from,
    valid_from: from,
    on_time:  isOff ? null : (g("lsf_on")  || null),
    off_time: isOff ? null : (g("lsf_off") || null),
    is_always_off: isOff,
    notes: g("lsf_notes"),
  };
  try {
    if (id) {
      await api(`/api/light-schedules/${id}`, { method:"PUT", body:JSON.stringify(body) });
      toast("Засагдлаа ✓");
    } else {
      await api("/api/light-schedules", { method:"POST", body:JSON.stringify(body) });
      toast("Бүртгэгдлээ ✓");
    }
    lsCloseModal();
    await lsRender();
  } catch(e) { toast("Алдаа: " + e.message); }
};

window.lsDelete = async function(id, date) {
  if (!confirm(`${date} — энэ тохируулгыг устгах уу?`)) return;
  try {
    await api(`/api/light-schedules/${id}`, { method:"DELETE" });
    toast("Устгагдлаа ✓");
    await lsRender();
  } catch(e) { toast("Алдаа: " + e.message); }
};

window.lsCloseModal = function() {
  const m = document.getElementById("lsModal");
  if (m) m.style.display = "none";
};

Object.assign(window, { sl_light_sched });
