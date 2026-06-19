const express = require("express");
const { run, all, get, auth, audit } = require("../db");
const { requirePermission } = require("../middleware/roles");
const multer  = require("multer");
const xlsx    = require("xlsx");
const path    = require("path");
const fs      = require("fs");

const upload = multer({ dest: path.join(__dirname, "../uploads") });
const router = express.Router();

// ── File-type detection ───────────────────────────────────────

function detectType(rows) {
  const t = String(rows[0]?.[0] || "").toUpperCase();
  if (t.includes("МӨНГӨН ХӨРӨНГИЙН ЖУРНАЛ"))  return "cash_journal";
  if (t.includes("ҮНДСЭН ХӨРӨНГИЙН"))           return "fixed_assets";
  if (t.includes("НЯРАВЫН ТАЙЛАН"))              return "material_trans";
  if (t.includes("АВЛАГА"))                      return "receivable";
  if (t.includes("ӨГЛӨГ"))                       return "payable";
  return null;
}

// ── Parsers ──────────────────────────────────────────────────

function parseCashJournal(rows) {
  const data = [];
  const norm = v => String(v || "").toLowerCase().replace(/\s+/g, "").replace(/[₮№"']/g, "");
  const num = v => {
    if (typeof v === "number") return v;
    const cleaned = String(v || "").replace(/,/g, "").trim();
    return Number(cleaned || 0);
  };
  const headerIdx = rows.findIndex(r => {
    const names = (r || []).map(norm);
    return names.includes("огноо") && names.includes("регистер") && names.includes("байгууллага") &&
      names.some(h => h.includes("орлого")) && names.some(h => h.includes("зарлага"));
  });
  const header = headerIdx >= 0 ? rows[headerIdx] : [];
  const col = (aliases, fallback) => {
    const found = header.findIndex(h => aliases.some(a => norm(h).includes(norm(a))));
    return found >= 0 ? found : fallback;
  };
  const c = {
    date: col(["Огноо"], 0),
    register: col(["Регистер"], 1),
    counterparty: col(["Байгууллага"], 2),
    income: col(["Орлого"], 3),
    expense: col(["Зарлага"], 4),
    balance: col(["Үлдэгдэл"], 5),
    rate: col(["Ханш"], 6),
    currency: col(["Валют"], 7),
    desc: col(["Гүйлгээний утга"], 8),
    corr: col(["Харьцсан данс"], 9),
    cashFlow: col(["Мөнгөн гүйлгээ тайлан"], 10),
  };

  for (let i = Math.max(headerIdx + 1, 2); i < rows.length; i++) {
    const r = rows[i];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r[c.date]||"").trim())) continue;
    const orlogo  = num(r[c.income]);
    const zarlaga = num(r[c.expense]);
    if (orlogo === 0 && zarlaga === 0) continue;
    data.push({
      txn_date:     String(r[c.date]).trim(),
      doc_no:       "",
      register:     String(r[c.register] || ""),
      counterparty: String(r[c.counterparty] || ""),
      txn_type:     (zarlaga > 0 && orlogo === 0) ? "Зарлага" : "Орлого",
      amount:       (zarlaga > 0 && orlogo === 0) ? zarlaga : orlogo,
      balance:      num(r[c.balance]),
      exchange_rate:num(r[c.rate]) || 1,
      currency:     String(r[c.currency] || "MNT"),
      txn_desc:     String(r[c.desc] || ""),
      corr_account: String(r[c.corr] || ""),
      cash_flow:    String(r[c.cashFlow] || ""),
      excess:       "",
      purpose:      "",
      source:       "",
      econ_cat:     "",
      transferor:   "",
      receiver:     "",
    });
  }
  return data;
}

function parseFixedAssets(rows) {
  const data = [];
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[2] || "").trim();
    if (!name) continue;
    data.push({
      account_code:      String(r[0] || ""),
      asset_code:        String(r[1] || ""),
      asset_name:        name,
      asset_model:       String(r[3] || ""),
      unit:              String(r[4] || "ш"),
      acquisition_date:  String(r[5] || ""),
      useful_life_years: Number(r[6] || 0),
      unit_value:        Number(r[7] || 0),
      initial_qty:       Number(r[8] || 0),
      initial_amount:    Number(r[9] || 0),
      intake_qty:        Number(r[10] || 0),
      intake_amount:     Number(r[11] || 0),
      issue_qty_fa:      Number(r[12] || 0),
      issue_amount_fa:   Number(r[13] || 0),
      improve_income:    Number(r[14] || 0),
      improve_expense:   Number(r[15] || 0),
      final_qty:         Number(r[16] || 0),
      final_amount:      Number(r[17] || 0),
      reval_opening:     Number(r[18] || 0),
      reval_disposed:    Number(r[19] || 0),
      reval_diff:        Number(r[20] || 0),
      depr_year_opening: Number(r[21] || 0),
      depr_opening:      Number(r[22] || 0),
      depr_disposed:     Number(r[23] || 0),
      depr_m1:           Number(r[24] || 0),
      depr_m2:           Number(r[25] || 0),
      depr_m3:           Number(r[26] || 0),
      depr_m4:           Number(r[27] || 0),
      depr_m5:           Number(r[28] || 0),
      depr_m6:           Number(r[29] || 0),
      depr_m7:           Number(r[30] || 0),
      depr_m8:           Number(r[31] || 0),
      depr_m9:           Number(r[32] || 0),
      depr_m10:          Number(r[33] || 0),
      depr_m11:          Number(r[34] || 0),
      depr_m12:          Number(r[35] || 0),
      depr_total_added:  Number(r[36] || 0),
      depr_deducted:     Number(r[37] || 0),
      accumulated_depreciation: Number(r[38] || 0),
      book_value:        Number(r[39] || 0),
    });
  }
  return data;
}

function parseMaterialTrans(rows) {
  const data = [];
  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[1] || "").trim();
    if (!name) continue;
    const init    = Number(r[5] || 0);
    const intake  = Number(r[7] || 0);
    const issue   = Number(r[11] || 0);
    data.push({
      group:         String(r[0] || ""),
      item_name:     name,
      unit:          String(r[2] || "ш"),
      barcode:       String(r[3] || ""),
      unit_price:    Number(r[4] || 0),
      initial_qty:   init,
      intake_qty:    intake,
      issue_qty:     issue,
      balance:       init + intake - issue,
    });
  }
  return data;
}

function parseBillPage(rows) {
  const data = [];
  let curAccount = "";
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const col0 = String(r[0] || "").trim();
    if (!col0) continue;
    if (/^\d+$/.test(col0)) { curAccount = col0; continue; }
    if (!col0.includes("РД:")) continue;
    const parts    = col0.split(/\s*[-–]\s*РД:/);
    const name     = (parts[0] || "").trim();
    const register = (parts[1] || "").trim();
    const final    = Number(r[5] || 0);
    if (!final) continue;
    data.push({
      name,
      register_no:  register,
      account_code: curAccount,
      initial_balance: Number(r[2] || 0),
      debit:        Number(r[3] || 0),
      credit:       Number(r[4] || 0),
      final_balance: final,
      city:         String(r[6] || ""),
    });
  }
  return data;
}

// ── Generic image upload ──────────────────────────────────────

router.post("/upload", auth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл оруулаагүй" });
  const ext = path.extname(req.file.originalname || "").toLowerCase() || ".jpg";
  const newName = req.file.filename + ext;
  const newPath = path.join(__dirname, "../uploads", newName);
  try { fs.renameSync(req.file.path, newPath); } catch(_) {}
  res.json({ url: `/uploads/${newName}` });
});

// ── Parse route ──────────────────────────────────────────────

router.post("/smart-import/parse", auth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл оруулаагүй" });
  try {
    const wb   = xlsx.readFile(req.file.path, { raw: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
    try { fs.unlinkSync(req.file.path); } catch(_) {}

    const type = detectType(rows);
    if (!type) return res.status(400).json({
      error: "Файлын төрлийг таниж чадсангүй",
      hint: String(rows[0]?.[0] || "")
    });

    let data;
    if      (type === "cash_journal")  data = parseCashJournal(rows);
    else if (type === "fixed_assets")  data = parseFixedAssets(rows);
    else if (type === "material_trans")data = parseMaterialTrans(rows);
    else                               data = parseBillPage(rows);

    res.json({ type, total: data.length, preview: data.slice(0, 8), data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Commit route ─────────────────────────────────────────────

router.post("/smart-import/commit", auth, requirePermission("smart_import"), async (req, res) => {
  const { type, data } = req.body;
  if (!data || !type) return res.status(400).json({ error: "Мэдээлэл дутуу" });
  const targetYear = Number(req.body.target_year || new Date().getFullYear());
  const targetMonth = Number(req.body.target_month || (new Date().getMonth() + 1));
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.target_date || ""))
    ? String(req.body.target_date)
    : `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;

  let inserted = 0, skipped = 0, errors = [];

  if (type === "cash_journal") {
    for (const r of data) {
      try {
        await run(
          `INSERT INTO cash_journal(txn_date,doc_no,txn_type,description,counterparty,register_no,
             corr_account,cash_flow_type,excess,purpose,source_fund,econ_category,transferor,receiver,
             amount,currency,exchange_rate,imported_balance,created_by)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [r.txn_date, r.doc_no||"", r.txn_type,
           r.txn_desc||r.counterparty||"", r.counterparty||"", r.register||"",
           r.corr_account||"", r.cash_flow||"", r.excess||"",
           r.purpose||"", r.source||"", r.econ_cat||"",
           r.transferor||"", r.receiver||"",
           Number(r.amount||0), r.currency||"MNT", Number(r.exchange_rate||1),
           r.balance === "" || r.balance === undefined ? null : Number(r.balance||0), req.user.id]);
        inserted++;
      } catch(e) { errors.push(e.message); }
    }
  }

  else if (type === "fixed_assets") {
    for (const r of data) {
      try {
        await run(
          `INSERT INTO fixed_assets_ledger
             (account_code,asset_code_manual,asset_name_manual,asset_model,unit,unit_value,initial_qty,
              acquisition_date,initial_value,useful_life_months,
              intake_qty,intake_amount,issue_qty_fa,issue_amount_fa,
              improve_income,improve_expense,final_qty,final_amount,
              reval_opening,reval_disposed,reval_diff,
              depr_year_opening,depr_opening,depr_disposed,
              depr_m1,depr_m2,depr_m3,depr_m4,depr_m5,depr_m6,
              depr_m7,depr_m8,depr_m9,depr_m10,depr_m11,depr_m12,
              depr_total_added,depr_deducted,
              accumulated_depreciation,book_value,note,created_by)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            r.account_code||"", r.asset_code||"", r.asset_name, r.asset_model||"",
            r.unit||"ш", Number(r.unit_value||0), Number(r.initial_qty||0),
            r.acquisition_date||"", Number(r.initial_amount||0),
            Math.round(Number(r.useful_life_years||0) * 12),
            Number(r.intake_qty||0),    Number(r.intake_amount||0),
            Number(r.issue_qty_fa||0),  Number(r.issue_amount_fa||0),
            Number(r.improve_income||0),Number(r.improve_expense||0),
            Number(r.final_qty||0),     Number(r.final_amount||0),
            Number(r.reval_opening||0), Number(r.reval_disposed||0), Number(r.reval_diff||0),
            Number(r.depr_year_opening||0),
            Number(r.depr_opening||0),  Number(r.depr_disposed||0),
            Number(r.depr_m1||0),  Number(r.depr_m2||0),  Number(r.depr_m3||0),
            Number(r.depr_m4||0),  Number(r.depr_m5||0),  Number(r.depr_m6||0),
            Number(r.depr_m7||0),  Number(r.depr_m8||0),  Number(r.depr_m9||0),
            Number(r.depr_m10||0), Number(r.depr_m11||0), Number(r.depr_m12||0),
            Number(r.depr_total_added||0), Number(r.depr_deducted||0),
            Number(r.accumulated_depreciation||0),
            Number(r.book_value||r.final_amount||0),
            "", req.user.id
          ]);
        inserted++;
      } catch(e) { errors.push(e.message); }
    }
  }

  else if (type === "material_trans") {
    for (const r of data) {
      try {
        const existing = await get(
          `SELECT id FROM warehouse_items WHERE item_name=?` +
          (r.barcode ? ` OR (barcode=? AND barcode!='')` : ``),
          r.barcode ? [r.item_name, r.barcode] : [r.item_name]);
        if (existing) {
          await run(
            `UPDATE warehouse_items SET balance=?,price=?,unit=? WHERE id=?`,
            [Number(r.balance||0), Number(r.unit_price||0), r.unit||"ш", existing.id]);
          skipped++;
        } else {
          await run(
            `INSERT INTO warehouse_items(item_name,unit,balance,price,barcode,note,created_by)
             VALUES(?,?,?,?,?,?,?)`,
            [r.item_name, r.unit||"ш", Number(r.balance||0),
             Number(r.unit_price||0), r.barcode||"",
             r.group||"", req.user.id]);
          inserted++;
        }
      } catch(e) { errors.push(e.message); }
    }
  }

  else if (type === "receivable") {
    for (const r of data) {
      if (!r.final_balance) { skipped++; continue; }
      try {
        await run(
          `INSERT INTO accounts_receivable
             (debtor_name,invoice_date,amount,status,description,created_by)
           VALUES(?,?,?,?,?,?)`,
          [r.name, targetDate, Number(r.final_balance||0), "Хүлээгдэж буй",
           [r.register_no, r.city].filter(Boolean).join(" · "), req.user.id]);
        inserted++;
      } catch(e) { errors.push(e.message); }
    }
  }

  else if (type === "payable") {
    for (const r of data) {
      if (!r.final_balance) { skipped++; continue; }
      try {
        await run(
          `INSERT INTO accounts_payable
             (vendor_name,invoice_date,amount,status,description,created_by)
           VALUES(?,?,?,?,?,?)`,
          [r.name, targetDate, Number(r.final_balance||0), "Төлөгдөөгүй",
           [r.register_no, r.city].filter(Boolean).join(" · "), req.user.id]);
        inserted++;
      } catch(e) { errors.push(e.message); }
    }
  }

  await audit(req.user.id, "IMPORT", type, 0,
    `Smart import: ${inserted} нэмэгдсэн, ${skipped} шинэчлэгдсэн`);
  res.json({ inserted, skipped, errors });
});

module.exports = router;
