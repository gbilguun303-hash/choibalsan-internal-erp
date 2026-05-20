import { state, api, toast, escapeHtml, today } from './common.js';

const DOC_TYPES = [
  'Лиценз', 'Гэрчилгээ', 'Зөвшөөрөл', 'Гэрээ', 'Дүгнэлт',
  'Техникийн паспорт', 'Даатгал', 'Бусад'
];

const STATUS_OPTS = ['Хүчинтэй', 'Дуусах гэж байна', 'Хугацаа дууссан', 'Цуцлагдсан'];

function daysLeft(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

function daysLeftPill(dateStr) {
  if (!dateStr) return '<span class="pill">—</span>';
  const d = daysLeft(dateStr);
  if (d < 0)  return `<span class="pill bad">Дууссан</span>`;
  if (d === 0) return `<span class="pill bad">Өнөөдөр!</span>`;
  if (d <= 7)  return `<span class="pill bad">${d} хоног</span>`;
  if (d <= 30) return `<span class="pill warn">${d} хоног</span>`;
  return `<span class="pill ok">${d} хоног</span>`;
}

function statusPill(s) {
  const cls = s === 'Хүчинтэй' ? 'ok' : s === 'Дуусах гэж байна' ? 'warn' : 'bad';
  return `<span class="pill ${cls}">${escapeHtml(s)}</span>`;
}

let _docs = [];
let _filter = '';

export async function docs() {
  const canEdit = ['director','hr','chief_engineer'].includes(state.me.role);
  _docs = await api('/api/documents');

  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <div>
      <h1 style="margin:0 0 4px">📄 Бичиг баримт</h1>
      <div style="font-size:12px;color:#667085">Лиценз · Гэрчилгээ · Зөвшөөрөл · Гэрээ</div>
    </div>
    ${canEdit ? `<button class="btn" onclick="docsOpenForm()">+ Нэмэх</button>` : ''}
  </div>

  <!-- Stats -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px" id="docsStats"></div>

  <!-- Filter -->
  <div class="panel" style="padding:14px 18px;margin-bottom:14px">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input class="input" style="width:220px;margin:0" placeholder="🔍 Хайх..." oninput="docsFilter(this.value)">
      <select class="input" style="width:160px;margin:0" onchange="docsFilter(undefined,this.value)" id="docsTypeFilter">
        <option value="">Бүх төрөл</option>
        ${DOC_TYPES.map(t=>`<option>${escapeHtml(t)}</option>`).join('')}
      </select>
      <select class="input" style="width:180px;margin:0" onchange="docsFilter(undefined,undefined,this.value)" id="docsStatusFilter">
        <option value="">Бүх төлөв</option>
        ${STATUS_OPTS.map(s=>`<option>${escapeHtml(s)}</option>`).join('')}
      </select>
    </div>
  </div>

  <!-- Table -->
  <div class="panel" style="padding:0">
    <div class="table-wrap" id="docsTable"></div>
  </div>

  <!-- Modal -->
  <div id="docsModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;overflow-y:auto">
    <div style="background:#fff;border-radius:16px;max-width:560px;margin:40px auto;padding:32px" onclick="event.stopPropagation()">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h2 style="margin:0;font-size:17px" id="docsFormTitle">Бичиг баримт нэмэх</h2>
        <button onclick="docsCloseForm()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#667085">✕</button>
      </div>
      <div id="docsFormBody"></div>
    </div>
  </div>`;

  docsRenderStats();
  docsRenderTable();
}

function docsRenderStats() {
  const total    = _docs.length;
  const valid    = _docs.filter(d => d.status === 'Хүчинтэй').length;
  const expiring = _docs.filter(d => { const dl = daysLeft(d.valid_until); return dl !== null && dl >= 0 && dl <= 30; }).length;
  const expired  = _docs.filter(d => { const dl = daysLeft(d.valid_until); return dl !== null && dl < 0; }).length;

  const el = document.getElementById('docsStats');
  if (!el) return;
  el.innerHTML = [
    ['📄', 'Нийт баримт',     total,    '#2563eb', '#eff6ff', '#bfdbfe'],
    ['✅', 'Хүчинтэй',        valid,    '#16a34a', '#f0fdf4', '#bbf7d0'],
    ['⚠️', 'Дуусах гэж байна',expiring, '#d97706', '#fffbeb', '#fde68a'],
    ['❌', 'Хугацаа дууссан', expired,  '#dc2626', '#fef2f2', '#fecaca'],
  ].map(([ic,lb,vl,tc,bg,bd])=>`
    <div style="background:${bg};border:1px solid ${bd};border-radius:12px;padding:14px 16px;border-top:3px solid ${tc}">
      <div style="font-size:11px;color:#667085;margin-bottom:4px;font-weight:600">${lb}</div>
      <div style="font-size:26px;font-weight:800;color:${tc}">${ic} ${vl}</div>
    </div>`).join('');
}

let _searchVal = '', _typeVal = '', _statusVal = '';

function docsFilter(search, type, status) {
  if (search  !== undefined) _searchVal  = search.toLowerCase();
  if (type    !== undefined) _typeVal    = type;
  if (status  !== undefined) _statusVal  = status;
  docsRenderTable();
}

function docsRenderTable() {
  const canEdit = ['director','hr','chief_engineer'].includes(state.me.role);
  const filtered = _docs.filter(d => {
    if (_typeVal   && d.doc_type !== _typeVal)   return false;
    if (_statusVal && d.status   !== _statusVal) return false;
    if (_searchVal && !`${d.title} ${d.issued_by} ${d.doc_type}`.toLowerCase().includes(_searchVal)) return false;
    return true;
  });

  const el = document.getElementById('docsTable');
  if (!el) return;

  if (!filtered.length) {
    el.innerHTML = '<div class="muted" style="padding:32px;text-align:center">Бичиг баримт олдсонгүй</div>';
    return;
  }

  el.innerHTML = `<table>
    <thead><tr>
      <th>Төрөл</th><th>Гарчиг</th><th>Олгосон байгууллага</th>
      <th>Олгосон огноо</th><th>Дуусах хугацаа</th><th>Үлдсэн хоног</th>
      <th>Төлөв</th><th>Файл</th>${canEdit?'<th></th>':''}
    </tr></thead>
    <tbody>
    ${filtered.map(d => `
      <tr>
        <td><span class="pill info" style="font-size:10px">${escapeHtml(d.doc_type)}</span></td>
        <td style="font-weight:600;max-width:180px">${escapeHtml(d.title)}</td>
        <td style="color:#667085;font-size:12px">${escapeHtml(d.issued_by||'—')}</td>
        <td style="font-size:12px">${d.issued_date||'—'}</td>
        <td style="font-size:12px">${d.valid_until||'—'}</td>
        <td>${daysLeftPill(d.valid_until)}</td>
        <td>${statusPill(d.status)}</td>
        <td>${d.file_path
          ? `<a href="${d.file_path}" target="_blank" style="font-size:12px;color:#2563eb">📎 Харах</a>`
          : '<span style="color:#ccc;font-size:12px">—</span>'}</td>
        ${canEdit ? `<td style="white-space:nowrap">
          <button class="btn sm secondary" onclick="docsOpenForm(${d.id})">✏️</button>
          <button class="btn sm secondary" style="color:#dc2626" onclick="docsDelete(${d.id},'${escapeHtml(d.title)}')">🗑</button>
        </td>` : ''}
      </tr>`).join('')}
    </tbody>
  </table>`;
}

let _editId = null;

function docsOpenForm(id) {
  _editId = id || null;
  const d = id ? _docs.find(x => x.id === id) : null;
  document.getElementById('docsFormTitle').textContent = d ? 'Баримт засах' : 'Бичиг баримт нэмэх';

  document.getElementById('docsFormBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <label style="font-size:12px;color:#667085;font-weight:600">Төрөл *</label>
        <select class="input" id="df_type">
          ${DOC_TYPES.map(t=>`<option ${d?.doc_type===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:12px;color:#667085;font-weight:600">Төлөв</label>
        <select class="input" id="df_status">
          ${STATUS_OPTS.map(s=>`<option ${d?.status===s?'selected':''}>${escapeHtml(s)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="margin-top:10px">
      <label style="font-size:12px;color:#667085;font-weight:600">Гарчиг *</label>
      <input class="input" id="df_title" value="${escapeHtml(d?.title||'')}" placeholder="Баримтын нэр / дугаар">
    </div>
    <div style="margin-top:10px">
      <label style="font-size:12px;color:#667085;font-weight:600">Олгосон байгууллага</label>
      <input class="input" id="df_issued_by" value="${escapeHtml(d?.issued_by||'')}" placeholder="Ямар байгууллагаас олгосон">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
      <div>
        <label style="font-size:12px;color:#667085;font-weight:600">Олгосон огноо</label>
        <input class="input" id="df_issued_date" type="date" value="${d?.issued_date||''}">
      </div>
      <div>
        <label style="font-size:12px;color:#667085;font-weight:600">Хүчинтэй эхлэх</label>
        <input class="input" id="df_valid_from" type="date" value="${d?.valid_from||''}">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
      <div>
        <label style="font-size:12px;color:#667085;font-weight:600">Дуусах огноо</label>
        <input class="input" id="df_valid_until" type="date" value="${d?.valid_until||''}">
      </div>
      <div>
        <label style="font-size:12px;color:#667085;font-weight:600">Сануулах (өдрийн өмнө)</label>
        <input class="input" id="df_notify" type="number" value="${d?.notify_days_before??30}" min="1" max="365">
      </div>
    </div>
    <div style="margin-top:10px">
      <label style="font-size:12px;color:#667085;font-weight:600">Тайлбар</label>
      <textarea class="input" id="df_desc" rows="2" style="resize:vertical">${escapeHtml(d?.description||'')}</textarea>
    </div>
    <div style="margin-top:14px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e6ed">
      <div style="font-size:12px;font-weight:600;color:#667085;margin-bottom:8px">📎 Файл хавсаргах (зураг / скан)</div>
      ${d?.file_path ? `<div style="margin-bottom:8px;font-size:12px">
        Одоогийн файл: <a href="${d.file_path}" target="_blank" style="color:#2563eb">Харах</a>
      </div>` : ''}
      <input type="file" id="df_file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style="font-size:12px;width:100%">
      <div id="df_file_preview" style="margin-top:8px"></div>
      ${d ? `<button class="btn sm secondary" style="margin-top:8px" onclick="docsUploadFile(${d.id})">Файл хадгалах</button>` : ''}
    </div>
    <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">
      <button class="btn secondary" onclick="docsCloseForm()">Болих</button>
      <button class="btn" onclick="docsSave()">Хадгалах</button>
    </div>`;

  document.getElementById('docsModal').style.display = 'block';

  const fileInput = document.getElementById('df_file');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const preview = document.getElementById('df_file_preview');
      const file = fileInput.files[0];
      if (!file || !preview) return;
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        preview.innerHTML = `<img src="${url}" style="max-width:100%;max-height:180px;border-radius:6px;border:1px solid #e2e6ed;margin-top:4px">`;
      } else {
        const ext = file.name.split('.').pop().toLowerCase();
        const icon = ext === 'pdf' ? '📕'
          : ['doc','docx'].includes(ext) ? '📝'
          : ['xls','xlsx'].includes(ext) ? '📊'
          : ['ppt','pptx'].includes(ext) ? '📑'
          : '📄';
        preview.innerHTML = `<div style="font-size:12px;color:#2563eb;margin-top:4px">${icon} ${escapeHtml(file.name)}</div>`;
      }
    });
  }
}

function docsCloseForm() {
  document.getElementById('docsModal').style.display = 'none';
  _editId = null;
}

async function docsSave() {
  const title = document.getElementById('df_title').value.trim();
  const type  = document.getElementById('df_type').value;
  if (!title) { toast('Гарчиг оруулна уу'); return; }

  const body = {
    doc_type:           type,
    title,
    description:        document.getElementById('df_desc').value.trim(),
    issued_by:          document.getElementById('df_issued_by').value.trim(),
    issued_date:        document.getElementById('df_issued_date').value || null,
    valid_from:         document.getElementById('df_valid_from').value || null,
    valid_until:        document.getElementById('df_valid_until').value || null,
    notify_days_before: Number(document.getElementById('df_notify').value) || 30,
    status:             document.getElementById('df_status').value,
  };

  try {
    let docId = _editId;
    if (_editId) {
      await api(`/api/documents/${_editId}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      const r = await api('/api/documents', { method: 'POST', body: JSON.stringify(body) });
      docId = r.id;
    }

    const fileInput = document.getElementById('df_file');
    if (fileInput?.files?.length) {
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      const res = await fetch(`/api/documents/${docId}/file`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + state.token },
        body: fd
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Файл хадгалах алдаа');
      }
    }

    toast('Хадгаллаа');
    docsCloseForm();
    docs();
  } catch(e) { toast(e.message || 'Алдаа гарлаа'); }
}

async function docsUploadFile(id) {
  const fileInput = document.getElementById('df_file');
  if (!fileInput?.files?.length) { toast('Файл сонгоно уу'); return; }
  const fd = new FormData();
  fd.append('file', fileInput.files[0]);
  try {
    const res = await fetch(`/api/documents/${id}/file`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + state.token },
      body: fd
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Алдаа');
    toast('Файл хадгаллаа');
    docsCloseForm();
    docs();
  } catch(e) { toast(e.message || 'Алдаа гарлаа'); }
}

async function docsDelete(id, title) {
  if (!confirm(`"${title}" — устгах уу?`)) return;
  try {
    await api(`/api/documents/${id}`, { method: 'DELETE' });
    toast('Устгагдлаа');
    docs();
  } catch(e) { toast(e.message || 'Алдаа'); }
}

Object.assign(window, { docs, docsFilter, docsOpenForm, docsCloseForm, docsSave, docsUploadFile, docsDelete });
