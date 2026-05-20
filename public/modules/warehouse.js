import { state, api, toast, table, escapeHtml, today } from './common.js';

async function materials() {
  const rows = await api("/api/materials");
  const canEdit = ["director","chief_engineer","storekeeper"].includes(state.me.role);

  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <div>
      <h1 style="margin:0 0 4px">📦 Агуулах / Материал</h1>
      <div style="font-size:12px;color:#667085">Сэлбэг хэрэгсэл · Материалын бүртгэл · Үлдэгдлийн хяналт</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">
    <div style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;padding:14px 16px;border-top:3px solid #2563eb">
      <div style="font-size:11px;color:#667085;margin-bottom:4px">НИЙТ МАТЕРИАЛ</div>
      <div style="font-size:26px;font-weight:800;color:#2563eb">${rows.length}</div>
    </div>
    <div style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;padding:14px 16px;border-top:3px solid #dc2626">
      <div style="font-size:11px;color:#667085;margin-bottom:4px">БАГА ҮЛДЭГДЭЛ</div>
      <div style="font-size:26px;font-weight:800;color:#dc2626">${rows.filter(r=>Number(r.balance)<=Number(r.warning_level)).length}</div>
    </div>
    <div style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;padding:14px 16px;border-top:3px solid #16a34a">
      <div style="font-size:11px;color:#667085;margin-bottom:4px">НИЙТ ДҮН</div>
      <div style="font-size:20px;font-weight:800;color:#16a34a">${rows.reduce((s,r)=>s+Number(r.price||0)*Number(r.balance||0),0).toLocaleString()}₮</div>
    </div>
    <div style="background:#fff;border:1px solid #e2e6ed;border-radius:12px;padding:14px 16px;border-top:3px solid #d97706">
      <div style="font-size:11px;color:#667085;margin-bottom:4px">ХЭВИЙН ҮЛДЭГДЭЛ</div>
      <div style="font-size:26px;font-weight:800;color:#d97706">${rows.filter(r=>Number(r.balance)>Number(r.warning_level)).length}</div>
    </div>
  </div>

  ${canEdit ? `
  <div class="panel" style="margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e2e6ed">
      <span style="font-size:14px;font-weight:700">+ Материал бүртгэх</span>
    </div>
    <div style="padding:16px 18px">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Материалын нэр *</div>
          <input class="input" id="mname" placeholder="Гэрлийн толгой 150W, Цахилгааны кабель СИП 4x25...">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Хэмжих нэгж</div>
          <select class="input" id="munit">
            <option value="">— Сонгох —</option>
            <option>ширхэг</option><option>метр</option><option>кг</option>
            <option>литр</option><option>хайрцаг</option><option>дугтуй</option><option>компл</option>
          </select>
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Нэгж үнэ ₮</div>
          <input class="input" id="mprice" type="number" value="0" placeholder="0">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:12px;margin-bottom:14px">
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Одоогийн үлдэгдэл</div>
          <input class="input" id="mbalance" type="number" value="0" placeholder="0">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">⚠️ Анхааруулах үлдэгдэл</div>
          <input class="input" id="mwarn" type="number" value="5" placeholder="5">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Тайлбар</div>
          <input class="input" id="mnote" placeholder="Хэрэглэх зориулалт, тэмдэглэл...">
        </div>
      </div>
      <button class="btn" onclick="saveMaterial()">Хадгалах</button>
    </div>
  </div>` : ""}

  <div class="panel">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e2e6ed">
      <span style="font-size:14px;font-weight:700">Материалын бүртгэл</span>
      <input placeholder="🔍 Хайх..." oninput="filterTable(this.value,'matTable')"
        style="padding:6px 12px;border:1px solid #e2e6ed;border-radius:8px;font-size:12px;width:180px;outline:none">
    </div>
    <div class="tbl-wrap">
      <table id="matTable">
        <thead><tr>
          <th>#</th><th>Нэр</th><th>Үлдэгдэл</th><th>Нэгж</th>
          <th>Анхааруулга</th><th>Нэгж үнэ</th><th>Нийт дүн</th><th>Тайлбар</th><th>Төлөв</th>
          ${canEdit ? `<th></th>` : ""}
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map((r,i) => {
            const isBad = Number(r.balance) <= Number(r.warning_level);
            const total = Number(r.price||0) * Number(r.balance||0);
            return `<tr style="${isBad?'background:#fff5f5':''}">
              <td style="color:#94a3b8;font-size:11px">${i+1}</td>
              <td style="font-weight:600">${escapeHtml(r.item_name)}</td>
              <td style="font-family:monospace;font-weight:700;color:${isBad?"#dc2626":"#172033"};font-size:14px">${Number(r.balance).toLocaleString()}</td>
              <td style="color:#667085">${escapeHtml(r.unit||"—")}</td>
              <td style="font-family:monospace;color:#d97706">${Number(r.warning_level).toLocaleString()}</td>
              <td style="font-family:monospace">${Number(r.price||0).toLocaleString()}₮</td>
              <td style="font-family:monospace;font-weight:600;color:#16a34a">${total.toLocaleString()}₮</td>
              <td style="font-size:12px;color:#667085">${escapeHtml(r.note||"—")}</td>
              <td>${isBad
                ? `<span class="pill bad">⚠ Бага үлдэгдэл</span>`
                : `<span class="pill ok">Хэвийн</span>`}
              </td>
              ${canEdit ? `<td style="white-space:nowrap">
                <button class="btn secondary sm" style="color:#dc2626" onclick="deleteMaterial(${r.id},'${escapeHtml(r.item_name).replace(/'/g,"\\'")}')">🗑</button>
              </td>` : ""}
            </tr>`;
          }).join("") : `<tr><td colspan="${canEdit?10:9}" style="text-align:center;color:#667085;padding:24px">Материал бүртгэгдээгүй байна</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

async function deleteMaterial(id, name) {
  if (!confirm(`"${name}" материалыг устгах уу?\nЭнэ үйлдлийг буцааж болохгүй!`)) return;
  try {
    await api(`/api/materials/${id}`, { method: "DELETE" });
    toast("Материал устгагдлаа");
    materials();
  } catch(e) { toast("Алдаа: " + e.message); }
}

async function saveMaterial() {
  const name = document.getElementById("mname")?.value?.trim();
  if (!name) { toast("Материалын нэр оруулна уу"); return; }
  const g = id => document.getElementById(id)?.value || "";
  try {
    await api("/api/materials", {
      method: "POST",
      body: JSON.stringify({
        item_name:     name,
        unit:          g("munit"),
        balance:       Number(g("mbalance")||0),
        warning_level: Number(g("mwarn")||0),
        price:         Number(g("mprice")||0),
        note:          g("mnote")
      })
    });
    toast("Материал хадгаллаа ✓");
    materials();
  } catch(err) { toast("Алдаа: "+err.message); }
}

async function expenses() {
  const rows = await api("/api/expenses");

  main.innerHTML = `
  <h1>Зардал</h1>

  <div class="panel">
    <h2>Шинэ зардал</h2>

    <div class="row3">
      <input class="input" id="ecat" placeholder="Төрөл">
      <input class="input" id="eamount" type="number" placeholder="Дүн">
      <input class="input" id="edate" type="date" value="${today()}">
    </div>

    <textarea class="input" id="edesc" placeholder="Тайлбар"></textarea>

    <button class="btn" onclick="saveExpense()">Хадгалах</button>
  </div>

  <div class="panel">
    <h2>Зардлын бүртгэл</h2>

    ${table(
      ["Огноо","Төрөл","Тайлбар","Дүн"],
      rows.map(r => [
        r.expense_date,
        r.type || r.category,
        r.note || r.description,
        Number(r.amount).toLocaleString() + "₮"
      ])
    )}
  </div>`;
}

async function saveExpense() {
  await api("/api/expenses", {
    method: "POST",
    body: JSON.stringify({
      type: ecat.value,
      amount: Number(eamount.value || 0),
      expense_date: edate.value,
      note: edesc.value
    })
  });

  toast("Зардал хадгаллаа");
  expenses();
}

function filterTable(val, tableId) {
  const v = val.toLowerCase();
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(v) ? "" : "none";
  });
}

Object.assign(window, { materials, saveMaterial, deleteMaterial, expenses, saveExpense, filterTable });
