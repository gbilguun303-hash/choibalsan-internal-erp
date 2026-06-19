"use strict";
const { all, get, run } = require("../db");

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt  = n => Number(n || 0).toLocaleString("mn-MN");
const fmtD = s => s ? s.slice(0, 10) : "—";

// ── Recipients config ─────────────────────────────────────────────
// Categories filtered per role. null = no filter (see all).
const RECIPIENT_CONFIG = [
  {
    role: "director",
    categories: null,
    corr_all: true,
  },
  {
    role: "chief_engineer",
    categories: null,
    corr_all: false,
  },
  {
    role: "engineer",
    categories: ["Гэрэлтүүлэг засвар", "Гэрэл дохио"],
    corr_all: false,
  },
  {
    role: "camera_engineer",
    categories: ["Камер засвар"],
    corr_all: false,
  },
  {
    role: "habea",
    categories: null,
    corr_all: false,
  },
  {
    role: "hr",
    categories: null,
    corr_all: false,
  },
  {
    role: "nyarav",
    categories: null,
    corr_all: false,
  },
  {
    role: "nyagtlan",
    categories: null,
    corr_all: false,
  },
];

async function getUsers() {
  return all(
    `SELECT id, full_name, role FROM users
     WHERE role IN ('director','chief_engineer','engineer','camera_engineer',
                    'habea','hr','nyarav','nyagtlan') AND active=1`
  );
}

async function sendChatMsg(senderId, recipientId, message) {
  await run(
    `INSERT INTO chat_messages(sender_id, recipient_id, message) VALUES (?,?,?)`,
    [senderId, recipientId, message]
  );
}

// ── Morning: 08:00 ── overdue + pending + correspondence deadlines ─
async function buildMorningText(userId, categories, corrAll, userName) {
  const today = todayStr();

  const catClause = categories
    ? `AND category IN (${categories.map(() => "?").join(",")})` : "";
  const catParams = categories ? [...categories] : [];

  const overdue = await all(
    `SELECT ae.title, ae.category, ae.end_date, u.full_name assigned_name
     FROM asset_events ae
     LEFT JOIN users u ON u.id = ae.assigned_to
     WHERE ae.status NOT IN ('Дууссан','Хаагдсан','Цуцалсан')
       AND ae.end_date < ? ${catClause}
     ORDER BY ae.end_date ASC LIMIT 15`,
    [today, ...catParams]
  );

  const pending = await all(
    `SELECT ae.title, ae.category, ae.start_date, ae.end_date, u.full_name assigned_name
     FROM asset_events ae
     LEFT JOIN users u ON u.id = ae.assigned_to
     WHERE ae.status = 'Хүлээгдэж байгаа' ${catClause}
     ORDER BY ae.start_date ASC LIMIT 10`,
    [...catParams]
  );

  const corrFilter = corrAll
    ? "AND status NOT IN ('Биелсэн','Хаагдсан')"
    : `AND assigned_to = ${userId} AND status NOT IN ('Биелсэн','Хаагдсан')`;
  const overdueCorr = await all(
    `SELECT subject, source_org, due_date, doc_no
     FROM correspondence
     WHERE doc_type='Ирсэн' AND due_date < ? ${corrFilter}
     ORDER BY due_date ASC LIMIT 10`,
    [today]
  );

  const lines = [];
  lines.push(`🌅 Өглөөний сануулга — ${today}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  if (overdue.length) {
    lines.push(`\n🔴 ХОЦОРСОН АЖИЛ (${overdue.length}):`);
    overdue.forEach(r =>
      lines.push(`  • ${r.title} [${r.category || "—"}] — дуусах: ${fmtD(r.end_date)} · ${r.assigned_name || "хуваарилаагүй"}`)
    );
  } else {
    lines.push(`\n✅ Хоцорсон ажил байхгүй`);
  }

  if (pending.length) {
    lines.push(`\n⏳ ХҮЛЭЭГДЭЖ БУЙ АЖИЛ (${pending.length}):`);
    pending.forEach(r =>
      lines.push(`  • ${r.title} [${r.category || "—"}] · ${r.assigned_name || "—"}`)
    );
  }

  if (overdueCorr.length) {
    lines.push(`\n📋 ХОЦОРСОН БИЧИГ БАРИМТ (${overdueCorr.length}):`);
    overdueCorr.forEach(r =>
      lines.push(`  • ${r.subject} — ${r.source_org} · хугацаа: ${fmtD(r.due_date)}`)
    );
  }

  lines.push(`\n━━━━━━━━━━━━━━━━━━━━`);
  return lines.join("\n");
}

// ── Summary: 12:00 / 16:00 ── today's activity ────────────────────
async function buildSummaryText(userId, categories, corrAll, timeLabel) {
  const today = todayStr();

  const catClause = categories
    ? `AND category IN (${categories.map(() => "?").join(",")})` : "";
  const catParams = categories ? [...categories] : [];

  const completed = await all(
    `SELECT ae.title, ae.category, u.full_name assigned_name
     FROM asset_events ae
     LEFT JOIN users u ON u.id = ae.assigned_to
     WHERE ae.status = 'Дууссан' AND DATE(ae.updated_at) = ? ${catClause}
     ORDER BY ae.updated_at DESC LIMIT 15`,
    [today, ...catParams]
  );

  const started = await all(
    `SELECT ae.title, ae.category, u.full_name assigned_name
     FROM asset_events ae
     LEFT JOIN users u ON u.id = ae.assigned_to
     WHERE ae.start_date = ? AND ae.status NOT IN ('Хаагдсан','Цуцалсан') ${catClause}
     ORDER BY ae.id DESC LIMIT 10`,
    [today, ...catParams]
  );

  const newWork = await all(
    `SELECT ae.title, ae.category, u.full_name created_name
     FROM asset_events ae
     LEFT JOIN users u ON u.id = ae.created_by
     WHERE DATE(ae.created_at) = ? ${catClause}
     ORDER BY ae.id DESC LIMIT 10`,
    [today, ...catParams]
  );

  const corrFilter = corrAll
    ? ""
    : `AND assigned_to = ${userId}`;
  const newCorr = await all(
    `SELECT subject, source_org, doc_date, doc_no, doc_type
     FROM correspondence
     WHERE DATE(created_at) = ? ${corrFilter}
     ORDER BY id DESC LIMIT 10`,
    [today]
  );

  const lines = [];
  const icon = timeLabel === "12:00" ? "☀️" : "🌆";
  lines.push(`${icon} ${timeLabel}-ийн тайлан — ${today}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  if (completed.length) {
    lines.push(`\n✅ ӨНӨӨДӨР ДУУССАН АЖИЛ (${completed.length}):`);
    completed.forEach(r =>
      lines.push(`  • ${r.title} [${r.category || "—"}] · ${r.assigned_name || "—"}`)
    );
  } else {
    lines.push(`\n✅ Өнөөдөр дууссан ажил байхгүй`);
  }

  if (started.length) {
    lines.push(`\n🟢 ӨНӨӨДӨР ЭХЭЛСЭН АЖИЛ (${started.length}):`);
    started.forEach(r =>
      lines.push(`  • ${r.title} [${r.category || "—"}] · ${r.assigned_name || "—"}`)
    );
  }

  if (newWork.length) {
    lines.push(`\n📝 ӨНӨӨДӨР ШИНЭ БҮРТГЭЛ (${newWork.length}):`);
    newWork.forEach(r =>
      lines.push(`  • ${r.title} [${r.category || "—"}] · ${r.created_name || "—"}`)
    );
  }

  if (newCorr.length) {
    lines.push(`\n📬 ӨНӨӨДӨР ИРСЭН БИЧИГ (${newCorr.length}):`);
    newCorr.forEach(r =>
      lines.push(`  • [${r.doc_type}] ${r.subject} — ${r.source_org}`)
    );
  }

  if (!completed.length && !started.length && !newWork.length && !newCorr.length) {
    lines.push(`\nОдоогоор өнөөдрийн үйл ажиллагаа бүртгэгдээгүй байна.`);
  }

  lines.push(`\n━━━━━━━━━━━━━━━━━━━━`);
  return lines.join("\n");
}

// ── Main dispatchers ──────────────────────────────────────────────
async function dispatchMorning() {
  const users = await getUsers();
  const director = users.find(u => u.role === "director");
  if (!director) return;

  for (const cfg of RECIPIENT_CONFIG) {
    const recipient = users.find(u => u.role === cfg.role);
    if (!recipient) continue;
    try {
      const text = await buildMorningText(
        recipient.id, cfg.categories, cfg.corr_all, recipient.full_name
      );
      // Send as DM from director to recipient (self-DM for director)
      await sendChatMsg(director.id, recipient.id, text);
      console.log(`[daily-report] morning → ${recipient.full_name} (${cfg.role})`);
    } catch (e) {
      console.error(`[daily-report] morning error for ${cfg.role}:`, e.message);
    }
  }
}

async function dispatchSummary(timeLabel) {
  const users = await getUsers();
  const director = users.find(u => u.role === "director");
  if (!director) return;

  for (const cfg of RECIPIENT_CONFIG) {
    const recipient = users.find(u => u.role === cfg.role);
    if (!recipient) continue;
    try {
      const text = await buildSummaryText(
        recipient.id, cfg.categories, cfg.corr_all, timeLabel
      );
      await sendChatMsg(director.id, recipient.id, text);
      console.log(`[daily-report] ${timeLabel} → ${recipient.full_name} (${cfg.role})`);
    } catch (e) {
      console.error(`[daily-report] ${timeLabel} error for ${cfg.role}:`, e.message);
    }
  }
}

module.exports = { dispatchMorning, dispatchSummary };
