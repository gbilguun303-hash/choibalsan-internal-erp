const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { run, all, get, auth, audit, upload } = require("../db");
const { requireRole, requirePermission } = require("../middleware/roles");
const { extractOpenAIText } = require("../services/assistant/openai");

const router = express.Router();

// ── Work categories (Ажлын категориуд) ──────────────────────────

router.get("/work-categories", auth, async (req, res) => {
  try {
    const cats = await all("SELECT * FROM work_categories WHERE is_active=1 ORDER BY sort_order, id");
    res.json(cats);
  } catch(e) { res.json([]); }
});

router.post("/work-categories", auth, requirePermission("engineering"), async (req, res) => {
  const { name, icon, color, department, sort_order } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Нэр оруулна уу" });
  try {
    const r = await run(
      "INSERT INTO work_categories (name,icon,color,department,sort_order) VALUES (?,?,?,?,?)",
      [name.trim(), icon||"📋", color||"#2563eb", department||"", Number(sort_order)||99]
    );
    await audit(req.user.id, "CREATE", "work_categories", r.id, name.trim());
    res.json({ id: r.id });
  } catch(e) {
    res.status(400).json({ error: "Нэр давхцаж байна" });
  }
});

router.put("/work-categories/:id", auth, requirePermission("engineering"), async (req, res) => {
  const { name, icon, color, department, sort_order, is_active } = req.body;
  try {
    await run(
      "UPDATE work_categories SET name=?,icon=?,color=?,department=?,sort_order=?,is_active=? WHERE id=?",
      [name||"", icon||"📋", color||"#2563eb", department||"",
       Number(sort_order)||99, is_active!==undefined?Number(is_active):1, req.params.id]
    );
    await audit(req.user.id, "UPDATE", "work_categories", req.params.id, name||"");
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

router.delete("/work-categories/:id", auth, requireRole("director"), async (req, res) => {
  await run("UPDATE work_categories SET is_active=0 WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "work_categories", req.params.id, "");
  res.json({ ok: true });
});

// ── Dashboard / Smart alerts ─────────────────────────────────

router.get("/admin-hub/dashboard", auth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const in30  = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const in7   = new Date(Date.now() +  7 * 864e5).toISOString().slice(0, 10);
  const ago7  = new Date(Date.now() -  7 * 864e5).toISOString().slice(0, 10);
  const canSeeAdmin = ["director", "hr", "chief_engineer"].includes(req.user.role);
  const dueWhere = canSeeAdmin ? "" : "AND assigned_to=?";
  const dueParams = canSeeAdmin ? [in7] : [in7, req.user.id];
  try {
    const [expiringContracts, dueDocs, recentLeave, archiveNeeded, openSafety, newCorr] = await Promise.all([
      canSeeAdmin ? all(`SELECT id, full_name, contract_type, contract_end, position, department,
                  CAST(julianday(contract_end) - julianday('now') AS INTEGER) days_left
           FROM users WHERE active=1 AND contract_end IS NOT NULL
             AND contract_end >= ? AND contract_end <= ? ORDER BY contract_end`,
          [today, in30]) : Promise.resolve([]),
      all(`SELECT id, doc_no, doc_date, subject, due_date, status, source_org,
                  CAST(julianday(due_date) - julianday('now') AS INTEGER) days_left
           FROM correspondence WHERE status NOT IN ('Хаасан','Биелсэн')
             AND due_date IS NOT NULL AND due_date != '' AND due_date <= ? ${dueWhere} ORDER BY due_date`,
          dueParams),
      canSeeAdmin ? all(`SELECT h.*, u.full_name employee_name FROM hr_records h
           LEFT JOIN users u ON u.id = h.user_id
           WHERE h.record_type IN ('Чөлөө','Өвчтэй','Ээлжийн амралт','Сургалт','Томилолт')
             AND h.created_at >= ? ORDER BY h.created_at DESC LIMIT 8`,
          [ago7]) : Promise.resolve([]),
      canSeeAdmin ? get(`SELECT COUNT(*) cnt FROM archive_docs WHERE status='Шилжүүлэх'`) : Promise.resolve({ cnt: 0 }),
      canSeeAdmin ? all(`SELECT id, title, risk_level, report_date, location FROM safety_reports
           WHERE status='Нээлттэй'
             AND date(report_date) <= date('now','-14 days') ORDER BY report_date LIMIT 6`) : Promise.resolve([]),
      get(`SELECT COUNT(*) cnt FROM correspondence WHERE status='Шинэ'
             AND doc_date >= date('now','-3 days') ${canSeeAdmin ? "" : "AND assigned_to=?"}`,
          canSeeAdmin ? [] : [req.user.id])
    ]);
    res.json({ expiringContracts, dueDocs, recentLeave,
               archiveNeeded: archiveNeeded?.cnt || 0,
               openSafety, newCorrCount: newCorr?.cnt || 0 });
  } catch (e) {
    res.json({ expiringContracts:[], dueDocs:[], recentLeave:[], archiveNeeded:0, openSafety:[], newCorrCount:0 });
  }
});

// ── Correspondence update / delete ───────────────────────────

router.get("/correspondence", auth, async (req, res) => {
  try {
    const canSeeAll = ["director", "hr", "chief_engineer"].includes(req.user.role);
    const where = canSeeAll ? "" : "WHERE c.assigned_to=?";
    const params = canSeeAll ? [] : [req.user.id];
    res.json(await all(
      `SELECT c.*, u.full_name assigned_name, cr.full_name created_name
       FROM correspondence c
       LEFT JOIN users u  ON u.id = c.assigned_to
       LEFT JOIN users cr ON cr.id = c.created_by
       ${where}
       ORDER BY c.doc_date DESC, c.id DESC`, params
    ));
  } catch (e) { res.json([]); }
});

router.post("/correspondence", auth, requirePermission("admin_hr"), async (req, res) => {
  const b = req.body;
  if (!b.subject || !b.doc_date) return res.status(400).json({ error: "Гарчиг болон огноо шаардлагатай" });
  const r = await run(
    `INSERT INTO correspondence(doc_type,doc_no,doc_date,source_org,subject,
       assigned_to,due_date,status,decision,created_by)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [b.doc_type||"Ирсэн", b.doc_no||"", b.doc_date, b.source_org||"",
     b.subject, b.assigned_to||null, b.due_date||null,
     b.status||"Шинэ", b.decision||"", req.user.id]
  );
  await audit(req.user.id, "CREATE", "correspondence", r.id, b.subject);
  res.json({ id: r.id });
});

router.put("/correspondence/:id", auth, requirePermission("admin_hr"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE correspondence SET doc_type=?,doc_no=?,doc_date=?,source_org=?,subject=?,
     assigned_to=?,due_date=?,status=?,decision=? WHERE id=?`,
    [b.doc_type||"Ирсэн", b.doc_no||"", b.doc_date||"", b.source_org||"",
     b.subject||"", b.assigned_to||null, b.due_date||null,
     b.status||"Шинэ", b.decision||"", req.params.id]);
  await audit(req.user.id, "UPDATE", "correspondence", req.params.id, b.subject||"");
  res.json({ ok: true });
});

router.delete("/correspondence/:id", auth, requirePermission("hr_write"), async (req, res) => {
  await run("DELETE FROM correspondence WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "correspondence", req.params.id, "");
  res.json({ ok: true });
});

// ── Orders / Decisions (Тушаал / Шийдвэр) ────────────────────

function correspondenceText(row) {
  return [row.doc_type, row.doc_no, row.doc_date, row.source_org, row.subject, row.decision, row.status, row.due_date]
    .filter(Boolean).join("\n");
}

function correspondenceAiSummary(row) {
  const due = row.due_date ? `Дуусах хугацаа: ${row.due_date}.` : "Хугацаа тодорхойгүй.";
  const action = row.due_date ? "хугацаанд нь хариу бэлтгэж илгээх" : "хариу шаардлагатай эсэхийг хариуцагчаар тогтоолгох";
  return [
    `Ирсэн бичиг: ${row.subject || "Гарчиггүй"}.`,
    `Илгээгч: ${row.source_org || "тодорхойгүй"}. ${due}`,
    `Санал болгож буй дараагийн алхам: ${action}.`,
    row.assigned_name ? `Одоогийн хариуцагч: ${row.assigned_name}.` : "Хариуцагч томилоогүй байна."
  ].join("\n");
}

function correspondenceDraft(row, responseType = "Мэдээлэл өгөх") {
  const org = row.source_org || "Танай байгууллагад";
  const no = row.doc_no ? ` ${row.doc_no} дугаартай` : "";
  const subject = row.subject || "ирүүлсэн албан бичиг";
  const intro = `${org}-аас ирүүлсэн${no} "${subject}" тухай албан бичигтэй танилцлаа.`;
  const bodies = {
    "Биелүүлсэн тухай": "Тус албан бичигт дурдсан асуудлыг холбогдох нэгжид танилцуулж, хэрэгжилтийг хангах арга хэмжээг зохион байгуулсан болно.",
    "Мэдээлэл өгөх": "Хүссэн мэдээллийг байгууллагын хэмжээнд нягталж, холбогдох мэдээллийг энэхүү албан бичгээр хүргүүлж байна.",
    "Хугацаа сунгах": "Асуудлыг бүрэн нягтлах, холбогдох нэгжүүдээс мэдээлэл авах шаардлагатай тул хариу өгөх хугацааг сунгаж өгөхийг хүсье.",
    "Шилжүүлэх": "Ирүүлсэн асуудал нь холбогдох эрх бүхий байгууллага, нэгжийн чиг үүрэгт хамаарах тул зохих журмын дагуу шилжүүлэн хүргүүлж байна.",
    "Татгалзах": "Ирүүлсэн хүсэлтийг судалж үзэхэд одоогийн эрх зүйн зохицуулалт, байгууллагын боломж нөхцөлөөр шийдвэрлэх боломжгүй байна."
  };
  return `${intro}\n\n${bodies[responseType] || bodies["Мэдээлэл өгөх"]}\n\nЦаашид нэмэлт мэдээлэл шаардлагатай бол манай байгууллагын холбогдох ажилтантай холбогдоно уу.\n\nХүндэтгэсэн,\nЧойбалсан хөгжил ОНӨҮГ`;
}

router.post("/correspondence/:id/ai-read", auth, async (req, res) => {
  const row = await get(
    `SELECT c.*, u.full_name assigned_name FROM correspondence c LEFT JOIN users u ON u.id=c.assigned_to WHERE c.id=?`,
    [req.params.id]);
  if (!row) return res.status(404).json({ error: "Албан бичиг олдсонгүй" });
  const summary = correspondenceAiSummary(row);
  await run("UPDATE correspondence SET ai_summary=? WHERE id=?", [summary, req.params.id]);
  await audit(req.user.id, "AI_READ", "correspondence", req.params.id, row.subject || "");
  res.json({ summary });
});

router.post("/correspondence/:id/reply-draft", auth, requirePermission("admin_hr"), async (req, res) => {
  const row = await get("SELECT * FROM correspondence WHERE id=?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Албан бичиг олдсонгүй" });
  const responseType = req.body?.response_type || "Мэдээлэл өгөх";
  const draft = correspondenceDraft(row, responseType);
  await run("UPDATE correspondence SET response_type=?, response_draft=?, status=? WHERE id=?",
    [responseType, draft, row.status === "Шинэ" ? "Биеэлж байна" : row.status, req.params.id]);
  await audit(req.user.id, "DRAFT_REPLY", "correspondence", req.params.id, row.subject || "");
  res.json({ response_type: responseType, draft });
});

router.post("/correspondence/:id/legal-check", auth, async (req, res) => {
  const row = await get("SELECT * FROM correspondence WHERE id=?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Албан бичиг олдсонгүй" });
  const text = correspondenceText(row);
  const analyzed = analyzeLegalText(text, row.subject || "Албан бичиг");
  const r = await run(
    `INSERT INTO legal_filter_runs (doc_name,source_type,source_ref,input_text,summary,result_json,risk_count,conflict_count,unclear_count,duplicate_count,suggestion_count,created_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [row.subject || "Албан бичиг", "letter", `letter:${row.id}`, text.slice(0, 8000), analyzed.summary, JSON.stringify(analyzed.items),
     analyzed.counts.risk_count, analyzed.counts.conflict_count, analyzed.counts.unclear_count, analyzed.counts.duplicate_count, analyzed.counts.suggestion_count, req.user.id]);
  await audit(req.user.id, "LEGAL_CHECK", "correspondence", req.params.id, row.subject || "");
  res.json({ id: r.id, summary: analyzed.summary, results: analyzed.items, ...analyzed.counts });
});

router.get("/admin-hub/orders", auth, async (req, res) => {
  try {
    res.json(await all(
      `SELECT o.*, u.full_name created_name, r.full_name related_name
       FROM orders_decisions o
       LEFT JOIN users u ON u.id = o.created_by
       LEFT JOIN users r ON r.id = o.related_user
       ORDER BY o.doc_date DESC, o.id DESC`));
  } catch (e) { res.json([]); }
});

router.get("/my-job-description", auth, async (req, res) => {
  const documents = await all(
    `SELECT o.id, o.doc_no, o.title, o.doc_type, o.doc_date, o.description,
            o.status, o.updated_at
     FROM orders_decisions o
     WHERE o.related_user=?
       AND o.doc_type='Албан тушаалын тодорхойлолт'
       AND o.status='Хүчинтэй'
     ORDER BY o.doc_date DESC, o.id DESC`,
    [req.user.id]
  );

  if (!documents.length) return res.json([]);

  const ids = documents.map(row => row.id);
  const placeholders = ids.map(() => "?").join(",");
  const attachments = await all(
    `SELECT id, entity_id, file_url, file_name, note, uploaded_at
     FROM doc_attachments
     WHERE entity_type='order' AND entity_id IN (${placeholders})
     ORDER BY uploaded_at ASC, id ASC`,
    ids
  );
  const filesByDocument = new Map();
  for (const file of attachments) {
    if (!filesByDocument.has(file.entity_id)) filesByDocument.set(file.entity_id, []);
    filesByDocument.get(file.entity_id).push(file);
  }

  res.json(documents.map(document => ({
    ...document,
    attachments: filesByDocument.get(document.id) || [],
  })));
});

router.post("/admin-hub/orders", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  if (!b.title || !b.doc_date) return res.status(400).json({ error: "Шаардлагатай талбар дутуу" });
  try {
    const r = await run(
      `INSERT INTO orders_decisions(doc_no,title,doc_type,doc_date,description,status,related_user,created_by)
       VALUES(?,?,?,?,?,?,?,?)`,
      [b.doc_no||"", b.title, b.doc_type||"Тушаал", b.doc_date,
       b.description||"", b.status||"Хүчинтэй", b.related_user||null, req.user.id]);
    await audit(req.user.id, "CREATE", "orders_decisions", r.id, `${b.doc_type||"Тушаал"}: ${b.title}`);
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/admin-hub/orders/:id", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE orders_decisions SET doc_no=?,title=?,doc_type=?,doc_date=?,description=?,
     status=?,related_user=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.doc_no||"", b.title, b.doc_type||"Тушаал", b.doc_date,
     b.description||"", b.status||"Хүчинтэй", b.related_user||null, req.params.id]);
  await audit(req.user.id, "UPDATE", "orders_decisions", req.params.id, b.title);
  res.json({ ok: true });
});

router.delete("/admin-hub/orders/:id", auth, requirePermission("hr_write"), async (req, res) => {
  await run("DELETE FROM orders_decisions WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "orders_decisions", req.params.id, "");
  res.json({ ok: true });
});

// ── Archive documents ────────────────────────────────────────

router.post("/admin-hub/orders/:id/legal-check", auth, async (req, res) => {
  const row = await get("SELECT * FROM orders_decisions WHERE id=?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Баримт олдсонгүй" });
  const text = [row.doc_type, row.doc_no, row.doc_date, row.title, row.description, row.status].filter(Boolean).join("\n");
  const sourceRef = `order:${row.id}`;
  const contextDocs = await legalContextDocs(sourceRef);
  const analyzed = await analyzeLegalTextAI(text, row.title || "Бодлогын баримт", contextDocs).catch(() => null) || analyzeLegalText(text, row.title || "Бодлогын баримт");
  const r = await run(
    `INSERT INTO legal_filter_runs (doc_name,source_type,source_ref,input_text,summary,result_json,risk_count,conflict_count,unclear_count,duplicate_count,suggestion_count,created_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [row.title || "Бодлогын баримт", "order", sourceRef, text.slice(0, 8000), analyzed.summary, JSON.stringify(analyzed.items),
     analyzed.counts.risk_count, analyzed.counts.conflict_count, analyzed.counts.unclear_count, analyzed.counts.duplicate_count, analyzed.counts.suggestion_count, req.user.id]);
  await audit(req.user.id, "LEGAL_CHECK", "orders_decisions", req.params.id, row.title || "");
  res.json({ id: r.id, doc_name: row.title || "Бодлогын баримт", summary: analyzed.summary, results: analyzed.items, ...analyzed.counts, ai_used: !!analyzed.ai_used, context_count: contextDocs.length });
});

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = u.protocol === "http:" ? http : https;
    client.get(url, {
      headers: { "User-Agent": "ChoibalsanERP/1.0" },
      ...(u.protocol === "https:" ? { rejectUnauthorized: false } : {}),
    }, r => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) {
        const nextUrl = new URL(r.headers.location, url).toString();
        return fetchText(nextUrl).then(resolve, reject);
      }
      let data = "";
      r.setEncoding("utf8");
      r.on("data", chunk => { data += chunk; });
      r.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseKhuralRows(html, sourceUrl) {
  const rows = [];
  const trMatches = String(html || "").match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trMatches) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => stripHtml(m[1]));
    const text = cells.join(" ");
    if (!/\d{4}-\d{2}-\d{2}/.test(text) || cells.length < 3) continue;
    const date = (text.match(/\d{4}-\d{2}-\d{2}/) || [""])[0];
    const number = cells.find(c => /^[0-9А-Яа-я/.-]{1,15}$/.test(c) && c !== date) || "";
    const title = cells.find(c => c.length > 12 && !c.includes("ИТХ-ын ТОГТООЛ")) || text.replace(date, "").replace(number, "").trim();
    rows.push({ title, doc_date: date, doc_no: number, doc_type: "ИТХ-ын тогтоол", source_url: sourceUrl });
  }
  if (!rows.length) {
    const plain = stripHtml(html);
    const re = /(\d+)\s+\|\s+(.+?)\s+ИТХ-ын ТОГТООЛ\s+\|\s+(\d{4}-\d{2}-\d{2})\s+\|\s+([^\s|]+)/g;
    let m;
    while ((m = re.exec(plain))) {
      rows.push({ title: m[2].trim(), doc_date: m[3], doc_no: m[4], doc_type: "ИТХ-ын тогтоол", source_url: sourceUrl });
    }
  }
  return rows;
}

router.get("/khural-resolutions/search", auth, async (req, res) => {
  const sourceUrl = req.query.url || "https://dornod.khural.mn/togtool";
  const keywords = String(req.query.q || "Чойбалсан хөгжил,ОНӨҮГ,ОНӨААТҮГ,хөрөнгө,өмч")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  try {
    const html = await fetchText(sourceUrl);
    const rows = parseKhuralRows(html, sourceUrl);
    const matched = rows.filter(r => {
      const text = [r.title, r.doc_no, r.doc_date].join(" ").toLowerCase();
      return keywords.some(k => text.includes(k));
    });
    res.json({ source_url: sourceUrl, keywords, rows: matched, total: rows.length });
  } catch(e) {
    res.status(502).json({ error: "hural.mn-ээс мэдээлэл татаж чадсангүй: " + e.message });
  }
});

router.post("/khural-resolutions/import", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.doc_date) return res.status(400).json({ error: "Гарчиг, огноо шаардлагатай" });
  const exists = await get("SELECT id FROM orders_decisions WHERE doc_no=? AND title=?", [b.doc_no || "", b.title]);
  if (exists) return res.json({ id: exists.id, duplicate: true });
  const r = await run(
    `INSERT INTO orders_decisions(doc_no,title,doc_type,doc_date,description,status,created_by)
     VALUES(?,?,?,?,?,?,?)`,
    [b.doc_no || "", b.title, b.doc_type || "ИТХ-ын тогтоол", b.doc_date, b.source_url || "", "Хүчинтэй", req.user.id]);
  await audit(req.user.id, "IMPORT", "orders_decisions", r.id, `khural: ${b.title}`);
  res.json({ id: r.id });
});

router.get("/admin-hub/archive", auth, async (req, res) => {
  const { category, status, q } = req.query;
  let sql = `SELECT a.*, u.full_name created_name FROM archive_docs a
    LEFT JOIN users u ON u.id = a.created_by WHERE 1=1`;
  const params = [];
  if (category) { sql += " AND a.category=?"; params.push(category); }
  if (status)   { sql += " AND a.status=?";   params.push(status); }
  if (q)        { sql += " AND (a.title LIKE ? OR a.doc_no LIKE ? OR a.description LIKE ?)"; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  sql += " ORDER BY a.date_archived DESC, a.id DESC";
  try { res.json(await all(sql, params)); } catch (e) { res.json([]); }
});

router.post("/admin-hub/archive", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  if (!b.title || !b.date_archived) return res.status(400).json({ error: "Шаардлагатай талбар дутуу" });
  try {
    const r = await run(
      `INSERT INTO archive_docs(title,category,doc_no,doc_date,date_archived,box_no,shelf_no,retention_years,status,description,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [b.title, b.category||"Бусад", b.doc_no||"", b.doc_date||"",
       b.date_archived, b.box_no||"", b.shelf_no||"",
       Number(b.retention_years||10), b.status||"Идэвхтэй",
       b.description||"", req.user.id]);
    await audit(req.user.id, "CREATE", "archive_docs", r.id, b.title);
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/admin-hub/archive/:id", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE archive_docs SET title=?,category=?,doc_no=?,doc_date=?,date_archived=?,
     box_no=?,shelf_no=?,retention_years=?,status=?,description=?,
     updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.title, b.category||"Бусад", b.doc_no||"", b.doc_date||"",
     b.date_archived, b.box_no||"", b.shelf_no||"",
     Number(b.retention_years||10), b.status||"Идэвхтэй",
     b.description||"", req.params.id]);
  await audit(req.user.id, "UPDATE", "archive_docs", req.params.id, b.title);
  res.json({ ok: true });
});

router.delete("/admin-hub/archive/:id", auth, requireRole("director"), async (req, res) => {
  await run("DELETE FROM archive_docs WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "archive_docs", req.params.id, "");
  res.json({ ok: true });
});

// ── Байгуулллагын тохиргоо ──────────────────────────────────

router.get("/org-settings", auth, async (req, res) => {
  const rows = await all(`SELECT key, value FROM org_settings`);
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

router.put("/org-settings", auth, requirePermission("hr_write"), async (req, res) => {
  const allowed = ["org_name","director","address","phone","register","email","notice"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      await run(`INSERT INTO org_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        [key, req.body[key] || ""]);
    }
  }
  await audit(req.user.id, "UPDATE", "org_settings", 0, "org info updated");
  res.json({ ok: true });
});

// ── Байгуулллагын гэрээ (org contracts) ─────────────────────

router.get("/org-contracts", auth, async (req, res) => {
  const { type } = req.query;
  let sql = `SELECT c.*, u.full_name created_name FROM org_contracts c
    LEFT JOIN users u ON u.id = c.created_by WHERE 1=1`;
  const params = [];
  if (type) { sql += " AND c.contract_type=?"; params.push(type); }
  sql += " ORDER BY c.created_at DESC, c.id DESC";
  try { res.json(await all(sql, params)); } catch (e) { res.json([]); }
});

router.post("/org-contracts", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  if (!b.title) return res.status(400).json({ error: "Гэрээний нэр оруулна уу" });
  try {
    const r = await run(
      `INSERT INTO org_contracts(contract_no,title,contract_type,counterparty,start_date,end_date,amount,status,description,
       register_no,phone,email,signed_date,responsible_person,details,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.contract_no||"", b.title, b.contract_type||"Бусад", b.counterparty||"",
       b.start_date||"", b.end_date||"", Number(b.amount||0),
       b.status||"Хүчинтэй", b.description||"",
       b.register_no||"", b.phone||"", b.email||"",
       b.signed_date||"", b.responsible_person||"", b.details||"{}", req.user.id]);
    await audit(req.user.id, "CREATE", "org_contracts", r.id, `${b.contract_type}: ${b.title}`);
    res.json({ id: r.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/org-contracts/:id", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  await run(
    `UPDATE org_contracts SET contract_no=?,title=?,contract_type=?,counterparty=?,
     start_date=?,end_date=?,amount=?,status=?,description=?,
     register_no=?,phone=?,email=?,signed_date=?,responsible_person=?,details=?,
     updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.contract_no||"", b.title, b.contract_type||"Бусад", b.counterparty||"",
     b.start_date||"", b.end_date||"", Number(b.amount||0),
     b.status||"Хүчинтэй", b.description||"",
     b.register_no||"", b.phone||"", b.email||"",
     b.signed_date||"", b.responsible_person||"", b.details||"{}",
     req.params.id]);
  await audit(req.user.id, "UPDATE", "org_contracts", req.params.id, b.title);
  res.json({ ok: true });
});

router.delete("/org-contracts/:id", auth, requirePermission("hr_write"), async (req, res) => {
  await run("DELETE FROM org_contracts WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "org_contracts", req.params.id, "");
  res.json({ ok: true });
});

// Deprecated: see docs/deprecated-endpoints.md
router.post("/org-contracts/:id/scan", auth, requirePermission("hr_write"), upload.single("scan"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл олдсонгүй" });
  const url = "/uploads/" + req.file.filename;
  await run("UPDATE org_contracts SET scan_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    [url, req.params.id]);
  await audit(req.user.id, "UPDATE", "org_contracts", req.params.id, "scan uploaded");
  res.json({ url });
});

// ── Contract scans (multiple) ─────────────────────────────────
router.get("/org-contracts/:id/scans", auth, async (req, res) => {
  const rows = await all("SELECT * FROM contract_scans WHERE contract_id=? ORDER BY id ASC", [req.params.id]);
  res.json(rows);
});

router.post("/org-contracts/:id/scans", auth, requirePermission("hr_write"), upload.single("scan"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл олдсонгүй" });
  const url = "/uploads/" + req.file.filename;
  const r = await run(
    "INSERT INTO contract_scans(contract_id,url,filename,uploaded_by) VALUES(?,?,?,?)",
    [req.params.id, url, req.file.originalname, req.user.id]
  );
  await audit(req.user.id, "CREATE", "contract_scans", r.lastID, "scan uploaded");
  res.json({ id: r.lastID, url, filename: req.file.originalname });
});

router.delete("/org-contracts/:id/scans/:scanId", auth, requirePermission("hr_write"), async (req, res) => {
  await run("DELETE FROM contract_scans WHERE id=? AND contract_id=?", [req.params.scanId, req.params.id]);
  res.json({ ok: true });
});

// ── HR records PUT (leave approve/update) ────────────────────

router.put("/hr-records/:id", auth, requirePermission("hr_write"), async (req, res) => {
  const b = req.body;
  const hasHourData = ["work_hours", "leave_hours", "overtime_hours"]
    .some(key => b[key] !== undefined && b[key] !== null && b[key] !== "");
  const workHours = hasHourData ? Number(b.work_hours || 0) : null;
  const leaveHours = hasHourData ? Number(b.leave_hours || 0) : null;
  const overtimeHours = hasHourData ? Number(b.overtime_hours || 0) : null;
  if (hasHourData && [workHours, leaveHours, overtimeHours].some(v => !Number.isFinite(v) || v < 0 || v > 24))
    return res.status(400).json({ error: "Цагийн утга 0-24 хооронд байна" });
  if (hasHourData && workHours + leaveHours > 8)
    return res.status(400).json({ error: "Ажилласан болон чөлөө/тасалсан цагийн нийлбэр 8-аас их байж болохгүй" });
  if (hasHourData) {
    await run(
      `UPDATE hr_records
       SET record_type=?,start_date=?,end_date=?,work_hours=?,leave_hours=?,overtime_hours=?,note=?
       WHERE id=?`,
      [b.record_type, b.start_date, b.end_date||null, workHours, leaveHours, overtimeHours,
       b.note||"", req.params.id]);
  } else {
    await run(
      `UPDATE hr_records SET record_type=?,start_date=?,end_date=?,note=? WHERE id=?`,
      [b.record_type, b.start_date, b.end_date||null, b.note||"", req.params.id]);
  }
  await audit(req.user.id, "UPDATE", "hr_records", req.params.id, b.record_type);
  res.json({ ok: true });
});

router.delete("/hr-records/:id", auth, requirePermission("hr_write"), async (req, res) => {
  await run("DELETE FROM hr_records WHERE id=?", [req.params.id]);
  await audit(req.user.id, "DELETE", "hr_records", req.params.id, "");
  res.json({ ok: true });
});

// ── Doc Attachments (scan upload for any document type) ───────

router.get("/doc-attachments", auth, async (req, res) => {
  const { entity_type, entity_id } = req.query;
  if (!entity_type || !entity_id)
    return res.status(400).json({ error: "entity_type, entity_id шаардлагатай" });
  const rows = await all(
    `SELECT d.*, u.full_name uploaded_name
     FROM doc_attachments d
     LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.entity_type=? AND d.entity_id=?
     ORDER BY d.uploaded_at ASC`,
    [entity_type, Number(entity_id)]
  );
  res.json(rows);
});

router.post("/doc-attachments/upload", auth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл шаардлагатай" });
  const { entity_type, entity_id, note } = req.body;
  if (!entity_type || !entity_id)
    return res.status(400).json({ error: "entity_type, entity_id шаардлагатай" });
  const file_url  = `/uploads/${req.file.filename}`;
  const file_name = Buffer.from(req.file.originalname, "latin1").toString("utf8");
  const r = await run(
    `INSERT INTO doc_attachments(entity_type,entity_id,file_url,file_name,note,uploaded_by)
     VALUES(?,?,?,?,?,?)`,
    [entity_type, Number(entity_id), file_url, file_name, note||"", req.user.id]
  );
  const row = await get(
    `SELECT d.*, u.full_name uploaded_name FROM doc_attachments d
     LEFT JOIN users u ON u.id=d.uploaded_by WHERE d.id=?`, [r.id]
  );
  res.json(row);
});

router.put("/doc-attachments/:id", auth, async (req, res) => {
  const { note } = req.body;
  await run("UPDATE doc_attachments SET note=? WHERE id=?", [note||"", req.params.id]);
  res.json({ ok: true });
});

router.delete("/doc-attachments/:id", auth, async (req, res) => {
  const row = await get("SELECT * FROM doc_attachments WHERE id=?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Олдсонгүй" });
  if (row.uploaded_by !== req.user.id && !["director","hr"].includes(req.user.role))
    return res.status(403).json({ error: "Эрх хүрэхгүй" });
  try {
    const fp = require("path").join(__dirname, "..", row.file_url);
    require("fs").unlink(fp, () => {});
  } catch(_) {}
  await run("DELETE FROM doc_attachments WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

// ── Asset categories (Хөрөнгийн ангилал) ─────────────────────

// Legal filter (AI-assisted document review)
function lfSnippet(text, idx, len = 180) {
  const start = Math.max(0, idx - 50);
  const raw = String(text || "").slice(start, start + len).replace(/\s+/g, " ").trim();
  return raw || String(text || "").slice(0, len).replace(/\s+/g, " ").trim();
}

function lfPush(items, category, level, section, explanation, suggestion) {
  items.push({ category, level, section, explanation, suggestion });
}

const LEGAL_AUDIT_DOMAINS = [
  { law:"Хөдөлмөрийн тухай хууль", scope:"Хөдөлмөрийн гэрээ, ажлын цаг, амралт, чөлөө, сахилга, цалин хөлс", keywords:["хөдөлмөр","ажлын цаг","илүү цаг","амралт","чөлөө","сахилга","цалин","ажилтан","ажил олгогч"], risks:["ажлын цаг/амралтын зохицуулалт дутуу","сахилгын арга хэмжээ тодорхойгүй","гэрээний хугацаа, үүрэг давхар утгатай"] },
  { law:"Хөдөлмөрийн аюулгүй байдал, эрүүл ахуйн тухай хууль", scope:"Аюулгүй ажиллагаа, зааварчилгаа, хамгаалах хэрэгсэл, осол, эрсдэлийн үнэлгээ", keywords:["аюулгүй","хабэа","осол","эрсдэл","хамгаалах хэрэгсэл","зааварчилгаа","ажлын байрны нөхцөл"], risks:["аюулгүй ажиллагааны үүрэг тодорхойгүй","зааварчилгаа/бүртгэл нотлох хэсэг дутуу","осол мэдээлэх хугацаа, хариуцагчгүй"] },
  { law:"Монгол Улсын засаг захиргаа, нутаг дэвсгэрийн нэгж, түүний удирдлагын тухай хууль", scope:"Орон нутгийн чиг үүрэг, эрх хэмжээ, Засаг дарга/Хуралтай уялдах шийдвэр", keywords:["засаг дарга","хурал","орон нутаг","нутаг дэвсгэр","баг","сум","аймаг","чиг үүрэг"], risks:["эрх хэмжээний үндэслэл тодорхойгүй","дээд шатны шийдвэртэй зөрөх магадлал","батлах субъект буруу байх эрсдэл"] },
  { law:"Татварын ерөнхий хууль", scope:"Татвар ногдуулах, тайлагнах, суутгах, төлөх, НӨАТ/И-баримттай холбоотой үүрэг", keywords:["татвар","нөат","и-баримт","суутгал","тайлан","төлбөрийн баримт","орлого"], risks:["татварын баримт, суутгалын үүрэг дутуу","тайлагнах хугацаа тодорхойгүй","гэрээний дүн татвар орсон эсэх тодорхойгүй"] },
  { law:"Нягтлан бодох бүртгэлийн тухай хууль", scope:"Анхан шатны баримт, бүртгэл, санхүүгийн тайлан, хөрөнгө/өр төлбөрийн тооллого", keywords:["нягтлан","анхан шатны баримт","санхүүгийн тайлан","тооллого","бүртгэл","акт","данс"], risks:["анхан шатны баримтын бүрдэл дутуу","санхүүгийн бүртгэлд тусгах нөхцөл тодорхойгүй","тооллого, актлах журамгүй"] },
  { law:"Төрийн болон орон нутгийн өмчийн тухай хууль", scope:"Орон нутгийн өмч эзэмших, ашиглуулах, шилжүүлэх, түрээслэх, актлах, тоолох", keywords:["өмч","орон нутгийн өмч","түрээс","эзэмшүүлэх","ашиглуулах","актлах","хөрөнгө","баланс"], risks:["өмч ашиглуулах эрх зүйн үндэслэл дутуу","актлах/шилжүүлэх зөвшөөрөл тодорхойгүй","хөрөнгийн бүртгэл, балансын мөр тодорхойгүй"] },
  { law:"Төрийн болон орон нутгийн өмчийн хөрөнгөөр бараа, ажил, үйлчилгээ худалдан авах тухай хууль", scope:"Тендер, шууд худалдан авалт, үнэлгээ, гэрээ, гүйцэтгэл, баталгаа", keywords:["тендер","худалдан авах","үнэлгээ","гүйцэтгэгч","үнийн санал","баталгаа","гүйцэтгэл","сонгон шалгаруулалт"], risks:["сонгон шалгаруулалтын арга тодорхойгүй","үнэлгээний шалгуур/баримт дутуу","гүйцэтгэл, баталгааны нөхцөл сул"] },
  { law:"Төсвийн тухай хууль / Шилэн дансны тухай хууль", scope:"Төсөв, зарцуулалт, тайлагнал, шилэн дансны мэдээлэл, төсвийн сахилга", keywords:["төсөв","зарцуулалт","санхүүжилт","шилэн данс","тайлагнах","санхүүжилтийн эх үүсвэр"], risks:["төсвийн эх үүсвэр, зориулалт тодорхойгүй","нийтэд мэдээлэх/тайлагнах үүрэг дутуу","зарцуулалтын хяналт сул"] },
];

function analyzeLegalText(text, docName = "") {
  const src = String(text || "").trim();
  const lower = src.toLowerCase();
  const items = [];
  const rules = [
    { category:"Эрсдэлтэй заалт", level:"Өндөр", patterns:["алданги","торгууль","хариуцлага хүлээнэ","гэрээг цуцлах","нууцлал","хохирол"], explanation:"Санхүүгийн болон гэрээ цуцлах эрсдэлтэй үүрэг, хариуцлагын заалт илэрлээ.", suggestion:"Хариуцлагын хэмжээ, нөхцөл, хугацаа, батлах баримтыг тодорхой тоон утга болон журамтай болгох." },
    { category:"Зөрчилдөж болзошгүй заалт", level:"Дунд", patterns:["ажлын цаг","илүү цаг","амралт","чөлөө","сахилгын"], explanation:"Хөдөлмөрийн харилцаа, дотоод журамтай давхцах эсвэл зөрөх магадлалтай хэсэг байна.", suggestion:"Хөдөлмөрийн гэрээ, дотоод журам, холбогдох хуультай тулгаж заалтын хамрах хүрээг тодруулах." },
    { category:"Ойлгомжгүй нэр томьёо", level:"Бага", patterns:["шаардлагатай тохиолдолд","боломжтой бол","зохих журмын дагуу","бусад","шаардлагатай гэж үзвэл"], explanation:"Хэрэгжилт дээр өөр өөрөөр тайлбарлагдах ерөнхий хэллэг илэрлээ.", suggestion:"Нөхцөл, хариуцагч, хугацаа, шалгуурыг нэрлэж тодорхой заах." },
    { category:"Сайжруулах санал", level:"Бага", patterns:["мэдэгдэнэ","тайлагнана","хүлээлгэн өгнө","баталгаажуулна"], explanation:"Гүйцэтгэлийн мөрдөх хугацаа эсвэл нотлох баримтын төрөл тодруулах боломжтой.", suggestion:"Мэдэгдэх суваг, хугацаа, хүлээн авагч, хавсаргах баримтыг нэг мөрөөр нэмэх." },
  ];
  for (const d of LEGAL_AUDIT_DOMAINS) {
    const hits = d.keywords.filter(k => lower.includes(k.toLowerCase()));
    if (hits.length) {
      lfPush(items, "Зөрчилдөж болзошгүй заалт", hits.length >= 3 ? "Өндөр" : "Дунд",
        lfSnippet(src, lower.indexOf(hits[0].toLowerCase())),
        `${d.law}-ийн хүрээнд хөндлөнгийн аудитын тулгалт хийх шаардлагатай. Хамрах хүрээ: ${d.scope}. Илэрсэн түлхүүр: ${hits.slice(0, 4).join(", ")}.`,
        `Шалгах checklist: ${d.risks.join("; ")}. Холбогдох эрх хэмжээ, хугацаа, баримт, хариуцагчийг заалтад тодорхой тусгах.`);
    }
  }
  for (const rule of rules) {
    for (const p of rule.patterns) {
      const idx = lower.indexOf(p.toLowerCase());
      if (idx >= 0) {
        lfPush(items, rule.category, rule.level, lfSnippet(src, idx), rule.explanation, rule.suggestion);
        break;
      }
    }
  }
  const sentences = src.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 24);
  const seen = new Map();
  for (const s of sentences) {
    const key = s.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").slice(0, 90);
    if (seen.has(key)) {
      lfPush(items, "Давхардсан зохицуулалт", "Дунд", s.slice(0, 220), "Ижил утгатай зохицуулалт нэгээс олон удаа давтагдсан байж болзошгүй.", "Давхардсан заалтыг нэгтгэж, ишлэл эсвэл бүлгийн дугаараар холбох.");
      break;
    }
    seen.set(key, true);
  }
  if (!items.length && src) {
    lfPush(items, "Сайжруулах санал", "Бага", src.slice(0, 220), "Илэрхий өндөр эрсдэлтэй түлхүүр заалт олдсонгүй. AI шүүлт нь хуульчийн эцсийн дүгнэлтийг орлохгүй.", "Баримтын зорилго, хүчинтэй хугацаа, хариуцах нэгж, батлах шатлалыг гараар тулгах.");
  }
  const counts = {
    risk_count: items.filter(x => x.category === "Эрсдэлтэй заалт").length,
    conflict_count: items.filter(x => x.category === "Зөрчилдөж болзошгүй заалт").length,
    unclear_count: items.filter(x => x.category === "Ойлгомжгүй нэр томьёо").length,
    duplicate_count: items.filter(x => x.category === "Давхардсан зохицуулалт").length,
    suggestion_count: items.filter(x => x.category === "Сайжруулах санал").length,
  };
  const summary = `${docName || "Баримт"}: ${items.length} илрүүлэлт (${counts.risk_count} эрсдэл, ${counts.conflict_count} зөрчил, ${counts.unclear_count} ойлгомжгүй, ${counts.duplicate_count} давхардал).`;
  return { items, counts, summary };
}

function parseLooseJson(text) {
  const raw = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(raw); } catch (_) {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

async function callOpenAIJson(system, user, maxChars = 16000) {
  if (!process.env.OPENAI_API_KEY || typeof fetch !== "function") return null;
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1",
      input: [
        { role: "system", content: system },
        { role: "user", content: String(user || "").slice(0, maxChars) },
      ],
      store: false,
    }),
  });
  if (!r.ok) return null;
  const data = await r.json();
  return parseLooseJson(extractOpenAIText(data));
}

function normalizeLegalAiResult(ai, docName, fallbackText = "") {
  const cats = new Set(Object.keys(LEGAL_FILTER_META));
  const levels = new Set(["Өндөр", "Дунд", "Бага"]);
  const rows = Array.isArray(ai?.items) ? ai.items : Array.isArray(ai?.results) ? ai.results : [];
  const items = rows.slice(0, 20).map(x => ({
    category: cats.has(x.category) ? x.category : "Сайжруулах санал",
    level: levels.has(x.level) ? x.level : "Бага",
    section: String(x.section || x.quote || fallbackText.slice(0, 220) || "—").slice(0, 500),
    explanation: String(x.explanation || x.reason || "").slice(0, 800),
    suggestion: String(x.suggestion || x.recommendation || "").slice(0, 800),
  })).filter(x => x.explanation || x.suggestion || x.section !== "—");
  if (!items.length) return null;
  const counts = {
    risk_count: items.filter(x => x.category === "Эрсдэлтэй заалт").length,
    conflict_count: items.filter(x => x.category === "Зөрчилдөж болзошгүй заалт").length,
    unclear_count: items.filter(x => x.category === "Ойлгомжгүй нэр томьёо").length,
    duplicate_count: items.filter(x => x.category === "Давхардсан зохицуулалт").length,
    suggestion_count: items.filter(x => x.category === "Сайжруулах санал").length,
  };
  return {
    items,
    counts,
    summary: String(ai?.summary || `${docName || "Баримт"}: AI шүүлтээр ${items.length} илрүүлэлт гарлаа.`).slice(0, 600),
    ai_used: true,
  };
}

async function analyzeLegalTextAI(text, docName, contextDocs = []) {
  const system = `Чи байгууллагын HR/legal аудитын туслах. Зөвхөн Монгол хэлээр бич.
Хариуг ЗӨВХӨН JSON object хэлбэрээр буцаа. Markdown бүү ашигла.
JSON schema:
{
  "summary": "товч дүгнэлт",
  "items": [
    {
      "category": "Эрсдэлтэй заалт|Зөрчилдөж болзошгүй заалт|Ойлгомжгүй нэр томьёо|Давхардсан зохицуулалт|Сайжруулах санал",
      "level": "Өндөр|Дунд|Бага",
      "section": "баримтын тухайн хэсэг эсвэл ишлэл",
      "explanation": "яагаад асуудалтай/анхаарах тухай",
      "suggestion": "засах санал"
    }
  ]
}
Хуулийн эцсийн дүгнэлт мэт бүү бич. "урьдчилсан аудитын анхааруулга" гэж байршуул.
Хамрах чиглэл: ${LEGAL_AUDIT_DOMAINS.map(d => d.law).join("; ")}.`;
  const user = JSON.stringify({
    task: "Баримтыг байгууллагын өмнөх баримтууд болон хууль/дотоод журмын audit checklist-тэй тулгаж шүү.",
    doc_name: docName,
    document_text: String(text || "").slice(0, 9000),
    context_documents: contextDocs.slice(0, 12).map(d => ({
      type: d.type || d.doc_type || d.source_type,
      no: d.doc_no || "",
      title: d.title || "",
      text: String(d.extra || d.description || "").slice(0, 500),
    })),
  });
  const ai = await callOpenAIJson(system, user);
  return normalizeLegalAiResult(ai, docName, text);
}

async function legalContextDocs(excludeRef = "") {
  const rows = await all(`SELECT id, title, doc_no, doc_type type, description extra, created_at FROM orders_decisions ORDER BY created_at DESC LIMIT 30`).catch(() => []);
  return rows
    .map(r => ({ ...r, source_ref: `order:${r.id}` }))
    .filter(r => r.source_ref !== excludeRef);
}

async function legalSourceText(sourceType, sourceId) {
  let row = null;
  if (sourceType === "contract") row = await get("SELECT *, contract_no doc_no, contract_type doc_type FROM org_contracts WHERE id=?", [sourceId]);
  if (sourceType === "letter") row = await get("SELECT *, subject title FROM correspondence WHERE id=?", [sourceId]);
  if (sourceType === "order") row = await get("SELECT * FROM orders_decisions WHERE id=?", [sourceId]);
  if (sourceType === "document") row = await get("SELECT * FROM documents WHERE id=?", [sourceId]);
  if (!row) return null;
  return {
    row,
    name: row.title || row.subject || row.contract_no || row.doc_no || "ERP баримт",
    text: [row.doc_type, row.contract_type, row.doc_no, row.doc_date, row.issued_date, row.title, row.subject, row.description, row.decision, row.details, row.counterparty, row.status].filter(Boolean).join("\n"),
  };
}

async function adviseLegalAI({ question, docName, text, sourceRef, contextDocs }) {
  const system = `Чи байгууллагын "Хуульч AI" зөвлөх горим. Зөвхөн Монгол хэлээр бич.
Энэ нь хуульчийн эцсийн дүгнэлт биш, HR-д зориулсан урьдчилсан audit зөвлөгөө.
Зөвхөн өгсөн баримт, context дээр үндэслэ. Тааж зохиохгүй.
Хариуг ЗӨВХӨН JSON object хэлбэрээр буцаа:
{
  "decision": "Баталж болно|Засварлаад батална|Батлахын өмнө дахин шалгана",
  "answer": "товч зөвлөгөө",
  "risks": ["эрсдэл 1", "эрсдэл 2"],
  "related_laws": ["холбогдох хууль/журам"],
  "suggestions": ["өөрчлөх санал 1", "өөрчлөх санал 2"],
  "missing": ["дутуу мэдээлэл 1"]
}
Хамрах чиглэл: ${LEGAL_AUDIT_DOMAINS.map(d => d.law).join("; ")}.`;
  const user = JSON.stringify({
    question: question || "Энэ баримтыг баталж болох уу?",
    doc_name: docName,
    source_ref: sourceRef,
    document_text: String(text || "").slice(0, 9000),
    context_documents: (contextDocs || []).slice(0, 12).map(d => ({
      type: d.type || "",
      no: d.doc_no || "",
      title: d.title || "",
      text: String(d.extra || "").slice(0, 700),
    })),
  });
  const ai = await callOpenAIJson(system, user, 16000);
  if (!ai?.answer && !ai?.decision) return null;
  return {
    ai_used: true,
    decision: String(ai.decision || "Батлахын өмнө дахин шалгана").slice(0, 80),
    answer: String(ai.answer || "").slice(0, 1600),
    risks: Array.isArray(ai.risks) ? ai.risks.slice(0, 8).map(x => String(x).slice(0, 400)) : [],
    related_laws: Array.isArray(ai.related_laws) ? ai.related_laws.slice(0, 8).map(x => String(x).slice(0, 240)) : [],
    suggestions: Array.isArray(ai.suggestions) ? ai.suggestions.slice(0, 8).map(x => String(x).slice(0, 400)) : [],
    missing: Array.isArray(ai.missing) ? ai.missing.slice(0, 8).map(x => String(x).slice(0, 300)) : [],
  };
}

async function draftLegalAI({ instruction, docName, text, sourceRef, contextDocs }) {
  const system = `Чи байгууллагын HR/legal баримтын засварын draft бичдэг туслах.
Зөвхөн Монгол хэлээр бич. Хуульчийн эцсийн дүгнэлт биш, засварын санал гэж байршуул.
Өгсөн заалтыг илүү тодорхой, хэрэгжихүйц, эрсдэл багатай, байгууллагын албан бичгийн хэл найруулгатай болгож дахин бич.
Хариуг ЗӨВХӨН JSON object хэлбэрээр буцаа:
{
  "draft_title": "богино гарчиг",
  "original_issue": "эх заалтын гол асуудал",
  "revised_text": "засварласан draft",
  "rationale": ["яагаад ингэж өөрчилсөн тайлбар"],
  "checklist": ["батлахаас өмнө шалгах зүйл"]
}
Дутуу мэдээлэл байвал revised_text-д тааж нэмэхгүй, checklist-д тусга.`;
  const user = JSON.stringify({
    instruction: instruction || "Энэ заалтыг засварын draft болгож өг.",
    doc_name: docName,
    source_ref: sourceRef,
    document_text: String(text || "").slice(0, 9000),
    context_documents: (contextDocs || []).slice(0, 10).map(d => ({
      type: d.type || "",
      no: d.doc_no || "",
      title: d.title || "",
      text: String(d.extra || "").slice(0, 500),
    })),
  });
  const ai = await callOpenAIJson(system, user, 16000);
  if (!ai?.revised_text) return null;
  return {
    ai_used: true,
    draft_title: String(ai.draft_title || "Засварын draft").slice(0, 120),
    original_issue: String(ai.original_issue || "").slice(0, 800),
    revised_text: String(ai.revised_text || "").slice(0, 4000),
    rationale: Array.isArray(ai.rationale) ? ai.rationale.slice(0, 8).map(x => String(x).slice(0, 500)) : [],
    checklist: Array.isArray(ai.checklist) ? ai.checklist.slice(0, 8).map(x => String(x).slice(0, 400)) : [],
  };
}

function docAskTerms(q) {
  const stop = new Set(["юм", "вэ", "бэ", "хэд", "ямар", "манай", "байгууллагын", "байна", "байсан", "гэж", "энэ", "тэр"]);
  return String(q || "").toLowerCase()
    .replace(/[^\p{L}\p{N}\s₮-]+/gu, " ")
    .split(/\s+/)
    .map(x => x.trim())
    .filter(x => x.length > 1 && !stop.has(x));
}

function docAskSnippet(text, terms) {
  const src = String(text || "").replace(/\s+/g, " ").trim();
  const lower = src.toLowerCase();
  let idx = -1;
  for (const t of terms) {
    idx = lower.indexOf(t.toLowerCase());
    if (idx >= 0) break;
  }
  const money = lower.search(/\d[\d,.\s]*₮|\d[\d,.\s]*(төг|төгрөг)/i);
  if (money >= 0 && (idx < 0 || Math.abs(money - idx) < 180)) idx = money;
  if (idx < 0) idx = 0;
  return src.slice(Math.max(0, idx - 120), Math.min(src.length, idx + 260));
}

function docAskScore(text, terms, question) {
  const lower = String(text || "").toLowerCase();
  let score = 0;
  for (const t of terms) {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const hits = lower.match(re);
    if (hits) score += hits.length * (t.length > 4 ? 3 : 2);
  }
  if (/тариф|үнэ|төлбөр|хураамж|дүн/i.test(question) && /\d[\d,.\s]*₮|\d[\d,.\s]*(төг|төгрөг)/i.test(lower)) score += 8;
  if (/камер|гэрэлтүүл|гэрэл|засвар/i.test(question) && /камер|гэрэлтүүл|гэрэл|засвар/i.test(lower)) score += 6;
  return score;
}

function docAskUrl(text) {
  const m = String(text || "").match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0] : "";
}

function docAskRefLabel(row) {
  return [row.type, row.doc_no].filter(Boolean).join(" ") || row.title || "Баримт";
}

async function answerLegalQuestionAI(question, matches) {
  if (!matches.length) return null;
  const system = `Чи байгууллагын бодлогын бичиг баримтаас асуултад хариулдаг туслах.
Зөвхөн өгсөн context баримтууд дээр үндэслэ. Тааж зохиохгүй.
Хариуг ЗӨВХӨН JSON object хэлбэрээр буцаа:
{
  "answer": "Монгол хэлээр товч, тодорхой хариулт",
  "used_source_ref": "order:123 гэх мэт",
  "confidence": 0.0-1.0
}
Хэрэв context хангалтгүй бол answer дээр "ERP дээр хадгалсан баримтаас хангалттай мэдээлэл олдсонгүй" гэж хэл.`;
  const user = JSON.stringify({
    question,
    context: matches.slice(0, 6).map(r => ({
      source_ref: `${r.source_type}:${r.id}`,
      type: r.type || "",
      doc_no: r.doc_no || "",
      doc_date: r.doc_date || "",
      title: r.title || "",
      text: String(r.text || "").slice(0, 1200),
    })),
  });
  const ai = await callOpenAIJson(system, user, 12000);
  if (!ai?.answer) return null;
  const used = matches.find(r => `${r.source_type}:${r.id}` === ai.used_source_ref) || matches[0];
  return {
    answer: String(ai.answer).slice(0, 1200),
    used,
    confidence: Number(ai.confidence || 0.65),
  };
}

router.post("/legal-filter/ask", auth, async (req, res) => {
  const question = String(req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "Асуулт оруулна уу" });
  const terms = docAskTerms(question);
  if (!terms.length) return res.status(400).json({ error: "Асуултаа арай тодорхой бичнэ үү" });
  const [contracts, letters, orders, docs] = await Promise.all([
    all(`SELECT id, title, contract_no doc_no, contract_type type, counterparty extra, description, status, COALESCE(NULLIF(signed_date,''), NULLIF(start_date,''), created_at) doc_date, created_at FROM org_contracts ORDER BY created_at DESC LIMIT 120`).catch(() => []),
    all(`SELECT id, subject title, doc_no, doc_type type, source_org extra, decision description, decision, status, doc_date, created_at FROM correspondence ORDER BY created_at DESC LIMIT 120`).catch(() => []),
    all(`SELECT id, title, doc_no, doc_type type, description, status, doc_date, created_at FROM orders_decisions ORDER BY created_at DESC LIMIT 180`).catch(() => []),
    all(`SELECT id, title, '' doc_no, doc_type type, issued_by extra, description, status, issued_date doc_date, created_at FROM documents ORDER BY created_at DESC LIMIT 120`).catch(() => []),
  ]);
  const pool = [
    ...contracts.map(r => ({ ...r, source_type: "contract" })),
    ...letters.map(r => ({ ...r, source_type: "letter" })),
    ...orders.map(r => ({ ...r, source_type: "order" })),
    ...docs.map(r => ({ ...r, source_type: "document" })),
  ].map(r => {
    const text = [r.title, r.doc_no, r.type, r.extra, r.description, r.decision, r.status].filter(Boolean).join("\n");
    return { ...r, text, source_url: docAskUrl(text), score: docAskScore(text, terms, question) };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  const top = pool[0];
  if (!top) {
    return res.json({
      answer: "Хадгалсан бодлогын бичиг баримтаас шууд тохирох мэдээлэл олдсонгүй. Холбогдох тогтоол, журам, тушаалын текст эсвэл тэмдэглэлийг нэмээд дахин асуугаарай.",
      matches: []
    });
  }
  const aiAnswer = await answerLegalQuestionAI(question, pool).catch(() => null);
  const answerSource = aiAnswer?.used || top;
  const answerSnippet = docAskSnippet(answerSource.text, terms);
  const docLabel = docAskRefLabel(answerSource);
  const answer = aiAnswer?.answer || `${docLabel}: "${answerSource.title || "гарчиггүй"}" баримтаас хамгийн ойр тохирох хэсэг олдлоо. ${answerSnippet}`;
  await audit(req.user.id, "ASK", "legal_filter", top.id, question.slice(0, 120));
  res.json({
    answer,
    answer_title: answerSource.title || "",
    answer_ref: docLabel,
    answer_date: answerSource.doc_date || "",
    answer_source_type: answerSource.source_type,
    answer_source_id: answerSource.id,
    answer_source_url: answerSource.source_url || "",
    answer_snippet: aiAnswer?.answer || answerSnippet,
    ai_used: !!aiAnswer,
    confidence: aiAnswer?.confidence || 0.45,
    matches: pool.map(r => ({
      id: r.id,
      source_type: r.source_type,
      source_ref: `${r.source_type}:${r.id}`,
      source_url: r.source_url || "",
      doc_no: r.doc_no || "",
      doc_date: r.doc_date || "",
      title: r.title || "",
      type: r.type || "",
      score: r.score,
      snippet: docAskSnippet(r.text, terms)
    }))
  });
});

router.post("/legal-filter/advice", auth, async (req, res) => {
  const b = req.body || {};
  const question = String(b.question || "Энэ баримтыг баталж болох уу?").trim();
  let docName = String(b.doc_name || "").trim();
  let text = String(b.text || "").trim();
  let sourceRef = "";
  if (b.source_type && b.source_id) {
    sourceRef = `${b.source_type}:${b.source_id}`;
    const src = await legalSourceText(b.source_type, b.source_id);
    if (src) {
      docName = docName || src.name;
      text = [text, src.text].filter(Boolean).join("\n");
    }
  }
  if (!text) return res.status(400).json({ error: "Зөвлөгөө авах текст эсвэл ERP баримт сонгоно уу" });
  const contextDocs = await legalContextDocs(sourceRef);
  const ai = await adviseLegalAI({ question, docName, text, sourceRef, contextDocs }).catch(() => null);
  if (ai) {
    await audit(req.user.id, "LEGAL_ADVICE", "legal_filter", 0, (docName || question).slice(0, 120));
    return res.json({ doc_name: docName || "Баримт", question, ...ai });
  }
  const fallback = analyzeLegalText(text, docName || "Баримт");
  res.json({
    ai_used: false,
    doc_name: docName || "Баримт",
    question,
    decision: fallback.counts.risk_count || fallback.counts.conflict_count ? "Батлахын өмнө дахин шалгана" : "Засварлаад батална",
    answer: "OpenAI зөвлөгөө авах боломжгүй тул rule-based урьдчилсан шалгалтын дүгнэлт харуулж байна.",
    risks: fallback.items.filter(x => ["Эрсдэлтэй заалт", "Зөрчилдөж болзошгүй заалт"].includes(x.category)).slice(0, 5).map(x => x.explanation),
    related_laws: LEGAL_AUDIT_DOMAINS.filter(d => text.toLowerCase().includes(d.keywords[0]?.toLowerCase() || "")).slice(0, 5).map(d => d.law),
    suggestions: fallback.items.slice(0, 6).map(x => x.suggestion).filter(Boolean),
    missing: ["Баримтын зорилго, эрх хэмжээ, хариуцагч, хугацаа, санхүүгийн эх үүсвэрийг гараар тулгана уу."],
  });
});

router.post("/legal-filter/draft", auth, async (req, res) => {
  const b = req.body || {};
  const instruction = String(b.instruction || "Энэ заалтыг засварын draft болгож өг.").trim();
  let docName = String(b.doc_name || "").trim();
  let text = String(b.text || "").trim();
  let sourceRef = "";
  if (b.source_type && b.source_id) {
    sourceRef = `${b.source_type}:${b.source_id}`;
    const src = await legalSourceText(b.source_type, b.source_id);
    if (src) {
      docName = docName || src.name;
      text = [text, src.text].filter(Boolean).join("\n");
    }
  }
  if (!text) return res.status(400).json({ error: "Draft гаргах текст эсвэл ERP баримт сонгоно уу" });
  const contextDocs = await legalContextDocs(sourceRef);
  const ai = await draftLegalAI({ instruction, docName, text, sourceRef, contextDocs }).catch(() => null);
  if (ai) {
    await audit(req.user.id, "LEGAL_DRAFT", "legal_filter", 0, (docName || instruction).slice(0, 120));
    return res.json({ doc_name: docName || "Баримт", instruction, ...ai });
  }
  const fallback = analyzeLegalText(text, docName || "Баримт");
  res.json({
    ai_used: false,
    doc_name: docName || "Баримт",
    instruction,
    draft_title: "Засварын draft",
    original_issue: fallback.items[0]?.explanation || "OpenAI draft авах боломжгүй байна.",
    revised_text: `${String(text).slice(0, 1200)}\n\n[Санал] Хариуцах этгээд, хэрэгжүүлэх хугацаа, эрх зүйн үндэслэл, санхүүгийн эх үүсвэр, нотлох баримтыг тодорхой тусгана уу.`,
    rationale: fallback.items.slice(0, 5).map(x => x.suggestion).filter(Boolean),
    checklist: ["Хариуцагч тодорхой эсэх", "Хугацаа тодорхой эсэх", "Эрх зүйн үндэслэл байгаа эсэх", "Санхүүгийн эх үүсвэр байгаа эсэх"],
  });
});

router.get("/legal-filter/sources", auth, async (_req, res) => {
  const [contracts, letters, orders, docs] = await Promise.all([
    all(`SELECT id, title, contract_no doc_no, contract_type type, counterparty extra, created_at FROM org_contracts ORDER BY created_at DESC LIMIT 80`).catch(() => []),
    all(`SELECT id, subject title, doc_no, doc_type type, source_org extra, created_at FROM correspondence ORDER BY created_at DESC LIMIT 80`).catch(() => []),
    all(`SELECT id, title, doc_no, doc_type type, COALESCE(NULLIF(description,''), status) extra, created_at FROM orders_decisions ORDER BY created_at DESC LIMIT 80`).catch(() => []),
    all(`SELECT id, title, '' doc_no, doc_type type, issued_by extra, created_at FROM documents ORDER BY created_at DESC LIMIT 80`).catch(() => []),
  ]);
  res.json([
    ...contracts.map(r => ({ ...r, source_type: "contract" })),
    ...letters.map(r => ({ ...r, source_type: "letter" })),
    ...orders.map(r => ({ ...r, source_type: "order" })),
    ...docs.map(r => ({ ...r, source_type: "document" })),
  ]);
});

router.get("/legal-filter/domains", auth, async (_req, res) => {
  res.json(LEGAL_AUDIT_DOMAINS);
});

router.get("/legal-filter/history", auth, async (_req, res) => {
  const rows = await all(`SELECT r.*, u.full_name created_name FROM legal_filter_runs r LEFT JOIN users u ON u.id=r.created_by ORDER BY r.created_at DESC, r.id DESC LIMIT 120`);
  res.json(rows.map(r => ({ ...r, results: JSON.parse(r.result_json || "[]") })));
});

router.post("/legal-filter/analyze", auth, upload.single("file"), async (req, res) => {
  const b = req.body || {};
  const fileUrl = req.file ? "/uploads/" + req.file.filename : "";
  const fileName = req.file?.originalname ? Buffer.from(req.file.originalname, "latin1").toString("utf8") : "";
  let docName = (b.doc_name || fileName || "Хуулийн шүүлт").trim();
  let text = String(b.text || "").trim();
  let sourceRef = b.source_ref || "";
  if (b.source_type && b.source_id) {
    sourceRef = `${b.source_type}:${b.source_id}`;
    let row = null;
    if (b.source_type === "contract") row = await get("SELECT * FROM org_contracts WHERE id=?", [b.source_id]);
    if (b.source_type === "letter") row = await get("SELECT * FROM correspondence WHERE id=?", [b.source_id]);
    if (b.source_type === "order") row = await get("SELECT * FROM orders_decisions WHERE id=?", [b.source_id]);
    if (b.source_type === "document") row = await get("SELECT * FROM documents WHERE id=?", [b.source_id]);
    if (row) {
      docName = docName === "Хуулийн шүүлт" ? (row.title || row.subject || row.contract_no || row.doc_no || docName) : docName;
      text = [text, row.title, row.subject, row.description, row.decision, row.details, row.contract_type, row.counterparty, row.status].filter(Boolean).join("\n");
    }
  }
  if (!text && fileName) text = `${fileName}\nФайлын агуулгыг paste хэсэгт нэмвэл илүү нарийвчилсан шинжилгээ гарна.`;
  if (!text) return res.status(400).json({ error: "Шинжлэх текст, файл эсвэл ERP баримт сонгоно уу" });
  const contextDocs = await legalContextDocs(sourceRef);
  const analyzed = await analyzeLegalTextAI(text, docName, contextDocs).catch(() => null) || analyzeLegalText(text, docName);
  const r = await run(
    `INSERT INTO legal_filter_runs (doc_name,source_type,source_ref,file_url,file_name,input_text,summary,result_json,risk_count,conflict_count,unclear_count,duplicate_count,suggestion_count,created_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [docName, b.source_type || (fileUrl ? "file" : "text"), sourceRef, fileUrl, fileName, text.slice(0, 8000), analyzed.summary, JSON.stringify(analyzed.items),
     analyzed.counts.risk_count, analyzed.counts.conflict_count, analyzed.counts.unclear_count, analyzed.counts.duplicate_count, analyzed.counts.suggestion_count, req.user.id]);
  await audit(req.user.id, "CREATE", "legal_filter_runs", r.id, docName);
  res.json({ id: r.id, doc_name: docName, summary: analyzed.summary, results: analyzed.items, ...analyzed.counts, file_url: fileUrl, ai_used: !!analyzed.ai_used });
});

router.put("/legal-filter/history/:id/improved", auth, requirePermission("hr_write"), async (req, res) => {
  await run("UPDATE legal_filter_runs SET improved=? WHERE id=?", [req.body?.improved ? 1 : 0, req.params.id]);
  await audit(req.user.id, "UPDATE", "legal_filter_runs", req.params.id, "improved");
  res.json({ ok: true });
});

router.put("/legal-filter/history/:id/status", auth, requirePermission("hr_write"), async (req, res) => {
  const allowed = ["Шинэ", "Засах шаардлагатай", "Зассан", "Баталсан", "Архивласан"];
  const status = allowed.includes(req.body?.status) ? req.body.status : "Шинэ";
  const improved = status === "Зассан" || status === "Баталсан" ? 1 : req.body?.improved ? 1 : 0;
  await run("UPDATE legal_filter_runs SET status=?, improved=? WHERE id=?", [status, improved, req.params.id]);
  await audit(req.user.id, "UPDATE", "legal_filter_runs", req.params.id, `status: ${status}`);
  res.json({ ok: true, status, improved });
});

router.get("/asset-categories", auth, async (req, res) => {
  try {
    res.json(await all("SELECT * FROM asset_categories WHERE is_active=1 ORDER BY sort_order, id"));
  } catch(e) { res.json([]); }
});

router.post("/asset-categories", auth, requirePermission("engineering"), async (req, res) => {
  const { name, icon, color, bg, border, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: "Нэр оруулна уу" });
  try {
    const r = await run(
      `INSERT INTO asset_categories(name,icon,color,bg,border,sort_order) VALUES(?,?,?,?,?,?)`,
      [name, icon||"📦", color||"#94a3b8", bg||"#f8fafc", border||"#e2e8f0", sort_order||99]);
    res.json({ id: r.id });
  } catch(e) {
    res.status(400).json({ error: "Нэр давхцаж байна" });
  }
});

router.put("/asset-categories/:id", auth, requirePermission("engineering"), async (req, res) => {
  const { name, icon, color, bg, border, sort_order, is_active } = req.body;
  try {
    await run(`UPDATE asset_categories SET name=?,icon=?,color=?,bg=?,border=?,sort_order=?,is_active=? WHERE id=?`,
      [name, icon||"📦", color||"#94a3b8", bg||"#f8fafc", border||"#e2e8f0",
       sort_order||99, is_active??1, req.params.id]);
    res.json({ ok: true });
  } catch(e) {
    res.status(400).json({ error: "Нэр давхцаж байна" });
  }
});

router.delete("/asset-categories/:id", auth, requireRole("director"), async (req, res) => {
  await run("UPDATE asset_categories SET is_active=0 WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
