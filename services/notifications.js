"use strict";
const { run, all, get } = require("../db");

const TODAY = () => new Date().toISOString().slice(0, 10);

async function writeNotification({ type, title, body = "", user_id = null, dedupe_key = null }) {
  if (dedupe_key) {
    const existing = await get("SELECT id FROM notifications WHERE dedupe_key=?", [dedupe_key]).catch(() => null);
    if (existing) {
      await run(
        `UPDATE notifications SET title=?, body=?, user_id=? WHERE id=?`,
        [title, body, user_id, existing.id]
      ).catch(() => {});
      return existing.id;
    }
  }
  await run(
    `INSERT INTO notifications(type,title,body,user_id,dedupe_key) VALUES(?,?,?,?,?)`,
    [type, title, body, user_id, dedupe_key]
  ).catch(() => {});
}

function dailyKey(type, date, userId = null) {
  return `daily:${date}:${type}:${userId || "all"}`;
}

async function dispatchCriticalAlerts() {
  const today = TODAY();

  const [overdue, highRisks, hseWaiting, pendingFinal] = await Promise.all([
    get(`SELECT COUNT(*) count FROM asset_events
         WHERE status NOT IN ('Хаагдсан','Буцаагдсан','Цуцалсан')
           AND end_date IS NOT NULL AND end_date!='' AND end_date < ?`, [today]).catch(() => ({ count:0 })),
    get(`SELECT COUNT(*) count FROM safety_reports
         WHERE risk_level IN ('Маш өндөр','Өндөр')
           AND workflow_status != 'Хаасан'`).catch(() => ({ count:0 })),
    get(`SELECT COUNT(*) count FROM asset_events
         WHERE status='Дууссан гэж илгээсэн'`).catch(() => ({ count:0 })),
    get(`SELECT COUNT(*) count FROM asset_events
         WHERE status='ХАБЭА шалгасан'`).catch(() => ({ count:0 })),
  ]);

  const ov = Number(overdue.count || 0);
  const hr = Number(highRisks.count || 0);
  const hw = Number(hseWaiting.count || 0);
  const pf = Number(pendingFinal.count || 0);

  if (ov > 0) {
    await writeNotification({
      type: "overdue_work",
      title: `${ov} ажил хугацаа хэтэрсэн байна`,
      body: `Өнөөдрийн байдлаар ${today}-д ${ov} ажил хугацаа хэтэрсэн. Ерөнхий инженерийн самбараас шалгана уу.`,
      dedupe_key: dailyKey("overdue_work", today),
    });
  }

  if (hr > 0) {
    await writeNotification({
      type: "high_risk_hse",
      title: `${hr} өндөр эрсдэл нээлттэй байна`,
      body: `ХАБЭА хэсэгт ${hr} өндөр / маш өндөр эрсдэл шийдвэрлэгдэлгүй байна.`,
      dedupe_key: dailyKey("high_risk_hse", today),
    });
  }

  if (hw > 0) {
    await writeNotification({
      type: "hse_waiting",
      title: `${hw} ажил ХАБЭА шалгалт хүлээж байна`,
      body: `${hw} ажил "Дууссан гэж илгээсэн" төлөвт байна. ХАБЭА мэргэжилтэн шалгана уу.`,
      dedupe_key: dailyKey("hse_waiting", today),
    });
  }

  if (pf > 0) {
    await writeNotification({
      type: "pending_final",
      title: `${pf} ажил эцсийн батламж хүлээж байна`,
      body: `${pf} ажил "ХАБЭА шалгасан" — Ерөнхий инженер батална уу.`,
      dedupe_key: dailyKey("pending_final", today),
    });
  }

  console.log(`[notifications] Өнөөдрийн alert: хоцорсон=${ov}, өндөр эрсдэл=${hr}, ХАБЭА хүлээж=${hw}, батламж хүлээж=${pf}`);
}

module.exports = { dispatchCriticalAlerts, writeNotification };
