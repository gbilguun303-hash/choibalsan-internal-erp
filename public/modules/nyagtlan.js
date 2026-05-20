import { state, api, toast, today, escapeHtml, table } from './common.js';

const canEdit = () => ["director","accountant"].includes(state.me.role);
const fmt = n => Number(n||0).toLocaleString("mn-MN");
const fmtDate = s => s ? s.slice(0,10) : "—";

function statCard(label, value, color, sub) {
  return `<div style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;padding:14px 16px;border-top:3px solid ${color}">
    <div style="font-size:11px;color:#667085;margin-bottom:4px;text-transform:uppercase">${label}</div>
    <div style="font-size:22px;font-weight:800;color:${color}">${value}</div>
    ${sub ? `<div style="font-size:11px;color:#94a3b8;margin-top:3px">${sub}</div>` : ""}
  </div>`;
}

// ── 1. Санхүүгийн самбар ─────────────────────────────────────

async function fin_dashboard() {
  main.innerHTML = `<div style="text-align:center;padding:60px 0;color:#94a3b8">Уншиж байна...</div>`;
  let s = {};
  try { s = await api("/api/finance-summary"); } catch(e) { s = {}; }

  const bal = Number(s.cash_balance||0);
  const balColor = bal >= 0 ? "#16a34a" : "#dc2626";

  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <div>
      <h1 style="margin:0 0 4px">💼 Санхүүгийн самбар</h1>
      <div style="font-size:12px;color:#667085">Нягтлангийн нэгдсэн тойм · ${new Date().toLocaleDateString("mn-MN")}</div>
    </div>
    <button class="btn secondary sm" onclick="fin_dashboard()">↺ Шинэчлэх</button>
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:22px">
    ${statCard("Нийт орлого (журнал)", fmt(s.cash_in)+"₮", "#2563eb")}
    ${statCard("Нийт зарлага (журнал)", fmt(s.cash_out)+"₮", "#dc2626")}
    ${statCard("Мөнгөн хөрөнгийн үлдэгдэл", fmt(s.cash_balance)+"₮", balColor)}
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px">
    ${statCard("Нийт өглөг (төлөгдөөгүй)", fmt(s.total_payable)+"₮", "#d97706")}
    ${statCard("Нийт авлага (хүлээгдэж буй)", fmt(s.total_receivable)+"₮", "#7c3aed")}
    ${statCard("Энэ сарын цалин", fmt(s.current_payroll)+"₮", "#0891b2")}
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
    <div class="panel">
      <div style="padding:14px 18px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">📋 Сүүлийн журналын бичилтүүд</div>
      <div id="dashJournal" style="padding:14px 18px;font-size:13px;color:#94a3b8">Уншиж байна...</div>
    </div>
    <div class="panel">
      <div style="padding:14px 18px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">⚠️ Хугацаа дууссан өглөгүүд</div>
      <div id="dashPayable" style="padding:14px 18px;font-size:13px;color:#94a3b8">Уншиж байна...</div>
    </div>
  </div>`;

  try {
    const rows = await api("/api/cash-journal?txn_type=");
    const recent = rows.slice(0,6);
    document.getElementById("dashJournal").innerHTML = recent.length
      ? `<div class="table-wrap">${table(
          ["Огноо","Төрөл","Тайлбар","Дүн"],
          recent.map(r=>[fmtDate(r.txn_date),
            `<span style="color:${r.txn_type==='Орлого'?'#16a34a':'#dc2626'}">${escapeHtml(r.txn_type)}</span>`,
            escapeHtml(r.description),
            `<b>${fmt(r.amount)}₮</b>`])
        )}</div>`
      : "<div style='color:#94a3b8'>Мэдээлэл алга</div>";
  } catch(e) {}

  try {
    const payables = await api("/api/payables");
    const overdue = payables.filter(p => p.status !== "Төлөгдсөн" && p.due_date && p.due_date < today());
    document.getElementById("dashPayable").innerHTML = overdue.length
      ? `<div class="table-wrap">${table(
          ["Нийлүүлэгч","Дүн","Дуусах огноо"],
          overdue.slice(0,6).map(r=>[
            escapeHtml(r.vendor_name),
            `<b style="color:#dc2626">${fmt(r.amount-r.paid_amount)}₮</b>`,
            `<span style="color:#dc2626">${fmtDate(r.due_date)}</span>`])
        )}</div>`
      : "<div style='color:#16a34a'>✓ Хугацаа хэтэрсэн өглөг алга</div>";
  } catch(e) {}
}

// ── 2. Мөнгөн хөрөнгийн журнал ──────────────────────────────

async function cash_journal() {
  let rows = [], fromDate = today().slice(0,4)+"-01-01", toDate = today();
  async function load() {
    try { rows = await api(`/api/cash-journal?from=${fromDate}&to=${toDate}`); } catch(e) { rows = []; }
    render();
  }

  function render() {
    const totalIn  = rows.filter(r=>r.txn_type==="Орлого").reduce((s,r)=>s+Number(r.amount),0);
    const totalOut = rows.filter(r=>r.txn_type==="Зарлага").reduce((s,r)=>s+Number(r.amount),0);
    // Calculate running balance (ASC order → assign _balance → display in DESC)
    let bal = 0;
    [...rows].reverse().forEach(r => {
      bal += (r.txn_type==="Орлого" ? 1 : -1) * Number(r.amount);
      r._balance = bal;
    });
    main.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <div>
        <h1 style="margin:0 0 4px">📋 Мөнгөн хөрөнгийн журнал</h1>
        <div style="font-size:12px;color:#667085">Cash journal · Гүйлгээний бүртгэл</div>
      </div>
      ${canEdit() ? `<button class="btn" onclick="openCashForm()">+ Бичилт нэмэх</button>` : ""}
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">
      ${statCard("Нийт орлого", fmt(totalIn)+"₮", "#16a34a")}
      ${statCard("Нийт зарлага", fmt(totalOut)+"₮", "#dc2626")}
      ${statCard("Цэвэр дүн", fmt(totalIn-totalOut)+"₮", totalIn>=totalOut?"#2563eb":"#dc2626")}
    </div>

    <div class="panel">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #e2e6ed;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:700">Шүүлтүүр:</span>
        <input type="date" class="input" style="width:140px;padding:5px 8px;font-size:13px"
          value="${fromDate}" onchange="cjFrom=this.value;cjLoad()">
        <span style="color:#94a3b8">—</span>
        <input type="date" class="input" style="width:140px;padding:5px 8px;font-size:13px"
          value="${toDate}" onchange="cjTo=this.value;cjLoad()">
        ${canEdit() ? `<button class="btn sm" onclick="openSmartImport()">🧠 Smart Import</button>` : ""}
        ${state.me.role==='director' ? `<button class="btn secondary sm" style="color:#dc2626" onclick="clearCashRange('${fromDate}','${toDate}')">🗑 Шүүлтийн мөрүүд устгах</button>` : ""}
        ${state.me.role==='director' ? `<button class="btn secondary sm" style="color:#dc2626;font-weight:700" onclick="clearAllCash()">⚠ Бүх бичилт устгах</button>` : ""}
      </div>
      <div class="table-wrap">
        ${table(
          ["№","Огноо","Журнал №","Регистер","Байгуулллага","Орлого ₮","Зарлага ₮","Үлдэгдэл","Ханш","Валют","Гүйлгээний утга","Харцсан данс","Мөнгөн гүйлгээ тайлан","Хэтэлбэр","Зориулалт, арга хэмжээ","Эх үүсвэр","Эдийн засгийн ангилал","Шилжүүлэгч","Хүлээн авагч",""],
          rows.length ? rows.map((r,i) => {
            const s = v => `<span style="font-size:11px;color:#374151">${escapeHtml(String(v||"—"))}</span>`;
            return [
              i+1,
              fmtDate(r.txn_date),
              escapeHtml(r.doc_no||"—"),
              s(r.register_no),
              s(r.counterparty),
              r.txn_type==="Орлого"  ? `<b style="color:#16a34a">${fmt(r.amount)}</b>` : `<span style="color:#cbd5e1">—</span>`,
              r.txn_type==="Зарлага" ? `<b style="color:#dc2626">${fmt(r.amount)}</b>` : `<span style="color:#cbd5e1">—</span>`,
              `<b style="color:${r._balance>=0?'#16a34a':'#dc2626'}">${fmt(r._balance)}</b>`,
              Number(r.exchange_rate||1)!==1 ? r.exchange_rate : `<span style="color:#cbd5e1">1</span>`,
              escapeHtml(r.currency||"MNT"),
              s(r.description),
              s(r.corr_account),
              s(r.cash_flow_type),
              s(r.excess),
              s(r.purpose),
              s(r.source_fund),
              s(r.econ_category),
              s(r.transferor),
              s(r.receiver),
              canEdit() ? `<button class="btn secondary sm" onclick="editCash(${r.id})" style="margin-right:4px">✏</button>
                ${state.me.role==='director'?`<button class="btn secondary sm" style="color:#dc2626" onclick="delCash(${r.id})">🗑</button>`:""}` : ""
            ];
          }) : []
        )}
      </div>
    </div>

    <div id="cashFormModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:14px;padding:28px;width:560px;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <div style="font-size:16px;font-weight:800;margin-bottom:18px">📋 Журналын бичилт</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Огноо *</div>
            <input class="input" id="cj_date" type="date" value="${today()}"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Баримтын дугаар</div>
            <input class="input" id="cj_doc" placeholder="ГТ-2026-001"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Гүйлгээний төрөл *</div>
            <select class="input" id="cj_type">
              <option value="Орлого">Орлого</option>
              <option value="Зарлага">Зарлага</option>
            </select></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Дүн ₮ *</div>
            <input class="input" id="cj_amount" type="number" placeholder="0" min="0"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Регистер (РД)</div>
            <input class="input" id="cj_register" placeholder="УЛ-12345678..."></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Байгуулллага / Харилцагч</div>
            <input class="input" id="cj_counterparty" placeholder="Байгуулллагын нэр..."></div>
        </div>
        <div style="margin-bottom:12px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Гүйлгээний утга *</div>
          <input class="input" id="cj_desc" placeholder="Гүйлгээний тайлбар..."></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Дебит данс</div>
            <input class="input" id="cj_debit" placeholder="1110"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Кредит данс</div>
            <input class="input" id="cj_credit" placeholder="1210"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Кассч</div>
            <input class="input" id="cj_cashier" placeholder="Нэр..."></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Тэмдэглэл</div>
            <input class="input" id="cj_note" placeholder="..."></div>
        </div>
        <input type="hidden" id="cj_id" value="">
        <div style="display:flex;gap:10px">
          <button class="btn" onclick="saveCash()">Хадгалах</button>
          <button class="btn secondary" onclick="closeCashForm()">Цуцлах</button>
        </div>
      </div>
    </div>`;

    window.cjFrom = fromDate;
    window.cjTo   = toDate;
    window.cjLoad = () => { fromDate = window.cjFrom; toDate = window.cjTo; load(); };
  }

  window.openCashForm = () => {
    document.getElementById("cj_id").value = "";
    document.getElementById("cj_date").value = today();
    document.getElementById("cj_doc").value = "";
    document.getElementById("cj_type").value = "Орлого";
    document.getElementById("cj_amount").value = "";
    document.getElementById("cj_register").value = "";
    document.getElementById("cj_counterparty").value = "";
    document.getElementById("cj_desc").value = "";
    document.getElementById("cj_debit").value = "";
    document.getElementById("cj_credit").value = "";
    document.getElementById("cj_cashier").value = "";
    document.getElementById("cj_note").value = "";
    document.getElementById("cashFormModal").style.display = "flex";
  };
  window.closeCashForm = () => { document.getElementById("cashFormModal").style.display = "none"; };
  window.editCash = (id) => {
    const r = rows.find(x=>x.id===id); if (!r) return;
    document.getElementById("cj_id").value           = r.id;
    document.getElementById("cj_date").value         = r.txn_date||"";
    document.getElementById("cj_doc").value          = r.doc_no||"";
    document.getElementById("cj_type").value         = r.txn_type||"Орлого";
    document.getElementById("cj_amount").value       = r.amount||"";
    document.getElementById("cj_register").value     = r.register_no||"";
    document.getElementById("cj_counterparty").value = r.counterparty||"";
    document.getElementById("cj_desc").value         = r.description||"";
    document.getElementById("cj_debit").value        = r.debit_account||"";
    document.getElementById("cj_credit").value       = r.credit_account||"";
    document.getElementById("cj_cashier").value      = r.cashier||"";
    document.getElementById("cj_note").value         = r.note||"";
    document.getElementById("cashFormModal").style.display = "flex";
  };
  window.saveCash = async () => {
    const id   = document.getElementById("cj_id").value;
    const body = {
      txn_date:       document.getElementById("cj_date").value,
      doc_no:         document.getElementById("cj_doc").value,
      txn_type:       document.getElementById("cj_type").value,
      description:    document.getElementById("cj_desc").value,
      register_no:    document.getElementById("cj_register").value,
      counterparty:   document.getElementById("cj_counterparty").value,
      amount:         document.getElementById("cj_amount").value,
      debit_account:  document.getElementById("cj_debit").value,
      credit_account: document.getElementById("cj_credit").value,
      cashier:        document.getElementById("cj_cashier").value,
      note:           document.getElementById("cj_note").value
    };
    if (!body.txn_date || !body.description || !body.amount) { toast("Шаардлагатай талбар бөглөнө үү"); return; }
    try {
      if (id) await api(`/api/cash-journal/${id}`, { method:"PUT", body:JSON.stringify(body) });
      else    await api("/api/cash-journal",        { method:"POST",body:JSON.stringify(body) });
      toast("Амжилттай хадгаллаа");
      closeCashForm();
      load();
    } catch(e) { toast(e.message); }
  };
  window.delCash = async (id) => {
    if (!confirm("Устгах уу?")) return;
    try { await api(`/api/cash-journal/${id}`, { method:"DELETE" }); toast("Устгагдлаа"); load(); }
    catch(e) { toast(e.message); }
  };
  window.clearCashRange = async (from, to) => {
    if (!confirm(`${from} — ${to} хооронд бүртгэлтэй БҮГД бичлэгийг устгах уу?\nЭнэ үйлдлийг буцаах боломжгүй.`)) return;
    try {
      const r = await api(`/api/cash-journal-range?from=${from}&to=${to}`, { method:"DELETE" });
      toast(`${r.deleted} мөр устгагдлаа`);
      load();
    } catch(e) { toast(e.message); }
  };
  window.clearAllCash = async () => {
    if (!confirm("АНХААРУУЛГА: Мөнгөн хөрөнгийн журналын БҮГД бичилтийг устгах уу?\nЭнэ үйлдлийг буцаах боломжгүй!")) return;
    if (!confirm("Та итгэлтэй байна уу? Бүх мэдээлэл устна.")) return;
    try {
      const r = await api("/api/cash-journal-all", { method:"DELETE" });
      toast(`✅ ${r.deleted} мөр устгагдлаа`);
      load();
    } catch(e) { toast(e.message); }
  };

  load();
}

// ── 3. Өглөг ────────────────────────────────────────────────

async function payables() {
  let rows = [];
  async function load() {
    try { rows = await api("/api/payables"); } catch(e) { rows = []; }
    render();
  }
  function render() {
    const totalUnpaid = rows.filter(r=>r.status!=="Төлөгдсөн").reduce((s,r)=>s+Number(r.amount-r.paid_amount),0);
    const overdue = rows.filter(r=>r.status!=="Төлөгдсөн" && r.due_date && r.due_date < today()).length;
    main.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <div><h1 style="margin:0 0 4px">↓ Өглөгийн бүртгэл</h1>
        <div style="font-size:12px;color:#667085">Accounts Payable · Хийх төлбөрийн хяналт</div></div>
      ${canEdit()?`<button class="btn" onclick="openPayableForm()">+ Өглөг бүртгэх</button>`:""}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">
      ${statCard("Нийт төлөх өглөг", fmt(totalUnpaid)+"₮", "#d97706")}
      ${statCard("Нийт бичилт", rows.length+" ш", "#2563eb")}
      ${statCard("Хугацаа хэтэрсэн", overdue+" ш", "#dc2626")}
    </div>
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e2e6ed">
        <span style="font-weight:700;font-size:14px">Өглөгийн жагсаалт</span>
        ${canEdit() ? `<button class="btn sm" onclick="openSmartImport()">🧠 Smart Import</button>` : ""}
      </div>
      <div class="table-wrap">
        ${table(
          ["#","Нийлүүлэгч","Нэхэмжлэлийн №","Огноо","Дуусах огноо","Нийт дүн","Төлсөн","Үлдэгдэл","Статус",""],
          rows.map((r,i)=>[
            i+1, escapeHtml(r.vendor_name), escapeHtml(r.invoice_no||"—"),
            fmtDate(r.invoice_date), fmtDate(r.due_date),
            fmt(r.amount)+"₮", fmt(r.paid_amount)+"₮",
            `<b>${fmt(r.amount-r.paid_amount)}₮</b>`,
            `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${r.status==='Төлөгдсөн'?'#dcfce7':r.status==='Хэсэгчлэн'?'#fef9c3':'#fee2e2'};color:${r.status==='Төлөгдсөн'?'#16a34a':r.status==='Хэсэгчлэн'?'#ca8a04':'#dc2626'}">${r.status}</span>`,
            canEdit()?`<button class="btn secondary sm" onclick="editPayable(${r.id})">✏️</button>
              ${state.me.role==='director'?`<button class="btn secondary sm" style="color:#dc2626" onclick="delPayable(${r.id})">🗑</button>`:""}`:""
          ])
        )}
      </div>
    </div>
    <div id="payableModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:14px;padding:28px;width:520px;max-height:90vh;overflow:auto">
        <div style="font-size:16px;font-weight:800;margin-bottom:18px">↓ Өглөг бүртгэх</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Нийлүүлэгч *</div><input class="input" id="pay_vendor" placeholder="Байгууллагын нэр"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Нэхэмжлэлийн №</div><input class="input" id="pay_inv" placeholder="INV-001"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Нэхэмжлэлийн огноо *</div><input class="input" id="pay_idate" type="date" value="${today()}"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Дуусах огноо</div><input class="input" id="pay_due" type="date"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Нийт дүн ₮ *</div><input class="input" id="pay_amt" type="number" placeholder="0"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Төлсөн дүн ₮</div><input class="input" id="pay_paid" type="number" placeholder="0"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Статус</div>
            <select class="input" id="pay_status">
              <option>Төлөгдөөгүй</option><option>Хэсэгчлэн</option><option>Төлөгдсөн</option>
            </select></div>
        </div>
        <div style="margin-bottom:12px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Ангилал</div><input class="input" id="pay_cat" placeholder="Нийлүүлэлт, Үйлчилгээ..."></div>
        <div style="margin-bottom:14px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Тайлбар</div><input class="input" id="pay_desc" placeholder="Дэлгэрэнгүй..."></div>
        <input type="hidden" id="pay_id">
        <div style="display:flex;gap:10px">
          <button class="btn" onclick="savePayable()">Хадгалах</button>
          <button class="btn secondary" onclick="document.getElementById('payableModal').style.display='none'">Цуцлах</button>
        </div>
      </div>
    </div>`;

    window.openPayableForm = () => {
      ["pay_id","pay_vendor","pay_inv","pay_amt","pay_paid","pay_cat","pay_desc"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
      document.getElementById("pay_idate").value = today();
      document.getElementById("pay_due").value = "";
      document.getElementById("pay_status").value = "Төлөгдөөгүй";
      document.getElementById("payableModal").style.display = "flex";
    };
    window.editPayable = (id) => {
      const r = rows.find(x=>x.id===id); if (!r) return;
      document.getElementById("pay_id").value = r.id;
      document.getElementById("pay_vendor").value = r.vendor_name||"";
      document.getElementById("pay_inv").value    = r.invoice_no||"";
      document.getElementById("pay_idate").value  = r.invoice_date||"";
      document.getElementById("pay_due").value    = r.due_date||"";
      document.getElementById("pay_amt").value    = r.amount||"";
      document.getElementById("pay_paid").value   = r.paid_amount||"";
      document.getElementById("pay_status").value = r.status||"Төлөгдөөгүй";
      document.getElementById("pay_cat").value    = r.category||"";
      document.getElementById("pay_desc").value   = r.description||"";
      document.getElementById("payableModal").style.display = "flex";
    };
    window.savePayable = async () => {
      const id = document.getElementById("pay_id").value;
      const body = {
        vendor_name:  document.getElementById("pay_vendor").value,
        invoice_no:   document.getElementById("pay_inv").value,
        invoice_date: document.getElementById("pay_idate").value,
        due_date:     document.getElementById("pay_due").value,
        amount:       document.getElementById("pay_amt").value,
        paid_amount:  document.getElementById("pay_paid").value,
        status:       document.getElementById("pay_status").value,
        category:     document.getElementById("pay_cat").value,
        description:  document.getElementById("pay_desc").value
      };
      if (!body.vendor_name || !body.invoice_date || !body.amount) { toast("Шаардлагатай талбар бөглөнө үү"); return; }
      try {
        if (id) await api(`/api/payables/${id}`, { method:"PUT", body:JSON.stringify(body) });
        else    await api("/api/payables",        { method:"POST",body:JSON.stringify(body) });
        toast("Хадгалагдлаа"); document.getElementById("payableModal").style.display = "none"; load();
      } catch(e) { toast(e.message); }
    };
    window.delPayable = async (id) => {
      if (!confirm("Устгах уу?")) return;
      try { await api(`/api/payables/${id}`, { method:"DELETE" }); toast("Устгагдлаа"); load(); }
      catch(e) { toast(e.message); }
    };
  }
  load();
}

// ── 4. Авлага ────────────────────────────────────────────────

async function receivables() {
  let rows = [];
  async function load() {
    try { rows = await api("/api/receivables"); } catch(e) { rows = []; }
    render();
  }
  function render() {
    const totalPending = rows.filter(r=>r.status!=="Хүлээн авсан").reduce((s,r)=>s+Number(r.amount-r.received_amount),0);
    main.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <div><h1 style="margin:0 0 4px">↑ Авлагын бүртгэл</h1>
        <div style="font-size:12px;color:#667085">Accounts Receivable · Авах мөнгөний хяналт</div></div>
      ${canEdit()?`<button class="btn" onclick="openRecvForm()">+ Авлага бүртгэх</button>`:""}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">
      ${statCard("Нийт авах авлага", fmt(totalPending)+"₮", "#7c3aed")}
      ${statCard("Нийт бичилт", rows.length+" ш", "#2563eb")}
      ${statCard("Хүлээн авсан", rows.filter(r=>r.status==='Хүлээн авсан').length+" ш", "#16a34a")}
    </div>
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e2e6ed">
        <span style="font-weight:700;font-size:14px">Авлагын жагсаалт</span>
        ${canEdit() ? `<button class="btn sm" onclick="openSmartImport()">🧠 Smart Import</button>` : ""}
      </div>
      <div class="table-wrap">
        ${table(
          ["#","Өртэй тал","Нэхэмжлэлийн №","Огноо","Дуусах огноо","Нийт дүн","Авсан","Үлдэгдэл","Статус",""],
          rows.map((r,i)=>[
            i+1, escapeHtml(r.debtor_name), escapeHtml(r.invoice_no||"—"),
            fmtDate(r.invoice_date), fmtDate(r.due_date),
            fmt(r.amount)+"₮", fmt(r.received_amount)+"₮",
            `<b>${fmt(r.amount-r.received_amount)}₮</b>`,
            `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${r.status==='Хүлээн авсан'?'#dcfce7':r.status==='Хэсэгчлэн'?'#fef9c3':'#ede9fe'};color:${r.status==='Хүлээн авсан'?'#16a34a':r.status==='Хэсэгчлэн'?'#ca8a04':'#7c3aed'}">${r.status}</span>`,
            canEdit()?`<button class="btn secondary sm" onclick="editRecv(${r.id})">✏️</button>
              ${state.me.role==='director'?`<button class="btn secondary sm" style="color:#dc2626" onclick="delRecv(${r.id})">🗑</button>`:""}`:""
          ])
        )}
      </div>
    </div>
    <div id="recvModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:14px;padding:28px;width:520px;max-height:90vh;overflow:auto">
        <div style="font-size:16px;font-weight:800;margin-bottom:18px">↑ Авлага бүртгэх</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Өртэй тал *</div><input class="input" id="rv_debtor" placeholder="Байгууллага/хувь хүн"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Нэхэмжлэлийн №</div><input class="input" id="rv_inv" placeholder="INV-001"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Огноо *</div><input class="input" id="rv_idate" type="date" value="${today()}"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Дуусах огноо</div><input class="input" id="rv_due" type="date"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Нийт дүн ₮ *</div><input class="input" id="rv_amt" type="number" placeholder="0"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Авсан дүн ₮</div><input class="input" id="rv_recv" type="number" placeholder="0"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Статус</div>
            <select class="input" id="rv_status">
              <option>Хүлээгдэж буй</option><option>Хэсэгчлэн</option><option>Хүлээн авсан</option>
            </select></div>
        </div>
        <div style="margin-bottom:12px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Ангилал</div><input class="input" id="rv_cat" placeholder="..."></div>
        <div style="margin-bottom:14px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Тайлбар</div><input class="input" id="rv_desc" placeholder="..."></div>
        <input type="hidden" id="rv_id">
        <div style="display:flex;gap:10px">
          <button class="btn" onclick="saveRecv()">Хадгалах</button>
          <button class="btn secondary" onclick="document.getElementById('recvModal').style.display='none'">Цуцлах</button>
        </div>
      </div>
    </div>`;

    window.openRecvForm = () => {
      ["rv_id","rv_debtor","rv_inv","rv_amt","rv_recv","rv_cat","rv_desc"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
      document.getElementById("rv_idate").value = today();
      document.getElementById("rv_status").value = "Хүлээгдэж буй";
      document.getElementById("recvModal").style.display = "flex";
    };
    window.editRecv = (id) => {
      const r = rows.find(x=>x.id===id); if (!r) return;
      document.getElementById("rv_id").value     = r.id;
      document.getElementById("rv_debtor").value = r.debtor_name||"";
      document.getElementById("rv_inv").value    = r.invoice_no||"";
      document.getElementById("rv_idate").value  = r.invoice_date||"";
      document.getElementById("rv_due").value    = r.due_date||"";
      document.getElementById("rv_amt").value    = r.amount||"";
      document.getElementById("rv_recv").value   = r.received_amount||"";
      document.getElementById("rv_status").value = r.status||"Хүлээгдэж буй";
      document.getElementById("rv_cat").value    = r.category||"";
      document.getElementById("rv_desc").value   = r.description||"";
      document.getElementById("recvModal").style.display = "flex";
    };
    window.saveRecv = async () => {
      const id = document.getElementById("rv_id").value;
      const body = {
        debtor_name:     document.getElementById("rv_debtor").value,
        invoice_no:      document.getElementById("rv_inv").value,
        invoice_date:    document.getElementById("rv_idate").value,
        due_date:        document.getElementById("rv_due").value,
        amount:          document.getElementById("rv_amt").value,
        received_amount: document.getElementById("rv_recv").value,
        status:          document.getElementById("rv_status").value,
        category:        document.getElementById("rv_cat").value,
        description:     document.getElementById("rv_desc").value
      };
      if (!body.debtor_name || !body.invoice_date || !body.amount) { toast("Шаардлагатай талбар бөглөнө үү"); return; }
      try {
        if (id) await api(`/api/receivables/${id}`, { method:"PUT", body:JSON.stringify(body) });
        else    await api("/api/receivables",        { method:"POST",body:JSON.stringify(body) });
        toast("Хадгалагдлаа"); document.getElementById("recvModal").style.display = "none"; load();
      } catch(e) { toast(e.message); }
    };
    window.delRecv = async (id) => {
      if (!confirm("Устгах уу?")) return;
      try { await api(`/api/receivables/${id}`, { method:"DELETE" }); toast("Устгагдлаа"); load(); }
      catch(e) { toast(e.message); }
    };
  }
  load();
}

// ── 5. Үндсэн хөрөнгийн нягтлан бүртгэл ────────────────────

async function fixed_ledger() {
  let rows = [], assets = [];
  async function load() {
    try { [rows, assets] = await Promise.all([api("/api/fixed-ledger"), api("/api/assets")]); }
    catch(e) { rows = []; assets = []; }
    render();
  }
  function render() {
    const totalInit  = rows.reduce((s,r)=>s+Number(r.initial_value),0);
    const totalAccum = rows.reduce((s,r)=>s+Number(r.accumulated_depreciation),0);
    const totalBook  = rows.reduce((s,r)=>s+Number(r.book_value),0);
    main.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <div><h1 style="margin:0 0 4px">🏢 Үндсэн хөрөнгийн дансны бүртгэл</h1>
        <div style="font-size:12px;color:#667085">Fixed Assets Ledger · Элэгдлийн тооцоо</div></div>
      ${canEdit()?`<button class="btn" onclick="openLedgerForm()">+ Бүртгэл нэмэх</button>`:""}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">
      ${statCard("Анхны өртөг (нийт)", fmt(totalInit)+"₮", "#2563eb")}
      ${statCard("Нийт хуримтлагдсан элэгдэл", fmt(totalAccum)+"₮", "#d97706")}
      ${statCard("Дансны үнэ (нийт)", fmt(totalBook)+"₮", "#16a34a")}
    </div>
    <div class="panel">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #e2e6ed;flex-wrap:wrap">
        <span style="font-weight:700;font-size:14px;flex:1">Үндсэн хөрөнгийн дансны жагсаалт</span>
        ${canEdit() ? `<button class="btn sm" onclick="openSmartImport()">🧠 Smart Import</button>` : ""}
        ${state.me.role==='director' ? `<button class="btn secondary sm" style="color:#dc2626;font-weight:700" onclick="clearAllLedger()">⚠ Бүх бичилт устгах</button>` : ""}
      </div>
      <div class="table-wrap" style="overflow-x:auto">
        <table style="border-collapse:collapse;font-size:11px;white-space:nowrap;width:100%">
          <thead style="background:#f1f5f9;position:sticky;top:0;z-index:2">
            <tr style="border-bottom:1px solid #e2e6ed">
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;text-align:center">#</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed">Данс</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed">Код</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;min-width:160px">Хөрөнгийн нэр</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed">Загвар</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed">х.нэгж</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed">Огноо</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed">Ашиглах жил</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed">Нэгж.Үнэ</th>
              <th colspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;text-align:center;background:#dbeafe">Эхний үлдэгдэл</th>
              <th colspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;text-align:center;background:#dcfce7">Орлого</th>
              <th colspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;text-align:center;background:#fee2e2">Зарлага</th>
              <th colspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;text-align:center;background:#fef9c3">Сайжруулалт</th>
              <th colspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;text-align:center;background:#ede9fe">Эцсийн үлдэгдэл</th>
              <th colspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;text-align:center;background:#fce7f3">Дахин үнэлгээний нөмэгдэл</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;background:#fce7f3">Дахин үнэлгээний зөрүү</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;background:#fff7ed">Оны эхний элэгдэл</th>
              <th colspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;text-align:center;background:#fff7ed">Элэгдэл</th>
              <th colspan="12" style="padding:6px 8px;border:1px solid #e2e6ed;text-align:center;background:#f0fdf4">Нэмэгдсэн элэгдэл (сараар)</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;background:#f0fdf4">Нийт нэмэгдсэн элэгдэл</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;background:#f0fdf4">Хасагдсан нооцдох элэгдэл</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;background:#f0fdf4">Элэгдэл</th>
              <th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed;background:#dcfce7;font-weight:800">Үлдэгдэл өртөг</th>
              ${canEdit() ? `<th rowspan="2" style="padding:6px 8px;border:1px solid #e2e6ed"></th>` : ""}
            </tr>
            <tr style="border-bottom:2px solid #cbd5e1">
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#dbeafe">Тоо</th>
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#dbeafe">Дүн</th>
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#dcfce7">Тоо</th>
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#dcfce7">Дүн</th>
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#fee2e2">Тоо</th>
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#fee2e2">Дүн</th>
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#fef9c3">Орлого</th>
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#fef9c3">Зарлага</th>
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#ede9fe">Тоо</th>
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#ede9fe">Дүн</th>
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#fce7f3">Оны эхний</th>
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#fce7f3">Хасагдсан</th>
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#fff7ed">Шилжиж ирсэн</th>
              <th style="padding:4px 8px;border:1px solid #e2e6ed;background:#fff7ed">Зарлуулга</th>
              ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m=>`<th style="padding:4px 8px;border:1px solid #e2e6ed;background:#f0fdf4">${m}-р сар</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((r,i) => {
              const n = v => `<td style="padding:4px 8px;border:1px solid #f1f5f9;text-align:right">${v||0 ? fmt(v) : '<span style="color:#cbd5e1">—</span>'}</td>`;
              const s = v => `<td style="padding:4px 8px;border:1px solid #f1f5f9;font-size:11px;color:#374151">${escapeHtml(String(v||"—"))}</td>`;
              return `<tr style="${i%2?'background:#fafafa':''}">
                <td style="padding:4px 8px;border:1px solid #f1f5f9;text-align:center;color:#94a3b8">${i+1}</td>
                ${s(r.account_code)}
                ${s(r.asset_code_manual||r.asset_code)}
                <td style="padding:4px 8px;border:1px solid #f1f5f9;font-weight:600">${escapeHtml(r.asset_name_manual||r.asset_name||"—")}</td>
                ${s(r.asset_model)}
                ${s(r.unit||"ш")}
                <td style="padding:4px 8px;border:1px solid #f1f5f9">${fmtDate(r.acquisition_date)}</td>
                <td style="padding:4px 8px;border:1px solid #f1f5f9;text-align:right">${r.useful_life_months ? (r.useful_life_months/12).toFixed(1)+" жил" : "—"}</td>
                ${n(r.unit_value)}
                ${n(r.initial_qty)} ${n(r.initial_value)}
                ${n(r.intake_qty)}  ${n(r.intake_amount)}
                ${n(r.issue_qty_fa)}${n(r.issue_amount_fa)}
                ${n(r.improve_income)}${n(r.improve_expense)}
                ${n(r.final_qty)}   ${n(r.final_amount)}
                ${n(r.reval_opening)}${n(r.reval_disposed)}
                ${n(r.reval_diff)}
                ${n(r.depr_year_opening)}
                ${n(r.depr_opening)}${n(r.depr_disposed)}
                ${n(r.depr_m1)}${n(r.depr_m2)}${n(r.depr_m3)}${n(r.depr_m4)}
                ${n(r.depr_m5)}${n(r.depr_m6)}${n(r.depr_m7)}${n(r.depr_m8)}
                ${n(r.depr_m9)}${n(r.depr_m10)}${n(r.depr_m11)}${n(r.depr_m12)}
                ${n(r.depr_total_added)}
                ${n(r.depr_deducted)}
                ${n(r.accumulated_depreciation)}
                <td style="padding:4px 8px;border:1px solid #f1f5f9;text-align:right;background:#f0fdf4;font-weight:800;color:#16a34a">${fmt(r.book_value)}₮</td>
                ${canEdit() ? `<td style="padding:4px 8px;border:1px solid #f1f5f9">
                  <button class="btn secondary sm" onclick="editLedger(${r.id})">✏️</button>
                  ${state.me.role==='director'?`<button class="btn secondary sm" style="color:#dc2626" onclick="delLedger(${r.id})">🗑</button>`:""}
                </td>` : ""}
              </tr>`;
            }).join("") : `<tr><td colspan="100" style="padding:24px;text-align:center;color:#94a3b8">Мэдээлэл алга</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <div id="ledgerModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:14px;padding:28px;width:560px;max-height:90vh;overflow:auto">
        <div style="font-size:16px;font-weight:800;margin-bottom:18px">🏢 Үндсэн хөрөнгийн бүртгэл</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Данс</div><input class="input" id="lg_acct" placeholder="31211..."></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Код</div><input class="input" id="lg_code" placeholder="A-001..."></div>
        </div>
        <div style="margin-bottom:12px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Хөрөнгийн нэр *</div><input class="input" id="lg_name" placeholder="Хөрөнгийн нэр..."></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Нэгж</div><input class="input" id="lg_unit" placeholder="ш"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Нэгж үнэ ₮</div><input class="input" id="lg_uval" type="number" placeholder="0"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Анхны тоо</div><input class="input" id="lg_qty" type="number" placeholder="0"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Авсан огноо *</div><input class="input" id="lg_date" type="date" value="${today()}"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Анхны өртөг ₮ *</div><input class="input" id="lg_init" type="number" placeholder="0"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Ашиглах хугацаа (сар)</div><input class="input" id="lg_life" type="number" placeholder="120" value="120"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Элэгдлийн арга</div>
            <select class="input" id="lg_method">
              <option>Шулуун шугам</option><option>Буурах үлдэгдэл</option><option>Нийлбэр жил</option>
            </select></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Хуримт. элэгдэл ₮</div><input class="input" id="lg_accum" type="number" placeholder="0"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Дансны үнэ ₮</div><input class="input" id="lg_book" type="number" placeholder="0"></div>
        </div>
        <div style="margin-bottom:14px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Тэмдэглэл</div><input class="input" id="lg_note" placeholder="..."></div>
        <input type="hidden" id="lg_id">
        <div style="display:flex;gap:10px">
          <button class="btn" onclick="saveLedger()">Хадгалах</button>
          <button class="btn secondary" onclick="document.getElementById('ledgerModal').style.display='none'">Цуцлах</button>
        </div>
      </div>
    </div>`;

    window.openLedgerForm = () => {
      ["lg_id","lg_acct","lg_code","lg_name","lg_unit","lg_uval","lg_qty","lg_init","lg_accum","lg_book","lg_note"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
      document.getElementById("lg_date").value   = today();
      document.getElementById("lg_life").value   = "120";
      document.getElementById("lg_method").value = "Шулуун шугам";
      document.getElementById("ledgerModal").style.display = "flex";
    };
    window.editLedger = (id) => {
      const r = rows.find(x=>x.id===id); if (!r) return;
      document.getElementById("lg_id").value     = r.id;
      document.getElementById("lg_acct").value   = r.account_code||"";
      document.getElementById("lg_code").value   = r.asset_code_manual||r.asset_code||"";
      document.getElementById("lg_name").value   = r.asset_name_manual||r.asset_name||"";
      document.getElementById("lg_unit").value   = r.unit||"ш";
      document.getElementById("lg_uval").value   = r.unit_value||"";
      document.getElementById("lg_qty").value    = r.initial_qty||"";
      document.getElementById("lg_date").value   = r.acquisition_date||"";
      document.getElementById("lg_init").value   = r.initial_value||"";
      document.getElementById("lg_life").value   = r.useful_life_months||"120";
      document.getElementById("lg_method").value = r.depreciation_method||"Шулуун шугам";
      document.getElementById("lg_accum").value  = r.accumulated_depreciation||"";
      document.getElementById("lg_book").value   = r.book_value||"";
      document.getElementById("lg_note").value   = r.note||"";
      document.getElementById("ledgerModal").style.display = "flex";
    };
    window.saveLedger = async () => {
      const id = document.getElementById("lg_id").value;
      const body = {
        account_code:            document.getElementById("lg_acct").value,
        asset_code_manual:       document.getElementById("lg_code").value,
        asset_name_manual:       document.getElementById("lg_name").value,
        unit:                    document.getElementById("lg_unit").value||"ш",
        unit_value:              document.getElementById("lg_uval").value,
        initial_qty:             document.getElementById("lg_qty").value,
        acquisition_date:        document.getElementById("lg_date").value,
        initial_value:           document.getElementById("lg_init").value,
        useful_life_months:      document.getElementById("lg_life").value,
        depreciation_method:     document.getElementById("lg_method").value,
        accumulated_depreciation:document.getElementById("lg_accum").value,
        book_value:              document.getElementById("lg_book").value,
        note:                    document.getElementById("lg_note").value
      };
      if (!body.acquisition_date || !body.initial_value) { toast("Огноо болон анхны өртгийг оруулна уу"); return; }
      try {
        if (id) await api(`/api/fixed-ledger/${id}`, { method:"PUT", body:JSON.stringify(body) });
        else    await api("/api/fixed-ledger",        { method:"POST",body:JSON.stringify(body) });
        toast("Хадгалагдлаа"); document.getElementById("ledgerModal").style.display = "none"; load();
      } catch(e) { toast(e.message); }
    };
    window.delLedger = async (id) => {
      if (!confirm("Устгах уу?")) return;
      try { await api(`/api/fixed-ledger/${id}`, { method:"DELETE" }); toast("Устгагдлаа"); load(); }
      catch(e) { toast(e.message); }
    };
    window.clearAllLedger = async () => {
      if (!confirm("АНХААРУУЛГА: Үндсэн хөрөнгийн бүртгэлийн БҮГД мөрүүдийг устгах уу?\nЭнэ үйлдлийг буцаах боломжгүй!")) return;
      if (!confirm("Та итгэлтэй байна уу? Бүх мэдээлэл устна.")) return;
      try {
        const r = await api("/api/fixed-ledger-all", { method:"DELETE" });
        toast(`✅ ${r.deleted} мөр устгагдлаа`);
        load();
      } catch(e) { toast(e.message); }
    };
  }
  load();
}

// ── 6. Цалингийн тооцоо ─────────────────────────────────────

async function payroll() {
  const now = new Date();
  let selYear = now.getFullYear(), selMonth = now.getMonth()+1;
  let rows = [], users = state.users || [];

  async function load() {
    try { rows = await api(`/api/payroll?year=${selYear}&month=${selMonth}`); } catch(e) { rows = []; }
    render();
  }
  function render() {
    const totalNet = rows.reduce((s,r)=>s+Number(r.net_salary),0);
    const totalBase = rows.reduce((s,r)=>s+Number(r.base_salary),0);
    main.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <div><h1 style="margin:0 0 4px">👷 Цалингийн тооцоо</h1>
        <div style="font-size:12px;color:#667085">Payroll · Ажлын цагийн тооцоо</div></div>
      ${canEdit()||state.me.role==='hr'?`<button class="btn" onclick="openPayrollForm()">+ Тооцоо нэмэх</button>`:""}
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <span style="font-size:13px;font-weight:600">Сар:</span>
      <select class="input" style="width:80px;padding:5px 8px;font-size:13px" onchange="window._prYear=parseInt(this.value);prLoad()">
        ${[2024,2025,2026,2027].map(y=>`<option ${y===selYear?'selected':''}>${y}</option>`).join("")}
      </select>
      <select class="input" style="width:80px;padding:5px 8px;font-size:13px" onchange="window._prMonth=parseInt(this.value);prLoad()">
        ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===selMonth?'selected':''}>${i+1}-р сар</option>`).join("")}
      </select>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">
      ${statCard("Нийт үндсэн цалин", fmt(totalBase)+"₮", "#2563eb")}
      ${statCard("Нийт олгох цалин", fmt(totalNet)+"₮", "#16a34a")}
      ${statCard("Тооцосон ажилтан", rows.length+" хүн", "#7c3aed")}
    </div>
    <div class="panel">
      <div style="padding:12px 16px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">${selYear} оны ${selMonth}-р сарын цалин</div>
      <div class="table-wrap">
        ${table(
          ["#","Ажилтан","Хэлтэс","Ажилласан өдөр","Илүү цаг","Чөлөөт өдөр","Хожим ирсэн","Үндсэн цалин","Илүү цагийн нэмэгдэл","Хасалт","Урамшуулал","Олгох цалин","Статус",""],
          rows.map((r,i)=>[
            i+1,
            escapeHtml(r.full_name||"—"),
            escapeHtml(r.department||"—"),
            r.work_days, r.overtime_hours, r.absent_days, r.late_times,
            fmt(r.base_salary)+"₮",
            fmt(r.overtime_pay)+"₮",
            `<span style="color:#dc2626">${fmt(r.deductions)}₮</span>`,
            `<span style="color:#16a34a">${fmt(r.bonuses)}₮</span>`,
            `<b>${fmt(r.net_salary)}₮</b>`,
            `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${r.status==='Олгосон'?'#dcfce7':r.status==='Батлагдсан'?'#dbeafe':'#fef9c3'};color:${r.status==='Олгосон'?'#16a34a':r.status==='Батлагдсан'?'#2563eb':'#ca8a04'}">${r.status}</span>`,
            canEdit()||state.me.role==='hr'?`<button class="btn secondary sm" onclick="editPayroll(${r.id})">✏️</button>
              ${canEdit()?`<button class="btn secondary sm" style="color:#dc2626" onclick="delPayroll(${r.id})">🗑</button>`:""}`:""
          ])
        )}
      </div>
    </div>

    <div id="payrollModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:14px;padding:28px;width:580px;max-height:90vh;overflow:auto">
        <div style="font-size:16px;font-weight:800;margin-bottom:18px">👷 Цалин тооцоо</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Ажилтан *</div>
            <select class="input" id="pr_user">
              <option value="">— Сонгох —</option>
              ${users.map(u=>`<option value="${u.id}">${escapeHtml(u.full_name)}</option>`).join("")}
            </select></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Жил *</div><input class="input" id="pr_year" type="number" value="${selYear}"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Сар *</div><input class="input" id="pr_month" type="number" value="${selMonth}" min="1" max="12"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Ажилласан өдөр</div><input class="input" id="pr_wdays" type="number" placeholder="22"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Илүү цаг</div><input class="input" id="pr_ot" type="number" placeholder="0"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Чөлөөт өдөр</div><input class="input" id="pr_absent" type="number" placeholder="0"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Хожим ирсэн</div><input class="input" id="pr_late" type="number" placeholder="0"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px">
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Үндсэн цалин ₮</div><input class="input" id="pr_base" type="number" placeholder="0" oninput="calcNet()"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Илүү цагийн нэмэгдэл</div><input class="input" id="pr_otpay" type="number" placeholder="0" oninput="calcNet()"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Хасалт ₮</div><input class="input" id="pr_deduct" type="number" placeholder="0" oninput="calcNet()"></div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Урамшуулал ₮</div><input class="input" id="pr_bonus" type="number" placeholder="0" oninput="calcNet()"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:11px;color:#16a34a;margin-bottom:4px">ОЛГОХ ЦАЛИН</div>
            <div style="font-size:24px;font-weight:800;color:#16a34a" id="pr_net_display">0₮</div>
            <input type="hidden" id="pr_net">
          </div>
          <div><div style="font-size:11px;color:#667085;margin-bottom:4px">Статус</div>
            <select class="input" id="pr_status">
              <option>Тооцсон</option><option>Батлагдсан</option><option>Олгосон</option>
            </select>
            <div style="margin-top:8px"><div style="font-size:11px;color:#667085;margin-bottom:4px">Тэмдэглэл</div><input class="input" id="pr_note" placeholder="..."></div>
          </div>
        </div>
        <input type="hidden" id="pr_id">
        <div style="display:flex;gap:10px">
          <button class="btn" onclick="savePayroll()">Хадгалах</button>
          <button class="btn secondary" onclick="document.getElementById('payrollModal').style.display='none'">Цуцлах</button>
        </div>
      </div>
    </div>`;

    window._prYear  = selYear;
    window._prMonth = selMonth;
    window.prLoad   = () => { selYear=window._prYear; selMonth=window._prMonth; load(); };
    window.calcNet  = () => {
      const base   = Number(document.getElementById("pr_base")?.value||0);
      const otpay  = Number(document.getElementById("pr_otpay")?.value||0);
      const deduct = Number(document.getElementById("pr_deduct")?.value||0);
      const bonus  = Number(document.getElementById("pr_bonus")?.value||0);
      const net    = base + otpay + bonus - deduct;
      const d = document.getElementById("pr_net_display");
      const h = document.getElementById("pr_net");
      if (d) d.textContent = fmt(net)+"₮";
      if (h) h.value = net;
    };
    window.openPayrollForm = () => {
      ["pr_id","pr_wdays","pr_ot","pr_absent","pr_late","pr_base","pr_otpay","pr_deduct","pr_bonus","pr_note"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
      document.getElementById("pr_user").value   = "";
      document.getElementById("pr_year").value   = selYear;
      document.getElementById("pr_month").value  = selMonth;
      document.getElementById("pr_status").value = "Тооцсон";
      document.getElementById("pr_net_display").textContent = "0₮";
      document.getElementById("pr_net").value = "0";
      document.getElementById("payrollModal").style.display = "flex";
    };
    window.editPayroll = (id) => {
      const r = rows.find(x=>x.id===id); if (!r) return;
      document.getElementById("pr_id").value     = r.id;
      document.getElementById("pr_user").value   = r.user_id||"";
      document.getElementById("pr_year").value   = r.year||"";
      document.getElementById("pr_month").value  = r.month||"";
      document.getElementById("pr_wdays").value  = r.work_days||"";
      document.getElementById("pr_ot").value     = r.overtime_hours||"";
      document.getElementById("pr_absent").value = r.absent_days||"";
      document.getElementById("pr_late").value   = r.late_times||"";
      document.getElementById("pr_base").value   = r.base_salary||"";
      document.getElementById("pr_otpay").value  = r.overtime_pay||"";
      document.getElementById("pr_deduct").value = r.deductions||"";
      document.getElementById("pr_bonus").value  = r.bonuses||"";
      document.getElementById("pr_net").value    = r.net_salary||"";
      document.getElementById("pr_net_display").textContent = fmt(r.net_salary)+"₮";
      document.getElementById("pr_status").value = r.status||"Тооцсон";
      document.getElementById("pr_note").value   = r.note||"";
      document.getElementById("payrollModal").style.display = "flex";
    };
    window.savePayroll = async () => {
      const id = document.getElementById("pr_id").value;
      const body = {
        user_id:        document.getElementById("pr_user").value,
        year:           document.getElementById("pr_year").value,
        month:          document.getElementById("pr_month").value,
        work_days:      document.getElementById("pr_wdays").value,
        overtime_hours: document.getElementById("pr_ot").value,
        absent_days:    document.getElementById("pr_absent").value,
        late_times:     document.getElementById("pr_late").value,
        base_salary:    document.getElementById("pr_base").value,
        overtime_pay:   document.getElementById("pr_otpay").value,
        deductions:     document.getElementById("pr_deduct").value,
        bonuses:        document.getElementById("pr_bonus").value,
        net_salary:     document.getElementById("pr_net").value,
        status:         document.getElementById("pr_status").value,
        note:           document.getElementById("pr_note").value
      };
      if (!body.user_id || !body.year || !body.month) { toast("Ажилтан болон огноог сонгоно уу"); return; }
      try {
        await api("/api/payroll", { method:"POST", body:JSON.stringify(body) });
        toast("Хадгалагдлаа"); document.getElementById("payrollModal").style.display = "none"; load();
      } catch(e) { toast(e.message); }
    };
    window.delPayroll = async (id) => {
      if (!confirm("Устгах уу?")) return;
      try { await api(`/api/payroll/${id}`, { method:"DELETE" }); toast("Устгагдлаа"); load(); }
      catch(e) { toast(e.message); }
    };
  }
  load();
}

// ── 7. Санхүүгийн тайлан ────────────────────────────────────

async function fin_reports() {
  let cashRows=[], payRows=[], recvRows=[], payrollRows=[];
  const now = new Date();
  let yr = now.getFullYear(), mo = now.getMonth()+1;

  async function load() {
    try {
      [cashRows, payRows, recvRows, payrollRows] = await Promise.all([
        api("/api/cash-journal"),
        api("/api/payables"),
        api("/api/receivables"),
        api(`/api/payroll?year=${yr}&month=${mo}`)
      ]);
    } catch(e) {}
    render();
  }

  function render() {
    const cashIn  = cashRows.filter(r=>r.txn_type==="Орлого").reduce((s,r)=>s+Number(r.amount),0);
    const cashOut = cashRows.filter(r=>r.txn_type==="Зарлага").reduce((s,r)=>s+Number(r.amount),0);
    const payTotal   = payRows.reduce((s,r)=>s+Number(r.amount),0);
    const payPaid    = payRows.reduce((s,r)=>s+Number(r.paid_amount),0);
    const recvTotal  = recvRows.reduce((s,r)=>s+Number(r.amount),0);
    const recvGot    = recvRows.reduce((s,r)=>s+Number(r.received_amount),0);
    const prNet      = payrollRows.reduce((s,r)=>s+Number(r.net_salary),0);

    main.innerHTML = `
    <div style="margin-bottom:20px">
      <h1 style="margin:0 0 4px">📑 Санхүүгийн тайлан</h1>
      <div style="font-size:12px;color:#667085">Financial Reports · Нэгтгэсэн санхүүгийн тойм</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <div class="panel">
        <div style="padding:14px 18px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">💵 Мөнгөн гүйлгээний тойм</div>
        <div style="padding:16px 18px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#667085">Нийт орлого</td><td style="text-align:right;font-weight:700;color:#16a34a">${fmt(cashIn)}₮</td></tr>
            <tr><td style="padding:6px 0;color:#667085">Нийт зарлага</td><td style="text-align:right;font-weight:700;color:#dc2626">${fmt(cashOut)}₮</td></tr>
            <tr style="border-top:2px solid #e2e6ed"><td style="padding:8px 0;font-weight:800">Цэвэр дүн</td><td style="text-align:right;font-weight:800;font-size:18px;color:${cashIn>=cashOut?'#2563eb':'#dc2626'}">${fmt(cashIn-cashOut)}₮</td></tr>
          </table>
        </div>
      </div>
      <div class="panel">
        <div style="padding:14px 18px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">📊 Өглөг / Авлагын тойм</div>
        <div style="padding:16px 18px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#667085">Нийт өглөг</td><td style="text-align:right;font-weight:700;color:#d97706">${fmt(payTotal)}₮</td></tr>
            <tr><td style="padding:6px 0;color:#667085">Төлсөн</td><td style="text-align:right;font-weight:700;color:#16a34a">${fmt(payPaid)}₮</td></tr>
            <tr><td style="padding:6px 0;color:#667085">Нийт авлага</td><td style="text-align:right;font-weight:700;color:#7c3aed">${fmt(recvTotal)}₮</td></tr>
            <tr><td style="padding:6px 0;color:#667085">Авсан</td><td style="text-align:right;font-weight:700;color:#16a34a">${fmt(recvGot)}₮</td></tr>
          </table>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:20px">
      <div style="padding:14px 18px;border-bottom:1px solid #e2e6ed;font-weight:700;font-size:14px">
        👷 Цалингийн тойм —
        <select style="font-size:13px;border:1px solid #e2e6ed;border-radius:6px;padding:2px 8px;margin-left:6px" onchange="window._frYear=this.value;frLoad()">
          ${[2024,2025,2026,2027].map(y=>`<option ${y==yr?'selected':''}>${y}</option>`).join("")}
        </select>
        <select style="font-size:13px;border:1px solid #e2e6ed;border-radius:6px;padding:2px 8px;margin-left:4px" onchange="window._frMonth=this.value;frLoad()">
          ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===mo?'selected':''}>${i+1}-р сар</option>`).join("")}
        </select>
      </div>
      <div style="padding:16px 18px">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
          ${statCard("Нийт олгох цалин", fmt(prNet)+"₮", "#0891b2")}
          ${statCard("Тооцосон ажилтан", payrollRows.length+" хүн", "#7c3aed")}
          ${statCard("Олгосон", payrollRows.filter(r=>r.status==='Олгосон').length+" хүн", "#16a34a")}
        </div>
      </div>
    </div>`;

    window._frYear  = yr;
    window._frMonth = mo;
    window.frLoad = () => { yr=Number(window._frYear); mo=Number(window._frMonth); load(); };
  }
  load();
}

// ── Excel import modal (shared) ──────────────────────────────

function openImportModal(tbl) {
  const labels = {
    cash_journal:        ["txn_date:Огноо","doc_no:Журнал №","counterparty:Байгуулллага","description:Гүйлгээний утга","orlogo_amount:Орлого дүн","zarlaga_amount:Зарлага дүн"],
    accounts_payable:    ["vendor_name:Нийлүүлэгч","invoice_no:Нэхэмжлэлийн №","invoice_date:Огноо","due_date:Дуусах огноо","amount:Дүн"],
    accounts_receivable: ["debtor_name:Өртэй тал","invoice_no:Нэхэмжлэлийн №","invoice_date:Огноо","due_date:Дуусах огноо","amount:Дүн"]
  };
  const fields = labels[tbl]||[];
  const existing = document.getElementById("importModal");
  if (existing) existing.remove();
  const div = document.createElement("div");
  div.id = "importModal";
  div.style = "position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:2000;display:flex;align-items:center;justify-content:center";
  div.innerHTML = `<div style="background:#fff;border-radius:14px;padding:28px;width:600px;max-height:90vh;overflow:auto">
    <div style="font-size:16px;font-weight:800;margin-bottom:16px">📥 Excel Import</div>
    <div style="font-size:13px;color:#667085;margin-bottom:14px">Excel файл (.xlsx/.xls) оруулж баганы харгалзааг тохируулна уу. Эхний мөр толгой байх ёстой.</div>
    <input type="file" id="impFile" accept=".xlsx,.xls" style="margin-bottom:12px" onchange="parseImport('${tbl}')">
    <div id="impPreview"></div>
    <div id="impMapping" style="display:none;margin-top:14px">
      <div style="font-size:13px;font-weight:700;margin-bottom:10px">Баганы харгалзаа:</div>
      ${fields.map(f=>{ const [k,label]=f.split(":"); return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="width:200px;font-size:13px;color:#374151">${label}</span>
        <select class="input" id="map_${k}" style="flex:1;padding:5px 8px;font-size:13px"><option value="">— Багана сонгох —</option></select>
      </div>`; }).join("")}
      <button class="btn" style="margin-top:12px" onclick="commitImport('${tbl}')">Оруулах</button>
    </div>
    <button class="btn secondary" style="margin-top:12px" onclick="document.getElementById('importModal').remove()">Хаах</button>
  </div>`;
  document.body.appendChild(div);
}

window.parseImport = async (tbl) => {
  const file = document.getElementById("impFile").files[0];
  if (!file) return;
  const fd = new FormData(); fd.append("file", file);
  try {
    const r = await fetch("/api/finance-import/parse", {
      method:"POST",
      headers:{ Authorization:"Bearer "+state.token },
      body: fd
    });
    const d = await r.json();
    if (!r.ok) { toast(d.error||"Алдаа"); return; }
    window._impData = d;
    const prev = d.data.slice(0,5);
    document.getElementById("impPreview").innerHTML = `
      <div style="font-size:12px;color:#667085;margin-bottom:8px">Нийт ${d.total} мөр олдлоо. Урьдчилан харах (5 мөр):</div>
      <div class="table-wrap" style="max-height:160px;overflow:auto">${table(d.headers, prev)}</div>`;
    document.getElementById("impMapping").style.display = "block";
    const fields = ["txn_date","doc_no","txn_type","description","amount",
                    "vendor_name","invoice_no","invoice_date","due_date",
                    "debtor_name","received_amount"];
    fields.forEach(f => {
      const sel = document.getElementById("map_"+f); if (!sel) return;
      sel.innerHTML = `<option value="">— Багана сонгох —</option>`+
        d.headers.map((h,i)=>`<option value="${i}">${h}</option>`).join("");
      const auto = d.headers.findIndex(h=>h.toLowerCase().includes(f.toLowerCase().replace("_","")));
      if (auto>=0) sel.value = auto;
    });
  } catch(e) { toast("Файл уншихад алдаа: "+e.message); }
};

window.commitImport = async (tbl) => {
  const data = window._impData;
  if (!data) { toast("Эхлээд файл оруулна уу"); return; }
  const fields = tbl==="cash_journal"    ? ["txn_date","doc_no","counterparty","description","orlogo_amount","zarlaga_amount"] :
                 tbl==="accounts_payable" ? ["vendor_name","invoice_no","invoice_date","due_date","amount"] :
                 ["debtor_name","invoice_no","invoice_date","due_date","amount"];
  const mapping = {};
  fields.forEach(f => {
    const sel = document.getElementById("map_"+f);
    if (sel && sel.value !== "") mapping[f] = Number(sel.value);
  });
  try {
    const r = await api("/api/finance-import/commit", {
      method:"POST",
      body: JSON.stringify({ table: tbl, mapping, rows: data.data })
    });
    toast(`${r.inserted} мөр амжилттай оруулав`);
    document.getElementById("importModal")?.remove();
    if (tbl==="cash_journal") cash_journal();
    else if (tbl==="accounts_payable") payables();
    else if (tbl==="accounts_receivable") receivables();
  } catch(e) { toast(e.message); }
};

// ── Smart Import (auto-detect) ───────────────────────────────

function openSmartImport() {
  const existing = document.getElementById("smartImportModal");
  if (existing) existing.remove();
  const div = document.createElement("div");
  div.id = "smartImportModal";
  div.style = "position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:2000;display:flex;align-items:center;justify-content:center";
  div.innerHTML = `
  <div style="background:#fff;border-radius:14px;padding:28px;width:640px;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="font-size:16px;font-weight:800">🧠 Smart Import</div>
      <button class="btn secondary sm" onclick="document.getElementById('smartImportModal').remove()">✕ Хаах</button>
    </div>
    <div style="font-size:13px;color:#667085;margin-bottom:16px">
      Нягтлангийн програмаас гаргасан Excel файл оруулна уу — төрлийг автоматаар таних болно.<br>
      <span style="font-size:12px">Дэмжигдэх: Мөнгөн хөрөнгийн журнал · Үндсэн хөрөнгө · Няравын тайлан · Авлага · Өглөг</span>
    </div>
    <div style="background:#f8fafc;border:2px dashed #e2e6ed;border-radius:10px;padding:24px;text-align:center;margin-bottom:16px">
      <input type="file" id="siFile" accept=".xlsx,.xls" style="display:none" onchange="siParseFile()">
      <div style="font-size:36px;margin-bottom:8px">📂</div>
      <button class="btn secondary" onclick="document.getElementById('siFile').click()">Excel файл сонгох (.xlsx / .xls)</button>
    </div>
    <div id="siStatus" style="display:none;margin-bottom:14px"></div>
    <div id="siPreview" style="display:none;margin-bottom:14px"></div>
    <div id="siCommitArea" style="display:none">
      <button class="btn" id="siCommitBtn" onclick="siCommit()">✓ Оруулах</button>
    </div>
  </div>`;
  document.body.appendChild(div);
}

window.siParseFile = async () => {
  const file = document.getElementById("siFile")?.files[0];
  if (!file) return;
  const status = document.getElementById("siStatus");
  status.style.display = "block";
  status.innerHTML = `<div style="color:#667085;font-size:13px">⏳ Уншиж байна...</div>`;
  document.getElementById("siPreview").style.display = "none";
  document.getElementById("siCommitArea").style.display = "none";
  window._siData = null;
  const fd = new FormData(); fd.append("file", file);
  try {
    const r = await fetch("/api/smart-import/parse", {
      method: "POST",
      headers: { Authorization: "Bearer " + state.token },
      body: fd
    });
    const d = await r.json();
    if (!r.ok) {
      status.innerHTML = `<div style="color:#dc2626;font-size:13px;padding:10px 14px;background:#fee2e2;border-radius:8px">
        ❌ ${d.error || "Алдаа"}<br>
        ${d.hint ? `<small style="color:#94a3b8">Эхний нүд: "${d.hint}"</small>` : ""}
      </div>`;
      return;
    }
    window._siData = d;
    const typeLabels = {
      cash_journal:   "📋 Мөнгөн хөрөнгийн журнал",
      fixed_assets:   "🏢 Үндсэн хөрөнгийн тайлан",
      material_trans: "📦 Няравын материалын тайлан",
      receivable:     "↑ Авлагын тайлан (BillPage)",
      payable:        "↓ Өглөгийн тайлан (BillPage)"
    };
    status.innerHTML = `<div style="padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:13px">
      ✅ Таньсан: <b>${typeLabels[d.type] || d.type}</b> — нийт <b>${d.total}</b> мөр
    </div>`;
    const cols = Object.keys(d.preview[0] || {});
    const prev = document.getElementById("siPreview");
    prev.style.display = "block";
    prev.innerHTML = `<div style="font-size:12px;color:#667085;margin-bottom:6px">Урьдчилан харах (${d.preview.length} мөр):</div>
      <div class="table-wrap" style="max-height:220px;overflow:auto">${table(cols, d.preview.map(row => cols.map(c => row[c] || "")))}</div>`;
    document.getElementById("siCommitArea").style.display = "block";
    document.getElementById("siCommitBtn").textContent = `✓ ${d.total} мөр оруулах`;
  } catch(e) {
    status.innerHTML = `<div style="color:#dc2626;font-size:13px">Алдаа: ${e.message}</div>`;
  }
};

window.siCommit = async () => {
  const d = window._siData;
  if (!d) return;
  const btn = document.getElementById("siCommitBtn");
  btn.disabled = true; btn.textContent = "Оруулж байна...";
  try {
    const r = await api("/api/smart-import/commit", {
      method: "POST",
      body: JSON.stringify({ type: d.type, data: d.data })
    });
    const msg = `✅ ${r.inserted} мөр нэмэгдсэн` +
      (r.skipped ? `, ${r.skipped} шинэчлэгдсэн` : "") +
      (r.errors?.length ? ` (${r.errors.length} алдаа)` : "");
    toast(msg);
    document.getElementById("smartImportModal")?.remove();
    const reloads = {
      cash_journal: cash_journal, fixed_assets: fixed_ledger,
      receivable: receivables,    payable: payables
    };
    const reload = reloads[d.type];
    if (reload) reload();
    else if (d.type === "material_trans" && window.nyarav_stock) window.nyarav_stock();
  } catch(e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = "✓ Оруулах";
  }
};

Object.assign(window, {
  fin_dashboard, cash_journal, payables, receivables,
  fixed_ledger, payroll, fin_reports, openImportModal, openSmartImport
});

