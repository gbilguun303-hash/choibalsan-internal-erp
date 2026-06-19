import { api, today, state, escapeHtml, toast } from './common.js';

// ── State ───────────────────────────────────────────────────────────────────
let _ppView      = 'day';            // 'day' | 'month' | 'week' | 'year'
let _ppMonth     = today().slice(0, 7);
let _ppYear      = today().slice(0, 4);
let _ppWeekStart = _ppMondayOf(today());
let _ppDay       = today();
let _ppRows      = [];               // rows loaded for current view
let _ppYearRows  = [];               // rows for year view (full year)
let _ppAssignee  = '';               // '' = me, 'all' = everyone, or user id

// ── Constants ───────────────────────────────────────────────────────────────
const PP_STATUS_LABELS   = { todo:'Тэмдэглэл', doing:'Санах', done:'Архив', postponed:'Хойшлуулсан' };
const PP_PRIORITY_LABELS = { low:'Бага', normal:'Энгийн', high:'Чухал', urgent:'Яаралтай' };
const PP_TYPE_LABELS = {
  work: 'Ажил',
  personal: 'Хувийн',
  reminder: 'Сануулах',
  meeting: 'Уулзалт',
  birthday: 'Төрсөн өдөр',
  other: 'Бусад',
};
const PP_PRIVACY_LABELS = {
  private: 'Зөвхөн би',
  assigned: 'Оноогдсон хүн',
  shared: 'Нээлттэй',
};
const PP_STATUS_STYLE    = {
  todo:      { bg:'#f1f5f9', color:'#475569' },
  doing:     { bg:'#fef3c7', color:'#b45309' },
  done:      { bg:'#dcfce7', color:'#15803d' },
  postponed: { bg:'#ede9fe', color:'#6d28d9' },
};
const PP_PRIORITY_STYLE = {
  low:    { bg:'#f1f5f9', color:'#64748b', border:'#cbd5e1' },
  normal: { bg:'#eff6ff', color:'#2563eb', border:'#93c5fd' },
  high:   { bg:'#ffedd5', color:'#c2410c', border:'#f97316' },
  urgent: { bg:'#fee2e2', color:'#b91c1c', border:'#ef4444' },
};
const PP_TYPE_STYLE = {
  work:     { bg:'#dbeafe', color:'#1d4ed8', border:'#2563eb' },
  personal: { bg:'#dcfce7', color:'#15803d', border:'#16a34a' },
  reminder: { bg:'#fef3c7', color:'#b45309', border:'#d97706' },
  meeting:  { bg:'#ede9fe', color:'#6d28d9', border:'#7c3aed' },
  birthday: { bg:'#ffedd5', color:'#c2410c', border:'#f97316' },
  other:    { bg:'#f1f5f9', color:'#475569', border:'#94a3b8' },
};
const PP_QUICK_MODES = {
  note: {
    label: 'Хувийн тэмдэглэл',
    type: 'personal',
    title: 'Хувийн тэмдэглэл',
    hint: 'Санаа, хүний дугаар, мөнгө/санхүү, хүнтэй ярьсан зүйл, өдөр тутмын жижиг тэмдэглэлээ хадгална.',
    placeholder: 'Жишээ:\n- Баттай ярьсан. Маргааш файл явуулах\n- Дорж 99112233, материалын талаар\n- Нараад 50,000 өгсөн, 6/10-д санах',
  },
  meeting: {
    label: 'Хурлын тэмдэглэл',
    type: 'meeting',
    title: 'Хурлын тэмдэглэл',
    hint: 'Хурал дээр ярьсан асуудал, шийдвэр, дараагийн хийх зүйлсээ тэмдэглэнэ.',
    placeholder: 'Хурал: ...\nЯригдсан асуудал:\n- \nШийдвэр:\n- ',
  },
  reminder: {
    label: 'Сануулга',
    type: 'reminder',
    title: 'Сануулга',
    hint: 'Тухайн өдөр, цаг дээр санах ёстой зүйлийг planner дээр үлдээнэ.',
    placeholder: 'Жишээ: 16:30-д Нямдорж руу залгах',
  },
};
const MN_MONTHS = ['','Нэгдүгээр','Хоёрдугаар','Гуравдугаар','Дөрөвдүгээр',
  'Тавдугаар','Зургаадугаар','Долдугаар','Наймдугаар','Есдүгээр',
  'Аравдугаар','Арваннэгдүгээр','Арванхоёрдугаар'];
const WD_MN    = ['Ням','Даваа','Мягмар','Лхагва','Пүрэв','Баасан','Бямба'];
const WD_SHORT = ['Ня','Да','Мя','Лх','Пү','Ба','Бя'];

// ── Date helpers ─────────────────────────────────────────────────────────────
function _ppFmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _ppMondayOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return _ppFmt(d);
}
function _ppAddDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return _ppFmt(d);
}
function ppMonthDays(month) {
  const [y,m] = month.split('-').map(Number);
  return Array.from({length: new Date(y,m,0).getDate()}, (_,i) =>
    `${y}-${String(m).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`);
}
function ppWeekDays(monday) {
  return Array.from({length:7}, (_,i) => _ppAddDays(monday, i));
}
function ppMonthLabel(m) {
  const [y,mo] = m.split('-');
  return `${y} оны ${Number(mo)}-р сар`;
}
function ppDateLabel(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} · ${WD_MN[d.getDay()]}`;
}
function ppWeekLabel(monday) {
  const sun = _ppAddDays(monday, 6);
  const d1 = new Date(`${monday}T12:00:00`);
  const d2 = new Date(`${sun}T12:00:00`);
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
  return `${d1.getFullYear()} · ${fmt(d1)} — ${fmt(d2)}`;
}

// ── Permissions ──────────────────────────────────────────────────────────────
function ppSortRows(rows) {
  return [...rows].sort((a,b) => {
    const ad = `${a.work_date || ''} ${a.work_time || '99:99'}`;
    const bd = `${b.work_date || ''} ${b.work_time || '99:99'}`;
    if (ad !== bd) return ad.localeCompare(bd);
    return Number(a.id || 0) - Number(b.id || 0);
  });
}

function ppTimeLabel(r) {
  if (r.work_time && r.work_end_time) return `${r.work_time}–${r.work_end_time}`;
  return r.work_time ? r.work_time : 'Цаггүй';
}

function ppTimeOptions(selected = '') {
  const opts = [''];
  for (let h = 0; h < 24; h++) {
    for (const m of ['00','15','30','45']) {
      opts.push(`${String(h).padStart(2,'0')}:${m}`);
    }
  }
  return opts.map(v => `<option value="${v}" ${v === selected ? 'selected' : ''}>${v || 'Цаг сонгохгүй'}</option>`).join('');
}

function ppCanAssign() {
  return ['director','chief_engineer','hr','safety'].includes(state.me?.role);
}
function ppCanViewOthers() {
  return state.me?.role !== 'worker';
}
function ppCanSelectIndividual() {
  return state.me?.role === 'director';
}
function ppUserOptions(selected) {
  return (state.users||[]).map(u =>
    `<option value="${u.id}" ${String(selected)===String(u.id)?'selected':''}>
      ${escapeHtml(u.full_name||'')}${u.position?' · '+escapeHtml(u.position):''}
    </option>`).join('');
}

// ── Stats ────────────────────────────────────────────────────────────────────
function ppStats(rows) {
  const t = today();
  return {
    total:     rows.length,
    done:      rows.filter(r=>r.status==='done').length,
    doing:     rows.filter(r=>r.status==='doing').length,
    late:      rows.filter(r=>r.status!=='done'&&(r.due_date||r.work_date)<t).length,
  };
}

// ── Task card ─────────────────────────────────────────────────────────────────
function ppTaskCard(r) {
  const t       = today();
  const isDone  = r.status === 'done';
  const isLate  = !isDone && (r.due_date||r.work_date) < t;
  const ss = PP_STATUS_STYLE[r.status]    || PP_STATUS_STYLE.todo;
  const ps = PP_PRIORITY_STYLE[r.priority] || PP_PRIORITY_STYLE.normal;
  const typeKey = r.todo_type || 'work';
  const ts = PP_TYPE_STYLE[typeKey] || PP_TYPE_STYLE.work;
  const privacyKey = r.privacy || 'private';
  return `
    <div class="pp-card${isDone?' is-done':''}${isLate?' is-late':''}" style="border-left-color:${ts.border}">
      <label class="pp-check">
        <input type="checkbox" ${isDone?'checked':''} onchange="pp_toggle(${r.id},this.checked)">
        <span class="pp-checkmark"></span>
      </label>
      <div class="pp-card-body">
        <div class="pp-card-title${isDone?' is-done':''}">${escapeHtml(r.title)}</div>
        ${r.note?`<div class="pp-card-note">${escapeHtml(r.note).slice(0,80)}${r.note.length>80?'…':''}</div>`:''}
        <div class="pp-card-tags">
          ${r.work_time?`<span class="pp-tag pp-tag-time">${r.work_time}</span>`:''}
          <span class="pp-tag" style="background:${ts.bg};color:${ts.color}">${PP_TYPE_LABELS[typeKey]||typeKey}</span>${typeKey==='reminder'&&!isDone?`<span class="pp-cal-bell" style="font-size:13px" title="Сануулга">🔔</span>`:''}
          <span class="pp-tag" style="background:${ss.bg};color:${ss.color}">${PP_STATUS_LABELS[r.status]||r.status}</span>
          ${(r.priority==='high'||r.priority==='urgent')?`<span class="pp-tag" style="background:${ps.bg};color:${ps.color}">${PP_PRIORITY_LABELS[r.priority]}</span>`:''}
          ${isLate?`<span class="pp-tag pp-tag-late">⚠ Өнгөрсөн</span>`:''}
          ${r.assigned_by_name?`<span class="pp-tag pp-tag-who">👤 ${escapeHtml(r.assigned_by_name)}</span>`:''}
          ${r.note_count>0?`<span class="pp-tag pp-tag-note">💬 ${r.note_count}</span>`:''}
          ${privacyKey==='private'?`<span class="pp-tag pp-tag-private" title="Зөвхөн би">🔒</span>`:''}
        </div>
      </div>
      <div class="pp-card-actions">
        <button class="pp-act-btn edit"   onclick="pp_edit_open(${r.id})"  title="Засах">✎</button>
        <button class="pp-act-btn note"   onclick="pp_note_open(${r.id})"  title="Тэмдэглэл">💬</button>
        <button class="pp-act-btn delete" onclick="pp_delete(${r.id})"     title="Устгах">🗑</button>
      </div>
    </div>`;
}

// ── Day section (shared by month + week views) ────────────────────────────────
function ppDaySection(d, tasks, extraClass='') {
  const todayS    = today();
  const dt        = new Date(`${d}T12:00:00`);
  const dow       = dt.getDay();
  const isToday   = d === todayS;
  const isWeekend = dow === 0 || dow === 6;
  const typeCounts = tasks.reduce((acc, r) => {
    const key = r.todo_type || 'personal';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return `
    <section class="pp-day pp-day-compact${isToday?' is-today':''}${isWeekend?' is-weekend':''} ${extraClass}" onclick="ppGoDay('${d}')">
      <div class="pp-day-head">
        <div class="pp-day-label">
          <span class="pp-day-num">${dt.getDate()}</span>
          <span class="pp-day-wd">${WD_SHORT[dow]}</span>
        </div>
        ${tasks.length?`<span class="pp-day-count">${tasks.length}</span>`:''}
        <button class="pp-add-btn" onclick="pp_add_open('${d}')" title="Ажил нэмэх">+</button>
      </div>
      <div class="pp-day-body">
        ${tasks.length ? ppSortRows(tasks).map(ppTaskCard).join('') : `<div class="pp-empty">Тэмдэглэл байхгүй</div>`}
      </div>
    </section>`;
}

// ── Summary bar ───────────────────────────────────────────────────────────────
function ppUpdateSummary(rows) {
  const st  = ppStats(rows);
  const pct = st.total ? Math.round(st.done/st.total*100) : 0;
  const el  = document.getElementById('ppSummary');
  if (!el) return;
  el.innerHTML = `
    <div class="pp-stat total"><b>${st.total}</b><span>Нийт</span></div>
    <div class="pp-stat done"><b>${st.done}</b><span>Архив</span></div>
    <div class="pp-stat doing"><b>${st.doing}</b><span>Санах</span></div>
    <div class="pp-stat late"><b>${st.late}</b><span>Өнгөрсөн</span></div>
    <div class="pp-stat pct"><b>${pct}%</b><span>Архивласан</span></div>`;
}

// ── Nav label (shown in bar between prev/next) ────────────────────────────────
function ppNavLabel() {
  if (_ppView === 'day') {
    const isToday = _ppDay === today();
    return isToday ? `Өнөөдөр · ${ppDateLabel(_ppDay)}` : ppDateLabel(_ppDay);
  }
  if (_ppView === 'month') return ppMonthLabel(_ppMonth);
  if (_ppView === 'week')  return ppWeekLabel(_ppWeekStart);
  return `${_ppYear} он`;
}

function _ppUpdateBar() {
  const lbl = document.getElementById('ppBarLabel');
  if (lbl) lbl.textContent = ppNavLabel();
}

// ── View: MONTH ───────────────────────────────────────────────────────────────
function ppQuickPanel() {
  const mode = PP_QUICK_MODES.note;
  return `
    <details class="pp-quick">
      <summary class="pp-quick-toggle">
        <span>Түргэн тэмдэглэл</span>
        <small>нээж тэмдэглэл нэмэх</small>
      </summary>
      <div class="pp-quick-head">
        <div>
          <div class="pp-quick-title">Тэмдэглэл нэмэх</div>
          <div id="ppQuickHint" class="pp-quick-hint">${mode.hint}</div>
        </div>
        <select id="ppQuickMode" class="input" onchange="pp_quick_mode(this.value)">
          ${Object.entries(PP_QUICK_MODES).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="pp-quick-grid">
        <div class="pp-quick-field pp-quick-title-field">
          <label>Гарчиг</label>
          <input id="ppQuickTitle" class="input" placeholder="Заавал биш">
        </div>
        <div class="pp-quick-field">
          <label>Огноо</label>
          <input id="ppQuickDate" class="input" type="date" value="${_ppDay}">
        </div>
        <div class="pp-quick-field">
          <label>Эхлэх цаг</label>
          <select id="ppQuickTime" class="input">${ppTimeOptions()}</select>
        </div>
        <div class="pp-quick-field">
          <label>Дуусах цаг</label>
          <select id="ppQuickEndTime" class="input">${ppTimeOptions()}</select>
        </div>
      </div>
      <textarea id="ppQuickText" class="input pp-quick-text" rows="4" placeholder="${mode.placeholder}"></textarea>
      <div class="pp-quick-actions">
        <span>🔒 Зөвхөн би харна</span>
        <button class="btn sm" onclick="pp_quick_save()">Хадгалах</button>
      </div>
    </details>`;
}

function pp_quick_mode(key) {
  const mode = PP_QUICK_MODES[key] || PP_QUICK_MODES.note;
  const text = document.getElementById('ppQuickText');
  const hint = document.getElementById('ppQuickHint');
  if (text) text.placeholder = mode.placeholder;
  if (hint) hint.textContent = mode.hint;
}

async function pp_quick_save() {
  const key = document.getElementById('ppQuickMode')?.value || 'note';
  const mode = PP_QUICK_MODES[key] || PP_QUICK_MODES.note;
  const workDate = document.getElementById('ppQuickDate')?.value || _ppDay;
  const workTime = document.getElementById('ppQuickTime')?.value || '';
  const workEndTime = document.getElementById('ppQuickEndTime')?.value || '';
  const rawTitle = document.getElementById('ppQuickTitle')?.value.trim() || '';
  const note = document.getElementById('ppQuickText')?.value.trim() || '';
  if (!note && !rawTitle) { toast('Тэмдэглэлээ бичнэ үү'); return; }
  // гарчиг: хэрэглэгчийн оруулсан → note эхний мөр → mode дефолт
  const title = rawTitle || note.split('\n').find(l => l.trim())?.trim().slice(0, 60) || mode.label;
  try {
    await api('/api/nyarav/todos', {
      method: 'POST',
      body: JSON.stringify({
        module: 'personal',
        title,
        note,
        work_date: workDate,
        work_time: workTime,
        work_end_time: workEndTime,
        due_date: workDate,
        todo_type: mode.type,
        privacy: 'private',
        priority: key === 'reminder' ? 'high' : 'normal',
        assigned_to: state.me?.id,
      }),
    });
    toast('Тэмдэглэл хадгалагдлаа');
    for (const id of ['ppQuickTitle','ppQuickText','ppQuickTime','ppQuickEndTime']) {
      const el = document.getElementById(id);
      if (el) el.value = '';
    }
    await ppLoad();
  } catch(e) { toast('⚠ '+e.message); }
}

function ppTimeRuler(day, rows) {
  const START_H = 8, END_H = 18;
  const TOTAL_MINS = (END_H - START_H) * 60;
  const HOURS = Array.from({length: END_H - START_H}, (_, i) => START_H + i);
  const isToday = day === today();
  const now = new Date();
  const nowMins = (now.getHours() - START_H) * 60 + now.getMinutes();
  const nowPct  = (nowMins / TOTAL_MINS * 100).toFixed(2);

  // 1. Hour label + click slots
  const slots = HOURS.map(h => {
    const isLunch = h === 12;
    const isStart = h === 8;
    const isEnd   = h === 17;
    const timeStr = `${String(h).padStart(2,'0')}:00`;
    return `
      <div class="pp-ruler-slot${isLunch?' pp-ruler-lunch':''}"
           onclick="pp_add_open('${day}','${timeStr}')"
           title="${timeStr} — тэмдэглэл нэмэх">
        <span class="pp-ruler-h">${h}</span>
        ${isStart?`<span class="pp-ruler-mark">Эхэлнэ</span>`:''}
        ${isLunch?`<span class="pp-ruler-mark">Үдэлнэ</span>`:''}
        ${isEnd  ?`<span class="pp-ruler-mark">Тарна</span>`:''}
      </div>`;
  }).join('');

  // 2. Task blocks (position by start–end time)
  const blocks = rows.filter(r => r.work_time).map(r => {
    const [sh, sm] = r.work_time.split(':').map(Number);
    const startMin = Math.max(0, (sh - START_H) * 60 + sm);
    let endMin = startMin + 60;
    if (r.work_end_time) {
      const [eh, em] = r.work_end_time.split(':').map(Number);
      endMin = Math.min(TOTAL_MINS, (eh - START_H) * 60 + em);
    }
    const left  = (startMin / TOTAL_MINS * 100).toFixed(2);
    const width = (Math.max(2, endMin - startMin) / TOTAL_MINS * 100).toFixed(2);
    const ts    = PP_TYPE_STYLE[r.todo_type||'work'] || PP_TYPE_STYLE.work;
    const isDone = r.status === 'done';
    return `
      <div class="pp-ruler-block${isDone?' pp-ruler-block-done':''}"
           style="left:${left}%;width:${width}%;background:${ts.bg};border-left:3px solid ${ts.border};color:${ts.color}"
           title="${escapeHtml(r.title)} ${r.work_time}${r.work_end_time?'–'+r.work_end_time:''}"
           onclick="pp_edit_open(${r.id})">
        <span>${escapeHtml(r.title)}</span>
      </div>`;
  }).join('');

  // 3. Current time line
  const nowLine = isToday && nowMins >= 0 && nowMins <= TOTAL_MINS
    ? `<div class="pp-ruler-now-line" style="left:${nowPct}%"></div>` : '';

  return `
    <div class="pp-ruler-wrap">
      <div class="pp-ruler-slots">${slots}</div>
      <div class="pp-ruler-track">
        ${blocks}
        ${nowLine}
      </div>
    </div>`;
}

const PP_TIME_PERIODS = [
  { key:'morning',  icon:'🌅', label:'Өглөө',              from:'08:00', to:'12:00', fromH:8,  toH:12 },
  { key:'lunch',    icon:'🍽️', label:'Үдийн завсарлага',   from:'12:00', to:'13:00', fromH:12, toH:13 },
  { key:'afternoon',icon:'☀️', label:'Үдийн хойно',        from:'13:00', to:'17:00', fromH:13, toH:17 },
  { key:'evening',  icon:'🌆', label:'Орой',               from:'17:00', to:'',      fromH:17, toH:24 },
];

function ppRowPeriod(r) {
  if (!r.work_time) return 'notime';
  const h = parseInt(r.work_time.split(':')[0], 10);
  for (const p of PP_TIME_PERIODS) if (h >= p.fromH && h < p.toH) return p.key;
  return 'notime';
}

function ppTimelineRows(rows) {
  if (!rows.length) return `<div class="pp-empty pp-empty-day">Тэмдэглэл байхгүй</div>`;

  // Timed болон цаггүйг салгах
  const timed   = rows.filter(r => r.work_time);
  const notime  = rows.filter(r => !r.work_time);

  let html = '';
  let lastPeriod = null;

  for (const r of timed) {
    const pk = ppRowPeriod(r);
    if (pk !== lastPeriod) {
      const p = PP_TIME_PERIODS.find(x => x.key === pk);
      if (p) {
        const timeRange = p.to ? `${p.from} – ${p.to}` : `${p.from}+`;
        html += `<div class="pp-period-header">
          <span class="pp-period-icon">${p.icon}</span>
          <span class="pp-period-label">${p.label}</span>
          <span class="pp-period-range">${timeRange}</span>
        </div>`;
      }
      lastPeriod = pk;
    }
    html += `
      <div class="pp-time-row">
        <div class="pp-time-col">${r.work_time}</div>
        <div class="pp-time-dot"></div>
        <div class="pp-time-card">${ppTaskCard(r)}</div>
      </div>`;
  }

  if (notime.length) {
    html += `<div class="pp-period-header pp-period-notime">
      <span class="pp-period-icon">⏰</span>
      <span class="pp-period-label">Цаг тодорхойгүй</span>
    </div>`;
    for (const r of notime) {
      html += `
        <div class="pp-time-row">
          <div class="pp-time-col pp-time-col-none">–</div>
          <div class="pp-time-dot pp-time-dot-none"></div>
          <div class="pp-time-card">${ppTaskCard(r)}</div>
        </div>`;
    }
  }

  return html;
}

function ppRenderDay() {
  const allRows = ppSortRows(_ppRows.filter(r => (r.work_date||'').slice(0,10) === _ppDay));
  const list    = document.getElementById('ppList');
  const isAll   = _ppAssignee === 'all';
  const dateTitle = _ppDay === today() ? 'Өнөөдрийн төлөвлөгөө' : ppDateLabel(_ppDay);
  const dateSub   = (_ppDay === today() ? ppDateLabel(_ppDay) + ' · ' : '') + allRows.length + ' тэмдэглэл';

  if (!list) return;
  list.className = 'pp-day-timeline';

  if (isAll) {
    // ── Бүх ажилтны горим: хүн тус бүрийн бүлэг ──
    const byUser = {};
    const userOrder = [];
    for (const r of allRows) {
      const uid = String(r.assigned_to || r.created_by || '?');
      if (!byUser[uid]) {
        byUser[uid] = { name: r.assigned_name || r.created_name || '?', rows: [] };
        userOrder.push(uid);
      }
      byUser[uid].rows.push(r);
    }

    list.innerHTML = `
      <section class="pp-today-panel">
        <div class="pp-today-head">
          <div>
            <div class="pp-today-title">${dateTitle}</div>
            <div class="pp-today-sub">${dateSub} · ${userOrder.length} ажилтан</div>
          </div>
        </div>
        <div class="pp-staff-groups">
          ${userOrder.length ? userOrder.map(uid => {
            const u = byUser[uid];
            const initial = (u.name||'?').slice(0,1);
            return `
              <div class="pp-staff-group">
                <div class="pp-staff-header">
                  <div class="pp-staff-avatar">${escapeHtml(initial)}</div>
                  <div class="pp-staff-name">${escapeHtml(u.name)}</div>
                  <span class="pp-staff-count">${u.rows.length} тэмдэглэл</span>
                </div>
                <div class="pp-timeline-list pp-timeline-inner">
                  ${ppTimelineRows(u.rows)}
                </div>
              </div>`;
          }).join('') : `<div class="pp-empty pp-empty-day">Өнөөдөр тэмдэглэл байхгүй</div>`}
        </div>
      </section>`;
  } else {
    // ── Өөрийн горим: quick panel + timeline ──
    list.innerHTML = `
      <section class="pp-today-panel">
        <div class="pp-today-head">
          <div>
            <div class="pp-today-title">${dateTitle}</div>
            <div class="pp-today-sub">${dateSub}</div>
          </div>
          <button class="btn sm" onclick="pp_add_open('${_ppDay}')" style="font-weight:800">+ Нэмэх</button>
        </div>
        ${ppTimeRuler(_ppDay, allRows)}
        ${ppQuickPanel()}
        <div class="pp-timeline-list">
          ${ppTimelineRows(allRows)}
        </div>
      </section>`;
  }

  ppUpdateSummary(allRows);
  _ppUpdateBar();
}

function ppRenderMonth() {
  const days  = ppMonthDays(_ppMonth);
  const todayS = today();
  const byDay  = {};
  for (const d of days) byDay[d] = [];
  for (const r of _ppRows) {
    const key = (r.work_date||'').slice(0,10);
    if (byDay[key]) byDay[key].push(r);
  }

  const [y, m] = _ppMonth.split('-').map(Number);
  const firstDow = new Date(y, m-1, 1).getDay();
  const offset   = firstDow === 0 ? 6 : firstDow - 1; // Mon=0
  const totalCells = offset + days.length;
  const numRows    = Math.ceil(totalCells / 7);

  const cells = [];
  // blank cells before month start
  for (let i = 0; i < offset; i++) cells.push(`<div class="pp-cal-cell pp-cal-empty"></div>`);

  for (const d of days) {
    const tasks = byDay[d] || [];
    const done  = tasks.filter(r => r.status === 'done').length;
    const dt    = new Date(`${d}T12:00:00`);
    const dow   = dt.getDay();
    const isToday   = d === todayS;
    const isWeekend = dow === 0 || dow === 6;

    const chips = tasks.slice(0, 3).map(r => {
      const ts = PP_TYPE_STYLE[r.todo_type||'work'] || PP_TYPE_STYLE.work;
      const isDone = r.status === 'done';
      return `<div class="pp-cal-chip${isDone?' pp-cal-chip-done':''}"
                   style="background:${ts.bg};color:${isDone?'#94a3b8':ts.color}">
                ${escapeHtml(r.title)}
              </div>`;
    }).join('');
    const more = tasks.length > 3
      ? `<div class="pp-cal-more">+${tasks.length - 3}</div>` : '';

    const hasReminder = tasks.some(r => r.todo_type === 'reminder' && r.status !== 'done');

    cells.push(`
      <div class="pp-cal-cell${isToday?' is-today':''}${isWeekend?' is-weekend':''}"
           onclick="ppGoDay('${d}')">
        <div class="pp-cal-top">
          <span class="pp-cal-num">${dt.getDate()}</span>
          <div style="display:flex;align-items:center;gap:3px">
            ${hasReminder ? `<span class="pp-cal-bell" title="Сануулга байна">🔔</span>` : ''}
            ${tasks.length
              ? `<span class="pp-cal-badge${done===tasks.length?' pp-cal-badge-done':''}">${done}/${tasks.length}</span>`
              : ''}
          </div>
        </div>
        <div class="pp-cal-chips">${chips}${more}</div>
      </div>`);
  }
  // fill tail
  const tail = numRows * 7 - offset - days.length;
  for (let i = 0; i < tail; i++) cells.push(`<div class="pp-cal-cell pp-cal-empty"></div>`);

  const list = document.getElementById('ppList');
  if (list) {
    list.className = 'pp-cal-wrap';
    list.innerHTML = `
      <div class="pp-cal-head">
        ${['Да','Мя','Лх','Пү','Ба','Бя','Ня'].map(d =>
          `<div class="pp-cal-wday">${d}</div>`).join('')}
      </div>
      <div class="pp-cal-grid" style="grid-template-rows:repeat(${numRows},1fr)">
        ${cells.join('')}
      </div>`;
  }
  ppUpdateSummary(_ppRows);
  _ppUpdateBar();
}

// ── Today notification ────────────────────────────────────────────────────────
function ppShowTodayNotif(allRows) {
  const t      = today();
  const undone = allRows.filter(r => (r.work_date||'').slice(0,10) === t && r.status !== 'done');
  if (!undone.length) { document.getElementById('ppTodayNotif')?.remove(); return; }

  const key = `pp_notif_${t}`;
  if (sessionStorage.getItem(key)) return;       // хэрэглэгч дийлсэн
  if (document.getElementById('ppTodayNotif')) return; // аль нэгт харагдаж байна

  const reminders = undone.filter(r => r.todo_type === 'reminder');
  const meetings  = undone.filter(r => r.todo_type === 'meeting');
  const others    = undone.filter(r => !['reminder','meeting'].includes(r.todo_type));
  const parts = [];
  if (reminders.length) parts.push(`🔔 ${reminders.length} сануулга`);
  if (meetings.length)  parts.push(`🗓 ${meetings.length} уулзалт`);
  if (others.length)    parts.push(`📋 ${others.length} тэмдэглэл`);

  const el = document.createElement('div');
  el.id = 'ppTodayNotif';
  el.className = 'pp-today-notif';
  el.innerHTML = `
    <div class="pp-notif-left">
      <span class="pp-notif-icon">🔔</span>
      <div>
        <div class="pp-notif-title">Өнөөдөр ${undone.length} тэмдэглэл байна</div>
        <div class="pp-notif-sub">${parts.join(' · ')}</div>
      </div>
    </div>
    <div class="pp-notif-right">
      <button class="pp-notif-go" onclick="ppSetView('day')">Өнөөдрийг харах →</button>
      <button class="pp-notif-close" onclick="ppDismissNotif()" title="Хаах">×</button>
    </div>`;

  // section bar-ын дараа оруулна
  const bar = document.querySelector('.pp-bar');
  if (bar) bar.after(el);
}

function ppDismissNotif() {
  document.getElementById('ppTodayNotif')?.remove();
  sessionStorage.setItem(`pp_notif_${today()}`, '1');
}

// ── View: WEEK ────────────────────────────────────────────────────────────────
function ppRenderWeek() {
  const days  = ppWeekDays(_ppWeekStart);
  const byDay = {};
  for (const d of days) byDay[d] = [];
  for (const r of _ppRows) {
    const key = (r.work_date||'').slice(0,10);
    if (byDay[key]) byDay[key].push(r);
  }
  const weekRows = _ppRows.filter(r => days.includes((r.work_date||'').slice(0,10)));
  const list = document.getElementById('ppList');
  if (list) {
    list.className = 'pp-grid pp-grid-week';
    list.innerHTML = days.map(d => ppDaySection(d, byDay[d]||[], 'pp-day-week')).join('');
  }
  ppUpdateSummary(weekRows);
  _ppUpdateBar();
}

// ── View: YEAR ────────────────────────────────────────────────────────────────
function ppRenderYear() {
  const t = today();
  const list = document.getElementById('ppList');
  if (!list) return;
  list.className = 'pp-grid pp-grid-year';

  const months = Array.from({length:12}, (_,i) => {
    const m  = String(i+1).padStart(2,'0');
    const mk = `${_ppYear}-${m}`;
    const rows = _ppYearRows.filter(r=>(r.work_date||'').slice(0,7)===mk);
    const st   = ppStats(rows);
    const pct  = st.total ? Math.round(st.done/st.total*100) : 0;
    const isPast    = mk < today().slice(0,7);
    const isCurrent = mk === today().slice(0,7);
    const barColor  = pct===100?'#16a34a':pct>=60?'#2563eb':pct>0?'#d97706':'#e2e8f0';
    return `
      <div class="pp-year-month${isCurrent?' is-current':''}${isPast&&pct<100&&st.total>0?' has-late':''}"
           onclick="ppGoMonth('${mk}')">
        <div class="pp-ym-head">
          <span class="pp-ym-name">${MN_MONTHS[i+1]} сар</span>
          ${isCurrent?`<span class="pp-ym-badge current">Одоо</span>`:''}
          ${isPast&&st.late>0?`<span class="pp-ym-badge late">⚠ ${st.late}</span>`:''}
        </div>
        ${st.total>0 ? `
          <div class="pp-ym-bar">
            <div class="pp-ym-fill" style="width:${pct}%;background:${barColor}"></div>
          </div>
          <div class="pp-ym-stats">
            <span>${st.total} тэмдэглэл</span>
            <span class="pp-ym-pct" style="color:${barColor}">${st.done} архив</span>
          </div>` : `
          <div class="pp-ym-empty">Тэмдэглэл байхгүй</div>`}
      </div>`;
  });

  list.innerHTML = months.join('');

  // year-level summary
  const st  = ppStats(_ppYearRows);
  const pct = st.total ? Math.round(st.done/st.total*100) : 0;
  const el  = document.getElementById('ppSummary');
  if (el) {
    el.innerHTML = `
      <div class="pp-stat total"><b>${st.total}</b><span>Жилийн нийт</span></div>
      <div class="pp-stat done"><b>${st.done}</b><span>Архив</span></div>
      <div class="pp-stat doing"><b>${st.doing}</b><span>Санах</span></div>
      <div class="pp-stat late"><b>${st.late}</b><span>Өнгөрсөн</span></div>
      <div class="pp-stat pct"><b>${pct}%</b><span>Архивласан</span></div>`;
  }
  _ppUpdateBar();
}

// ── API helpers ────────────────────────────────────────────────────────────────
function _ppAssigneeQs() {
  const qs = new URLSearchParams({ module: 'personal' });
  const a = _ppAssignee || state.me?.id || '';
  qs.set('assigned_to', a || state.me?.id || '');
  return qs;
}

async function ppLoad() {
  const aEl = document.getElementById('ppAssignee');
  if (aEl) _ppAssignee = aEl.value;
  const list = document.getElementById('ppList');
  if (list) list.innerHTML = `<div class="pp-loading">Уншиж байна...</div>`;

  try {
    if (_ppView === 'year') {
      const qs = _ppAssigneeQs();
      qs.set('year', _ppYear);
      _ppYearRows = await api(`/api/nyarav/todos?${qs}`);
      ppRenderYear();
    } else if (_ppView === 'day') {
      const qs = _ppAssigneeQs(); qs.set('month', _ppDay.slice(0,7));
      _ppRows = await api(`/api/nyarav/todos?${qs}`);
      ppRenderDay();
    } else if (_ppView === 'week') {
      // week may span two months — fetch both if needed
      const sun = _ppAddDays(_ppWeekStart, 6);
      const m1  = _ppWeekStart.slice(0,7);
      const m2  = sun.slice(0,7);
      const qs1 = _ppAssigneeQs(); qs1.set('month', m1);
      const qs2 = _ppAssigneeQs(); qs2.set('month', m2);
      if (m1 === m2) {
        _ppRows = await api(`/api/nyarav/todos?${qs1}`);
      } else {
        const [r1, r2] = await Promise.all([
          api(`/api/nyarav/todos?${qs1}`),
          api(`/api/nyarav/todos?${qs2}`),
        ]);
        const seen = new Set();
        _ppRows = [...r1, ...r2].filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
      }
      ppRenderWeek();
    } else {
      const qs = _ppAssigneeQs(); qs.set('month', _ppMonth);
      _ppRows = await api(`/api/nyarav/todos?${qs}`);
      ppRenderMonth();
      if (_ppMonth === today().slice(0,7)) ppShowTodayNotif(_ppRows);
    }
    ppUpdateHeroSub();
  } catch(e) {
    if (list) list.innerHTML = `<div class="pp-error">⚠ ${escapeHtml(e.message)}</div>`;
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────────
function ppNav(dir) {  // dir = -1 | +1
  if (_ppView === 'day') {
    _ppDay = _ppAddDays(_ppDay, dir);
    _ppMonth = _ppDay.slice(0,7);
    const inp = document.getElementById('ppMonth');
    if (inp) inp.value = _ppMonth;
  } else if (_ppView === 'month') {
    const [y,m] = _ppMonth.split('-').map(Number);
    const nd = new Date(y, m-1+dir, 1);
    _ppMonth = `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}`;
    const inp = document.getElementById('ppMonth');
    if (inp) inp.value = _ppMonth;
  } else if (_ppView === 'week') {
    _ppWeekStart = _ppAddDays(_ppWeekStart, dir * 7);
    // sync month from week
    _ppMonth = _ppWeekStart.slice(0,7);
  } else {
    _ppYear = String(Number(_ppYear) + dir);
    const inp = document.getElementById('ppYear');
    if (inp) inp.value = _ppYear;
  }
  ppLoad();
}

function ppSetView(v) {
  _ppView = v;
  // sync week start to current month if switching
  if (v === 'week') {
    _ppWeekStart = _ppMondayOf(today());
    _ppMonth = _ppWeekStart.slice(0,7);
  }
  if (v === 'day') {
    _ppDay = today();
    _ppMonth = _ppDay.slice(0,7);
  }
  if (v === 'year') _ppYear = _ppMonth.slice(0,4);

  // update active button
  document.querySelectorAll('.pp-view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === v);
  });

  const monthWrap = document.getElementById('ppMonthWrap');
  if (monthWrap) monthWrap.style.display = (v === 'month') ? '' : 'none';
  const yearWrap = document.getElementById('ppYearWrap');
  if (yearWrap) yearWrap.style.display = (v === 'year') ? '' : 'none';

  ppLoad();
}

function ppGoMonth(mk) {
  _ppMonth = mk;
  _ppView  = 'month';
  document.querySelectorAll('.pp-view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === 'month');
  });
  const monthWrap = document.getElementById('ppMonthWrap');
  if (monthWrap) monthWrap.style.display = '';
  const yearWrap = document.getElementById('ppYearWrap');
  if (yearWrap) yearWrap.style.display = 'none';
  const inp = document.getElementById('ppMonth');
  if (inp) inp.value = _ppMonth;
  ppLoad();
}

function ppGoDay(d) {
  _ppDay = d;
  _ppMonth = d.slice(0,7);
  _ppView = 'day';
  document.querySelectorAll('.pp-view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === 'day');
  });
  const monthWrap = document.getElementById('ppMonthWrap');
  if (monthWrap) monthWrap.style.display = 'none';
  const yearWrap = document.getElementById('ppYearWrap');
  if (yearWrap) yearWrap.style.display = 'none';
  ppLoad();
}

// ── Shell ──────────────────────────────────────────────────────────────────────
export async function personal_plan() {
  const me = state.me || {};
  if (!ppCanViewOthers()) _ppAssignee = String(me.id || '');

  main.innerHTML = `
    <div class="pp-page">

      <!-- Hero -->
      <div class="pp-hero">
        <div class="pp-hero-left">
          <div class="pp-avatar">${escapeHtml((me.full_name||'?').slice(0,1))}</div>
          <div>
            <div class="pp-hero-name">${escapeHtml(me.full_name||'Миний төлөвлөгөө')}</div>
            <div id="ppHeroSub" class="pp-hero-sub">${escapeHtml(me.position||me.role||'')} · ${ppMonthLabel(_ppMonth)}</div>
          </div>
        </div>
        <div class="pp-hero-right">
          <div class="pp-toolbar">
            <!-- View switcher -->
            <div class="pp-view-switch">
              <button class="pp-view-btn active" data-view="day"   onclick="ppSetView('day')">Өнөөдөр</button>
              <button class="pp-view-btn"         data-view="month" onclick="ppSetView('month')">Сар</button>
              <button class="pp-view-btn"         data-view="year"  onclick="ppSetView('year')">Жил</button>
            </div>
            <!-- Month picker -->
            <span id="ppMonthWrap" style="display:none">
              <input id="ppMonth" type="month" value="${_ppMonth}"
                     onchange="ppSetMonth(this.value)" style="min-height:32px;padding:5px 10px;font-size:12px;border:1px solid rgba(255,255,255,.3);border-radius:8px;background:rgba(255,255,255,.14);color:#fff;font:inherit">
            </span>
            <!-- Year picker (hidden initially) -->
            <span id="ppYearWrap" style="display:none">
              <input id="ppYear" type="number" value="${_ppYear}" min="2020" max="2035"
                     onchange="ppSetYear(this.value)" style="width:88px;min-height:32px;padding:5px 10px;font-size:12px;border:1px solid rgba(255,255,255,.3);border-radius:8px;background:rgba(255,255,255,.14);color:#fff;font:inherit">
            </span>
            ${ppCanViewOthers() ? `
            <select id="ppAssignee" onchange="_ppAssignee=this.value;ppLoad();ppUpdateHeroSub()"
                    style="min-height:32px;padding:5px 10px;font-size:12px;border:1px solid rgba(255,255,255,.3);border-radius:8px;background:rgba(255,255,255,.14);color:#fff;font:inherit">
              <option value="${me.id||''}">Миний тэмдэглэл</option>
              <option value="all"${_ppAssignee==='all'?' selected':''}>Бүх ажилтан — нэгтгэж харах</option>
              ${ppCanSelectIndividual() ? (state.users||[]).filter(u=>String(u.id)!==String(me.id)&&u.role!=='worker').map(u=>
                `<option value="${u.id}"${String(_ppAssignee)===String(u.id)?' selected':''}>
                  ${escapeHtml(u.full_name||'')}${u.position?' · '+escapeHtml(u.position):''}
                </option>`).join('') : ''}
            </select>` : ''}
            <button class="btn sm secondary" onclick="ppLoad()" title="Шинэчлэх" style="background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.3);color:#fff">⟳</button>
          </div>
        </div>
      </div>

      <!-- Section bar with navigation -->
      <div class="pp-bar">
        <div class="pp-bar-nav">
          <button class="pp-nav-btn" onclick="ppNav(-1)">‹</button>
          <span id="ppBarLabel" class="pp-bar-title">${ppNavLabel()}</span>
          <button class="pp-nav-btn" onclick="ppNav(1)">›</button>
        </div>
        <span class="pp-bar-hint">Тухайн өдрийн тэмдэглэл, сануулга, хувийн ажлууд</span>
      </div>

      <!-- Calendar -->
      <div id="ppList" class="pp-grid pp-grid-month">
        <div class="pp-loading">Уншиж байна...</div>
      </div>

    </div>`;

  await ppLoad();
}

// ── Modals ─────────────────────────────────────────────────────────────────────
function _ppModal(html) {
  document.querySelector('.pp-modal')?.remove();
  const m = document.createElement('div');
  m.className = 'pp-modal';
  m.innerHTML = html;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  return m;
}

function pp_add_open(workDate = today(), workTime = '') {
  _ppModal(`
    <div class="pp-modal-card">
      <button class="pp-modal-close" onclick="this.closest('.pp-modal').remove()">×</button>
      <div class="pp-modal-title">Тэмдэглэл нэмэх</div>
      <div class="pp-modal-sub">${ppDateLabel(workDate)}${workTime ? ' · ' + workTime : ''}</div>
      <div class="pp-form">
        <label>Гарчиг</label>
        <input id="ppNewTitle" class="input" placeholder="Юу хийхээ бичнэ үү..." autofocus>
        <div class="pp-form-row">
          <div>
            <label>Төрөл</label>
            <select id="ppNewType" class="input">
              <option value="work">Ажил</option>
              <option value="personal">Хувийн</option>
              <option value="reminder">Сануулах</option>
              <option value="meeting">Уулзалт</option>
              <option value="birthday">Төрсөн өдөр</option>
              <option value="other">Бусад</option>
            </select>
          </div>
          <div>
            <label>Огноо</label>
            <input id="ppNewDate" class="input" type="date" value="${workDate}">
          </div>
          <div>
            <label>Эхлэх цаг</label>
            <select id="ppNewTime" class="input">${ppTimeOptions(workTime)}</select>
          </div>
          <div>
            <label>Дуусах цаг</label>
            <select id="ppNewEndTime" class="input">${ppTimeOptions()}</select>
          </div>
          <div>
            <label>Ач холбогдол</label>
            <select id="ppNewPriority" class="input">
              <option value="normal">Энгийн</option>
              <option value="high">Чухал</option>
              <option value="urgent">Яаралтай</option>
              <option value="low">Бага</option>
            </select>
          </div>
        </div>
        <label>Нууцлал</label>
        <select id="ppNewPrivacy" class="input">
          <option value="private">Зөвхөн би харна</option>
          <option value="assigned">Оноогдсон хүн / оноосон хүн харна</option>
          <option value="shared">Удирдлага харах боломжтой</option>
        </select>
        ${ppCanAssign()?`
        <label>Хэнд оноох</label>
        <select id="ppNewAssignee" class="input">${ppUserOptions(state.me?.id)}</select>`:''}
        <label>Тэмдэглэл</label>
        <textarea id="ppNewNote" class="input" rows="3" placeholder="Нэмэлт тэмдэглэл..."></textarea>
      </div>
      <div class="pp-modal-actions">
        <button class="btn secondary" onclick="this.closest('.pp-modal').remove()">Болих</button>
        <button class="btn" onclick="pp_add_save()">Нэмэх</button>
      </div>
    </div>`);
  setTimeout(()=>document.getElementById('ppNewTitle')?.focus(), 30);
}

async function pp_add_save() {
  const title = document.getElementById('ppNewTitle')?.value.trim();
  if (!title) { toast('Ажлын гарчиг оруулна уу'); return; }
  const workDate = document.getElementById('ppNewDate')?.value || today();
  const workTime    = document.getElementById('ppNewTime')?.value    || '';
  const workEndTime = document.getElementById('ppNewEndTime')?.value || '';
  const priority = document.getElementById('ppNewPriority')?.value || 'normal';
  const todoType = document.getElementById('ppNewType')?.value || 'work';
  const privacy  = document.getElementById('ppNewPrivacy')?.value || 'private';
  const assignee = document.getElementById('ppNewAssignee')?.value || state.me?.id;
  const note     = document.getElementById('ppNewNote')?.value || '';
  try {
    await api('/api/nyarav/todos', {
      method:'POST',
      body: JSON.stringify({module:'personal', title, work_date:workDate, work_time:workTime, work_end_time:workEndTime, due_date:workDate, todo_type:todoType, privacy, priority, assigned_to:assignee, note}),
    });
    toast('Ажил нэмэгдлээ');
    document.querySelector('.pp-modal')?.remove();
    await ppLoad();
  } catch(e) { toast('⚠ '+e.message); }
}

function pp_edit_open(id) {
  const r = _ppRows.find(x=>Number(x.id)===Number(id));
  if (!r) return;
  _ppModal(`
    <div class="pp-modal-card">
      <button class="pp-modal-close" onclick="this.closest('.pp-modal').remove()">×</button>
      <div class="pp-modal-title">Тэмдэглэл засах</div>
      <div class="pp-form">
        <label>Ажлын гарчиг</label>
        <input id="ppEditTitle" class="input" value="${escapeHtml(r.title)}" autofocus>
        <div class="pp-form-row">
          <div>
            <label>Төрөл</label>
            <select id="ppEditType" class="input">
              ${Object.entries(PP_TYPE_LABELS).map(([k,v])=>`<option value="${k}" ${(r.todo_type||'work')===k?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Огноо</label>
            <input id="ppEditDate" class="input" type="date" value="${(r.work_date||'').slice(0,10)}">
          </div>
          <div>
            <label>Эхлэх цаг</label>
            <select id="ppEditTime" class="input">${ppTimeOptions(r.work_time||'')}</select>
          </div>
          <div>
            <label>Дуусах цаг</label>
            <select id="ppEditEndTime" class="input">${ppTimeOptions(r.work_end_time||'')}</select>
          </div>
          <div>
            <label>Ач холбогдол</label>
            <select id="ppEditPriority" class="input">
              ${Object.entries(PP_PRIORITY_LABELS).map(([k,v])=>`<option value="${k}" ${r.priority===k?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Төлөв</label>
            <select id="ppEditStatus" class="input">
              ${Object.entries(PP_STATUS_LABELS).map(([k,v])=>`<option value="${k}" ${r.status===k?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>
        <label>Нууцлал</label>
        <select id="ppEditPrivacy" class="input">
          ${Object.entries(PP_PRIVACY_LABELS).map(([k,v])=>`<option value="${k}" ${(r.privacy||'private')===k?'selected':''}>${v}</option>`).join('')}
        </select>
        ${ppCanAssign()?`
        <label>Хэнд оноох</label>
        <select id="ppEditAssignee" class="input">${ppUserOptions(r.assigned_to)}</select>`:''}
        <label>Тэмдэглэл</label>
        <textarea id="ppEditNote" class="input" rows="3">${escapeHtml(r.note||'')}</textarea>
      </div>
      <div class="pp-modal-actions">
        <button class="btn secondary" onclick="this.closest('.pp-modal').remove()">Болих</button>
        <button class="btn" onclick="pp_edit_save(${r.id})">Хадгалах</button>
      </div>
    </div>`);
  setTimeout(()=>document.getElementById('ppEditTitle')?.focus(), 30);
}

async function pp_edit_save(id) {
  const r = _ppRows.find(x=>Number(x.id)===Number(id));
  if (!r) return;
  const title = document.getElementById('ppEditTitle')?.value.trim();
  if (!title) { toast('Гарчиг оруулна уу'); return; }
  try {
    await api(`/api/nyarav/todos/${id}`, {
      method:'PUT',
      body: JSON.stringify({
        ...r, title,
        work_date:   document.getElementById('ppEditDate')?.value     || r.work_date,
        work_time:     document.getElementById('ppEditTime')?.value    || '',
        work_end_time: document.getElementById('ppEditEndTime')?.value || '',
        due_date:    document.getElementById('ppEditDate')?.value     || r.work_date,
        todo_type:   document.getElementById('ppEditType')?.value     || r.todo_type || 'work',
        privacy:     document.getElementById('ppEditPrivacy')?.value  || r.privacy || 'private',
        priority:    document.getElementById('ppEditPriority')?.value || r.priority,
        status:      document.getElementById('ppEditStatus')?.value   || r.status,
        assigned_to: document.getElementById('ppEditAssignee')?.value || r.assigned_to,
        note:        document.getElementById('ppEditNote')?.value     || '',
      }),
    });
    toast('Хадгалагдлаа');
    document.querySelector('.pp-modal')?.remove();
    await ppLoad();
  } catch(e) { toast('⚠ '+e.message); }
}

async function pp_toggle(id, done) {
  const r = _ppRows.find(x=>Number(x.id)===Number(id));
  if (!r) return;
  try {
    await api(`/api/nyarav/todos/${id}`, {
      method:'PUT', body: JSON.stringify({...r, status: done?'done':'todo'}),
    });
    await ppLoad();
  } catch(e) { toast('⚠ '+e.message); }
}

async function pp_delete(id) {
  const r = _ppRows.find(x=>Number(x.id)===Number(id));
  if (!r) return;
  if (!confirm(`"${r.title}" — устгах уу?`)) return;
  try {
    await api(`/api/nyarav/todos/${id}`, {method:'DELETE'});
    toast('Устгагдлаа');
    await ppLoad();
  } catch(e) { toast('⚠ '+e.message); }
}

function pp_note_open(id) {
  const r = _ppRows.find(x=>Number(x.id)===Number(id));
  if (!r) return;
  _ppModal(`
    <div class="pp-modal-card">
      <button class="pp-modal-close" onclick="this.closest('.pp-modal').remove()">×</button>
      <div class="pp-modal-title">${escapeHtml(r.title)}</div>
      <div class="pp-modal-sub">${escapeHtml(r.assigned_name||'')} · ${(r.work_date||'').slice(0,10)}</div>
      <div class="pp-form">
        <label>Шинэ тэмдэглэл</label>
        <textarea id="ppNoteNew" class="input" rows="3" placeholder="Тэмдэглэл нэмэх..." autofocus></textarea>
      </div>
      <div class="pp-modal-actions" style="margin-bottom:16px">
        <button class="btn secondary" onclick="this.closest('.pp-modal').remove()">Болих</button>
        <button class="btn" onclick="pp_note_save(${id})">Хадгалах</button>
      </div>
      <div id="ppNoteHistory" class="pp-note-history"><div class="pp-loading">Уншиж байна...</div></div>
    </div>`);
  setTimeout(()=>document.getElementById('ppNoteNew')?.focus(), 30);
  api(`/api/nyarav/todos/${id}/notes`).then(notes => {
    const el = document.getElementById('ppNoteHistory');
    if (!el) return;
    el.innerHTML = notes.length
      ? notes.map(n=>`
          <div class="pp-note-item">
            <div class="pp-note-meta"><b>${escapeHtml(n.user_name||'')}</b><span>${(n.created_at||'').slice(0,16)}</span></div>
            <div class="pp-note-text">${escapeHtml(n.note)}</div>
          </div>`).join('')
      : `<div class="pp-empty">Тэмдэглэл байхгүй</div>`;
  }).catch(e=>{
    const el=document.getElementById('ppNoteHistory');
    if(el) el.innerHTML=`<div class="pp-error">⚠ ${escapeHtml(e.message)}</div>`;
  });
}

async function pp_note_save(id) {
  const note = document.getElementById('ppNoteNew')?.value.trim();
  if (!note) { toast('Тэмдэглэл бичнэ үү'); return; }
  try {
    await api(`/api/nyarav/todos/${id}/notes`, {method:'POST', body:JSON.stringify({note})});
    toast('Тэмдэглэл хадгалагдлаа');
    document.querySelector('.pp-modal')?.remove();
    await ppLoad();
  } catch(e) { toast('⚠ '+e.message); }
}

function ppSetMonth(v)   { _ppMonth = v;   ppLoad(); }
function ppSetYear(v)    { _ppYear = v;    ppLoad(); }

function ppUpdateHeroSub() {
  const sub = document.getElementById('ppHeroSub');
  if (!sub) return;
  const me = state.me || {};
  const myId = String(me.id || '');
  if (!_ppAssignee || _ppAssignee === myId) {
    sub.textContent = `${me.position || me.role || ''} · ${ppMonthLabel(_ppMonth)}`;
  } else {
    const u = (state.users||[]).find(x => String(x.id) === String(_ppAssignee));
    sub.textContent = u
      ? `👁 ${u.full_name}${u.position ? ' · ' + u.position : ''} · ${ppMonthLabel(_ppMonth)}`
      : ppMonthLabel(_ppMonth);
  }
}
function ppSetAssignee(v){ _ppAssignee = v; ppLoad(); }

Object.assign(window, {
  personal_plan, ppLoad, ppNav, ppSetView, ppGoMonth, ppGoDay,
  ppDismissNotif,
  ppSetMonth, ppSetYear, ppUpdateHeroSub,
  pp_add_open, pp_add_save,
  pp_edit_open, pp_edit_save,
  pp_quick_mode, pp_quick_save,
  pp_toggle, pp_delete,
  pp_note_open, pp_note_save,
});
