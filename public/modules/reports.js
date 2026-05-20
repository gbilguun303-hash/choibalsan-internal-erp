import { api, table, state, today, escapeHtml, toast } from './common.js';

let _rptCatFilter = new Set(); // empty = show all
let _workCats     = [];

const FREQ_OPTS = ["Өдөр тутам","7 хоног","Сар тутам","Улирал тутам","Хагас жил","Жил тутам","Нэг удаа"];

function daysDiff(dateStr) {
  const due = new Date(dateStr);
  due.setHours(0,0,0,0);
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((due - now) / 86400000);
}

function statusBadge(dateStr, isActive) {
  if (!isActive) return `<span style="padding:2px 8px;border-radius:20px;font-size:11px;background:#f1f5f9;color:#94a3b8">Идэвхгүй</span>`;
  const d = daysDiff(dateStr);
  if (d < 0)  return `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:#fee2e2;color:#dc2626">${Math.abs(d)} хоног хэтэрсэн</span>`;
  if (d === 0) return `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:#fee2e2;color:#dc2626">Өнөөдөр!</span>`;
  if (d <= 3)  return `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:#fee2e2;color:#dc2626">${d} хоног</span>`;
  if (d <= 7)  return `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:#fef3c7;color:#d97706">${d} хоног</span>`;
  return `<span style="padding:2px 8px;border-radius:20px;font-size:11px;background:#dcfce7;color:#16a34a">${d} хоног</span>`;
}

// ── Тайлангийн хуваарь ────────────────────────────────────────

async function report_schedule() {
  let rows = [];
  const canEdit = ["director","hr","accountant"].includes(state.me.role);

  async function load() {
    try { rows = await api("/api/report-schedules"); } catch(e) { rows = []; }
    render();
  }

  function render() {
    const overdue  = rows.filter(r => r.is_active && daysDiff(r.next_due) <= 0).length;
    const upcoming = rows.filter(r => r.is_active && daysDiff(r.next_due) > 0 && daysDiff(r.next_due) <= 7).length;

    main.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <div>
        <h1 style="margin:0 0 4px">📋 Тайлангийн хуваарь</h1>
        <div style="font-size:12px;color:#667085">Report Schedule · Гаргах тайлангийн хугацааны хяналт</div>
      </div>
      ${canEdit ? `<button class="btn" onclick="rsOpenForm(0)">+ Хуваарь нэмэх</button>` : ""}
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">
      <div style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;padding:14px 16px;border-top:3px solid #2563eb">
        <div style="font-size:11px;color:#667085;margin-bottom:4px;text-transform:uppercase">Нийт хуваарь</div>
        <div style="font-size:24px;font-weight:800;color:#2563eb">${rows.filter(r=>r.is_active).length}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;padding:14px 16px;border-top:3px solid #dc2626">
        <div style="font-size:11px;color:#667085;margin-bottom:4px;text-transform:uppercase">Хэтэрсэн / Өнөөдөр</div>
        <div style="font-size:24px;font-weight:800;color:#dc2626">${overdue}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;padding:14px 16px;border-top:3px solid #d97706">
        <div style="font-size:11px;color:#667085;margin-bottom:4px;text-transform:uppercase">7 хоногийн дотор</div>
        <div style="font-size:24px;font-weight:800;color:#d97706">${upcoming}</div>
      </div>
    </div>

    <div class="panel" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f8fafc;border-bottom:2px solid #e2e6ed">
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#667085;font-weight:700">#</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#667085;font-weight:700">ТАЙЛАНГИЙН НЭР</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#667085;font-weight:700">ДАВТАМЖ</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#667085;font-weight:700">ДАРААГИЙН ХУГАЦАА</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#667085;font-weight:700">ҮЛДСЭН</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#667085;font-weight:700">ХАРИУЦАХ</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#667085;font-weight:700">ХҮЛЭЭН АВАГЧ</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#667085;font-weight:700">ТЭМДЭГЛЭЛ</th>
            <th style="padding:10px 14px;font-size:11px;color:#667085;font-weight:700"></th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((r, i) => `
            <tr style="border-bottom:1px solid #f1f5f9;${!r.is_active?'opacity:0.5':''}">
              <td style="padding:10px 14px;color:#94a3b8;font-size:11px">${i+1}</td>
              <td style="padding:10px 14px;font-weight:700">${escapeHtml(r.name)}</td>
              <td style="padding:10px 14px"><span style="padding:2px 8px;border-radius:20px;font-size:11px;background:#eff6ff;color:#2563eb">${escapeHtml(r.frequency)}</span></td>
              <td style="padding:10px 14px;font-family:monospace;font-weight:600">
                ${r.next_due}
                ${r.last_sent ? `<div style="font-size:10px;color:#16a34a;margin-top:2px">✓ ${r.last_sent}</div>` : ""}
              </td>
              <td style="padding:10px 14px">${statusBadge(r.next_due, r.is_active)}</td>
              <td style="padding:10px 14px;color:#374151;font-size:12px">${escapeHtml(r.responsible||"—")}</td>
              <td style="padding:10px 14px;color:#374151;font-size:12px">${escapeHtml(r.recipient||"—")}</td>
              <td style="padding:10px 14px;color:#94a3b8;font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.note||"—")}</td>
              <td style="padding:10px 14px;white-space:nowrap">
                ${r.is_active ? `<button class="btn secondary sm" onclick="rsMarkSent(${r.id})" style="color:#16a34a;margin-right:4px" title="Тайлан илгээсэн гэж тэмдэглэх">✓ Илгээсэн</button>` : ""}
                ${canEdit ? `<button class="btn secondary sm" onclick="rsOpenForm(${r.id})" style="margin-right:4px">✏</button>
                <button class="btn secondary sm" style="color:#dc2626" onclick="rsDelete(${r.id})">🗑</button>` : ""}
              </td>
            </tr>`).join("") : `
            <tr><td colspan="9" style="text-align:center;padding:32px;color:#94a3b8">Хуваарь бүртгэгдээгүй байна</td></tr>`}
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <div id="rsModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:14px;padding:28px;width:500px;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <div id="rsModalTitle" style="font-size:16px;font-weight:800;margin-bottom:18px"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div style="grid-column:1/-1">
            <div style="font-size:11px;color:#667085;margin-bottom:4px">Тайлангийн нэр *</div>
            <input class="input" id="rs_name" placeholder="Жишээ: Сарын санхүүгийн тайлан">
          </div>
          <div>
            <div style="font-size:11px;color:#667085;margin-bottom:4px">Давтамж *</div>
            <select class="input" id="rs_freq">
              ${FREQ_OPTS.map(f=>`<option>${f}</option>`).join("")}
            </select>
          </div>
          <div>
            <div style="font-size:11px;color:#667085;margin-bottom:4px">Дараагийн хугацаа *</div>
            <input class="input" id="rs_due" type="date" value="${today()}">
          </div>
          <div>
            <div style="font-size:11px;color:#667085;margin-bottom:4px">Хариуцах</div>
            <input class="input" id="rs_resp" placeholder="Нэр / хэлтэс">
          </div>
          <div>
            <div style="font-size:11px;color:#667085;margin-bottom:4px">Хүлээн авагч</div>
            <input class="input" id="rs_recv" placeholder="Удирдлага, байгууллага...">
          </div>
          <div>
            <div style="font-size:11px;color:#667085;margin-bottom:4px">Анхааруулах (хоног)</div>
            <input class="input" id="rs_warn" type="number" value="7" min="1">
          </div>
          <div>
            <div style="font-size:11px;color:#667085;margin-bottom:4px">Идэвхтэй</div>
            <select class="input" id="rs_active">
              <option value="1">Тийм</option>
              <option value="0">Үгүй</option>
            </select>
          </div>
          <div style="grid-column:1/-1">
            <div style="font-size:11px;color:#667085;margin-bottom:4px">Тэмдэглэл</div>
            <input class="input" id="rs_note" placeholder="Нэмэлт тайлбар...">
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:4px">
          <button class="btn" onclick="rsSave()">Хадгалах</button>
          <button class="btn secondary" onclick="document.getElementById('rsModal').style.display='none'">Цуцлах</button>
        </div>
      </div>
    </div>`;

    window._rsRows = rows;
    window.rsOpenForm = (id) => {
      const r = id ? rows.find(x => x.id === id) : null;
      document.getElementById("rsModalTitle").textContent = r ? "Хуваарь засах" : "+ Хуваарь нэмэх";
      document.getElementById("rs_name").value   = r ? r.name        : "";
      document.getElementById("rs_freq").value   = r ? r.frequency   : FREQ_OPTS[2];
      document.getElementById("rs_due").value    = r ? r.next_due    : today();
      document.getElementById("rs_resp").value   = r ? (r.responsible||"") : "";
      document.getElementById("rs_recv").value   = r ? (r.recipient||"")   : "";
      document.getElementById("rs_warn").value   = r ? (r.warn_days||7)    : 7;
      document.getElementById("rs_active").value = r ? String(r.is_active) : "1";
      document.getElementById("rs_note").value   = r ? (r.note||"") : "";
      document.getElementById("rsModal").dataset.editId = id || "";
      document.getElementById("rsModal").style.display = "flex";
    };
    window.rsSave = async () => {
      const editId = document.getElementById("rsModal").dataset.editId;
      const body = {
        name:        document.getElementById("rs_name").value.trim(),
        frequency:   document.getElementById("rs_freq").value,
        next_due:    document.getElementById("rs_due").value,
        responsible: document.getElementById("rs_resp").value,
        recipient:   document.getElementById("rs_recv").value,
        warn_days:   Number(document.getElementById("rs_warn").value||7),
        is_active:   Number(document.getElementById("rs_active").value),
        note:        document.getElementById("rs_note").value
      };
      if (!body.name || !body.next_due) { toast("Нэр болон хугацааг оруулна уу"); return; }
      try {
        if (editId) {
          await api(`/api/report-schedules/${editId}`, { method:"PUT", body:JSON.stringify(body) });
          toast("Хадгаллаа");
        } else {
          await api("/api/report-schedules", { method:"POST", body:JSON.stringify(body) });
          toast("Нэмэгдлээ");
        }
        document.getElementById("rsModal").style.display = "none";
        load();
      } catch(e) { toast(e.message); }
    };
    window.rsDelete = async (id) => {
      if (!confirm("Энэ хуваарийг устгах уу?")) return;
      try {
        await api(`/api/report-schedules/${id}`, { method:"DELETE" });
        toast("Устгагдлаа");
        load();
      } catch(e) { toast(e.message); }
    };
    window.rsMarkSent = async (id) => {
      const r = rows.find(x => x.id === id);
      if (!r) return;
      const msg = r.frequency === "Нэг удаа"
        ? `"${r.name}" тайланг илгээсэн гэж тэмдэглэх үү?\n(Нэг удаагийн тайлан — идэвхгүй болно)`
        : `"${r.name}" тайланг илгээсэн гэж тэмдэглэх үү?\nДараагийн хугацаа автоматаар шинэчлэгдэнэ.`;
      if (!confirm(msg)) return;
      try {
        const result = await api(`/api/report-schedules/${id}/mark-sent`, { method:"POST" });
        toast(`Илгээсэн гэж тэмдэглэгдлээ. Дараагийн хугацаа: ${result.next_due}`);
        load();
      } catch(e) { toast(e.message); }
    };
  }

  load();
}

// ── Ерөнхий тайлан ───────────────────────────────────────────

function _rptVals() {
  const y = Number(document.getElementById("rptYear")?.value  || new Date().getFullYear());
  const m = Number(document.getElementById("rptMonth")?.value || new Date().getMonth()+1);
  return { y, m };
}

function reloadReports() { reports(); }

async function reports() {
  const now = new Date();
  const savedY = document.getElementById("rptYear")?.value;
  const savedM = document.getElementById("rptMonth")?.value;

  const initYear  = savedY ? Number(savedY)  : now.getFullYear();
  const initMonth = savedM ? Number(savedM)  : now.getMonth()+1;

  const MN_MONTHS = ["","1-р сар","2-р сар","3-р сар","4-р сар","5-р сар",
    "6-р сар","7-р сар","8-р сар","9-р сар","10-р сар","11-р сар","12-р сар"];

  main.innerHTML = `<div style="text-align:center;padding:40px;color:#667085">⏳ Уншиж байна...</div>`;

  let allWork = [], execs = [];
  try { allWork = await api("/api/work-logs"); } catch(e) {}
  try { execs   = await api(`/api/executions?year=${initYear}`); } catch(e) {}
  try { _workCats = await api("/api/work-categories"); } catch(e) {}
  if (!_workCats.length) {
    const catNames = [...new Set(allWork.map(r=>r.category||"").filter(Boolean))];
    _workCats = catNames.map(n => ({ name: n, icon: "📋", color: "#2563eb" }));
  }

  const mm = String(initMonth).padStart(2,"0");
  const prefix = `${initYear}-${mm}`;

  const filtered = allWork.filter(r => {
    const d = r.start_date || r.work_date || "";
    return d.startsWith(prefix) || (r.end_date||"").startsWith(prefix) ||
           execs.some(e => e.work_log_id === r.id && (
             (e.start_date||"").startsWith(prefix) || (e.end_date||"").startsWith(prefix)));
  }).filter(r => _rptCatFilter.size === 0 || _rptCatFilter.has(r.category || ""));

  const done    = filtered.filter(r => r.status === "Дууссан").length;
  const ongoing = filtered.filter(r => r.status === "Явцтай").length;
  const waiting = filtered.filter(r => r.status === "Хүлээгдэж байгаа" || r.status === "Эхэлсэн").length;

  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div>
      <h1 style="margin:0 0 2px">📑 Ажлын явцын тайлан</h1>
      <div style="font-size:12px;color:#667085">Сар сонгоод тайланг хэвлэнэ үү</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select id="rptYear" class="input" style="width:80px" onchange="reloadReports()">
        ${[2024,2025,2026,2027].map(y=>`<option value="${y}" ${y===initYear?"selected":""}>${y}</option>`).join("")}
      </select>
      <select id="rptMonth" class="input" style="width:100px" onchange="reloadReports()">
        ${MN_MONTHS.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===initMonth?"selected":""}>${m}</option>`).join("")}
      </select>
      <button class="btn" onclick="const v=_rptVals();printWorkReport(v.y,v.m,false)" style="padding:6px 14px">🖨️ Зураггүй</button>
      <button class="btn" onclick="const v=_rptVals();printWorkReport(v.y,v.m,true)" style="padding:6px 14px;background:#0ea5e9;border-color:#0ea5e9">🖼️ Зурагтай</button>
    </div>
  </div>

  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:16px;padding:8px 12px;background:#f8f9fb;border-radius:10px;border:1px solid #e2e6ed">
    <span style="font-size:11px;color:#667085;font-weight:700;white-space:nowrap;margin-right:2px">Категори:</span>
    <button onclick="rptToggleAll()"
      style="padding:4px 14px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;transition:all .15s;
             border:2px solid ${_rptCatFilter.size===0?'#2563eb':'#d1d5db'};
             background:${_rptCatFilter.size===0?'#2563eb':'transparent'};
             color:${_rptCatFilter.size===0?'#fff':'#374151'}">
      Бүх
    </button>
    ${_workCats.map(c => {
      const on = _rptCatFilter.has(c.name);
      const col = c.color || '#2563eb';
      return `<button data-cat="${escapeHtml(c.name)}" onclick="rptToggleCat(this.dataset.cat)"
        style="padding:4px 14px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;transition:all .15s;
               border:2px solid ${on ? col : '#d1d5db'};
               background:${on ? col : 'transparent'};
               color:${on ? '#fff' : '#374151'}">
        ${c.icon||'📋'} ${escapeHtml(c.name)}
      </button>`;
    }).join("")}
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
    <div class="panel" style="padding:12px 16px;border-top:3px solid #2563eb;margin:0">
      <div style="font-size:10px;color:#667085;margin-bottom:4px">НИЙТ АЖИЛ</div>
      <div style="font-size:24px;font-weight:900;color:#2563eb">${filtered.length}</div>
    </div>
    <div class="panel" style="padding:12px 16px;border-top:3px solid #16a34a;margin:0">
      <div style="font-size:10px;color:#667085;margin-bottom:4px">ДУУССАН</div>
      <div style="font-size:24px;font-weight:900;color:#16a34a">${done}</div>
    </div>
    <div class="panel" style="padding:12px 16px;border-top:3px solid #6366f1;margin:0">
      <div style="font-size:10px;color:#667085;margin-bottom:4px">ЯВЦТАЙ</div>
      <div style="font-size:24px;font-weight:900;color:#6366f1">${ongoing}</div>
    </div>
    <div class="panel" style="padding:12px 16px;border-top:3px solid #d97706;margin:0">
      <div style="font-size:10px;color:#667085;margin-bottom:4px">ХҮЛЭЭГДЭЖ БУЙ</div>
      <div style="font-size:24px;font-weight:900;color:#d97706">${waiting}</div>
    </div>
  </div>

  <div class="panel" style="padding:0;overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#f8f9fb;border-bottom:2px solid #e2e6ed">
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#667085;font-weight:700;white-space:nowrap">#</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#667085;font-weight:700">АЖЛЫН НЭР / БАЙРШИЛ</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#667085;font-weight:700;white-space:nowrap">ОГНОО</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#667085;font-weight:700">АЖИЛЧИД</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#667085;font-weight:700;white-space:nowrap">ЯВЦ</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#667085;font-weight:700;white-space:nowrap">ТӨЛӨВ</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#667085;font-weight:700">ГҮЙЦЭТГЭЛ</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.length ? filtered.map((r,i) => {
          const wExecs = execs.filter(e => e.work_log_id === r.id);
          const prog = r.progress || 0;
          const progColor = prog===100?'#16a34a':prog>=50?'#2563eb':'#d97706';
          const statusBg  = r.status==='Дууссан'?'#dcfce7':r.status==='Явцтай'?'#dbeafe':'#f1f5f9';
          const statusCl  = r.status==='Дууссан'?'#16a34a':r.status==='Явцтай'?'#1d4ed8':'#475569';
          return `
          <tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:10px 12px;color:#94a3b8;font-size:11px;vertical-align:top">${i+1}</td>
            <td style="padding:10px 12px;vertical-align:top">
              <div style="font-weight:700;font-size:12px">${escapeHtml(r.title||"")}</div>
              <div style="font-size:11px;color:#667085">${escapeHtml(r.location||"")}</div>
              ${r.category?`<div style="font-size:10px;color:#94a3b8">${escapeHtml(r.category)}</div>`:""}
            </td>
            <td style="padding:10px 12px;font-size:11px;color:#344054;vertical-align:top;white-space:nowrap">
              ${r.start_date||r.work_date||""}<br><span style="color:#94a3b8">~</span> ${r.end_date||""}
            </td>
            <td style="padding:10px 12px;font-size:11px;color:#2563eb;vertical-align:top">
              ${escapeHtml(r.material_note||"")}
            </td>
            <td style="padding:10px 12px;vertical-align:top;min-width:70px">
              <div style="font-weight:800;color:${progColor};font-size:13px">${prog}%</div>
              <div style="height:5px;background:#e2e6ed;border-radius:10px;overflow:hidden;margin-top:3px;width:60px">
                <div style="height:100%;width:${prog}%;background:${progColor};border-radius:10px"></div>
              </div>
            </td>
            <td style="padding:10px 12px;vertical-align:top;white-space:nowrap">
              <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${statusBg};color:${statusCl};font-weight:600">${r.status||""}</span>
              ${r.confirm_status==="confirmed"?`<div style="font-size:9px;color:#16a34a;margin-top:2px">✅ Батлагдсан</div>`:""}
            </td>
            <td style="padding:10px 12px;vertical-align:top;min-width:160px">
              ${wExecs.length ? wExecs.map((ex,j) => `
                <div style="margin-bottom:4px;padding:4px 8px;background:#f8f9fb;border-radius:6px;border-left:3px solid ${ex.status==='Дууссан'?'#16a34a':'#6366f1'}">
                  <div style="font-size:10px;font-weight:700;color:#344054">Гүйцэтгэл ${j+1}: ${escapeHtml(ex.title||"")}</div>
                  <div style="font-size:9px;color:#667085">${ex.start_date||""} ~ ${ex.end_date||""} · ${ex.progress||0}%</div>
                  ${ex.workers?`<div style="font-size:9px;color:#2563eb">👷 ${escapeHtml(ex.workers)}</div>`:""}
                  ${ex.note?`<div style="font-size:9px;color:#475569;margin-top:2px">📝 ${escapeHtml(ex.note)}</div>`:""}
                </div>`).join("") : `<span style="font-size:10px;color:#94a3b8">—</span>`}
            </td>
          </tr>`;
        }).join("") : `<tr><td colspan="7" style="padding:30px;text-align:center;color:#94a3b8">
          ${MN_MONTHS[_rptMonth]} ${_rptYear} онд ажил бүртгэгдээгүй байна
        </td></tr>`}
      </tbody>
    </table>
  </div>

  <div class="panel" style="background:linear-gradient(135deg,#1e40af 0%,#2563eb 100%);border:none;margin-top:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:14px;font-weight:800;color:#fff;margin-bottom:4px">🧠 Smart Import</div>
        <div style="font-size:11px;color:#bfdbfe">Нягтлангийн програмаас гаргасан Excel-г автоматаар таньж оруулна</div>
      </div>
      <button onclick="openSmartImport()"
        style="padding:9px 20px;background:#fff;color:#1d4ed8;font-weight:800;font-size:13px;border:none;border-radius:10px;cursor:pointer">
        📂 Excel оруулах
      </button>
    </div>
  </div>`;
}

async function printWorkReport(year, month, withImages = false) {
  const MN_MONTHS = ["","1-р сар","2-р сар","3-р сар","4-р сар","5-р сар",
    "6-р сар","7-р сар","8-р сар","9-р сар","10-р сар","11-р сар","12-р сар"];

  let allWork = [], execs = [];
  try { allWork = await api("/api/work-logs"); } catch(e) {}
  try { execs   = await api(`/api/executions?year=${year}`); } catch(e) {}

  const mm = String(month).padStart(2,"0");
  const prefix = `${year}-${mm}`;
  const filtered = allWork.filter(r => {
    const d = r.start_date || r.work_date || "";
    return d.startsWith(prefix) || (r.end_date||"").startsWith(prefix) ||
           execs.some(e => e.work_log_id === r.id && (
             (e.start_date||"").startsWith(prefix) || (e.end_date||"").startsWith(prefix)));
  }).filter(r => _rptCatFilter.size === 0 || _rptCatFilter.has(r.category || ""));

  const done    = filtered.filter(r=>r.status==="Дууссан").length;
  const ongoing = filtered.filter(r=>r.status==="Явцтай").length;
  const waiting = filtered.length - done - ongoing;
  const avgProg = filtered.length ? Math.round(filtered.reduce((a,r)=>a+(r.progress||0),0)/filtered.length) : 0;

  // Зурагтай хэвлэх үед бүх гүйцэтгэлийн зургийг татна
  let photoMap = {};
  if (withImages && execs.length) {
    const results = await Promise.all(
      execs.map(e => api(`/api/executions/${e.id}/photos`)
        .then(photos => ({ id: e.id, photos }))
        .catch(() => ({ id: e.id, photos: [] })))
    );
    results.forEach(({ id, photos }) => { photoMap[id] = photos; });
  }

  const origin = location.origin;

  const rows = filtered.map((r, i) => {
    const wExecs = execs.filter(e => e.work_log_id === r.id);
    return `
    <tr>
      <td style="text-align:center">${i+1}</td>
      <td><b>${escapeHtml(r.title||"")}</b><br><span style="font-size:10px;color:#666">${escapeHtml(r.location||"")}</span></td>
      <td style="text-align:center;white-space:nowrap">${r.start_date||r.work_date||""}</td>
      <td style="text-align:center;white-space:nowrap">${r.end_date||""}</td>
      <td>${escapeHtml(r.material_note||"")}</td>
      <td style="text-align:center;font-weight:700">${r.progress||0}%</td>
      <td style="text-align:center">${escapeHtml(r.status||"")}</td>
      <td>${wExecs.map((ex,j)=>`<div style="margin-bottom:5px"><b>Г${j+1}:</b> ${escapeHtml(ex.title||"")}
        (${ex.start_date||""} ~ ${ex.end_date||""}, ${ex.progress||0}%)
        ${ex.workers?`<br><small>👷 ${escapeHtml(ex.workers)}</small>`:""}
        ${ex.note?`<br><small>📝 ${escapeHtml(ex.note)}</small>`:""}
        ${withImages && photoMap[ex.id]?.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${photoMap[ex.id].map(p=>`<img src="${origin}${p.file_path}" style="width:130px;height:90px;object-fit:cover;border-radius:3px;border:1px solid #ccc;print-color-adjust:exact">`).join("")}</div>` : ""}
      </div>`).join("")||"—"}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="mn"><head><meta charset="utf-8">
  <title>Ажлын явцын тайлан — ${MN_MONTHS[month]} ${year} он${_rptCatFilter.size ? " · " + [..._rptCatFilter].join(", ") : ""}${withImages ? " · Зурагтай" : ""}</title>
  <style>
    body { font-family: 'Arial', sans-serif; font-size: 11pt; margin: 0; color: #000; }
    .header { text-align: center; margin-bottom: 18px; border-bottom: 2px solid #000; padding-bottom: 10px; }
    .header h2 { margin: 4px 0; font-size: 14pt; }
    .header p  { margin: 2px 0; font-size: 10pt; color: #444; }
    .summary { display: flex; gap: 20px; margin-bottom: 16px; }
    .sum-box { border: 1px solid #ccc; border-radius: 6px; padding: 8px 16px; text-align: center; flex: 1; }
    .sum-box b { font-size: 18pt; display: block; }
    .sum-box span { font-size: 9pt; color: #666; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    th { background: #1d4ed8; color: #fff; padding: 6px 8px; text-align: left; font-size: 9pt; }
    td { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }
    tr:nth-child(even) td { background: #f5f7ff; }
    .footer { margin-top: 30px; display: flex; justify-content: space-between; }
    .sign { text-align: center; border-top: 1px solid #000; padding-top: 6px; width: 200px; font-size: 10pt; }
    @media print { body { margin: 10mm; } img { page-break-inside: avoid; max-width: 100%; } }
  </style></head><body>
  <div class="header">
    <div style="font-size:11pt;margin-bottom:4px">ЧОЙБАЛСАН ХӨГЖИЛ ОНӨҮГ</div>
    <h2>АЖЛЫН ЯВЦЫН ТАЙЛАН</h2>
    <p>${MN_MONTHS[month]} ${year} он · Нийт: ${filtered.length} ажил · Гүйцэтгэл: ${avgProg}%${_rptCatFilter.size ? ` · Категори: ${[..._rptCatFilter].join(", ")}` : ""}</p>
    <p style="font-size:9pt;color:#666">Тайлан гарсан огноо: ${new Date().toLocaleDateString("mn-MN")}</p>
  </div>
  <div class="summary">
    <div class="sum-box"><b>${filtered.length}</b><span>Нийт ажил</span></div>
    <div class="sum-box" style="border-color:#16a34a"><b style="color:#16a34a">${done}</b><span>Дууссан</span></div>
    <div class="sum-box" style="border-color:#6366f1"><b style="color:#6366f1">${ongoing}</b><span>Явцтай</span></div>
    <div class="sum-box" style="border-color:#d97706"><b style="color:#d97706">${waiting}</b><span>Хүлээгдэж буй</span></div>
    <div class="sum-box" style="border-color:#2563eb"><b style="color:#2563eb">${avgProg}%</b><span>Дундаж явц</span></div>
  </div>
  <table>
    <thead><tr>
      <th style="width:28px">#</th>
      <th style="width:18%">Ажлын нэр / Байршил</th>
      <th style="width:70px">Эхлэх</th>
      <th style="width:70px">Дуусах</th>
      <th style="width:15%">Ажилчид</th>
      <th style="width:45px">Явц%</th>
      <th style="width:70px">Төлөв</th>
      <th>Гүйцэтгэл</th>
    </tr></thead>
    <tbody>${rows||`<tr><td colspan="8" style="text-align:center;padding:20px;color:#999">Мэдээлэл байхгүй</td></tr>`}</tbody>
  </table>
  <div class="footer">
    <div class="sign">Тайлан гаргасан:<br><br>.....................<br>${new Date().toLocaleDateString("mn-MN")}</div>
    <div class="sign">Ахлах инженер:<br><br>.....................<br></div>
    <div class="sign">Захирал:<br><br>.....................<br></div>
  </div>
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
  else toast("Popup блоклогдсон байна. Хөтчийн popup зөвшөөрлийг тохируулна уу.");
}

async function audit() {
  const rows = await api("/api/audit-logs");

  main.innerHTML = `
  <h1>Audit log</h1>
  <div class="panel">
    ${table(
      ["Огноо","Хэрэглэгч","Үйлдэл","Дэлгэрэнгүй"],
      rows.map(r => [r.created_at, r.full_name || "", r.action, r.detail || ""])
    )}
  </div>`;
}

function rptToggleCat(name) {
  if (_rptCatFilter.has(name)) {
    _rptCatFilter.delete(name);
  } else {
    _rptCatFilter.add(name);
  }
  if (_rptCatFilter.size === _workCats.length) _rptCatFilter.clear();
  reports();
}

function rptToggleAll() {
  _rptCatFilter.clear();
  reports();
}

Object.assign(window, { reports, audit, report_schedule, printWorkReport, reloadReports, _rptVals, rptToggleCat, rptToggleAll });
