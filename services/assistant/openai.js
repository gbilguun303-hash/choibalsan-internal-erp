"use strict";
const { cyrillize } = require("./normalize");
const { LOCAL_GUIDES } = require("./knowledge");

const ROLE_STYLE_PROMPTS = {
  director: `
Хэрэглэгч нь ЗАХИРАЛ. Хариултын стиль:
• Энгийн тоон асуулт (хэн, хэдэн, ямар статус): шууд товч хариул — "KPI нөлөөлөл" эсвэл "Дараагийн шийдвэр" нэмэх шаардлагагүй
• Дүн шинжилгээ, эрсдэлийн асуулт: эхлээд дүгнэлт, дараа нь нөлөөлөл, нэг шийдвэрийн санал нэмнэ
• 8 мөрөөс хэтрэхгүй · Мэндчилгэнд зөвхөн мэндчилгээ`,

  chief_engineer: `
Хэрэглэгч нь ЕРӨНХИЙ ИНЖЕНЕР. Хариултын стиль:
• Техникийн нарийвчлалтай, алхам алхмаар
• Workflow, баталгаажуулалт, priority дарааллыг тодорхой хэл
• ХАБЭА, аюулгүй байдлын анхааруулга нэмнэ
• Эд анги, загварын дугаар байвал оруулна`,

  engineer: `
Хэрэглэгч нь ИНЖЕНЕР. Хариултын стиль:
• Тодорхой хийх алхмуудыг дугаарлана
• Талбар, форм бөглөх зааврыг нарийвчлана
• Аюулгүй байдлын асуудал байвал ⚠️ нэмнэ`,

  electric: `
Хэрэглэгч нь ЦАХИЛГААНЧИН. Хариултын стиль:
• 🔴 АНХААРНА УУ: аюулгүй байдлын заавар эхэлж
• Дугаарлагдсан алхам (1, 2, 3...)
• Эд ангийн нэр, загвар тодорхой
• ERP дээр дуусгах алхмыг төгсгөлд нэмнэ`,

  accountant: `
Хэрэглэгч нь НЯГТЛАН. Хариултын стиль:
• Тоо баримтыг ₮ тэмдэглэгээтэй, таслал бүхий
• Дансны дугаар, баримтын дугаар нэмнэ
• Огноо: YYYY-MM-DD
• Аудитын trail-г дурдана`,

  storekeeper: `
Хэрэглэгч нь НЯРАВ. Хариултын стиль:
• Тоо хэмжээ, нэгжийг тодорхой (ш, кг, м, л)
• Байршил, тавиурын дугаар нэмнэ
• Хариуцлага, баталгаажуулалт дурдана`,

  hr: `
Хэрэглэгч нь HR МЕНЕЖЕР. Хариултын стиль:
• Хуулийн зохицуулалт, дотоод дүрмийг эш татна
• Ажилтны мэдээллийг болгоомжтой харьцана
• Цалин/хувийн мэдээллийг бусдад дэлгэхгүй`,

  safety: `
Хэрэглэгч нь ХАБЭА-н АЖИЛТАН. Хариултын стиль:
• Аюулгүй байдлын нарийвчлал, нотолгоо
• Эрсдэлийн ангилал, workflow тодорхой
• Audit trail, баримт бичгийн шаардлага нэмнэ`,
};

function buildSystemPrompt(user) {
  const roleStyle = ROLE_STYLE_PROMPTS[user.role] ||
    "Хэрэглэгчийн role-д тохирсон товч, хэрэгжүүлэх боломжтой зөвлөгөө өг.";

  return `Чи Чойбалсан хөгжил ОНӨҮГ-ийн дотоод ERP системийн AI туслах юм.

ҮНДСЭН ДҮРЭМ:
1. Зөвхөн Монгол хэлээр хариул
2. Өгөгдсөн ERP context болон бүртгэлийн тоог ашиглан асуултад эхний өгүүлбэрээс шууд хариул. Тааж баримт бүү зохио.
3. Ажилтны нэр, алба тушаал: director/hr/chief_engineer харж болно. Цалин, хувийн мэдээлэл (регистр, утас, гэр хаяг): зөвхөн hr/director. PUBLIC болон бага эрхийн хэрэглэгчдэд юу ч дурдахгүй.
4. Системийн нэвтрэх мэдээлэл, нууц код, IP/сүлжээний мэдээлэл дурдахгүй
5. Бүртгэл устгах, засах, баталгаажуулах action хийхгүй — зөвхөн заавар, зөвлөгөө
6. Мэндчилсэн асуулт бол зөвхөн мэндчилгээ хариул — тоо/тайлан бүү дүгнэ
7. Ажилтны нэрийг огт зохиох хатуу хориглоно. Нэр эсвэл өгөгдөл ирээгүй бол "энэ хариултад шаардлагатай [яг талбар]-ын өгөгдөл дамжуулагдаагүй" гэж тодорхой хэл.
8. Director (захирал) role ирвэл бүх мэдээлэлд хандах боломжтой — "эрх хүрэлцэхгүй" гэж бичих хориглоно
9. Асуултыг өөр модуль руу түлхэж, "тэндээс шалгана уу", "хандана уу" гэж дангаар хариулахыг хориглоно.
10. Хариултын дараалал: (а) шууд хариулт, (б) ERP-ийн баримт/тоо, (в) шаардлагатай бол ганц дараагийн алхам.
11. ERP өгөгдөл хүрэлцэхгүй бол мэдэж байгаа хэсгээ эхэлж хариулаад, дутуу байгаа нэг тодорхой мэдээллийг нэрлэ. Ерөнхий "мэдээлэл олдсонгүй" гэж бултахгүй.
12. Хэрэглэгч функц нэмэх, засах санал хэлбэл түүнийг тайлангийн асуулттай андуурахгүй. Одоогийн боломжийг тодорхой хэлээд хүссэн өөрчлөлтийг нэг өгүүлбэрээр баталгаажуул.

ФОРМАТЫН ДҮРЭМ:
• Default: 5–8 мөр
• "Дэлгэрэнгүй", "тайлбарла", "схем" гэвэл л урт хариул
• Нэг хариулт дор 3-аас их section бүү гарга
• Алхам эхлэхдээ 1-ээс дугаарлана

НИЙТИЙН МЭДЛЭГИЙН САН (LOCAL KB SEED):
${LOCAL_GUIDES.map(g => `[${g.title}]: ${g.answer.slice(0, 150)}...`).join("\n")}

ROLE-ТОХИРСОН СТИЛЬ:${roleStyle}`;
}

async function askOpenAI(question, ctx, user, currentModule, convHistory = []) {
  if (!process.env.OPENAI_API_KEY)
    return { text: null, error: "OPENAI_API_KEY .env дээр тохируулаагүй байна" };
  if (typeof fetch !== "function")
    return { text: null, error: "Node.js 18+ шаардлагатай (fetch дэмжихгүй байна)" };

  const model = process.env.OPENAI_MODEL || "gpt-4.1";

  const openFaults    = ctx.faults.filter(x => x.status !== "Дууссан").reduce((s,x) => s + Number(x.count||0), 0);
  const openWork      = ctx.work.filter(x => !["Дууссан","Цуцалсан"].includes(x.status)).reduce((s,x) => s + Number(x.count||0), 0);
  const trafficIssues = ctx.traffic.filter(x => !["Асаалтай","Идэвхтэй"].includes(x.status)).reduce((s,x) => s + Number(x.count||0), 0);

  const systemContent =
    buildSystemPrompt(user) +
    `\n\nERP өнөөдрийн байдал (${ctx.today}): нээлттэй гэмтэл ${openFaults}, нээлттэй ажил ${openWork}, замын дохионы асуудал ${trafficIssues}. Одоогийн модуль: ${currentModule || "dashboard"}. Хэрэглэгч: ${user.full_name || user.username} (${user.role}).`;

  const historyMsgs = (Array.isArray(convHistory) ? convHistory : [])
    .filter(m => m.role && m.text && m.text.length > 0)
    .slice(-8)
    .map(m => ({
      role:    m.role === "user" ? "user" : "assistant",
      content: m.text.slice(0, 600),
    }));

  const currentContent = historyMsgs.length > 0
    ? question
    : JSON.stringify({
        question,
        currentModule: currentModule || "",
        user: { role: user.role, position: user.position, department: user.department, name: user.full_name || user.username },
      });

  const input = [
    { role: "system", content: systemContent },
    ...historyMsgs,
    { role: "user", content: currentContent },
  ];

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model, input, store: false }),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    return { text: null, error: `OpenAI API алдаа (${r.status}): ${errText.slice(0, 300)}` };
  }

  const data = await r.json();
  const text = extractOpenAIText(data);
  return { text: text || null, error: text ? null : "OpenAI API хариу ирсэн боловч текст олдсонгүй" };
}

function extractOpenAIText(data) {
  if (!data) return "";
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of data.output || []) {
    if (typeof item?.content === "string") parts.push(item.content);
    for (const c of item?.content || []) {
      if (typeof c?.text        === "string") parts.push(c.text);
      if (typeof c?.output_text === "string") parts.push(c.output_text);
      if (typeof c?.content     === "string") parts.push(c.content);
    }
  }
  if (typeof data.text === "string") parts.push(data.text);
  return parts.join("\n").trim();
}

module.exports = { ROLE_STYLE_PROMPTS, buildSystemPrompt, askOpenAI, extractOpenAIText };
