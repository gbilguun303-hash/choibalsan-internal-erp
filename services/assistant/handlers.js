"use strict";
const { cyrillize } = require("./normalize");
const { matchGuide } = require("./knowledge");
const f = require("./fetchers");
const fmt = require("./formatters");

// ── Unified response builder ──────────────────────────────────────────────────
// Every answer gets: title, short_answer, answer, sources, confidence, data_found, suggestions.
// short_answer = first non-empty line, markdown stripped, capped at 220 chars.
// data_found   = false when answer contains standard "not found" phrases.
// sources      = table/module names that were queried.

const NOT_FOUND_PHRASES = ["олдсонгүй", "бүртгэгдээгүй", "бүртгэл байхгүй"];

function buildAnswer({ title, answer, suggestions = [], sources = [], confidence = 0.9 }) {
  const firstLine = answer.split(/\n/).find(l => l.replace(/\*\*/g, "").trim()) || "";
  const short_answer = firstLine.replace(/\*\*/g, "").replace(/^[-─═•\s]+/, "").trim().slice(0, 220) || answer.slice(0, 220);
  const data_found = !NOT_FOUND_PHRASES.some(p => answer.includes(p));
  return { title, short_answer, answer, sources, confidence, data_found, suggestions };
}

// ── Permission constants ──────────────────────────────────────────────────────
const SALARY_ROLES        = ["director", "hr"];
const EMPLOYEE_INFO_ROLES = ["director", "hr", "chief_engineer"];
const TRAFFIC_LOG_ROLES   = ["director", "chief_engineer", "engineer", "electric", "accountant"];

// ── Main intent dispatcher ────────────────────────────────────────────────────
async function handleIntent(intent, question, ctx, user, convHistory = [], intentMeta = {}) {
  switch (intent) {

    // ── Мэндчилгээ ────────────────────────────────────────────────────────────
    case "GREETING":
      return buildAnswer({
        title: "Мэндчилгээ",
        answer: fmt.roleGreeting(user),
        sources: [],
        confidence: 1.0,
        suggestions: ["Өнөөдрийн тойм", "Нээлттэй гэмтэл хэдэн байна?", "Гэрлийн хуваарь хэд вэ?"],
      });

    // ── Гэрэлтүүлгийн хуваарь ────────────────────────────────────────────────
    case "LIGHT_SCHEDULE":
      return buildAnswer({
        title: "Өнөөдрийн гэрэлтүүлгийн хуваарь",
        answer: fmt.fmtLightSchedule(ctx),
        sources: ["light_schedule_logs"],
        suggestions: ["Цаг тохиргоо хаана бүртгэх вэ?", "LoRa бодит асалтыг тайлбарла", "Энэ сарын асалтын тайлан"],
      });

    case "LIGHT_STATUS_SCHEDULE": {
      const s = await f.fetchOpenLightFaults();
      return buildAnswer({
        title: "Гэрэлтүүлгийн асалт ба хуваарь",
        answer: fmt.fmtLightStatusAndSchedule(s, ctx),
        sources: ["sl_faults", "light_schedule_logs"],
        suggestions: ["Гэмтлийн дэлгэрэнгүй", "Цаг тохиргоо хаана вэ?", "Асалтын сарын тайлан"],
      });
    }

    case "POLE_COUNT": {
      const s = await f.fetchPoleCount(question);
      return buildAnswer({
        title: "Гэрлийн шонгийн тоо",
        answer: fmt.fmtPoleCount(s),
        sources: ["sl_points", "sl_ger_inventory"],
        suggestions: ["Асалтын хувийг хэл", "Нээлттэй гэмтэл хэдэн байна?", "Гэрэлтүүлгийн нийт тайлан"],
      });
    }

    case "OPEN_LIGHT_FAULTS": {
      const s = await f.fetchOpenLightFaults();
      return buildAnswer({
        title: "Нээлттэй гэрэлтүүлгийн гэмтэл",
        answer: fmt.fmtOpenLightFaults(s),
        sources: ["sl_faults"],
        suggestions: ["Гэмтэл хэрхэн бүртгэх вэ?", "Засварын дараалал яаж тавих вэ?", "Гэмтлийн тайлан гарга"],
      });
    }

    case "LOCATION_LIGHT_FAULT": {
      const s = await f.fetchLocationLightFaults(question);
      return buildAnswer({
        title: "Байршлын гэрэлтүүлгийн гэмтэл",
        answer: fmt.fmtLocationLightFaults(s),
        sources: ["sl_faults", "sl_points"],
        suggestions: ["Гэмтлийн дэлгэрэнгүй", "Чойбалсангийн гэмтэл", "ГТ-015 гэмтэл"],
      });
    }

    case "LIGHT_LOCATION_STATUS": {
      const s = await f.fetchLightLocationStatus(question);
      return buildAnswer({
        title: "Байршлын асалтын мэдээлэл",
        answer: fmt.fmtLightLocationStatus(s),
        sources: ["sl_points", "sl_faults"],
        confidence: s.point || s.faults?.length ? 0.9 : 0.3,
        suggestions: ["Чойбалсангийн гудамж асалт", "Ялалтын 23-р эгнээний асалт", "Нээлттэй гэмтэл хэдэн байна?"],
      });
    }

    // ── Хөрөнгө ──────────────────────────────────────────────────────────────
    case "ASSET_VALUE": {
      const s = await f.fetchAssetValue();
      return buildAnswer({
        title: "Байгууллагын хөрөнгийн дүн",
        answer: fmt.fmtAssetValue(s),
        sources: ["fixed_assets_ledger", "assets", "wh_materials"],
        suggestions: ["Үндсэн хөрөнгийн дэлгэрэнгүй", "Агуулахын үлдэгдлийн дүн", "Санхүүгийн тойм"],
      });
    }

    case "ASSET_WARRANTY": {
      const rows = await f.fetchAssetWarranty();
      return buildAnswer({
        title: "Баталгааны хугацааны анхааруулга",
        answer: fmt.fmtAssetWarranty(rows),
        sources: ["assets"],
        suggestions: ["Баталгааны хугацаа шинэчлэх хэрхэн вэ?", "Объектийн бүртгэл харах", "Засварын тайлан"],
      });
    }

    // ── Ажилтан — цалин (permission check FIRST) ─────────────────────────────
    case "EMPLOYEE_SALARY_LOOKUP": {
      if (!SALARY_ROLES.includes(user.role)) {
        return buildAnswer({
          title: "Цалингийн мэдээлэл",
          answer: "Цалин нь хувийн мэдээлэл тул зөвхөн захирал болон HR эрхтэй хэрэглэгч ERP туслахаас харах боломжтой.\n\nӨөрийн цалинг `миний цалин` гэж асууж шалгана уу.",
          sources: [],
          confidence: 1.0,
          suggestions: ["Миний цалин"],
        });
      }
      const s = await f.fetchEmployeeSalaryLookup(question, user);
      return buildAnswer({
        title: "Ажилтны цалингийн мэдээлэл",
        answer: fmt.fmtEmployeeSalaryLookup(s),
        sources: ["users"],
        suggestions: ["Миний цалин", "HR ажилтны жагсаалт", "Цалингийн тооцоо хаана вэ?"],
      });
    }

    case "EMPLOYEE_COUNT": {
      const s = await f.fetchEmployeeCount();
      return buildAnswer({
        title: "Ажилтны тоо",
        answer: fmt.fmtEmployeeCount(s),
        sources: ["users"],
        suggestions: ["Өнөөдрийн ирц хэд вэ?", "Хэлтсээр ажилтны тоо", "HR тайлан гарга"],
      });
    }

    case "EMPLOYEE_GENDER": {
      const s = await f.fetchEmployeeGender(question);
      return buildAnswer({
        title: "Ажилтны хүйсийн шүүлт",
        answer: fmt.fmtEmployeeGender(s),
        sources: ["users"],
        suggestions: ["Нийт ажилтны тоо", "HR ажилтны жагсаалт", "Өнөөдрийн ирц"],
      });
    }

    case "ATTENDANCE_TODAY": {
      const s = await f.fetchTodayAttendance(ctx.today);
      return buildAnswer({
        title: "Өнөөдрийн ирц",
        answer: fmt.fmtTodayAttendance(s),
        sources: ["hr_records", "users"],
        suggestions: ["Ирцийн дэлгэрэнгүй тайлан", "Хоцорсон хүмүүсийг яаж харах вэ?", "Ирц бүртгэх заавар"],
      });
    }

    case "MY_SALARY": {
      const s = await f.fetchMySalary(user.id);
      return buildAnswer({
        title: "Миний цалин",
        answer: fmt.fmtMySalary(s),
        sources: ["payroll_timesheet", "users"],
        suggestions: ["Цалингийн тооцоо хаана харах вэ?", "Ирц цалинд яаж нөлөөлөх вэ?"],
      });
    }

    case "MY_PHONE": {
      const s = await f.fetchMyPhone(user.id);
      return buildAnswer({
        title: "Миний утасны дугаар",
        answer: fmt.fmtMyPhone(s, user),
        sources: ["users"],
        suggestions: ["Миний мэдээлэл хаана вэ?", "HR ажилтантай холбогдох", "Ажилтны карт засах"],
      });
    }

    case "ELECTRICITY_BILL": {
      const s = await f.fetchElectricityBill(question);
      return buildAnswer({
        title: "Цахилгааны төлбөр",
        answer: fmt.fmtElectricityBill(s, question),
        sources: ["electricity_bill_imports"],
        suggestions: ["4-р сарын цахилгааны төлбөр", "Сүүлийн сарын төлбөр", "Нэхэмжлэл хаана харах вэ?"],
      });
    }

    case "WORK_ACTIVITY": {
      const s = await f.fetchWorkActivity(question, convHistory);
      return buildAnswer({
        title: "ERP дээрх ажлын бүртгэл",
        answer: fmt.fmtWorkActivity(s),
        sources: ["asset_events", "audit_logs"],
        suggestions: ["Өнгөрсөн 7 хоногт юу хийсэн бэ?", "Өнөөдөр ERP дээр юм оруулсан уу?", "Ажлын явц дэлгэрэнгүй"],
      });
    }

    case "MY_WORK": {
      const s = await f.fetchMyWork(user);
      return buildAnswer({
        title: "Миний ажил",
        answer: fmt.fmtMyWork(s),
        sources: ["asset_events"],
        suggestions: ["Ажлын явц дэлгэрэнгүй", "Миний идэвхтэй ажил", "Дууссан ажлууд"],
      });
    }

    case "CAMERA_COUNT": {
      const s = await f.fetchCameraCount();
      return buildAnswer({
        title: "Камерын мэдээлэл",
        answer: fmt.fmtCameraCount(s),
        sources: ["assets", "asset_events"],
        suggestions: ["Камерын байршлуудыг харуулаач", "Объектийн бүртгэлд камер нэмэх", "Засварт орсон камер байна уу?"],
      });
    }

    case "HABEA_MODULE_FEATURE":
      return buildAnswer({
        title: "ХАБЭА — Сургалт ба журам",
        answer:
          "ХАБЭА модульд **Сургалт** болон **Журам** гэсэн хоёр хэсэг аль хэдийн нэмэгдсэн байна.\n\n" +
          "- Сургалт: сургалтын бүртгэл, хамрагдах хүрээ, материал PDF/PPT, танилцсан ажилтны тоо\n" +
          "- Журам: журмын нэр, хувилбар, хүчинтэй огноо, файл болон танилцуулгын бүртгэл\n\n" +
          "ХАБЭА самбарын дээд талын табаас эдгээр хэсэгт орно. Хэрэв таб харагдахгүй байвал хуудсаа шинэчлээд хэрэглэгчийн эрхийг шалгана уу.",
        sources: ["safety_trainings", "safety_procedures"],
        confidence: 1.0,
        suggestions: ["ХАБЭА сургалт бүртгэх", "Журам файл оруулах", "Сургалтын тайлан харах"],
      });

    // ── Ажилтны мэдээлэл (permission check FIRST) ────────────────────────────
    case "EMPLOYEE_LOOKUP": {
      if (!EMPLOYEE_INFO_ROLES.includes(user.role)) {
        return buildAnswer({
          title: "Ажилтны мэдээлэл",
          answer: "Ажилтны нэр, холбоо барих мэдээлэлд зөвхөн захирал, HR менежер болон ерөнхий инженер хандах боломжтой.\n\nДэлгэрэнгүй мэдээлэл авахын тулд HR модульд хандана уу.",
          sources: [],
          confidence: 1.0,
          suggestions: ["HR тайлан", "Өнөөдрийн ирц харах"],
        });
      }
      const rows = await f.fetchEmployeeByRole(cyrillize(question.toLowerCase()));
      return buildAnswer({
        title: "Ажилтны мэдээлэл",
        answer: fmt.fmtEmployeeByRole(rows, question, user),
        sources: ["users"],
        suggestions: ["Дэлгэрэнгүй карт харах", "Өнөөдрийн ирц харах", "HR тайлан гаргах"],
      });
    }

    case "EMPLOYEE_PHONE_FOLLOWUP": {
      const s = await f.fetchEmployeePhoneFromHistory(question, convHistory, user);
      return buildAnswer({
        title: "Ажилтны утас",
        answer: fmt.fmtEmployeePhoneFollowup(s),
        sources: ["users"],
        suggestions: ["HR ажилтны жагсаалт", "Өнөөдрийн ирц", "Ажилтны карт хаана вэ?"],
      });
    }

    case "EMPLOYEE_DETAIL_LOOKUP": {
      const s = await f.fetchEmployeeDetail(question, convHistory, user);
      return buildAnswer({
        title: "Ажилтны мэдээлэл",
        answer: fmt.fmtEmployeeDetail(s),
        sources: s.row ? ["users"] : [],
        confidence: s.row ? 0.9 : 0.3,
        suggestions: ["Утасны дугаар", "Нас", "Боловсрол"],
      });
    }

    // ── Гэмтэл засвар ────────────────────────────────────────────────────────
    case "OPEN_FAULTS": {
      const s = await f.fetchOpenFaults();
      return buildAnswer({
        title: "Нээлттэй гэмтэл ба засварын тойм",
        answer: fmt.fmtOpenFaults(s),
        sources: ["sl_faults", "asset_events"],
        suggestions: ["Гэмтэл хэрхэн бүртгэх вэ?", "Засварын тасалбар хаах заавар", "Хугацаа хэтэрсэн ажил байна уу?"],
      });
    }

    case "OVERDUE_WORK": {
      const s = await f.fetchOverdueWork();
      return buildAnswer({
        title: "Хугацаа хэтэрсэн ажил",
        answer: fmt.fmtOverdueWork(s),
        sources: ["asset_events"],
        suggestions: ["Хугацааг яаж шинэчлэх вэ?", "Ажлын хариуцагчийг өөрчлөх", "Ажлын явцын тайлан"],
      });
    }

    // ── Гэрлэн дохио (permission check FIRST) ───────────────────────────────
    case "TRAFFIC_STATUS": {
      const rows = await f.fetchTrafficStatus();
      return buildAnswer({
        title: "Гэрлэн дохионы статус",
        answer: fmt.fmtTrafficStatus(rows),
        sources: ["assets"],
        suggestions: ["Гэрлэн дохионы ослын цаг яаж шалгах вэ?", "Гэмтэлтэй дохио мэдүүлэх", "Засварын тайлан"],
      });
    }

    case "TRAFFIC_SIGNAL_LOG": {
      if (!TRAFFIC_LOG_ROLES.includes(user.role)) {
        return buildAnswer({
          title: "Гэрлэн дохионы журнал",
          answer: "Гэрлэн дохионы цагийн журналд хандах эрх хүрэлцэхгүй байна.",
          sources: [],
          confidence: 1.0,
          suggestions: ["Гэрлэн дохионы статус харах", "Объектийн бүртгэл"],
        });
      }
      const s = await f.fetchTrafficSignalLog(question);
      return buildAnswer({
        title: "Гэрлэн дохионы цагийн журнал",
        answer: fmt.fmtTrafficSignalLog(s),
        sources: ["traffic_signal_status_logs", "assets"],
        suggestions: ["Ослын огноо цагийг хэлбэл шалгаж өгье", "Баримтын дугаар хайх", "Нотлох баримт хэвлэх"],
      });
    }

    // ── Агуулах ──────────────────────────────────────────────────────────────
    case "LOW_STOCK": {
      const rows = await f.fetchLowStock();
      return buildAnswer({
        title: "Агуулахын нөөцийн анхааруулга",
        answer: fmt.fmtLowStock(rows),
        sources: ["wh_materials", "wh_transactions"],
        suggestions: ["Материал захиалах хэрхэн вэ?", "Агуулахын нийт үлдэгдэл", "Нийлүүлэгчийн мэдээлэл"],
      });
    }

    // ── Санхүү ───────────────────────────────────────────────────────────────
    case "MONTHLY_EXPENSE": {
      const rows = await f.fetchMonthlyExpenses();
      return buildAnswer({
        title: "Энэ сарын зардал",
        answer: fmt.fmtMonthlyExpenses(rows),
        sources: ["expenses"],
        suggestions: ["Төсвийн гүйцэтгэл хэдэн хувьд байна?", "Зардлын тайлан Excel-рүү татах", "Аль хэсэг хамгийн их зардалтай?"],
      });
    }

    case "BUDGET_PROGRESS": {
      const s = await f.fetchBudgetProgress();
      return buildAnswer({
        title: "Төсвийн гүйцэтгэл",
        answer: fmt.fmtBudgetProgress(s),
        sources: ["asset_events", "plans"],
        suggestions: ["Энэ сарын зардлын дэлгэрэнгүй", "Хэтрэлтийн шалтгаан юу вэ?", "Дараагийн сарын төлөвлөгөө"],
      });
    }

    // ── ХАБЭА ────────────────────────────────────────────────────────────────
    case "SAFETY_OPEN": {
      const rows = await f.fetchOpenSafetyReports();
      return buildAnswer({
        title: "Нээлттэй ХАБЭА тайлан",
        answer: fmt.fmtOpenSafety(rows),
        sources: ["safety_reports"],
        suggestions: ["Эрсдэл бүртгэх хэрхэн вэ?", "ХАБЭА шалгалтын хуудас", "ХАБЭА тайлан гаргах"],
      });
    }

    case "HABEA_WORK_STATUS": {
      const s = await f.fetchHabeaWorkStatus();
      return buildAnswer({
        title: "ХАБЭА — Ажлын явцын шалгалт",
        answer: fmt.fmtHabeaWorkStatus(s),
        sources: ["asset_events"],
        suggestions: ["ХАБЭА шалгалт бүртгэх заавар", "Нээлттэй ХАБЭА тайлан", "Ажлын явцын дэлгэрэнгүй"],
      });
    }

    // ── Гэрээ / сургалт ───────────────────────────────────────────────────────
    case "CONTRACT_EXPIRY": {
      const rows = await f.fetchContractExpiry();
      return buildAnswer({
        title: "Дуусах дөхсөн гэрээ",
        answer: fmt.fmtContractExpiry(rows),
        sources: ["org_contracts"],
        suggestions: ["Гэрээ шинэчлэх хэрхэн вэ?", "Бүх гэрээний жагсаалт", "Гэрээний тайлан"],
      });
    }

    case "TRAINING": {
      const rows = await f.fetchTrainingSchedule();
      return buildAnswer({
        title: "Сургалтын хуваарь",
        answer: fmt.fmtTraining(rows),
        sources: ["trainings"],
        suggestions: ["Сургалтад бүртгүүлэх хэрхэн вэ?", "Сургалтын тайлан", "ХАБЭА сургалтын хуваарь"],
      });
    }

    case "REPORT_GUIDE":
      return buildAnswer({
        title: "Тайлан гаргах заавар",
        answer: fmt.fmtReportGuide(question, convHistory),
        sources: ["kb_articles"],
        confidence: 0.85,
        suggestions: ["Гэрэлтүүлгийн тайлан гаргах", "HR тайлан гаргах", "Санхүүгийн тайлан экспортлох"],
      });

    // ── Dashboard ─────────────────────────────────────────────────────────────
    case "DASHBOARD_STATUS":
      return buildAnswer({
        title: "ERP-ийн өнөөдрийн байдал",
        answer: fmt.fmtDashboardStatus(ctx),
        sources: ["sl_faults", "asset_events", "assets"],
        suggestions: ["Нээлттэй гэмтэл дэлгэрэнгүй", "Ажилтны ирц хэд вэ?", "Яаралтай анхаарах юм байна уу?"],
      });

    // ── Нэгтгэсэн сарын тайлан ───────────────────────────────────────────────
    case "MONTHLY_REPORT": {
      const { year, month, d } = await f.fetchMonthlyReportSummary(question);
      const MN = ["","1-р сар","2-р сар","3-р сар","4-р сар","5-р сар","6-р сар","7-р сар","8-р сар","9-р сар","10-р сар","11-р сар","12-р сар"];
      return buildAnswer({
        title: `${MN[month]} ${year} — Нэгтгэсэн тайлан`,
        answer: fmt.fmtMonthlyReport(d, year, month),
        sources: ["asset_events","safety_reports","wh_transactions","cash_journal","hr_records","vehicles"],
        suggestions: ["Дэлгэрэнгүй материал харуулаач", "Хугацаа хэтэрсэн ажлуудыг жагсаа", "ХАБЭА эрсдэлийн тайлан"],
      });
    }

    // ── KB / Заавар ───────────────────────────────────────────────────────────
    case "KB_MATCH":
    case "GUIDE": {
      const guide = intentMeta?.guide || await matchGuide(question);
      if (!guide) return null;
      return buildAnswer({
        title: guide.title,
        answer: `${guide.answer}\n\nДэлгэрэнгүй алхам хэрэгтэй бол тодруулаарай.`,
        sources: ["kb_articles"],
        confidence: 0.75,
        suggestions: ["Алхам алхмаар заагаад өг", "Тайлан хэрхэн гаргах вэ?", "Бусад хэсгийг ашиглах заавар"],
      });
    }

    default:
      return null;
  }
}

module.exports = { handleIntent, buildAnswer };
