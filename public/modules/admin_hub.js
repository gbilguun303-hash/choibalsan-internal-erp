import { state, api, toast, today, escapeHtml, table, userOptions } from './common.js';

const canEdit = () => ["director","hr"].includes(state.me.role);
const fmt     = n  => Number(n||0).toLocaleString("mn-MN");
const fmtDate = s  => s ? s.slice(0,10) : "—";
const TABS = [
  { key:"home",       icon:"🏠", label:"Нүүр" },
  { key:"employees",  icon:"👤", label:"Ажилтан" },
  { key:"letters",    icon:"📨", label:"Бичиг" },
  { key:"orders",     icon:"📜", label:"Тушаал" },
  { key:"contracts",  icon:"📋", label:"Гэрээ" },
  { key:"leave",      icon:"🗓", label:"Чөлөө" },
  { key:"archive",    icon:"🗄", label:"Архив" },
  { key:"reports",    icon:"📊", label:"Тайлан" },
  { key:"aitest",     icon:"🤖", label:"AI Тест", directorOnly: true },
];
let _activeTab = "home";

// ── Shell renderer ───────────────────────────────────────────

async function admin_hub() {
  _activeTab = _activeTab || "home";
  main.innerHTML = `
  <div style="margin-bottom:0">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <h1 style="margin:0 0 3px;font-size:20px">🏛 Захиргаа · Хүний нөөц · Архив</h1>
        <div style="font-size:12px;color:#667085">Нэгдсэн удирдлагын төв · ${new Date().toLocaleDateString("mn-MN")}</div>
      </div>
    </div>

    <div style="display:flex;gap:4px;border-bottom:2px solid #e2e6ed;margin-bottom:20px;overflow-x:auto">
      ${TABS.filter(t => !t.directorOnly || state.me?.role === "director").map(t => `
        <button id="ahb_tab_${t.key}" onclick="ahbTab('${t.key}')"
          style="padding:8px 16px;border:none;border-radius:8px 8px 0 0;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;
                 background:${_activeTab===t.key?'#2563eb':'transparent'};
                 color:${_activeTab===t.key?'#fff':'#667085'};
                 border-bottom:${_activeTab===t.key?'2px solid #2563eb':'2px solid transparent'};
                 margin-bottom:-2px;transition:all .15s">
          ${t.icon} ${t.label}
        </button>`).join("")}
    </div>
    <div id="ahb_content"></div>
  </div>`;

  window.ahbTab = (tab) => {
    _activeTab = tab;
    TABS.forEach(t => {
      const btn = document.getElementById(`ahb_tab_${t.key}`);
      if (!btn) return;
      btn.style.background = t.key===tab ? "#2563eb" : "transparent";
      btn.style.color      = t.key===tab ? "#fff"    : "#667085";
    });
    const fns = { home:ahbHome, employees:ahbEmployees, letters:ahbLetters,
                  orders:ahbOrders, contracts:ahbContracts, leave:ahbLeave,
                  archive:ahbArchive, workcats:ahbWorkCats, reports:ahbReports, aitest:ahbAiTest };
    if (fns[tab]) fns[tab]();
  };

  const fns = { home:ahbHome, employees:ahbEmployees, letters:ahbLetters,
                orders:ahbOrders, contracts:ahbContracts, leave:ahbLeave,
                archive:ahbArchive, workcats:ahbWorkCats, reports:ahbReports, aitest:ahbAiTest };
  if (fns[_activeTab]) fns[_activeTab]();
}

function ahbSet(html) {
  const c = document.getElementById("ahb_content");
  if (c) c.innerHTML = html;
}

// ── Tab 0 : Нүүр — "Миний өнөөдрийн ажил" ───────────────────

async function ahbHome() {
  ahbSet(`<div style="text-align:center;padding:40px;color:#94a3b8">Ачааллаж байна...</div>`);
  let d = {};
  try { d = await api("/api/admin-hub/dashboard"); } catch(e) {}

  const alertCard = (icon, title, count, color, items, tabKey) => `
  <div onclick="ahbTab('${tabKey}')" style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;overflow:hidden;cursor:pointer;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 4px 20px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow='none'">
    <div style="padding:14px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:10px">
      <span style="font-size:22px">${icon}</span>
      <div style="flex:1">
        <div style="font-size:12px;color:#667085;margin-bottom:2px">${title}</div>
        <div style="font-size:24px;font-weight:800;color:${color}">${count}</div>
      </div>
      <div style="font-size:11px;color:#94a3b8">→</div>
    </div>
    <div style="padding:10px 16px;max-height:120px;overflow:auto">
      ${items.length ? items.map(it=>`<div style="font-size:12px;padding:3px 0;border-bottom:1px solid #f8fafc;color:#374151">${it}</div>`).join("") :
        `<div style="font-size:12px;color:#94a3b8;text-align:center;padding:8px 0">✓ Анхаарах зүйл алга</div>`}
    </div>
  </div>`;

  const corrItems = (d.dueDocs||[]).map(r =>
    `<span style="color:${(r.days_left||0)<0?'#dc2626':'#d97706'}">${(r.days_left||0)<0?"⚠️":"📌"}</span> ${escapeHtml(r.subject||"")} <span style="color:#94a3b8">(${fmtDate(r.due_date)})</span>`);
  const contractItems = (d.expiringContracts||[]).map(r =>
    `<span style="color:${(r.days_left||0)<=7?'#dc2626':'#d97706'}">🔔</span> ${escapeHtml(r.full_name)} — ${r.days_left} хоног`);
  const leaveItems = (d.recentLeave||[]).map(r =>
    `<span style="color:#2563eb">📋</span> ${escapeHtml(r.employee_name||"")} — ${escapeHtml(r.record_type)} (${fmtDate(r.start_date)})`);
  const safetyItems = (d.openSafety||[]).map(r =>
    `<span style="color:#dc2626">⚠️</span> ${escapeHtml(r.title||"")} <span style="color:#94a3b8">(${fmtDate(r.report_date)})</span>`);

  ahbSet(`
  <div style="margin-bottom:16px">
    <div style="font-size:15px;font-weight:800;color:#1e293b;margin-bottom:4px">📋 Миний өнөөдрийн ажил</div>
    <div style="font-size:12px;color:#94a3b8">Систем таны анхаарах зүйлсийг автоматаар тэмдэглэв</div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px">
    ${alertCard("📨","Хугацаа дөхсөн бичиг",(d.dueDocs||[]).length,(d.dueDocs||[]).length>0?"#dc2626":"#16a34a",corrItems,"letters")}
    ${alertCard("📜","Гэрээний хугацаа дөхсөн",(d.expiringContracts||[]).length,(d.expiringContracts||[]).length>0?"#d97706":"#16a34a",contractItems,"contracts")}
    ${alertCard("🗓","Шинэ чөлөөний хүсэлт",(d.recentLeave||[]).length,(d.recentLeave||[]).length>0?"#7c3aed":"#16a34a",leaveItems,"leave")}
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
    ${alertCard("🗄","Архивт шилжүүлэх баримт",d.archiveNeeded||0,(d.archiveNeeded||0)>0?"#d97706":"#16a34a",
      (d.archiveNeeded||0)>0?[`${d.archiveNeeded} баримт шилжүүлэх шаардлагатай`]:[],"archive")}
    ${alertCard("🦺","Хаагдаагүй ХАБЭА тайлан (14+ өдөр)",(d.openSafety||[]).length,(d.openSafety||[]).length>0?"#dc2626":"#16a34a",safetyItems,"reports")}
    ${alertCard("📨","Шинэ ирсэн бичиг (3 хоногт)",d.newCorrCount||0,(d.newCorrCount||0)>0?"#2563eb":"#16a34a",
      (d.newCorrCount||0)>0?[`${d.newCorrCount} бичиг шинэ статустай`]:[],"letters")}
  </div>

  <div style="margin-top:22px;padding:14px 18px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px">
    <div style="font-size:12px;font-weight:700;color:#0369a1;margin-bottom:8px">⚡ Хурдан үйлдэл</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn secondary sm" onclick="ahbTab('letters');setTimeout(()=>openCorrForm&&openCorrForm(),100)">+ Бичиг бүртгэх</button>
      <button class="btn secondary sm" onclick="ahbTab('leave');setTimeout(()=>openLeaveForm&&openLeaveForm(),100)">+ Чөлөө бүртгэх</button>
      <button class="btn secondary sm" onclick="ahbTab('orders');setTimeout(()=>openOrderForm&&openOrderForm(),100)">+ Тушаал нэмэх</button>
      <button class="btn secondary sm" onclick="ahbTab('archive');setTimeout(()=>openArchiveForm&&openArchiveForm(),100)">+ Архивт хийх</button>
      <button class="btn secondary sm" onclick="ahbHome()">↺ Шинэчлэх</button>
    </div>
  </div>`);
}

// ── Tab 1 : Ажилтан ──────────────────────────────────────────

async function ahbEmployees() {
  let users = [];
  try { users = await api("/api/users-full"); } catch(e) {}
  const today_ = today();
  const statusColor = { "Идэвхтэй":"#16a34a","Чөлөөнд":"#7c3aed","Томилолт":"#2563eb","Ажилгүй":"#94a3b8" };

  ahbSet(`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="font-size:14px;font-weight:700">Ажилтны жагсаалт (${users.length} хүн)</div>
    <div style="display:flex;gap:8px">
      <input placeholder="🔍 Хайх..." oninput="filterTable(this.value,'empTbl')"
        style="padding:6px 12px;border:1px solid #e2e6ed;border-radius:8px;font-size:12px;width:180px;outline:none">
      <button class="btn secondary sm" onclick="show('hr')">🔗 HR дэлгэрэнгүй</button>
    </div>
  </div>
  <div class="panel">
    <div class="table-wrap">
      <table id="empTbl">
        <thead><tr>
          <th>#</th><th>Нэр</th><th>Албан тушаал</th><th>Хэлтэс</th><th>Утас</th>
          <th>Гэрээний төрөл</th><th>Гэрээ дуусах</th><th>Статус</th>
        </tr></thead>
        <tbody>
          ${users.length ? users.map((u,i) => {
            const daysLeft = u.contract_end
              ? Math.ceil((new Date(u.contract_end)-new Date(today_))/864e5) : null;
            const contractWarn = daysLeft !== null && daysLeft <= 30;
            return `<tr>
              <td>${i+1}</td>
              <td><b>${escapeHtml(u.full_name)}</b></td>
              <td style="font-size:12px">${escapeHtml(u.position||"—")}</td>
              <td style="font-size:12px">${escapeHtml(u.department||"—")}</td>
              <td style="font-size:12px">${escapeHtml(u.phone||"—")}</td>
              <td style="font-size:12px">${escapeHtml(u.contract_type||"—")}</td>
              <td style="font-size:12px;${contractWarn?'color:#dc2626;font-weight:700':''}">
                ${u.contract_end ? fmtDate(u.contract_end)+"&nbsp;"+(contractWarn?`<span style="color:#dc2626">(${daysLeft}хон)</span>`:"") : "—"}
              </td>
              <td><span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;
                   background:${statusColor[u.status_hr||'']+'22'||'#f1f5f9'};
                   color:${statusColor[u.status_hr||'']||'#94a3b8'}">${u.status_hr||"—"}</span></td>
            </tr>`;
          }).join("") : `<tr><td colspan="8" class="muted">Ажилтан алга</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>
  <div style="margin-top:10px;font-size:12px;color:#94a3b8;text-align:center">
    Ажилтны дэлгэрэнгүй бүртгэл, гэрээ, файл, цалин →
    <a href="#" onclick="show('hr');return false" style="color:#2563eb">HR модуль →</a>
  </div>`);

  window.filterTable = (q, id) => {
    const tbl = document.getElementById(id);
    if (!tbl) return;
    tbl.querySelectorAll("tbody tr").forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(q.toLowerCase()) ? "" : "none";
    });
  };
}

// ── Tab 2 : Бичиг хэрэг (Correspondence) ────────────────────

async function ahbLetters() {
  let rows = [], users = state.users || [];
  async function load() {
    try { rows = await api("/api/correspondence"); } catch(e) { rows=[]; }
    render();
  }
  const STAGES = ["Шинэ","Хуваарилагдсан","Биелэж байна","Биелсэн","Хаасан"];
  const stageColor = { "Шинэ":"#2563eb","Хуваарилагдсан":"#7c3aed","Биелэж байна":"#d97706","Биелсэн":"#16a34a","Хаасан":"#94a3b8" };

  function render() {
    const byStage = {};
    STAGES.forEach(s => { byStage[s] = rows.filter(r=>r.status===s).length; });
    ahbSet(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700">📨 Бичиг хэргийн журнал (${rows.length} бичиг)</div>
      <div style="display:flex;gap:8px">
        <input placeholder="🔍 Хайх..." oninput="filterTable(this.value,'corrTbl')"
          style="padding:6px 12px;border:1px solid #e2e6ed;border-radius:8px;font-size:12px;width:180px;outline:none">
        ${canEdit()?`<button class="btn" onclick="openCorrForm()">+ Бичиг бүртгэх</button>`:""}
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:14px;overflow-x:auto">
      ${STAGES.map(s=>`<div style="background:#fff;border:1px solid #e2e6ed;border-radius:8px;padding:8px 14px;text-align:center;min-width:100px;border-top:3px solid ${stageColor[s]||'#e2e6ed'}">
        <div style="font-size:11px;color:#667085">${s}</div>
        <div style="font-size:20px;font-weight:800;color:${stageColor[s]}">${byStage[s]||0}</div>
      </div>`).join("")}
    </div>

    <div class="panel">
      <div class="table-wrap">
        <table id="corrTbl">
          <thead><tr>
            <th>#</th><th>Огноо</th><th>Дугаар</th><th>Төрөл</th><th>Эх байгууллага</th>
            <th>Гарчиг</th><th>Хариуцсан</th><th>Дуусах</th><th>Статус</th><th></th>
          </tr></thead>
          <tbody>
            ${rows.length ? rows.map((r,i)=>`<tr>
              <td>${i+1}</td>
              <td style="font-size:12px">${fmtDate(r.doc_date)}</td>
              <td style="font-size:12px">${escapeHtml(r.doc_no||"—")}</td>
              <td style="font-size:12px">${escapeHtml(r.doc_type||"—")}</td>
              <td style="font-size:12px">${escapeHtml(r.source_org||"—")}</td>
              <td><b>${escapeHtml(r.subject||"")}</b></td>
              <td style="font-size:12px">${escapeHtml(r.assigned_name||"—")}</td>
              <td style="font-size:12px;${r.due_date&&r.due_date<today()&&r.status!=='Хаасан'?'color:#dc2626;font-weight:700':''}">${fmtDate(r.due_date)}</td>
              <td><span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;
                   background:${(stageColor[r.status]||'#94a3b8')+'22'};color:${stageColor[r.status]||'#94a3b8'}">${r.status}</span></td>
              <td style="white-space:nowrap">
                <button class="btn secondary sm" onclick="openScanModal('letter',${r.id},'${escapeHtml(r.subject||r.doc_no||"")}')">📎 Файл</button>
                ${canEdit()?`<button class="btn secondary sm" onclick="editCorr(${r.id})">✏️</button>
                <select onchange="quickCorrStatus(${r.id},this.value,event)" style="font-size:11px;padding:2px 4px;border:1px solid #e2e6ed;border-radius:4px">
                  <option value="">▼ Статус</option>
                  ${STAGES.map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${s}</option>`).join("")}
                </select>`:""}
              </td>
            </tr>`).join("") : `<tr><td colspan="10" class="muted">Бичиг алга</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div id="corrModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:14px;padding:28px;width:580px;max-height:90vh;overflow:auto">
        <div style="font-size:16px;font-weight:800;margin-bottom:18px">📨 Бичиг бүртгэх</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Бичгийн төрөл</div>
            <select class="input" id="cr_type">
              <option>Ирсэн</option><option>Явсан</option><option>Дотоод</option><option>Гомдол</option><option>Хүсэлт</option>
            </select></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Дугаар</div>
            <input class="input" id="cr_no" placeholder="2026/001"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Огноо *</div>
            <input class="input" id="cr_date" type="date" value="${today()}"></div>
        </div>
        <div style="margin-bottom:12px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Гарчиг *</div>
          <input class="input" id="cr_subject" placeholder="Бичгийн гарчиг..."></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Эх байгууллага</div>
            <input class="input" id="cr_org" placeholder="Байгууллагын нэр..."></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Хариуцах ажилтан</div>
            <select class="input" id="cr_assign">
              <option value="">— Сонгох —</option>
              ${users.map(u=>`<option value="${u.id}">${escapeHtml(u.full_name)}</option>`).join("")}
            </select></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Дуусах огноо</div>
            <input class="input" id="cr_due" type="date"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Статус</div>
            <select class="input" id="cr_status">
              ${STAGES.map(s=>`<option>${s}</option>`).join("")}
            </select></div>
        </div>
        <div style="margin-bottom:14px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Шийдвэр / тэмдэглэл</div>
          <textarea class="input" id="cr_decision" rows="2" placeholder="Шийдвэр, үр дүн..."></textarea></div>
        <input type="hidden" id="cr_id">
        <div style="display:flex;gap:10px">
          <button class="btn" onclick="saveCorr()">Хадгалах</button>
          <button class="btn secondary" onclick="document.getElementById('corrModal').style.display='none'">Цуцлах</button>
        </div>
      </div>
    </div>`);

    window.openCorrForm = () => {
      ["cr_id","cr_no","cr_subject","cr_org","cr_decision"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
      document.getElementById("cr_date").value   = today();
      document.getElementById("cr_due").value    = "";
      document.getElementById("cr_type").value   = "Ирсэн";
      document.getElementById("cr_status").value = "Шинэ";
      document.getElementById("cr_assign").value = "";
      document.getElementById("corrModal").style.display = "flex";
    };
    window.editCorr = (id) => {
      const r = rows.find(x=>x.id===id); if (!r) return;
      document.getElementById("cr_id").value       = r.id;
      document.getElementById("cr_type").value     = r.doc_type||"Ирсэн";
      document.getElementById("cr_no").value       = r.doc_no||"";
      document.getElementById("cr_date").value     = r.doc_date||"";
      document.getElementById("cr_subject").value  = r.subject||"";
      document.getElementById("cr_org").value      = r.source_org||"";
      document.getElementById("cr_assign").value   = r.assigned_to||"";
      document.getElementById("cr_due").value      = r.due_date||"";
      document.getElementById("cr_status").value   = r.status||"Шинэ";
      document.getElementById("cr_decision").value = r.decision||"";
      document.getElementById("corrModal").style.display = "flex";
    };
    window.saveCorr = async () => {
      const id = document.getElementById("cr_id").value;
      const body = {
        doc_type:    document.getElementById("cr_type").value,
        doc_no:      document.getElementById("cr_no").value,
        doc_date:    document.getElementById("cr_date").value,
        subject:     document.getElementById("cr_subject").value,
        source_org:  document.getElementById("cr_org").value,
        assigned_to: document.getElementById("cr_assign").value,
        due_date:    document.getElementById("cr_due").value,
        status:      document.getElementById("cr_status").value,
        decision:    document.getElementById("cr_decision").value
      };
      if (!body.subject || !body.doc_date) { toast("Гарчиг болон огноог оруулна уу"); return; }
      try {
        if (id) await api(`/api/correspondence/${id}`, { method:"PUT", body:JSON.stringify(body) });
        else    await api("/api/correspondence",        { method:"POST",body:JSON.stringify(body) });
        toast("Хадгалагдлаа");
        document.getElementById("corrModal").style.display = "none";
        load();
      } catch(e) { toast(e.message); }
    };
    window.quickCorrStatus = async (id, status, e) => {
      if (!status) return;
      const r = rows.find(x=>x.id===id); if (!r) return;
      try {
        await api(`/api/correspondence/${id}`, { method:"PUT", body:JSON.stringify({...r, status}) });
        toast("Статус шинэчлэгдлээ"); load();
      } catch(err) { toast(err.message); }
    };
  }
  load();
}

// ── Tab 3 : Тушаал / Шийдвэр ────────────────────────────────

async function ahbOrders() {
  let rows = [], users = state.users || [];
  async function load() {
    try { rows = await api("/api/admin-hub/orders"); } catch(e) { rows=[]; }
    render();
  }
  const TYPES = ["Тушаал","Шийдвэр","Тогтоол","Зарлиг","Захидал","Бусад"];
  const STATUS = ["Хүчинтэй","Хүчингүй","Архивт"];
  const typeColor = { "Тушаал":"#2563eb","Шийдвэр":"#7c3aed","Тогтоол":"#16a34a","Зарлиг":"#dc2626","Захидал":"#d97706","Бусад":"#94a3b8" };

  function render() {
    ahbSet(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700">📜 Тушаал / Шийдвэр (${rows.length} баримт)</div>
      <div style="display:flex;gap:8px">
        <input placeholder="🔍 Хайх..." oninput="filterTable(this.value,'ordTbl')"
          style="padding:6px 12px;border:1px solid #e2e6ed;border-radius:8px;font-size:12px;width:180px;outline:none">
        ${canEdit()?`<button class="btn" onclick="openOrderForm()">+ Тушаал нэмэх</button>`:""}
      </div>
    </div>
    <div class="panel">
      <div class="table-wrap">
        <table id="ordTbl">
          <thead><tr>
            <th>#</th><th>Дугаар</th><th>Огноо</th><th>Төрөл</th><th>Гарчиг</th>
            <th>Холбоотой ажилтан</th><th>Статус</th><th>Үүсгэсэн</th><th></th>
          </tr></thead>
          <tbody>
            ${rows.length ? rows.map((r,i)=>`<tr>
              <td>${i+1}</td>
              <td style="font-size:12px">${escapeHtml(r.doc_no||"—")}</td>
              <td style="font-size:12px">${fmtDate(r.doc_date)}</td>
              <td><span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;
                   background:${(typeColor[r.doc_type]||'#94a3b8')+'22'};color:${typeColor[r.doc_type]||'#94a3b8'}">${r.doc_type}</span></td>
              <td><b>${escapeHtml(r.title)}</b>${r.description?`<div style="font-size:11px;color:#94a3b8">${escapeHtml(r.description.slice(0,60))}${r.description.length>60?"...":""}</div>`:""}</td>
              <td style="font-size:12px">${escapeHtml(r.related_name||"—")}</td>
              <td><span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;
                   background:${r.status==='Хүчинтэй'?'#dcfce7':r.status==='Хүчингүй'?'#fee2e2':'#f1f5f9'};
                   color:${r.status==='Хүчинтэй'?'#16a34a':r.status==='Хүчингүй'?'#dc2626':'#94a3b8'}">${r.status}</span></td>
              <td style="font-size:11px;color:#94a3b8">${escapeHtml(r.created_name||"")}</td>
              <td style="white-space:nowrap">
                <button class="btn secondary sm" onclick="openScanModal('order',${r.id},'${escapeHtml(r.title)}')">📎 Файл</button>
                ${canEdit()?`<button class="btn secondary sm" onclick="editOrder(${r.id})">✏️</button>
                <button class="btn secondary sm" style="color:#dc2626" onclick="delOrder(${r.id})">🗑</button>`:""}
              </td>
            </tr>`).join("") : `<tr><td colspan="9" class="muted">Тушаал алга</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div id="orderModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:14px;padding:28px;width:560px;max-height:90vh;overflow:auto">
        <div style="font-size:16px;font-weight:800;margin-bottom:18px">📜 Тушаал / Шийдвэр</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Төрөл</div>
            <select class="input" id="od_type">
              ${TYPES.map(t=>`<option>${t}</option>`).join("")}
            </select></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Дугаар</div>
            <input class="input" id="od_no" placeholder="А/01"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Огноо *</div>
            <input class="input" id="od_date" type="date" value="${today()}"></div>
        </div>
        <div style="margin-bottom:12px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Гарчиг *</div>
          <input class="input" id="od_title" placeholder="Тушаалын гарчиг..."></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Холбоотой ажилтан</div>
            <select class="input" id="od_user">
              <option value="">— Сонгох —</option>
              ${users.map(u=>`<option value="${u.id}">${escapeHtml(u.full_name)}</option>`).join("")}
            </select></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Статус</div>
            <select class="input" id="od_status">
              ${STATUS.map(s=>`<option>${s}</option>`).join("")}
            </select></div>
        </div>
        <div style="margin-bottom:14px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Тайлбар</div>
          <textarea class="input" id="od_desc" rows="3" placeholder="Тушаалын агуулга..."></textarea></div>
        <input type="hidden" id="od_id">
        <div style="display:flex;gap:10px">
          <button class="btn" onclick="saveOrder()">Хадгалах</button>
          <button class="btn secondary" onclick="document.getElementById('orderModal').style.display='none'">Цуцлах</button>
        </div>
      </div>
    </div>`);

    window.openOrderForm = () => {
      ["od_id","od_no","od_title","od_desc"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
      document.getElementById("od_date").value   = today();
      document.getElementById("od_type").value   = "Тушаал";
      document.getElementById("od_status").value = "Хүчинтэй";
      document.getElementById("od_user").value   = "";
      document.getElementById("orderModal").style.display = "flex";
    };
    window.editOrder = (id) => {
      const r = rows.find(x=>x.id===id); if (!r) return;
      document.getElementById("od_id").value     = r.id;
      document.getElementById("od_type").value   = r.doc_type||"Тушаал";
      document.getElementById("od_no").value     = r.doc_no||"";
      document.getElementById("od_date").value   = r.doc_date||"";
      document.getElementById("od_title").value  = r.title||"";
      document.getElementById("od_user").value   = r.related_user||"";
      document.getElementById("od_status").value = r.status||"Хүчинтэй";
      document.getElementById("od_desc").value   = r.description||"";
      document.getElementById("orderModal").style.display = "flex";
    };
    window.saveOrder = async () => {
      const id = document.getElementById("od_id").value;
      const body = {
        doc_type:     document.getElementById("od_type").value,
        doc_no:       document.getElementById("od_no").value,
        doc_date:     document.getElementById("od_date").value,
        title:        document.getElementById("od_title").value,
        related_user: document.getElementById("od_user").value,
        status:       document.getElementById("od_status").value,
        description:  document.getElementById("od_desc").value
      };
      if (!body.title || !body.doc_date) { toast("Гарчиг болон огноог оруулна уу"); return; }
      try {
        if (id) await api(`/api/admin-hub/orders/${id}`, { method:"PUT", body:JSON.stringify(body) });
        else    await api("/api/admin-hub/orders",        { method:"POST",body:JSON.stringify(body) });
        toast("Хадгалагдлаа");
        document.getElementById("orderModal").style.display = "none";
        load();
      } catch(e) { toast(e.message); }
    };
    window.delOrder = async (id) => {
      if (!confirm("Устгах уу?")) return;
      try { await api(`/api/admin-hub/orders/${id}`, { method:"DELETE" }); toast("Устгагдлаа"); load(); }
      catch(e) { toast(e.message); }
    };
  }
  load();
}

// ── Tab 4 : Гэрээ ────────────────────────────────────────────

async function ahbContracts() {
  let users = [];
  try { users = await api("/api/users-full"); } catch(e) {}
  const today_ = today();
  const in30   = new Date(Date.now()+30*864e5).toISOString().slice(0,10);
  const in90   = new Date(Date.now()+90*864e5).toISOString().slice(0,10);

  const expired  = users.filter(u => u.contract_end && u.contract_end < today_);
  const in30d    = users.filter(u => u.contract_end && u.contract_end >= today_ && u.contract_end <= in30);
  const in90d    = users.filter(u => u.contract_end && u.contract_end > in30 && u.contract_end <= in90);
  const ok       = users.filter(u => u.contract_end && u.contract_end > in90);
  const noDate   = users.filter(u => !u.contract_end);

  const contractTable = (list, highlightColor) => list.length ? `
  <div class="table-wrap">${table(
    ["Нэр","Хэлтэс","Гэрээний төрөл","Гэрээ дуусах","Хоног"],
    list.map(u => {
      const days = u.contract_end ? Math.ceil((new Date(u.contract_end)-new Date(today_))/864e5) : null;
      return [
        `<b>${escapeHtml(u.full_name)}</b><br><span style="font-size:11px;color:#94a3b8">${escapeHtml(u.position||"")}</span>`,
        escapeHtml(u.department||"—"),
        escapeHtml(u.contract_type||"—"),
        `<span style="color:${highlightColor};font-weight:700">${fmtDate(u.contract_end)}</span>`,
        days !== null ? `<span style="color:${highlightColor};font-weight:700">${days < 0 ? `⚠️ ${Math.abs(days)} хоног хэтэрсэн` : days+" хоног"}</span>` : "—"
      ];
    })
  )}</div>` : `<div style="padding:14px;text-align:center;color:#94a3b8;font-size:13px">✓ Энэ ангилалд ажилтан алга</div>`;

  ahbSet(`
  <div style="font-size:14px;font-weight:700;margin-bottom:16px">📋 Гэрээний хяналт</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
    <div style="background:#fee2e2;border-radius:10px;padding:12px 14px;text-align:center;border-top:3px solid #dc2626">
      <div style="font-size:11px;color:#dc2626;font-weight:700">ХУГАЦАА ДУУССАН</div>
      <div style="font-size:28px;font-weight:800;color:#dc2626">${expired.length}</div>
    </div>
    <div style="background:#fef9c3;border-radius:10px;padding:12px 14px;text-align:center;border-top:3px solid #ca8a04">
      <div style="font-size:11px;color:#ca8a04;font-weight:700">30 ХОНОГ ДОТОР</div>
      <div style="font-size:28px;font-weight:800;color:#d97706">${in30d.length}</div>
    </div>
    <div style="background:#dbeafe;border-radius:10px;padding:12px 14px;text-align:center;border-top:3px solid #2563eb">
      <div style="font-size:11px;color:#2563eb;font-weight:700">90 ХОНОГ ДОТОР</div>
      <div style="font-size:28px;font-weight:800;color:#2563eb">${in90d.length}</div>
    </div>
    <div style="background:#dcfce7;border-radius:10px;padding:12px 14px;text-align:center;border-top:3px solid #16a34a">
      <div style="font-size:11px;color:#16a34a;font-weight:700">ХЭВИЙН</div>
      <div style="font-size:28px;font-weight:800;color:#16a34a">${ok.length}</div>
    </div>
  </div>

  ${expired.length ? `
  <div class="panel" style="margin-bottom:14px;border-color:#fca5a5">
    <div style="padding:10px 16px;background:#fee2e2;border-bottom:1px solid #fca5a5;font-weight:700;font-size:13px;color:#dc2626">
      ⚠️ Гэрээний хугацаа дууссан (${expired.length})
    </div>${contractTable(expired,"#dc2626")}
  </div>` : ""}

  ${in30d.length ? `
  <div class="panel" style="margin-bottom:14px;border-color:#fde68a">
    <div style="padding:10px 16px;background:#fef9c3;border-bottom:1px solid #fde68a;font-weight:700;font-size:13px;color:#ca8a04">
      🔔 30 хоногийн дотор дуусах гэрээ (${in30d.length})
    </div>${contractTable(in30d,"#d97706")}
  </div>` : ""}

  ${in90d.length ? `
  <div class="panel" style="margin-bottom:14px">
    <div style="padding:10px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:13px;color:#2563eb">
      📋 90 хоногийн дотор дуусах гэрээ (${in90d.length})
    </div>${contractTable(in90d,"#2563eb")}
  </div>` : ""}

  <div style="margin-top:10px;font-size:12px;color:#94a3b8;text-align:center">
    Гэрээ сунгах, шинэ гэрээ бүртгэх → <a href="#" onclick="show('hr');return false" style="color:#2563eb">HR модуль →</a>
  </div>`);
}

// ── Tab 5 : Чөлөө / HR бүртгэл ──────────────────────────────

async function ahbLeave() {
  let rows = [], users = state.users || [];
  async function load() {
    try { rows = await api("/api/hr-records"); } catch(e) { rows=[]; }
    render();
  }
  const LEAVE_TYPES = ["Чөлөө","Өвчтэй","Ээлжийн амралт","Сургалт","Томилолт","Жирэмсний чөлөө","Бусад"];
  const typeColor = { "Чөлөө":"#7c3aed","Өвчтэй":"#dc2626","Ээлжийн амралт":"#16a34a","Сургалт":"#2563eb","Томилолт":"#d97706" };

  function render() {
    const leaveOnly = rows.filter(r => LEAVE_TYPES.includes(r.record_type));
    const byType = {};
    LEAVE_TYPES.forEach(t => { byType[t] = leaveOnly.filter(r=>r.record_type===t).length; });

    ahbSet(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700">🗓 Чөлөө / HR бүртгэл (${leaveOnly.length})</div>
      <button class="btn" onclick="openLeaveForm()">+ Бүртгэл нэмэх</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      ${LEAVE_TYPES.map(t=>`<div style="background:#fff;border:1px solid #e2e6ed;border-radius:8px;padding:6px 12px;text-align:center;border-top:2px solid ${typeColor[t]||'#e2e6ed'}">
        <div style="font-size:10px;color:#667085">${t}</div>
        <div style="font-size:16px;font-weight:800;color:${typeColor[t]||'#94a3b8'}">${byType[t]||0}</div>
      </div>`).join("")}
    </div>
    <div class="panel">
      <div class="table-wrap">
        ${table(
          ["#","Ажилтан","Хэлтэс","Төрөл","Эхлэх","Дуусах","Тэмдэглэл","Үүсгэсэн",""],
          leaveOnly.map((r,i)=>[
            i+1,
            `<b>${escapeHtml(r.employee_name||"—")}</b>`,
            escapeHtml(r.department||""),
            `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${(typeColor[r.record_type]||'#94a3b8')+'22'};color:${typeColor[r.record_type]||'#94a3b8'}">${r.record_type}</span>`,
            fmtDate(r.start_date), fmtDate(r.end_date),
            escapeHtml(r.note||"—"),
            escapeHtml(r.created_name||""),
            canEdit() ? `<button class="btn secondary sm" onclick="editLeave(${r.id})">✏️</button>
              <button class="btn secondary sm" style="color:#dc2626" onclick="delLeave(${r.id})">🗑</button>` : ""
          ])
        )}
      </div>
    </div>

    <div id="leaveModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:14px;padding:28px;width:500px">
        <div style="font-size:16px;font-weight:800;margin-bottom:18px">🗓 Чөлөо / HR бүртгэл</div>
        <div style="margin-bottom:12px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Ажилтан *</div>
          <select class="input" id="lv_user">
            <option value="">— Сонгох —</option>
            ${users.map(u=>`<option value="${u.id}">${escapeHtml(u.full_name)}</option>`).join("")}
          </select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Төрөл *</div>
            <select class="input" id="lv_type">
              ${LEAVE_TYPES.map(t=>`<option>${t}</option>`).join("")}
            </select></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Эхлэх огноо *</div>
            <input class="input" id="lv_start" type="date" value="${today()}"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Дуусах огноо</div>
            <input class="input" id="lv_end" type="date"></div>
          <div></div>
        </div>
        <div style="margin-bottom:14px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Тэмдэглэл</div>
          <input class="input" id="lv_note" placeholder="..."></div>
        <input type="hidden" id="lv_id">
        <div style="display:flex;gap:10px">
          <button class="btn" onclick="saveLeave()">Хадгалах</button>
          <button class="btn secondary" onclick="document.getElementById('leaveModal').style.display='none'">Цуцлах</button>
        </div>
      </div>
    </div>`);

    window.openLeaveForm = () => {
      ["lv_id","lv_note"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
      document.getElementById("lv_user").value  = "";
      document.getElementById("lv_type").value  = "Чөлөө";
      document.getElementById("lv_start").value = today();
      document.getElementById("lv_end").value   = "";
      document.getElementById("leaveModal").style.display = "flex";
    };
    window.editLeave = (id) => {
      const r = rows.find(x=>x.id===id); if (!r) return;
      document.getElementById("lv_id").value    = r.id;
      document.getElementById("lv_user").value  = r.user_id||"";
      document.getElementById("lv_type").value  = r.record_type||"Чөлөө";
      document.getElementById("lv_start").value = r.start_date||"";
      document.getElementById("lv_end").value   = r.end_date||"";
      document.getElementById("lv_note").value  = r.note||"";
      document.getElementById("leaveModal").style.display = "flex";
    };
    window.saveLeave = async () => {
      const id = document.getElementById("lv_id").value;
      const body = {
        user_id:     document.getElementById("lv_user").value,
        record_type: document.getElementById("lv_type").value,
        start_date:  document.getElementById("lv_start").value,
        end_date:    document.getElementById("lv_end").value,
        note:        document.getElementById("lv_note").value
      };
      if (!body.user_id || !body.start_date) { toast("Ажилтан болон огноог оруулна уу"); return; }
      try {
        if (id) await api(`/api/hr-records/${id}`, { method:"PUT", body:JSON.stringify(body) });
        else    await api("/api/hr-records",        { method:"POST",body:JSON.stringify(body) });
        toast("Хадгалагдлаа");
        document.getElementById("leaveModal").style.display = "none";
        load();
      } catch(e) { toast(e.message); }
    };
    window.delLeave = async (id) => {
      if (!confirm("Устгах уу?")) return;
      try { await api(`/api/hr-records/${id}`, { method:"DELETE" }); toast("Устгагдлаа"); load(); }
      catch(e) { toast(e.message); }
    };
  }
  load();
}

// ── Tab 6 : Архив ────────────────────────────────────────────

async function ahbArchive() {
  let rows = [], filterCat = "", filterStatus = "", searchQ = "";
  async function load() {
    const qs = new URLSearchParams();
    if (filterCat)    qs.set("category", filterCat);
    if (filterStatus) qs.set("status",   filterStatus);
    if (searchQ)      qs.set("q",        searchQ);
    try { rows = await api(`/api/admin-hub/archive?${qs}`); } catch(e) { rows=[]; }
    render();
  }
  const CATS   = ["Хүний нөөц","Захиргаа","Санхүү","Бичиг захидал","Тушаал / Шийдвэр","Гэрээ","Техник","Бусад"];
  const STATUS = ["Идэвхтэй","Шилжүүлэх","Устгах"];
  const statusColor = { "Идэвхтэй":"#16a34a","Шилжүүлэх":"#d97706","Устгах":"#dc2626" };

  function render() {
    const totByStatus = {};
    STATUS.forEach(s => { totByStatus[s] = rows.filter(r=>r.status===s).length; });

    ahbSet(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700">🗄 Архивын бүртгэл (${rows.length} баримт)</div>
      ${canEdit()?`<button class="btn" onclick="openArchiveForm()">+ Архивт нэмэх</button>`:""}
    </div>

    <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
      <select class="input" style="width:160px;padding:5px 8px;font-size:13px" onchange="window._archCat=this.value;archLoad()">
        <option value="">Бүх ангилал</option>
        ${CATS.map(c=>`<option value="${c}" ${c===filterCat?'selected':''}>${c}</option>`).join("")}
      </select>
      <select class="input" style="width:140px;padding:5px 8px;font-size:13px" onchange="window._archStatus=this.value;archLoad()">
        <option value="">Бүх статус</option>
        ${STATUS.map(s=>`<option value="${s}" ${s===filterStatus?'selected':''}>${s}</option>`).join("")}
      </select>
      <input placeholder="🔍 Хайх..." value="${escapeHtml(searchQ)}"
        oninput="window._archQ=this.value;archLoad()"
        style="padding:5px 12px;border:1px solid #e2e6ed;border-radius:8px;font-size:13px;width:200px;outline:none">
      <div style="display:flex;gap:8px;margin-left:auto">
        ${STATUS.map(s=>`<div style="background:${(statusColor[s]||'#94a3b8')+'22'};border-radius:8px;padding:4px 12px;font-size:12px;font-weight:700;color:${statusColor[s]||'#94a3b8'}">${s}: ${totByStatus[s]||0}</div>`).join("")}
      </div>
    </div>

    <div class="panel">
      <div class="table-wrap">
        ${table(
          ["#","Гарчиг","Ангилал","Баримтын №","Хадгалсан огноо","Хайрцаг №","Тавиур","Хадгалах хугацаа","Статус",""],
          rows.map((r,i)=>[
            i+1,
            `<b>${escapeHtml(r.title)}</b>${r.description?`<div style="font-size:11px;color:#94a3b8">${escapeHtml(r.description.slice(0,50))}</div>`:""}`,
            escapeHtml(r.category),
            escapeHtml(r.doc_no||"—"),
            fmtDate(r.date_archived),
            escapeHtml(r.box_no||"—"),
            escapeHtml(r.shelf_no||"—"),
            r.retention_years+" жил",
            `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${(statusColor[r.status]||'#94a3b8')+'22'};color:${statusColor[r.status]||'#94a3b8'}">${r.status}</span>`,
            `<div style="display:flex;gap:4px;flex-wrap:wrap">
               <button class="btn secondary sm" onclick="openScanModal('archive',${r.id},'${escapeHtml(r.title)}')">📎 Файл</button>
               ${canEdit()?`<button class="btn secondary sm" onclick="editArchive(${r.id})">✏️</button>`:''}
               ${state.me.role==='director'?`<button class="btn secondary sm" style="color:#dc2626" onclick="delArchive(${r.id})">🗑</button>`:''}
             </div>`
          ])
        )}
      </div>
    </div>

    <div id="archiveModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:14px;padding:28px;width:560px;max-height:90vh;overflow:auto">
        <div style="font-size:16px;font-weight:800;margin-bottom:18px">🗄 Архивын бичилт</div>
        <div style="margin-bottom:12px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Гарчиг *</div>
          <input class="input" id="ar_title" placeholder="Баримтын нэр..."></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Ангилал</div>
            <select class="input" id="ar_cat">
              ${CATS.map(c=>`<option>${c}</option>`).join("")}
            </select></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Баримтын дугаар</div>
            <input class="input" id="ar_docno" placeholder="2026/А-001"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Баримтын огноо</div>
            <input class="input" id="ar_docdate" type="date"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Архивт хийсэн огноо *</div>
            <input class="input" id="ar_archdate" type="date" value="${today()}"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Хайрцаг №</div>
            <input class="input" id="ar_box" placeholder="А-01"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Тавиур №</div>
            <input class="input" id="ar_shelf" placeholder="1-2"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Хадгалах хугацаа (жил)</div>
            <input class="input" id="ar_years" type="number" value="10"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Статус</div>
            <select class="input" id="ar_status">
              ${STATUS.map(s=>`<option>${s}</option>`).join("")}
            </select></div>
          <div></div>
        </div>
        <div style="margin-bottom:14px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Тайлбар</div>
          <input class="input" id="ar_desc" placeholder="Дэлгэрэнгүй тэмдэглэл..."></div>
        <input type="hidden" id="ar_id">
        <div style="display:flex;gap:10px">
          <button class="btn" onclick="saveArchive()">Хадгалах</button>
          <button class="btn secondary" onclick="document.getElementById('archiveModal').style.display='none'">Цуцлах</button>
        </div>
      </div>
    </div>`);

    window._archCat    = filterCat;
    window._archStatus = filterStatus;
    window._archQ      = searchQ;
    window.archLoad    = () => { filterCat=window._archCat; filterStatus=window._archStatus; searchQ=window._archQ; load(); };

    window.openArchiveForm = () => {
      ["ar_id","ar_title","ar_docno","ar_box","ar_shelf","ar_desc"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
      document.getElementById("ar_cat").value      = "Хүний нөөц";
      document.getElementById("ar_docdate").value  = "";
      document.getElementById("ar_archdate").value = today();
      document.getElementById("ar_years").value    = "10";
      document.getElementById("ar_status").value   = "Идэвхтэй";
      document.getElementById("archiveModal").style.display = "flex";
    };
    window.editArchive = (id) => {
      const r = rows.find(x=>x.id===id); if (!r) return;
      document.getElementById("ar_id").value       = r.id;
      document.getElementById("ar_title").value    = r.title||"";
      document.getElementById("ar_cat").value      = r.category||"Бусад";
      document.getElementById("ar_docno").value    = r.doc_no||"";
      document.getElementById("ar_docdate").value  = r.doc_date||"";
      document.getElementById("ar_archdate").value = r.date_archived||"";
      document.getElementById("ar_box").value      = r.box_no||"";
      document.getElementById("ar_shelf").value    = r.shelf_no||"";
      document.getElementById("ar_years").value    = r.retention_years||"10";
      document.getElementById("ar_status").value   = r.status||"Идэвхтэй";
      document.getElementById("ar_desc").value     = r.description||"";
      document.getElementById("archiveModal").style.display = "flex";
    };
    window.saveArchive = async () => {
      const id = document.getElementById("ar_id").value;
      const body = {
        title:           document.getElementById("ar_title").value,
        category:        document.getElementById("ar_cat").value,
        doc_no:          document.getElementById("ar_docno").value,
        doc_date:        document.getElementById("ar_docdate").value,
        date_archived:   document.getElementById("ar_archdate").value,
        box_no:          document.getElementById("ar_box").value,
        shelf_no:        document.getElementById("ar_shelf").value,
        retention_years: document.getElementById("ar_years").value,
        status:          document.getElementById("ar_status").value,
        description:     document.getElementById("ar_desc").value
      };
      if (!body.title || !body.date_archived) { toast("Гарчиг болон хадгалсан огноог оруулна уу"); return; }
      try {
        if (id) await api(`/api/admin-hub/archive/${id}`, { method:"PUT", body:JSON.stringify(body) });
        else    await api("/api/admin-hub/archive",        { method:"POST",body:JSON.stringify(body) });
        toast("Хадгалагдлаа");
        document.getElementById("archiveModal").style.display = "none";
        load();
      } catch(e) { toast(e.message); }
    };
    window.delArchive = async (id) => {
      if (!confirm("Архивын бичилт устгах уу?")) return;
      try { await api(`/api/admin-hub/archive/${id}`, { method:"DELETE" }); toast("Устгагдлаа"); load(); }
      catch(e) { toast(e.message); }
    };
  }
  load();
}

// ── Tab 7 : Тайлан ───────────────────────────────────────────

async function ahbReports() {
  let users=[], corr=[], orders=[], archive=[], leave=[];
  try {
    [users, corr, orders, archive, leave] = await Promise.all([
      api("/api/users-full"),
      api("/api/correspondence"),
      api("/api/admin-hub/orders"),
      api("/api/admin-hub/archive"),
      api("/api/hr-records")
    ]);
  } catch(e) {}

  const today_ = today();
  const leaveThisMonth = leave.filter(r =>
    r.start_date && r.start_date.slice(0,7) === today_.slice(0,7));

  const statBox = (label, val, color, sub) =>
    `<div style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;padding:16px;border-top:3px solid ${color}">
      <div style="font-size:11px;color:#667085;margin-bottom:4px;text-transform:uppercase">${label}</div>
      <div style="font-size:28px;font-weight:800;color:${color}">${val}</div>
      ${sub?`<div style="font-size:12px;color:#94a3b8;margin-top:3px">${sub}</div>`:""}
    </div>`;

  const corrByStatus = {};
  corr.forEach(r => { corrByStatus[r.status] = (corrByStatus[r.status]||0)+1; });
  const ordByType = {};
  orders.forEach(r => { ordByType[r.doc_type] = (ordByType[r.doc_type]||0)+1; });
  const archByCat = {};
  archive.forEach(r => { archByCat[r.category] = (archByCat[r.category]||0)+1; });

  ahbSet(`
  <div style="font-size:15px;font-weight:800;margin-bottom:18px">📊 Нэгтгэсэн тайлан</div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px">
    ${statBox("Нийт ажилтан", users.length, "#2563eb", users.filter(u=>u.status_hr==='Идэвхтэй').length+" идэвхтэй")}
    ${statBox("Нийт бичиг", corr.length, "#7c3aed", corr.filter(r=>r.status==='Шинэ').length+" шинэ")}
    ${statBox("Тушаал / Шийдвэр", orders.length, "#d97706", orders.filter(r=>r.status==='Хүчинтэй').length+" хүчинтэй")}
    ${statBox("Архивын баримт", archive.length, "#16a34a", archive.filter(r=>r.status==='Шилжүүлэх').length+" шилжүүлэх")}
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px">
    <div class="panel">
      <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:13px">📨 Бичгийн статус</div>
      <div style="padding:14px 16px">
        ${Object.entries(corrByStatus).map(([k,v])=>`
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px">
          <span>${k}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:80px;height:6px;background:#f1f5f9;border-radius:3px">
              <div style="width:${Math.min(100,(v/corr.length)*100).toFixed(0)}%;height:100%;background:#7c3aed;border-radius:3px"></div>
            </div>
            <b>${v}</b>
          </div>
        </div>`).join("")||"<div style='color:#94a3b8;font-size:13px'>Өгөгдөл алга</div>"}
      </div>
    </div>

    <div class="panel">
      <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:13px">📜 Тушаалын төрөл</div>
      <div style="padding:14px 16px">
        ${Object.entries(ordByType).map(([k,v])=>`
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px">
          <span>${k}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:80px;height:6px;background:#f1f5f9;border-radius:3px">
              <div style="width:${Math.min(100,(v/orders.length)*100).toFixed(0)}%;height:100%;background:#d97706;border-radius:3px"></div>
            </div>
            <b>${v}</b>
          </div>
        </div>`).join("")||"<div style='color:#94a3b8;font-size:13px'>Өгөгдөл алга</div>"}
      </div>
    </div>

    <div class="panel">
      <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:13px">🗄 Архивын ангилал</div>
      <div style="padding:14px 16px">
        ${Object.entries(archByCat).map(([k,v])=>`
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px">
          <span style="font-size:11px">${k}</span>
          <b>${v}</b>
        </div>`).join("")||"<div style='color:#94a3b8;font-size:13px'>Өгөгдөл алга</div>"}
      </div>
    </div>
  </div>

  <div class="panel" style="margin-top:18px">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:13px">🗓 Энэ сарын чөлөө / HR бүртгэл</div>
    <div class="table-wrap">${table(
      ["Ажилтан","Төрөл","Эхлэх","Дуусах","Тэмдэглэл"],
      leaveThisMonth.slice(0,15).map(r=>[
        escapeHtml(r.employee_name||"—"),
        escapeHtml(r.record_type),
        fmtDate(r.start_date), fmtDate(r.end_date),
        escapeHtml(r.note||"—")
      ])
    )}</div>
  </div>`);
}

// ── Scan / File attachment modal (shared across all doc tabs) ──

function injectScanModal() {
  if (document.getElementById("scanModal")) return;
  const m = document.createElement("div");
  m.id = "scanModal";
  m.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;align-items:flex-start;justify-content:center;padding-top:40px;overflow-y:auto";
  m.innerHTML = `
  <div style="background:#fff;border-radius:16px;width:min(680px,96vw);margin:0 auto 40px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #e2e6ed;background:#f8f9fb">
      <div>
        <div style="font-size:15px;font-weight:800" id="scanModalTitle">📎 Файл / Скан</div>
        <div style="font-size:11px;color:#667085" id="scanModalSub"></div>
      </div>
      <button onclick="closeScanModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#667085">✕</button>
    </div>

    <!-- Upload zone -->
    <div style="padding:18px 22px;border-bottom:1px solid #e2e6ed">
      <div style="font-size:12px;font-weight:700;color:#344054;margin-bottom:8px">📤 Шинэ файл нэмэх</div>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div>
          <label style="display:block;font-size:11px;color:#667085;margin-bottom:4px">Файл (зураг / PDF)</label>
          <input type="file" id="scanFileInput" accept="image/*,.pdf"
                 style="border:1px solid #d0d5dd;border-radius:8px;padding:5px 8px;font-size:12px;max-width:280px">
        </div>
        <div style="flex:1">
          <label style="display:block;font-size:11px;color:#667085;margin-bottom:4px">Тайлбар (заавал биш)</label>
          <input class="input" id="scanNoteInput" placeholder="Хуудас дугаар, агуулга..." style="font-size:12px">
        </div>
        <button class="btn sm" id="scanUploadBtn" onclick="doScanUpload()" style="white-space:nowrap">⬆ Хуулах</button>
      </div>
      <div id="scanUploadMsg" style="font-size:12px;margin-top:6px;color:#16a34a;display:none"></div>
    </div>

    <!-- File list -->
    <div style="padding:18px 22px;min-height:120px">
      <div style="font-size:12px;font-weight:700;color:#344054;margin-bottom:10px">📋 Хадгалагдсан файлууд</div>
      <div id="scanFileList"><div style="color:#94a3b8;font-size:13px">Ачааллаж байна...</div></div>
    </div>
  </div>`;
  document.body.appendChild(m);
}

let _scanEntityType = "";
let _scanEntityId   = 0;
let _scanEntityLabel = "";

async function openScanModal(entityType, entityId, label) {
  injectScanModal();
  _scanEntityType  = entityType;
  _scanEntityId    = entityId;
  _scanEntityLabel = label;
  document.getElementById("scanModalTitle").textContent = `📎 Файл / Скан`;
  document.getElementById("scanModalSub").textContent   = label;
  document.getElementById("scanFileInput").value = "";
  document.getElementById("scanNoteInput").value = "";
  const msg = document.getElementById("scanUploadMsg");
  if (msg) { msg.style.display = "none"; msg.textContent = ""; }
  document.getElementById("scanModal").style.display = "flex";
  await loadScanFiles();
}

function closeScanModal() {
  const m = document.getElementById("scanModal");
  if (m) m.style.display = "none";
}

async function loadScanFiles() {
  const list = document.getElementById("scanFileList");
  if (!list) return;
  list.innerHTML = `<div style="color:#94a3b8;font-size:13px">Ачааллаж байна...</div>`;
  try {
    const rows = await api(`/api/doc-attachments?entity_type=${_scanEntityType}&entity_id=${_scanEntityId}`);
    if (!rows.length) {
      list.innerHTML = `<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px 0">Файл байхгүй байна</div>`;
      return;
    }
    list.innerHTML = rows.map(r => {
      const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(r.file_url);
      const isPdf = /\.pdf$/i.test(r.file_url);
      const date  = r.uploaded_at ? r.uploaded_at.slice(0,16).replace("T"," ") : "";
      return `
      <div id="sfile_${r.id}" style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f1f5f9">
        ${isImg
          ? `<img src="${r.file_url}" onclick="window._ftZoom&&window._ftZoom('${r.file_url}')"
               style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #e2e6ed;cursor:zoom-in;flex-shrink:0">`
          : `<a href="${r.file_url}" target="_blank" style="flex-shrink:0;display:flex;align-items:center;justify-content:center;width:72px;height:72px;background:#fee2e2;border-radius:8px;border:1px solid #fca5a5;text-decoration:none;font-size:28px">📄</a>`
        }
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.file_name||r.file_url.split("/").pop())}</div>
          <div id="snote_view_${r.id}" style="font-size:11px;color:#667085;margin-top:2px">${escapeHtml(r.note||"—")}</div>
          <input id="snote_edit_${r.id}" class="input" value="${escapeHtml(r.note||"")}"
                 style="display:none;font-size:11px;padding:3px 7px;margin-top:2px"
                 onkeydown="if(event.key==='Enter')saveScanNote(${r.id})">
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">👤 ${escapeHtml(r.uploaded_name||"")} · ${date}</div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            <a href="${r.file_url}" target="_blank" class="btn secondary sm" style="font-size:11px;padding:3px 9px;text-decoration:none">👁 Харах</a>
            <a href="${r.file_url}" download class="btn secondary sm" style="font-size:11px;padding:3px 9px;text-decoration:none">⬇ Татах</a>
            <button class="btn secondary sm" style="font-size:11px;padding:3px 9px" onclick="toggleScanNoteEdit(${r.id})">✏ Засах</button>
            <button class="btn danger sm" style="font-size:11px;padding:3px 9px" onclick="deleteScanFile(${r.id})">🗑 Устгах</button>
          </div>
        </div>
      </div>`;
    }).join("");
  } catch(e) {
    list.innerHTML = `<div style="color:#dc2626;font-size:13px">Алдаа: ${e.message}</div>`;
  }
}

function toggleScanNoteEdit(id) {
  const view = document.getElementById(`snote_view_${id}`);
  const edit = document.getElementById(`snote_edit_${id}`);
  if (!view || !edit) return;
  const isEditing = edit.style.display !== "none";
  if (isEditing) {
    view.style.display = "block";
    edit.style.display = "none";
  } else {
    view.style.display = "none";
    edit.style.display = "block";
    edit.focus();
  }
}

async function saveScanNote(id) {
  const edit = document.getElementById(`snote_edit_${id}`);
  if (!edit) return;
  const note = edit.value.trim();
  try {
    await api(`/api/doc-attachments/${id}`, { method:"PUT", body:JSON.stringify({ note }) });
    const view = document.getElementById(`snote_view_${id}`);
    if (view) { view.textContent = note || "—"; view.style.display = "block"; }
    edit.style.display = "none";
    toast("Тайлбар хадгалагдлаа");
  } catch(e) { toast("Алдаа: " + e.message); }
}

async function deleteScanFile(id) {
  if (!confirm("Энэ файлыг устгах уу?")) return;
  try {
    await api(`/api/doc-attachments/${id}`, { method:"DELETE" });
    document.getElementById(`sfile_${id}`)?.remove();
    const list = document.getElementById("scanFileList");
    if (list && !list.querySelector("[id^=sfile_]"))
      list.innerHTML = `<div style="color:#94a3b8;font-size:13px;text-align:center;padding:20px 0">Файл байхгүй байна</div>`;
    toast("Устгагдлаа");
  } catch(e) { toast("Алдаа: " + e.message); }
}

async function doScanUpload() {
  const fileInput = document.getElementById("scanFileInput");
  const note      = document.getElementById("scanNoteInput")?.value || "";
  const btn       = document.getElementById("scanUploadBtn");
  const msg       = document.getElementById("scanUploadMsg");
  if (!fileInput?.files?.[0]) { toast("Файл сонгоно уу"); return; }
  if (btn) btn.disabled = true;
  try {
    const fd = new FormData();
    fd.append("file", fileInput.files[0]);
    fd.append("entity_type", _scanEntityType);
    fd.append("entity_id",   String(_scanEntityId));
    fd.append("note",        note);
    const token = localStorage.getItem("token") || "";
    const res = await fetch(location.origin + "/api/doc-attachments/upload", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token },
      body: fd
    });
    if (!res.ok) { const e=await res.json(); toast(e.error||"Алдаа"); return; }
    if (msg) { msg.textContent = "✓ Амжилттай хуулагдлаа"; msg.style.display = "block"; }
    fileInput.value = "";
    document.getElementById("scanNoteInput").value = "";
    await loadScanFiles();
    setTimeout(() => { if (msg) msg.style.display = "none"; }, 2500);
  } catch(e) { toast("Алдаа: " + e.message); }
  finally { if (btn) btn.disabled = false; }
}

// ── Tab : Ажлын төрөл (Work categories) ─────────────────────────

async function ahbWorkCats() {
  const isAdmin = ["director","chief_engineer"].includes(state.me.role);
  let cats = [];
  try { cats = await api("/api/work-categories"); } catch(e) {}

  const COLORS = ["#2563eb","#16a34a","#f59e0b","#8b5cf6","#dc2626","#0891b2","#db2777","#ea580c","#65a30d"];
  const colorOpts = COLORS.map(c =>
    `<option value="${c}">${c}</option>`).join("");

  ahbSet(`
    <div style="max-width:720px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <div style="font-size:16px;font-weight:700">🏷 Ажлын категориуд</div>
          <div style="font-size:12px;color:#667085;margin-top:2px">Ажлын явц (Gantt) хэсэгт харагдах ажлын төрлүүд</div>
        </div>
        ${isAdmin ? `<button class="btn sm" onclick="ahbCatAdd()">+ Шинэ нэмэх</button>` : ""}
      </div>

      ${isAdmin ? `
      <div id="catAddForm" style="display:none;background:#f8f9fb;border:1.5px solid #e2e6ed;border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;margin-bottom:12px">Шинэ категори нэмэх</div>
        <div style="display:grid;grid-template-columns:1fr 60px 1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <div class="small muted" style="margin-bottom:4px">Нэр *</div>
            <input class="input" id="catName" placeholder="Жишээ: Замын засвар">
          </div>
          <div>
            <div class="small muted" style="margin-bottom:4px">Дүрс</div>
            <input class="input" id="catIcon" placeholder="🔧" style="font-size:18px;text-align:center">
          </div>
          <div>
            <div class="small muted" style="margin-bottom:4px">Өнгө</div>
            <input type="color" id="catColor" value="#2563eb" style="width:100%;height:38px;border:1px solid #d0d5dd;border-radius:8px;cursor:pointer;padding:2px">
          </div>
          <div>
            <div class="small muted" style="margin-bottom:4px">Хэлтэс (автоматаар)</div>
            <input class="input" id="catDept" placeholder="Захиргаа, Инженер...">
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn sm" onclick="ahbCatSave()">Хадгалах</button>
          <button class="btn secondary sm" onclick="document.getElementById('catAddForm').style.display='none'">Болих</button>
        </div>
      </div>` : ""}

      <div style="display:flex;flex-direction:column;gap:8px" id="catList">
        ${cats.length ? cats.map((c,i) => `
          <div style="background:#fff;border:1.5px solid #e2e6ed;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px">
            <div style="width:36px;height:36px;border-radius:8px;background:${escapeHtml(c.color||'#2563eb')}22;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${escapeHtml(c.icon||'📋')}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14px">${escapeHtml(c.name)}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:1px">
                ${c.department ? `🏢 ${escapeHtml(c.department)}` : '<span style="color:#d1d5db">Хэлтэс тохируулаагүй</span>'}
                · <span style="width:10px;height:10px;border-radius:50%;background:${escapeHtml(c.color||'#2563eb')};display:inline-block;vertical-align:middle"></span> ${escapeHtml(c.color||'')}
              </div>
            </div>
            ${isAdmin ? `
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button class="btn secondary sm" onclick='ahbCatEdit(${JSON.stringify(c)})'>✏️</button>
              <button class="btn danger sm" onclick="ahbCatDel(${c.id},'${escapeHtml(c.name)}')">🗑</button>
            </div>` : ""}
          </div>`).join("") : `<div style="text-align:center;color:#94a3b8;padding:32px">Категори бүртгэгдээгүй байна</div>`}
      </div>
    </div>

    <div id="catEditModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center"
      onclick="if(event.target===this)document.getElementById('catEditModal').style.display='none'">
      <div style="background:#fff;border-radius:14px;width:min(480px,94vw);padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
        <div style="font-size:15px;font-weight:700;margin-bottom:16px">✏️ Категори засах</div>
        <input type="hidden" id="ceId">
        <div style="display:grid;grid-template-columns:1fr 60px;gap:10px;margin-bottom:10px">
          <div>
            <div class="small muted" style="margin-bottom:4px">Нэр *</div>
            <input class="input" id="ceName" placeholder="Нэр">
          </div>
          <div>
            <div class="small muted" style="margin-bottom:4px">Дүрс</div>
            <input class="input" id="ceIcon" placeholder="📋" style="font-size:18px;text-align:center">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
          <div>
            <div class="small muted" style="margin-bottom:4px">Өнгө</div>
            <input type="color" id="ceColor" style="width:100%;height:38px;border:1px solid #d0d5dd;border-radius:8px;cursor:pointer;padding:2px">
          </div>
          <div>
            <div class="small muted" style="margin-bottom:4px">Хэлтэс</div>
            <input class="input" id="ceDept" placeholder="Захиргаа...">
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn" onclick="ahbCatUpdate()">Хадгалах</button>
          <button class="btn secondary" onclick="document.getElementById('catEditModal').style.display='none'">Болих</button>
        </div>
      </div>
    </div>
  `);

  window.ahbCatAdd = () => {
    const f = document.getElementById("catAddForm");
    if (f) f.style.display = f.style.display === "none" ? "block" : "none";
  };

  window.ahbCatSave = async () => {
    const name  = document.getElementById("catName")?.value.trim();
    const icon  = document.getElementById("catIcon")?.value.trim() || "📋";
    const color = document.getElementById("catColor")?.value || "#2563eb";
    const dept  = document.getElementById("catDept")?.value.trim() || "";
    if (!name) { toast("Нэр оруулна уу"); return; }
    try {
      await api("/api/work-categories", { method:"POST", body: JSON.stringify({ name, icon, color, department:dept }) });
      toast("Нэмэгдлээ ✓");
      ahbWorkCats();
    } catch(e) { toast("Алдаа: " + (e.message||e)); }
  };

  window.ahbCatEdit = (c) => {
    document.getElementById("ceId").value    = c.id;
    document.getElementById("ceName").value  = c.name;
    document.getElementById("ceIcon").value  = c.icon || "📋";
    document.getElementById("ceColor").value = c.color || "#2563eb";
    document.getElementById("ceDept").value  = c.department || "";
    document.getElementById("catEditModal").style.display = "flex";
  };

  window.ahbCatUpdate = async () => {
    const id    = document.getElementById("ceId")?.value;
    const name  = document.getElementById("ceName")?.value.trim();
    const icon  = document.getElementById("ceIcon")?.value.trim() || "📋";
    const color = document.getElementById("ceColor")?.value || "#2563eb";
    const dept  = document.getElementById("ceDept")?.value.trim() || "";
    if (!name) { toast("Нэр оруулна уу"); return; }
    try {
      await api(`/api/work-categories/${id}`, { method:"PUT", body: JSON.stringify({ name, icon, color, department:dept, is_active:1 }) });
      document.getElementById("catEditModal").style.display = "none";
      toast("Шинэчлэгдлээ ✓");
      ahbWorkCats();
    } catch(e) { toast("Алдаа: " + (e.message||e)); }
  };

  window.ahbCatDel = async (id, name) => {
    if (!confirm(`"${name}" категорийг нуух уу?\n(Одоо байгаа ажил устахгүй)`)) return;
    try {
      await api(`/api/work-categories/${id}`, { method:"DELETE" });
      toast("Нуугдлаа ✓");
      ahbWorkCats();
    } catch(e) { toast("Алдаа: " + (e.message||e)); }
  };
}

// ── AI Тест ───────────────────────────────────────────────────
async function ahbAiTest() {
  ahbSet(`
    <div style="max-width:860px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="margin:0 0 4px;font-size:18px">🤖 AI Автомат тест</h2>
          <div style="font-size:12px;color:#667085">ERP-ийн API, аюулгүй байдал, өгөгдлийн бүрэн бүтэн байдлыг автоматаар шалгана</div>
        </div>
        <button id="btnRunAiTest" onclick="runAiTest()"
          style="background:#2563eb;color:#fff;border:0;border-radius:10px;padding:10px 22px;font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:8px">
          ▶ Тест ажиллуулах
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px" id="aiTestStats">
        ${["Нийт тест","Амжилттай","Алдаатай","Оноо"].map(l =>
          `<div style="background:#f8fafc;border:1px solid #e2e6ed;border-radius:12px;padding:16px;text-align:center">
            <div style="font-size:22px;font-weight:900;color:#94a3b8">—</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px">${l}</div>
          </div>`).join("")}
      </div>

      <div id="aiTestAI" style="display:none;margin-bottom:20px;background:#0f172a;border-radius:12px;padding:20px;color:#e2e8f0;font-size:13px;line-height:1.7;white-space:pre-wrap"></div>

      <div id="aiTestResults" style="display:flex;flex-direction:column;gap:8px"></div>
    </div>`);

  window.runAiTest = async () => {
    const btn = document.getElementById("btnRunAiTest");
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳ Шалгаж байна..."; }
    document.getElementById("aiTestResults").innerHTML = `
      <div style="text-align:center;padding:40px;color:#94a3b8">
        <div style="font-size:32px;margin-bottom:12px">🔍</div>
        <div style="font-size:14px;font-weight:600">API endpoint-уудыг шалгаж байна...</div>
        <div style="font-size:12px;margin-top:6px">30-60 секунд хүлээнэ үү</div>
      </div>`;

    try {
      const data = await api("/api/ai-test/run", { method: "POST" });

      // Stats
      const scoreColor = data.score >= 80 ? "#16a34a" : data.score >= 60 ? "#d97706" : "#dc2626";
      document.getElementById("aiTestStats").innerHTML = `
        <div style="background:#f8fafc;border:1px solid #e2e6ed;border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:26px;font-weight:900;color:#1e293b">${data.total}</div>
          <div style="font-size:11px;color:#667085;margin-top:4px">Нийт тест</div>
        </div>
        <div style="background:#dcfce7;border:1px solid #86efac;border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:26px;font-weight:900;color:#16a34a">${data.passed}</div>
          <div style="font-size:11px;color:#15803d;margin-top:4px">Амжилттай</div>
        </div>
        <div style="background:${data.failed?'#fee2e2':'#f8fafc'};border:1px solid ${data.failed?'#fca5a5':'#e2e6ed'};border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:26px;font-weight:900;color:${data.failed?'#dc2626':'#94a3b8'}">${data.failed}</div>
          <div style="font-size:11px;color:${data.failed?'#991b1b':'#94a3b8'};margin-top:4px">Алдаатай</div>
        </div>
        <div style="background:#fff;border:2px solid ${scoreColor};border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:26px;font-weight:900;color:${scoreColor}">${data.score}%</div>
          <div style="font-size:11px;color:${scoreColor};margin-top:4px">Ерөнхий оноо</div>
        </div>`;

      // AI analysis
      if (data.ai_analysis) {
        const aiEl = document.getElementById("aiTestAI");
        aiEl.style.display = "block";
        aiEl.innerHTML = `<div style="font-size:11px;color:#94a3b8;margin-bottom:10px;font-weight:700">🤖 GPT-4 ШИНЖИЛГЭЭ · ${new Date(data.ran_at).toLocaleString("mn-MN")}</div>` +
          escapeHtml(data.ai_analysis)
            .replace(/## (.+)/g, '<div style="font-size:14px;font-weight:800;color:#f1f5f9;margin:14px 0 6px">$1</div>')
            .replace(/\n/g, "<br>");
      }

      // Test results grouped
      const groups = {};
      (data.results || []).forEach(r => {
        if (!groups[r.group]) groups[r.group] = [];
        groups[r.group].push(r);
      });

      const resultsHtml = Object.entries(groups).map(([grp, items]) => {
        const gPass = items.filter(i => i.pass).length;
        return `<div style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;overflow:hidden;margin-bottom:8px">
          <div style="padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e2e6ed;display:flex;align-items:center;justify-content:space-between">
            <span style="font-weight:700;font-size:13px">${escapeHtml(grp)}</span>
            <span style="font-size:11px;color:${gPass===items.length?'#16a34a':'#d97706'};font-weight:700">${gPass}/${items.length}</span>
          </div>
          ${items.map(r => `
            <div style="padding:8px 14px;border-bottom:1px solid #f1f5f9;display:flex;align-items:flex-start;gap:10px">
              <span style="font-size:14px;flex-shrink:0;margin-top:1px">${r.pass ? "✅" : "❌"}</span>
              <div style="min-width:0">
                <div style="font-size:12px;font-weight:600;color:#1e293b">${escapeHtml(r.name)}</div>
                <div style="font-size:11px;color:${r.pass?'#667085':'#dc2626'};margin-top:2px">${escapeHtml(r.detail)}</div>
              </div>
            </div>`).join("")}
        </div>`;
      }).join("");

      document.getElementById("aiTestResults").innerHTML = resultsHtml ||
        `<div style="text-align:center;color:#94a3b8;padding:20px">Тест үр дүн байхгүй</div>`;

    } catch(e) {
      document.getElementById("aiTestResults").innerHTML =
        `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:10px;padding:16px;color:#991b1b">
          ❌ Тест ажиллуулахад алдаа гарлаа: ${escapeHtml(e.message)}
        </div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = "▶ Тест ажиллуулах"; }
    }
  };
}

async function ai_test() {
  main.innerHTML = `<div style="padding:24px 0;max-width:900px">
    <div style="margin-bottom:20px">
      <h1 style="margin:0 0 4px;font-size:20px">🤖 AI Автомат тест</h1>
      <div style="font-size:12px;color:#667085">ERP-ийн API, аюулгүй байдал, өгөгдлийн бүрэн бүтэн байдлыг автоматаар шалгаад GPT-4 шинжилгээ өгнө</div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:20px">
      <button id="btnRunAiTest" onclick="runAiTest()"
        style="background:#2563eb;color:#fff;border:0;border-radius:10px;padding:11px 24px;font-size:14px;font-weight:800;cursor:pointer">
        ▶ Тест ажиллуулах
      </button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px" id="aiTestStats">
      ${["Нийт тест","Амжилттай","Алдаатай","Оноо"].map(l =>
        `<div style="background:#f8fafc;border:1px solid #e2e6ed;border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:24px;font-weight:900;color:#94a3b8">—</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:4px">${l}</div>
        </div>`).join("")}
    </div>
    <div id="aiTestAI" style="display:none;margin-bottom:20px;background:#0f172a;border-radius:12px;padding:20px;color:#e2e8f0;font-size:13px;line-height:1.75;white-space:pre-wrap"></div>
    <div id="aiTestResults"></div>
  </div>`;

  window.runAiTest = async () => {
    const btn = document.getElementById("btnRunAiTest");
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳ Шалгаж байна... (30-60с)"; }
    document.getElementById("aiTestResults").innerHTML = `
      <div style="text-align:center;padding:50px;color:#94a3b8">
        <div style="font-size:40px;margin-bottom:14px">🔍</div>
        <div style="font-size:14px;font-weight:700">API endpoint-уудыг шалгаж байна...</div>
        <div style="font-size:12px;margin-top:6px">Хүлээнэ үү</div>
      </div>`;
    try {
      const data = await api("/api/ai-test/run", { method: "POST" });
      const sc = data.score >= 80 ? "#16a34a" : data.score >= 60 ? "#d97706" : "#dc2626";
      document.getElementById("aiTestStats").innerHTML = `
        <div style="background:#f8fafc;border:1px solid #e2e6ed;border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:26px;font-weight:900;color:#1e293b">${data.total}</div>
          <div style="font-size:11px;color:#667085;margin-top:4px">Нийт тест</div>
        </div>
        <div style="background:#dcfce7;border:1px solid #86efac;border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:26px;font-weight:900;color:#16a34a">${data.passed}</div>
          <div style="font-size:11px;color:#15803d;margin-top:4px">Амжилттай</div>
        </div>
        <div style="background:${data.failed?'#fee2e2':'#f8fafc'};border:1px solid ${data.failed?'#fca5a5':'#e2e6ed'};border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:26px;font-weight:900;color:${data.failed?'#dc2626':'#94a3b8'}">${data.failed}</div>
          <div style="font-size:11px;color:${data.failed?'#991b1b':'#94a3b8'};margin-top:4px">Алдаатай</div>
        </div>
        <div style="background:#fff;border:2px solid ${sc};border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:26px;font-weight:900;color:${sc}">${data.score}%</div>
          <div style="font-size:11px;color:${sc};margin-top:4px">Ерөнхий оноо</div>
        </div>`;
      if (data.ai_analysis) {
        const aiEl = document.getElementById("aiTestAI");
        aiEl.style.display = "block";
        aiEl.innerHTML = `<div style="font-size:11px;color:#94a3b8;margin-bottom:10px;font-weight:700;letter-spacing:.5px">🤖 GPT-4 ШИНЖИЛГЭЭ · ${new Date(data.ran_at).toLocaleString("mn-MN")} · ${data.duration_ms}ms</div>` +
          escapeHtml(data.ai_analysis)
            .replace(/## (.+)/g, '<div style="font-size:14px;font-weight:800;color:#f1f5f9;margin:16px 0 6px">$1</div>')
            .replace(/\n/g, "<br>");
      }
      const groups = {};
      (data.results || []).forEach(r => { if (!groups[r.group]) groups[r.group]=[]; groups[r.group].push(r); });
      document.getElementById("aiTestResults").innerHTML = Object.entries(groups).map(([grp, items]) => {
        const gp = items.filter(i=>i.pass).length;
        return `<div style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;overflow:hidden;margin-bottom:10px">
          <div style="padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e2e6ed;display:flex;align-items:center;justify-content:space-between">
            <span style="font-weight:700;font-size:13px">${escapeHtml(grp)}</span>
            <span style="font-size:12px;font-weight:700;color:${gp===items.length?'#16a34a':'#d97706'}">${gp}/${items.length}</span>
          </div>
          ${items.map(r=>`
            <div style="padding:9px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:flex-start;gap:10px">
              <span style="font-size:15px;flex-shrink:0">${r.pass?"✅":"❌"}</span>
              <div>
                <div style="font-size:12px;font-weight:600;color:#1e293b">${escapeHtml(r.name)}</div>
                <div style="font-size:11px;color:${r.pass?'#667085':'#dc2626'};margin-top:2px">${escapeHtml(r.detail)}</div>
              </div>
            </div>`).join("")}
        </div>`;
      }).join("") || `<div style="text-align:center;color:#94a3b8;padding:20px">Тест үр дүн байхгүй</div>`;
    } catch(e) {
      document.getElementById("aiTestResults").innerHTML =
        `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:10px;padding:16px;color:#991b1b">❌ Алдаа: ${escapeHtml(e.message)}</div>`;
    } finally {
      if (btn) { btn.disabled=false; btn.innerHTML="▶ Тест ажиллуулах"; }
    }
  };
}

Object.assign(window, {
  admin_hub,
  openScanModal, closeScanModal, doScanUpload,
  toggleScanNoteEdit, saveScanNote, deleteScanFile,
  ahbWorkCats, ahbAiTest, ai_test
});
