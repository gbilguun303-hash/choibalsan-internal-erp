import { state, api, toast, today } from './common.js';
import { WORK_ORDER_STATUS, WORK_ORDER_FLOW, WORK_ORDER_STATUS_COLORS } from './work_order_constants.js';

let _works = [], _risks = [], _vehicles = [], _hseSnap = null, _engReport = null;
let _engHubTab = localStorage.getItem('engHub_tab') || 'overview';
const _engNow = new Date();
let _engReportYear = Number(localStorage.getItem('engReport_year') || _engNow.getFullYear());
let _engReportMonth = Number(localStorage.getItem('engReport_month') || (_engNow.getMonth() + 1));

// ── Main entry ────────────────────────────────────────────────

export async function eng_hub() {
  document.getElementById('main').innerHTML =
    `<div style="padding:40px;text-align:center;color:#94a3b8">Уншиж байна...</div>`;
  await _load();
  _render();
}

async function _load() {
  try {
    const now = new Date();
    const snapY = _engReportYear || now.getFullYear();
    const snapM = _engReportMonth || (now.getMonth() + 1);
    [_works, _risks, _vehicles] = await Promise.all([
      api('/api/work-logs'),
      api('/api/safety-reports'),
      api('/api/vehicles'),
    ]);
    const snaps = await api(`/api/hse-report-snapshots?period_type=monthly&year=${snapY}&month=${snapM}`).catch(() => []);
    _hseSnap = Array.isArray(snaps) ? (snaps[0] || null) : null;
    _engReport = await api(`/api/engineer-monthly-report?year=${snapY}&month=${snapM}`).catch(() => null);
  } catch { _works = []; _risks = []; _vehicles = []; _hseSnap = null; _engReport = null; }
}

/*
// ── Report section ────────────────────────────────────────────

function _reportSection() {
  const collapsed = localStorage.getItem('engReport_collapsed') === '1';
  const periodLbl = _repMode === 'monthly'
    ? `${_repYear}-${String(_repMonth).padStart(2,'0')}`
    : String(_repYear);
  return `
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;margin-bottom:16px;overflow:hidden;border-top:3px solid #0369a1">
    <div onclick="engToggleReport()" style="padding:13px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none">
      <div style="font-size:13px;font-weight:800;color:#0c4a6e">📊 ХАБЭА Тайлан — Сар / Жил</div>
      <span id="engRepArr" style="font-size:11px;color:#64748b;font-weight:700">${collapsed ? '▼ Нээх' : '▲ Хаах'}</span>
    </div>
    <div id="engRepBody" style="display:${collapsed ? 'none' : ''}">
      <div style="padding:10px 16px;border-top:1px solid #f1f5f9;background:#f0f9ff;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div style="display:flex;border:1.5px solid #bae6fd;border-radius:7px;overflow:hidden">
          <button id="engRepBtnM" onclick="engRepSetMode('monthly')"
            style="padding:5px 14px;font-size:12px;font-weight:700;cursor:pointer;border:none;background:${_repMode==='monthly'?'#0369a1':'#fff'};color:${_repMode==='monthly'?'#fff':'#64748b'}">Сарын</button>
          <button id="engRepBtnA" onclick="engRepSetMode('annual')"
            style="padding:5px 14px;font-size:12px;font-weight:700;cursor:pointer;border:none;border-left:1.5px solid #bae6fd;background:${_repMode==='annual'?'#0369a1':'#fff'};color:${_repMode==='annual'?'#fff':'#64748b'}">Жилийн</button>
        </div>
        <button onclick="engRepPrev()" style="padding:5px 10px;border:1px solid #bae6fd;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;font-weight:700;color:#0369a1">‹</button>
        <span id="engRepPeriodLabel" style="font-size:13px;font-weight:800;color:#0c4a6e;min-width:80px;text-align:center">${periodLbl}</span>
        <button onclick="engRepNext()" style="padding:5px 10px;border:1px solid #bae6fd;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;font-weight:700;color:#0369a1">›</button>
        <button onclick="engLoadReport()" style="padding:5px 14px;border:none;border-radius:6px;background:#0369a1;color:#fff;cursor:pointer;font-size:12px;font-weight:700">↻ Харах</button>
        <div style="margin-left:auto;display:flex;gap:6px">
          <button onclick="engSaveReport()" style="padding:5px 14px;border:none;border-radius:6px;background:#15803d;color:#fff;cursor:pointer;font-size:12px;font-weight:700">💾 Хадгалах</button>
          <button onclick="engPrintReport()" style="padding:5px 14px;border:none;border-radius:6px;background:#1e40af;color:#fff;cursor:pointer;font-size:12px;font-weight:700">🖨 Хэвлэх</button>
        </div>
      </div>
      <div id="engRepContent" style="padding:16px">
        <div style="text-align:center;color:#94a3b8;font-size:12px;padding:24px">↑ "Харах" дарж тайланг ачаална уу</div>
      </div>
    </div>
  </div>`;
}

function engToggleReport() {
  const b = document.getElementById('engRepBody');
  if (!b) return;
  const nowOpen = b.style.display === 'none';
  b.style.display = nowOpen ? '' : 'none';
  const arr = document.getElementById('engRepArr');
  if (arr) arr.textContent = nowOpen ? '▲ Хаах' : '▼ Нээх';
  localStorage.setItem('engReport_collapsed', nowOpen ? '0' : '1');
  if (nowOpen) engLoadReport();
}

function engRepSetMode(mode) {
  _repMode = mode;
  ['engRepBtnM','engRepBtnA'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const active = (id === 'engRepBtnM' && mode === 'monthly') || (id === 'engRepBtnA' && mode === 'annual');
    btn.style.background = active ? '#0369a1' : '#fff';
    btn.style.color      = active ? '#fff'     : '#64748b';
  });
  _engRepUpdateLabel();
  engLoadReport();
}

function engRepPrev() {
  if (_repMode === 'monthly') { _repMonth--; if (_repMonth < 1) { _repMonth = 12; _repYear--; } }
  else { _repYear--; }
  _engRepUpdateLabel();
  engLoadReport();
}

function engRepNext() {
  if (_repMode === 'monthly') { _repMonth++; if (_repMonth > 12) { _repMonth = 1; _repYear++; } }
  else { _repYear++; }
  _engRepUpdateLabel();
  engLoadReport();
}

function _engRepUpdateLabel() {
  const lbl = document.getElementById('engRepPeriodLabel');
  if (lbl) lbl.textContent = _repMode === 'monthly'
    ? `${_repYear}-${String(_repMonth).padStart(2,'0')}`
    : String(_repYear);
}

async function engLoadReport() {
  const el = document.getElementById('engRepContent');
  if (!el) return;
  el.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:24px">Уншиж байна...</div>`;
  try {
    const url = _repMode === 'monthly'
      ? `/api/hse-report-snapshots?period_type=monthly&year=${_repYear}&month=${_repMonth}`
      : `/api/hse-report-snapshots?period_type=annual&year=${_repYear}`;
    const rows = await api(url);
    const snap = Array.isArray(rows) ? (rows[0] || null) : null;
    el.innerHTML = _engRepHtml(snap);
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:12px">Алдаа: ${escHtml(e.message)}</div>`;
  }
}

function _engRepHtml(snap) {
  if (!snap) return `
    <div style="text-align:center;padding:28px">
      <div style="font-size:22px;margin-bottom:8px">📭</div>
      <div style="font-size:13px;font-weight:700;color:#94a3b8">Тайлан хадгалагдаагүй байна</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px">💾 "Хадгалах" дарж шинээр тайлан хадгалах боломжтой</div>
    </div>`;

  const d   = snap.data || {};
  const src = snap.source === 'auto' ? '🤖 Автоматаар' : '👤 Гараар';
  const at  = (snap.created_at || '').slice(0, 10);

  const kpiGrid = rows => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:14px">
    ${rows.map(([lbl, val, col]) => `
      <div style="background:#f8fafc;border-radius:8px;padding:9px 12px;border-left:3px solid ${col||'#e2e8f0'}">
        <div style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:3px">${lbl}</div>
        <div style="font-size:20px;font-weight:900;color:${col||'#1e293b'}">${val ?? '—'}</div>
      </div>`).join('')}
  </div>`;

  const sectionTitle = t => `<div style="font-size:10px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 8px;padding-bottom:5px;border-bottom:2px solid #f1f5f9">${t}</div>`;

  const statusBar = `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#ecfeff;border-radius:8px;margin-bottom:14px;font-size:11px">
    <div style="color:#0891b2;font-weight:800">📊 ${escHtml(snap.title || 'Тайлан')}</div>
    <div style="color:#64748b">${src} · ${at}</div>
  </div>`;

  if (_repMode === 'monthly') {
    return statusBar +
      sectionTitle('Эрсдэл') +
      kpiGrid([
        ['Нийт эрсдэл',         d.risk_total,         '#0369a1'],
        ['Хаагдсан',            d.risk_closed,        '#15803d'],
        ['Өндөр / Маш өндөр',   d.risk_high,          d.risk_high > 0 ? '#dc2626' : '#15803d'],
        ['Нээлттэй үлдсэн',     d.closing_open_count, d.closing_open_count > 0 ? '#d97706' : '#15803d'],
      ]) +
      sectionTitle('PTW & Ажлын хяналт') +
      kpiGrid([
        ['PTW нийт',     d.ptw_total,       '#7c3aed'],
        ['Pre зөвшөөрөл', d.pre_approved,   '#0369a1'],
        ['Post шалгалт', d.post_checked,    '#0369a1'],
        ['Post буцаасан', d.post_rejected,  d.post_rejected > 0 ? '#dc2626' : '#15803d'],
      ]) +
      sectionTitle('Техник хэрэгсэл & Засвар') +
      kpiGrid([
        ['Нийт техник',    d.vehicle_total,        '#1e293b'],
        ['Өдрийн үзлэг',   d.daily_inspections,    '#2563eb'],
        ['Доголдолтой',    d.daily_failed,          d.daily_failed > 0 ? '#dc2626' : '#15803d'],
        ['Сарын үзлэг',    d.monthly_inspections,  '#2563eb'],
        ['Засвар нийт',    d.repairs_total,        '#1e293b'],
        ['Засвар дууссан', d.repairs_done,          '#15803d'],
      ]);
  }

  // Annual
  const months = Array.isArray(d.months) ? d.months : [];
  const monthRows = months.map((m, i) => `
    <tr style="background:${i%2?'#f8fafc':'#fff'};border-bottom:1px solid #f1f5f9">
      <td style="padding:6px 10px;font-weight:700;color:#0369a1">${m.period || `${m.year}-${String(m.month||'').padStart(2,'0')}`}</td>
      <td style="padding:6px 10px;text-align:center">${m.risk_total??'—'}</td>
      <td style="padding:6px 10px;text-align:center;color:#15803d">${m.risk_closed??'—'}</td>
      <td style="padding:6px 10px;text-align:center;color:${(m.risk_high||0)>0?'#dc2626':'#15803d'}">${m.risk_high??'—'}</td>
      <td style="padding:6px 10px;text-align:center">${m.ptw_total??'—'}</td>
      <td style="padding:6px 10px;text-align:center">${m.pre_approved??'—'}</td>
      <td style="padding:6px 10px;text-align:center">${m.post_checked??'—'}</td>
      <td style="padding:6px 10px;text-align:center">${m.repairs_total??'—'}</td>
    </tr>`).join('') || `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:16px">Сарын тайлан хадгалагдаагүй байна</td></tr>`;

  return statusBar +
    sectionTitle('Жилийн нэгтгэл') +
    kpiGrid([
      ['Нийт эрсдэл',    d.risk_total,         '#0369a1'],
      ['Хаагдсан',       d.risk_closed,        '#15803d'],
      ['Өндөр эрсдэл',   d.risk_high,          d.risk_high > 0 ? '#dc2626' : '#15803d'],
      ['PTW нийт',       d.ptw_total,          '#7c3aed'],
      ['Pre зөвшөөрөл',  d.pre_approved,       '#0369a1'],
      ['Post шалгалт',   d.post_checked,       '#0369a1'],
      ['Засвар нийт',    d.repairs_total,      '#1e293b'],
      ['Хадгалсан сар',  d.months_saved,       '#2563eb'],
    ]) +
    sectionTitle(`Сар бүрийн дэлгэрэнгүй — ${d.months_saved || 0} сар`) +
    `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="background:#f1f5f9;color:#374151">
        <th style="padding:7px 10px;text-align:left">Сар</th>
        <th style="padding:7px 10px">Эрсдэл</th>
        <th style="padding:7px 10px">Хаасан</th>
        <th style="padding:7px 10px">Өндөр</th>
        <th style="padding:7px 10px">PTW</th>
        <th style="padding:7px 10px">Pre</th>
        <th style="padding:7px 10px">Post</th>
        <th style="padding:7px 10px">Засвар</th>
      </tr></thead>
      <tbody>${monthRows}</tbody>
    </table></div>`;
}

async function engSaveReport() {
  const period = _repMode === 'monthly'
    ? `${_repYear}-${String(_repMonth).padStart(2,'0')}`
    : String(_repYear);
  if (!confirm(`"${period}" тайланг хадгалах уу?\n(Байгаа бол дахин бичнэ)`)) return;
  try {
    const url  = _repMode === 'monthly' ? '/api/hse-report-snapshots/monthly' : '/api/hse-report-snapshots/annual';
    const body = _repMode === 'monthly' ? { year: _repYear, month: _repMonth } : { year: _repYear };
    await api(url, { method: 'POST', body: JSON.stringify(body) });
    toast(`✅ ${period} тайлан хадгалагдлаа`);
    await engLoadReport();
    await _load(); _render();
  } catch(e) { toast('Алдаа: ' + escHtml(e.message)); }
}

function engPrintReport() {
  const el = document.getElementById('engRepContent');
  if (!el) return;
  const period = _repMode === 'monthly'
    ? `${_repYear}-${String(_repMonth).padStart(2,'0')}`
    : `${_repYear} жил`;
  const win = window.open('', '_blank', 'width=960,height=720');
  if (!win) { toast('Pop-up хориглогдсон байна — хөтчийн тохиргоог шалгана уу'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>ХАБЭА Тайлан ${period}</title>
    <style>
      body{font-family:'Arial',sans-serif;padding:24px;color:#1e293b}
      h2{margin:0 0 4px;font-size:18px} h3{margin:0 0 16px;font-size:13px;color:#64748b;font-weight:400}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px}
      th,td{border:1px solid #e2e8f0;padding:6px 10px}
      th{background:#f1f5f9;font-weight:700;text-align:left}
      .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
      .kpi{background:#f8fafc;border-radius:6px;padding:8px 12px;border:1px solid #e2e8f0}
      .kpi-label{font-size:10px;color:#64748b;margin-bottom:3px}
      .kpi-val{font-size:18px;font-weight:800}
      @media print{body{padding:10px}}
    </style>
  </head><body>
    <h2>ХАБЭА Тайлан — ${period}</h2>
    <h3>Чойбалсан Хөгжил ОНӨҮГ · ${today()}</h3>
    ${el.innerHTML}
    <script>window.onload=()=>window.print()<\/script>
  </body></html>`);
  win.document.close();
}

*/

// ── Role guide ────────────────────────────────────────────────

function _roleGuide() {
  return `
  <div style="background:#fff;border:1px solid #dbeafe;border-left:4px solid #2563eb;border-radius:12px;margin-bottom:16px;padding:12px 16px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:#475569">
      <b style="font-size:13px;color:#1e40af">🔧 Ерөнхий инженерийн ажлын урсгал</b>
      <span>Гэрэлтүүлэг / камер / засварын ажлын явцыг нэгтгэж харна</span>
      <span style="color:#cbd5e1">→</span>
      <span>саатал, эрсдэл, нөөцийн асуудлыг илрүүлнэ</span>
      <span style="color:#cbd5e1">→</span>
      <span>ХАБЭА шалгасан ажлыг техникийн хувьд эцэслэн хаана</span>
    </div>
  </div>`;

  const key = 'eng';
  const collapsed = localStorage.getItem('roleGuide_' + key) === '1';
  return `
  <div style="background:#fff;border:1px solid #dbeafe;border-left:4px solid #2563eb;border-radius:12px;margin-bottom:16px;overflow:hidden">
    <div onclick="window._toggleRoleGuide('${key}')" style="padding:11px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;background:#f0f9ff;user-select:none">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:18px">🔧</span>
        <div>
          <div style="font-size:13px;font-weight:800;color:#1e40af">Ерөнхий Инженер — Ажлын байрны тодорхойлолт</div>
          <div style="font-size:10px;color:#3b82f6;margin-top:1px">Таны үүрэг, хариуцлага, ажлын дараалал дахь байр суурь</div>
        </div>
      </div>
      <span id="rg_arr_${key}" style="color:#64748b;font-size:11px;font-weight:700">${collapsed ? '▼ Харуулах' : '▲ Нуух'}</span>
    </div>
    <div id="rg_body_${key}" style="display:${collapsed ? 'none' : ''};padding:14px 16px;border-top:1px solid #dbeafe">

      <div style="margin-bottom:12px">
        <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">WORKFLOW — ТАНЫ ҮҮРЭГ ХААНА БАЙДАГ ВЭ</div>
        <div style="display:flex;align-items:center;gap:3px;flex-wrap:wrap;font-size:11px">
          <span style="padding:4px 10px;border-radius:6px;background:#f1f5f9;color:#64748b">📋 Ажил үүсгэх</span>
          <span style="color:#cbd5e1">→</span>
          <span style="padding:4px 10px;border-radius:6px;background:#f0fdf4;color:#16a34a">🦺 ХАБЭА pre</span>
          <span style="color:#cbd5e1">→</span>
          <span style="padding:4px 10px;border-radius:6px;background:#eff6ff;color:#2563eb">⚙️ Гүйцэтгэл</span>
          <span style="color:#cbd5e1">→</span>
          <span style="padding:4px 10px;border-radius:6px;background:#fefce8;color:#ca8a04">📬 Илгээх</span>
          <span style="color:#cbd5e1">→</span>
          <span style="padding:4px 10px;border-radius:6px;background:#ecfeff;color:#0891b2">🦺 ХАБЭА post</span>
          <span style="color:#cbd5e1">→</span>
          <span style="padding:4px 10px;border-radius:6px;background:#1e40af;color:#fff;font-weight:800">✓ ТАНЫ БАТЛАЛ</span>
          <span style="color:#cbd5e1">→</span>
          <span style="padding:4px 10px;border-radius:6px;background:#f0fdf4;color:#16a34a">✅ Хаагдсан</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:11px">
        <div style="background:#f8fafc;border-radius:8px;padding:10px 12px">
          <div style="font-weight:800;color:#1e293b;margin-bottom:6px">✅ Таны хийх зүйл</div>
          <div style="color:#475569;line-height:1.8">
            • <b>Зөвхөн "ХАБЭА шалгасан"</b> статустай ажлыг батлах<br>
            • Гүйцэтгэлийн бүртгэл, зураг бүрэн эсэхийг шалгах<br>
            • ХАБЭА эхлэлт болон дуусгалтын шалгалт хийгдсэн эсэхийг баталгаажуулах<br>
            • Акт хэвлэж архивлах<br>
            • Буцаагдсан ажлыг хянаж, шалтгааныг мэдэгдэх
          </div>
        </div>
        <div style="background:#fff7ed;border-radius:8px;padding:10px 12px;border:1px solid #fed7aa">
          <div style="font-weight:800;color:#9a3412;margin-bottom:6px">⚠️ Анхааруулга</div>
          <div style="color:#7c2d12;line-height:1.8">
            • ХАБЭА шалгаагүй ажлыг <b>батлах ёсгүй</b><br>
            • Зураг болон гүйцэтгэлийн бүртгэлгүй ажлыг <b>буцаах</b><br>
            • Яаравчлан батлахгүй — шалгаад батална уу<br>
            • Эцсийн батлал нь хуулийн баримт болно
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

// ── Engineering dashboard metrics ─────────────────────────────

const CLOSED_STATUSES = new Set(WORK_ORDER_FLOW.CLOSED);
const ACTIVE_STATUSES = new Set(WORK_ORDER_FLOW.ACTIVE);

function _isClosedWork(w) {
  return CLOSED_STATUSES.has(w.status);
}

function _dateValue(v) {
  if (!v) return null;
  const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function _monthBounds(monthPrefix) {
  const [y, m] = String(monthPrefix || '').split('-').map(Number);
  if (!y || !m) return { start: '', end: '' };
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { start, end };
}

function _workStartDate(w) {
  return String(w?.start_date || w?.work_date || '').slice(0, 10);
}

function _workEndDate(w) {
  return String(w?.end_date || w?.start_date || w?.work_date || '').slice(0, 10);
}

function _monthWorks(rows, monthPrefix) {
  return rows.filter(w => _workStartDate(w).startsWith(monthPrefix));
}

function _isClosedByMonthEnd(w, monthPrefix) {
  if (!_isClosedWork(w)) return false;
  const { end } = _monthBounds(monthPrefix);
  if (!end) return true;
  const closedAt = String(w.confirmed_at || w.habea_post_at || w.updated_at || w.end_date || w.work_date || '').slice(0, 10);
  return !closedAt || closedAt < end;
}

function _isOverdue(w) {
  if (_isClosedWork(w)) return false;
  if ([WORK_ORDER_STATUS.DONE, WORK_ORDER_STATUS.SUBMITTED_DONE, WORK_ORDER_STATUS.HSE_CHECKED].includes(w.status)) return false;
  const due = _dateValue(w.end_date || w.work_date);
  const now = _dateValue(today());
  return !!(due && now && due < now);
}

function _workDomain(w) {
  const text = `${w.category || ''} ${w.department || ''} ${w.title || ''}`.toLowerCase();
  if (text.includes('камер') || text.includes('camera')) return 'Камер';
  if (text.includes('гэрэл') || text.includes('гэрэлтүүл') || text.includes('lighting') || text.includes('гудамж')) return 'Гэрэлтүүлэг';
  if (text.includes('засвар')) return 'Засвар';
  return w.category || 'Бусад';
}

function _categoryStats(rows) {
  const map = new Map();
  rows.forEach(w => {
    const key = _workDomain(w);
    const row = map.get(key) || { name: key, total: 0, active: 0, closed: 0, overdue: 0, hse: 0, pending: 0, progress: 0, items: [] };
    row.total += 1;
    row.progress += Number(w.progress || 0);
    row.items.push(w);
    if (ACTIVE_STATUSES.has(w.status)) row.active += 1;
    if (_isClosedWork(w)) row.closed += 1;
    if (_isOverdue(w)) row.overdue += 1;
    if (w.status === WORK_ORDER_STATUS.SUBMITTED_DONE) row.hse += 1;
    if (w.status === WORK_ORDER_STATUS.HSE_CHECKED) row.pending += 1;
    map.set(key, row);
  });
  return Array.from(map.values())
    .map(r => ({
      ...r,
      avg: r.total ? Math.round(r.progress / r.total) : 0,
      items: r.items.sort((a, b) => {
        const ao = _isOverdue(a) ? 0 : 1;
        const bo = _isOverdue(b) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return String(a.end_date || a.work_date || '').localeCompare(String(b.end_date || b.work_date || ''));
      })
    }))
    .sort((a, b) => b.total - a.total);
}

function _nextMonthCarry(rows, monthPrefix) {
  return _monthWorks(rows, monthPrefix).filter(w => !_isClosedByMonthEnd(w, monthPrefix));
}

function _hseSnapshotNotice(monthPrefix) {
  const snapLabel = _hseSnap
    ? (_hseSnap.source === 'auto'
        ? `Автоматаар хадгалсан · ${(_hseSnap.created_at||'').slice(0,10)}`
        : `Гараар хадгалсан · ${(_hseSnap.created_at||'').slice(0,10)}`)
    : 'ХАБЭА сарын snapshot хадгалагдаагүй';
  const color = _hseSnap ? '#15803d' : '#b45309';
  const bg = _hseSnap ? '#f0fdf4' : '#fffbeb';
  const border = _hseSnap ? '#86efac' : '#fde68a';
  return `<div style="font-size:11px;display:flex;align-items:center;gap:8px;padding:7px 12px;background:${bg};border-radius:8px;border:1px solid ${border};margin-bottom:14px;color:${color};font-weight:600">
    <span>🦺 ${monthPrefix} ХАБЭА тайлан:</span>
    <span>${snapLabel}</span>
    <span style="margin-left:auto;color:#64748b;font-weight:500">Ерөнхий инженер эндээс хадгалахгүй, зөвхөн төлөв харна.</span>
  </div>`;
}

function _reportNotesPanel(monthPrefix) {
  const r = _engReport || {};
  const y = Number(r.year || _engReportYear || new Date().getFullYear());
  const m = Number(r.month || _engReportMonth || new Date().getMonth() + 1);
  const years = Array.from({ length: 5 }, (_, i) => y - 2 + i);
  const period = `${y}-${String(m).padStart(2, '0')}`;
  const closedActs = _works.filter(w =>
    (w.status === WORK_ORDER_STATUS.CLOSED || w.confirm_status === 'eng_final_confirmed') &&
    String(w.confirmed_at || w.habea_post_at || w.end_date || w.work_date || '').startsWith(period)
  );
  const field = (id, label, value, ph) => `
    <label style="display:block;font-size:11px;font-weight:800;color:#475569;margin-bottom:5px">${label}</label>
    <textarea id="${id}" class="input" rows="3" style="resize:vertical;width:100%;box-sizing:border-box;margin-bottom:10px;font-size:12px"
      placeholder="${escHtml(ph)}">${escHtml(value || '')}</textarea>`;
  const issueField = `
    <label style="display:block;font-size:11px;font-weight:800;color:#475569;margin-bottom:5px">Саатал, асуудал</label>
    <textarea id="engRptIssues" class="input" rows="3" style="resize:vertical;width:100%;box-sizing:border-box;margin-bottom:7px;font-size:12px"
      placeholder="Материал, хүн хүч, техник, ХАБЭА, цаг агаарын саатлыг бичнэ.">${escHtml(r.issue_note || '')}</textarea>
    <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px">
      <button onclick="engShowIssueHistory()" style="padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#475569;cursor:pointer;font-size:11px;font-weight:800">Өмнөх саатлууд</button>
      <button onclick="engAnalyzeIssues()" style="padding:6px 10px;border:none;border-radius:8px;background:#0f766e;color:#fff;cursor:pointer;font-size:11px;font-weight:800">AI дүгнэлт санал гаргах</button>
    </div>
    <div id="engIssueAiBox" style="display:none;margin-bottom:10px;padding:10px 12px;border:1px solid #99f6e4;background:#f0fdfa;border-radius:10px;font-size:11px;color:#0f766e;line-height:1.55"></div>`;
  return `
  <div style="background:#fff;border:1px solid #e2e6ed;border-radius:14px;overflow:hidden;margin-bottom:16px;border-top:3px solid #1e40af">
    <div style="padding:13px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div>
        <div style="font-size:13px;font-weight:800;color:#1e293b">📝 Ерөнхий инженерийн сарын тэмдэглэл</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:2px">${period} сарын тайланд орох дүгнэлтүүд</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <select id="engRptYear" class="input" onchange="engChangeMonthlyPeriod()" style="width:105px;padding:7px 9px;font-size:12px">
          ${years.map(yy => `<option value="${yy}" ${yy === y ? 'selected' : ''}>${yy}</option>`).join('')}
        </select>
        <select id="engRptMonth" class="input" onchange="engChangeMonthlyPeriod()" style="width:105px;padding:7px 9px;font-size:12px">
          ${Array.from({ length: 12 }, (_, i) => i + 1).map(mm => `<option value="${mm}" ${mm === m ? 'selected' : ''}>${mm}-р сар</option>`).join('')}
        </select>
        <button onclick="engSaveMonthlyNotes()" style="padding:7px 12px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;color:#1e40af;cursor:pointer;font-size:12px;font-weight:800">💾 Хадгалах</button>
        <button onclick="engGenerateMonthlyReport()" style="padding:7px 12px;border:none;border-radius:8px;background:#1e40af;color:#fff;cursor:pointer;font-size:12px;font-weight:800">📄 Тайлангийн ноорог гаргах</button>
      </div>
    </div>
    <div style="padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div>
        ${field('engRptSummary', 'Сарын ерөнхий дүгнэлт', r.summary_note, 'Энэ сард ажлын явц, гол үр дүн ямар байсан бэ?')}
        ${issueField}
        ${field('engRptResources', 'Нөөц, материал, техник хэрэгцээ', r.resource_note, 'Дараагийн шийдвэрлэх шаардлагатай нөөцийн асуудал.')}
      </div>
      <div>
        ${field('engRptNext', 'Дараа сарын чиглэл', r.next_plan_note, 'Шилжих ажлууд болон түрүүлж хийх чиглэл.')}
        ${field('engRptConclusion', 'Тайланд орох эцсийн дүгнэлт', r.conclusion_note, 'Удирдлагад хэлэх товч, албан дүгнэлт.')}
        <div style="font-size:11px;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;line-height:1.5">
          Системийн тоон үзүүлэлтүүд автоматаар орно. Энэ хэсэгт зөвхөн инженерийн тайлбар, шалтгаан, шийдвэрийн санал бичнэ.
        </div>
      </div>
    </div>
  </div>

  <div style="background:#fff;border:1px solid #e2e6ed;border-radius:14px;overflow:hidden;margin-bottom:16px;border-top:3px solid #1e40af">
    <div style="padding:13px 16px;border-bottom:1px solid #dbeafe;background:#eff6ff;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div>
        <div style="font-size:13px;font-weight:900;color:#1e40af">🖨 Сарын тайланд хавсаргах зөвшөөрлийн актууд</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${period} сард хаагдсан ажлын актуудыг эндээс шууд хэвлэнэ</div>
      </div>
      <span style="font-size:12px;font-weight:900;color:#1e40af;background:#dbeafe;border-radius:20px;padding:5px 12px">${closedActs.length} акт</span>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:920px">
        <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
          <th style="padding:10px 12px;text-align:left;width:52px">№</th>
          <th style="padding:10px 12px;text-align:left">Ажил / байршил</th>
          <th style="padding:10px 12px;text-align:left">Гүйцэтгэгч</th>
          <th style="padding:10px 12px;text-align:left">ХАБЭА шалгасан</th>
          <th style="padding:10px 12px;text-align:left">Ерөнхий инженер баталсан</th>
          <th style="padding:10px 12px;text-align:center">Үйлдэл</th>
        </tr></thead>
        <tbody>
          ${closedActs.length ? closedActs.map((w, i) => `<tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:10px 12px;color:#64748b">${i + 1}</td>
            <td style="padding:10px 12px">
              <div style="font-weight:800;color:#1e293b">${escHtml(w.title || '—')}</div>
              <div style="font-size:11px;color:#64748b;margin-top:2px">${escHtml(w.location || '—')} · ${escHtml(w.category || '—')}</div>
            </td>
            <td style="padding:10px 12px">${escHtml(w.assigned_name || '—')}</td>
            <td style="padding:10px 12px">
              <div>${escHtml(w.habea_post_name || '—')}</div>
              <div style="font-size:11px;color:#64748b">${escHtml((w.habea_post_at || '—').slice(0,16))}</div>
            </td>
            <td style="padding:10px 12px">
              <div>${escHtml(w.confirmed_name || '—')}</div>
              <div style="font-size:11px;color:#64748b">${escHtml((w.confirmed_at || '—').slice(0,16))}</div>
            </td>
            <td style="padding:10px 12px;text-align:center">
              <button onclick="engPrintApprovalAct(${w.id})" style="padding:6px 12px;border:none;border-radius:8px;background:#1e40af;color:#fff;font-size:11px;font-weight:800;cursor:pointer">🖨 Акт хэвлэх</button>
            </td>
          </tr>`).join('') : `<tr><td colspan="6" style="padding:28px;text-align:center;color:#94a3b8">Энэ сард хаагдсан акт байхгүй байна</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

function _engTabBtn(key, icon, label) {
  const active = _engHubTab === key;
  return `<button onclick="engSetTab('${key}')"
    style="padding:12px 14px;border:none;background:#fff;border-bottom:3px solid ${active ? '#2563eb' : 'transparent'};
           color:${active ? '#2563eb' : '#64748b'};font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap">
    ${icon} ${label}
  </button>`;
}

function _panel(title, count, body, color = '#2563eb', maxH = '') {
  return `<div style="background:#fff;border:1px solid #e2e6ed;border-radius:14px;overflow:hidden;border-top:3px solid ${color}">
    <div style="padding:13px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;gap:10px">
      <div style="font-size:13px;font-weight:800;color:#1e293b">${title}</div>
      ${count !== null && count !== undefined ? `<span style="font-size:11px;color:#64748b;font-weight:800">${count}</span>` : ''}
    </div>
    <div style="${maxH ? `max-height:${maxH};overflow-y:auto` : ''}">${body}</div>
  </div>`;
}

function _domainFullPanel(domainName, rows) {
  const list = rows.filter(w => _workDomain(w) === domainName);
  const stats = _categoryStats(list)[0] || { name: domainName, total: 0, active: 0, closed: 0, overdue: 0, hse: 0, pending: 0, avg: 0, items: [] };
  const color = stats.overdue ? '#dc2626' : stats.pending ? '#0369a1' : stats.hse ? '#7c3aed' : '#0f766e';
  const ownerless = list.filter(w => !w.assigned_to);
  const overdueOpen = list.filter(_isOverdue);
  const needsApproval = list.filter(w => Number(w.progress || 0) >= 100 && !_isClosedWork(w));
  const materialPending = list.filter(w => Number(w.planned_material_count || 0) > 0 && Number(w.material_count || 0) === 0 && !_isClosedWork(w));
  const attention = [
    ...ownerless.map(w => ({ type: 'Эзэнгүй', color: '#d97706', work: w })),
    ...overdueOpen.map(w => ({ type: 'Хугацаа хэтэрсэн', color: '#dc2626', work: w })),
    ...needsApproval.map(w => ({ type: 'Баталгаажуулах', color: '#0369a1', work: w })),
    ...materialPending.map(w => ({ type: 'Материал баталгаажаагүй', color: '#7c3aed', work: w })),
  ];
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px">
      ${_kpi('Нийт ажил', stats.total, '#2563eb', '📋', domainName)}
      ${_kpi('Явцтай', stats.active, '#0f766e', '🔄', 'Идэвхтэй')}
      ${_kpi('Хаагдсан', stats.closed, '#16a34a', '✅', 'Сарын хаалт')}
      ${_kpi('Хугацаа хэтэрсэн', stats.overdue, '#dc2626', '⏱', 'Анхаарах')}
      ${_kpi('Дундаж явц', stats.avg + '%', color, '📈', 'Гүйцэтгэл')}
    </div>
    ${_panel('⚠️ Анхаарах ажлууд', attention.length,
      attention.length
        ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;padding:12px 16px">
            ${attention.slice(0, 12).map(x => `
              <div onclick="engOpenDetail(${x.work.id})" style="border:1px solid #e2e8f0;border-left:3px solid ${x.color};border-radius:8px;padding:10px 12px;cursor:pointer;background:#fff">
                <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:5px">
                  <div style="font-size:12px;font-weight:900;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(x.work.title || '—')}</div>
                  <span style="font-size:10px;font-weight:900;color:${x.color};flex-shrink:0">${x.type}</span>
                </div>
                <div style="font-size:10px;color:#64748b">${escHtml(x.work.assigned_name || 'Эзэнгүй')} · ${escHtml((x.work.end_date || x.work.work_date || '—').slice(0,10))} · ${escHtml(x.work.status || '—')}</div>
              </div>`).join('')}
          </div>`
        : _empty('Анхаарах асуудал алга ✓'),
      '#dc2626'
    )}
    ${_panel(`${domainName} — ажлын дэлгэрэнгүй`, `${stats.total} ажил`,
      stats.items.length
        ? `<div style="padding:12px 16px">
            <div style="display:grid;grid-template-columns:1.4fr .75fr .55fr .5fr .55fr .75fr;gap:8px;padding:7px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px 8px 0 0;font-size:10px;font-weight:900;color:#64748b">
              <div>Ажил</div><div>Хариуцсан</div><div>Дуусах</div><div>Явц</div><div>Нотолгоо</div><div>Төлөв</div>
            </div>
            <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;overflow:hidden">${stats.items.map(_domainWorkRow).join('')}</div>
          </div>`
        : _empty(`${domainName} чиглэлээр ажил бүртгэгдээгүй`),
      color
    )}`;
}

function engSetTab(tab) {
  _engHubTab = tab;
  localStorage.setItem('engHub_tab', tab);
  _render();
}

async function _loadEngineerReportPeriod(year, month) {
  _engReportYear = Number(year || _engReportYear || new Date().getFullYear());
  _engReportMonth = Number(month || _engReportMonth || new Date().getMonth() + 1);
  localStorage.setItem('engReport_year', String(_engReportYear));
  localStorage.setItem('engReport_month', String(_engReportMonth));
  const [report, snaps] = await Promise.all([
    api(`/api/engineer-monthly-report?year=${_engReportYear}&month=${_engReportMonth}`).catch(() => null),
    api(`/api/hse-report-snapshots?period_type=monthly&year=${_engReportYear}&month=${_engReportMonth}`).catch(() => []),
  ]);
  _engReport = report || {
    year: _engReportYear,
    month: _engReportMonth,
    summary_note: '',
    issue_note: '',
    resource_note: '',
    next_plan_note: '',
    conclusion_note: ''
  };
  _hseSnap = Array.isArray(snaps) ? (snaps[0] || null) : null;
}

async function engChangeMonthlyPeriod() {
  const year = Number(document.getElementById('engRptYear')?.value || _engReportYear);
  const month = Number(document.getElementById('engRptMonth')?.value || _engReportMonth);
  try {
    await _loadEngineerReportPeriod(year, month);
    _render();
  } catch(e) {
    toast(e.message || 'Сарын тайлан ачаалахад алдаа гарлаа');
  }
}

function _collectMonthlyNotes() {
  const v = id => document.getElementById(id)?.value?.trim() || '';
  const year = Number(document.getElementById('engRptYear')?.value || _engReportYear || new Date().getFullYear());
  const month = Number(document.getElementById('engRptMonth')?.value || _engReportMonth || (new Date().getMonth() + 1));
  return {
    year,
    month,
    summary_note: v('engRptSummary'),
    issue_note: v('engRptIssues'),
    resource_note: v('engRptResources'),
    next_plan_note: v('engRptNext'),
    conclusion_note: v('engRptConclusion')
  };
}

// ── Render ────────────────────────────────────────────────────

function _render() {
  const pending     = _works.filter(w => w.status === WORK_ORDER_STATUS.HSE_CHECKED);
  const rejected    = _works.filter(w => w.status === WORK_ORDER_STATUS.REJECTED);
  const active      = _works.filter(w => ACTIVE_STATUSES.has(w.status));
  const habeaWaiting = _works.filter(w => w.status === WORK_ORDER_STATUS.SUBMITTED_DONE);
  const closed      = _works.filter(w => w.status === WORK_ORDER_STATUS.CLOSED);

  const openRisks   = _risks.filter(r => (r.workflow_status || 'Шинэ') !== 'Хаасан');
  const critRisks   = openRisks.filter(r => ['Маш өндөр','Өндөр'].includes(r.risk_level));
  const inRepair    = _vehicles.filter(v => v.status === 'Засварт' || v.status === 'Их засвартай');
  // Risks specifically assigned to this engineer that are still "Шинэ"
  const myNewRisks  = _risks.filter(r =>
    r.assigned_to === state.me?.id && (r.workflow_status || 'Шинэ') === 'Шинэ'
  );

  const thisM = today().slice(0, 7);
  const thisMonth = _monthWorks(_works, thisM);
  const doneThisM  = thisMonth.filter(w => w.status === WORK_ORDER_STATUS.CLOSED).length;
  const overdue     = _works.filter(_isOverdue);
  const carryNext   = _nextMonthCarry(_works, thisM);
  const byDomain    = _categoryStats(thisMonth.length ? thisMonth : _works);
  const avgProgress = thisMonth.length
    ? Math.round(thisMonth.reduce((sum, w) => sum + Number(w.progress || 0), 0) / thisMonth.length)
    : 0;

  const riskAlert = myNewRisks.length ? `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 18px;margin-bottom:16px;border-left:4px solid #ea580c">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:13px;font-weight:800;color:#c2410c">🚨 Таны байршилд шинэ ХАБЭА эрсдэл бүртгэгдсэн — ${myNewRisks.length} эрсдэл</div>
        <button onclick="show('safety')" style="padding:4px 12px;border-radius:7px;font-size:11px;font-weight:700;background:#ea580c;color:#fff;border:none;cursor:pointer">Бүгдийг харах →</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${myNewRisks.slice(0,5).map(r => {
          const COLORS = {'Маш өндөр':['#fee2e2','#dc2626'],'Өндөр':['#ffedd5','#ea580c'],'Дунд':['#fef9c3','#ca8a04'],'Бага':['#dcfce7','#16a34a']};
          const [bg, color] = COLORS[r.risk_level] || ['#f1f5f9','#64748b'];
          return `<div style="display:flex;align-items:center;gap:10px;background:#fff;border-radius:8px;padding:8px 12px;border:1px solid #fed7aa">
            <span style="padding:2px 9px;border-radius:20px;font-size:10px;font-weight:800;background:${bg};color:${color};flex-shrink:0">${escHtml(r.risk_level)}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.location||'—')}</div>
              <div style="font-size:10px;color:#94a3b8">${escHtml(r.risk_type||'—')} · ${(r.report_date||'').slice(0,10)} · ${escHtml(r.creator_name||'—')}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const domainSummary = _panel('📊 Чиглэлээр сарын гүйцэтгэл', `${thisMonth.length} ажил · ${thisM}`,
    `<div style="padding:10px 16px">${byDomain.length ? byDomain.map(_domainRow).join('') : _empty('Энэ сард ажил бүртгэгдээгүй')}</div>`,
    '#0f766e'
  );
  const carryPanel = _panel('↪ Дараа сард шилжих ажил', carryNext.length,
    carryNext.length ? carryNext.slice(0, 8).map(_carryCard).join('') : _empty('Шилжих ажил байхгүй ✓'),
    '#0891b2',
    '260px'
  );
  const pendingPanel = _panel('⏳ Эцэслэн батлах шаардлагатай', pending.length,
    pending.length ? pending.map(_pendingCard).join('') : _empty('Эцэслэн батлах ажил байхгүй ✓'),
    '#dc2626',
    '360px'
  );
  const activePanel = _panel('🔄 Явцтай ажлуудын байдал', active.length,
    active.length ? active.map(_activeCard).join('') : _empty('Явцтай ажил байхгүй'),
    '#2563eb',
    '360px'
  );
  const hsePanel = _panel('🦺 ХАБЭА шалгалт хүлээж буй', habeaWaiting.length,
    habeaWaiting.length ? habeaWaiting.map(_habeaWaitCard).join('') : _empty('ХАБЭА шалгалт хүлээж буй ажил байхгүй ✓'),
    '#7c3aed',
    '320px'
  );
  const riskPanel = _panel('⚠️ Нээлттэй эрсдэлүүд', `${openRisks.length} нийт · ${critRisks.length} шүүмжлэлтэй`,
    openRisks.length
      ? (critRisks.length ? critRisks : openRisks).slice(0, 10).map(_riskCard).join('')
      : _empty('Нээлттэй эрсдэл байхгүй ✓'),
    '#d97706',
    '320px'
  );
  const rejectedPanel = rejected.length ? _panel('↩ Буцаагдсан ажлууд — засвар шаардлагатай', rejected.length,
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${rejected.slice(0, 6).map(_rejectedCard).join('')}</div>`,
    '#ea580c'
  ) : '';

  let tabBody = '';
  if (_engHubTab === 'lighting') tabBody = _domainFullPanel('Гэрэлтүүлэг', thisMonth.length ? thisMonth : _works);
  else if (_engHubTab === 'camera') tabBody = _domainFullPanel('Камер', thisMonth.length ? thisMonth : _works);
  else if (_engHubTab === 'repair') tabBody = _domainFullPanel('Засвар', thisMonth.length ? thisMonth : _works);
  else if (_engHubTab === 'approval') tabBody = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">${pendingPanel}${hsePanel}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">${riskPanel}${rejectedPanel || _panel('↩ Буцаагдсан ажлууд', 0, _empty('Буцаагдсан ажил байхгүй ✓'), '#ea580c')}</div>`;
  else if (_engHubTab === 'pipeline') tabBody = _pipelineView();
  else if (_engHubTab === 'report') tabBody = _reportNotesPanel(thisM);
  else tabBody = `
    ${_roleGuide()}
    ${_hseSnapshotNotice(thisM)}
    ${riskAlert}
    <div style="display:grid;grid-template-columns:1.2fr .8fr;gap:16px;margin-bottom:16px">${domainSummary}${carryPanel}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">${pendingPanel}${activePanel}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">${hsePanel}${riskPanel}</div>
    ${rejectedPanel}`;

  const el = document.getElementById('main');
  el.innerHTML = `
  <div style="max-width:1500px;margin:0 auto">

    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px">
      <div>
        <div style="font-size:11px;font-weight:900;color:#94a3b8;letter-spacing:.18em;text-transform:uppercase;margin-bottom:8px">Ерөнхий инженер · Engineering Center</div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:42px;height:42px;border-radius:10px;background:#eef2ff;color:#4f46e5;display:flex;align-items:center;justify-content:center;font-size:20px">🔧</div>
          <div>
            <h1 style="margin:0;font-size:24px;font-weight:900;color:#020617">Ерөнхий инженерийн удирдлага</h1>
            <div style="font-size:12px;color:#667085;margin-top:4px">Чойбалсан хөгжил ОНӨҮГ · ${escHtml(state.me.full_name)} · ${today()}</div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="engOpenPlanWork()" class="btn" style="font-size:12px">+ Ажил төлөвлөх</button>
        <button onclick="show('work')" class="btn secondary" style="font-size:12px">📅 Ажлын Gantt нээх</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px">
      ${_kpi('Эцсийн батлал хүлээж буй', pending.length,     '#dc2626', '⏳', pending.length > 0 ? 'Яаралтай!' : 'Хоосон')}
      ${_kpi('Явцтай ажлууд',     active.length,      '#2563eb', '🔄', 'Идэвхтэй')}
      ${_kpi('ХАБЭА шалгалт хүлээж буй',  habeaWaiting.length, '#7c3aed', '🦺', 'Дуусгаж илгээсэн')}
      ${_kpi('Хаагдсан (сар)',    doneThisM,          '#16a34a', '✅', thisM + ' сард')}
      ${_kpi('Шилжих ажил',       carryNext.length,   '#0891b2', '↪', 'Дараа сар руу')}
      ${_kpi('Хугацаа хэтэрсэн',  overdue.length,     '#b91c1c', '⏱', 'Анхаарах')}
      ${_kpi('Дундаж явц',        avgProgress + '%',  '#0f766e', '📈', thisM + ' сард')}
    </div>

    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px;overflow:hidden">
      <div style="display:flex;gap:4px;overflow-x:auto;padding:0 12px">
        ${_engTabBtn('overview', '🏠', 'Самбар')}
        ${_engTabBtn('lighting', '💡', 'Гэрэлтүүлэг')}
        ${_engTabBtn('camera', '🎥', 'Камер')}
        ${_engTabBtn('repair', '🛠', 'Засвар')}
        ${_engTabBtn('approval', '🦺', 'ХАБЭА & Батлал')}
        ${_engTabBtn('pipeline', '🔍', 'Батлалтын явц')}
        ${_engTabBtn('report', '📝', 'Сарын тайлан')}
      </div>
    </div>

    ${tabBody}
  </div>

  <!-- Action modal -->
  <div id="engActModal"
    style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;align-items:flex-start;justify-content:center;padding:24px 12px;overflow-y:auto"
    onclick="document.getElementById('engActModal').style.display='none'">
    <div style="background:#fff;border-radius:16px;width:min(660px,98vw);box-shadow:0 24px 70px rgba(0,0,0,.3);margin:auto" onclick="event.stopPropagation()">
      <div id="engActModalBody"></div>
    </div>
  </div>`;
}

// ── Card renderers ────────────────────────────────────────────

function _domainRow(r) {
  const color = r.overdue ? '#dc2626' : r.pending ? '#0369a1' : r.hse ? '#7c3aed' : '#0f766e';
  return `<details style="border-bottom:1px solid #f1f5f9;padding:0" ${r.overdue || r.pending ? 'open' : ''}>
    <summary style="list-style:none;cursor:pointer;padding:12px 0;user-select:none">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:7px">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <span style="font-size:11px;color:#94a3b8">▸</span>
          <div style="font-size:12px;font-weight:900;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.name)}</div>
        </div>
        <div style="font-size:11px;color:#64748b;flex-shrink:0">
          <b style="color:${color}">${r.avg}%</b> · ${r.closed}/${r.total} хаасан
        </div>
      </div>
      <div style="height:6px;background:#f1f5f9;border-radius:8px;overflow:hidden;margin-bottom:7px">
        <div style="height:100%;width:${Math.max(0, Math.min(100, r.avg))}%;background:${color};border-radius:8px"></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:10px">
        <span style="padding:2px 7px;border-radius:20px;background:#eff6ff;color:#2563eb">Явцтай ${r.active}</span>
        <span style="padding:2px 7px;border-radius:20px;background:#f5f3ff;color:#7c3aed">ХАБЭА ${r.hse}</span>
        <span style="padding:2px 7px;border-radius:20px;background:#e0f2fe;color:#0369a1">Батлах ${r.pending}</span>
        <span style="padding:2px 7px;border-radius:20px;background:${r.overdue?'#fee2e2':'#f0fdf4'};color:${r.overdue?'#dc2626':'#15803d'}">Хэтэрсэн ${r.overdue}</span>
      </div>
    </summary>
    <div style="padding:0 0 12px 22px">
      <div style="display:grid;grid-template-columns:1.4fr .75fr .55fr .5fr .75fr;gap:8px;padding:7px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px 8px 0 0;font-size:10px;font-weight:900;color:#64748b">
        <div>Ажил</div><div>Хариуцсан</div><div>Дуусах</div><div>Явц</div><div>Төлөв</div>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;overflow:hidden">
        ${r.items.length ? r.items.map(_domainWorkRow).join('') : _empty('Ажил бүртгэгдээгүй')}
      </div>
    </div>
  </details>`;
}

function _domainWorkRow(w) {
  const [bg, color] = _stColor(w.status);
  const overdue = _isOverdue(w);
  const prog = Number(w.progress || 0);
  const ownerless = !w.assigned_to;
  const needsApproval = prog >= 100 && !_isClosedWork(w);
  const plannedMat = Number(w.planned_material_count || 0);
  const usedMat = Number(w.material_count || 0);
  const photoCount = Number(w.photo_count || 0);
  const proof = [
    plannedMat ? `📦${plannedMat}` : '',
    usedMat ? `✅${usedMat}` : '',
    photoCount ? `📷${photoCount}` : '',
    w.habea_pre_status === 'approved' ? '🦺' : '',
  ].filter(Boolean).join(' ');
  return `<div onclick="engOpenDetail(${w.id})"
    style="display:grid;grid-template-columns:1.4fr .75fr .55fr .5fr .55fr .75fr;gap:8px;align-items:center;padding:9px 10px;border-top:1px solid #f1f5f9;cursor:pointer;background:${overdue ? '#fff7f7' : '#fff'}"
    onmouseover="this.style.background='${overdue ? '#fee2e2' : '#f8fafc'}'" onmouseout="this.style.background='${overdue ? '#fff7f7' : '#fff'}'">
    <div style="min-width:0">
      <div style="font-size:11px;font-weight:800;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(w.title || '—')}</div>
      <div style="font-size:10px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(w.category || '—')} · ${escHtml(w.location || '—')}</div>
    </div>
    <div style="font-size:10px;color:${ownerless ? '#d97706' : '#475569'};font-weight:${ownerless ? 900 : 500};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ownerless ? 'Эзэнгүй' : escHtml(w.assigned_name || '—')}</div>
    <div style="font-size:10px;font-weight:800;color:${overdue ? '#dc2626' : '#64748b'}">${escHtml((w.end_date || w.work_date || '—').slice(0, 10))}</div>
    <div>
      <div style="font-size:10px;font-weight:900;color:${color};text-align:right;margin-bottom:3px">${prog}%</div>
      <div style="height:4px;background:#e2e8f0;border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${Math.max(0, Math.min(100, prog))}%;background:${color};border-radius:4px"></div>
      </div>
    </div>
    <div style="font-size:10px;color:#64748b;white-space:nowrap">${proof || '—'}</div>
    <div style="min-width:0;text-align:right">
      <span style="display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:800;background:${bg};color:${color}">${escHtml(w.status || '—')}</span>
      ${overdue ? `<div style="font-size:9px;color:#dc2626;font-weight:800;margin-top:2px">Хугацаа хэтэрсэн</div>` : ''}
      ${needsApproval ? `<div style="font-size:9px;color:#0369a1;font-weight:800;margin-top:2px">Баталгаажуулах</div>` : ''}
    </div>
  </div>`;
}

let _engPlanMaterials = [];
let _engPlanObject = null;

function _engMaterialScopeOf(m) {
  const text = `${m.name || ''} ${m.category_name || ''} ${m.category_code || ''}`.toLowerCase();
  if (text.includes('камер') || text.includes('camera') || text.includes('vga') || text.includes('hdmi') || text.includes('utp') || text.includes('router') || text.includes('switch') || text.includes('сүлжээ') || text.includes('кабель')) return 'camera';
  if (text.includes('гэрэл') || text.includes('гэрэлт') || text.includes('шон') || text.includes('шит') || text.includes('автомат') || text.includes('ламп') || text.includes('толгой')) return 'lighting';
  if (text.includes('засвар') || text.includes('багаж') || text.includes('боолт') || text.includes('гагн') || text.includes('тос') || text.includes('сэлбэг')) return 'repair';
  return 'other';
}

function _engDefaultMatFilter() {
  const cat = document.getElementById('engPlanCategory')?.value || '';
  if (cat.includes('Гэрэлтүүлэг')) return 'lighting';
  if (cat.includes('Камер')) return 'camera';
  if (cat.includes('Засвар')) return 'repair';
  return 'auto';
}

const ENG_WORK_TYPES = {
  'Гэрэлтүүлэг засвар': ['Гэрэлтүүлгийн засвар','Гэрлийн толгой солих','Кабель засвар','Кабель таталт','Шон суурилуулалт','Самбар / шкаф засвар','Цаг тохируулга','Шөнийн үзлэг','Гэмтэл засвар','Урьдчилан сэргийлэх үзлэг'],
  'Камер засвар': ['Камер суурилуулалт','Камер засвар','Камер чиглэл тохируулах','Камер солих','Сүлжээ шалгах','Кабель таталт','NVR / төхөөрөмж тохиргоо','Туршилт / тохируулга'],
  'Засвар': ['Ерөнхий засвар','Тоног төхөөрөмжийн засвар','Машин техникийн засвар','Сэлбэг солих','Үзлэг оношилгоо'],
  'Захиргааны ажил': ['Захиргааны ажил','Хяналт шалгалт','Баримт бүрдүүлэлт','Уулзалт зохион байгуулалт'],
  'Бусад': ['Бусад ажил','Тусгай даалгавар','Шуурхай ажил']
};

function _engWorkTypeOptions(category) {
  return (ENG_WORK_TYPES[category] || ENG_WORK_TYPES['Бусад'])
    .map((x, i) => `<option value="${escHtml(x)}" ${i === 0 ? 'selected' : ''}>${escHtml(x)}</option>`)
    .join('');
}

function _engFilteredMaterials(query = '', filter = 'auto') {
  const q = String(query || '').toLowerCase().trim();
  const scope = filter === 'auto' ? _engDefaultMatFilter() : filter;
  return (window._engMaterialCatalog || [])
    .filter(m => {
      const hay = `${m.name || ''} ${m.category_name || ''} ${m.category_code || ''}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (!q && scope && scope !== 'all' && scope !== 'auto' && _engMaterialScopeOf(m) !== scope) return false;
      if (q && scope && scope !== 'all' && scope !== 'auto') {
        const matScope = _engMaterialScopeOf(m);
        return matScope === scope || hay.includes(q);
      }
      return true;
    })
    .sort((a, b) => Number(b.current_qty || 0) - Number(a.current_qty || 0))
    .slice(0, 20);
}

function _engObjectLabel(a) {
  const name = a?.name || '';
  const loc = a?.location || '';
  const code = a?.asset_code || '';
  return [name, loc, code ? `#${code}` : ''].filter(Boolean).join(' · ');
}

function _engObjectMatchesCategory(a, category) {
  const cat = String(category || '').toLowerCase();
  const hay = `${a?.category || ''} ${a?.sub_category || ''} ${a?.name || ''} ${a?.location || ''}`.toLowerCase();
  if (cat.includes('камер')) return hay.includes('камер') || hay.includes('camera') || hay.includes('nvr');
  if (cat.includes('гэрэлт')) return hay.includes('гэрэл') || hay.includes('шон') || hay.includes('самбар') || hay.includes('шит') || hay.includes('тоолуур') || hay.includes('дохио');
  if (cat.includes('засвар')) return true;
  return true;
}

function _engFilteredObjects(query = '') {
  const q = String(query || '').toLowerCase().trim();
  const category = document.getElementById('engPlanCategory')?.value || '';
  return (window._engObjectCatalog || [])
    .filter(a => _engObjectMatchesCategory(a, category))
    .filter(a => {
      const hay = `${a.name || ''} ${a.location || ''} ${a.asset_code || ''} ${a.category || ''} ${a.sub_category || ''}`.toLowerCase();
      return !q || hay.includes(q);
    })
    .slice(0, 30);
}

function _engObjectSuggestHtml(query = '') {
  const rows = _engFilteredObjects(query);
  return rows.map(a => `
    <button type="button" onmousedown="event.preventDefault(); engSelectPlanObject(${a.id})"
      style="display:block;width:100%;text-align:left;border:none;background:#fff;padding:8px 10px;cursor:pointer;border-bottom:1px solid #f1f5f9">
      <div style="font-size:12px;font-weight:800;color:#1e293b">${escHtml(a.name || 'Объект')}</div>
      <div style="font-size:10px;color:#64748b">${escHtml(a.category || 'Ангилалгүй')} · ${escHtml(a.location || 'Байршилгүй')} ${a.asset_code ? `· ${escHtml(a.asset_code)}` : ''}</div>
    </button>`).join('') || `<div style="padding:10px;font-size:12px;color:#94a3b8">Объект олдсонгүй</div>`;
}

function engPlanObjectSearch(value) {
  _engPlanObject = null;
  const asset = document.getElementById('engPlanAssetId');
  const loc = document.getElementById('engPlanLocation');
  const hint = document.getElementById('engPlanObjectHint');
  if (asset) asset.value = '';
  if (loc) loc.value = '';
  if (hint) hint.innerHTML = 'Объектийн бүртгэлээс сонгоно.';
  const box = document.getElementById('engObjSuggest');
  if (box) {
    box.innerHTML = _engObjectSuggestHtml(value);
    box.style.display = 'block';
  }
  engComposePlanTitle();
}

function engSelectPlanObject(assetId) {
  const obj = (window._engObjectCatalog || []).find(a => Number(a.id) === Number(assetId));
  if (!obj) return;
  _engPlanObject = obj;
  const search = document.getElementById('engPlanObjectSearch');
  const asset = document.getElementById('engPlanAssetId');
  const loc = document.getElementById('engPlanLocation');
  const hint = document.getElementById('engPlanObjectHint');
  const box = document.getElementById('engObjSuggest');
  if (search) search.value = _engObjectLabel(obj);
  if (asset) asset.value = obj.id;
  if (loc) loc.value = obj.location || obj.name || '';
  if (hint) hint.innerHTML = `<span style="color:#16a34a;font-weight:800">Сонгосон:</span> ${escHtml(obj.category || '')} · ${escHtml(obj.location || obj.name || '')}`;
  if (box) box.style.display = 'none';
  engComposePlanTitle();
}

function engRefreshPlanObjects() {
  _engPlanObject = null;
  const search = document.getElementById('engPlanObjectSearch');
  const asset = document.getElementById('engPlanAssetId');
  const loc = document.getElementById('engPlanLocation');
  const hint = document.getElementById('engPlanObjectHint');
  const box = document.getElementById('engObjSuggest');
  if (search) search.value = '';
  if (asset) asset.value = '';
  if (loc) loc.value = '';
  if (hint) hint.innerHTML = 'Чиглэлээс хамаарч объектын жагсаалт шүүгдэнэ.';
  if (box) {
    box.innerHTML = _engObjectSuggestHtml('');
    box.style.display = 'none';
  }
}

async function engOpenPlanWork() {
  const m = document.getElementById('engActModal');
  const b = document.getElementById('engActModalBody');
  if (!m || !b) return;
  m.style.display = 'flex';
  b.innerHTML = `<div style="padding:28px;text-align:center;color:#94a3b8">Материалын жагсаалт уншиж байна...</div>`;
  let materials = [];
  let objects = [];
  try { materials = await api('/api/nyarav/materials').catch(() => []); } catch {}
  try { objects = await api('/api/assets').catch(() => []); } catch {}
  _engPlanMaterials = [];
  _engPlanObject = null;
  const workers = (state.users || []).filter(u => u.active !== 0);
  b.innerHTML = `
    <div style="padding:18px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div>
        <div style="font-size:15px;font-weight:900;color:#1e293b">+ Ерөнхий ажил төлөвлөх</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Ажил үүсгээд хариуцсан хүн рүү шилжүүлнэ. Материал нь зөвхөн төлөвлөгөө, агуулахаас шууд хасагдахгүй.</div>
      </div>
      <button onclick="document.getElementById('engActModal').style.display='none'" style="border:none;background:#f1f5f9;border-radius:8px;padding:6px 10px;cursor:pointer">✕</button>
    </div>
    <div style="padding:16px 20px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><label style="font-size:11px;font-weight:800;color:#475569">Чиглэл *</label>
          <select id="engPlanCategory" class="input" style="width:100%;box-sizing:border-box;margin-top:5px" onchange="engPlanCategoryChanged()">
            <option>Гэрэлтүүлэг засвар</option><option>Камер засвар</option><option>Засвар</option><option>Захиргааны ажил</option><option>Бусад</option>
          </select>
        </div>
        <div><label style="font-size:11px;font-weight:800;color:#475569">Ажлын төрөл *</label>
          <select id="engPlanWorkType" class="input" style="width:100%;box-sizing:border-box;margin-top:5px" onchange="engComposePlanTitle()">
            ${_engWorkTypeOptions('Гэрэлтүүлэг засвар')}
          </select>
        </div>
        <div style="position:relative"><label style="font-size:11px;font-weight:800;color:#475569">Байршил / объект *</label>
          <input id="engPlanObjectSearch" class="input" oninput="engPlanObjectSearch(this.value)" onfocus="engPlanObjectSearch(this.value)" style="width:100%;box-sizing:border-box;margin-top:5px" placeholder="Объектийн бүртгэлээс нэрээр хайх...">
          <input id="engPlanLocation" type="hidden">
          <input id="engPlanAssetId" type="hidden">
          <div id="engObjSuggest" style="display:none;position:absolute;left:0;right:0;top:62px;z-index:1300;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 12px 30px rgba(15,23,42,.18);max-height:260px;overflow-y:auto"></div>
          <div id="engPlanObjectHint" style="font-size:10px;color:#64748b;margin-top:4px">Объектийн бүртгэлээс сонгоно.</div>
        </div>
        <div><label style="font-size:11px;font-weight:800;color:#475569">Товч тайлбар</label><input id="engPlanShort" class="input" oninput="engComposePlanTitle()" style="width:100%;box-sizing:border-box;margin-top:5px" placeholder="Жишээ: Airics NXS туршилт"></div>
        <div style="grid-column:1/-1"><label style="font-size:11px;font-weight:800;color:#475569">Ажлын нэр *</label>
          <input id="engPlanTitle" class="input" style="width:100%;box-sizing:border-box;margin-top:5px;font-weight:800" placeholder="Ажлын төрөл — байршил — тайлбар">
          <div style="font-size:10px;color:#64748b;margin-top:4px">Дээрх талбаруудаас автоматаар бүрдэнэ. Шаардлагатай бол гараар засаж болно.</div>
        </div>
        <div><label style="font-size:11px;font-weight:800;color:#475569">Хариуцсан хүн *</label>
          <select id="engPlanAssigned" class="input" style="width:100%;box-sizing:border-box;margin-top:5px">
            <option value="">— Сонгох —</option>
            ${workers.map(u => `<option value="${u.id}">${escHtml(u.full_name)} · ${escHtml(u.position || '')}</option>`).join('')}
          </select>
        </div>
        <div><label style="font-size:11px;font-weight:800;color:#475569">Эхлэх огноо</label><input id="engPlanStart" type="date" class="input" value="${today()}" style="width:100%;box-sizing:border-box;margin-top:5px"></div>
        <div><label style="font-size:11px;font-weight:800;color:#475569">Дуусах огноо</label><input id="engPlanEnd" type="date" class="input" value="${today()}" style="width:100%;box-sizing:border-box;margin-top:5px"></div>
      </div>
      <label style="font-size:11px;font-weight:800;color:#475569">Тайлбар</label>
      <textarea id="engPlanDesc" class="input" rows="3" style="width:100%;box-sizing:border-box;margin:5px 0 14px;resize:vertical" placeholder="Ажлын зорилго, анхаарах зүйл..."></textarea>

      <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:visible;margin-bottom:14px">
        <div style="padding:12px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div>
            <div style="font-size:12px;font-weight:900;color:#1e293b">📦 Төлөвлөсөн материал</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px">Няравын бүртгэлээс сонгоно. Хадгалахад үлдэгдлээс хасахгүй.</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <select id="engMatFilter" class="input" onchange="engRefreshPlanMaterials()" style="width:150px;font-size:12px;padding:6px 8px">
              <option value="auto">Автомат</option>
              <option value="all">Бүх материал</option>
              <option value="lighting">Гэрэлтүүлэг</option>
              <option value="camera">Камер / сүлжээ</option>
              <option value="repair">Засвар</option>
            </select>
            <button onclick="engAddPlanMaterial()" class="btn secondary sm" style="font-size:11px">+ Материал</button>
          </div>
        </div>
        <div id="engPlanMatRows" style="padding:12px 14px">${_engPlanMaterialRowsHtml(materials)}</div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button onclick="document.getElementById('engActModal').style.display='none'" class="btn secondary">Болих</button>
        <button onclick="engSavePlanWork()" class="btn">Хадгалах</button>
      </div>
    </div>`;
  window._engMaterialCatalog = materials;
  window._engObjectCatalog = objects;
  engComposePlanTitle();
  engAddPlanMaterial();
}

function engPlanCategoryChanged() {
  const cat = document.getElementById('engPlanCategory')?.value || 'Бусад';
  const type = document.getElementById('engPlanWorkType');
  if (type) type.innerHTML = _engWorkTypeOptions(cat);
  engRefreshPlanObjects();
  engComposePlanTitle();
  engRefreshPlanMaterials();
}

function engComposePlanTitle() {
  const type = document.getElementById('engPlanWorkType')?.value?.trim() || '';
  const loc = document.getElementById('engPlanLocation')?.value?.trim() || '';
  const short = document.getElementById('engPlanShort')?.value?.trim() || '';
  const title = [type, loc, short].filter(Boolean).join(' — ');
  const input = document.getElementById('engPlanTitle');
  if (input) input.value = title;
}

function _engPlanMaterialRowsHtml() {
  if (!_engPlanMaterials.length) return `<div style="font-size:12px;color:#94a3b8;text-align:center;padding:14px">Материал төлөвлөөгүй байна</div>`;
  return _engPlanMaterials.map((r, i) => `
    <div style="display:grid;grid-template-columns:minmax(260px,1fr) 90px 70px 100px 34px;gap:8px;align-items:end;margin-bottom:10px;position:relative">
      <div style="position:relative">
        <label style="font-size:10px;font-weight:800;color:#64748b">Материал хайх</label>
        <input class="input" value="${escHtml(r.search || r.material_name || '')}" placeholder="Нэрээр хайх..." 
          oninput="engPlanMatSearch(${i}, this.value)" onfocus="engPlanMatSearch(${i}, this.value)"
          style="width:100%;box-sizing:border-box;margin-top:4px">
        <div id="engMatSuggest_${i}" style="display:${r.showSuggest ? 'block' : 'none'};position:absolute;left:0;right:0;top:58px;z-index:1200;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 12px 30px rgba(15,23,42,.18);max-height:240px;overflow-y:auto">
          ${_engMaterialSuggestHtml(i)}
        </div>
        ${r.material_id ? `<div style="font-size:10px;color:#16a34a;margin-top:3px;font-weight:700">Сонгосон: ${escHtml(r.material_name || '')}</div>` : ''}
      </div>
      <div><label style="font-size:10px;font-weight:800;color:#64748b">Тоо</label><input class="input" type="number" min="0" step="0.01" value="${r.qty || ''}" oninput="engPlanMatChange(${i}, 'qty', this.value)" style="width:100%;box-sizing:border-box;margin-top:4px"></div>
      <div><label style="font-size:10px;font-weight:800;color:#64748b">Нэгж</label><input class="input" value="${escHtml(r.unit || '')}" oninput="engPlanMatChange(${i}, 'unit', this.value)" style="width:100%;box-sizing:border-box;margin-top:4px"></div>
      <div><label style="font-size:10px;font-weight:800;color:#64748b">Тайлбар</label><input class="input" value="${escHtml(r.note || '')}" oninput="engPlanMatChange(${i}, 'note', this.value)" style="width:100%;box-sizing:border-box;margin-top:4px"></div>
      <button onclick="engRemovePlanMaterial(${i})" class="btn secondary sm" style="height:34px;color:#dc2626">×</button>
    </div>`).join('');
}

function _engMaterialSuggestHtml(i) {
  const r = _engPlanMaterials[i] || {};
  const filter = document.getElementById('engMatFilter')?.value || 'auto';
  const rows = _engFilteredMaterials(r.search, filter);
  return rows.map(m => `
    <button type="button" onmousedown="event.preventDefault(); engSelectPlanMaterial(${i}, ${m.id})"
      style="display:block;width:100%;text-align:left;border:none;background:#fff;padding:8px 10px;cursor:pointer;border-bottom:1px solid #f1f5f9">
      <div style="font-size:12px;font-weight:800;color:#1e293b">${escHtml(m.name)}</div>
      <div style="font-size:10px;color:#64748b">${escHtml(m.category_name || 'Ангилалгүй')} · үлд: ${Number(m.current_qty || 0).toLocaleString('mn-MN')} ${escHtml(m.unit || '')}</div>
    </button>`).join('') || `<div style="padding:10px;font-size:12px;color:#94a3b8">Илэрц алга</div>`;
}

function engAddPlanMaterial() {
  _engPlanMaterials.push({ material_id: '', material_name: '', search: '', qty: '', unit: '', note: '', showSuggest: false });
  const el = document.getElementById('engPlanMatRows');
  if (el) el.innerHTML = _engPlanMaterialRowsHtml();
}

function engRefreshPlanMaterials() {
  _engPlanMaterials.forEach(r => { r.showSuggest = false; });
  const el = document.getElementById('engPlanMatRows');
  if (el) el.innerHTML = _engPlanMaterialRowsHtml();
}

function engPlanMatSearch(i, value) {
  if (!_engPlanMaterials[i]) return;
  _engPlanMaterials[i].search = value;
  _engPlanMaterials[i].showSuggest = true;
  const box = document.getElementById(`engMatSuggest_${i}`);
  if (box) {
    box.innerHTML = _engMaterialSuggestHtml(i);
    box.style.display = 'block';
  }
}

function engSelectPlanMaterial(i, materialId) {
  const mat = (window._engMaterialCatalog || []).find(m => Number(m.id) === Number(materialId));
  if (!_engPlanMaterials[i] || !mat) return;
  _engPlanMaterials[i] = {
    ..._engPlanMaterials[i],
    material_id: mat.id,
    material_name: mat.name || '',
    search: mat.name || '',
    unit: mat.unit || '',
    unit_price: mat.unit_price || 0,
    showSuggest: false
  };
  const el = document.getElementById('engPlanMatRows');
  if (el) el.innerHTML = _engPlanMaterialRowsHtml();
}

function engPlanMatChange(i, key, value) {
  if (!_engPlanMaterials[i]) return;
  _engPlanMaterials[i][key] = value;
  if (key === 'material_id') {
    const mat = (window._engMaterialCatalog || []).find(m => String(m.id) === String(value));
    if (mat) {
      _engPlanMaterials[i].unit = mat.unit || '';
      _engPlanMaterials[i].unit_price = mat.unit_price || 0;
      const el = document.getElementById('engPlanMatRows');
      if (el) el.innerHTML = _engPlanMaterialRowsHtml();
    }
  }
}

function engRemovePlanMaterial(i) {
  _engPlanMaterials.splice(i, 1);
  const el = document.getElementById('engPlanMatRows');
  if (el) el.innerHTML = _engPlanMaterialRowsHtml();
}

async function engSavePlanWork() {
  const v = id => document.getElementById(id)?.value?.trim() || '';
  const title = v('engPlanTitle');
  const assigned = v('engPlanAssigned');
  const start = v('engPlanStart') || today();
  const end = v('engPlanEnd') || start;
  if (!title) return toast('Ажлын нэр оруулна уу');
  if (!assigned) return toast('Хариуцсан хүн сонгоно уу');
  if (!v('engPlanLocation')) return toast('Объект сонгоно уу');
  const body = {
    title,
    category: v('engPlanCategory') || 'Бусад',
    department: 'Ерөнхий инженер',
    location: v('engPlanLocation'),
    description: v('engPlanDesc'),
    assigned_to: Number(assigned),
    work_date: start,
    start_date: start,
    end_date: end,
    status: WORK_ORDER_STATUS.IN_PROGRESS,
    progress: 0,
    material_note: _engPlanMaterials.filter(x => x.material_id && Number(x.qty) > 0).length ? 'Төлөвлөсөн материал хавсаргасан' : ''
  };
  const assetId = Number(v('engPlanAssetId') || 0);
  if (assetId) body.asset_id = assetId;
  if ((body.category || '').includes('Гэрэлт')) body.sl_sub_category = 'other';
  try {
    const created = await api('/api/work-logs', { method: 'POST', body: JSON.stringify(body) });
    const planned = _engPlanMaterials
      .filter(x => x.material_id && Number(x.qty) > 0)
      .map(x => ({ material_id: Number(x.material_id), qty: Number(x.qty), unit: x.unit || '', unit_price: Number(x.unit_price || 0), note: x.note || '' }));
    if (planned.length) {
      await api(`/api/work-logs/${created.id}/planned-materials`, { method: 'PUT', body: JSON.stringify({ materials: planned }) });
    }
    toast('Ажил төлөвлөгдөж хариуцсан хүнд шилжлээ');
    document.getElementById('engActModal').style.display = 'none';
    await _load();
    _render();
  } catch(e) {
    toast('Алдаа: ' + (e.message || e));
  }
}

function _carryCard(w) {
  const [bg, color] = _stColor(w.status);
  return `<div style="padding:10px 16px;border-bottom:1px solid #f8fafc">
    <div style="font-size:12px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(w.title)}</div>
    <div style="font-size:10px;color:#94a3b8;margin-top:2px">${escHtml(_workDomain(w))} · ${escHtml(w.assigned_name||'—')} · ${escHtml(w.end_date || w.work_date || '—')}</div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
      <div style="flex:1;height:4px;background:#f1f5f9;border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${Number(w.progress||0)}%;background:${color};border-radius:4px"></div>
      </div>
      <span style="font-size:10px;padding:2px 8px;border-radius:20px;font-weight:700;background:${bg};color:${color}">${escHtml(w.status||'—')}</span>
    </div>
  </div>`;
}

function _pendingCard(w) {
  const prog = w.progress || 0;
  const progColor = prog === 100 ? '#16a34a' : prog >= 60 ? '#2563eb' : '#d97706';
  return `<div onclick="engOpenDetail(${w.id})"
    style="padding:12px 16px;border-bottom:1px solid #f1f5f9;cursor:pointer;transition:background .15s"
    onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
    <div style="display:flex;align-items:flex-start;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:2px">${escHtml(w.title)}</div>
        <div style="font-size:10px;color:#94a3b8">${escHtml(w.category||'—')} · ${escHtml(w.location||'—')}</div>
        <div style="font-size:11px;color:#475569;margin-top:3px">👷 ${escHtml(w.assigned_name||'—')} · ${(w.work_date||'').slice(0,10)}</div>
        <div style="margin-top:6px;height:4px;background:#f1f5f9;border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${prog}%;background:${progColor};border-radius:4px"></div>
        </div>
      </div>
      <div style="flex-shrink:0;text-align:right">
        <div style="font-size:18px;font-weight:900;color:${progColor};line-height:1">${prog}%</div>
        <div style="font-size:9px;color:#94a3b8;margin-top:2px">дарж харах</div>
      </div>
    </div>
  </div>`;
}

function _activeCard(w) {
  const [bg, color] = _stColor(w.status);
  const prog = w.progress || 0;
  return `<div style="padding:10px 16px;border-bottom:1px solid #f8fafc">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(w.title)}</div>
        <div style="font-size:10px;color:#94a3b8">${escHtml(w.category||'—')} · ${escHtml(w.assigned_name||'—')}</div>
        <div style="margin-top:5px;height:4px;background:#f1f5f9;border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${prog}%;background:${color};border-radius:4px"></div>
        </div>
      </div>
      <div style="flex-shrink:0;text-align:right">
        <div style="font-size:13px;font-weight:800;color:${color}">${prog}%</div>
        <span style="font-size:10px;padding:2px 8px;border-radius:20px;font-weight:700;background:${bg};color:${color}">${w.status}</span>
      </div>
    </div>
  </div>`;
}

function _habeaWaitCard(w) {
  const submittedDate = (w.updated_at || w.work_date || '').slice(0, 10);
  return `<div style="padding:10px 16px;border-bottom:1px solid #f8fafc;display:flex;align-items:center;gap:8px">
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(w.title)}</div>
      <div style="font-size:10px;color:#94a3b8">${escHtml(w.location||'—')} · Дуусгаж илгээсэн: ${submittedDate}</div>
      <div style="font-size:10px;color:#7c3aed;font-weight:600;margin-top:2px">🦺 ХАБЭА-н дуусгалтын шалгалтыг хүлээж байна</div>
    </div>
    <div style="font-size:14px;font-weight:900;color:#7c3aed;flex-shrink:0">${w.progress||0}%</div>
  </div>`;
}

function _riskCard(r) {
  const COLORS = { 'Маш өндөр':['#fee2e2','#dc2626'], 'Өндөр':['#ffedd5','#ea580c'], 'Дунд':['#fef9c3','#ca8a04'], 'Бага':['#dcfce7','#16a34a'] };
  const [bg, color] = COLORS[r.risk_level] || ['#f1f5f9','#64748b'];
  const wf = r.workflow_status || 'Шинэ';
  return `<div style="padding:10px 16px;border-bottom:1px solid #f8fafc;display:flex;align-items:center;gap:8px">
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.location||'—')}</div>
      <div style="font-size:10px;color:#94a3b8">${escHtml(r.risk_type||'—')} · ${(r.report_date||'').slice(0,10)} · ${escHtml(r.assigned_name||'—')}</div>
      ${r.work_log_id && r.work_title ? `<div style="font-size:10px;color:#7c3aed;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📋 ${escHtml(r.work_title)}</div>` : ''}
    </div>
    <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:3px">
      <span style="padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;background:${bg};color:${color}">${r.risk_level}</span>
      <span style="font-size:10px;color:#64748b">${wf}</span>
    </div>
  </div>`;
}

function _rejectedCard(w) {
  return `<div style="padding:12px 16px;border-bottom:1px solid #fff1f2">
    <div style="font-size:12px;font-weight:700;color:#dc2626;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(w.title)}</div>
    <div style="font-size:10px;color:#94a3b8;margin-top:2px">${escHtml(w.assigned_name||'—')} · ${(w.work_date||'').slice(0,10)}</div>
    ${w.reject_note ? `<div style="font-size:11px;color:#dc2626;margin-top:4px;padding:4px 8px;background:#fff1f2;border-radius:5px">"${escHtml(w.reject_note)}"</div>` : ''}
  </div>`;
}

// ── Approval pipeline view ────────────────────────────────────

function _pipelineView() {
  const PIPE_RELEVANT = new Set([
    WORK_ORDER_STATUS.SUBMITTED_DONE,
    WORK_ORDER_STATUS.HSE_CHECKED,
    WORK_ORDER_STATUS.REJECTED,
    WORK_ORDER_STATUS.CLOSED,
  ]);

  const activeCat = window._pipelineCat || 'Бүгд';
  let pipeWorks = _works.filter(w =>
    PIPE_RELEVANT.has(w.status) ||
    (w.submitted_at && !ACTIVE_STATUSES.has(w.status))
  );
  if (activeCat !== 'Бүгд') pipeWorks = pipeWorks.filter(w => w.category === activeCat);

  const ORDER = {
    [WORK_ORDER_STATUS.REJECTED]: 0,
    [WORK_ORDER_STATUS.SUBMITTED_DONE]: 1,
    [WORK_ORDER_STATUS.HSE_CHECKED]: 2,
    [WORK_ORDER_STATUS.CLOSED]: 3,
  };
  pipeWorks.sort((a, b) => (ORDER[a.status] ?? 4) - (ORDER[b.status] ?? 4));

  const allCats = ['Бүгд', ...new Set(
    _works.filter(w => PIPE_RELEVANT.has(w.status)).map(w => w.category).filter(Boolean)
  )];

  function step(state, label) {
    const cfg = {
      done:     { bg: '#dcfce7', color: '#16a34a', icon: '✓' },
      active:   { bg: '#fef9c3', color: '#ca8a04', icon: '⏳' },
      rejected: { bg: '#fee2e2', color: '#dc2626', icon: '↩' },
      pending:  { bg: '#f1f5f9', color: '#94a3b8', icon: '○' },
    };
    const c = cfg[state] || cfg.pending;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:46px">
      <div style="width:26px;height:26px;border-radius:50%;background:${c.bg};color:${c.color};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900">${c.icon}</div>
      <div style="font-size:9px;color:${c.color};font-weight:700;text-align:center;line-height:1.2;white-space:nowrap">${label}</div>
    </div>`;
  }

  function arrow() {
    return `<div style="font-size:11px;color:#cbd5e1;margin-top:5px;flex-shrink:0">→</div>`;
  }

  function pipelineRow(w) {
    const st = w.status;
    const preOk        = w.habea_pre_status === 'approved';
    const postOk       = w.habea_post_status === 'approved';
    const finalOk      = st === WORK_ORDER_STATUS.CLOSED;
    const habeaRejected = w.habea_post_status === 'rejected';
    const engRejected  = st === WORK_ORDER_STATUS.REJECTED && !habeaRejected;
    const everSubmitted = !!(w.submitted_by || w.submitted_at) ||
      [WORK_ORDER_STATUS.SUBMITTED_DONE, WORK_ORDER_STATUS.HSE_CHECKED,
       WORK_ORDER_STATUS.CLOSED, WORK_ORDER_STATUS.REJECTED].includes(st);

    const s1 = preOk ? 'done' : 'pending';
    const s2 = everSubmitted ? 'done' : 'pending';
    const s3 = postOk  ? 'done'
             : habeaRejected ? 'rejected'
             : everSubmitted && !finalOk && !postOk && st === WORK_ORDER_STATUS.SUBMITTED_DONE ? 'active'
             : 'pending';
    const s4 = finalOk  ? 'done'
             : engRejected ? 'rejected'
             : st === WORK_ORDER_STATUS.HSE_CHECKED ? 'active'
             : 'pending';
    const s5 = finalOk ? 'done' : 'pending';

    const [stBg, stColor] = _stColor(st);
    return `
    <tr onclick="engOpenDetail(${w.id})" style="border-bottom:1px solid #f1f5f9;cursor:pointer"
      onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
      <td style="padding:10px 12px;vertical-align:middle">
        <div style="font-size:12px;font-weight:700;color:#1e293b;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(w.title)}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:1px">${escHtml(w.category||'—')} · ${(w.start_date||w.work_date||'').slice(0,10)}</div>
        <div style="font-size:10px;color:#2563eb;margin-top:1px">👷 ${escHtml(w.assigned_name||'—')}</div>
      </td>
      <td style="padding:10px 16px;vertical-align:middle">
        <div style="display:flex;align-items:flex-start;gap:3px">
          ${step(s1,'PTW')}${arrow()}
          ${step(s2,'Илгээсэн')}${arrow()}
          ${step(s3,'ХАБЭА')}${arrow()}
          ${step(s4,'Инженер')}${arrow()}
          ${step(s5,'Хаагдсан')}
        </div>
      </td>
      <td style="padding:10px 12px;vertical-align:middle;text-align:center">
        <span style="font-size:10px;padding:3px 10px;border-radius:20px;background:${stBg};color:${stColor};font-weight:700;white-space:nowrap">${escHtml(st)}</span>
        ${w.reject_note ? `<div style="font-size:10px;color:#dc2626;margin-top:4px;font-style:italic;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(w.reject_note)}">"${escHtml(w.reject_note)}"</div>` : ''}
      </td>
      <td style="padding:10px 12px;vertical-align:middle;font-size:10px;color:#64748b;min-width:120px">
        ${w.submitted_name ? `<div style="margin-bottom:3px">📬 ${escHtml(w.submitted_name)}<br><span style="color:#94a3b8">${(w.submitted_at||'').slice(0,10)}</span></div>` : ''}
        ${w.habea_post_name ? `<div style="margin-bottom:3px">🦺 ${escHtml(w.habea_post_name)}<br><span style="color:#94a3b8">${(w.habea_post_at||'').slice(0,10)}</span></div>` : ''}
        ${w.confirmed_name ? `<div style="color:#16a34a">✓ ${escHtml(w.confirmed_name)}<br><span style="color:#94a3b8">${(w.confirmed_at||'').slice(0,10)}</span></div>` : ''}
      </td>
    </tr>`;
  }

  const counts = {
    rejected:  pipeWorks.filter(w => w.status === WORK_ORDER_STATUS.REJECTED).length,
    submitted: pipeWorks.filter(w => w.status === WORK_ORDER_STATUS.SUBMITTED_DONE).length,
    hse:       pipeWorks.filter(w => w.status === WORK_ORDER_STATUS.HSE_CHECKED).length,
    closed:    pipeWorks.filter(w => w.status === WORK_ORDER_STATUS.CLOSED).length,
  };

  const catBtns = allCats.map(c => `
    <button onclick="window._pipelineCat='${escHtml(c)}';engSetTab('pipeline')"
      style="padding:4px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;
             border:2px solid ${activeCat===c?'#2563eb':'#e2e6ed'};
             background:${activeCat===c?'#2563eb':'#fff'};
             color:${activeCat===c?'#fff':'#374151'}">
      ${escHtml(c)}
    </button>`).join('');

  return `
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
    <div style="padding:14px 18px;border-bottom:2px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:13px;font-weight:800;color:#1e293b">🔍 Батлалтын явц — ажил тус бүрээр</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px">Дуусгаж илгээсэн, буцаагдсан болон хаагдсан ажлуудын дараалал</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${catBtns}</div>
    </div>
    <div style="display:flex;gap:8px;padding:10px 18px;background:#f8fafc;border-bottom:1px solid #f1f5f9;flex-wrap:wrap">
      <span style="padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#fee2e2;color:#dc2626">↩ Буцаагдсан ${counts.rejected}</span>
      <span style="padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#f5f3ff;color:#7c3aed">⏳ ХАБЭА хүлээж ${counts.submitted}</span>
      <span style="padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#e0f2fe;color:#0369a1">⚖️ Батлал хүлээж ${counts.hse}</span>
      <span style="padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#dcfce7;color:#15803d">✅ Хаагдсан ${counts.closed}</span>
    </div>
    ${pipeWorks.length ? `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px">
        <thead>
          <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#667085;font-weight:700">АЖИЛ</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#667085;font-weight:700">БАТЛАЛТЫН ДАРААЛАЛ</th>
            <th style="padding:8px 12px;text-align:center;font-size:10px;color:#667085;font-weight:700">ОДООГИЙН ТӨЛӨВ</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#667085;font-weight:700">ХЯНАЛТ</th>
          </tr>
        </thead>
        <tbody>${pipeWorks.map(pipelineRow).join('')}</tbody>
      </table>
    </div>` : `<div style="padding:40px;text-align:center;color:#94a3b8;font-size:12px">Батлалтын явцад орсон ажил байхгүй байна</div>`}
  </div>`;
}

// ── Helpers ───────────────────────────────────────────────────

function _kpi(label, value, color, icon, sub) {
  return `<div style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;padding:14px 16px;border-top:3px solid ${color}">
    <div style="font-size:11px;color:#667085;font-weight:600;margin-bottom:3px">${label}</div>
    <div style="font-size:26px;font-weight:900;color:${color};line-height:1">${value}</div>
    <div style="font-size:10px;color:#94a3b8;margin-top:3px">${icon} ${sub}</div>
  </div>`;
}

function _empty(msg) {
  return `<div style="padding:28px;text-align:center;color:#16a34a;font-size:12px;font-weight:600">${msg}</div>`;
}

function _stColor(s) {
  return WORK_ORDER_STATUS_COLORS[s] || ['#f1f5f9','#374151'];
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _engPhotoGrid(photos = []) {
  if (!photos.length) return '';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px;margin-top:8px">
    ${photos.map(p => {
      const src = p.file_path || p.url || '';
      if (!src) return '';
      return `<button type="button" onclick="window.open('${escHtml(src)}','_blank')"
        style="border:1px solid #e2e8f0;background:#fff;border-radius:7px;padding:0;overflow:hidden;cursor:pointer;height:72px;position:relative">
        <img src="${escHtml(src)}" alt="Гүйцэтгэлийн зураг" loading="lazy"
          style="width:100%;height:100%;object-fit:cover;display:block">
        ${(p.uploaded_name || p.stamp_text) ? `<span style="position:absolute;left:0;right:0;bottom:0;background:rgba(15,23,42,.72);color:#fff;font-size:8px;line-height:1.2;padding:2px 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.uploaded_name || p.stamp_text)}</span>` : ''}
      </button>`;
    }).join('')}
  </div>`;
}

// ── Detail + approval modal ───────────────────────────────────

async function engOpenDetail(id) {
  const m = document.getElementById('engActModal');
  const b = document.getElementById('engActModalBody');
  if (!m || !b) return;
  b.innerHTML = `<div style="padding:28px;text-align:center;color:#94a3b8">Уншиж байна...</div>`;
  m.style.display = 'flex';

  let w, execs = [], ptw = [], materials = [], plannedMaterials = [], workPhotos = [], execPhotosById = {};
  try {
    [w, execs, ptw, materials, plannedMaterials] = await Promise.all([
      api(`/api/work-logs/${id}/approval-sheet`),
      api(`/api/work-logs/${id}/executions`).catch(() => []),
      api(`/api/work-logs/${id}/safety-reports`).catch(() => []),
      api(`/api/work-logs/${id}/materials`).catch(() => []),
      api(`/api/work-logs/${id}/planned-materials`).catch(() => []),
    ]);
    workPhotos = await api(`/api/work-logs/${id}/photos`).catch(() => []);
    const photoPairs = await Promise.all(execs
      .filter(e => Number(e.photo_count || 0) > 0)
      .map(async e => [e.id, await api(`/api/executions/${e.id}/photos`).catch(() => [])]));
    execPhotosById = Object.fromEntries(photoPairs);
  } catch(e) { b.innerHTML = `<div style="padding:28px;color:#dc2626">Алдаа: ${escHtml(e.message)}</div>`; return; }

  const prog = w.progress || 0;
  const progColor = prog === 100 ? '#16a34a' : prog >= 60 ? '#2563eb' : '#d97706';

  const row = (label, val) => val
    ? `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
        <div style="width:130px;flex-shrink:0;color:#64748b;font-weight:600">${label}</div>
        <div style="color:#1e293b">${val}</div>
       </div>` : '';
  const canAssignWork = ['director', 'chief_engineer', 'engineer', 'camera_engineer'].includes(state.me?.role);
  const assignOptions = (state.users || [])
    .filter(u => u.active !== 0)
    .map(u => {
      const checked = Number(w.assigned_to || 0) === Number(u.id);
      return `<label style="display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid ${checked ? '#93c5fd' : '#e2e8f0'};border-radius:8px;background:${checked ? '#eff6ff' : '#fff'};cursor:pointer;font-size:11px;color:#334155">
        <input type="checkbox" name="engAssignUserChk" value="${u.id}" ${checked ? 'checked' : ''}
          onclick="document.querySelectorAll('input[name=&quot;engAssignUserChk&quot;]').forEach(x=>{if(x!==this)x.checked=false;})">
        <span style="min-width:0"><b style="color:#0f172a">${escHtml(u.full_name)}</b><span style="color:#94a3b8"> · ${escHtml(u.position || '')}</span></span>
      </label>`;
    })
    .join('');
  const assignBox = canAssignWork ? `
    <div style="margin-bottom:14px;padding:10px 12px;background:${w.assigned_to ? '#f8fafc' : '#fffbeb'};border:1px solid ${w.assigned_to ? '#e2e8f0' : '#fde68a'};border-radius:10px">
      <div style="font-size:11px;font-weight:900;color:${w.assigned_to ? '#475569' : '#b45309'};margin-bottom:7px">
        ${w.assigned_to ? '👷 Хариуцсан хүн солих' : '⚠️ Эзэнгүй ажил — хариуцсан хүн онооно'}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;max-height:180px;overflow-y:auto;padding:4px;margin-bottom:8px">
        ${assignOptions || `<div style="font-size:12px;color:#94a3b8;padding:8px">Идэвхтэй ажилтан олдсонгүй</div>`}
      </div>
      <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">
        <button onclick="engAssignWork(${id})" style="padding:8px 13px;border:none;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer;font-size:12px;font-weight:900">Оноох</button>
      </div>
      <div style="font-size:10px;color:#64748b;margin-top:6px">Оноосны дараа ажил тухайн хүний “Миний ажил” хэсэгт харагдана.</div>
    </div>` : '';

  // ── Warnings ─────────────────────────────────────────────────
  const warns = [];
  if (!execs.length)
    warns.push({ level: 'error', msg: 'Гүйцэтгэлийн бүртгэл огт байхгүй байна — ажил хийгдсэн эсэх нь тодорхойгүй!' });
  else if (execs.every(e => !(e.note||'').trim()))
    warns.push({ level: 'warn', msg: 'Гүйцэтгэлийн бүртгэлд тайлбар байхгүй байна' });

  const totalExecPhotos = execs.reduce((s, e) => s + (e.photo_count || 0), 0);
  const totalPhotos = (w.photo_count || 0) + totalExecPhotos;
  if (totalPhotos === 0)
    warns.push({ level: 'warn', msg: 'Зураг хавсаргаагүй байна — ажлын талбайн нотолгоо дутуу' });
  if (!w.assigned_to)
    warns.push({ level: 'warn', msg: 'Гүйцэтгэгч тодорхойгүй — хэн хийснийг баталгаажуулна уу' });
  if (w.habea_pre_status !== 'approved')
    warns.push({ level: 'error', msg: 'ХАБЭА эхлэлтийн зөвшөөрөл (PTW) аваагүй байна — ХАБЭА-аар зөвшөөрүүлнэ үү' });
  if (w.habea_post_status !== 'approved')
    warns.push({ level: 'error', msg: 'ХАБЭА дуусгалтын шалгалт хийгдээгүй байна — ажлыг хаахаас өмнө ХАБЭА шалгана уу' });

  const warnHtml = warns.length ? `
    <div style="margin-bottom:14px;border-radius:10px;overflow:hidden;border:1px solid ${warns.some(x=>x.level==='error')?'#fca5a5':'#fde68a'}">
      <div style="padding:7px 12px;background:${warns.some(x=>x.level==='error')?'#dc2626':'#d97706'};color:#fff;font-size:11px;font-weight:800">
        ⚠️ АНХААРУУЛГА — Батлахаасаа өмнө шалгана уу
      </div>
      ${warns.map(wn => `<div style="padding:7px 12px;background:${wn.level==='error'?'#fff1f2':'#fffbeb'};font-size:12px;color:${wn.level==='error'?'#be123c':'#92400e'};display:flex;gap:7px;align-items:flex-start;border-bottom:1px solid ${wn.level==='error'?'#fecdd3':'#fde68a'}">
        <span style="flex-shrink:0">${wn.level==='error'?'🔴':'🟡'}</span>
        <span>${wn.msg}</span>
      </div>`).join('')}
    </div>` : `<div style="margin-bottom:14px;padding:8px 12px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;font-size:11px;color:#15803d;font-weight:600">
      ✅ Бүх шаардлага хангагдсан — батлахад бэлэн
    </div>`;

  const execHtml = execs.length
    ? execs.map(e => {
        const dateStr = e.start_date
          ? (e.end_date && e.end_date !== e.start_date
              ? `${escHtml(e.start_date)} → ${escHtml(e.end_date)}`
              : escHtml(e.start_date))
          : '—';
        const noteText = (e.note||'').trim();
        return `<div style="padding:6px 10px;background:#f8fafc;border-radius:6px;font-size:11px;margin-bottom:4px;border-left:3px solid ${e.photo_count>0?'#86efac':'#93c5fd'}">
          <div style="display:flex;justify-content:space-between">
            <div style="font-weight:600;color:#1e293b">${dateStr} · ${escHtml(e.workers||'—')}</div>
            ${e.photo_count>0?`<span style="font-size:10px;color:#16a34a">📷 ${e.photo_count}</span>`:'<span style="font-size:10px;color:#f59e0b">📷 0</span>'}
          </div>
          <div style="color:${noteText?'#475569':'#f59e0b'};margin-top:2px">${noteText ? escHtml(noteText) : '— тайлбар байхгүй'}</div>
          ${_engPhotoGrid(execPhotosById[e.id] || [])}
        </div>`;
      }).join('')
    : `<div style="font-size:11px;color:#dc2626;font-weight:600;padding:8px 10px;background:#fff1f2;border-radius:6px">🔴 Гүйцэтгэлийн бүртгэл байхгүй</div>`;

  const ptwHtml = ptw.length
    ? ptw.map(p => `<div style="font-size:11px;padding:4px 8px;background:#f5f3ff;border-radius:5px;margin-bottom:3px;border-left:3px solid #7c3aed">
        <b>${escHtml(p.title||'PTW')}</b> · ${escHtml(p.status||'—')}
      </div>`).join('')
    : '';

  b.innerHTML = `
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:18px 22px;border-radius:16px 16px 0 0;display:flex;align-items:flex-start;justify-content:space-between">
      <div>
        <div style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:.06em;margin-bottom:4px">АЖЛЫН ЭЦСИЙН БАТЛАЛТЫН ХҮСЭЛТ</div>
        <div style="color:#fff;font-size:15px;font-weight:800;line-height:1.3">${escHtml(w.title)}</div>
        <div style="color:#93c5fd;font-size:11px;margin-top:3px">${escHtml(w.category||'—')} · ${escHtml(w.location||'—')}</div>
      </div>
      <button onclick="document.getElementById('engActModal').style.display='none'"
        style="border:none;background:rgba(255,255,255,.2);color:#fff;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px;flex-shrink:0">✕</button>
    </div>

    <div style="padding:20px 22px;max-height:70vh;overflow-y:auto">

      <!-- Progress -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:10px 14px;background:#f8fafc;border-radius:10px">
        <div style="flex:1">
          <div style="font-size:10px;color:#64748b;font-weight:700;margin-bottom:4px">ГҮЙЦЭТГЭЛИЙН ЯВЦ</div>
          <div style="height:8px;background:#e2e8f0;border-radius:8px;overflow:hidden">
            <div style="height:100%;width:${prog}%;background:${progColor};border-radius:8px;transition:width .4s"></div>
          </div>
        </div>
        <div style="font-size:22px;font-weight:900;color:${progColor}">${prog}%</div>
      </div>

      <!-- Warnings -->
      ${warnHtml}
      ${assignBox}

      <!-- Work info -->
      <div style="margin-bottom:14px">
        ${row('Гүйцэтгэгч', escHtml(w.assigned_name||'—'))}
        ${row('Бүртгэсэн', escHtml(w.created_name||'—'))}
        ${row('Дуусгаж илгээсэн', w.submitted_name ? `${escHtml(w.submitted_name)} · ${(w.submitted_at||'').slice(0,16)}${w.submit_note ? ' · ' + escHtml(w.submit_note) : ''}` : '')}
        ${row('Ажлын огноо', `${w.start_date||'—'} → ${w.end_date||'—'}`)}
        ${row('Байршил', escHtml(w.location||'—'))}
        ${w.description ? row('Тайлбар', escHtml(w.description)) : ''}
      </div>

      <!-- Executions -->
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">📋 Гүйцэтгэлийн бүртгэл (${execs.length})</div>
        ${execHtml}
        ${workPhotos.length ? `<div style="padding:8px 10px;background:#f8fafc;border-radius:6px;font-size:11px;margin-top:6px;border-left:3px solid #60a5fa">
          <div style="font-weight:700;color:#1e293b">Ажлын үндсэн зураг (${workPhotos.length})</div>
          ${_engPhotoGrid(workPhotos)}
        </div>` : ''}
      </div>

      <!-- Materials -->
      ${plannedMaterials.length ? `<div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:#0369a1;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">📦 Төлөвлөсөн материал (${plannedMaterials.length})</div>
        ${plannedMaterials.map(mt => `
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:5px 8px;background:#eff6ff;border-radius:6px;margin-bottom:3px;border-left:3px solid #93c5fd">
            <span><b style="color:#1e293b">${escHtml(mt.material_name||'—')}</b> · <span style="color:#64748b">үлд: ${Number(mt.current_qty||0).toLocaleString('mn-MN')} ${escHtml(mt.unit||'')}</span></span>
            <span style="color:#1e40af;font-weight:800;flex-shrink:0">${Number(mt.qty||0).toLocaleString('mn-MN')} ${escHtml(mt.unit||'')}</span>
          </div>`).join('')}
        <div style="font-size:10px;color:#64748b;padding:4px 8px">Энэ нь төлөвлөгөө тул агуулахаас хасагдаагүй.</div>
      </div>` : ''}

      ${materials.length ? `<div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:#9a3412;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">📦 Зарцуулсан материал (${materials.length})</div>
        ${materials.map(mt => `
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:5px 8px;background:#fff7ed;border-radius:6px;margin-bottom:3px;border-left:3px solid #fed7aa">
            <span><b style="color:#1e293b">${escHtml(mt.material_name||'—')}</b> · <span style="color:#94a3b8">${(mt.txn_date||'').slice(0,10)}</span></span>
            <span style="color:#b45309;font-weight:800;flex-shrink:0">${Number(mt.qty||0).toLocaleString()} ${escHtml(mt.unit||'')} · ${Number(mt.amount||0).toLocaleString()}₮</span>
          </div>`).join('')}
        <div style="text-align:right;font-size:11px;font-weight:800;color:#9a3412;padding:4px 8px">
          Нийт: ${Number(materials.reduce((s,mt)=>s+Number(mt.amount||0),0)).toLocaleString()}₮
        </div>
      </div>` : ''}

      ${ptwHtml ? `<div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">🛂 PTW бүртгэл</div>
        ${ptwHtml}
      </div>` : ''}

      ${w.habea_pre_status === 'approved' ? `<div style="margin-bottom:14px;padding:8px 12px;background:#e0f2fe;border-radius:8px;font-size:11px;color:#0369a1">
        🦺 ХАБЭА эхлэлтийн зөвшөөрөл: <b>${escHtml(w.habea_pre_name||'—')}</b> · ${(w.habea_pre_at||'').slice(0,10)}
        ${w.habea_pre_risks ? `<br>Эрсдэл: ${escHtml(w.habea_pre_risks)}` : ''}
      </div>` : ''}

      ${w.habea_post_status === 'approved' ? `<div style="margin-bottom:14px;padding:8px 12px;background:#ecfeff;border-radius:8px;font-size:11px;color:#0369a1">
        🦺 ХАБЭА дуусгалтын шалгалт: <b>${escHtml(w.habea_post_name||'—')}</b> · ${(w.habea_post_at||'').slice(0,10)}
        ${w.habea_post_note ? `<br>Дүгнэлт: ${escHtml(w.habea_post_note)}` : ''}
      </div>` : ''}

      <!-- Divider -->
      <div style="border-top:2px solid #f1f5f9;margin:16px 0"></div>

      <!-- Approval form -->
      <div style="font-size:13px;font-weight:800;color:#1e293b;margin-bottom:10px">⚖️ Ерөнхий инженерийн эцсийн шийдвэр</div>
      <label style="font-size:11px;color:#16a34a;font-weight:700;display:block;margin-bottom:4px">
        Эцсийн баталгааны тэмдэглэл <span style="color:#dc2626">*</span>
      </label>
      <textarea id="engActNote" class="input" rows="3"
        style="resize:vertical;width:100%;box-sizing:border-box;border-color:#86efac;margin-bottom:4px"
        placeholder="Ажлын гүйцэтгэлийн үнэлгээ, батлах үндэслэл — тодорхой бичнэ үү..."></textarea>
      <div style="font-size:10px;color:#6b7280;margin-bottom:14px">⚠️ Энэ тэмдэглэл хуулийн баримт болно</div>

      <div style="display:flex;gap:8px">
        <button onclick="engDoConfirm(${id})"
          style="flex:2;padding:11px;border-radius:9px;border:none;background:#16a34a;color:#fff;cursor:pointer;font-size:14px;font-weight:800">✓ Эцэслэн батлах</button>
        <button onclick="engDoReject(${id})"
          style="flex:1;padding:11px;border-radius:9px;border:none;background:#fee2e2;color:#dc2626;cursor:pointer;font-size:13px;font-weight:700">↩ Буцаах</button>
      </div>
    </div>`;
}

// ── Simple modal helper ───────────────────────────────────────

function _showModal(html) {
  const m = document.getElementById('engActModal');
  const b = document.getElementById('engActModalBody');
  if (!m || !b) return;
  b.innerHTML = html;
  m.style.display = 'flex';
}

function engOpenConfirm(id, title) {
  _showModal(`
    <div style="font-size:15px;font-weight:800;margin-bottom:6px">✓ Ажил эцэслэн батлах</div>
    <div style="font-size:12px;color:#475569;margin-bottom:14px;padding:8px 10px;background:#f0fdf4;border-radius:6px">${title}</div>
    <div style="margin-bottom:16px">
      <label style="font-size:11px;color:#16a34a;font-weight:700;display:block;margin-bottom:4px">Баталгааны тэмдэглэл <span style="color:#dc2626">*</span></label>
      <textarea id="engActNote" class="input" rows="3" style="resize:vertical;width:100%;box-sizing:border-box;border-color:#86efac"
        placeholder="Ажлын байдал, гүйцэтгэлийн үнэлгээ, батлах үндэслэлийг бичнэ үү..."></textarea>
      <div style="font-size:10px;color:#6b7280;margin-top:3px">⚠️ Энэ тэмдэглэл хуулийн баримт болно — тодорхой бичнэ үү</div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button onclick="document.getElementById('engActModal').style.display='none'"
        style="padding:8px 18px;border-radius:8px;border:1px solid #e2e6ed;background:#fff;cursor:pointer;font-size:13px">Болих</button>
      <button onclick="engDoConfirm(${id})"
        style="padding:8px 22px;border-radius:8px;border:none;background:#16a34a;color:#fff;cursor:pointer;font-size:13px;font-weight:700">✓ Эцэслэн батлах</button>
    </div>`);
}

function engOpenReject(id, title) {
  _showModal(`
    <div style="font-size:15px;font-weight:800;margin-bottom:6px;color:#dc2626">↩ Ажил буцаах</div>
    <div style="font-size:12px;color:#475569;margin-bottom:14px;padding:8px 10px;background:#fff1f2;border-radius:6px">${title}</div>
    <div style="margin-bottom:16px">
      <label style="font-size:11px;color:#667085;font-weight:600;display:block;margin-bottom:4px">Буцаасан шалтгаан *</label>
      <textarea id="engActNote" class="input" rows="3" style="resize:vertical;width:100%;box-sizing:border-box"
        placeholder="Яагаад буцааж байгаагаа бичнэ үү..."></textarea>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button onclick="document.getElementById('engActModal').style.display='none'"
        style="padding:8px 18px;border-radius:8px;border:1px solid #e2e6ed;background:#fff;cursor:pointer;font-size:13px">Болих</button>
      <button onclick="engDoReject(${id})"
        style="padding:8px 22px;border-radius:8px;border:none;background:#dc2626;color:#fff;cursor:pointer;font-size:13px;font-weight:700">↩ Буцаах</button>
    </div>`);
}

async function engAssignWork(id) {
  const assigned = document.querySelector('input[name="engAssignUserChk"]:checked')?.value || '';
  if (!assigned) { toast('Хариуцсан хүн сонгоно уу'); return; }
  try {
    await api(`/api/work-logs/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_to: Number(assigned) })
    });
    toast('Ажил хариуцсан хүнд оноогдлоо');
    await _load();
    await engOpenDetail(id);
  } catch(e) {
    toast(e.message || 'Оноох үед алдаа гарлаа');
  }
}

async function engDoConfirm(id) {
  const note = document.getElementById('engActNote')?.value?.trim() || '';
  if (!note) { toast('Баталгааны тэмдэглэл заавал бичих шаардлагатай'); return; }
  try {
    const fd = new FormData();
    fd.append('confirm_note', note);
    const res = await fetch(`/api/work-logs/${id}/confirm`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') },
      body: fd
    });
    if (!res.ok) { const e = await res.json(); toast(e.error || 'Алдаа'); return; }
    document.getElementById('engActModal').style.display = 'none';
    toast('✅ Ерөнхий инженер эцэслэн баталж, ажил хаагдлаа! Акт хэвлэхийг санал болгоно.');
    await _load();
    _render();
    window.printApprovalSheet?.(id);
  } catch(e) { toast(e.message || 'Алдаа'); }
}

async function engDoReject(id) {
  let note = document.getElementById('engActNote')?.value?.trim() || '';
  if (!note) {
    note = prompt('Буцаасан шалтгаан бичнэ үү:');
    if (!note?.trim()) { toast('Буцаасан шалтгаан заавал бичих шаардлагатай'); return; }
  }
  try {
    await api(`/api/work-logs/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) });
    document.getElementById('engActModal').style.display = 'none';
    toast('Ажил буцаагдлаа');
    await _load();
    _render();
  } catch(e) { toast(e.message || 'Алдаа'); }
}

async function engSaveMonthlyNotes() {
  const body = _collectMonthlyNotes();
  try {
    await api('/api/engineer-monthly-report', { method: 'PUT', body: JSON.stringify(body) });
    _engReport = body;
    _engReportYear = body.year;
    _engReportMonth = body.month;
    localStorage.setItem('engReport_year', String(body.year));
    localStorage.setItem('engReport_month', String(body.month));
    toast('Ерөнхий инженерийн сарын тэмдэглэл хадгалагдлаа');
  } catch(e) {
    toast(e.message || 'Хадгалахад алдаа гарлаа');
  }
}

function _engIssueTags(text = '') {
  const t = String(text || '').toLowerCase();
  const tags = [];
  if (/материал|сэлбэг|нөөц|бараа|кабель|толгой|шон|ламп/.test(t)) tags.push('Материал, нөөц');
  if (/хүн хүч|ажилтан|гүйцэтгэгч|цахилгаанчин|бригад|хариуцсан/.test(t)) tags.push('Хүн хүч');
  if (/техник|машин|кран|өргөгч|багаж|тоног/.test(t)) tags.push('Техник хэрэгсэл');
  if (/хабэа|аюулгүй|зөвшөөрөл|ptw|эрсдэл/.test(t)) tags.push('ХАБЭА, зөвшөөрөл');
  if (/цаг агаар|бороо|салхи|цас|шуурга|хүйтэн/.test(t)) tags.push('Цаг агаар');
  if (/гаднын|дулаан|цэвэр|холбоо|банк|захиалагч|байгууллага/.test(t)) tags.push('Гаднын байгууллага');
  return tags.length ? tags : ['Ерөнхий саатал'];
}

function _engIssueSuggestion(tag) {
  const map = {
    'Материал, нөөц': 'төлөвлөсөн материалыг ажил эхлэхээс өмнө няравын үлдэгдэлтэй тулгаж, дутагдлыг 7 хоногийн өмнө захиалгын жагсаалтад оруулах',
    'Хүн хүч': 'ажлын эзэн, бригад, орлон гүйцэтгэгчийг эхлэх өдрөөс өмнө баталгаажуулж, эзэнгүй ажлыг тусад нь хянах',
    'Техник хэрэгсэл': 'өргөгч, кран, багажийн бэлэн байдлын чеклистийг долоо хоног бүр шинэчилж, эвдрэлтэй техникийг төлөвлөгөөнөөс салгах',
    'ХАБЭА, зөвшөөрөл': 'PTW болон ХАБЭА pre/post шалгалтын хугацааг ажлын төлөвлөгөөнд заавал тусгаж, шалгагдаагүй ажлыг хаахгүй байх',
    'Цаг агаар': 'гадаа хийгдэх ажлыг цаг агаарын эрсдэлтэй өдрүүдэд нөөц өдөртэй төлөвлөж, дотор/баримтын ажлаар орлуулах хувилбар гаргах',
    'Гаднын байгууллага': 'гаднын байгууллагаас хамаарах ажлыг тусдаа “хүлээгдэж буй” статустай болгож, холбоо барьсан огноо, хариуг бүртгэх',
    'Ерөнхий саатал': 'саатлын эзэн, шалтгаан, шийдэх хугацааг нэг мөр болгон бүртгэж дараа сарын эхний хуралд шийдвэрлэх'
  };
  return map[tag] || map['Ерөнхий саатал'];
}

function _engBuildIssueAnalysis(history = []) {
  const notes = _collectMonthlyNotes();
  const prefix = `${notes.year}-${String(notes.month).padStart(2, '0')}`;
  const monthRows = _monthWorks(_works, prefix);
  const overdue = monthRows.filter(_isOverdue);
  const carry = _nextMonthCarry(_works, prefix);
  const materialPending = monthRows.filter(w => Number(w.planned_material_count || 0) > 0 && Number(w.material_count || 0) === 0 && !_isClosedWork(w));
  const issueRows = [
    { period: prefix, issue_note: notes.issue_note },
    ...history.filter(r => String(r.issue_note || '').trim())
  ].filter(r => String(r.issue_note || '').trim());

  const tagCounts = {};
  issueRows.forEach(r => _engIssueTags(r.issue_note).forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; }));
  if (overdue.length) tagCounts['Хугацаа хэтрэлт'] = (tagCounts['Хугацаа хэтрэлт'] || 0) + overdue.length;
  if (carry.length) tagCounts['Дараа сар шилжих ажил'] = (tagCounts['Дараа сар шилжих ажил'] || 0) + carry.length;
  if (materialPending.length) tagCounts['Материал баталгаажаагүй'] = (tagCounts['Материал баталгаажаагүй'] || 0) + materialPending.length;

  const top = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const repeated = top.filter(([, count]) => count >= 2);
  const repeatedText = repeated.length
    ? repeated.map(([tag, count]) => `- ${tag}: ${count} удаа/ажил давтагдсан`).join('\n')
    : '- Давтагдсан саатал тодорхой харагдахгүй байна. Гэхдээ тухайн сарын хугацаа хэтэрсэн болон шилжих ажлыг тусад нь хянах шаардлагатай.';
  const actionTags = top.length ? top.map(([tag]) => tag) : ['Ерөнхий саатал'];
  const actions = actionTags.map(tag => `- ${tag}: ${_engIssueSuggestion(tag)}`).join('\n');
  const issueSample = issueRows.slice(0, 5).map(r => `- ${r.year ? `${r.year}-${String(r.month).padStart(2, '0')}` : r.period}: ${String(r.issue_note || '').slice(0, 180)}`).join('\n');

  return `СААТАЛ, АСУУДЛЫН ДҮГНЭЛТ (${prefix})

1. Давтагдаж буй шинж
${repeatedText}

2. Системээс илэрсэн ажлын эрсдэл
- Хугацаа хэтэрсэн ажил: ${overdue.length}
- Дараа сар шилжих ажил: ${carry.length}
- Төлөвлөсөн материалтай боловч зарцуулалт бүртгэгдээгүй ажил: ${materialPending.length}

3. Арилгах санал
${actions}

4. Хяналтын санал
- Дараа сарын эхний 7 хоногт дээрх саатлын жагсаалтыг удирдлагын богино хурлаар баталгаажуулах.
- Саатал бүр дээр эзэн, шийдэх хугацаа, шаардагдах материал/техникийг заавал оноох.

Ашигласан тэмдэглэл:
${issueSample || '- Өмнөх сарын саатлын тэмдэглэл олдсонгүй.'}`;
}

async function _engIssueHistory() {
  const notes = _collectMonthlyNotes();
  return await api(`/api/engineer-monthly-report/history?year=${notes.year}&month=${notes.month}&limit=12`).catch(() => []);
}

async function engShowIssueHistory() {
  const history = await _engIssueHistory();
  const rows = history.filter(r => String(r.issue_note || '').trim());
  _showModal(`
    <div style="padding:18px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:15px;font-weight:900;color:#1e293b">Өмнөх саруудын саатал, асуудал</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Сүүлийн 12 хадгалсан сарын тэмдэглэл</div>
      </div>
      <button onclick="document.getElementById('engActModal').style.display='none'" style="border:none;background:#f1f5f9;border-radius:8px;padding:6px 10px;cursor:pointer">✕</button>
    </div>
    <div style="padding:16px 20px;max-height:70vh;overflow:auto">
      ${rows.length ? rows.map(r => `
        <div style="padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;background:#fff">
          <div style="font-size:12px;font-weight:900;color:#1e40af;margin-bottom:4px">${r.year}-${String(r.month).padStart(2, '0')}</div>
          <div style="font-size:12px;color:#334155;line-height:1.55;white-space:pre-wrap">${escHtml(r.issue_note)}</div>
        </div>`).join('') : `<div style="padding:24px;text-align:center;color:#94a3b8">Өмнөх саатлын тэмдэглэл алга байна.</div>`}
    </div>`);
}

async function engAnalyzeIssues() {
  await engSaveMonthlyNotes();
  const history = await _engIssueHistory();
  const text = _engBuildIssueAnalysis(history);
  const box = document.getElementById('engIssueAiBox');
  if (box) {
    box.style.display = 'block';
    box.innerHTML = `<div style="font-weight:900;color:#0f766e;margin-bottom:6px">AI дүгнэлт, шийдэх санал</div>
      <pre style="white-space:pre-wrap;margin:0;font-family:inherit;color:#134e4a">${escHtml(text)}</pre>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button onclick="engAppendIssueAnalysisToConclusion()" style="padding:6px 10px;border:none;border-radius:8px;background:#0f766e;color:#fff;cursor:pointer;font-size:11px;font-weight:800">Эцсийн дүгнэлтэд нэмэх</button>
      </div>`;
    box.dataset.analysis = text;
  }
}

function engAppendIssueAnalysisToConclusion() {
  const box = document.getElementById('engIssueAiBox');
  const target = document.getElementById('engRptConclusion');
  const text = box?.dataset?.analysis || '';
  if (!target || !text) return;
  target.value = [target.value.trim(), text].filter(Boolean).join('\n\n');
  toast('Санал эцсийн дүгнэлтэд нэмэгдлээ');
}

function _monthlyReportText(matByWork = []) {
  const notes = _collectMonthlyNotes();
  const prefix = `${notes.year}-${String(notes.month).padStart(2, '0')}`;
  const monthRows = _monthWorks(_works, prefix);
  const closed = monthRows.filter(_isClosedWork);
  const active = monthRows.filter(w => ACTIVE_STATUSES.has(w.status));
  const pending = monthRows.filter(w => w.status === WORK_ORDER_STATUS.HSE_CHECKED);
  const hseWaiting = monthRows.filter(w => w.status === WORK_ORDER_STATUS.SUBMITTED_DONE);
  const rejected = monthRows.filter(w => w.status === WORK_ORDER_STATUS.REJECTED);
  const overdue = monthRows.filter(_isOverdue);
  const carry = _nextMonthCarry(_works, prefix);
  const domains = _categoryStats(monthRows);
  const risks = _risks.filter(r => (r.report_date || '').startsWith(prefix));
  const highRisks = risks.filter(r => ['Маш өндөр', 'Өндөр'].includes(r.risk_level));

  const domainText = domains.length
    ? domains.map(d => `- ${d.name}: нийт ${d.total}, хаасан ${d.closed}, явцтай ${d.active}, ХАБЭА хүлээж буй ${d.hse}, эцсийн батлал ${d.pending}, хугацаа хэтэрсэн ${d.overdue}.`).join('\n')
    : '- Энэ сард чиглэлээр ангилах ажил бүртгэгдээгүй.';

  const carryText = carry.length
    ? carry.slice(0, 10).map(w => `- ${w.title} (${_workDomain(w)}, ${w.progress || 0}%, ${w.status || '—'})`).join('\n')
    : '- Дараа сард шилжих ажил байхгүй.';

  // Group material rows by work order
  const matGroups = new Map();
  matByWork.forEach(m => {
    const key = m.work_log_id || 0;
    const label = m.work_ref || '(холбоосгүй)';
    if (!matGroups.has(key)) matGroups.set(key, { label, total: 0, rows: [] });
    const g = matGroups.get(key);
    g.total += Number(m.total_amount || 0);
    g.rows.push(`  • ${m.material_name}: ${Number(m.total_qty || 0).toLocaleString()} ${m.unit || ''} = ${Number(m.total_amount || 0).toLocaleString()}₮`);
  });
  const matTotal = [...matGroups.values()].reduce((s, g) => s + g.total, 0);
  const matText = matGroups.size
    ? [...matGroups.values()].map(g => `- ${g.label} (${g.total.toLocaleString()}₮):\n${g.rows.join('\n')}`).join('\n')
    : '- Тухайн сард ажилтай холбосон материал зарцуулалт бүртгэгдээгүй байна.';

  return `ЕРӨНХИЙ ИНЖЕНЕРИЙН ${notes.year} ОНЫ ${notes.month}-Р САРЫН ТАЙЛАН

1. Сарын ажлын ерөнхий дүн
${prefix} сард нийт ${monthRows.length} ажил бүртгэгдсэнээс ${closed.length} ажил хаагдсан, ${active.length} ажил явцтай, ${hseWaiting.length} ажил ХАБЭА шалгалт хүлээж, ${pending.length} ажил эцсийн батлал хүлээж байна. ${rejected.length} ажил буцаагдсан, ${overdue.length} ажил хугацаа хэтэрсэн төлөвтэй байна.

2. Чиглэлээр гүйцэтгэл
${domainText}

3. ХАБЭА ба эрсдэлийн байдал
Тухайн сард ${risks.length} эрсдэл бүртгэгдсэнээс өндөр түвшний эрсдэл ${highRisks.length} байна. ХАБЭА сарын snapshot: ${_hseSnap ? ((_hseSnap.source === 'auto' ? 'автоматаар' : 'гараар') + ' хадгалагдсан') : 'хадгалагдаагүй'}.

4. Материал зарцуулалт — нийт ${matTotal.toLocaleString()}₮
${matText}

5. Саатал, асуудал
${notes.issue_note || 'Саатал, асуудлын тайлбар оруулаагүй байна.'}

6. Нөөц, материал, техник хэрэгцээ
${notes.resource_note || 'Нөөц, материал, техникийн хэрэгцээний тайлбар оруулаагүй байна.'}

7. Дараа сард шилжих ажил
${carryText}

8. Дараа сарын чиглэл
${notes.next_plan_note || 'Дараа сарын чиглэлийн тайлбар оруулаагүй байна.'}

9. Ерөнхий инженерийн дүгнэлт
${notes.conclusion_note || notes.summary_note || 'Ерөнхий инженерийн дүгнэлт оруулаагүй байна.'}`;
}

async function engGenerateMonthlyReport() {
  await engSaveMonthlyNotes();
  const notes = _collectMonthlyNotes();
  const y = Number(notes.year);
  const m = Number(notes.month);
  const from = `${y}-${String(m).padStart(2,'0')}-01`;
  const toYear = m < 12 ? y : y + 1;
  const toMonth = m < 12 ? m + 1 : 1;
  const to = `${toYear}-${String(toMonth).padStart(2,'0')}-01`;
  const matByWork = await api(`/api/nyarav/report/by-work?from=${from}&to=${to}`).catch(() => []);
  const text = _monthlyReportText(matByWork);
  _showModal(`
    <div style="padding:18px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div>
        <div style="font-size:15px;font-weight:900;color:#1e293b">📄 Сарын тайлангийн ноорог</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Системийн дата + таны тэмдэглэлээр үүсгэсэн тайлбар</div>
      </div>
      <button onclick="document.getElementById('engActModal').style.display='none'" style="border:none;background:#f1f5f9;border-radius:8px;padding:6px 10px;cursor:pointer">✕</button>
    </div>
    <div style="padding:16px 20px">
      <textarea id="engMonthlyReportDraft" class="input" rows="20" style="width:100%;box-sizing:border-box;resize:vertical;font-size:12px;line-height:1.55">${escHtml(text)}</textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button onclick="engCopyMonthlyReport()" style="padding:8px 14px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;color:#1e40af;cursor:pointer;font-weight:800">Хуулах</button>
        <button onclick="engPrintMonthlyReport()" style="padding:8px 14px;border:none;border-radius:8px;background:#1e40af;color:#fff;cursor:pointer;font-weight:800">Хэвлэх</button>
      </div>
    </div>`);
}

async function engCopyMonthlyReport() {
  const text = document.getElementById('engMonthlyReportDraft')?.value || '';
  try {
    await navigator.clipboard.writeText(text);
    toast('Тайлангийн ноорог хуулагдлаа');
  } catch {
    toast('Хуулах боломжгүй байна');
  }
}

function engPrintApprovalAct(id) {
  if (typeof window.printApprovalSheet === 'function') {
    window.printApprovalSheet(id);
    return;
  }
  toast('Акт хэвлэх модуль ачаалагдаагүй байна. Ажлын явц (Gantt) хэсгээс нэг удаа нээгээд дахин оролдоно уу.');
}

function engPrintMonthlyReport() {
  const text = document.getElementById('engMonthlyReportDraft')?.value || '';
  const win = window.open('', '_blank', 'width=900,height=720');
  if (!win) { toast('Pop-up хориглогдсон байна'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Ерөнхий инженерийн сарын тайлан</title>
    <style>body{font-family:Arial,sans-serif;padding:28px;color:#111827;white-space:pre-wrap;line-height:1.55;font-size:13px}</style>
  </head><body>${escHtml(text)}<script>window.onload=()=>window.print()<\/script></body></html>`);
  win.document.close();
}

// ── Window exports ────────────────────────────────────────────

Object.assign(window, {
  eng_hub,
  engSetTab,
  engOpenPlanWork, engAddPlanMaterial, engRefreshPlanMaterials, engPlanMatSearch,
  engSelectPlanMaterial, engPlanMatChange, engRemovePlanMaterial, engPlanCategoryChanged,
  engPlanObjectSearch, engSelectPlanObject, engRefreshPlanObjects,
  engComposePlanTitle, engSavePlanWork,
  engChangeMonthlyPeriod, engShowIssueHistory, engAnalyzeIssues, engAppendIssueAnalysisToConclusion,
  engOpenDetail,
  engOpenConfirm, engOpenReject,
  engAssignWork,
  engDoConfirm, engDoReject,
  engSaveMonthlyNotes, engGenerateMonthlyReport, engCopyMonthlyReport, engPrintMonthlyReport,
  engPrintApprovalAct,
  _toggleRoleGuide(key) {
    const el = document.getElementById('rg_body_' + key);
    if (!el) return;
    const nowHidden = el.style.display === 'none';
    el.style.display = nowHidden ? '' : 'none';
    const arr = document.getElementById('rg_arr_' + key);
    if (arr) arr.textContent = nowHidden ? '▲ Нуух' : '▼ Харуулах';
    localStorage.setItem('roleGuide_' + key, nowHidden ? '0' : '1');
  },
});
