import { state, toast } from "./common.js";

const API = location.origin;
function hdrs(json = false) {
  const h = { "Authorization": "Bearer " + state.token };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// ── Helpers ────────────────────────────────────────────────────
function fmt12(iso) {
  const d = new Date(iso);
  let h = d.getHours(), m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2,"0")} ${ap}`;
}
function initials(name) {
  if (!name) return "?";
  const p = name.trim().split(" ");
  return p.length >= 2 ? (p[0][0]+p[p.length-1][0]).toUpperCase() : name.slice(0,2).toUpperCase();
}
const COLORS = ["#2563eb","#7c3aed","#db2777","#dc2626","#d97706","#16a34a","#0891b2","#9333ea"];
function avatarColor(id) { return COLORS[id % COLORS.length]; }

// ── Auto category detection ────────────────────────────────────
const CAT_RULES = [
  ["💡", ["гэрэл","гэрэлтүүлэг","lamp","led","фонар","дэнлүү"]],
  ["📹", ["камер","camera","cctv","видео"]],
  ["🚦", ["гэрлэн дохио","traffic","signal","светофор"]],
  ["🧰", ["засвар","repair","засах","тохируулах","угсрах","солих"]],
  ["⚠️", ["авар","аварга","гэмтэл","offline","доголдол","алдаа","тасарсан","шатсан"]],
  ["📦", ["материал","тоног","барилга","хэрэгсэл","нийлүүлэлт"]],
  ["👷", ["ажилтан","инженер","бригад","хяналт","шалгалт"]],
  ["🚗", ["машин","авто","техник","тээврийн"]]
];
function detectCategory(text) {
  const t = text.toLowerCase();
  for (const [icon, words] of CAT_RULES) {
    if (words.some(w => t.includes(w))) return icon;
  }
  return "📝";
}

// ── Status config ─────────────────────────────────────────────
const STATUS_CONFIG = {
  "Дууссан":    { dot: "🟢", cls: "st-done" },
  "Явж байна":  { dot: "🟡", cls: "st-progress" },
  "Саатсан":    { dot: "🔴", cls: "st-blocked" },
  "":           { dot: "",   cls: "" }
};

// ── Render one feed entry ──────────────────────────────────────
function renderEntry(e, myId, isAdmin) {
  const canDel = e.user_id === myId || isAdmin;
  const color  = avatarColor(e.user_id);
  const ini    = initials(e.full_name);
  const time   = fmt12(e.created_at);
  const cat    = e.category || detectCategory(e.content || "");
  const sc     = STATUS_CONFIG[e.status] || STATUS_CONFIG[""];

  const locationChip = e.location
    ? `<span class="ft-loc">📍 ${e.location}</span>` : "";
  const statusBadge = e.status
    ? `<span class="ft-status ${sc.cls}">${sc.dot} ${e.status}</span>` : "";

  // Before/After slider or single image
  let mediaHtml = "";
  if (e.before_image_url && e.image_url) {
    mediaHtml = `
    <div class="ft-ba-wrap">
      <div class="ft-ba-label ft-ba-left">BEFORE</div>
      <div class="ft-ba-label ft-ba-right">AFTER</div>
      <img class="ft-ba-before" src="${e.before_image_url}" alt="before">
      <img class="ft-ba-after"  src="${e.image_url}" alt="after">
      <input type="range" min="0" max="100" value="50" class="ft-ba-slider"
             oninput="window._ftBASlide(this)">
    </div>`;
  } else if (e.image_url) {
    mediaHtml = `<img class="ft-img" src="${e.image_url}"
                      onclick="window._ftZoom('${e.image_url}')" alt="зураг">`;
  }

  // Reactions
  const RXDEF = ["👍","⚠️","✅"];
  const rxMap = {};
  (e.reactions || []).forEach(r => { rxMap[r.reaction] = r; });
  const rxHtml = RXDEF.map(rx => {
    const r = rxMap[rx];
    const cnt = r ? r.cnt : 0;
    const tip = r ? r.names : "";
    return `<button class="ft-rx ${cnt>0?'ft-rx-active':''}" title="${tip}"
              onclick="window._ftReact(${e.id},'${rx}',this.closest('.ft-card'))"
            >${rx}${cnt > 0 ? `<span>${cnt}</span>` : ""}</button>`;
  }).join("");

  return `
  <div class="ft-row" data-id="${e.id}">
    <div class="ft-time-col">
      <div class="ft-time">${time}</div>
      <div class="ft-cat">${cat}</div>
      <div class="ft-dot-line"></div>
    </div>
    <div class="ft-card">
      <div class="ft-avatar" style="background:${color}">${ini}</div>
      <div class="ft-body">
        <div class="ft-meta">
          <span class="ft-name">${e.full_name}</span>
          ${e.position ? `<span class="ft-pos">${e.position}</span>` : ""}
          ${statusBadge}
          ${locationChip}
          ${canDel ? `<button class="ft-del" onclick="window._ftDelete(${e.id})" title="Устгах">✕</button>` : ""}
        </div>
        ${e.content ? `<div class="ft-text">${e.content.replace(/\n/g,"<br>")}</div>` : ""}
        ${mediaHtml}
        <div class="ft-reactions">${rxHtml}</div>
      </div>
    </div>
  </div>`;
}

// ── Summary panel ──────────────────────────────────────────────
function renderSummary(s, shift) {
  if (!s) return "";
  const statusRows = (s.byStatus||[]).map(r => {
    const sc = STATUS_CONFIG[r.status] || {dot:"📝"};
    return `<div class="sum-row"><span>${sc.dot} ${r.status||"Бусад"}</span><b>${r.n}</b></div>`;
  }).join("") || `<div class="sum-row" style="color:var(--ink4)">Мэдээлэл байхгүй</div>`;

  const catRows = (s.byCat||[]).map(r =>
    `<div class="sum-row"><span>${r.category||"📝"}</span><b>${r.n}</b></div>`
  ).join("");

  let shiftHtml = "";
  if (shift) {
    const ci = shift.clock_in  ? fmt12(shift.clock_in)  : "—";
    const co = shift.clock_out ? fmt12(shift.clock_out) : "—";
    shiftHtml = `
    <div class="sum-section">
      <div class="sum-label">Миний ажлын цаг</div>
      <div class="sum-row"><span>🟢 Эхэлсэн</span><b>${ci}</b></div>
      ${shift.clock_out ? `<div class="sum-row"><span>🔵 Дууссан</span><b>${co}</b></div>` : ""}
    </div>`;
  }

  return `
  <div class="ft-summary">
    <div class="sum-title">📊 Өнөөдрийн байдал</div>
    ${shiftHtml}
    <div class="sum-section">
      <div class="sum-label">Нийт бичлэг</div>
      <div class="sum-row"><span>📋 Нийт</span><b>${s.total||0}</b></div>
      ${statusRows}
    </div>
    ${catRows ? `<div class="sum-section"><div class="sum-label">Ангилал</div>${catRows}</div>` : ""}
    ${(s.shifted||[]).length > 0 ? `
    <div class="sum-section">
      <div class="sum-label">Ажилд ирсэн</div>
      ${s.shifted.map(sh=>`<div class="sum-row"><span>👷 ${sh.full_name}</span><b>${fmt12(sh.clock_in)}</b></div>`).join("")}
    </div>` : ""}
  </div>`;
}

// ── State ──────────────────────────────────────────────────────
let _entries = [];
let _currentDate = new Date().toISOString().slice(0, 10);
let _pollTimer = null;
let _myShift = null;

async function loadFeed(date) {
  const [feedRes, sumRes, shiftRes] = await Promise.all([
    fetch(`${API}/api/daily-feed?date=${date}`,         { headers: hdrs() }),
    fetch(`${API}/api/daily-feed/summary?date=${date}`, { headers: hdrs() }),
    fetch(`${API}/api/shift-log/today`,                 { headers: hdrs() })
  ]);
  if (!feedRes.ok) return;
  _entries  = await feedRes.json();
  const sum = sumRes.ok ? await sumRes.json() : null;
  _myShift  = shiftRes.ok ? await shiftRes.json() : null;
  renderFeed();
  const sp = document.getElementById("ft-summary-panel");
  if (sp) sp.innerHTML = renderSummary(sum, _myShift);
  updateShiftButtons();
}

function renderFeed() {
  const list = document.getElementById("ft-list");
  if (!list) return;
  const isAdmin = ["director","admin"].includes(state.me?.role);
  const uid = state.me?.id;
  if (_entries.length === 0) {
    list.innerHTML = `<div class="ft-empty">Энэ өдөр ямар ч бичлэг байхгүй байна</div>`;
    return;
  }
  list.innerHTML = _entries.map(e => renderEntry(e, uid, isAdmin)).join("");
  list.scrollTop = list.scrollHeight;
}

function updateShiftButtons() {
  const ci = document.getElementById("ft-clockin-btn");
  const co = document.getElementById("ft-clockout-btn");
  if (!ci || !co) return;
  if (!_myShift || !_myShift.clock_in) {
    ci.disabled = false; ci.classList.remove("ft-shift-active");
    co.disabled = true;
  } else if (_myShift.clock_in && !_myShift.clock_out) {
    ci.disabled = true;  ci.classList.add("ft-shift-active");
    co.disabled = false;
  } else {
    ci.disabled = true; co.disabled = true;
    ci.classList.add("ft-shift-active");
    co.classList.add("ft-shift-active");
  }
}

async function submitPost() {
  const textarea   = document.getElementById("ft-input");
  const fileInput  = document.getElementById("ft-file");
  const beforeInp  = document.getElementById("ft-before-file");
  const statusSel  = document.getElementById("ft-status-sel");
  const locationIn = document.getElementById("ft-location-in");

  const content  = textarea?.value.trim() || "";
  const afterFile = fileInput?.files?.[0];
  const beforeFile = beforeInp?.files?.[0];
  const status   = statusSel?.value || "";
  const location = locationIn?.value.trim() || "";
  const category = detectCategory(content);

  if (!content && !afterFile) { toast("Текст эсвэл зураг оруулна уу"); return; }

  const btn = document.getElementById("ft-send-btn");
  if (btn) btn.disabled = true;
  try {
    let res;
    if (afterFile || beforeFile) {
      const fd = new FormData();
      fd.append("content", content);
      if (afterFile)  fd.append("image", afterFile);
      if (beforeFile) fd.append("before_image", beforeFile);
      fd.append("status", status);
      fd.append("location", location);
      fd.append("category", category);
      res = await fetch(`${API}/api/daily-feed/upload`, {
        method: "POST", headers: hdrs(), body: fd
      });
    } else {
      res = await fetch(`${API}/api/daily-feed`, {
        method: "POST", headers: hdrs(true),
        body: JSON.stringify({ content, status, location, category })
      });
    }
    if (!res.ok) { toast((await res.json()).error || "Алдаа"); return; }
    const entry = await res.json();
    _entries.push(entry);
    renderFeed();
    // reset form
    if (textarea) textarea.value = "";
    if (fileInput)  { fileInput.value = ""; document.getElementById("ft-preview-after").style.display="none"; }
    if (beforeInp)  { beforeInp.value = ""; document.getElementById("ft-preview-before").style.display="none"; }
    if (statusSel)  statusSel.value = "";
    if (locationIn) locationIn.value = "";
    // refresh summary
    const sumRes = await fetch(`${API}/api/daily-feed/summary?date=${_currentDate}`, { headers: hdrs() });
    if (sumRes.ok) {
      const sp = document.getElementById("ft-summary-panel");
      if (sp) sp.innerHTML = renderSummary(await sumRes.json(), _myShift);
    }
  } finally { if (btn) btn.disabled = false; }
}

async function deleteEntry(id) {
  if (!confirm("Энэ бичлэгийг устгах уу?")) return;
  const res = await fetch(`${API}/api/daily-feed/${id}`, { method:"DELETE", headers: hdrs() });
  if (!res.ok) { toast("Устгаж чадсангүй"); return; }
  _entries = _entries.filter(e => e.id !== id);
  renderFeed();
}

async function reactEntry(id, reaction, cardEl) {
  const res = await fetch(`${API}/api/daily-feed/${id}/react`, {
    method: "POST", headers: hdrs(true),
    body: JSON.stringify({ reaction })
  });
  if (!res.ok) return;
  const rxs = await res.json();
  // update local entry
  const e = _entries.find(x => x.id === id);
  if (e) e.reactions = rxs;
  // re-render just the reactions bar
  const RXDEF = ["👍","⚠️","✅"];
  const rxMap = {};
  rxs.forEach(r => { rxMap[r.reaction] = r; });
  const bar = cardEl?.querySelector(".ft-reactions");
  if (bar) {
    bar.innerHTML = RXDEF.map(rx => {
      const r = rxMap[rx];
      const cnt = r ? r.cnt : 0;
      return `<button class="ft-rx ${cnt>0?'ft-rx-active':''}" title="${r?r.names:''}"
                onclick="window._ftReact(${id},'${rx}',this.closest('.ft-card'))"
              >${rx}${cnt>0?`<span>${cnt}</span>`:""}</button>`;
    }).join("");
  }
}

async function clockIn() {
  const res = await fetch(`${API}/api/shift-log/clock-in`, { method:"POST", headers: hdrs(true) });
  if (!res.ok) { toast("Алдаа гарлаа"); return; }
  const data = await res.json();
  _myShift = data.shift;
  updateShiftButtons();
  toast("🟢 Ажил эхэллээ!");
  await refreshSummary();
}

async function clockOut() {
  if (!confirm("Өдрийн ажлыг дуусгах уу?")) return;
  const res = await fetch(`${API}/api/shift-log/clock-out`, { method:"POST", headers: hdrs(true) });
  if (!res.ok) { const e=await res.json(); toast(e.error||"Алдаа"); return; }
  const data = await res.json();
  _myShift = { ..._myShift, clock_out: new Date().toISOString() };
  updateShiftButtons();
  const s = data.summary;
  toast(`🔵 Өдөр дууслаа! Нийт ${s.total_posts} бичлэг, ${s.done} дууссан.`);
  await refreshSummary();
}

async function refreshSummary() {
  const sumRes = await fetch(`${API}/api/daily-feed/summary?date=${_currentDate}`, { headers: hdrs() });
  if (sumRes.ok) {
    const sp = document.getElementById("ft-summary-panel");
    if (sp) sp.innerHTML = renderSummary(await sumRes.json(), _myShift);
  }
}

function baSlide(inp) {
  const wrap = inp.closest(".ft-ba-wrap");
  const before = wrap?.querySelector(".ft-ba-before");
  if (before) before.style.clipPath = `inset(0 ${100 - inp.value}% 0 0)`;
}

function zoomImage(src) {
  const o = document.createElement("div");
  o.className = "ft-zoom-overlay";
  o.innerHTML = `<img src="${src}"><div class="ft-zoom-close" onclick="this.parentElement.remove()">✕</div>`;
  o.onclick = e => { if (e.target === o) o.remove(); };
  document.body.appendChild(o);
}

function changeDate(dir) {
  const d = new Date(_currentDate);
  d.setDate(d.getDate() + dir);
  _currentDate = d.toISOString().slice(0, 10);
  const inp = document.getElementById("ft-date-inp");
  if (inp) inp.value = _currentDate;
  const isToday = _currentDate === new Date().toISOString().slice(0, 10);
  const pp = document.getElementById("ft-post-panel");
  if (pp) pp.style.display = isToday ? "" : "none";
  loadFeed(_currentDate);
}

// ── Main render ────────────────────────────────────────────────
export function timetable() {
  clearInterval(_pollTimer);
  _currentDate = new Date().toISOString().slice(0, 10);
  const uid   = state.me?.id || 0;
  const uname = state.me?.full_name || "";

  document.getElementById("main").innerHTML = `
  <div class="ft-layout">

    <!-- Left: timeline feed -->
    <div class="ft-left">
      <div class="ft-header">
        <div class="ft-title-block">
          <div class="ft-title">АЖЛЫН ӨДӨРдийн</div>
          <div class="ft-subtitle">OPERATIONAL LOG · FEED</div>
        </div>
        <div class="ft-nav">
          <button class="ft-nav-btn" onclick="window._ftChangeDate(-1)">‹ Өмнөх</button>
          <input type="date" class="ft-date-inp" id="ft-date-inp" value="${_currentDate}"
                 onchange="window._ftDateChange(this.value)">
          <button class="ft-nav-btn" onclick="window._ftChangeDate(1)">Дараах ›</button>
        </div>
      </div>

      <div class="ft-cols-header">
        <div class="ft-col-time">Цаг · Төрөл</div>
        <div class="ft-col-act">Үйл ажиллагаа</div>
      </div>

      <div class="ft-list" id="ft-list">
        <div class="ft-empty">Уншиж байна...</div>
      </div>

      <!-- Post form -->
      <div id="ft-post-panel" class="ft-post-panel">
        <div class="ft-post-avatar" style="background:${avatarColor(uid)}">${initials(uname)}</div>
        <div class="ft-post-right">
          <textarea id="ft-input" class="ft-textarea"
            placeholder="Юу хийж байна? Хаана байна?..."
            onkeydown="if(event.ctrlKey&&event.key==='Enter')window._ftSubmit()"></textarea>

          <div class="ft-post-meta-row">
            <select id="ft-status-sel" class="ft-select">
              <option value="">— Статус —</option>
              <option value="Явж байна">🟡 Явж байна</option>
              <option value="Дууссан">🟢 Дууссан</option>
              <option value="Саатсан">🔴 Саатсан</option>
            </select>
            <input id="ft-location-in" class="ft-loc-input" placeholder="📍 Байршил...">
          </div>

          <div class="ft-post-actions">
            <label class="ft-file-label">
              📷 After зураг
              <input type="file" id="ft-file" accept="image/*" style="display:none"
                     onchange="window._ftFilePreview(this,'ft-preview-after')">
            </label>
            <img id="ft-preview-after" style="display:none;height:44px;border-radius:6px;object-fit:cover;cursor:pointer"
                 onclick="document.getElementById('ft-file').value='';this.style.display='none'">

            <label class="ft-file-label" style="background:var(--amber2);border-color:var(--amber2);color:var(--amber)">
              🕐 Before зураг
              <input type="file" id="ft-before-file" accept="image/*" style="display:none"
                     onchange="window._ftFilePreview(this,'ft-preview-before')">
            </label>
            <img id="ft-preview-before" style="display:none;height:44px;border-radius:6px;object-fit:cover;cursor:pointer"
                 onclick="document.getElementById('ft-before-file').value='';this.style.display='none'">

            <span style="flex:1"></span>
            <span class="ft-hint">Ctrl+Enter</span>
            <button id="ft-send-btn" class="ft-send-btn" onclick="window._ftSubmit()">Илгээх</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: summary + shift -->
    <div class="ft-right">

      <!-- Shift control -->
      <div class="ft-shift-panel">
        <div class="ft-shift-title">⏱ Ажлын цаг</div>
        <div class="ft-shift-btns">
          <button id="ft-clockin-btn"  class="ft-shift-btn green"  onclick="window._ftClockIn()">🟢 Ажил эхэллээ</button>
          <button id="ft-clockout-btn" class="ft-shift-btn blue"   onclick="window._ftClockOut()" disabled>🔵 Өдөр дууслаа</button>
        </div>
      </div>

      <!-- Summary -->
      <div id="ft-summary-panel" class="ft-summary">
        <div class="sum-title">📊 Өнөөдрийн байдал</div>
        <div style="color:var(--ink4);font-size:13px;padding:8px 0">Уншиж байна...</div>
      </div>

    </div>

  </div>`;

  // Wire up globals
  window._ftSubmit     = submitPost;
  window._ftDelete     = deleteEntry;
  window._ftReact      = reactEntry;
  window._ftZoom       = zoomImage;
  window._ftChangeDate = changeDate;
  window._ftClockIn    = clockIn;
  window._ftClockOut   = clockOut;
  window._ftBASlide    = baSlide;
  window._ftDateChange = (val) => {
    _currentDate = val;
    const isToday = val === new Date().toISOString().slice(0, 10);
    const pp = document.getElementById("ft-post-panel");
    if (pp) pp.style.display = isToday ? "" : "none";
    loadFeed(val);
  };
  window._ftFilePreview = (input, previewId) => {
    const file = input.files?.[0];
    const el = document.getElementById(previewId);
    if (!file || !el) return;
    el.src = URL.createObjectURL(file);
    el.style.display = "block";
  };

  loadFeed(_currentDate);

  _pollTimer = setInterval(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (_currentDate === today) loadFeed(_currentDate);
  }, 20000);
}
