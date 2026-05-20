import { state, api, toast } from './modules/common.js';
import './modules/dashboard.js';
import './modules/assets.js';
import './modules/operations.js';
import './modules/warehouse.js';
import './modules/hr.js';
import './modules/docs.js';
import './modules/habea.js';
import './modules/reports.js';
import './modules/nyagtlan.js';
import './modules/nyarav.js';
import './modules/admin_hub.js';
import './modules/streetlights.js';
import './modules/lighting_schedule.js';
import './modules/lora_monitor.js';
import { timetable } from './modules/timetable.js';
import './modules/settings.js';

const roleMenus = {
  director:       ["dashboard","timetable","assets","attendance","work","hr","safety","plans","reports","report_schedule","audit",
                   "fin_dashboard","cash_journal","payables","receivables","fixed_ledger","payroll","fin_reports",
                   "nyarav_dash","nyarav_intake","nyarav_issue","nyarav_stock","nyarav_order","nyarav_report",
                   "sl_dashboard","settings"],
  chief_engineer: ["dashboard","timetable","assets","attendance","work","docs","safety","plans","reports",
                   "nyarav_dash","nyarav_intake","nyarav_issue","nyarav_stock","nyarav_order","nyarav_report",
                   "sl_dashboard","settings"],
  engineer:       ["dashboard","timetable","attendance","work","docs","reports","sl_dashboard","settings"],
  storekeeper:    ["dashboard","timetable","assets","attendance","reports",
                   "nyarav_dash","nyarav_intake","nyarav_issue","nyarav_stock","nyarav_order","nyarav_report",
                   "settings"],
  accountant:     ["dashboard","timetable","attendance","reports","report_schedule",
                   "fin_dashboard","cash_journal","payables","receivables","fixed_ledger","payroll","fin_reports",
                   "sl_dashboard","settings"],
  hr:             ["dashboard","timetable","attendance","hr","reports","report_schedule","payroll","settings"],
  safety:         ["dashboard","timetable","attendance","hr","safety","reports","settings"],
  camera_engineer:["dashboard","timetable","assets","attendance","work","docs","reports","settings"],
  worker:         ["dashboard","timetable","work","settings"]
};

const menuNames = {
  dashboard:     "📊 Нэгдсэн дэлгэц",
  timetable:     "📡 Ажлын өдрийн лог",
  assets:        "🏗 Объектийн бүртгэл",
  attendance:    "⏱ Ирц / цагийн бүртгэл",
  work:          "📅 Ажлын явц (Gantt)",
  materials:     "📦 Агуулах / Материал",
  expenses:      "💰 Зардал",
  admin_hub:     "🏛 Захиргаа / HR / Архив",
  hr:            "🏛 Хүний нөөцийн удирдлага",
  docs:          "📄 Бичиг / гомдол",
  safety:        "🦺 ХАБЭА",
  plans:         "📈 Төлөвлөгөө",
  reports:         "📑 Тайлан",
  report_schedule: "📋 Тайлангийн хуваарь",
  audit:           "🛡 Audit log",
  settings:        "⚙️ Тохиргоо",
  // Нягтлан
  fin_dashboard: "💼 Санхүүгийн самбар",
  cash_journal:  "📋 Мөнгөн хөрөнгийн журнал",
  payables:      "↓ Өглөг",
  receivables:   "↑ Авлага",
  fixed_ledger:  "🏢 Үндсэн хөрөнгийн бүртгэл",
  payroll:       "👷 Цалингийн тооцоо",
  fin_reports:   "📑 Санхүүгийн тайлан",
  // Нярав
  nyarav_dash:   "📦 Агуулахын самбар",
  nyarav_intake: "📥 Орлого",
  nyarav_issue:  "📤 Зарлага",
  nyarav_stock:  "🔢 Үлдэгдлийн бүртгэл",
  nyarav_order:  "📝 Захиалга",
  nyarav_report: "📊 Нярав тайлан",
  // Гэрэлтүүлгийн хөрөнгө
  sl_asset_road:   "💡 Авто замын гэрэл",
  sl_asset_ger:    "🏘️ Гэр хорооллын гэрэл",
  sl_asset_tower:  "🗼 Цамхагийн гэрэл",
  sl_asset_signal: "🚦 Гэрлэн дохио",
  sl_asset_panel:  "⚡ Шит/Самбар",
  // Гудамжны гэрэл
  sl_dashboard:  "💡 Гэрэлтүүлэг",
  sl_points:     "📍 Тоолуур шидний байршил",
  sl_readings:   "📊 Сарын уншилт",
  sl_bills:      "🧾 Нэхэмжлэл / Харьцуулалт",
  sl_budget:     "📊 Төлөвлөгөө / Гүйцэтгэл",
  sl_ger_list:   "🏘️ Гэр/цамхаг бүртгэл",
  sl_faults:     "⚡ Гэмтэл / Засварын бүртгэл",
  sl_light_sched: "🌙 Гэрэлтүүлгийн цаг тохиргоо",
  lora_monitor:   "📡 LoRaWAN хяналтын систем"
};

const menuGroups = [
  { label: "ХЯНАХ САМБАР",        items: ["dashboard"] },
  { label: "АЖЛЫН ӨДРИЙН ЛОГ",    items: ["timetable"] },
  { label: "ОБЪЕКТИЙН БҮРТГЭЛ",  items: ["assets"] },
  { label: "ҮЙЛДЛИЙН УДИРДЛАГА", items: ["attendance","work"] },
  { label: "БАЙГУУЛЛАГА",         items: ["hr","safety","plans","sl_dashboard"] },
  { label: "САНХҮҮ · НЯГТЛАН",   items: ["fin_dashboard","cash_journal","payables","receivables","fixed_ledger","payroll","fin_reports"] },
  { label: "САНХҮҮ · НЯРАВ",     items: ["nyarav_dash","nyarav_intake","nyarav_issue","nyarav_stock","nyarav_order","nyarav_report"] },
  { label: "ТАЙЛАН & ХЯНАЛТ",    items: ["reports","report_schedule","audit"] },
  { label: "ТОХИРГОО",    items: ["settings"] },
];

// ── Login UI ─────────────────────────────────────────────────

function renderLogin() {
  const remembered = localStorage.getItem("remembered_email") || "";
  const params = new URLSearchParams(location.search);
  const resetToken = params.get("reset_token");

  document.getElementById("app").innerHTML = `
  <div class="login">
    <div class="card">
      <div class="login-logo">
        <img src="/logo.jpg" onerror="this.style.display='none'"
             style="width:52px;height:52px;border-radius:12px;object-fit:contain;background:rgba(255,255,255,.08);padding:6px;border:1px solid rgba(255,255,255,.15)">
        <div>
          <div style="font-weight:800;font-size:18px;color:var(--ink);letter-spacing:-.02em">Чойбалсан хөгжил</div>
          <div style="font-size:11px;color:var(--ink3);letter-spacing:.06em">ОНӨҮГ · SMART CITY ERP</div>
        </div>
      </div>

      <!-- Login form -->
      <div id="loginView" style="${resetToken ? 'display:none' : ''}">
        <input class="input" id="loginEmail" type="text" placeholder="И-мэйл эсвэл нэвтрэх нэр"
               value="${remembered}" autocomplete="username"
               onkeydown="if(event.key==='Enter')document.getElementById('loginPassword').focus()">
        <input class="input" id="loginPassword" type="password" placeholder="Нууц үг"
               autocomplete="current-password"
               onkeydown="if(event.key==='Enter')login()">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink3);margin:4px 0 2px;cursor:pointer">
          <input type="checkbox" id="rememberMe" ${remembered ? 'checked' : ''}>
          И-мэйл сануулах
        </label>
        <div id="loginError" style="display:none;color:#ef4444;font-size:13px;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:2px"></div>
        <button class="btn" style="width:100%;margin-top:6px" onclick="login()">Нэвтрэх</button>
        <div style="text-align:center;margin-top:14px">
          <a href="#" style="font-size:13px;color:var(--blue);text-decoration:none"
             onclick="showForgotPassword();return false">Нууц үгээ мартсан уу?</a>
        </div>
      </div>

      <!-- Forgot password form -->
      <div id="forgotView" style="display:none">
        <div style="font-weight:700;font-size:15px;margin-bottom:6px">🔑 Нууц үг сэргээх</div>
        <p style="font-size:13px;color:var(--ink3);margin-bottom:14px">
          Бүртгэлтэй и-мэйл хаягаа оруулбал сэргээх холбоос илгээнэ.
        </p>
        <input class="input" id="forgotEmail" type="email" placeholder="И-мэйл хаяг"
               onkeydown="if(event.key==='Enter')forgotPassword()">
        <button class="btn" style="width:100%;margin-top:6px" onclick="forgotPassword()">Холбоос илгээх</button>
        <div style="text-align:center;margin-top:12px">
          <a href="#" style="font-size:13px;color:var(--ink3);text-decoration:none"
             onclick="showLoginView();return false">← Нэвтрэх хуудас руу буцах</a>
        </div>
      </div>

      <!-- Reset password form -->
      <div id="resetView" style="${resetToken ? '' : 'display:none'}">
        <div style="font-weight:700;font-size:15px;margin-bottom:6px">🔒 Шинэ нууц үг тохируулах</div>
        <p style="font-size:13px;color:var(--ink3);margin-bottom:14px">
          Нууц үг хамгийн багадаа 8 тэмдэгт байх ёстой.
        </p>
        <input class="input" id="resetPassword" type="password" placeholder="Шинэ нууц үг (8+ тэмдэгт)"
               autocomplete="new-password">
        <input class="input" id="resetPassword2" type="password" placeholder="Нууц үг давтах"
               autocomplete="new-password"
               onkeydown="if(event.key==='Enter')resetPassword()">
        <div id="resetError" style="display:none;color:#ef4444;font-size:13px;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:2px"></div>
        <button class="btn" style="width:100%;margin-top:6px" onclick="resetPassword()">Нууц үг шинэчлэх</button>
      </div>
    </div>
  </div>`;

  if (resetToken) window._resetToken = resetToken;
}

function showForgotPassword() {
  document.getElementById("loginView").style.display   = "none";
  document.getElementById("forgotView").style.display  = "block";
  document.getElementById("resetView").style.display   = "none";
  const fe = document.getElementById("forgotEmail");
  const le = document.getElementById("loginEmail");
  if (fe && le) fe.value = le.value;
  fe?.focus();
}

function showLoginView() {
  document.getElementById("loginView").style.display   = "block";
  document.getElementById("forgotView").style.display  = "none";
  document.getElementById("resetView").style.display   = "none";
  document.getElementById("loginEmail")?.focus();
}

async function login() {
  const email    = document.getElementById("loginEmail")?.value.trim();
  const password = document.getElementById("loginPassword")?.value;
  const remember = document.getElementById("rememberMe")?.checked;
  const errEl    = document.getElementById("loginError");

  if (errEl) errEl.style.display = "none";
  if (!email || !password) {
    if (errEl) { errEl.textContent = "И-мэйл болон нууц үгийг оруулна уу"; errEl.style.display = "block"; }
    return;
  }

  try {
    const r = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    if (remember) {
      localStorage.setItem("remembered_email", email);
    } else {
      localStorage.removeItem("remembered_email");
    }
    state.token = r.token;
    state.me    = r.user;
    localStorage.setItem("token", state.token);
    localStorage.setItem("me", JSON.stringify(state.me));
    history.replaceState(null, "", "/");
    init();
  } catch(e) {
    if (errEl) {
      errEl.textContent  = "И-мэйл эсвэл нууц үг буруу байна";
      errEl.style.display = "block";
    }
    document.getElementById("loginPassword")?.select();
  }
}

async function forgotPassword() {
  const email = document.getElementById("forgotEmail")?.value.trim();
  if (!email) { toast("И-мэйл хаяг оруулна уу"); return; }
  try {
    const r = await api("/api/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email })
    });
    const fv = document.getElementById("forgotView");
    if (fv) fv.innerHTML = `
      <div style="text-align:center;padding:12px 0">
        <div style="font-size:40px;margin-bottom:12px">📧</div>
        <div style="font-weight:700;margin-bottom:8px">Амжилттай илгээлээ!</div>
        <p style="font-size:13px;color:var(--ink3)">
          <b>${email}</b> хаяг руу сэргээх холбоос илгээлээ.<br>
          Хэдэн минутын дотор ирэх болно.
        </p>
        ${r.debug_link ? `<div style="margin-top:16px;padding:10px;background:#f0f9ff;border-radius:8px;font-size:11px;word-break:break-all;text-align:left;color:#0369a1">
          <b>SMTP тохиргоогүй тул холбоосыг шууд ашиглана уу:</b><br>
          <a href="${r.debug_link}" style="color:#2563eb">${r.debug_link}</a>
        </div>` : ""}
        <a href="#" style="display:block;margin-top:16px;font-size:13px;color:var(--ink3);text-decoration:none"
           onclick="showLoginView();return false">← Нэвтрэх хуудас руу буцах</a>
      </div>`;
  } catch(e) { toast(e.message || "Алдаа гарлаа"); }
}

async function resetPassword() {
  const pwd  = document.getElementById("resetPassword")?.value;
  const pwd2 = document.getElementById("resetPassword2")?.value;
  const errEl = document.getElementById("resetError");
  if (errEl) errEl.style.display = "none";

  if (!pwd || pwd.length < 8) {
    if (errEl) { errEl.textContent = "Нууц үг хамгийн багадаа 8 тэмдэгт байх ёстой"; errEl.style.display = "block"; }
    return;
  }
  if (pwd !== pwd2) {
    if (errEl) { errEl.textContent = "Нууц үг таарахгүй байна"; errEl.style.display = "block"; }
    return;
  }
  try {
    await api("/api/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: window._resetToken, password: pwd })
    });
    const rv = document.getElementById("resetView");
    if (rv) rv.innerHTML = `
      <div style="text-align:center;padding:12px 0">
        <div style="font-size:40px;margin-bottom:12px">✅</div>
        <div style="font-weight:700;margin-bottom:8px">Нууц үг шинэчлэгдлээ!</div>
        <p style="font-size:13px;color:var(--ink3)">Шинэ нууц үгээрээ нэвтэрч болно.</p>
      </div>`;
    history.replaceState(null, "", "/");
    setTimeout(() => renderLogin(), 2500);
  } catch(e) {
    if (errEl) { errEl.textContent = e.message || "Алдаа гарлаа"; errEl.style.display = "block"; }
  }
}

// ── Shell ────────────────────────────────────────────────────

function logout() {
  localStorage.clear();
  state.token = "";
  state.me    = null;
  renderLogin();
}

async function init() {
  if (!state.token) return renderLogin();
  try {
    state.users = await api("/api/users");
  } catch {
    return renderLogin();
  }
  renderShell();
  show("dashboard");
}

function renderSidebar(allowedMenus) {
  let html = '<div class="menu">';
  menuGroups.forEach(({ label, items }) => {
    const visible = items.filter(m => allowedMenus.includes(m));
    if (!visible.length) return;
    html += `<div class="side-label">${label}</div>`;
    visible.forEach(m => {
      const [icon, ...nameParts] = (menuNames[m] || m).split(" ");
      html += `<button onclick="show('${m}')" id="menu_${m}" class="${state.current === m ? 'active' : ''}">
        <span class="menu-icon">${icon}</span>${nameParts.join(" ")}
      </button>`;
    });
    html += '<div class="side-divider"></div>';
  });
  html += '</div>';
  return html;
}

const PERM_TO_MENUS = {
  dashboard:    ["dashboard"],
  assets:       ["assets"],
  warehouse:    ["nyarav_dash","nyarav_intake","nyarav_issue","nyarav_stock","nyarav_order","nyarav_report"],
  operations:   ["work"],
  reports:      ["reports","report_schedule"],
  docs:         ["docs"],
  streetlights: ["sl_dashboard","sl_asset_road","sl_asset_ger","sl_asset_tower","sl_asset_signal","sl_asset_panel","sl_points","sl_readings","sl_bills","sl_budget","sl_ger_list","sl_faults","sl_light_sched","lora_monitor"],
  ger_camhag:   ["sl_ger_list"],
  timetable:    ["timetable"],
  lora:         ["lora_monitor"],
  nyagtlan:     ["fin_dashboard","cash_journal","payables","receivables","fixed_ledger","payroll","fin_reports"],
  habea:        ["safety"],
  admin_hub:    ["hr","attendance","plans"],
  settings:     ["settings"],
};

function getAllowedMenus() {
  if (["director","chief_engineer"].includes(state.me.role)) {
    return roleMenus[state.me.role] || ["dashboard"];
  }
  // Role-ийн үндсэн эрхээс эхэлнэ — custom permissions нь зөвхөн нэмэлт эрх өгнө, хасахгүй
  const allowed = new Set(roleMenus[state.me.role] || ["dashboard"]);
  let p = {};
  try { if (state.me.permissions) p = JSON.parse(state.me.permissions); } catch(e) {}
  Object.entries(p).forEach(([key, v]) => {
    if (v?.view && PERM_TO_MENUS[key]) PERM_TO_MENUS[key].forEach(m => allowed.add(m));
  });
  return [...allowed];
}

function renderShell() {
  const allowed = getAllowedMenus();
  document.getElementById("app").innerHTML = `
  <div class="top">
    <div class="top-brand">
      <img src="/logo.jpg" onerror="this.style.display='none'" alt=""
           style="width:36px;height:36px;border-radius:8px;object-fit:contain">
      <div>
        <div class="brand-name">ЧОЙБАЛСАН ХӨГЖИЛ</div>
        <div class="brand-sub">ОНӨҮГ · SMART CITY ERP</div>
      </div>
    </div>
    <div class="top-center">
      <div class="top-search">🔍 Хайх...</div>
    </div>
    <div class="top-right" style="gap:14px;padding-right:4px">
      <div class="top-badge">ОНЛАЙН</div>
      <div id="topClock"></div>
      <div class="top-user">
        <b>${state.me.full_name}</b>
        <span>${state.me.role}</span>
      </div>
      <div class="top-avatar">${(state.me.full_name || "U")[0].toUpperCase()}</div>
      <button class="btn secondary sm" onclick="logout()">Гарах</button>
    </div>
  </div>
  <div class="layout">
    <aside class="side">${renderSidebar(allowed)}</aside>
    <main class="main" id="main"></main>
  </div>`;

  const clockEl = document.getElementById("topClock");
  if (clockEl) {
    const tick = () => {
      clockEl.textContent = new Date().toLocaleTimeString("mn-MN", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
    };
    tick();
    setInterval(tick, 1000);
  }
}

function updateActiveMenu(m) {
  document.querySelectorAll(".menu button").forEach(btn => {
    btn.classList.toggle("active", btn.id === `menu_${m}`);
  });
}

async function show(m) {
  state.current = m;
  updateActiveMenu(m);
  if (state.clockTimer) { clearInterval(state.clockTimer); state.clockTimer = null; }
  const fn = window[m];
  if (typeof fn === "function") return fn();
}

Object.assign(window, {
  login, logout, renderLogin, show,
  showForgotPassword, showLoginView, forgotPassword, resetPassword,
  timetable
});

init();
