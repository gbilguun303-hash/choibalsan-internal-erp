"use strict";
const { cyrillize } = require("./normalize");

function money(n) {
  return `${Math.round(Number(n || 0)).toLocaleString("mn-MN")}₮`;
}

function roleGreeting(user) {
  const name = user.full_name || user.username || "та";
  const ROLE_GREETINGS = {
    director: {
      hello: `Өдрийн мэнд, ${name} захирал аа.`,
      help:  `Өнөөдрийн KPI, эрсдэл, шийдвэр гаргалтын товч дүнг хэлье.\n→ "Өнөөдрийн тойм" гэж бичвэл тэр даруй харагдана.`,
    },
    chief_engineer: {
      hello: `Сайн байна уу, ${name} инженер ээ.`,
      help:  "Техникийн ажлын явц, гэмтэл баталгаажуулалт, хугацаа хэтэрсэн ажлуудад тусалъя.",
    },
    engineer: {
      hello: `Сайн байна уу, ${name} инженер ээ.`,
      help:  "Ажил бүртгэх, гүйцэтгэл шинэчлэх, гэмтэл мэдүүлэх алхмуудыг заагаад өгье.",
    },
    electric: {
      hello: `Сайн байна уу, ${name}.`,
      help:  "Гэрэлтүүлэг, гэмтэл, засвар, гэрлэн дохионы журнал — аль хэсгээс эхлэх вэ?",
    },
    accountant: {
      hello: `Сайн байна уу, ${name}.`,
      help:  "Цахилгааны уншилт, нэхэмжлэл, төлбөр, санхүүгийн тайланд тусалъя.",
    },
    storekeeper: {
      hello: `Сайн байна уу, ${name}.`,
      help:  "Агуулахын орлого, зарлага, үлдэгдэл, захиалга — юуг бүртгэх вэ?",
    },
    hr: {
      hello: `Сайн байна уу, ${name}.`,
      help:  "Ажилтан, ирц, гэрээ, сургалт, HR тайланд тусалъя.",
    },
    safety: {
      hello: `Сайн байна уу, ${name}.`,
      help:  "ХАБЭА эрсдэл, зөвшөөрөл, шалгалт, audit trail — юу хэрэгтэй вэ?",
    },
    worker: {
      hello: `Сайн байна уу, ${name}.`,
      help:  "ERP дээр юу хийх хэрэгтэйгээ бичнэ үү, алхам алхмаар заагаад өгье.",
    },
  };
  const g = ROLE_GREETINGS[user.role] || {
    hello: `Сайн байна уу, ${name}.`,
    help:  "ERP дээр юу хийхийг хэлнэ үү.",
  };
  return `${g.hello}\n${g.help}`;
}

function fmtLightSchedule(ctx) {
  const rows = ctx.lightSchedules || [];
  if (!rows.length)
    return "ERP дээрх бүртгэлээр өнөөдрийн гэрэлтүүлгийн цагийн тохиргоо олдсонгүй.\n\nГэрэлтүүлэг → Цаг тохиргоо хэсэгт өнөөдрийн хуваарийг бүртгээд дахин шалгаарай.";
  const lines = rows.map(r =>
    r.is_always_off
      ? `- ${r.category}: өнөөдөр унтраалттай гэж тохируулагдсан`
      : `- ${r.category}: **${r.on_time||"—"}** асаад **${r.off_time||"—"}** унтарна`
  );
  return `ERP-ийн өнөөдрийн (${ctx.today}) хүчинтэй гэрлийн хуваарь:\n\n${lines.join("\n")}\n\nАнхаарах зүйл: LoRa болон талбайн баталгаажуулалтаар бодит асалтыг тулгаж болно.`;
}

function fmtLightStatusAndSchedule(faults, ctx) {
  const faultText = fmtOpenLightFaults(faults);
  const scheduleText = fmtLightSchedule(ctx);
  return `${faultText}\n\nӨнөөдрийн асаах/унтраах хуваарь:\n${scheduleText}`;
}

function fmtPoleCount(s) {
  const rowsFor = (rows, category) => (rows || []).slice(0, 12).map(r => {
    const faults = (s.faults || []).filter(f =>
      f.category === category &&
      ((f.location_type === "sl_ger_inventory" && Number(f.location_id || 0) === Number(r.id || 0)) ||
       String(f.location_name || "").toLowerCase().includes(String(r.location_name || "").toLowerCase()))
    );
    const broken = faults.reduce((sum, f) => sum + Number(f.broken_count || 0), 0);
    const totalHeads = Number(r.head_count || r.total_count || 0);
    const working = totalHeads ? Math.max(0, totalHeads - broken) : 0;
    const pct = totalHeads ? Math.round(working / totalHeads * 100) : 0;
    return `- ${r.location_name}: ${Number(r.total_count || 0)} шон, ${totalHeads} толгой, ${r.light_type || "төрөл бүртгэлгүй"}; ${broken ? `${broken} асахгүй, ${working}/${totalHeads} асаж байна (${pct}%)` : "нээлттэй гэмтэлгүй"}${r.meter_no ? ` · тоолуур ${r.meter_no}` : ""}`;
  });
  const gerFaults = (s.faults || []).filter(f => f.category === "Гэр хорооллын гэрэл");
  const towerFaults = (s.faults || []).filter(f => f.category === "Цамхагийн гэрэл");
  const gerBroken = gerFaults.reduce((sum, f) => sum + Number(f.broken_count || 0), 0);
  const towerBroken = towerFaults.reduce((sum, f) => sum + Number(f.broken_count || 0), 0);
  const gerLines = rowsFor(s.gerRows, "Гэр хорооллын гэрэл");
  const towerLines = rowsFor(s.towerRows, "Цамхагийн гэрэл");
  const focusedFaults = (s.faults || []).filter(f =>
    s.focus === "ger" ? f.category === "Гэр хорооллын гэрэл" :
    s.focus === "tower" ? f.category === "Цамхагийн гэрэл" :
    true
  );
  const faultLines = focusedFaults.slice(0, 12).map(f =>
    `- #${f.id} ${f.location_name}: ${f.broken_count}/${f.total_heads || "?"} толгой асахгүй · ${f.category} · ${f.status}${f.report_date ? " · " + f.report_date : ""}`
  );
  const showGer = s.focus === "all" || s.focus === "ger";
  const showTower = s.focus === "all" || s.focus === "tower";
  return (
    `ERP дээрх гэрэлтүүлгийн бүртгэлээр:\n\n` +
    `**Нийт шон: ${Number(s.totalPoles||0).toLocaleString("mn-MN")}**  |  Нийт толгой: ${Number(s.totalHeads||0).toLocaleString("mn-MN")}\n\n` +
    `- Авто замын гэрэл: ${Number(s.road.poles||0).toLocaleString("mn-MN")} шон, ${Number(s.road.heads||0).toLocaleString("mn-MN")} толгой\n` +
    `- Гэр хорооллын гэрэл: ${Number(s.ger.poles||0).toLocaleString("mn-MN")} шон, ${Number(s.ger.heads||0).toLocaleString("mn-MN")} толгой, нээлттэй ${gerFaults.length} гэмтэл, ${gerBroken} толгой асахгүй\n` +
    `- Цамхагийн гэрэл: ${Number(s.tower.poles||0).toLocaleString("mn-MN")} шон, ${Number(s.tower.heads||0).toLocaleString("mn-MN")} толгой, нээлттэй ${towerFaults.length} гэмтэл, ${towerBroken} толгой асахгүй\n\n` +
    (showGer && gerLines.length ? `Гэр хорооллын бүртгэлээс эхний ${gerLines.length}:\n${gerLines.join("\n")}\n\n` : "") +
    (showTower && towerLines.length ? `Цамхагийн бүртгэлээс эхний ${towerLines.length}:\n${towerLines.join("\n")}\n\n` : "") +
    (faultLines.length ? `Нээлттэй гэмтлүүд:\n${faultLines.join("\n")}\n\n` : "") +
    `Анхаарах зүйл: талбайн тооллогоор баталгаажуулвал албан дүн болно.`
  );
}

function fmtAssetValue(s) {
  const src = s.fixedVal ? "нягтлангийн үндсэн хөрөнгийн дансаар" : "объектийн бүртгэлийн үнээр";
  return (
    `ERP дээрх бүртгэлээр байгууллагын тооцоолсон хөрөнгийн нийт дүн: **${money(s.total)}**\n\n` +
    `- Үндсэн хөрөнгө (${src}): ${money(s.fixedVal || s.regVal)}\n` +
    `- Агуулах/материалын үлдэгдэл: ${money(s.whVal)}\n` +
    `- Мөнгөн хөрөнгө + авлага – өглөг: ${money(s.finNet)}\n\n` +
    `Санхүүгийн албан баланс гаргахдаа нягтлангийн баталгаажсан тайлантай тулгана.`
  );
}

function fmtEmployeeCount(s) {
  const active = s.byStatus.find(x => x.status === "Идэвхтэй")?.count || s.total;
  const deptLines = s.byDept.map(x => `  - ${x.department}: ${x.count} хүн`).join("\n");
  return (
    `ERP дээрх HR бүртгэлээр нийт **${s.total} ажилтан** бүртгэлтэй.\nИдэвхтэй: ${active} хүн.\n\n` +
    (deptLines ? `Хэлтсээр:\n${deptLines}\n\n` : "") +
    `Анхаарах зүйл: зөвхөн active бүртгэлтэй ажилтнуудыг тооцов.`
  );
}

function fmtTodayAttendance(s) {
  return (
    `Өнөөдөр (${s.today}) ирцийн бүртгэлээр **${s.present} хүн** ажилдаа ирсэн.\n\n` +
    `- Нийт идэвхтэй ажилтан: ${s.active}\n` +
    `- Ажилласан: ${s.by["Ажилласан"]||0}\n` +
    `- Хоцорсон: ${s.by["Хоцорсон"]||0}\n` +
    `- Илүү цаг: ${s.by["Илүү цаг"]||0}\n` +
    `- Чөлөө/өвчтэй/амралт: ${(s.by["Чөлөө"]||0)+(s.by["Өвчтэй"]||0)+(s.by["Ээлжийн амралт"]||0)}\n\n` +
    `Анхаарах зүйл: зөвхөн бүртгэл орсон ажилтнуудыг тооцов.`
  );
}

function fmtMySalary(s) {
  if (s.payroll) {
    return (
      `${s.year}-${String(s.month).padStart(2,"0")} сарын цалингийн тооцоо:\n\n` +
      `Гар дээр авах: **${money(s.payroll.net_salary)}**\n\n` +
      `- Үндсэн цалин: ${money(s.payroll.base_salary)}\n` +
      `- Илүү цаг: ${money(s.payroll.overtime_pay)}\n` +
      `- Нэмэгдэл: ${money(s.payroll.bonuses)}\n` +
      `- Суутгал: −${money(s.payroll.deductions)}\n\n` +
      `Төлөв: ${s.payroll.status||"—"}\n\n` +
      `Анхаарах зүйл: баталгаажаагүй бол энэ нь урьдчилсан тооцоо байж болно.`
    );
  }
  const gross = [s.user?.salary,s.user?.skill_allowance,s.user?.tenure_allowance,s.user?.meal_allowance]
    .reduce((a,v) => a + Number(v||0), 0);
  return (
    `Энэ сарын payroll тооцоо одоогоор бүртгэгдээгүй байна.\n\n` +
    `HR профайл дээрх нийт суурь дүн: ${money(gross)}.\n\n` +
    `Нягтлан payroll тооцоо оруулсны дараа бодит гар дээр авах дүн харагдана.`
  );
}

function fmtOpenFaults(s) {
  const lOpen   = s.lighting.reduce((a,x) => a + Number(x.count||0), 0);
  const lBroken = s.lighting.reduce((a,x) => a + Number(x.broken_heads||0), 0);
  const wOpen   = s.work.reduce((a,x) => a + Number(x.count||0), 0);
  const wLines  = s.work.map(x => `  - ${x.status}: ${x.count}`).join("\n");
  return (
    `ERP дээрх нээлттэй гэмтлийн тойм:\n\n` +
    `**Гэрэлтүүлгийн гэмтэл:** ${lOpen} тасалбар, нийт ${lBroken} толгой асахгүй\n` +
    `**Засварын ажлын бүртгэл:** ${wOpen} нээлттэй\n` +
    (wLines ? `${wLines}\n\n` : "\n") +
    `Дэлгэрэнгүй: Гэрэлтүүлэг → Гэмтэл болон Ажлын явц хэсгүүдийг харна уу.`
  );
}

function fmtOpenLightFaults(s) {
  if (!s.total.count) return "Одоогоор нээлттэй гэрэлтүүлгийн гэмтэл байхгүй байна.";
  const lines = s.byType.map(r => `- ${r.category}: ${r.cnt} газар, ${r.broken} толгой асахгүй`).join("\n");
  return (
    `Нээлттэй гэрэлтүүлгийн гэмтэл: **${s.total.count} тасалбар**, нийт **${s.total.broken} толгой** асахгүй.\n\n` +
    `${lines}\n\n` +
    `Гэрэлтүүлэг → Гэмтэл хэсгээс дэлгэрэнгүй харна уу.`
  );
}

function fmtLocationLightFaults(s) {
  if (!s.term) {
    return "Аль гудамж/байршлын гэмтэл хэрэгтэйг нэрээр нь бичээрэй. Жишээ: `Чойбалсангийн гудамжийн гэмтэл` эсвэл `ГТ-015 гэмтэл`.";
  }
  if (!s.rows.length) {
    return `**${s.term}** нэрээр нээлттэй гэрэлтүүлгийн гэмтэл олдсонгүй.\n\nГэрэлтүүлэг → Гэмтэл хэсгээс байршлын нэрээр дахин шүүж шалгана уу.`;
  }
  const totalBroken = s.rows.reduce((sum, r) => sum + Number(r.broken_count || 0), 0);
  const lines = s.rows.map(r =>
    `- #${r.id}${r.point_code ? " " + r.point_code : ""} ${r.location_name || r.point_name || "Байршилгүй"} (${r.category}) — ${r.broken_count} толгой асахгүй / нийт ${r.total_heads}, төлөв: ${r.status}${r.report_date ? " · " + r.report_date : ""}`
  );
  return `**${s.term}** байршлын нээлттэй гэмтэл (${s.rows.length} мөр): нийт **${totalBroken} толгой** асахгүй.\n\n${lines.join("\n")}\n\nДэлгэрэнгүй: Гэрэлтүүлэг → Гэмтэл.`;
}

function fmtLightLocationStatus(s) {
  if (!s.term) return "Аль гудамж эсвэл эгнээний асалтыг шалгах вэ? Жишээ: `Чойбалсангийн гудамж асалт` эсвэл `Ялалтын 23-р эгнээний асалт`.";
  const pointTotal = (p) => Number(p?.total_heads || 0) || (Number(p?.lamp_count || 0) * Number(p?.head_count || 1));
  const wattText = (p) => {
    const type = p?.light_type || "төрөл бүртгэлгүй";
    const watt = Number(p?.wattage_per_lamp || 0);
    return watt ? `${type} · ${watt}W` : type;
  };
  const faultMatchesPoint = (f, p) => {
    if (!p) return false;
    const samePoint = f.location_type === "sl_point" && Number(f.location_id || 0) === Number(p.id || 0);
    const name = String(p.name || "").toLowerCase();
    const isRoadPoint = String(p.code || "").startsWith("ГТ-");
    const isRoadFault = String(f.category || "").includes("Авто зам");
    return samePoint || (name && String(f.location_name || "").toLowerCase().includes(name) && (!isRoadPoint || isRoadFault));
  };
  if (Array.isArray(s.points)) {
    if (!s.points.length) return "Мэдээлэл олдсонгүй";
    let totalBroken = 0;
    const rows = s.points.map(p => {
      const pointFaults = (s.faults || []).filter(f => faultMatchesPoint(f, p));
      const total = pointTotal(p);
      const broken = pointFaults.reduce((sum, f) => sum + Number(f.broken_count || 0), 0);
      totalBroken += broken;
      const working = total ? Math.max(0, total - broken) : 0;
      const pct = total ? Math.round(working / total * 100) : 0;
      return `- ${p.code} ${p.name}: ${Number(p.lamp_count || 0)} шон, ${total} толгой, ${wattText(p)}; ${working}/${total} асаж байна${broken ? `, ${broken} асахгүй, ${pointFaults.length} гэмтэл (${pct}%)` : " (нээлттэй гэмтэлгүй)"}`;
    });
    const totalHeads = s.points.reduce((sum, p) => sum + pointTotal(p), 0);
    return `Авто замын бүх гудамжийн ERP асалтын товч:\n\nНийт **${totalHeads}** толгойноос нээлттэй бүртгэлээр **${totalBroken}** асахгүй байна.\n\n${rows.join("\n")}\n\nДэлгэрэнгүй: Гэрэлтүүлэг → Гэмтэл / Тоолуур.`;
  }
  if (!s.point && !s.faults.length) return "Мэдээлэл олдсонгүй";

  const totalFromPoint = pointTotal(s.point);
  const totalFromFaults = s.faults.reduce((sum, r) => sum + Number(r.total_heads || 0), 0);
  const total = totalFromPoint || totalFromFaults;
  const broken = s.faults.reduce((sum, r) => sum + Number(r.broken_count || 0), 0);
  const working = total ? Math.max(0, total - broken) : null;
  const pct = total ? Math.round(working / total * 100) : null;
  const title = s.point
    ? `${s.point.name}${s.point.code ? " (" + s.point.code + ")" : ""}`
    : s.term;
  const detailLines = s.point ? [
    `- Байршил: ${s.point.location || s.point.name || "—"}`,
    `- Шон: ${Number(s.point.lamp_count || 0)}, нэг шонд: ${Number(s.point.head_count || 0) || "—"} толгой, нийт: ${total || "—"} толгой`,
    `- Гэрлийн төрөл / чадал: ${wattText(s.point)}`,
    s.point.needs_poles ? `- Нөхөх шон: ${s.point.needs_poles}` : null,
    s.point.meter_no ? `- Тоолуур: ${s.point.meter_no}` : null,
    s.point.notes ? `- Тайлбар: ${s.point.notes}` : null,
  ].filter(Boolean).join("\n") : "";

  if (!s.faults.length) {
    return `${title} дээр ERP-д нээлттэй асахгүй гэрлийн гэмтэл бүртгэгдээгүй байна.\n\n` +
      (detailLines ? `Бүртгэлийн мэдээлэл:\n${detailLines}\n\n` : "") +
      (total ? `Одоогийн ERP бүртгэлээр **${total}/${total}** толгой асаж байна гэж тооцлоо.` : "Нийт толгойн тоо бүртгэлгүй байна.") +
      "\n\nАнхаарах зүйл: энэ нь ERP-д бүртгэгдсэн мэдээлэл, талбайн бодит шалгалтаар баталгаажуулна.";
  }

  const lines = s.faults.map(r =>
    `- #${r.id} ${r.location_name}: ${r.broken_count}/${r.total_heads || "?"} толгой асахгүй · ${r.category || "—"} · ${r.status}${r.report_date ? " · " + r.report_date : ""}${r.notes ? " · " + r.notes : ""}`
  );
  const summary = total
    ? `Нийт **${total}** толгойноос **${broken}** асахгүй, ойролцоогоор **${working}** асаж байна (${pct}%).`
    : `Нээлттэй бүртгэлээр нийт **${broken}** толгой асахгүй байна.`;
  return `${title} асалтын ERP дүн:\n\n${summary}\n\n${detailLines ? `Бүртгэлийн мэдээлэл:\n${detailLines}\n\n` : ""}Нээлттэй гэмтэл (${s.faults.length}):\n${lines.join("\n")}\n\nДэлгэрэнгүй: Гэрэлтүүлэг → Гэмтэл.`;
}

function fmtEmployeeGender(s) {
  if (!s.rows.length) {
    return `ERP-ийн HR бүртгэлд ${s.gender.toLowerCase()} ажилтан олдсонгүй. HR → Ажилтны бүртгэл дээр хүйсийн талбар бөглөгдсөн эсэхийг шалгана уу.`;
  }
  const lines = s.rows.map(r =>
    `- **${r.full_name}** — ${r.position || "—"}${r.department ? " · " + r.department : ""}`
  );
  return `ERP HR бүртгэлээр **${s.gender.toLowerCase()} ажилтан ${s.rows.length}** байна:\n\n${lines.join("\n")}\n\nДэлгэрэнгүй: Хүний нөөц → Ажилтны бүртгэл.`;
}

function fmtTrafficStatus(s) {
  const byStatus = Array.isArray(s) ? s : (s.byStatus || []);
  const assets = Array.isArray(s) ? [] : (s.assets || []);
  const faults = Array.isArray(s) ? [] : (s.faults || []);
  const logs = Array.isArray(s) ? [] : (s.recentLogs || []);
  if (!byStatus.length && !assets.length)
    return "Гэрлэн дохионы бүртгэл ERP дээр олдсонгүй. Объектийн бүртгэл → Гэрлэн дохио хэсэгт оруулна уу.";
  const total = byStatus.reduce((sum,x) => sum + Number(x.count||0), 0) || assets.length;
  const lines = byStatus.map(x => `- ${x.status}: ${x.count}`).join("\n");
  const assetLines = assets.slice(0, 12).map(a =>
    `- ${a.asset_code || "#" + a.id} ${a.name}: ${a.location || "байршилгүй"} · төлөв ${a.status || "—"} · чанар ${a.condition || "—"}${a.specs ? " · " + a.specs : ""}`
  );
  const faultLines = faults.slice(0, 10).map(f =>
    `- #${f.id} ${f.location_name}: ${f.broken_count}/${f.total_heads || "?"} асуудалтай · ${f.status}${f.report_date ? " · " + f.report_date : ""}${f.notes ? " · " + f.notes : ""}`
  );
  const logLines = logs.slice(0, 5).map(l =>
    `- ${l.asset_name || "Дохио"}: ${l.status} · ${l.started_at}${l.ended_at ? " - " + l.ended_at : ""}${l.evidence_no ? " · баримт " + l.evidence_no : ""}`
  );
  return (
    `ERP дээрх гэрлэн дохионы дэлгэрэнгүй:\n\n**Нийт: ${total}**\n${lines || "- Төлвөөр ангилсан тоо бүртгэлгүй"}\n\n` +
    (assetLines.length ? `Бүртгэлийн мөрүүдээс:\n${assetLines.join("\n")}\n\n` : "") +
    (faultLines.length ? `Нээлттэй гэмтэл:\n${faultLines.join("\n")}\n\n` : "Нээлттэй гэмтэл бүртгэгдээгүй байна.\n\n") +
    (logLines.length ? `Сүүлийн журнал:\n${logLines.join("\n")}\n\n` : "") +
    `Дэлгэрэнгүй: Объектийн бүртгэл → Гэрлэн дохио.`
  );
}

function fmtTrafficSignalLog(s) {
  if (!s.at && !s.recentLogs.length) {
    return "Гэрлэн дохионы цагийн журнал ERP-д бүртгэгдээгүй байна.\n\nОбъектийн бүртгэл → Гэрлэн дохио → 🕒 товчоор статус бүртгэж эхлэнэ үү.";
  }
  if (s.at) {
    if (s.matchedAt) {
      const m = s.matchedAt;
      const isOn = ["Асаалтай", "Ажиллаж байна", "Normal"].includes(m.status);
      const icon = isOn ? "🟢" : "🔴";
      return (
        `**${s.at}** цагийн байдлаар гэрлэн дохионы журнал:\n\n` +
        `${icon} **${m.status}** — ${m.asset_name || "?"} (${m.asset_location || "—"})\n` +
        `Эхэлсэн: ${m.started_at}${m.ended_at ? ` · Дууссан: ${m.ended_at}` : " · (одоо хүртэл)"}\n` +
        (m.evidence_no ? `Баримтын дугаар: **${m.evidence_no}**\n` : "") +
        (m.source ? `Эх сурвалж: ${m.source}\n` : "") +
        (m.notes ? `Тэмдэглэл: ${m.notes}\n` : "") +
        (m.recorded_by_name ? `Бүртгэсэн: ${m.recorded_by_name}` : "") +
        `\n\nЦагдаагийн байгууллагад өгөх баримт бол Объектийн бүртгэл → Гэрлэн дохио → 🔎 товчоор хэвлэнэ үү.`
      );
    }
    return (
      `**${s.at}** цагийн журнал ERP-д олдсонгүй.\n\n` +
      `Энэ цагт бүртгэл хийгдээгүй, эсвэл дохио тухайн цагт систем дотор бүртгэгдэгүй байж болно.\n` +
      `Одоогийн журналыг шалгана уу:` +
      (s.recentLogs.length ? `\n${s.recentLogs.slice(0,3).map(r => `- ${r.started_at}: **${r.status}** — ${r.asset_name||"?"}`).join("\n")}` : "")
    );
  }
  const lines = s.recentLogs.map(r =>
    `- **${r.started_at}**${r.ended_at ? `→${r.ended_at}` : " (одоо)"}: ${r.status} — ${r.asset_name||"?"} (${r.asset_location||"—"})${r.evidence_no ? ` 📄${r.evidence_no}` : ""}`
  ).join("\n");
  return (
    `Гэрлэн дохионы сүүлийн журнал (${s.recentLogs.length}):\n\n${lines}\n\n` +
    `Тухайн ослын огноо цагийг хэлбэл тухайн үеийн статусыг шалгаж өгье.\n` +
    `Объектийн бүртгэл → Гэрлэн дохио → 🔎 товчоор нотлох баримт гаргана.`
  );
}

function fmtLowStock(rows) {
  if (!rows.length)
    return "Агуулахын нөөц хангалтай байна. Доод хязгаараас буурсан материал олдсонгүй.";
  const lines = rows.map(r =>
    `- **${r.name}**: үлдэгдэл ${r.balance}${r.unit||""} (доод хязгаар: ${r.min_qty}${r.unit||""})`
  ).join("\n");
  return (
    `Доод хязгаараас буурсан материал (${rows.length} нэр):\n\n${lines}\n\n` +
    `Агуулах → Нөөцийн удирдлага хэсгийг шалгаж захиалга өгнө үү.`
  );
}

function fmtMonthlyExpenses(rows) {
  if (!rows.length) return "Энэ сарын зардлын бүртгэл ERP дээр олдсонгүй.";
  const total = rows.reduce((s,x) => s + Number(x.total||0), 0);
  const lines = rows.map(x => `- ${x.type}: ${money(x.total)}`).join("\n");
  return (
    `Энэ сарын зардлын тойм:\n\n**Нийт: ${money(total)}**\n\n${lines}\n\n` +
    `Санхүү → Зардлын бүртгэл хэсгийг дэлгэрэнгүй харна уу.`
  );
}

function fmtBudgetProgress(s) {
  const pct = s.planned > 0 ? Math.round(s.spent / s.planned * 100) : 0;
  const filled = Math.min(Math.floor(pct / 5), 20);
  const bar = "█".repeat(filled) + "░".repeat(20 - filled);
  const diff = s.spent - s.planned;
  return (
    `${s.year} оны төсвийн гүйцэтгэл:\n\n` +
    `Зарцуулсан: **${money(s.spent)}** / Төлөвлөсөн: ${money(s.planned)}\n` +
    `Гүйцэтгэл: **${pct}%**  ${bar}\n\n` +
    (diff > 0 ? `⚠️ Төсвөөс ${money(diff)} хэтэрсэн байна.`
              : diff < 0 ? `✅ Төсвөөс ${money(Math.abs(diff))} үлдэгдэлтэй байна.`
              : "Төсөвтэй яг тэнцэж байна.")
  );
}

function fmtOpenSafety(rows) {
  if (!rows.length) return "Нээлттэй ХАБЭА тайлан ERP дээр олдсонгүй.";
  const total = rows.reduce((s,x) => s + Number(x.count||0), 0);
  const lines = rows.map(x => `- ${x.risk_level}: ${x.count} тайлан`).join("\n");
  return (
    `Нийт **${total} нээлттэй** ХАБЭА эрсдэлийн тайлан:\n\n${lines}\n\n` +
    `ХАБЭА → Эрсдэлийн бүртгэл хэсгийг шалгана уу.`
  );
}

function fmtHabeaWorkStatus(s) {
  const lines = [];
  if (s.missing.length) {
    lines.push(`⚠ ХАБЭА шалгалт дутуу байгаа ажил (сүүлийн 30 хоног): **${s.missing.length}**\n`);
    s.missing.slice(0, 6).forEach(w => {
      const noPre  = !w.habea_pre_status;
      const noPost = !w.habea_post_status;
      const flags  = [noPre ? "урьдчилсан шалгалт дутуу" : "", noPost ? "дараах шалгалт дутуу" : ""].filter(Boolean).join(", ");
      lines.push(`- **${w.title || "Ажил"}** (${w.work_date || "—"}) · ${flags}`);
    });
  } else {
    lines.push("✅ Сүүлийн 30 хоногт бүх ажилд ХАБЭА шалгалт бүртгэгдсэн байна.");
  }
  if (s.recent.length) {
    lines.push(`\nСүүлд бүртгэгдсэн ХАБЭА шалгалт:\n`);
    s.recent.forEach(w => {
      const pre  = w.habea_pre_status  ? `✅ Урьдчилсан: ${w.habea_pre_status}${w.pre_by_name  ? " · " + w.pre_by_name  : ""}` : "";
      const post = w.habea_post_status ? `✅ Дараах: ${w.habea_post_status}${w.post_by_name ? " · " + w.post_by_name : ""}` : "";
      lines.push(`- **${w.title || "Ажил"}** (${w.work_date || "—"})\n  ${[pre, post].filter(Boolean).join(" · ")}`);
    });
  }
  if (!s.missing.length && !s.recent.length) {
    return "ХАБЭА-н ажлын явцын бүртгэл ERP-д олдсонгүй.\n\nАжлын явц → ажлын картаас ХАБЭА урьдчилсан болон дараах шалгалтыг бүртгэнэ үү.";
  }
  return lines.join("\n") + "\n\nАжлын явц → ажлын картаас ХАБЭА шалгалт бүртгэнэ.";
}

function fmtContractExpiry(rows) {
  if (!rows.length) return "Дараагийн 60 хоногт дуусах гэрээ ERP дээр олдсонгүй.";
  const lines = rows.map(r =>
    `- **${r.title}** (${r.counterparty||"—"}): ${r.end_date} — ${r.days_left} хоног үлдсэн`
  ).join("\n");
  return (
    `Дараагийн 60 хоногт дуусах гэрээ (${rows.length}):\n\n${lines}\n\n` +
    `Захиргаа → Гэрээний бүртгэл хэсгийг шалгана уу.`
  );
}

function fmtAssetWarranty(rows) {
  if (!rows.length) return "Дараагийн 90 хоногт баталгааны хугацаа дуусах объект ERP дээр олдсонгүй.";
  const lines = rows.map(r =>
    `- **${r.name}** (${r.category}): ${r.warranty_until} — ${r.days_left} хоног үлдсэн`
  ).join("\n");
  return (
    `Баталгааны хугацаа дуусч байгаа объектууд (${rows.length}):\n\n${lines}\n\n` +
    `Объектийн бүртгэл хэсгийг шалгана уу.`
  );
}

function fmtTraining(rows) {
  if (!rows.length) return "Дараагийн сургалтын мэдээлэл ERP дээр бүртгэгдээгүй байна.";
  const lines = rows.map(r =>
    `- **${r.title}** (${r.type}): ${r.start_date}${r.location ? " — " + r.location : ""} [${r.status}]`
  ).join("\n");
  return (
    `Дараагийн сургалтын хуваарь:\n\n${lines}\n\n` +
    `Хүний нөөц → Сургалт хэсгийг дэлгэрэнгүй харна уу.`
  );
}

function fmtReportGuide(question = "", convHistory = []) {
  const q = cyrillize(String(question || "").toLowerCase());
  const h = cyrillize((Array.isArray(convHistory) ? convHistory : []).map(m => String(m?.text || "")).join("\n").toLowerCase());
  if (q.includes("гэмтэл") || h.includes("гэмтэл") || h.includes("гэрэлтүүлэг")) {
    return "Гэрэлтүүлгийн тайлан гаргахдаа:\n\n1. Гэрэлтүүлэг → Судалгаа эсвэл Аналитик tab руу орно.\n2. Жил/сар болон төрлөө сонгоно.\n3. Нээлттэй гэмтэл, зассан толгой, үлдсэн асахгүй толгой, асалтын хувиа шалгана.\n4. Хэвлэх товчоор тайлан хэлбэрт гаргана.\n\nГэмтлийн жагсаалтыг тусад нь авах бол Гэрэлтүүлэг → Гэмтэл хэсгээс ангилал/төлөвөөр шүүнэ.";
  }
  if (q.includes("hr") || q.includes("хүний нөөц") || h.includes("хүний нөөц")) {
    return "HR тайлан гаргахдаа:\n\n1. Хүний нөөц → Тайлан хэсэг рүү орно.\n2. Ажилтан, хэлтэс, гэрээ, ирцийн үзүүлэлтээ шалгана.\n3. Хэрэгтэй хугацаа/шүүлтээ сонгоно.\n4. Хэвлэх эсвэл Excel/PDF экспорт ашиглана.\n\nЦалинтай тайланг зөвхөн HR болон захирал эрхтэй хэрэглэгч харна.";
  }
  if (q.includes("санхүү") || h.includes("санхүү")) {
    return "Санхүүгийн тайлан гаргахдаа:\n\n1. Санхүү модуль руу орно.\n2. Зардал, орлого/зарлага, авлага/өглөгөөс хэрэгтэй хэсгээ сонгоно.\n3. Сар/жил болон төрлөөр шүүнэ.\n4. Excel/PDF экспорт эсвэл хэвлэх товч ашиглана.\n\nАлбан тайланд нягтлангийн баталгаажсан дүнг ашиглана.";
  }
  return "Тайлан гаргах ерөнхий дараалал:\n\n1. Тайлан авах модулиа нээнэ: Гэрэлтүүлэг, HR, Санхүү, Ажлын явц, ХАБЭА гэх мэт.\n2. Тайлан/Судалгаа/Аналитик tab-ыг сонгоно.\n3. Огноо, сар/жил, төлөв, ангиллын шүүлтээ тавина.\n4. Дэлгэц дээрх дүнг шалгаад Хэвлэх эсвэл Excel/PDF экспорт товч ашиглана.\n\nАль модулийн тайлан хэрэгтэйгээ хэлбэл яг тэр дэлгэцийн алхмаар зааж өгье.";
}

function fmtOverdueWork(s) {
  if (s.count === 0)
    return "Хугацаа хэтэрсэн ажлын бүртгэл ERP дээр олдсонгүй. Бүх ажил хуваарьтайгаа нийцэж байна.";
  const lines = s.items.map(r =>
    `- **${r.title}** (${r.category}): хугацаа ${r.end_date}, ${r.days_over} хоног хэтэрсэн — ${r.status}`
  ).join("\n");
  return (
    `Хугацаа хэтэрсэн нийт **${s.count} ажил** байна:\n\n${lines}` +
    (s.count > 5 ? "\n_(зөвхөн эхний 5 харуулав)_" : "") +
    `\n\nАжлын явц хэсгийг яаралтай шалгана уу.`
  );
}

function fmtDashboardStatus(ctx) {
  const openFaults = ctx.faults.reduce((s,x) => x.status !== "Дууссан" ? s + Number(x.count||0) : s, 0);
  const openWork   = ctx.work.reduce((s,x) => !["Дууссан","Цуцалсан"].includes(x.status) ? s + Number(x.count||0) : s, 0);
  const trafficIssue = ctx.traffic.filter(x => !["Асаалтай","Идэвхтэй"].includes(x.status)).reduce((s,x) => s + Number(x.count||0), 0);
  return (
    `Өнөөдрийн (${ctx.today}) ERP-ийн тойм:\n\n` +
    `- Нээлттэй гэмтэл: **${openFaults}**\n` +
    `- Нээлттэй засварын ажил: **${openWork}**\n` +
    `- Асуудалтай гэрлэн дохио: **${trafficIssue}**\n` +
    (ctx.lightSchedules.length ? `- Хүчинтэй гэрлийн хуваарь: ${ctx.lightSchedules.length} ангилал\n` : "") +
    `\nДэлгэрэнгүй асуулт байвал тодорхой хэсгийн нэрийг хэлээрэй.`
  );
}

function fmtWorkActivity(s) {
  const who = s.users.map(u => `${u.full_name} (${u.position || u.role || ""})`).join(", ");
  if (!s.users.length) return "ERP дээр тухайн ажилтныг тодорхойлж чадсангүй. Нэр эсвэл албан тушаалыг тодруулж бичээрэй.";
  const workLines = s.works.map(w =>
    `- ${w.work_date || String(w.created_at || "").slice(0,10)} · ${w.title || "Ажил"} · ${w.status || "—"}${w.assigned_name ? " · хариуцагч: " + w.assigned_name : ""}`
  );
  const auditLines = s.audits.map(a =>
    `- ${String(a.created_at || "").slice(0,16)} · ${a.action} ${a.entity}${a.detail ? " · " + a.detail : ""}`
  );
  if (!workLines.length && !auditLines.length) {
    return `${who}\n\n${s.period.label} ERP дээр ажил/өөрчлөлтийн бүртгэл олдсонгүй. Энэ нь ажил хийгээгүй гэсэн эцсийн дүгнэлт биш, зөвхөн ERP-д бүртгэгдээгүй байна гэсэн үг.`;
  }
  return (
    `${who}\n\n${s.period.label} ERP дээр харагдсан бүртгэл:\n\n` +
    (workLines.length ? `Ажлын явц:\n${workLines.join("\n")}\n\n` : "") +
    (auditLines.length ? `Системийн журнал:\n${auditLines.join("\n")}\n\n` : "") +
    `Дэлгэрэнгүй: Ажлын явц болон Audit журнал.`
  );
}

function fmtMyWork(s) {
  if (!s.rows.length) {
    return `${s.user.full_name || "Таны"} нэр дээр ERP-ийн Ажлын явц модульд ажил олдсонгүй.\n\nДэлгэрэнгүй шалгах бол Ажлын явц → "Миний ажил" эсвэл хариуцагчаар нэрээ шүүнэ үү.`;
  }
  const active = s.rows.filter(r => !["Хаагдсан", "Дууссан", "Цуцалсан"].includes(r.status || "")).length;
  const lines = s.rows.map(w => {
    const date = w.work_date || w.start_date || String(w.created_at || "").slice(0, 10);
    const owner = w.assigned_name ? ` · хариуцагч: ${w.assigned_name}` : "";
    const pct = Number.isFinite(Number(w.progress)) ? ` · ${w.progress}%` : "";
    return `- ${date || "огноогүй"} · ${w.title || "Ажил"} · ${w.status || "—"}${pct}${owner}`;
  });
  return `${s.user.full_name || "Таны"} нэртэй холбоотой ажил: **${s.rows.length}**, үүнээс идэвхтэй **${active}**.\n\n${lines.join("\n")}\n\nДэлгэрэнгүй: Ажлын явц → Миний ажил.`;
}

function fmtEmployeeByRole(rows, question = "", user = {}) {
  if (!rows.length)
    return "ERP бүртгэлд тохирох идэвхтэй ажилтан олдсонгүй.\n\nХР → Ажилтны бүртгэл хэсгээс бүрэн жагсаалт харна уу.";
  const q = cyrillize(String(question || "").toLowerCase());
  const wantsPhone = q.includes("утас") || q.includes("дугаар");
  const canSeePhone = ["director", "hr"].includes(user.role);
  const lines = rows.map(r =>
    `- **${r.full_name || "—"}** — ${r.position || r.role}${r.department ? " · " + r.department : ""}` +
    (wantsPhone ? (canSeePhone ? ` · Утас: ${r.phone || "бүртгэлгүй"}` : " · Утас: эрх хүрэхгүй") : "")
  );
  const note = wantsPhone && !canSeePhone
    ? "\n\nУтасны дугаарыг зөвхөн захирал болон HR эрхтэй хэрэглэгч харна."
    : "";
  return `ERP бүртгэлийн дагуу (${rows.length} ажилтан):\n\n${lines.join("\n")}${note}\n\nДэлгэрэнгүй мэдээлэл: HR → Ажилтны бүртгэл`;
}

function fmtEmployeeSalaryLookup(s) {
  if (!s.canSeeSalary) {
    return "Цалин нь хувийн мэдээлэл тул зөвхөн захирал болон HR эрхтэй хэрэглэгч ERP туслахаас харах боломжтой.\n\nӨөрийн цалинг `миний цалин` гэж асууж шалгана уу.";
  }
  if (!s.rows.length) {
    return "Цалингийн мэдээлэл харах ажилтныг тодорхойлж чадсангүй. Нэр эсвэл албан тушаалаар нь тодруулж бичээрэй. Жишээ: `Ундраагийн цалин хэд вэ?`";
  }
  const lines = s.rows.map(r => {
    const total = Number(r.salary || 0) + Number(r.skill_allowance || 0) +
      Number(r.tenure_allowance || 0) + Number(r.meal_allowance || 0);
    const extras = total > Number(r.salary || 0) ? `, нэмэгдэлтэй нийт ${money(total)}` : "";
    return `- **${r.full_name}** — ${r.position || "—"}${r.department ? " · " + r.department : ""}: үндсэн цалин **${money(r.salary)}**${extras}`;
  });
  return `ERP HR бүртгэл дээрх цалингийн мэдээлэл:\n\n${lines.join("\n")}\n\nАнхаарах зүйл: payroll дээрх гар дээр авах дүн өөр байж болно.`;
}

function fmtMyPhone(row, user = {}) {
  if (!row) return "Таны ажилтны бүртгэл ERP дээр олдсонгүй.";
  const canSee = ["director", "hr"].includes(user.role);
  if (!canSee) {
    return "Өөрийн утасны дугаарыг HR → Миний мэдээлэл эсвэл ажилтны картаас шалгана уу.";
  }
  return `**${row.full_name || user.full_name || user.username}** — ${row.position || ""}${row.department ? " · " + row.department : ""}\n\nУтас: **${row.phone || "бүртгэлгүй"}**`;
}

function fmtElectricityBill(s, question = "") {
  if (!s.bill) {
    const period = s.target ? `${s.target.year}-${String(s.target.month).padStart(2,"0")}` : "сүүлийн";
    return `${period} сарын цахилгааны төлбөр ERP дээр олдсонгүй.\n\nГэрэлтүүлэг → Цахилгааны төлбөр → Нэхэмжлэл хэсгээс импорт/баталгаажуулалт шалгана уу.`;
  }
  const b = s.bill;
  const period = `${b.billing_year}-${String(b.billing_month).padStart(2,"0")}`;
  const status = b.status === "confirmed" ? "Баталгаажсан" : b.status === "pending" ? "Хүлээгдэж буй" : (b.status || "—");
  const wantsDiff = cyrillize(question.toLowerCase()).includes("зөрүү") || cyrillize(question.toLowerCase()).includes("төлөвлө");
  const diffAmount = Number(b.total_amount || 0) - Number(b.our_amount || 0);
  const diffKwh = Number(b.total_kwh || 0) - Number(b.our_kwh || 0);
  return (
    `${s.latest ? "Сүүлийн" : "Сонгосон"} цахилгааны төлбөр (${period}):\n\n` +
    `- Нийт дүн: **${money(b.total_amount)}**\n` +
    `- Манай дүн: **${money(b.our_amount)}**\n` +
    `- Нийт хэрэглээ: ${Number(b.total_kwh || 0).toLocaleString("mn-MN")} кВт.ц\n` +
    `- Манай хэрэглээ: ${Number(b.our_kwh || 0).toLocaleString("mn-MN")} кВт.ц\n` +
    `- Төлөв: ${status}\n` +
    (wantsDiff ? `- Зөрүү: **${money(diffAmount)}**, ${diffKwh.toLocaleString("mn-MN")} кВт.ц\n` : "") +
    `\nДэлгэрэнгүй: Гэрэлтүүлэг → Цахилгааны төлбөр → Нэхэмжлэл.`
  );
}

function fmtCameraCount(s) {
  if (!s.total)
    return "ERP-д камер бүртгэгдээгүй байна.\n\nОбъектийн бүртгэл → Камер хэсгийг шалгана уу.";
  const lines = s.byStatus.map(r => `- ${r.status}: **${r.count}**`);
  return (
    `ERP-д бүртгэлтэй камерын мэдээлэл:\n\n` +
    `- Байршлын цэг: **${s.total}**\n` +
    `- Нийт камер: **${s.capacity}**\n` +
    `- Ажиллаж байгаа: **${s.working}**\n` +
    `- Гэмтэлтэй: **${s.broken}**\n` +
    `- Нээлттэй засварын ажил: **${s.openRepairs}**\n` +
    (s.availabilityPct == null ? "" : `- Хэвийн ажиллагаа: **${s.availabilityPct.toFixed(1)}%**\n`) +
    `\nБүртгэлийн төлөв:\n` +
    (lines.length ? lines.join("\n") : "") +
    `\n\nДэлгэрэнгүй: Объектийн бүртгэл → Камер`
  );
}

function fmtEmployeePhoneFollowup(s) {
  if (!s.name) {
    return "Аль ажилтны утасны дугаар хэрэгтэйг нэрээр нь бичээрэй. Жишээ: `Цэлмэгийн утасны дугаар`.";
  }
  if (!s.row) {
    return `ERP дээр **${s.name}** нэртэй идэвхтэй ажилтан олдсонгүй. HR → Ажилтны бүртгэлээс шалгана уу.`;
  }
  if (!s.canSeePhone) {
    return `**${s.row.full_name}** — ${s.row.position || ""}${s.row.department ? " · " + s.row.department : ""}\n\nУтасны дугаарыг зөвхөн захирал болон HR эрхтэй хэрэглэгч харна.`;
  }
  const phone = s.row.phone || s.row.emergency_contact || "";
  return `**${s.row.full_name}** — ${s.row.position || ""}${s.row.department ? " · " + s.row.department : ""}\n\nУтас: **${phone || "бүртгэлгүй"}**`;
}

function ageFromBirthdate(birthdate) {
  if (!birthdate) return null;
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday = now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function fmtEmployeeDetail(s) {
  if (!s.canSeeEmployee) {
    return "Ажилтны мэдээлэлд зөвхөн захирал, HR менежер болон ерөнхий инженер хандах боломжтой.";
  }
  if (!s.name || !s.row) return "Мэдээлэл олдсонгүй";

  const privateFields = new Set(["phone", "age", "birthdate", "gender", "nationality", "email"]);
  const blocked = s.fields.filter(f => privateFields.has(f));
  if (blocked.length && !s.canSeePrivate) {
    return `**${s.row.full_name}** — ${s.row.position || ""}${s.row.department ? " · " + s.row.department : ""}\n\nХувийн мэдээллийг зөвхөн захирал болон HR эрхтэй хэрэглэгч харна.`;
  }

  const lines = [];
  const add = (label, value) => lines.push(`- ${label}: **${value || "бүртгэлгүй"}**`);
  const fields = s.fields.includes("summary")
    ? ["position", "department", "education", "phone"]
    : s.fields;

  for (const field of fields) {
    if (field === "phone") add("Утас", s.row.phone || s.row.emergency_contact);
    else if (field === "age") add("Нас", ageFromBirthdate(s.row.birthdate) !== null ? `${ageFromBirthdate(s.row.birthdate)} нас` : "");
    else if (field === "education") add("Боловсрол", s.row.education);
    else if (field === "birthdate") add("Төрсөн өдөр", s.row.birthdate);
    else if (field === "gender") add("Хүйс", s.row.gender);
    else if (field === "nationality") add("Үндэс", s.row.nationality);
    else if (field === "email") add("И-мэйл", s.row.email);
    else if (field === "hire_date") add("Ажилд орсон", s.row.hire_date);
    else if (field === "position") add("Албан тушаал", s.row.position);
    else if (field === "department") add("Хэлтэс", s.row.department);
  }

  return `**${s.row.full_name}** — ${s.row.position || "—"}${s.row.department ? " · " + s.row.department : ""}\n\n${lines.join("\n")}`;
}

const MN_MONTHS = ["","1-р сар","2-р сар","3-р сар","4-р сар","5-р сар","6-р сар","7-р сар","8-р сар","9-р сар","10-р сар","11-р сар","12-р сар"];

function fmtMonthlyReport(d, year, month) {
  if (!d) return "Тухайн сарын мэдээлэл олдсонгүй.";
  const fmt = n => Math.round(Number(n||0)).toLocaleString("mn-MN");
  const lines = [];
  lines.push(`**${MN_MONTHS[month]} ${year} — Нэгтгэсэн тайлан**`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  lines.push(`\n🔧 **Ажлын захиалга**`);
  lines.push(`  · Нийт: **${d.work.total}** ажил`);
  lines.push(`  · Хаагдсан: ${d.work.closed} · Явцтай: ${d.work.active} · Хугацаа хэтэрсэн: **${d.work.overdue}**`);
  lines.push(`  · Дундаж явц: **${d.work.avg_progress}%**`);
  if (d.work.hse_waiting) lines.push(`  · ХАБЭА шалгалт хүлээж: ${d.work.hse_waiting}`);
  if (d.work.pending_final) lines.push(`  · Эцсийн батламж хүлээж: ${d.work.pending_final}`);

  if (d.work.by_category?.length) {
    lines.push(`\n  Категориор:`);
    d.work.by_category.slice(0,5).forEach(c =>
      lines.push(`    – ${c.category}: нийт ${c.total}, хаагдсан ${c.closed}, явц ${c.avg_progress}%`)
    );
  }

  lines.push(`\n🦺 **ХАБЭА**`);
  lines.push(`  · Нээлттэй эрсдэл: **${d.hse.open_risks}** (өндөр: ${d.hse.high_risks}, шинэ: ${d.hse.new_risks})`);
  if (d.hse.snapshot) lines.push(`  · Сарын snapshot хадгалагдсан: ${(d.hse.snapshot.saved_at||"").slice(0,10)}`);

  if (d.materials.total_amount > 0) {
    lines.push(`\n📦 **Материал**: нийт **${fmt(d.materials.total_amount)}₮** зарцуулсан`);
    d.materials.by_work?.slice(0,3).forEach(g =>
      lines.push(`  – ${g.label}: ${fmt(g.total)}₮`)
    );
  }

  if (d.finance) {
    lines.push(`\n💰 **Санхүү**`);
    if (d.finance.income)    lines.push(`  · Орлого: ${fmt(d.finance.income)}₮`);
    if (d.finance.expense)   lines.push(`  · Зарлага: ${fmt(d.finance.expense)}₮`);
    if (d.finance.op_expenses) lines.push(`  · Үйл. зардал: ${fmt(d.finance.op_expenses)}₮`);
  }

  if (d.hr.total) {
    lines.push(`\n👥 **HR**: ${d.hr.total} бүртгэл`);
    d.hr.records?.slice(0,3).forEach(r => lines.push(`  – ${r.record_type}: ${r.count}`));
  }

  lines.push(`\n🚗 **Тээвэр**: нийт ${d.vehicles.total}, засварт: ${d.vehicles.in_repair}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  return lines.join("\n");
}

module.exports = {
  money,
  roleGreeting,
  fmtLightSchedule,
  fmtLightStatusAndSchedule,
  fmtPoleCount,
  fmtAssetValue,
  fmtEmployeeCount,
  fmtTodayAttendance,
  fmtMySalary,
  fmtOpenFaults,
  fmtOpenLightFaults,
  fmtLocationLightFaults,
  fmtLightLocationStatus,
  fmtEmployeeGender,
  fmtTrafficStatus,
  fmtTrafficSignalLog,
  fmtLowStock,
  fmtMonthlyExpenses,
  fmtBudgetProgress,
  fmtOpenSafety,
  fmtHabeaWorkStatus,
  fmtContractExpiry,
  fmtAssetWarranty,
  fmtTraining,
  fmtReportGuide,
  fmtOverdueWork,
  fmtDashboardStatus,
  fmtWorkActivity,
  fmtMyWork,
  fmtEmployeeByRole,
  fmtEmployeeSalaryLookup,
  fmtMyPhone,
  fmtElectricityBill,
  fmtCameraCount,
  fmtEmployeePhoneFollowup,
  fmtEmployeeDetail,
  fmtMonthlyReport,
};
