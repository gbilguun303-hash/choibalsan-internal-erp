import { state, api, toast, escapeHtml, today, API } from './common.js';

const SL_CATS = ["Авто замын гэрэл","Гэр хорооллын гэрэл","Цамхагийн гэрэл","Гэрлэн дохио","Шит/Самбар"];

const ASSET_CATEGORIES = [
  { id:"Авто замын гэрэл",     icon:"💡", color:"#f59e0b", bg:"#fffbeb", border:"#fde68a" },
  { id:"Гэр хорооллын гэрэл", icon:"🏘️", color:"#0ea5e9", bg:"#f0f9ff", border:"#bae6fd" },
  { id:"Цамхагийн гэрэл",     icon:"🗼", color:"#d97706", bg:"#fff7ed", border:"#fed7aa" },
  { id:"Камер",                icon:"🎥", color:"#3b82f6", bg:"#eff6ff", border:"#bfdbfe" },
  { id:"Шилэн кабель",         icon:"🧵", color:"#8b5cf6", bg:"#f5f3ff", border:"#ddd6fe" },
  { id:"Шит/Самбар",           icon:"⚡", color:"#ef4444", bg:"#fef2f2", border:"#fecaca" },
  { id:"Гэрлэн дохио",         icon:"🚦", color:"#10b981", bg:"#f0fdf4", border:"#bbf7d0" },
  { id:"Техник",               icon:"🚗", color:"#6366f1", bg:"#eef2ff", border:"#c7d2fe" },
  { id:"Барилга",              icon:"🏢", color:"#64748b", bg:"#f8fafc", border:"#e2e8f0" },
  { id:"Бусад",                icon:"📦", color:"#94a3b8", bg:"#f8fafc", border:"#e2e8f0" },
];

const ASSET_CONDITIONS = ["Хэвийн","Засвар хэрэгтэй","Хугацаа дууссан","Ашиглалтаас гарсан"];
const ASSET_STATUSES   = ["Идэвхтэй","Идэвхгүй","Засварт","Нөөцөд"];

const GER_CAT_MAP = {
  "Гэр хорооллын гэрэл": "Гэр хороолол",
  "Цамхагийн гэрэл":     "Цамхаг",
};

function gerSummaryBar(cat, rows, faultMap) {
  const totalCount  = rows.reduce((s,r) => s + (r.total_count||0), 0);
  const totalBroken = faultMap
    ? rows.reduce((s,r) => { const f = faultMap.get(r.id); return s + (f ? f.broken_count : 0); }, 0)
    : rows.reduce((s,r) => s + (r.last_broken||0), 0);
  const asaltPct   = totalCount > 0 ? ((totalCount - totalBroken) / totalCount * 100).toFixed(1) : "100.0";
  const asaltColor = parseFloat(asaltPct) >= 90 ? "#16a34a" : parseFloat(asaltPct) >= 70 ? "#d97706" : "#dc2626";
  const asaltBg    = parseFloat(asaltPct) >= 90 ? "#f0fdf4" : parseFloat(asaltPct) >= 70 ? "#fff7ed" : "#fef2f2";

  const asaltBox = `
    <div style="background:${asaltBg};border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:${asaltColor}">${asaltPct}%</div>
      <div style="font-size:11px;color:#64748b">Асалтын хувь</div>
      ${totalBroken > 0 ? `<div style="font-size:10px;font-weight:700;color:#dc2626">${totalBroken} гэмтэл</div>` : `<div style="font-size:10px;color:#94a3b8">гэмтэлгүй</div>`}
    </div>`;

  if (cat === "Цамхагийн гэрэл") {
    return `<div style="display:flex;gap:12px;padding:12px 18px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap">
      <div style="background:#f0f9ff;border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
        <div style="font-size:20px;font-weight:800;color:#0ea5e9">${rows.length}</div>
        <div style="font-size:11px;color:#64748b">Нийт шон</div>
      </div>
      <div style="background:#fff7ed;border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
        <div style="font-size:20px;font-weight:800;color:#d97706">${totalCount}</div>
        <div style="font-size:11px;color:#64748b">Нийт толгой</div>
      </div>
      ${asaltBox}
    </div>`;
  }
  return `<div style="display:flex;gap:12px;padding:12px 18px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap">
    <div style="background:#f0f9ff;border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:#0ea5e9">${rows.length}</div>
      <div style="font-size:11px;color:#64748b">Нийт байршил</div>
    </div>
    <div style="background:#eff6ff;border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:#2563eb">${totalCount}</div>
      <div style="font-size:11px;color:#64748b">Нийт шон</div>
    </div>
    ${asaltBox}
  </div>`;
}

function slStatusLabel(status) {
  if (!status) return "—";
  if (status === "active" || status === "Идэвхтэй") return "Идэвхтэй";
  if (status === "inactive" || status === "Идэвхгүй") return "Идэвхгүй";
  return status;
}
function slIsActive(r) {
  return r.status === "active" || r.status === "Идэвхтэй";
}

function slSummaryBar(rows, faultMap) {
  const totalPoles  = rows.reduce((s,r) => s + (r.lamp_count||0), 0);
  const totalHeads  = rows.reduce((s,r) => s + (r.total_heads > 0 ? r.total_heads : (r.lamp_count||0)), 0);
  const needsPoles  = rows.reduce((s,r) => s + (r.needs_poles||0), 0);
  const activeCount = rows.filter(slIsActive).length;
  const activePct   = rows.length > 0 ? ((activeCount / rows.length) * 100).toFixed(1) : "0.0";
  const totalBroken = faultMap ? rows.reduce((s,r) => { const ef = faultMap.get(r.id); return s + (ef ? ef.broken_count : 0); }, 0) : 0;
  const asaltPct    = totalHeads > 0 ? ((totalHeads - totalBroken) / totalHeads * 100).toFixed(1) : "100.0";
  const asaltColor  = parseFloat(asaltPct) >= 90 ? "#16a34a" : parseFloat(asaltPct) >= 70 ? "#d97706" : "#dc2626";
  const asaltBg     = parseFloat(asaltPct) >= 90 ? "#f0fdf4" : parseFloat(asaltPct) >= 70 ? "#fff7ed" : "#fef2f2";
  return `<div style="display:flex;gap:12px;padding:12px 18px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap">
    <div style="background:#fffbeb;border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:#f59e0b">${rows.length}</div>
      <div style="font-size:11px;color:#64748b">Нийт гудамж</div>
    </div>
    <div style="background:#eff6ff;border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:#2563eb">${totalPoles}</div>
      <div style="font-size:11px;color:#64748b">Нийт шон</div>
    </div>
    <div style="background:#f0f9ff;border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:#0ea5e9">${totalHeads}</div>
      <div style="font-size:11px;color:#64748b">Нийт толгой</div>
    </div>
    ${needsPoles > 0 ? `<div style="background:#fff7ed;border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:#d97706">${needsPoles}</div>
      <div style="font-size:11px;color:#64748b">Нөхөх шон</div>
    </div>` : ""}
    <div style="background:${asaltBg};border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:${asaltColor}">${asaltPct}%</div>
      <div style="font-size:11px;color:#64748b">Асалтын хувь</div>
      ${totalBroken > 0 ? `<div style="font-size:10px;font-weight:700;color:#dc2626">${totalBroken} гэмтэл</div>` : `<div style="font-size:10px;color:#94a3b8">гэмтэлгүй</div>`}
    </div>
    <div style="background:#f0fdf4;border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:#16a34a">${activeCount}</div>
      <div style="font-size:11px;color:#64748b">Идэвхтэй</div>
      <div style="font-size:11px;font-weight:700;color:#16a34a">${activePct}%</div>
    </div>
  </div>`;
}

function trafficSummaryBar(rows) {
  const total    = rows.length;
  const onCount  = rows.filter(r => isTrafficOn(r.status)).length;
  const offCount = total - onCount;
  const pct      = total > 0 ? (onCount / total * 100).toFixed(1) : "0.0";
  const pctColor = parseFloat(pct) >= 90 ? "#16a34a" : parseFloat(pct) >= 70 ? "#d97706" : "#dc2626";
  const pctBg    = parseFloat(pct) >= 90 ? "#f0fdf4" : parseFloat(pct) >= 70 ? "#fff7ed" : "#fef2f2";
  return `<div style="display:flex;gap:12px;padding:12px 18px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap">
    <div style="background:#f0fdf4;border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:#10b981">${total}</div>
      <div style="font-size:11px;color:#64748b">Нийт дохио</div>
    </div>
    <div style="background:#dcfce7;border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:#16a34a">${onCount}</div>
      <div style="font-size:11px;color:#64748b">Асаалтай 🟢</div>
    </div>
    <div style="background:#f1f5f9;border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:#475569">${offCount}</div>
      <div style="font-size:11px;color:#64748b">Унтраалтай ⚫</div>
    </div>
    <div style="background:${pctBg};border-radius:8px;padding:8px 16px;text-align:center;min-width:90px">
      <div style="font-size:20px;font-weight:800;color:${pctColor}">${pct}%</div>
      <div style="font-size:11px;color:#64748b">Асалтын хувь</div>
    </div>
  </div>`;
}

async function assets(filterCat) {
  const slMode = !!window._slAssetMode;
  window._slAssetMode = false;
  const canCreate = ["director","chief_engineer","storekeeper","camera_engineer"].includes(state.me.role) ||
                    (slMode && state.me.role === "engineer");
  const canDel    = ["director","chief_engineer"].includes(state.me.role);
  const cat = filterCat !== undefined ? filterCat : (window._assetCat || null);
  window._assetCat = cat;

  const isGerCat      = Object.hasOwn(GER_CAT_MAP, cat || "");
  const isSlPoints    = cat === "Авто замын гэрэл";
  const isTrafficLight = cat === "Гэрлэн дохио";
  const isSpecial      = isGerCat || isSlPoints;

  let _dynCats = [];
  try { _dynCats = await api("/api/asset-categories"); } catch(e) {}
  if (!_dynCats.length) _dynCats = ASSET_CATEGORIES.map(c => ({ name:c.id, icon:c.icon, color:c.color, bg:c.bg, border:c.border }));
  window._assetCatList = _dynCats;

  const [summary, gerInvAll, slPointsAll] = await Promise.all([
    api("/api/assets/summary/by-category"),
    api("/api/sl-ger-inventory").catch(() => []),
    api("/api/sl-points").catch(() => []),
  ]);

  const gerCountByName = {
    "Гэр хорооллын гэрэл": gerInvAll.filter(r=>r.category==="Гэр хороолол").length,
    "Цамхагийн гэрэл":     gerInvAll.filter(r=>r.category==="Цамхаг").length,
    "Авто замын гэрэл":     slPointsAll.filter(r=>(r.code||"").startsWith("ГТ-")).length,
  };

  let rows = [], gerRows = [], slRows = [], slFaultMap = new Map(), gerFaultMap = new Map();
  if (isGerCat) {
    gerRows = gerInvAll.filter(r => r.category === GER_CAT_MAP[cat]);
    const gerFaults = await api(`/api/sl-faults?category=${encodeURIComponent(cat)}`).catch(()=>[]);
    gerFaults.filter(f=>f.status!=="Дууссан").forEach(f => {
      if (f.location_id) gerFaultMap.set(f.location_id, f);
    });
  } else if (isSlPoints) {
    slRows = slPointsAll.filter(r => (r.code||"").startsWith("ГТ-"));
    const slFaults = await api("/api/sl-faults?category=Авто замын гэрэл").catch(()=>[]);
    slFaults.filter(f=>f.status!=="Дууссан").forEach(f => {
      if (f.location_id) slFaultMap.set(f.location_id, f);
    });
  } else {
    rows = await api("/api/assets" + (cat ? `?category=${encodeURIComponent(cat)}` : ""));
  }

  const allFlags = await api("/api/asset-flags").catch(() => []);
  const flagMap = new Map(allFlags.map(f => [`${f.table_name}_${f.record_id}`, f]));

  const visibleCats = slMode ? _dynCats.filter(c => SL_CATS.includes(c.name)) : _dynCats;

  main.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:12px">
    <div>
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;letter-spacing:-.02em">${slMode ? "💡 Гэрэлтүүлгийн объектийн бүртгэл" : "🏗 Объектийн бүртгэл"}</h1>
      <div style="font-size:12px;color:#667085">${slMode ? "Гэрэлтүүлэг · Дэд станц · Тоног төхөөрөмж" : "Asset Registry · Паспорт · Засварын түүх"}</div>
    </div>
    ${slMode ? `<button onclick="sl_dashboard()" class="btn secondary" style="font-size:12px;padding:6px 14px">← Гэрэлтүүлгийн төв</button>` : ""}
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;margin-bottom:20px">
    ${visibleCats.map(c => {
      const isGer = Object.hasOwn(GER_CAT_MAP, c.name) || Object.hasOwn(gerCountByName, c.name);
      const s = isGer
        ? { total: gerCountByName[c.name] || 0, needs_repair: 0 }
        : (summary.find(x=>x.category===c.name) || {total:0,needs_repair:0});
      const active = cat===c.name;
      const col  = c.color  || "#94a3b8";
      const bg   = c.bg     || "#f8fafc";
      const brd  = c.border || "#e2e8f0";
      const clickFn = slMode ? `slAssets(this.dataset.cat)` : `assets(this.dataset.cat)`;
      return `<div data-cat="${escapeHtml(c.name)}" onclick="${clickFn}" style="
        padding:12px 14px;border-radius:10px;cursor:pointer;transition:all .15s;
        background:${active?col:bg};color:${active?'#fff':col};
        border:2px solid ${active?col:brd};
      ">
        <div style="font-size:18px;margin-bottom:4px">${c.icon||'📦'}</div>
        <div style="font-size:12px;font-weight:700;opacity:${active?1:.85}">${escapeHtml(c.name)}</div>
        <div style="font-size:22px;font-weight:800;margin-top:2px">${s.total}</div>
        ${c.name==="Гэрлэн дохио" && s.total>0
          ? `<div style="font-size:10px;margin-top:2px;opacity:.9">🟢 ${Math.round((s.active||0)/s.total*100)}% асаалтай</div>`
          : s.needs_repair>0 ? `<div style="font-size:10px;margin-top:2px;opacity:.9">⚠ ${s.needs_repair} засвар</div>` : ""}
      </div>`;
    }).join("")}
  </div>

  <div id="assetFormModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:flex-start;justify-content:center;padding-top:30px;overflow-y:auto"
    onclick="if(event.target===this)closeAssetForm()">
    <div id="assetFormInner" style="background:#fff;border-radius:14px;width:min(700px,96vw);margin:0 auto 40px;box-shadow:0 20px 60px rgba(0,0,0,.25)"></div>
  </div>

  <div id="assetPassportModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:flex-start;justify-content:center;padding-top:30px;overflow-y:auto"
    onclick="if(event.target===this)closePassport()">
    <div id="assetPassportInner" style="background:#fff;border-radius:14px;width:min(780px,96vw);margin:0 auto 40px;box-shadow:0 20px 60px rgba(0,0,0,.25)"></div>
  </div>

  <div id="globalLightbox" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:3000;align-items:center;justify-content:center;flex-direction:column"
    onclick="if(event.target.id==='globalLightbox')closeLightbox()">
    <button onclick="closeLightbox()" style="position:fixed;top:14px;right:18px;background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:8px;padding:6px 16px;cursor:pointer;font-size:15px;z-index:1">✕</button>
    <button id="lbPrev" onclick="lightboxNav(-1)" style="display:none;position:fixed;left:14px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:50%;width:48px;height:48px;font-size:26px;cursor:pointer;z-index:1;line-height:1">‹</button>
    <img id="lbImg" style="max-width:92vw;max-height:88vh;object-fit:contain;border-radius:8px;box-shadow:0 8px 48px rgba(0,0,0,.6)">
    <div id="lbCaption" style="color:rgba(255,255,255,.6);font-size:12px;margin-top:12px;text-align:center"></div>
    <button id="lbNext" onclick="lightboxNav(1)" style="display:none;position:fixed;right:14px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:50%;width:48px;height:48px;font-size:26px;cursor:pointer;z-index:1;line-height:1">›</button>
  </div>

  <div id="slDetailModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1100;align-items:flex-start;justify-content:center;padding-top:24px;overflow-y:auto"
    onclick="if(event.target===this)closeSlDetail()">
    <div id="slDetailInner" style="background:#fff;border-radius:16px;width:min(820px,96vw);margin:0 auto 40px;box-shadow:0 24px 80px rgba(0,0,0,.3)"></div>
  </div>

  <div id="slDocReaderModal" style="display:none;position:fixed;inset:0;background:rgba(10,10,20,.92);z-index:1200;flex-direction:column;align-items:center">
    <div style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 20px;background:rgba(0,0,0,.4);border-bottom:1px solid rgba(255,255,255,.1);flex-shrink:0">
      <div id="slDocReaderTitle" style="color:#fff;font-size:13px;font-weight:700;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
      <div style="display:flex;align-items:center;gap:10px">
        <div id="slDocPageNav" style="display:none;align-items:center;gap:8px;color:#fff;font-size:12px">
          <button onclick="slDocPage(-1)" style="background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:14px">‹</button>
          <span id="slDocPageInfo" style="min-width:80px;text-align:center"></span>
          <button onclick="slDocPage(1)" style="background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:14px">›</button>
        </div>
        <a id="slDocDownloadLink" href="#" download style="background:rgba(255,255,255,.15);color:#fff;border-radius:6px;padding:5px 12px;font-size:11px;text-decoration:none;font-weight:600">⬇ Татах</a>
        <button onclick="closeSlDocReader()" style="background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:6px;padding:5px 14px;cursor:pointer;font-size:13px">✕ Хаах</button>
      </div>
    </div>
    <div id="slDocReaderBody" style="flex:1;overflow:auto;width:100%;display:flex;flex-direction:column;align-items:center;padding:20px 10px;gap:10px"></div>
  </div>

  <div id="gerFormModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:flex-start;justify-content:center;padding-top:30px;overflow-y:auto"
    onclick="if(event.target===this)closeGerForm()">
    <div id="gerFormInner" style="background:#fff;border-radius:14px;width:min(520px,96vw);margin:0 auto 40px;box-shadow:0 20px 60px rgba(0,0,0,.25)"></div>
  </div>

  <div id="slFormModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:flex-start;justify-content:center;padding-top:30px;overflow-y:auto"
    onclick="if(event.target===this)closeSlForm()">
    <div id="slFormInner" style="background:#fff;border-radius:14px;width:min(520px,96vw);margin:0 auto 40px;box-shadow:0 20px 60px rgba(0,0,0,.25)"></div>
  </div>

  <div id="assetFlagModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;align-items:center;justify-content:center"
    onclick="if(event.target===this)closeAssetFlagModal()">
    <div style="background:#fff;border-radius:14px;width:min(420px,94vw);padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:15px;font-weight:800;margin-bottom:6px">🚩 Буруу бүртгэл тэмдэглэх</div>
      <div id="afmTitle" style="font-size:12px;color:#667085;margin-bottom:14px"></div>
      <div style="font-size:11px;color:#374151;font-weight:600;margin-bottom:6px">Юу буруу бүртгэгдсэн? *</div>
      <textarea id="afmNote" rows="3" placeholder="Жишээ: Шонгийн тоо буруу — 9 биш 7 байх ёстой, байршил буруу..."
        style="width:100%;border:1px solid #e2e6ed;border-radius:8px;padding:8px 10px;font-size:13px;resize:vertical;outline:none;box-sizing:border-box"></textarea>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="saveAssetFlag()" class="btn" style="flex:1;background:#d97706;border-color:#d97706">🚩 Тэмдэглэх</button>
        <button onclick="closeAssetFlagModal()" class="btn secondary">Цуцлах</button>
      </div>
    </div>
  </div>

  <div class="panel">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e2e6ed">
      <div style="font-size:14px;font-weight:700">
        ${cat ? (_dynCats.find(c=>c.name===cat)?.icon || ASSET_CATEGORIES.find(c=>c.id===cat)?.icon || "📦") : "📦"}
        ${cat || "Объект"}
        <span style="font-size:12px;color:#667085;font-weight:400">(${isGerCat ? gerRows.length : isSlPoints ? slRows.length : rows.length})</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${canCreate ? `<button class="btn" style="padding:6px 14px;font-size:12px;white-space:nowrap"
          onclick="${isGerCat ? 'openGerForm()' : isSlPoints ? 'openSlForm()' : 'openAssetForm()'}">
          + ${escapeHtml(cat || 'Объект')} нэмэх
        </button>` : ""}
        <input placeholder="Хайх..." oninput="filterAssets(this.value)"
          style="padding:6px 12px;border:1px solid #e2e6ed;border-radius:8px;font-size:12px;width:180px;outline:none">
      </div>
    </div>
    ${isGerCat ? gerSummaryBar(cat, gerRows, gerFaultMap) : isSlPoints ? slSummaryBar(slRows, slFaultMap) : isTrafficLight ? trafficSummaryBar(rows) : ""}
    <div class="table-wrap">
      ${isSlPoints ? `
      <table id="assetTable">
        <thead><tr>
          <th style="width:36px">#</th>
          <th>Код</th>
          <th>Нэр / Байршил</th>
          <th style="text-align:center">Шонгийн тоо</th>
          <th style="text-align:center">Нийт толгой</th>
          <th>Төрөл</th>
          <th style="text-align:center;color:#dc2626">Гэмтэл</th>
          <th style="text-align:center">Нөхөх шон</th>
          <th style="text-align:center">Үйлдэл</th>
          <th style="text-align:center">Дэлгэрэнгүй</th>
        </tr></thead>
        <tbody>
          ${slRows.length ? slRows.map((r,i) => {
            const headsDisplay = r.total_heads > 0 ? r.total_heads : (r.lamp_count||0);
            const ef = slFaultMap.get(r.id);
            const brokenVal = ef ? ef.broken_count : 0;
            const faultId   = ef ? ef.id : 0;
            const inputColor = brokenVal > 0 ? "#dc2626" : "#94a3b8";
            return `<tr data-name="${escapeHtml((r.name||"").toLowerCase())}" data-loc="${escapeHtml((r.location||"").toLowerCase())}">
              <td style="color:#94a3b8;font-size:11px">${i+1}</td>
              <td><span style="font-family:monospace;font-size:11px;background:#f1f5f9;padding:2px 6px;border-radius:4px">${escapeHtml(r.code||"—")}</span></td>
              <td>
                <div style="font-weight:600">${escapeHtml(r.name||"—")}</div>
                ${r.location ? `<div style="font-size:11px;color:#94a3b8">${escapeHtml(r.location)}</div>` : ""}
              </td>
              <td style="text-align:center;font-weight:700;color:#2563eb">${r.lamp_count||0}</td>
              <td style="text-align:center;font-weight:700;color:#0ea5e9">${headsDisplay}</td>
              <td style="font-size:11px;color:#667085">${escapeHtml(r.light_type||(r.wattage_per_lamp?`${r.wattage_per_lamp}Вт`:"—"))}</td>
              <td style="text-align:center">
                ${(() => {
                  const workPct = headsDisplay > 0 ? Math.round((headsDisplay - brokenVal) / headsDisplay * 100) : 100;
                  const pctColor = workPct >= 90 ? "#16a34a" : workPct >= 70 ? "#d97706" : "#dc2626";
                  return `<input type="number" min="0" max="${headsDisplay}"
                    value="${brokenVal||""}"
                    placeholder="0"
                    data-slid="${r.id}" data-name="${escapeHtml(r.name||"")}" data-heads="${headsDisplay}" data-fid="${faultId}" data-orig="${brokenVal}"
                    onkeydown="if(event.key==='Enter'){slFaultQuickSave(this);this.blur()}"
                    onblur="slFaultQuickSave(this)"
                    style="width:60px;text-align:center;padding:4px 6px;border-radius:8px;border:2px solid ${brokenVal>0?'#fecaca':'#e2e6ed'};font-size:14px;font-weight:800;color:${inputColor};outline:none;background:${brokenVal>0?'#fef2f2':'#fff'};transition:all .2s"
                    onfocus="this.style.borderColor='#dc2626';this.style.background='#fff5f5'"
                  >
                  <div style="font-size:10px;margin-top:3px;font-weight:700;color:${pctColor}">${workPct}%</div>`;
                })()}
              </td>
              <td style="text-align:center">${r.needs_poles > 0 ? `<span style="background:#fff7ed;color:#d97706;border-radius:12px;padding:1px 8px;font-size:11px;font-weight:700">${r.needs_poles}</span>` : `<span style="color:#94a3b8">—</span>`}</td>
              <td style="text-align:center">
                ${(() => {
                  const fl2 = flagMap.get(`sl_points_${r.id}`);
                  const flBtn2 = fl2 && !fl2.is_resolved
                    ? `<button class="btn secondary" style="padding:3px 8px;font-size:10px;color:#d97706;border-color:#d97706"
                         onclick="openAssetFlagModal('sl_points',${r.id},'${escapeHtml((r.name||"").replace(/'/g,""))}',${fl2.id},'${escapeHtml((fl2.flag_note||"").replace(/'/g,""))}')">🚩</button>
                       <button class="btn secondary" style="padding:3px 8px;font-size:10px;color:#16a34a"
                         onclick="resolveAssetFlag(${fl2.id})">✓</button>`
                    : `<button class="btn secondary" style="padding:3px 8px;font-size:10px"
                         onclick="openAssetFlagModal('sl_points',${r.id},'${escapeHtml((r.name||"").replace(/'/g,""))}')">🚩</button>`;
                  return `<div style="display:flex;gap:3px;justify-content:center">
                    <button class="btn secondary" style="padding:3px 8px;font-size:10px" onclick="openSlForm(${r.id})" title="Засах">✏️</button>
                    <button class="btn secondary" style="padding:3px 8px;font-size:10px" onclick="show('sl_faults')" title="Гэмтэл / засварын бүртгэл">⚡</button>
                    ${flBtn2}
                    ${canDel ? `<button class="btn danger" style="padding:3px 8px;font-size:10px"
                      onclick="deleteSlPointRow(${r.id},'${escapeHtml((r.name||"").replace(/'/g,""))}')">🗑</button>` : ""}
                  </div>`;
                })()}
              </td>
              <td style="text-align:center">
                <button class="btn secondary" style="padding:3px 8px;font-size:10px;background:#eff6ff;color:#2563eb;border-color:#bfdbfe" onclick="openSlDetail(${r.id})" title="Дэлгэрэнгүй мэдээлэл">📋 Харах</button>
              </td>
            </tr>`;
          }).join("") : `<tr><td colspan="10" style="text-align:center;color:#667085;padding:30px">Бүртгэл олдсонгүй</td></tr>`}
        </tbody>
      </table>` : isGerCat ? `
      <table id="assetTable">
        <thead><tr>
          <th style="width:36px">#</th>
          <th>Баг</th>
          <th>Байршил</th>
          <th style="text-align:center">Шонгийн тоо</th>
          <th style="text-align:center">Толгойн тоо</th>
          <th>Төрөл</th>
          <th style="text-align:center;color:#dc2626">Гэмтэл</th>
          <th style="text-align:center">Үйлдэл</th>
          <th style="text-align:center">Дэлгэрэнгүй</th>
        </tr></thead>
        <tbody>
          ${gerRows.length ? gerRows.map((r,i)=>{
            const isCamhag = cat==="Цамхагийн гэрэл";
            const heads = r.total_count || 0;
            const ef = gerFaultMap.get(r.id);
            const brokenVal = ef ? ef.broken_count : 0;
            const faultId   = ef ? ef.id : 0;
            const inputColor = brokenVal > 0 ? "#dc2626" : "#94a3b8";
            const workPct = heads > 0 ? Math.round((heads - brokenVal) / heads * 100) : 100;
            const pctColor = workPct >= 90 ? "#16a34a" : workPct >= 70 ? "#d97706" : "#dc2626";
            const countCells = isCamhag
              ? `<td style="text-align:center;color:#64748b;font-size:12px">1</td>
                 <td style="text-align:center;font-weight:700;color:#d97706">${heads}</td>`
              : `<td style="text-align:center;font-weight:700;color:#2563eb">${heads}</td>
                 <td style="text-align:center;font-weight:700;color:#0ea5e9">${heads}</td>`;
            const fl = flagMap.get(`sl_ger_inventory_${r.id}`);
            const flStyle = fl && !fl.is_resolved ? "background:#fffbeb;border-left:3px solid #d97706;" : "";
            const flBadge = fl && !fl.is_resolved
              ? `<div style="font-size:10px;color:#d97706;font-weight:700;margin-top:2px" title="${escapeHtml(fl.flag_note)}">🚩 ${escapeHtml((fl.flag_note||"").slice(0,20))}${fl.flag_note?.length>20?"…":""}</div>` : "";
            const flBtn = fl && !fl.is_resolved
              ? `<button class="btn secondary" style="padding:3px 8px;font-size:10px;color:#d97706;border-color:#d97706"
                   onclick="openAssetFlagModal('sl_ger_inventory',${r.id},'${escapeHtml((r.location_name||"").replace(/'/g,""))}',${fl.id},'${escapeHtml((fl.flag_note||"").replace(/'/g,""))}')">🚩 Засах</button>
                 <button class="btn secondary" style="padding:3px 8px;font-size:10px;color:#16a34a"
                   onclick="resolveAssetFlag(${fl.id})">✓ Засагдлаа</button>`
              : `<button class="btn secondary" style="padding:3px 8px;font-size:10px"
                   onclick="openAssetFlagModal('sl_ger_inventory',${r.id},'${escapeHtml((r.location_name||"").replace(/'/g,""))}')">🚩 Тэмдэглэх</button>`;
            return `<tr data-name="${escapeHtml((r.location_name||"").toLowerCase())}" data-loc="" style="${flStyle}">
              <td style="color:#94a3b8;font-size:11px">${i+1}</td>
              <td style="font-size:12px">${r.bag_no ?? "—"}${flBadge}</td>
              <td style="font-weight:600">${escapeHtml(r.location_name||"—")}</td>
              ${countCells}
              <td style="font-size:11px;color:#667085">${escapeHtml(r.light_type||"—")}</td>
              <td style="text-align:center">
                <input type="number" min="0" max="${heads}"
                  value="${brokenVal||""}" placeholder="0"
                  data-gerid="${r.id}" data-name="${escapeHtml(r.location_name||"")}"
                  data-heads="${heads}" data-fid="${faultId}" data-orig="${brokenVal}"
                  data-cat="${escapeHtml(cat)}"
                  onkeydown="if(event.key==='Enter'){gerFaultQuickSave(this);this.blur()}"
                  onblur="gerFaultQuickSave(this)"
                  style="width:60px;text-align:center;padding:4px 6px;border-radius:8px;border:2px solid ${brokenVal>0?'#fecaca':'#e2e6ed'};font-size:14px;font-weight:800;color:${inputColor};outline:none;background:${brokenVal>0?'#fef2f2':'#fff'};transition:all .2s"
                  onfocus="this.style.borderColor='#dc2626';this.style.background='#fff5f5'"
                >
                <div style="font-size:10px;margin-top:3px;font-weight:700;color:${pctColor}">${workPct}%</div>
              </td>
              <td style="text-align:center">
                <div style="display:flex;gap:3px;justify-content:center;flex-wrap:wrap">
                  <button class="btn secondary" style="padding:3px 8px;font-size:10px" onclick="openGerForm(${r.id})" title="Засах">✏️</button>
                  <button class="btn secondary" style="padding:3px 8px;font-size:10px" onclick="show('sl_faults')" title="Гэмтэл / засварын бүртгэл">⚡</button>
                  ${flBtn}
                  ${canDel ? `<button class="btn danger" style="padding:3px 8px;font-size:10px"
                    onclick="deleteGerRow(${r.id},'${escapeHtml((r.location_name||"").replace(/'/g,""))}')">🗑</button>` : ""}
                </div>
              </td>
              <td style="text-align:center">
                <button class="btn secondary" style="padding:3px 8px;font-size:10px;background:#eff6ff;color:#2563eb;border-color:#bfdbfe"
                  onclick="openGerDetail(${r.id},'${escapeHtml(cat)}')" title="Дэлгэрэнгүй мэдээлэл">📋 Харах</button>
              </td>
            </tr>`;
          }).join("") : `<tr><td colspan="9" style="text-align:center;color:#667085;padding:30px">Бүртгэл олдсонгүй</td></tr>`}
        </tbody>
      </table>` : `
      <table id="assetTable">
        <thead><tr>
          <th style="width:40px">#</th>
          <th>Код</th>
          <th>Нэр</th>
          <th>Ангилал</th>
          <th>Байршил</th>
          <th>Төлөв</th>
          <th>Нөхцөл</th>
          <th>Хариуцагч</th>
          <th>Файл</th>
          <th>Ажил</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map((r,i) => {
            const ac = _dynCats.find(c=>c.name===r.category) || ASSET_CATEGORIES.find(c=>c.id===r.category) || ASSET_CATEGORIES.at(-1);
            const condColor = r.condition==="Хэвийн"?"#16a34a":r.condition==="Засвар хэрэгтэй"?"#d97706":"#dc2626";
            const fl3 = flagMap.get(`assets_${r.id}`);
            const flStyle3 = fl3 && !fl3.is_resolved ? "background:#fffbeb;border-left:3px solid #d97706;" : "";
            const flBtn3 = fl3 && !fl3.is_resolved
              ? `<button class="btn secondary" style="padding:3px 8px;font-size:10px;color:#d97706;border-color:#d97706" title="${escapeHtml(fl3.flag_note)}"
                   onclick="openAssetFlagModal('assets',${r.id},'${escapeHtml((r.name||"").replace(/'/g,""))}',${fl3.id},'${escapeHtml((fl3.flag_note||"").replace(/'/g,""))}')">🚩</button>
                 <button class="btn secondary" style="padding:3px 8px;font-size:10px;color:#16a34a"
                   onclick="resolveAssetFlag(${fl3.id})">✓</button>`
              : `<button class="btn secondary" style="padding:3px 8px;font-size:10px"
                   onclick="openAssetFlagModal('assets',${r.id},'${escapeHtml((r.name||"").replace(/'/g,""))}')">🚩</button>`;
            return `<tr data-name="${escapeHtml((r.name||"").toLowerCase())}" data-loc="${escapeHtml((r.location||"").toLowerCase())}" style="${flStyle3}">
              <td style="color:#94a3b8;font-size:11px">${i+1}</td>
              <td><span style="font-family:monospace;font-size:11px;background:#f1f5f9;padding:2px 6px;border-radius:4px">${escapeHtml(r.asset_code||"—")}</span></td>
              <td><span style="font-weight:600;cursor:pointer;color:#1d4ed8" onclick="openPassport(${r.id})">${escapeHtml(r.name)}</span>
                ${fl3&&!fl3.is_resolved?`<div style="font-size:10px;color:#d97706;margin-top:1px">🚩 ${escapeHtml((fl3.flag_note||"").slice(0,24))}${fl3.flag_note?.length>24?"…":""}</div>`:""}</td>
              <td><span style="font-size:13px">${ac.icon}</span> <span style="font-size:12px">${r.category}</span></td>
              <td style="font-size:12px;color:#667085">${escapeHtml(r.location||"—")}</td>
              <td>${r.category === "Гэрлэн дохио"
                ? `<span onclick="toggleTrafficStatus(${r.id},'${r.status}')" title="Дарж солих" style="cursor:pointer;font-size:10px;padding:2px 10px;border-radius:20px;user-select:none;
                    background:${isTrafficOn(r.status)?"#dcfce7":"#f1f5f9"};
                    color:${isTrafficOn(r.status)?"#16a34a":"#475569"};
                    border:1.5px solid ${isTrafficOn(r.status)?"#86efac":"#cbd5e1"}">${isTrafficOn(r.status)?"🟢 Асаалтай":"⚫ Унтраалтай"}</span>`
                : `<span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${r.status==="Идэвхтэй"?"#dcfce7":"#f1f5f9"};color:${r.status==="Идэвхтэй"?"#16a34a":"#475569"}">${r.status}</span>`
              }</td>
              <td><span style="font-size:10px;color:${condColor};font-weight:600">${r.condition}</span></td>
              <td style="font-size:12px">${escapeHtml(r.assigned_name||"—")}</td>
              <td style="font-family:monospace;font-size:12px;color:#667085">${r.file_count||0}</td>
              <td style="font-family:monospace;font-size:12px;color:#667085">${r.work_count||0}</td>
              <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  <button class="btn secondary" style="padding:3px 8px;font-size:10px" onclick="openPassport(${r.id})">📋</button>
                  ${canCreate?`<button class="btn secondary" style="padding:3px 8px;font-size:10px" onclick="openAssetForm(${r.id})">✏️</button>`:""}
                  ${canDel?`<button class="btn danger" style="padding:3px 8px;font-size:10px" onclick="confirmDeleteAsset(${r.id})">🗑</button>`:""}
                  ${flBtn3}
                </div>
              </td>
            </tr>`;
          }).join("") : `<tr><td colspan="11" style="text-align:center;color:#667085;padding:30px">
            Объект бүртгэгдээгүй байна. ${canCreate?`<a href="#" onclick="openAssetForm()" style="color:#2563eb">+ Бүртгэх</a>`:""}
          </td></tr>`}
        </tbody>
      </table>`}
    </div>
  </div>`;

  // Keyboard navigation for lightbox
  document.onkeydown = (e) => {
    const lb = document.getElementById("globalLightbox");
    if (!lb || lb.style.display === "none") return;
    if (e.key === "ArrowRight") lightboxNav(1);
    else if (e.key === "ArrowLeft") lightboxNav(-1);
    else if (e.key === "Escape") closeLightbox();
  };
}

function filterAssets(val) {
  const v = val.toLowerCase();
  document.querySelectorAll("#assetTable tbody tr[data-name]").forEach(tr => {
    const name = tr.dataset.name || "";
    const loc  = tr.dataset.loc  || "";
    tr.style.display = name.includes(v) || loc.includes(v) ? "" : "none";
  });
}

let _afmTableName = "", _afmRecordId = 0, _afmFlagId = 0;

function openAssetFlagModal(tableName, recordId, label, flagId = 0, existingNote = "") {
  _afmTableName = tableName;
  _afmRecordId  = recordId;
  _afmFlagId    = flagId;
  const modal = document.getElementById("assetFlagModal");
  document.getElementById("afmTitle").textContent = label || "";
  document.getElementById("afmNote").value = existingNote;
  modal.style.display = "flex";
  setTimeout(() => document.getElementById("afmNote").focus(), 80);
}

function closeAssetFlagModal() {
  document.getElementById("assetFlagModal").style.display = "none";
}

async function saveAssetFlag() {
  const note = document.getElementById("afmNote").value.trim();
  if (!note) { document.getElementById("afmNote").focus(); return; }
  try {
    await api("/api/asset-flags", {
      method: "POST",
      body: JSON.stringify({ table_name: _afmTableName, record_id: _afmRecordId, flag_note: note })
    });
    closeAssetFlagModal();
    toast("🚩 Тэмдэглэгдлээ");
    assets(window._assetCat);
  } catch(e) { toast("Алдаа: " + e.message); }
}

async function resolveAssetFlag(flagId) {
  if (!confirm("Засагдсан гэж тэмдэглэх үү?")) return;
  try {
    await api(`/api/asset-flags/${flagId}/resolve`, { method: "PUT" });
    toast("✓ Засагдсан гэж тэмдэглэгдлээ");
    assets(window._assetCat);
  } catch(e) { toast("Алдаа: " + e.message); }
}

async function deleteGerRow(id, name) {
  if (!confirm(`"${name || id}" байршлын бүртгэлийг устгах уу?\nЭнэ үйлдлийг буцаах боломжгүй.`)) return;
  try {
    await api(`/api/sl-ger-inventory/${id}`, { method: "DELETE" });
    toast("Устгагдлаа ✓");
    assets(window._assetCat);
  } catch(e) { toast("Алдаа: " + e.message); }
}

async function deleteSlPointRow(id, name) {
  if (!confirm(`"${name || id}" гудамжны бүртгэлийг устгах уу?\nЭнэ үйлдлийг буцаах боломжгүй.`)) return;
  try {
    await api(`/api/sl-points/${id}`, { method: "DELETE" });
    toast("Устгагдлаа ✓");
    assets(window._assetCat);
  } catch(e) { toast("Алдаа: " + e.message); }
}

function isTrafficOn(status) {
  return status === "Асаалтай" || status === "Идэвхтэй";
}

async function toggleTrafficStatus(id, current) {
  const next = isTrafficOn(current) ? "Унтраалтай" : "Асаалтай";
  try {
    await api(`/api/assets/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
    assets(window._assetCat);
  } catch(e) { toast("Алдаа: " + e.message); }
}

function updateAssetFormStatus(cat) {
  const sel = document.getElementById("af_status");
  if (!sel) return;
  const isTraffic = cat === "Гэрлэн дохио";
  const opts = isTraffic ? ["Асаалтай","Унтраалтай"] : ASSET_STATUSES;
  sel.innerHTML = opts.map(s => `<option>${s}</option>`).join("");
}

async function openAssetForm(id) {
  let asset = null;
  if (id) {
    try { asset = await api(`/api/assets/${id}`); } catch(e){}
  }
  const modal = document.getElementById("assetFormModal");
  const inner = document.getElementById("assetFormInner");
  const title = asset ? "✏️ Объект засах" : "+ Объект бүртгэх";
  const formCat = asset?.category || window._assetCat || "";
  const isTraffic = formCat === "Гэрлэн дохио";
  const statusOpts = isTraffic ? ["Асаалтай","Унтраалтай"] : ASSET_STATUSES;

  inner.innerHTML = `
    <div style="padding:16px 22px;border-bottom:1px solid #e2e6ed;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:2;border-radius:14px 14px 0 0">
      <span style="font-size:15px;font-weight:800">${title}</span>
      <button onclick="closeAssetForm()" style="border:none;background:#f1f5f9;border-radius:8px;padding:6px 14px;cursor:pointer;color:#667085">✕</button>
    </div>
    <div style="padding:18px 22px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Хөрөнгийн нэр *</div>
          <input class="input" id="af_name" value="${escapeHtml(asset?.name||"")}" placeholder="Найрамдал паркийн гэрэлтүүлэг">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Ангилал *</div>
          <select class="input" id="af_cat" onchange="updateAssetFormStatus(this.value)">
            ${(window._assetCatList||ASSET_CATEGORIES.map(c=>({name:c.id,icon:c.icon}))).map(c=>{
              const selected = asset ? asset.category===c.name : window._assetCat===c.name;
              return `<option value="${escapeHtml(c.name)}" ${selected?"selected":""}>${c.icon||"📦"} ${escapeHtml(c.name)}</option>`;
            }).join("")}
          </select>
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Дэд ангилал</div>
          <input class="input" id="af_subcat" value="${escapeHtml(asset?.sub_category||"")}" placeholder="Авто зам / Гэр хороолол...">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Байршил</div>
          <input class="input" id="af_loc" value="${escapeHtml(asset?.location||"")}" placeholder="Найрамдал парк, Замын 3-р хэсэг...">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Төлөв</div>
          <select class="input" id="af_status">
            ${statusOpts.map(s=>`<option ${asset?.status===s?"selected":""}>${s}</option>`).join("")}
          </select>
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Нөхцөл</div>
          <select class="input" id="af_cond">
            ${ASSET_CONDITIONS.map(c=>`<option ${asset?.condition===c?"selected":""}>${c}</option>`).join("")}
          </select>
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Суурилуулсан огноо</div>
          <input class="input" type="date" id="af_date" value="${asset?.installed_date||""}">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Баталгааны хугацаа</div>
          <input class="input" type="date" id="af_warranty" value="${asset?.warranty_until||""}">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Анхны үнэ ₮</div>
          <input class="input" type="number" id="af_price" value="${asset?.purchase_price||0}">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Ашиглалтын хугацаа (жил)</div>
          <input class="input" type="number" id="af_life" value="${asset?.useful_life_years||10}">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Хариуцагч инженер</div>
          <select class="input" id="af_assign">
            <option value="">— Сонгох —</option>
            ${state.users.map(u=>`<option value="${u.id}" ${asset?.assigned_to==u.id?"selected":""}>${u.full_name} (${u.position||""})</option>`).join("")}
          </select>
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">GPS (lat, lng)</div>
          <div style="display:flex;gap:6px">
            <input class="input" type="number" step="any" id="af_lat" value="${asset?.gps_lat||""}" placeholder="47.9136">
            <input class="input" type="number" step="any" id="af_lng" value="${asset?.gps_lng||""}" placeholder="114.5327">
          </div>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <div style="font-size:11px;color:#667085;margin-bottom:4px">Техникийн үзүүлэлт</div>
        <textarea class="input" id="af_specs" style="min-height:60px;margin:0" placeholder="Хүч: 150W · Кабель: СИП 4x25 · Шон: 1747 · Толгой: 2182...">${escapeHtml(asset?.specs||"")}</textarea>
      </div>
      <div style="margin-bottom:16px">
        <div style="font-size:11px;color:#667085;margin-bottom:4px">Тайлбар / Тэмдэглэл</div>
        <textarea class="input" id="af_desc" style="min-height:50px;margin:0" placeholder="Нэмэлт мэдээлэл...">${escapeHtml(asset?.description||"")}</textarea>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn" onclick="saveAsset(${id||"null"})">Хадгалах</button>
        <button class="btn secondary" onclick="closeAssetForm()">Болих</button>
      </div>
    </div>`;

  modal.style.display = "flex";
}

function closeAssetForm() {
  const m = document.getElementById("assetFormModal");
  if (m) m.style.display = "none";
}

// ── GER inventory form ────────────────────────────────────────
async function openGerForm(id) {
  let rec = null;
  if (id) { try { rec = await api(`/api/sl-ger-inventory/${id}`); } catch(e){} }
  const gerCat = GER_CAT_MAP[window._assetCat] || rec?.category || "Гэр хороолол";
  const inner = document.getElementById("gerFormInner");
  inner.innerHTML = `
    <div style="padding:16px 22px;border-bottom:1px solid #e2e6ed;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:2;border-radius:14px 14px 0 0">
      <span style="font-size:15px;font-weight:800">${id ? `✏️ ${escapeHtml(window._assetCat||"Байршил")} засах` : `+ Шинэ ${escapeHtml(window._assetCat||"байршил")} бүртгэх`}</span>
      <button onclick="closeGerForm()" style="border:none;background:#f1f5f9;border-radius:8px;padding:6px 14px;cursor:pointer;color:#667085">✕</button>
    </div>
    <div style="padding:18px 22px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div style="grid-column:1/-1">
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Байршил *</div>
          <input class="input" id="gf_loc" value="${escapeHtml(rec?.location_name||"")}" placeholder="Найрамдал гудамж...">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Баг дугаар</div>
          <input class="input" type="number" id="gf_bag" value="${rec?.bag_no??""}" placeholder="1">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Нийт шон/байршил</div>
          <input class="input" type="number" id="gf_total" value="${rec?.total_count??0}">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Нийт толгой</div>
          <input class="input" type="number" id="gf_head" value="${rec?.head_count??0}">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Гэрлийн төрөл</div>
          <input class="input" id="gf_type" value="${escapeHtml(rec?.light_type||"")}" placeholder="LED, ДРЛ, ЛМ...">
        </div>
        <div style="grid-column:1/-1">
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Тайлбар</div>
          <textarea class="input" id="gf_notes" style="min-height:50px;margin:0">${escapeHtml(rec?.notes||"")}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn" onclick="saveGerForm(${id||"null"},'${escapeHtml(gerCat)}')">Хадгалах</button>
        <button class="btn secondary" onclick="closeGerForm()">Болих</button>
      </div>
    </div>`;
  document.getElementById("gerFormModal").style.display = "flex";
}

function closeGerForm() {
  const m = document.getElementById("gerFormModal");
  if (m) m.style.display = "none";
}

async function saveGerForm(id, gerCat) {
  const g = el => (document.getElementById(el)||{}).value||"";
  const loc = g("gf_loc").trim();
  if (!loc) { toast("Байршил оруулна уу"); return; }
  const body = {
    location_name: loc,
    bag_no: g("gf_bag") ? Number(g("gf_bag")) : null,
    category: gerCat || GER_CAT_MAP[window._assetCat] || "Гэр хороолол",
    total_count: Number(g("gf_total")||0),
    head_count: Number(g("gf_head")||0),
    light_type: g("gf_type"),
    notes: g("gf_notes"),
  };
  try {
    if (id) {
      await api(`/api/sl-ger-inventory/${id}`, { method:"PUT", body:JSON.stringify(body) });
      toast("Засагдлаа ✓");
    } else {
      await api("/api/sl-ger-inventory", { method:"POST", body:JSON.stringify(body) });
      toast("Байршил бүртгэгдлээ ✓");
    }
    closeGerForm();
    assets(window._assetCat);
  } catch(err) { toast("Алдаа: "+err.message); }
}

// ── SL points form ────────────────────────────────────────────
async function openSlForm(id) {
  let rec = null;
  if (id) { try { rec = await api(`/api/sl-points/${id}`); } catch(e){} }
  const inner = document.getElementById("slFormInner");
  inner.innerHTML = `
    <div style="padding:16px 22px;border-bottom:1px solid #e2e6ed;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:2;border-radius:14px 14px 0 0">
      <span style="font-size:15px;font-weight:800">${id ? "✏️ Авто замын гэрэл засах" : "+ Шинэ авто замын гэрэл бүртгэх"}</span>
      <button onclick="closeSlForm()" style="border:none;background:#f1f5f9;border-radius:8px;padding:6px 14px;cursor:pointer;color:#667085">✕</button>
    </div>
    <div style="padding:18px 22px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Цэгийн код *</div>
          <input class="input" id="sf_code" value="${escapeHtml(rec?.code||"")}" placeholder="ГТ-001">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Нэр / Байршил *</div>
          <input class="input" id="sf_name" value="${escapeHtml(rec?.name||"")}" placeholder="Найрамдал гудамж">
        </div>
        <div style="grid-column:1/-1">
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Дэлгэрэнгүй байршил</div>
          <input class="input" id="sf_loc" value="${escapeHtml(rec?.location||"")}">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Шонгийн тоо</div>
          <input class="input" type="number" id="sf_lamps" value="${rec?.lamp_count??1}">
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Төлөв</div>
          <select class="input" id="sf_status">
            <option value="active" ${(!rec||rec.status==="active"||rec.status==="Идэвхтэй")?"selected":""}>Идэвхтэй</option>
            <option value="inactive" ${(rec?.status==="inactive"||rec?.status==="Идэвхгүй")?"selected":""}>Идэвхгүй</option>
          </select>
        </div>
        <div>
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Суурилуулсан огноо</div>
          <input class="input" type="date" id="sf_date" value="${rec?.install_date||""}">
        </div>
        <div style="grid-column:1/-1">
          <div style="font-size:11px;color:#667085;margin-bottom:4px">Тайлбар</div>
          <textarea class="input" id="sf_notes" style="min-height:50px;margin:0">${escapeHtml(rec?.notes||"")}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn" onclick="saveSlForm(${id||"null"})">Хадгалах</button>
        <button class="btn secondary" onclick="closeSlForm()">Болих</button>
      </div>
    </div>`;
  document.getElementById("slFormModal").style.display = "flex";
}

function closeSlForm() {
  const m = document.getElementById("slFormModal");
  if (m) m.style.display = "none";
}

async function saveSlForm(id) {
  const g = el => (document.getElementById(el)||{}).value||"";
  const code = g("sf_code").trim();
  const name = g("sf_name").trim();
  if (!code) { toast("Код оруулна уу"); return; }
  if (!name) { toast("Нэр оруулна уу"); return; }
  const body = {
    code, name,
    location: g("sf_loc"),
    lamp_count: Number(g("sf_lamps")||1),
    status: g("sf_status"),
    install_date: g("sf_date")||null,
    notes: g("sf_notes"),
  };
  try {
    if (id) {
      await api(`/api/sl-points/${id}`, { method:"PUT", body:JSON.stringify(body) });
      toast("Засагдлаа ✓");
    } else {
      await api("/api/sl-points", { method:"POST", body:JSON.stringify(body) });
      toast("Цэг бүртгэгдлээ ✓");
    }
    closeSlForm();
    assets(window._assetCat);
  } catch(err) { toast("Алдаа: "+err.message); }
}

async function saveAsset(id) {
  const g = el => (document.getElementById(el)||{}).value||"";
  const name = g("af_name").trim();
  if (!name) { toast("Нэр оруулна уу"); return; }
  const body = {
    name, category: g("af_cat"), sub_category: g("af_subcat"),
    location: g("af_loc"), status: g("af_status"), condition: g("af_cond"),
    installed_date: g("af_date")||null, warranty_until: g("af_warranty")||null,
    purchase_price: Number(g("af_price")||0), useful_life_years: Number(g("af_life")||10),
    assigned_to: g("af_assign")||null,
    gps_lat: parseFloat(g("af_lat"))||null, gps_lng: parseFloat(g("af_lng"))||null,
    specs: g("af_specs"), description: g("af_desc"),
  };
  try {
    if (id) {
      await api(`/api/assets/${id}`, { method:"PUT", body:JSON.stringify(body) });
      toast("Объект засагдлаа ✓");
      closeAssetForm();
      assets(window._assetCat);
    } else {
      const r = await api("/api/assets", { method:"POST", body:JSON.stringify(body) });
      toast(`Объект бүртгэгдлээ ✓ (${r.asset_code})`);
      closeAssetForm();
      assets(body.category);
    }
  } catch(err) { toast("Алдаа: "+err.message); }
}

async function openPassport(id) {
  const modal = document.getElementById("assetPassportModal");
  const inner = document.getElementById("assetPassportInner");
  if (!modal || !inner) return;

  inner.innerHTML = `<div style="padding:40px;text-align:center;color:#667085">
    <div style="font-size:28px;margin-bottom:12px">⏳</div>Уншиж байна...
  </div>`;
  modal.style.display = "flex";

  let asset;
  try { asset = await api(`/api/assets/${id}`); }
  catch(e) { inner.innerHTML = `<div style="padding:24px;color:#dc2626">Алдаа: ${e.message}</div>`; return; }

  const cat     = ASSET_CATEGORIES.find(c => c.id === asset.category) || ASSET_CATEGORIES[7];
  const canEdit = ["director","chief_engineer","storekeeper","engineer","camera_engineer"].includes(state.me.role);
  const canDel  = ["director","chief_engineer"].includes(state.me.role);

  const installed  = asset.installed_date ? new Date(asset.installed_date) : null;
  const ageYears   = installed ? (Date.now() - installed) / (1000*60*60*24*365.25) : 0;
  const lifeYears  = asset.useful_life_years || 10;
  const deprPct    = Math.min(100, Math.round(ageYears / lifeYears * 100));
  const curValue   = Math.round((asset.purchase_price||0) * (1 - deprPct/100));
  const deprColor  = deprPct >= 80 ? "#dc2626" : deprPct >= 50 ? "#d97706" : "#16a34a";
  const condColor  = {"Хэвийн":"#16a34a","Засвар хэрэгтэй":"#d97706","Хугацаа дууссан":"#dc2626","Ашиглалтаас гарсан":"#94a3b8"}[asset.condition] || "#667085";

  const files   = asset.files   || [];
  const history = asset.history || [];
  const photos  = files.filter(f => f.file_type==="photo" || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.file_path||""));
  const cadFiles= files.filter(f => f.file_type==="autocad" || /\.(dwg|dxf)$/i.test(f.file_path||""));
  const docs    = files.filter(f => !photos.includes(f) && !cadFiles.includes(f));

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
    `ЧОЙБАЛСАН ХӨГЖИЛ ОНӨҮГ\nКод: ${asset.asset_code||""}\nНэр: ${asset.name}\nБайршил: ${asset.location||""}\n${location.origin}/assets/${id}`
  )}`;

  inner.innerHTML = `
  <div style="background:linear-gradient(135deg,#0f1623 0%,#1a2840 60%,#0f1623 100%);border-radius:14px 14px 0 0;padding:22px 26px;position:relative;overflow:hidden">
    <div style="position:absolute;right:-50px;top:-50px;width:200px;height:200px;border-radius:50%;background:${cat.color};opacity:.1;pointer-events:none"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${cat.color};border-radius:14px 0 0 0"></div>
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;position:relative">
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;color:rgba(255,255,255,.45);letter-spacing:.15em;text-transform:uppercase;margin-bottom:8px">
          ${cat.icon} ${asset.category} · ОБЪЕКТИЙН ПАСПОРТ
        </div>
        <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:8px;line-height:1.2">${escapeHtml(asset.name)}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-family:monospace;font-size:12px;background:rgba(255,255,255,.1);color:rgba(255,255,255,.8);padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.15)">${asset.asset_code||"—"}</span>
          <span style="font-size:11px;padding:4px 10px;border-radius:20px;background:${asset.status==="Идэвхтэй"?"rgba(46,204,138,.2)":"rgba(148,163,184,.15)"};color:${asset.status==="Идэвхтэй"?"#4ade80":"#94a3b8"};border:1px solid ${asset.status==="Идэвхтэй"?"rgba(74,222,128,.3)":"rgba(148,163,184,.2)"}">${asset.status}</span>
          <span style="font-size:11px;color:${condColor};font-weight:600">● ${asset.condition}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0">
        <img src="${qrUrl}" style="width:80px;height:80px;border-radius:8px;border:2px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05)" alt="QR">
        <div style="font-size:9px;color:rgba(255,255,255,.4);letter-spacing:.06em">QR КОД</div>
      </div>
    </div>
    <button onclick="closePassport()" style="position:absolute;top:14px;right:14px;border:none;background:rgba(255,255,255,.1);color:rgba(255,255,255,.6);border-radius:8px;padding:5px 12px;cursor:pointer;font-size:12px;z-index:1">✕</button>
  </div>

  <div style="display:flex;border-bottom:1px solid #e2e6ed;background:#f8f9fb;padding:0 20px">
    ${(()=>{
      const isPanel = asset.category === "Шит/Самбар";
      const tabs   = ["info","files","map","history", ...(isPanel?["meters"]:[])];
      const labels = ["ℹ️ Мэдээлэл","📁 Файлууд","🗺 Байршил","🛠 Засварын түүх","🔌 Тоолуур"];
      const counts = ["",(files.length||""),"",(history.length||""),""];
      return tabs.map((t,i)=>`<button id="pt_${t}" onclick="switchPassportTab('${t}',${id})"
        style="padding:10px 14px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:600;color:${i===0?'#1d4ed8':'#667085'};border-bottom:2px solid ${i===0?'#1d4ed8':'transparent'};margin-bottom:-1px;white-space:nowrap">
        ${labels[i]}${counts[i]?` <span style="font-size:10px;background:#e2e6ed;padding:1px 6px;border-radius:10px">${counts[i]}</span>`:""}
      </button>`).join("");
    })()}
    ${canEdit ? `<button onclick="openAssetForm(${id})" style="margin-left:auto;padding:8px 14px;border:none;background:none;cursor:pointer;font-size:11px;color:#2563eb;font-weight:600">✏️ Засах</button>` : ""}
    ${canDel  ? `<button onclick="confirmDeleteAsset(${id})" style="padding:8px 14px;border:none;background:none;cursor:pointer;font-size:11px;color:#dc2626;font-weight:600">🗑 Устгах</button>` : ""}
  </div>

  <div id="passportTabContent" style="max-height:65vh;overflow-y:auto">
    <div id="ptab_info" style="padding:20px 24px">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:#16a34a;font-weight:600;letter-spacing:.06em;margin-bottom:4px">АНХНЫ ҮНЭ</div>
          <div style="font-size:17px;font-weight:800;color:#16a34a">${(asset.purchase_price||0).toLocaleString()}<span style="font-size:11px">₮</span></div>
        </div>
        <div style="background:${deprPct>=80?"#fef2f2":deprPct>=50?"#fff7ed":"#f0fdf4"};border:1px solid ${deprPct>=80?"#fecaca":deprPct>=50?"#fed7aa":"#bbf7d0"};border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:${deprColor};font-weight:600;letter-spacing:.06em;margin-bottom:4px">ЭЛЭГДЭЛ</div>
          <div style="font-size:17px;font-weight:800;color:${deprColor}">${deprPct}%</div>
          <div style="height:4px;background:#e2e6ed;border-radius:2px;margin-top:6px;overflow:hidden">
            <div style="height:100%;width:${deprPct}%;background:${deprColor};border-radius:2px;transition:width .6s"></div>
          </div>
        </div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:#2563eb;font-weight:600;letter-spacing:.06em;margin-bottom:4px">ОДООГИЙН ҮНЭ</div>
          <div style="font-size:17px;font-weight:800;color:#2563eb">${curValue.toLocaleString()}<span style="font-size:11px">₮</span></div>
        </div>
        <div style="background:#f8f9fb;border:1px solid #e2e6ed;border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:#667085;font-weight:600;letter-spacing:.06em;margin-bottom:4px">АШИГЛАЛТ</div>
          <div style="font-size:17px;font-weight:800;color:#344054">${Math.round(ageYears*10)/10}<span style="font-size:11px"> / ${lifeYears}жил</span></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        ${[
          ["📍 Байршил",        asset.location||"—"],
          ["👤 Хариуцагч",      asset.assigned_name||"—"],
          ["🏷 Дэд ангилал",    asset.sub_category||"—"],
          ["📅 Суурилуулсан",   asset.installed_date||"—"],
          ["📅 Баталгааны хугацаа", asset.warranty_until||"—"],
          ["🔢 Кодлогдсон",     asset.asset_code||"—"],
        ].map(([l,v]) => `
          <div style="background:#f8f9fb;border:1px solid #e2e6ed;border-radius:8px;padding:10px 14px;display:flex;align-items:flex-start;gap:10px">
            <span style="font-size:14px;flex-shrink:0;margin-top:1px">${l.split(" ")[0]}</span>
            <div style="min-width:0">
              <div style="font-size:10px;color:#94a3b8;margin-bottom:2px">${l.split(" ").slice(1).join(" ")}</div>
              <div style="font-size:13px;font-weight:600;color:#172033;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(String(v))}</div>
            </div>
          </div>`).join("")}
      </div>

      ${asset.specs ? `
        <div style="background:#0f1623;border-radius:10px;padding:14px 16px;margin-bottom:14px">
          <div style="font-size:10px;color:rgba(255,255,255,.4);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">⚙️ ТЕХНИКИЙН ҮЗҮҮЛЭЛТ</div>
          <pre style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#a5f3fc;margin:0;white-space:pre-wrap;line-height:1.7">${escapeHtml(asset.specs)}</pre>
        </div>` : ""}

      ${asset.description ? `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px">
          <div style="font-size:10px;color:#d97706;font-weight:600;margin-bottom:6px">📝 ТЭМДЭГЛЭЛ</div>
          <div style="font-size:13px;color:#344054;line-height:1.6">${escapeHtml(asset.description)}</div>
        </div>` : ""}
    </div>

    <div id="ptab_files" style="display:none;padding:20px 24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:13px;font-weight:700;color:#344054">Нийт ${files.length} файл</div>
        ${canEdit ? `
          <div style="display:flex;gap:8px">
            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:8px;padding:6px 12px;font-weight:600">
              📷 Зураг нэмэх
              <input type="file" id="af_photo" accept="image/*" multiple style="display:none" onchange="uploadAssetFiles(${id},'photo',this)">
            </label>
            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;border-radius:8px;padding:6px 12px;font-weight:600">
              📐 AutoCAD нэмэх
              <input type="file" id="af_cad" accept=".dwg,.dxf,.pdf" style="display:none" onchange="uploadAssetFiles(${id},'autocad',this)">
            </label>
            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:8px;padding:6px 12px;font-weight:600">
              📄 Баримт нэмэх
              <input type="file" id="af_doc" accept=".pdf,.doc,.docx,.xls,.xlsx" style="display:none" onchange="uploadAssetFiles(${id},'document',this)">
            </label>
          </div>` : ""}
      </div>

      ${photos.length ? (() => {
          const photoSrcs = photos.map(f => "/" + (f.file_path||"").replace(/^\/?/,""));
          const psJson = JSON.stringify(photoSrcs);
          return `<div style="margin-bottom:16px">
            <div style="font-size:11px;font-weight:700;color:#667085;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">📷 Зургийн галерей (${photos.length})</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">
              ${photos.map((f,fi) => {
                const src = photoSrcs[fi];
                return `<div style="border-radius:10px;overflow:hidden;border:1px solid #e2e6ed;position:relative">
                  <img src="${src}" style="width:100%;height:110px;object-fit:cover;cursor:pointer;display:block"
                    onclick="openLightbox(${psJson},${fi})">
                  <div style="padding:6px 8px;background:#fff">
                    <div style="font-size:10px;color:#344054;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(f.description||f.file_name||"—")}</div>
                    <div style="font-size:9px;color:#94a3b8">${(f.uploaded_at||"").slice(0,10)}</div>
                  </div>
                  ${canEdit ? `<button onclick="deleteAssetFile(${f.id},${id})"
                    style="position:absolute;top:4px;right:4px;background:rgba(220,38,38,.85);color:#fff;border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer">✕</button>` : ""}
                </div>`;
              }).join("")}
            </div>
          </div>`;
        })() : ""}

      ${cadFiles.length ? `
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;color:#667085;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">📐 AutoCAD & Схем (${cadFiles.length})</div>
          ${cadFiles.map(f => {
            const src = (f.file_path||"").replace(/^\/?/,"");
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:22px">📐</span>
                <div>
                  <div style="font-size:13px;font-weight:600;color:#5b21b6">${escapeHtml(f.description||f.file_name||"CAD файл")}</div>
                  <div style="font-size:10px;color:#7c3aed">${(f.uploaded_at||"").slice(0,10)}</div>
                </div>
              </div>
              <div style="display:flex;gap:6px">
                <button onclick="window.open('/${src}','_blank')" class="btn secondary" style="padding:4px 10px;font-size:11px">⬇️ Татах</button>
                ${canEdit ? `<button onclick="deleteAssetFile(${f.id},${id})" class="btn danger" style="padding:4px 10px;font-size:11px">✕</button>` : ""}
              </div>
            </div>`;
          }).join("")}
        </div>` : ""}

      ${docs.length ? `
        <div>
          <div style="font-size:11px;font-weight:700;color:#667085;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">📄 Баримт бичиг (${docs.length})</div>
          ${docs.map(f => {
            const src = (f.file_path||"").replace(/^\/?/,"");
            const ext = (f.file_name||"").split(".").pop().toUpperCase();
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8f9fb;border:1px solid #e2e6ed;border-radius:8px;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:20px">📄</span>
                <div>
                  <div style="font-size:13px;font-weight:600">${escapeHtml(f.description||f.file_name||"Файл")}</div>
                  <div style="font-size:10px;color:#94a3b8">${ext} · ${(f.uploaded_at||"").slice(0,10)}</div>
                </div>
              </div>
              <div style="display:flex;gap:6px">
                <button onclick="window.open('/${src}','_blank')" class="btn secondary" style="padding:4px 10px;font-size:11px">⬇️ Нээх</button>
                ${canEdit ? `<button onclick="deleteAssetFile(${f.id},${id})" class="btn danger" style="padding:4px 10px;font-size:11px">✕</button>` : ""}
              </div>
            </div>`;
          }).join("")}
        </div>` : ""}

      ${!files.length ? `<div style="text-align:center;padding:30px;color:#94a3b8">
        <div style="font-size:32px;margin-bottom:8px">📁</div>Файл хавсаргагдаагүй байна
      </div>` : ""}
    </div>

    <div id="ptab_map" style="display:none;padding:0">
      ${asset.gps_lat && asset.gps_lng ? `
        <div id="passportMap" style="height:320px;width:100%"></div>
        <div style="padding:12px 20px;background:#f8f9fb;border-top:1px solid #e2e6ed;display:flex;align-items:center;gap:12px">
          <span style="font-family:monospace;font-size:12px;color:#344054">📍 ${asset.gps_lat}, ${asset.gps_lng}</span>
          <a href="https://www.google.com/maps?q=${asset.gps_lat},${asset.gps_lng}" target="_blank"
            style="font-size:11px;color:#2563eb;text-decoration:none;font-weight:600">Google Maps-д нээх →</a>
        </div>` : `
        <div style="padding:40px;text-align:center;color:#94a3b8">
          <div style="font-size:32px;margin-bottom:10px">🗺</div>
          <div>GPS координат бүртгэгдээгүй байна</div>
          ${canEdit ? `<button class="btn secondary" style="margin-top:12px;font-size:12px" onclick="switchPassportTab('info');closePassport();openAssetForm(${id})">GPS нэмэх →</button>` : ""}
        </div>`}
    </div>

    <div id="ptab_history" style="display:none;padding:20px 24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:13px;font-weight:700;color:#344054">Засварын түүх (${history.length})</div>
        ${canEdit ? `<button class="btn" style="font-size:11px;padding:6px 12px" onclick="closePassport();window.workCat='${asset.category==="Авто замын гэрэл"?"Авто замын гэрэл засвар":"Камер засвар"}';show('work')">+ Шинэ ажил нэмэх</button>` : ""}
      </div>
      ${history.length ? `
        <div style="position:relative;padding-left:24px">
          <div style="position:absolute;left:8px;top:0;bottom:0;width:2px;background:#e2e6ed"></div>
          ${history.map((w,i) => {
            const isNew = i === 0;
            const statusColor = w.status==="Дууссан" ? "#16a34a" : w.status==="Явцтай" ? "#2563eb" : "#d97706";
            return `<div style="position:relative;margin-bottom:14px">
              <div style="position:absolute;left:-20px;top:10px;width:10px;height:10px;border-radius:50%;background:${isNew?"#2563eb":"#e2e6ed"};border:2px solid ${isNew?"#2563eb":"#94a3b8"}"></div>
              <div style="background:${isNew?"#eff6ff":"#f8f9fb"};border:1px solid ${isNew?"#bfdbfe":"#e2e6ed"};border-radius:10px;padding:12px 14px">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">
                  <div style="font-size:13px;font-weight:700;color:#172033">${escapeHtml(w.title||"")}</div>
                  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                    <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${w.status==="Дууссан"?"#dcfce7":"#dbeafe"};color:${statusColor}">${w.status||""}</span>
                    <span style="font-size:10px;color:#94a3b8;font-family:monospace">${w.work_date||""}</span>
                  </div>
                </div>
                ${w.description ? `<div style="font-size:12px;color:#667085;line-height:1.5;margin-bottom:4px">${escapeHtml(w.description)}</div>` : ""}
                ${w.created_name ? `<div style="font-size:11px;color:#94a3b8">👤 ${escapeHtml(w.created_name)}</div>` : ""}
                ${w.cost_amount ? `<div style="font-size:11px;color:#16a34a;font-weight:600;margin-top:4px">💰 ${Number(w.cost_amount).toLocaleString()}₮</div>` : ""}
              </div>
            </div>`;
          }).join("")}
        </div>` : `
        <div style="text-align:center;padding:30px;color:#94a3b8">
          <div style="font-size:32px;margin-bottom:8px">🛠</div>Засварын түүх байхгүй байна
        </div>`}
    </div>

    ${asset.category === "Шит/Самбар" ? `
    <div id="ptab_meters" style="display:none;padding:20px 24px">
      <div id="panelMetersContent" style="text-align:center;color:#94a3b8;padding:30px">
        <div style="font-size:28px;margin-bottom:8px">⏳</div>Уншиж байна...
      </div>
    </div>` : ""}
  </div>

  `;

  if (asset.gps_lat && asset.gps_lng) {
    setTimeout(() => initPassportMap(asset.gps_lat, asset.gps_lng, asset.name), 100);
  }
}

function switchPassportTab(tab, panelId) {
  ["info","files","map","history","meters"].forEach(t => {
    const el = document.getElementById(`ptab_${t}`);
    const btn= document.getElementById(`pt_${t}`);
    if (el)  el.style.display = t===tab ? "block" : "none";
    if (btn) {
      btn.style.color       = t===tab ? "#1d4ed8" : "#667085";
      btn.style.borderBottom= t===tab ? "2px solid #1d4ed8" : "2px solid transparent";
    }
  });
  if (tab === "map") setTimeout(() => window._passportMap?.invalidateSize(), 100);
  if (tab === "meters" && panelId) loadPanelMeters(panelId);
}

async function loadPanelMeters(panelId) {
  const wrap = document.getElementById("panelMetersContent");
  if (!wrap) return;
  wrap.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:20px">⏳ Уншиж байна...</div>`;

  let meters, allMeters;
  try {
    [meters, allMeters] = await Promise.all([
      api(`/api/mp/by-panel/${panelId}`),
      api("/api/mp").catch(() => []),
    ]);
  } catch(e) { wrap.innerHTML = `<div style="color:#dc2626;padding:16px">Алдаа: ${e.message}</div>`; return; }

  const canEd = ["director","chief_engineer","engineer","accountant"].includes(state.me?.role);
  const ownerBadge = o => ({OURS:"✅ Манайх",OTHER:"🔲 Бусад",TRANSFERRED:"🔄 Шилжүүлсэн"}[o] || o || "—");
  const linked = new Set(meters.map(m => m.id));

  wrap.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div>
      <div style="font-size:14px;font-weight:700;color:#1e293b">🔌 Тоолуурын бүртгэл</div>
      <div style="font-size:11px;color:#64748b">Энэ самбарт бүртгэлтэй тоолуурууд</div>
    </div>
    ${canEd ? `
    <div style="display:flex;align-items:center;gap:8px">
      <select id="meterLinkSel" style="padding:6px 10px;border:1px solid #e2e6ed;border-radius:8px;font-size:12px;outline:none;max-width:220px">
        <option value="">— Тоолуур холбох —</option>
        ${allMeters.filter(m=>!linked.has(m.id)&&m.status!=='REMOVED').map(m=>`<option value="${m.id}">${escapeHtml(m.meter_no)}${m.location?' · '+escapeHtml(m.location):''}</option>`).join("")}
      </select>
      <button class="btn" style="padding:6px 14px;font-size:12px" onclick="linkMeterToPanel(${panelId})">+ Холбох</button>
    </div>` : ""}
  </div>

  ${meters.length === 0 ? `
  <div style="text-align:center;padding:32px;color:#94a3b8;background:#f8f9fb;border-radius:12px;border:1px dashed #e2e6ed">
    <div style="font-size:28px;margin-bottom:8px">🔌</div>
    Тоолуур холбогдоогүй байна
  </div>` : `
  <div style="display:flex;flex-direction:column;gap:8px">
    ${meters.map(m=>`
    <div style="display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border:1px solid #e2e6ed;border-radius:10px;padding:10px 14px;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:#172033;font-family:monospace">${escapeHtml(m.meter_no)}</div>
        ${m.location?`<div style="font-size:11px;color:#64748b;margin-top:2px">📍 ${escapeHtml(m.location)}</div>`:""}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <span style="font-size:11px;padding:2px 10px;border-radius:20px;background:${m.owner_status==='OURS'?'#dcfce7':'#f1f5f9'};color:${m.owner_status==='OURS'?'#16a34a':'#475569'};font-weight:600">${ownerBadge(m.owner_status)}</span>
        <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${m.verified?'#eff6ff':'#fef9c3'};color:${m.verified?'#2563eb':'#a16207'};font-weight:600">${m.verified?'✓ Баталгаажсан':'❓ Хүлээгдэж буй'}</span>
        ${canEd?`<button onclick="unlinkMeterFromPanel(${m.id},${panelId})" style="border:none;background:none;cursor:pointer;color:#dc2626;font-size:14px;padding:2px 4px" title="Салгах">✕</button>`:""}
      </div>
    </div>`).join("")}
  </div>`}
  `;
}

async function linkMeterToPanel(panelId) {
  const sel = document.getElementById("meterLinkSel");
  if (!sel || !sel.value) return toast("Тоолуур сонгоно уу");
  try {
    await api(`/api/mp/${sel.value}/panel`, { method:"PUT", body:JSON.stringify({ panel_asset_id: panelId }) });
    toast("Тоолуур холбогдлоо ✓");
    loadPanelMeters(panelId);
  } catch(e) { toast("Алдаа: "+e.message); }
}

async function unlinkMeterFromPanel(meterId, panelId) {
  if (!confirm("Тоолуурыг энэ самбараас салгах уу?")) return;
  try {
    await api(`/api/mp/${meterId}/panel`, { method:"PUT", body:JSON.stringify({ panel_asset_id: null }) });
    toast("Салгагдлаа ✓");
    loadPanelMeters(panelId);
  } catch(e) { toast("Алдаа: "+e.message); }
}

function initPassportMap(lat, lng, name) {
  const mapEl = document.getElementById("passportMap");
  if (!mapEl) return;
  if (window._passportMap) {
    try { window._passportMap.remove(); } catch(e){}
    window._passportMap = null;
  }
  if (typeof L === "undefined") {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload = () => _createMap(mapEl, lat, lng, name);
    document.head.appendChild(js);
  } else {
    _createMap(mapEl, lat, lng, name);
  }
}

function _createMap(mapEl, lat, lng, name) {
  const map = L.map(mapEl).setView([lat, lng], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors", maxZoom: 19
  }).addTo(map);
  L.marker([lat, lng])
    .addTo(map)
    .bindPopup(`<b>${escapeHtml(name)}</b><br>${lat}, ${lng}`)
    .openPopup();
  window._passportMap = map;
}

let _lbImages = [], _lbIdx = 0;

function openLightbox(srcs, index = 0) {
  _lbImages = Array.isArray(srcs) ? srcs : [srcs];
  _lbIdx = index;
  _lbRender();
  const lb = document.getElementById("globalLightbox");
  if (lb) lb.style.display = "flex";
}

function _lbRender() {
  const img  = document.getElementById("lbImg");
  const cap  = document.getElementById("lbCaption");
  const prev = document.getElementById("lbPrev");
  const next = document.getElementById("lbNext");
  if (img) img.src = _lbImages[_lbIdx] || "";
  const multi = _lbImages.length > 1;
  if (prev) prev.style.display = multi ? "block" : "none";
  if (next) next.style.display = multi ? "block" : "none";
  if (cap)  cap.textContent = multi ? `${_lbIdx + 1} / ${_lbImages.length}` : "";
}

function lightboxNav(dir) {
  _lbIdx = (_lbIdx + dir + _lbImages.length) % _lbImages.length;
  _lbRender();
}

function closeLightbox() {
  const lb = document.getElementById("globalLightbox");
  if (lb) lb.style.display = "none";
  _lbImages = []; _lbIdx = 0;
}

function closePassport() {
  const m = document.getElementById("assetPassportModal");
  if (m) m.style.display = "none";
  if (window._passportMap) {
    try { window._passportMap.remove(); } catch(e){}
    window._passportMap = null;
  }
}

async function confirmDeleteAsset(id) {
  if (!confirm("Энэ объектийг бүртгэлээс хасах уу?")) return;
  try {
    await api(`/api/assets/${id}`, { method:"DELETE" });
    toast("Объект устгагдлаа ✓");
    closePassport();
    assets(window._assetCat);
  } catch(err) { toast("Алдаа: "+err.message); }
}

async function uploadAssetFiles(assetId, fileType, input) {
  if (!input?.files?.length) return;
  let ok = 0;
  for (const file of input.files) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("file_type", fileType);
    fd.append("description", file.name);
    try {
      await fetch(API + `/api/assets/${assetId}/files`, {
        method:"POST", headers:{"Authorization":"Bearer "+state.token}, body:fd
      });
      ok++;
    } catch(e) {}
  }
  toast(`${ok} файл хадгаллаа ✓`);
  openPassport(assetId);
}

async function deleteAssetFile(fileId, assetId) {
  if (!confirm("Файл устгах уу?")) return;
  try {
    await api(`/api/asset-files/${fileId}`, { method:"DELETE" });
    toast("Файл устгагдлаа ✓");
    openPassport(assetId);
  } catch(err) { toast("Алдаа: "+err.message); }
}

async function openSlDetail(id) {
  const modal = document.getElementById("slDetailModal");
  const inner = document.getElementById("slDetailInner");
  if (!modal || !inner) return;

  inner.innerHTML = `<div style="padding:48px;text-align:center;color:#667085">
    <div style="font-size:32px;margin-bottom:10px">⏳</div>Уншиж байна...
  </div>`;
  modal.style.display = "flex";

  let pt, meterPoints;
  try {
    [pt, meterPoints] = await Promise.all([
      api(`/api/sl-points/${id}`),
      api("/api/mp").catch(() => []),
    ]);
  } catch(e) { inner.innerHTML = `<div style="padding:24px;color:#dc2626">Алдаа: ${e.message}</div>`; return; }

  const canEdit = ["director","chief_engineer","engineer","camera_engineer"].includes(state.me.role);
  const photos  = pt.photos || [];
  const docs    = pt.docs   || [];
  const workPct = (pt.total_heads||pt.lamp_count||0) > 0
    ? Math.round(((pt.total_heads||pt.lamp_count) - 0) / (pt.total_heads||pt.lamp_count) * 100)
    : 100;

  inner.innerHTML = `
  <div style="background:linear-gradient(135deg,#1e3a5f 0%,#1d4ed8 100%);border-radius:16px 16px 0 0;padding:20px 24px;position:relative">
    <button onclick="closeSlDetail()" style="position:absolute;top:14px;right:14px;border:none;background:rgba(255,255,255,.15);color:#fff;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:13px">✕</button>
    <div style="font-size:10px;color:rgba(255,255,255,.5);letter-spacing:.15em;text-transform:uppercase;margin-bottom:6px">💡 ГУДАМЖНЫ ГЭРЭЛТҮҮЛЭГ · ПАСПОРТ</div>
    <div style="font-size:21px;font-weight:800;color:#fff;margin-bottom:6px">${escapeHtml(pt.name||"—")}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <span style="font-family:monospace;font-size:12px;background:rgba(255,255,255,.12);color:rgba(255,255,255,.85);padding:3px 10px;border-radius:6px">${escapeHtml(pt.code||"—")}</span>
      <span style="font-size:11px;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.12);color:#86efac">${pt.status==="active"||pt.status==="Идэвхтэй" ? "✓ Идэвхтэй" : "✗ Идэвхгүй"}</span>
      ${pt.location ? `<span style="font-size:11px;color:rgba(255,255,255,.6)">📍 ${escapeHtml(pt.location)}</span>` : ""}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:18px 20px;border-bottom:1px solid #f1f5f9">
    <div style="background:#eff6ff;border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#2563eb">${pt.lamp_count||0}</div>
      <div style="font-size:11px;color:#64748b">Нийт шон</div>
    </div>
    <div style="background:#f0f9ff;border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#0ea5e9">${pt.total_heads||pt.lamp_count||0}</div>
      <div style="font-size:11px;color:#64748b">Нийт толгой</div>
    </div>
    ${(pt.needs_poles||0) > 0 ? `
    <div style="background:#fff7ed;border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#d97706">${pt.needs_poles}</div>
      <div style="font-size:11px;color:#64748b">Нөхөх шон</div>
    </div>` : `
    <div style="background:#f0fdf4;border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#16a34a">${workPct}%</div>
      <div style="font-size:11px;color:#64748b">Асалтын хувь</div>
    </div>`}
    <div style="background:#f8f9fb;border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:14px;font-weight:700;color:#344054">${escapeHtml(pt.light_type||pt.wattage_per_lamp?(pt.wattage_per_lamp+"Вт"):"—")}</div>
      <div style="font-size:11px;color:#64748b">Гэрлийн төрөл</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px 20px;border-bottom:1px solid #f1f5f9">
    ${[
      ["📍 Байршил",          escapeHtml(pt.location||"—")],
      ["📅 Суурилуулсан огноо", pt.install_date||"—"],
      ["🏢 Байгууллага",      escapeHtml(pt.org_name||"—")],
      ["🗺 GPS",              pt.gps_lat && pt.gps_lng ? `${pt.gps_lat}, ${pt.gps_lng}` : "—"],
      ["📝 Тэмдэглэл",        escapeHtml(pt.notes||"—")],
    ].map(([l,v]) => `
      <div style="background:#f8f9fb;border:1px solid #e2e6ed;border-radius:8px;padding:10px 14px;display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:14px;flex-shrink:0;margin-top:1px">${l.split(" ")[0]}</span>
        <div>
          <div style="font-size:10px;color:#94a3b8;margin-bottom:2px">${l.split(" ").slice(1).join(" ")}</div>
          <div style="font-size:13px;font-weight:600;color:#172033">${v}</div>
        </div>
      </div>`).join("")}

    <div style="background:#f0f9ff;border:2px solid ${pt.meter_point_id?'#0ea5e9':'#e2e6ed'};border-radius:8px;padding:10px 14px;display:flex;gap:10px;align-items:flex-start;grid-column:1/-1">
      <span style="font-size:14px;flex-shrink:0;margin-top:1px">⚡</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;color:#94a3b8;margin-bottom:6px">Тоолуурын байршил — холбох</div>
        <select id="slMeterSelect_${id}" onchange="saveSlMeterLink(${id}, this)"
          style="width:100%;padding:7px 10px;border:1px solid #bae6fd;border-radius:8px;font-size:13px;font-weight:600;color:#0c4a6e;background:#fff;outline:none;cursor:pointer">
          <option value="">— Сонгох —</option>
          ${meterPoints.map(mp => `<option value="${mp.id}" data-meter-no="${escapeHtml(mp.meter_no||"")}"
            ${pt.meter_point_id === mp.id ? "selected" : ""}>
            ${escapeHtml(mp.meter_no||"")}${mp.location ? " · " + escapeHtml(mp.location) : ""}${mp.name ? " (" + escapeHtml(mp.name) + ")" : ""}
          </option>`).join("")}
        </select>
        ${pt.meter_point_id && pt.mp_location ? `<div style="font-size:11px;color:#0369a1;margin-top:4px">📍 ${escapeHtml(pt.mp_location)}</div>` : ""}
      </div>
    </div>
  </div>

  <div style="padding:14px 20px;border-bottom:1px solid #f1f5f9;background:${pt.gps_lat?'#f8faff':'#fff'}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="font-size:12px;font-weight:700;color:#344054">🗺 GPS координат</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${pt.gps_lat && pt.gps_lng ? `
        <a href="https://www.google.com/maps?q=${pt.gps_lat},${pt.gps_lng}" target="_blank"
          style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#2563eb;font-weight:600;text-decoration:none;background:#eff6ff;padding:5px 12px;border-radius:8px;border:1px solid #bfdbfe">
          🗺 Google Maps →
        </a>` : ""}
        ${canEdit ? `
        <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:8px;padding:5px 12px;font-weight:600">
          📎 KMZ / KML импортлох
          <input type="file" accept=".kmz,.kml" style="display:none" onchange="slKmzImport(${id},this)">
        </label>` : ""}
      </div>
    </div>
    ${canEdit ? `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input type="number" step="any" id="slGpsLat_${id}"
        value="${pt.gps_lat||""}" placeholder="Өргөрөг · 47.9136..."
        style="flex:1;min-width:160px;padding:7px 10px;border:1px solid #e2e6ed;border-radius:8px;font-size:13px;outline:none;font-family:monospace">
      <input type="number" step="any" id="slGpsLng_${id}"
        value="${pt.gps_lng||""}" placeholder="Уртраг · 114.5327..."
        style="flex:1;min-width:160px;padding:7px 10px;border:1px solid #e2e6ed;border-radius:8px;font-size:13px;outline:none;font-family:monospace">
      <button class="btn" style="padding:7px 16px;font-size:12px;white-space:nowrap" onclick="saveSlGps(${id})">💾 Хадгалах</button>
    </div>` : `
    <div style="font-family:monospace;font-size:13px;color:#344054;font-weight:600">
      ${pt.gps_lat && pt.gps_lng ? `${pt.gps_lat}, ${pt.gps_lng}` : '<span style="color:#94a3b8">GPS бүртгэгдээгүй</span>'}
    </div>`}
    <div id="slKmzResults_${id}" style="margin-top:10px"></div>
  </div>

  <div style="padding:14px 20px;border-bottom:1px solid #f1f5f9">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:#344054">📖 Паспорт баримт (${docs.length})</div>
      ${canEdit ? `
      <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;background:#faf5ff;color:#7c3aed;border:1px solid #ddd6fe;border-radius:8px;padding:6px 12px;font-weight:600">
        + Баримт нэмэх
        <input type="file" accept=".pdf,image/*" multiple style="display:none" onchange="uploadSlDoc(${id},this)">
      </label>` : ""}
    </div>
    ${docs.length ? `
    <div style="display:flex;flex-direction:column;gap:6px">
      ${docs.map(d => {
        const filePath = "/" + d.file_path.replace(/\\/g,"/").replace(/^.*uploads\//,"uploads/");
        const isPdf = (d.file_name||"").toLowerCase().endsWith(".pdf") || (d.file_path||"").toLowerCase().endsWith(".pdf");
        const ext = (d.file_name||"").split(".").pop().toUpperCase() || "FILE";
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#faf5ff;border:1px solid #ddd6fe;border-radius:10px">
          <div style="font-size:28px;flex-shrink:0">${isPdf ? "📄" : "🖼"}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:700;color:#5b21b6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(d.description||d.file_name||"Баримт")}</div>
            <div style="font-size:10px;color:#94a3b8">${ext} · ${(d.uploaded_at||"").slice(0,10)} · ${escapeHtml(d.uploader_name||"")}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn" style="padding:5px 12px;font-size:11px;background:#7c3aed;border-color:#7c3aed"
              onclick="openSlDocReader('${filePath}','${escapeHtml(d.description||d.file_name||"Баримт")}',${isPdf})">
              📖 Унших
            </button>
            ${canEdit ? `<button onclick="deleteSlDoc(${d.id},${id})"
              style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:8px;padding:5px 10px;font-size:11px;cursor:pointer">✕</button>` : ""}
          </div>
        </div>`;
      }).join("")}
    </div>` : `
    <div style="text-align:center;padding:20px;color:#94a3b8;background:#faf5ff;border-radius:10px;border:2px dashed #ddd6fe">
      <div style="font-size:28px;margin-bottom:6px">📖</div>
      <div style="font-size:12px">Паспорт баримт байхгүй байна</div>
      ${canEdit ? `<div style="font-size:11px;color:#a78bfa;margin-top:3px">PDF эсвэл зургаар scan хийж оруулна уу</div>` : ""}
    </div>`}
  </div>

  <div style="padding:16px 20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;color:#344054">📷 Зургийн галерей (${photos.length})</div>
      ${canEdit ? `
      <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:8px;padding:6px 12px;font-weight:600">
        + Зураг нэмэх
        <input type="file" accept="image/*" multiple style="display:none" onchange="uploadSlPhoto(${id}, this)">
      </label>` : ""}
    </div>
    ${photos.length ? (() => {
      const srcs = photos.map(p => "/" + p.file_path.replace(/\\/g,"/").replace(/^.*uploads\//,"uploads/"));
      const srcsJson = JSON.stringify(srcs);
      return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">
        ${photos.map((p,i) => {
          const src = srcs[i];
          return `<div style="border-radius:10px;overflow:hidden;border:1px solid #e2e6ed;position:relative;background:#f8f9fb">
            <img src="${src}" style="width:100%;height:120px;object-fit:cover;cursor:pointer;display:block"
              onclick="openLightbox(${srcsJson},${i})">
            <div style="padding:6px 8px">
              <div style="font-size:10px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.description||"")}</div>
              <div style="font-size:9px;color:#94a3b8">${(p.uploaded_at||"").slice(0,10)} · ${escapeHtml(p.uploader_name||"")}</div>
            </div>
            ${canEdit ? `<button onclick="deleteSlPhoto(${p.id},${id})"
              style="position:absolute;top:4px;right:4px;background:rgba(220,38,38,.85);color:#fff;border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer">✕</button>` : ""}
          </div>`;
        }).join("")}
      </div>`;
    })() : `
    <div style="text-align:center;padding:28px;color:#94a3b8;background:#f8f9fb;border-radius:10px;border:2px dashed #e2e6ed">
      <div style="font-size:28px;margin-bottom:6px">📷</div>
      <div style="font-size:12px">Зураг байхгүй байна</div>
      ${canEdit ? `<div style="font-size:11px;color:#bfdbfe;margin-top:4px">Дээрх товчоор зураг оруулна уу</div>` : ""}
    </div>`}
  </div>`;
}

function closeSlDetail() {
  const m = document.getElementById("slDetailModal");
  if (m) m.style.display = "none";
}

async function uploadSlDoc(slId, input) {
  if (!input?.files?.length) return;
  let ok = 0;
  for (const file of input.files) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("description", file.name.replace(/\.[^.]+$/, ""));
    try {
      await fetch(API + `/api/sl-points/${slId}/docs`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + state.token },
        body: fd
      });
      ok++;
    } catch(e) {}
  }
  toast(`${ok} баримт хадгаллаа ✓`);
  openSlDetail(slId);
}

async function deleteSlDoc(docId, slId) {
  if (!confirm("Баримт устгах уу?")) return;
  try {
    await api(`/api/sl-point-docs/${docId}`, { method: "DELETE" });
    toast("Баримт устгагдлаа ✓");
    openSlDetail(slId);
  } catch(e) { toast("Алдаа: " + e.message); }
}

let _pdfDoc = null, _pdfPage = 1, _pdfTotal = 0;

async function _loadPdfJs() {
  if (window.pdfjsLib) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      res();
    };
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function _renderPdfPage(pageNum) {
  if (!_pdfDoc) return;
  const page = await _pdfDoc.getPage(pageNum);
  const vw = Math.min(window.innerWidth - 40, 900);
  const viewport = page.getViewport({ scale: vw / page.getViewport({ scale: 1 }).width });
  const canvas = document.createElement("canvas");
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  canvas.style.cssText = "border-radius:6px;box-shadow:0 4px 24px rgba(0,0,0,.5);max-width:100%";
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  const body = document.getElementById("slDocReaderBody");
  if (body) { body.innerHTML = ""; body.appendChild(canvas); }
  const info = document.getElementById("slDocPageInfo");
  if (info) info.textContent = `${pageNum} / ${_pdfTotal} хуудас`;
  _pdfPage = pageNum;
}

async function openSlDocReader(filePath, title, isPdf) {
  const modal = document.getElementById("slDocReaderModal");
  const body  = document.getElementById("slDocReaderBody");
  const nav   = document.getElementById("slDocPageNav");
  const dl    = document.getElementById("slDocDownloadLink");
  document.getElementById("slDocReaderTitle").textContent = title;
  if (dl) { dl.href = filePath; dl.download = title; }
  modal.style.display = "flex";
  body.innerHTML = `<div style="color:rgba(255,255,255,.6);font-size:14px;margin-top:80px">⏳ Уншиж байна...</div>`;
  if (nav) nav.style.display = "none";

  if (isPdf) {
    try {
      await _loadPdfJs();
      _pdfDoc   = await pdfjsLib.getDocument(filePath).promise;
      _pdfTotal = _pdfDoc.numPages;
      _pdfPage  = 1;
      if (nav) nav.style.display = "flex";
      await _renderPdfPage(1);
    } catch(e) {
      body.innerHTML = `<div style="color:#fca5a5;margin-top:60px">PDF уншихад алдаа гарлаа: ${escapeHtml(e.message)}</div>`;
    }
  } else {
    body.innerHTML = `<img src="${filePath}" style="max-width:min(900px,100%);border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.5)">`;
  }
}

function closeSlDocReader() {
  const m = document.getElementById("slDocReaderModal");
  if (m) m.style.display = "none";
  _pdfDoc = null; _pdfPage = 1; _pdfTotal = 0;
}

async function slDocPage(dir) {
  const next = _pdfPage + dir;
  if (next < 1 || next > _pdfTotal) return;
  await _renderPdfPage(next);
}

async function saveSlGps(slId) {
  const lat = parseFloat(document.getElementById(`slGpsLat_${slId}`)?.value);
  const lng = parseFloat(document.getElementById(`slGpsLng_${slId}`)?.value);
  if (isNaN(lat) || isNaN(lng)) { toast("Координат буруу байна"); return; }
  try {
    await api(`/api/sl-points/${slId}/gps`, {
      method: "PUT",
      body: JSON.stringify({ gps_lat: lat, gps_lng: lng })
    });
    toast(`GPS хадгаллаа ✓ (${lat}, ${lng})`);
    openSlDetail(slId);
  } catch(e) { toast("Алдаа: " + e.message); }
}

async function _loadJszip() {
  if (window.JSZip) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

function _parseKml(kmlText) {
  const doc = new DOMParser().parseFromString(kmlText, "text/xml");
  const points = [];
  doc.querySelectorAll("Placemark").forEach(pm => {
    const name = pm.querySelector("name")?.textContent?.trim() || "";
    const desc = pm.querySelector("description")?.textContent?.trim() || "";
    const coordEl = pm.querySelector("Point coordinates") || pm.querySelector("coordinates");
    if (!coordEl) return;
    const parts = coordEl.textContent.trim().split(",");
    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng)) points.push({ name, desc, lat, lng });
  });
  return points;
}

async function slKmzImport(slId, input) {
  const file = input.files?.[0];
  if (!file) return;
  const resultsEl = document.getElementById(`slKmzResults_${slId}`);
  if (resultsEl) resultsEl.innerHTML = `<div style="color:#667085;font-size:12px;padding:6px 0">⏳ Уншиж байна...</div>`;

  try {
    let points = [];
    if (file.name.toLowerCase().endsWith(".kml")) {
      const text = await file.text();
      points = _parseKml(text);
    } else {
      await _loadJszip();
      const zip = await JSZip.loadAsync(file);
      const kmlName = Object.keys(zip.files).find(f => f.toLowerCase().endsWith(".kml"));
      if (!kmlName) throw new Error("KML файл олдсонгүй");
      const text = await zip.files[kmlName].async("string");
      points = _parseKml(text);
    }

    if (!resultsEl) return;
    if (!points.length) {
      resultsEl.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:6px 0">⚠ Координат олдсонгүй</div>`;
      return;
    }

    resultsEl.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:6px">📌 ${points.length} байршил олдлоо — сонгоно уу:</div>
    <div style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
      ${points.map((p,i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:#f8fafc;border:1px solid #e2e6ed;border-radius:8px">
        <div style="flex:1;min-width:0">
          ${p.name ? `<div style="font-size:12px;font-weight:700;color:#172033;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name)}</div>` : ""}
          <div style="font-family:monospace;font-size:11px;color:#64748b">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</div>
        </div>
        <button class="btn secondary" style="padding:4px 10px;font-size:11px;white-space:nowrap;flex-shrink:0"
          onclick="slSelectKmzPoint(${slId},${p.lat},${p.lng})">Сонгох</button>
      </div>`).join("")}
    </div>`;
  } catch(e) {
    if (resultsEl) resultsEl.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:6px 0">Алдаа: ${escapeHtml(e.message)}</div>`;
  }
  input.value = "";
}

function slSelectKmzPoint(slId, lat, lng) {
  const latEl = document.getElementById(`slGpsLat_${slId}`);
  const lngEl = document.getElementById(`slGpsLng_${slId}`);
  if (latEl) latEl.value = lat;
  if (lngEl) lngEl.value = lng;
  const resultsEl = document.getElementById(`slKmzResults_${slId}`);
  if (resultsEl) resultsEl.innerHTML = `<div style="color:#16a34a;font-size:12px;padding:4px 0;font-weight:600">✓ ${lat.toFixed(6)}, ${lng.toFixed(6)} — "Хадгалах" дарна уу</div>`;
}

async function saveSlMeterLink(slId, selectEl) {
  const opt = selectEl.options[selectEl.selectedIndex];
  const meterPointId = selectEl.value ? parseInt(selectEl.value) : null;
  const meterNo = opt ? (opt.dataset.meterNo || "") : "";
  try {
    await api(`/api/sl-points/${slId}/link-meter`, {
      method: "PUT",
      body: JSON.stringify({ meter_point_id: meterPointId, meter_no: meterNo })
    });
    selectEl.style.borderColor = meterPointId ? "#0ea5e9" : "#e2e6ed";
    selectEl.closest("[style*='background:#f0f9ff']").style.borderColor = meterPointId ? "#0ea5e9" : "#e2e6ed";
    toast(meterPointId ? `Тоолуур холбогдлоо ✓ (${meterNo})` : "Холбоос устгагдлаа ✓");
  } catch(e) { toast("Алдаа: " + (e.message || "Хадгалах боломжгүй")); }
}

async function uploadSlPhoto(slId, input) {
  if (!input?.files?.length) return;
  let ok = 0;
  for (const file of input.files) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("description", file.name);
    try {
      await fetch(API + `/api/sl-points/${slId}/photos`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + state.token },
        body: fd
      });
      ok++;
    } catch(e) {}
  }
  toast(`${ok} зураг хадгаллаа ✓`);
  openSlDetail(slId);
}

async function deleteSlPhoto(photoId, slId) {
  if (!confirm("Зураг устгах уу?")) return;
  try {
    await api(`/api/sl-point-photos/${photoId}`, { method: "DELETE" });
    toast("Зураг устгагдлаа ✓");
    openSlDetail(slId);
  } catch(e) { toast("Алдаа: " + e.message); }
}

async function slFaultQuickSave(inputEl) {
  const val  = parseInt(inputEl.value) || 0;
  const orig = parseInt(inputEl.dataset.orig) || 0;
  if (val === orig) return;

  const slId    = parseInt(inputEl.dataset.slid);
  const name    = inputEl.dataset.name;
  const heads   = parseInt(inputEl.dataset.heads) || 0;
  const faultId = parseInt(inputEl.dataset.fid) || 0;

  if (val < 0 || val > heads) {
    toast(`Буруу тоо (0–${heads})`);
    inputEl.value = orig || "";
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  try {
    if (faultId > 0) {
      await api(`/api/sl-faults/${faultId}`, {
        method: "PUT",
        body: JSON.stringify({
          category: "Авто замын гэрэл",
          location_id: slId,
          location_name: name,
          total_heads: heads,
          broken_count: val,
          report_date: todayStr,
        })
      });
    } else if (val > 0) {
      const r = await api("/api/sl-faults", {
        method: "POST",
        body: JSON.stringify({
          category: "Авто замын гэрэл",
          location_id: slId,
          location_name: name,
          location_type: "sl_point",
          total_heads: heads,
          broken_count: val,
          report_date: todayStr,
        })
      });
      inputEl.dataset.fid = r.id;
    }

    inputEl.dataset.orig       = val;
    inputEl.style.borderColor  = val > 0 ? "#fca5a5" : "#e2e6ed";
    inputEl.style.background   = val > 0 ? "#fef2f2" : "#fff";
    inputEl.style.color        = val > 0 ? "#dc2626" : "#94a3b8";
    toast(val > 0 ? `${name}: ${val} гэмтэл бүртгэгдлээ ✓` : "Хадгалагдлаа ✓");
  } catch(e) {
    toast("Алдаа: " + (e.message || "Хадгалах боломжгүй"));
    inputEl.value = orig || "";
  }
}

async function gerFaultQuickSave(inputEl) {
  const val  = parseInt(inputEl.value) || 0;
  const orig = parseInt(inputEl.dataset.orig) || 0;
  if (val === orig) return;
  const gerId   = parseInt(inputEl.dataset.gerid);
  const name    = inputEl.dataset.name;
  const heads   = parseInt(inputEl.dataset.heads) || 0;
  const faultId = parseInt(inputEl.dataset.fid) || 0;
  const cat     = inputEl.dataset.cat || "Гэр хорооллын гэрэл";
  if (val < 0 || val > heads) { toast(`Буруу тоо (0–${heads})`); inputEl.value = orig||""; return; }
  const todayStr = new Date().toISOString().slice(0, 10);
  try {
    if (faultId > 0) {
      await api(`/api/sl-faults/${faultId}`, { method:"PUT", body:JSON.stringify({
        category: cat, location_id: gerId, location_name: name,
        total_heads: heads, broken_count: val, report_date: todayStr,
      })});
    } else if (val > 0) {
      const r = await api("/api/sl-faults", { method:"POST", body:JSON.stringify({
        category: cat, location_id: gerId, location_name: name,
        location_type: "sl_ger_inventory", total_heads: heads,
        broken_count: val, report_date: todayStr,
      })});
      inputEl.dataset.fid = r.id;
    }
    inputEl.dataset.orig      = val;
    inputEl.style.borderColor = val > 0 ? "#fca5a5" : "#e2e6ed";
    inputEl.style.background  = val > 0 ? "#fef2f2" : "#fff";
    inputEl.style.color       = val > 0 ? "#dc2626" : "#94a3b8";
    toast(val > 0 ? `${name}: ${val} гэмтэл бүртгэгдлээ ✓` : "Хадгалагдлаа ✓");
  } catch(e) { toast("Алдаа: " + (e.message||"")); inputEl.value = orig||""; }
}

async function openGerDetail(id, cat) {
  const modal = document.getElementById("slDetailModal");
  const inner = document.getElementById("slDetailInner");
  if (!modal || !inner) return;
  inner.innerHTML = `<div style="padding:48px;text-align:center;color:#667085"><div style="font-size:32px;margin-bottom:10px">⏳</div>Уншиж байна...</div>`;
  modal.style.display = "flex";

  let rec, meterPoints;
  try {
    [rec, meterPoints] = await Promise.all([
      api(`/api/sl-ger-inventory/${id}`),
      api("/api/mp").catch(()=>[]),
    ]);
  } catch(e) { inner.innerHTML = `<div style="padding:24px;color:#dc2626">Алдаа: ${e.message}</div>`; return; }

  const canEdit = ["director","chief_engineer","engineer"].includes(state.me.role);
  const photos  = rec.photos || [];
  const docs    = rec.docs   || [];
  const isCamhag = cat === "Цамхагийн гэрэл";
  const catIcon  = isCamhag ? "🗼" : "🏘️";
  const catColor = isCamhag ? "#d97706" : "#0ea5e9";
  const heads    = rec.total_count || 0;

  inner.innerHTML = `
  <div style="background:linear-gradient(135deg,#1e3a5f 0%,${isCamhag?"#92400e":"#0369a1"} 100%);border-radius:16px 16px 0 0;padding:20px 24px;position:relative">
    <button onclick="closeSlDetail()" style="position:absolute;top:14px;right:14px;border:none;background:rgba(255,255,255,.15);color:#fff;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:13px">✕</button>
    <div style="font-size:10px;color:rgba(255,255,255,.5);letter-spacing:.15em;text-transform:uppercase;margin-bottom:6px">${catIcon} ${cat} · ПАСПОРТ</div>
    <div style="font-size:21px;font-weight:800;color:#fff;margin-bottom:6px">${escapeHtml(rec.location_name||"—")}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${rec.bag_no ? `<span style="font-size:11px;background:rgba(255,255,255,.12);color:rgba(255,255,255,.85);padding:3px 10px;border-radius:6px">${rec.bag_no}-р баг</span>` : ""}
      ${rec.light_type ? `<span style="font-size:11px;color:rgba(255,255,255,.6)">💡 ${escapeHtml(rec.light_type)}</span>` : ""}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:18px 20px;border-bottom:1px solid #f1f5f9">
    <div style="background:#eff6ff;border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#2563eb">${isCamhag?1:heads}</div>
      <div style="font-size:11px;color:#64748b">${isCamhag?"Шон":"Нийт шон"}</div>
    </div>
    <div style="background:#f0f9ff;border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:${catColor}">${heads}</div>
      <div style="font-size:11px;color:#64748b">Нийт толгой</div>
    </div>
    <div style="background:#f0fdf4;border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#16a34a">100%</div>
      <div style="font-size:11px;color:#64748b">Асалтын хувь</div>
    </div>
    <div style="background:#f8f9fb;border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:14px;font-weight:700;color:#344054">${escapeHtml(rec.light_type||"—")}</div>
      <div style="font-size:11px;color:#64748b">Гэрлийн төрөл</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px 20px;border-bottom:1px solid #f1f5f9">
    ${[
      ["📍 Байршил",      escapeHtml(rec.location_name||"—")],
      ["🏘 Баг",          rec.bag_no ? rec.bag_no+"-р баг" : "—"],
      ["📅 Суурилуулсан", rec.install_date||"—"],
      ["🏢 Байгууллага",  "Чойбалсан хөгжил ОНӨҮГ"],
      ["🗺 GPS",          rec.gps_lat&&rec.gps_lng ? `${rec.gps_lat}, ${rec.gps_lng}` : "—"],
      ["📝 Тэмдэглэл",   escapeHtml(rec.notes||"—")],
    ].map(([l,v]) => `
      <div style="background:#f8f9fb;border:1px solid #e2e6ed;border-radius:8px;padding:10px 14px;display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:14px;flex-shrink:0;margin-top:1px">${l.split(" ")[0]}</span>
        <div>
          <div style="font-size:10px;color:#94a3b8;margin-bottom:2px">${l.split(" ").slice(1).join(" ")}</div>
          <div style="font-size:13px;font-weight:600;color:#172033">${v}</div>
        </div>
      </div>`).join("")}

    <div style="background:#f0f9ff;border:2px solid ${rec.meter_point_id?'#0ea5e9':'#e2e6ed'};border-radius:8px;padding:10px 14px;display:flex;gap:10px;align-items:flex-start;grid-column:1/-1">
      <span style="font-size:14px;flex-shrink:0;margin-top:1px">⚡</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;color:#94a3b8;margin-bottom:6px">Тоолуурын байршил — холбох</div>
        <select id="gerMeterSelect_${id}" onchange="saveGerMeterLink(${id}, this)"
          style="width:100%;padding:7px 10px;border:1px solid #bae6fd;border-radius:8px;font-size:13px;font-weight:600;color:#0c4a6e;background:#fff;outline:none;cursor:pointer">
          <option value="">— Сонгох —</option>
          ${meterPoints.map(mp => `<option value="${mp.id}" data-meter-no="${escapeHtml(mp.meter_no||"")}"
            ${rec.meter_point_id===mp.id?"selected":""}>
            ${escapeHtml(mp.meter_no||"")}${mp.location?" · "+escapeHtml(mp.location):""}${mp.name?" ("+escapeHtml(mp.name)+")":""}
          </option>`).join("")}
        </select>
      </div>
    </div>
  </div>

  <div style="padding:14px 20px;border-bottom:1px solid #f1f5f9;background:${rec.gps_lat?'#f8faff':'#fff'}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="font-size:12px;font-weight:700;color:#344054">🗺 GPS координат</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${rec.gps_lat&&rec.gps_lng ? `<a href="https://www.google.com/maps?q=${rec.gps_lat},${rec.gps_lng}" target="_blank"
          style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#2563eb;font-weight:600;text-decoration:none;background:#eff6ff;padding:5px 12px;border-radius:8px;border:1px solid #bfdbfe">🗺 Google Maps →</a>` : ""}
        ${canEdit ? `<label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:8px;padding:5px 12px;font-weight:600">
          📎 KMZ / KML импортлох
          <input type="file" accept=".kmz,.kml" style="display:none" onchange="gerKmzImport(${id},this)">
        </label>` : ""}
      </div>
    </div>
    ${canEdit ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input type="number" step="any" id="gerGpsLat_${id}" value="${rec.gps_lat||""}" placeholder="Өргөрөг · 47.9136..."
        style="flex:1;min-width:160px;padding:7px 10px;border:1px solid #e2e6ed;border-radius:8px;font-size:13px;outline:none;font-family:monospace">
      <input type="number" step="any" id="gerGpsLng_${id}" value="${rec.gps_lng||""}" placeholder="Уртраг · 114.5327..."
        style="flex:1;min-width:160px;padding:7px 10px;border:1px solid #e2e6ed;border-radius:8px;font-size:13px;outline:none;font-family:monospace">
      <button class="btn" style="padding:7px 16px;font-size:12px;white-space:nowrap" onclick="saveGerGps(${id})">💾 Хадгалах</button>
    </div>` : `<div style="font-family:monospace;font-size:13px;color:#344054">${rec.gps_lat&&rec.gps_lng?`${rec.gps_lat}, ${rec.gps_lng}`:'<span style="color:#94a3b8">GPS бүртгэгдээгүй</span>'}</div>`}
    <div id="gerKmzResults_${id}" style="margin-top:10px"></div>
  </div>

  <div style="padding:14px 20px;border-bottom:1px solid #f1f5f9">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:#344054">📖 Паспорт баримт (${docs.length})</div>
      ${canEdit ? `<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;background:#faf5ff;color:#7c3aed;border:1px solid #ddd6fe;border-radius:8px;padding:6px 12px;font-weight:600">
        + Баримт нэмэх
        <input type="file" accept=".pdf,image/*" multiple style="display:none" onchange="uploadGerDoc(${id},this)">
      </label>` : ""}
    </div>
    ${docs.length ? `<div style="display:flex;flex-direction:column;gap:6px">
      ${docs.map(d => {
        const fp = "/" + d.file_path.replace(/\\/g,"/").replace(/^.*uploads\//,"uploads/");
        const isPdf = (d.file_name||d.file_path||"").toLowerCase().endsWith(".pdf");
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#faf5ff;border:1px solid #ddd6fe;border-radius:10px">
          <div style="font-size:28px;flex-shrink:0">${isPdf?"📄":"🖼"}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:700;color:#5b21b6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(d.description||d.file_name||"Баримт")}</div>
            <div style="font-size:10px;color:#94a3b8">${(d.uploaded_at||"").slice(0,10)} · ${escapeHtml(d.uploader_name||"")}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn" style="padding:5px 12px;font-size:11px;background:#7c3aed;border-color:#7c3aed"
              onclick="openSlDocReader('${fp}','${escapeHtml(d.description||d.file_name||"Баримт")}',${isPdf})">📖 Унших</button>
            ${canEdit?`<button onclick="deleteGerDoc(${d.id},${id},'${escapeHtml(cat)}')" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:8px;padding:5px 10px;font-size:11px;cursor:pointer">✕</button>`:""}
          </div>
        </div>`;
      }).join("")}
    </div>` : `<div style="text-align:center;padding:20px;color:#94a3b8;background:#faf5ff;border-radius:10px;border:2px dashed #ddd6fe">
      <div style="font-size:28px;margin-bottom:6px">📖</div><div style="font-size:12px">Паспорт баримт байхгүй байна</div>
    </div>`}
  </div>

  <div style="padding:16px 20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;color:#344054">📷 Зургийн галерей (${photos.length})</div>
      ${canEdit ? `<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:8px;padding:6px 12px;font-weight:600">
        + Зураг нэмэх <input type="file" accept="image/*" multiple style="display:none" onchange="uploadGerPhoto(${id},this)">
      </label>` : ""}
    </div>
    ${photos.length ? (() => {
      const srcs = photos.map(p => "/" + p.file_path.replace(/\\/g,"/").replace(/^.*uploads\//,"uploads/"));
      return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">
        ${photos.map((p,i) => `<div style="border-radius:10px;overflow:hidden;border:1px solid #e2e6ed;position:relative;background:#f8f9fb">
          <img src="${srcs[i]}" style="width:100%;height:120px;object-fit:cover;cursor:pointer;display:block"
            onclick="openLightbox(${JSON.stringify(srcs)},${i})">
          <div style="padding:6px 8px">
            <div style="font-size:10px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.description||"")}</div>
            <div style="font-size:9px;color:#94a3b8">${(p.uploaded_at||"").slice(0,10)} · ${escapeHtml(p.uploader_name||"")}</div>
          </div>
          ${canEdit?`<button onclick="deleteGerPhoto(${p.id},${id},'${escapeHtml(cat)}')"
            style="position:absolute;top:4px;right:4px;background:rgba(220,38,38,.85);color:#fff;border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer">✕</button>`:""}
        </div>`).join("")}
      </div>`;
    })() : `<div style="text-align:center;padding:28px;color:#94a3b8;background:#f8f9fb;border-radius:10px;border:2px dashed #e2e6ed">
      <div style="font-size:28px;margin-bottom:6px">📷</div><div style="font-size:12px">Зураг байхгүй байна</div>
    </div>`}
  </div>`;
}

async function saveGerGps(gerId) {
  const lat = parseFloat(document.getElementById(`gerGpsLat_${gerId}`)?.value);
  const lng = parseFloat(document.getElementById(`gerGpsLng_${gerId}`)?.value);
  if (isNaN(lat)||isNaN(lng)) { toast("Координат буруу байна"); return; }
  try {
    await api(`/api/sl-ger-inventory/${gerId}/gps`, { method:"PUT", body:JSON.stringify({gps_lat:lat,gps_lng:lng}) });
    toast(`GPS хадгаллаа ✓`); openGerDetail(gerId, document.getElementById("slDetailInner")?.dataset?.cat || "");
  } catch(e) { toast("Алдаа: "+e.message); }
}

async function saveGerMeterLink(gerId, selectEl) {
  const opt = selectEl.options[selectEl.selectedIndex];
  const meterPointId = selectEl.value ? parseInt(selectEl.value) : null;
  const meterNo = opt ? (opt.dataset.meterNo||"") : "";
  try {
    await api(`/api/sl-ger-inventory/${gerId}/link-meter`, { method:"PUT", body:JSON.stringify({meter_point_id:meterPointId,meter_no:meterNo}) });
    toast(meterPointId ? `Тоолуур холбогдлоо ✓ (${meterNo})` : "Холбоос устгагдлаа ✓");
  } catch(e) { toast("Алдаа: "+e.message); }
}

async function gerKmzImport(gerId, input) {
  const file = input.files?.[0]; if (!file) return;
  const res = document.getElementById(`gerKmzResults_${gerId}`);
  if (res) res.innerHTML = `<div style="color:#667085;font-size:12px;padding:6px 0">⏳ Уншиж байна...</div>`;
  try {
    let points = [];
    if (file.name.toLowerCase().endsWith(".kml")) { points = _parseKml(await file.text()); }
    else { await _loadJszip(); const zip = await JSZip.loadAsync(file); const kn = Object.keys(zip.files).find(f=>f.toLowerCase().endsWith(".kml")); if (!kn) throw new Error("KML файл олдсонгүй"); points = _parseKml(await zip.files[kn].async("string")); }
    if (!res) return;
    if (!points.length) { res.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:6px 0">⚠ Координат олдсонгүй</div>`; return; }
    res.innerHTML = `<div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:6px">📌 ${points.length} байршил олдлоо:</div>
    <div style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
      ${points.map(p=>`<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:#f8fafc;border:1px solid #e2e6ed;border-radius:8px">
        <div style="flex:1;min-width:0">
          ${p.name?`<div style="font-size:12px;font-weight:700;color:#172033">${escapeHtml(p.name)}</div>`:""}
          <div style="font-family:monospace;font-size:11px;color:#64748b">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</div>
        </div>
        <button class="btn secondary" style="padding:4px 10px;font-size:11px" onclick="gerSelectKmzPoint(${gerId},${p.lat},${p.lng})">Сонгох</button>
      </div>`).join("")}
    </div>`;
  } catch(e) { if (res) res.innerHTML = `<div style="color:#dc2626;font-size:12px">${escapeHtml(e.message)}</div>`; }
  input.value = "";
}

function gerSelectKmzPoint(gerId, lat, lng) {
  const latEl = document.getElementById(`gerGpsLat_${gerId}`);
  const lngEl = document.getElementById(`gerGpsLng_${gerId}`);
  if (latEl) latEl.value = lat; if (lngEl) lngEl.value = lng;
  const res = document.getElementById(`gerKmzResults_${gerId}`);
  if (res) res.innerHTML = `<div style="color:#16a34a;font-size:12px;padding:4px 0;font-weight:600">✓ ${lat.toFixed(6)}, ${lng.toFixed(6)} — "Хадгалах" дарна уу</div>`;
}

async function uploadGerPhoto(gerId, input) {
  if (!input?.files?.length) return;
  let ok = 0;
  for (const file of input.files) {
    const fd = new FormData(); fd.append("file",file); fd.append("description",file.name);
    try { await fetch(API+`/api/sl-ger-inventory/${gerId}/photos`,{method:"POST",headers:{"Authorization":"Bearer "+state.token},body:fd}); ok++; } catch(e){}
  }
  toast(`${ok} зураг хадгаллаа ✓`); openGerDetail(gerId, "");
}

async function deleteGerPhoto(photoId, gerId, cat) {
  if (!confirm("Зураг устгах уу?")) return;
  try { await api(`/api/sl-ger-photos/${photoId}`,{method:"DELETE"}); toast("Устгагдлаа ✓"); openGerDetail(gerId, cat); }
  catch(e) { toast("Алдаа: "+e.message); }
}

async function uploadGerDoc(gerId, input) {
  if (!input?.files?.length) return;
  let ok = 0;
  for (const file of input.files) {
    const fd = new FormData(); fd.append("file",file); fd.append("description",file.name.replace(/\.[^.]+$/,""));
    try { await fetch(API+`/api/sl-ger-inventory/${gerId}/docs`,{method:"POST",headers:{"Authorization":"Bearer "+state.token},body:fd}); ok++; } catch(e){}
  }
  toast(`${ok} баримт хадгаллаа ✓`); openGerDetail(gerId, "");
}

async function deleteGerDoc(docId, gerId, cat) {
  if (!confirm("Баримт устгах уу?")) return;
  try { await api(`/api/sl-ger-docs/${docId}`,{method:"DELETE"}); toast("Устгагдлаа ✓"); openGerDetail(gerId, cat); }
  catch(e) { toast("Алдаа: "+e.message); }
}

function slAssets(cat)     { window._slAssetMode = true; assets(cat); }
function sl_asset_road()   { slAssets("Авто замын гэрэл"); }
function sl_asset_ger()    { slAssets("Гэр хорооллын гэрэл"); }
function sl_asset_tower()  { slAssets("Цамхагийн гэрэл"); }
function sl_asset_signal() { slAssets("Гэрлэн дохио"); }
function sl_asset_panel()  { slAssets("Шит/Самбар"); }

Object.assign(window, {
  assets, filterAssets,
  slAssets, sl_asset_road, sl_asset_ger, sl_asset_tower, sl_asset_signal, sl_asset_panel,
  openAssetFlagModal, closeAssetFlagModal, saveAssetFlag, resolveAssetFlag,
  deleteGerRow, deleteSlPointRow,
  openAssetForm, closeAssetForm, saveAsset,
  openGerForm, closeGerForm, saveGerForm,
  openSlForm, closeSlForm, saveSlForm,
  openPassport, closePassport, switchPassportTab,
  loadPanelMeters, linkMeterToPanel, unlinkMeterFromPanel,
  confirmDeleteAsset, uploadAssetFiles, deleteAssetFile,
  openLightbox, closeLightbox, lightboxNav, slFaultQuickSave,
  openSlDetail, closeSlDetail, uploadSlPhoto, deleteSlPhoto,
  uploadSlDoc, deleteSlDoc, openSlDocReader, closeSlDocReader, slDocPage,
  saveSlMeterLink, saveSlGps, slKmzImport, slSelectKmzPoint,
  openGerDetail, gerFaultQuickSave,
  saveGerGps, saveGerMeterLink, gerKmzImport, gerSelectKmzPoint,
  uploadGerPhoto, deleteGerPhoto, uploadGerDoc, deleteGerDoc,
});
