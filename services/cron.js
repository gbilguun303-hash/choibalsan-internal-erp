"use strict";
const cron = require("node-cron");
const { dispatchMorning, dispatchSummary } = require("./daily-report");
const { saveHseMonthlySnapshot, saveHseAnnualSnapshot, isLastWorkingDayOfMonth } = require("./hse_snapshots");
const { dispatchCriticalAlerts } = require("./notifications");

function startCronJobs() {
  // 08:00 — morning reminder + critical alert notifications
  cron.schedule("0 8 * * *", async () => {
    console.log("[cron] 08:00 өглөөний сануулга илгээж байна...");
    try { await dispatchMorning(); } catch (e) { console.error("[cron] morning error:", e.message); }
    try { await dispatchCriticalAlerts(); } catch (e) { console.error("[cron] alert error:", e.message); }
  }, { timezone: "Asia/Ulaanbaatar" });

  // 12:00 — midday summary
  cron.schedule("0 12 * * *", async () => {
    console.log("[cron] 12:00 өдрийн тайлан илгээж байна...");
    try { await dispatchSummary("12:00"); }
    catch (e) { console.error("[cron] 12:00 error:", e.message); }
  }, { timezone: "Asia/Ulaanbaatar" });

  // 16:00 — afternoon summary
  cron.schedule("0 16 * * *", async () => {
    console.log("[cron] 16:00 орой тайлан илгээж байна...");
    try { await dispatchSummary("16:00"); }
    catch (e) { console.error("[cron] 16:00 error:", e.message); }
  }, { timezone: "Asia/Ulaanbaatar" });

  // 17:00 — if today is the last working day of month, save HSE monthly snapshot.
  cron.schedule("0 17 * * 1-5", async () => {
    const now = new Date();
    if (!isLastWorkingDayOfMonth(now)) return;
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    console.log(`[cron] HSE сарын snapshot хадгалж байна: ${year}-${String(month).padStart(2, "0")}`);
    try {
      await saveHseMonthlySnapshot(year, month, "auto", 0);
      if (month === 12) await saveHseAnnualSnapshot(year, "auto", 0);
    } catch (e) {
      console.error("[cron] HSE snapshot error:", e.message);
    }
  }, { timezone: "Asia/Ulaanbaatar" });

  console.log("[cron] Цагийн тригэрүүд идэвхжлээ: 08:00 · 12:00 · 16:00 · 17:00 HSE сарын ажлын сүүлийн өдөр snapshot (Asia/Ulaanbaatar)");
}

module.exports = { startCronJobs };
