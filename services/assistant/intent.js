"use strict";
const { cyrillize } = require("./normalize");
const { matchGuide } = require("./knowledge");

const INTENT_RULES = [
  { id: "OPEN_LIGHT_FAULTS",groups: [["гэмтэл","асахгүй","унтарсан","толгой"], ["хэдэн","нийт","тоо","байна уу","нээлттэй","ажиллахгүй","асдаггүй"]] },
  { id: "LIGHT_SCHEDULE",   groups: [["гэрэл","гэрэлтүүлэг","гудамж","авто зам","гэр хороолол","цамхаг"], ["хэдэд","цаг","аса","унтар","хуваарь"]] },
  { id: "POLE_COUNT",       groups: [["шон","гэрлийн шон","цамхаг","гэр хороолол","авто зам","авто замын гэрэл","гэрэл","гэрэлтүүлгийн"], ["хэдэн","нийт","тоо","дэлгэрэнгүй","мэдээлэл","харуулаач","статус","хэмжээ"]] },
  { id: "ASSET_VALUE",      groups: [["хөрөнгө","байгууллагын хөрөнгө"], ["дүн","үнэ","өртөг","хэдэн төгрөг"]] },
  { id: "ASSET_WARRANTY",   groups: [["баталгаа","warranty"], ["хугацаа","дуусч","дуусах","анхааруулга"]] },
  { id: "EMPLOYEE_SALARY_LOOKUP", groups: [["цалин","цалингийн","гар дээр","net"], ["ажилтан","хүний нөөц","инженер","нягтлан","нярав","хабэа","камер","ундраа","цэлмэг","билгүүн","хэн","хэдэн","хэмжээ"]] },
  { id: "EMPLOYEE_COUNT",   groups: [["ажилтан","хүн","staff","employee"], ["хэдэн","нийт","тоо"]] },
  { id: "ATTENDANCE_TODAY", groups: [["өнөөдөр","today","unuudur"], ["ирсэн","ирц","ажилдаа","хэдэн хүн"]] },
  { id: "MY_SALARY",        groups: [["миний","намайг","bi"], ["цалин","гар дээр","авах","net"]] },
  { id: "OPEN_FAULTS",      groups: [["гэмтэл","засвар","тасалбар"], ["нээлттэй","хэдэн","нийт","өнөөдөр","байна уу","мэдээлэл","гаргаж","харуулаач"]] },
  { id: "OVERDUE_WORK",     groups: [["ажил","засвар","даалгавар"], ["хугацаа хэтэрсэн","хоцорсон","дуусаагүй","хэтэрсэн"]] },
  { id: "TRAFFIC_SIGNAL_LOG", groups: [["гэрлэн дохио","гэрэл дохио","дохио"], ["ослын цаг","осол болсон","тухайн үед","асаалтай байсан","унтарсан байсан","журнал","баримт","нотлох","evidence"]] },
  { id: "TRAFFIC_STATUS",   groups: [["гэрлэн дохио","гэрэл дохио","дохио"], ["статус","ямар","хэдэн","тоо","нийт","ажиллаж","байна","байдаг"]] },
  { id: "LOW_STOCK",        groups: [["агуулах","нөөц","материал"], ["дуусч","дутмаг","хомс","анхааруулга","буурсан"]] },
  { id: "MONTHLY_EXPENSE",  groups: [["зардал"], ["энэ сар","сарын","тайлан"]] },
  { id: "BUDGET_PROGRESS",  groups: [["төсөв"], ["гүйцэтгэл","хувь","хэтэрсэн","үлдэгдэл"]] },
  { id: "SAFETY_OPEN",      groups: [["хабэа","аюулгүй","эрсдэл","осол"], ["нээлттэй","шийдвэрлэгдээгүй","хэдэн"]] },
  { id: "HABEA_WORK_STATUS", groups: [["хабэа","аюулгүй байдал"], ["ажлын явц","шалгалт","урьдчилсан","дараах","pre","post","бүртгэгдсэн үү","бүртгэгдсэн","дутуу","хийгдсэн","хийсэн","байгаа"]] },
  { id: "CONTRACT_EXPIRY",  groups: [["гэрээ"], ["хугацаа","дуусч","дуусах","сануулга"]] },
  { id: "TRAINING",         groups: [["сургалт"], ["хуваарь","хэзээ","байна","ямар","дараагийн"]] },
  { id: "CAMERA_COUNT",     groups: [["камер"], ["хэдэн","тоо","нийт","байдаг","байна","хэмжээ"]] },
  { id: "EMPLOYEE_LOOKUP",  groups: [["инженер","нягтлан","нярав","цахилгаанчин","хабэа","ажилтан","ажилчид","хүний нөөц","цахилгааны","камер"], ["хэн","нэр","нэрс","мэдээлэл","хэн бэ","ямар хүн","хэн ажилладаг","хэн ажиллаж","жагсаалт","утас","дугаар"]] },
  { id: "DASHBOARD_STATUS", groups: [["өнөөдөр","өнөөдрийн","одоо","яаралтай","unuudur"], ["тойм","байдал","статус","ямар","хурдан","summary","дүн"]] },
  { id: "MONTHLY_REPORT",  groups: [["сарын тайлан","нэгтгэсэн тайлан","нэгтгэл","сарын дүн","unified"], ["харуулаач","гаргаач","дүн","тайлагна","мэдэгдэх","хэлэх","бичих"]] },
];

function isGreetingOnly(question) {
  const q = cyrillize(question.toLowerCase().trim()).replace(/[.!?؟。、\s]+$/, "");
  const greetings = [
    "sain uu","sain baina uu","hi","hello","hey",
    "сайн уу","сайн байна уу","сайн байн уу","сайнуу","мэнд","мэндээ",
  ];
  return greetings.includes(q) || (q.length <= 28 && greetings.some(g => q === g || q.startsWith(g + " ")));
}

function historyText(convHistory = []) {
  return (Array.isArray(convHistory) ? convHistory : []).map(m => String(m?.text || "")).join("\n").toLowerCase();
}

function lastEmployeeNameFromHistory(convHistory = []) {
  const items = Array.isArray(convHistory) ? convHistory.slice().reverse() : [];
  for (const m of items) {
    const text = String(m?.text || "");
    const bold = text.match(/\*\*([^*]{3,80})\*\*/);
    if (bold) return bold[1].trim();
    const line = text.match(/-\s+([А-Яа-яӨөҮүЁёA-Za-z-]+(?:\s+[А-Яа-яӨөҮүЁёA-Za-z-]+){0,2})\s+—/);
    if (line) return line[1].trim();
  }
  return "";
}

async function classifyIntent(rawQuestion, convHistory = []) {
  if (isGreetingOnly(rawQuestion)) return "GREETING";
  const q = cyrillize(rawQuestion).toLowerCase();
  const h = cyrillize(historyText(convHistory));
  const asksForChange = ["нэмж", "нэмэх", "оруулмаар", "болгомоор", "өөрчил", "сайжруул"].some(k => q.includes(k));
  if (asksForChange && q.includes("хабэа") && q.includes("сургалт") && q.includes("журам")) {
    return "HABEA_MODULE_FEATURE";
  }
  if ((q.includes("эмэгт") || q.includes("эрэгт")) && (q.includes("ажил") || q.includes("хүн"))) return "EMPLOYEE_GENDER";
  if ((q.includes("ирц") || q.includes("ирсэн") || q.includes("ажилдаа")) &&
      (q.includes("ажилт") || q.includes("хүн") || q.includes("өнөөдөр") || q.includes("хэд") || q.includes("тоо"))) {
    return "ATTENDANCE_TODAY";
  }
  if ((q.includes("эрсд") || q.includes("аюул")) &&
      !(q.includes("хэрхэн") || q.includes("яаж") || q.includes("бүртгэх") ||
        q.includes("заавар") || q.includes("алхам")) &&
      (q.includes("нийт") || q.includes("мэдээлэл") || q.includes("хаагдаагүй") ||
       q.includes("нээлттэй") || q.includes("хэд") || q.includes("тоо") ||
       h.includes("хаагдаагүй эрсдэл") || h.includes("хабэа"))) {
    return "SAFETY_OPEN";
  }
  if ((q.includes("өөрийн") || q.includes("миний") || q.includes("захирал")) &&
      (q.includes("ажил") || q.includes("даалгавар")) &&
      (q.includes("юу") || q.includes("хийж") || q.includes("байгаа"))) {
    return "MY_WORK";
  }
  if ((h.includes("цахилгааны төлбөр") || h.includes("electricity")) &&
      (q.includes("сарын") || q.includes("sariinh") || /^\s*\d{1,2}/.test(q) || q.includes("зөрүү") || q.includes("төлөвлө"))) {
    return "ELECTRICITY_BILL";
  }
  if (q.includes("юу хийсэн") || q.includes("хийсэн байна") || q.includes("оруулсан") || q.includes("харагдсангүй") || q.includes("ажил хийсэн")) {
    return "WORK_ACTIVITY";
  }
  if (q.includes("тайлан") &&
      (q.includes("хэрхэн") || q.includes("яаж") || q.includes("гаргах") || q.includes("хэвлэх") || q.includes("export") || q.includes("excel") || q.includes("pdf"))) {
    return "REPORT_GUIDE";
  }
  if ((q.includes("гэмтэл") || q.includes("асахгүй") || q.includes("унтарсан")) &&
      (q.includes("гудамж") || q.includes("чойбалсан") || q.match(/гт-\d+/i))) {
    return "LOCATION_LIGHT_FAULT";
  }
  if (q.includes("гэрлэн дохио") || q.includes("дохио")) {
    if (q.includes("осол") || q.includes("тухайн үед") || q.includes("асаалтай байсан") ||
        q.includes("унтарсан байсан") || q.includes("баримт") || q.includes("нотлох") ||
        /\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(q)) {
      return "TRAFFIC_SIGNAL_LOG";
    }
    return "TRAFFIC_STATUS";
  }
  if (q.includes("гэр хороолол") || q.includes("цамхаг")) return "POLE_COUNT";
  if ((q.includes("асалт") || q.includes("ассан") || q.includes("асах") || q.includes("асдаг") || q.includes("гэрэл")) &&
      (q.includes("гудамж") || q.includes("эгнээ") || q.includes("чойбалсан") || q.includes("ялалт") ||
       q.includes("чита") || q.match(/гт-\d+/i) || q.split(/\s+/).length >= 2)) {
    return "LIGHT_LOCATION_STATUS";
  }
  if ((q.includes("миний") || q.includes("өөрийн")) && q.includes("дугаар")) return "MY_PHONE";
  if (q.includes("утас") || q.includes("дугаар") || q.includes("нас") || q.includes("боловсрол") ||
      q.includes("төрсөн") || q.includes("хүйс") || q.includes("үндэс") || q.includes("email") ||
      q.includes("имэйл") || q.includes("мэйл") || q.includes("ажилд орсон") ||
      q.includes("ажил орсон") || q.includes("албан тушаал") ||
      (q.includes("ямар") && q.includes("ажил")) ||
      (q.includes("ажил") && q.includes("хийдэг"))) {
    return "EMPLOYEE_DETAIL_LOOKUP";
  }
  if ((q.includes("цахилгаан") || q.includes("эрчим хүч")) && q.includes("төлбөр")) return "ELECTRICITY_BILL";
  if ((q.includes("гэрэл") || q.includes("гэрэлтүүлэг")) &&
      (q.includes("асахгүй") || q.includes("гэмтэл") || q.includes("унтарсан")) &&
      (q.includes("хэдэд") || q.includes("хуваарь") || q.includes("унтрах") || q.includes("аса"))) {
    return "LIGHT_STATUS_SCHEDULE";
  }
  if (q.includes("камер")) {
    const asksForEmployee = ["инженер", "ажилтан", "ажилладаг хүн", "хэн", "нэр", "утас", "дугаар"].some(k => q.includes(k));
    if (asksForEmployee) return "EMPLOYEE_LOOKUP";
    const asksForCameraData = ["мэдээл", "тойм", "байдал", "статус", "хэдэн", "тоо", "нийт", "байдаг", "байна", "хэмжээ"].some(k => q.includes(k));
    if (asksForCameraData) return "CAMERA_COUNT";
  }
  if ((q.includes("нярав") || q.includes("нягтлан")) && !q.includes("хэдэн") && !q.includes("тоо")) return "EMPLOYEE_LOOKUP";
  for (const rule of INTENT_RULES) {
    if (rule.groups.every(grp => grp.some(k => q.includes(k)))) return rule.id;
  }
  const guide = await matchGuide(rawQuestion);
  if (guide) return { intent: "KB_MATCH", guide };
  return "AI";
}

function classifyDevRequest(text) {
  const q = cyrillize(String(text || "").toLowerCase());
  const has = (...words) => words.some(w => q.includes(w));
  const requestType = has("харагдахгүй", "ажиллахгүй", "алдаа", "болохгүй", "эвдэр", "гац", "уншигдахгүй", "upload")
    ? "bug"
    : has("тайлан", "хэвлэх", "excel", "word", "pdf")
      ? "report"
      : has("болг", "нэм", "сайжруул", "санал", "хүсэлт")
        ? "feature"
        : "support";
  const severity = has("яаралтай", "огт", "болохгүй", "ажиллахгүй", "уналаа", "алдаа")
    ? "high"
    : has("хэцүү", "удаан", "харагдахгүй", "засмаар")
      ? "medium"
      : "low";
  return { requestType, severity };
}

function makeDevRequestTitle(text, requestType) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const prefix = requestType === "bug" ? "Алдаа" : requestType === "report" ? "Тайлан" : requestType === "feature" ? "Санал" : "Тусламж";
  return `${prefix}: ${clean.slice(0, 70)}${clean.length > 70 ? "..." : ""}`;
}

module.exports = {
  INTENT_RULES,
  isGreetingOnly,
  historyText,
  classifyIntent,
  classifyDevRequest,
  makeDevRequestTitle,
  lastEmployeeNameFromHistory,
};
