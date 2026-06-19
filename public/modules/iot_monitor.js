import { state, api, toast, escapeHtml } from './common.js';

let _iotRows = [];
let _iotView = "overview";
let _iotLeafletReady = false;
let _iotMap = null;
let _iotMarkers = null;
let _iotMaximized = false;
let _iotReport = null;
let _iotReportPeriod = "night";
let _iotChartDevEui = "";
let _iotChartBucket = 15;
let _iotSeries = null;

function fmtNum(value, digits = 2, suffix = "") {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(digits)}${suffix}`;
}

function fmtText(value) {
  return value === null || value === undefined || value === "" ? "-" : escapeHtml(value);
}

function fmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return escapeHtml(String(value).slice(0, 19));
  return d.toLocaleString("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const t = new Date(lastSeen).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= 10 * 60 * 1000;
}

function hasLinePower(row) {
  if (row?.voltage === null || row?.voltage === undefined || row?.voltage === "") return true;
  const voltage = Number(row.voltage);
  if (!Number.isFinite(voltage)) return true;
  return voltage > 1;
}

function isDeviceOnline(row) {
  return isOnline(row?.last_seen);
}

function statusBadge(row) {
  const online = isDeviceOnline(row);
  const bg = online ? "#dcfce7" : "#fee2e2";
  const fg = online ? "#166534" : "#991b1b";
  const label = online ? "Онлайн" : "Офлайн";
  return `<span style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;background:${bg};color:${fg};font-size:12px;font-weight:700;padding:3px 9px">
    <span style="width:7px;height:7px;border-radius:999px;background:${fg};display:inline-block"></span>${label}
  </span>`;
}

function doStateValue(row) {
  const value = row?.DO_State;
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function rowModel(row) {
  return String(row?.deviceModel || row?.command_device_model || "").toUpperCase();
}

function hasDecodedScalars(row) {
  const raw = rawPayloadObject(row);
  const obj = raw.object || raw.decodedData || raw.objectJSON || {};
  return Object.entries(obj || {}).some(([, v]) => v !== null && v !== undefined && typeof v !== "object");
}

function hasPhaseData(row) {
  return ["Ua", "Ub", "Uc", "Ia", "Ib", "Ic", "totalP", "EP", "Pf"].some(field => phaseNumber(row, field) !== null);
}

function isDecoderMissing(row) {
  return rowModel(row) === "ADW300" && !hasDecodedScalars(row) && !hasPhaseData(row);
}

function firstFiniteValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return value;
  }
  return undefined;
}

function rawDecodedNumber(row, keys) {
  const raw = rawPayloadObject(row);
  const obj = raw.object || raw.decodedData || raw.objectJSON || {};
  return deepFindNumber(obj, keys) ?? deepFindNumber(raw, keys);
}

function iotNumericValue(row, field) {
  if (!row) return undefined;
  if (field === "voltage") return firstFiniteValue(row.Ua, row.voltage, row.V, rawDecodedNumber(row, ["voltage", "Voltage", "V", "U", "u"]));
  if (field === "current") return firstFiniteValue(row.Ia, row.current, row.A, rawDecodedNumber(row, ["current", "Current", "A", "I", "i"]));
  if (field === "power") return firstFiniteValue(row.totalP, row.power, rawDecodedNumber(row, ["totalP", "TotalP", "total_power", "totalPower", "P", "p", "power", "Power", "kW"]));
  if (field === "energy") return firstFiniteValue(row.EP, row.energy, rawDecodedNumber(row, ["EP", "Ep", "ep", "energy", "Energy", "kWh", "total_energy", "totalEnergy", "EQ_F1", "EQF1", "eq_f1"]));
  if (field === "frequency") return firstFiniteValue(row.frequency, rawDecodedNumber(row, ["frequency", "Frequency", "Hz", "F", "f"]));
  if (field === "power_factor") return firstFiniteValue(row.Pf, row.power_factor, rawDecodedNumber(row, ["Pf", "PF", "pf", "power_factor", "powerFactor", "PowerFactor"]));
  return row[field];
}

function fmtIotValue(row, field, digits, suffix = "") {
  if (isDecoderMissing(row)) return "-";
  return fmtNum(iotNumericValue(row, field), digits, suffix);
}

function fmtIotState(row, field) {
  if (isDecoderMissing(row)) return "-";
  return fmtText(row?.[field]);
}

function phaseNumber(row, field) {
  const n = Number(row?.[field]);
  return Number.isFinite(n) ? n : null;
}

function isAdw300SinglePhaseTest(row) {
  if (rowModel(row) !== "ADW300") return false;
  const ua = phaseNumber(row, "Ua");
  const ia = phaseNumber(row, "Ia");
  const ub = phaseNumber(row, "Ub");
  const uc = phaseNumber(row, "Uc");
  const ib = phaseNumber(row, "Ib");
  const ic = phaseNumber(row, "Ic");
  const hasA = (ua !== null && ua > 1) || (ia !== null && ia > 0);
  const onlyA =
    (ub === null || ub === 0) &&
    (uc === null || uc === 0) &&
    (ib === null || ib === 0) &&
    (ic === null || ic === 0);
  return hasA && onlyA;
}

function modelLine(row) {
  if (rowModel(row) === "ADW300") {
    return isAdw300SinglePhaseTest(row)
      ? "ADW300 / 380V 3-phase meter / currently 220V single-phase test"
      : "ADW300 / 380V 3-phase meter";
  }
  if (rowModel(row) === "ADW310") return "ADW310 / 220V single-phase meter";
  return "";
}

function phaseLine(row) {
  if (rowModel(row) !== "ADW300") return decodedPayloadSummary(row);
  if (isDecoderMissing(row)) return "ADW300 / 380V 3-phase meter / currently 220V single-phase test · decoder object ирээгүй";
  return [
    `Ua ${fmtNum(row.Ua, 1, "V")}`,
    `Ub ${fmtNum(row.Ub, 1, "V")}`,
    `Uc ${fmtNum(row.Uc, 1, "V")}`,
    `Ia ${fmtNum(row.Ia, 2, "A")}`,
    `Ib ${fmtNum(row.Ib, 2, "A")}`,
    `Ic ${fmtNum(row.Ic, 2, "A")}`,
    `P ${fmtNum(row.totalP ?? row.power, 3, "kW")}`,
    `EP ${fmtNum(row.EP ?? row.energy, 3, "kWh")}`,
    `Pf ${fmtNum(row.Pf ?? row.power_factor, 3)}`,
  ].join(" · ");
}

function hasActiveLoad(row) {
  if (isDecoderMissing(row)) return null;
  const power = Number(iotNumericValue(row, "power"));
  const current = Number(iotNumericValue(row, "current"));
  if (Number.isFinite(power) && power > 0.01) return true;
  if (Number.isFinite(current) && current > 0.02) return true;
  if (Number.isFinite(power) || Number.isFinite(current)) return false;
  return null;
}

function commandButtonClass(row, action) {
  const loadOn = hasActiveLoad(row);
  const active =
    (action === "ON" && loadOn === true) ||
    (action === "OFF" && loadOn === false);
  return `iot-command-btn iot-${action.toLowerCase()}${active ? " is-active" : ""}`;
}

function relayState(row) {
  if (isDecoderMissing(row)) return "unknown";
  const loadOn = hasActiveLoad(row);
  if (loadOn === true) return "on";
  if (loadOn === false) return "off";
  const stateValue = doStateValue(row);
  if (stateValue === "0") return "on";
  if (stateValue === "1") return "off";
  return "unknown";
}

function relayStateBadge(row) {
  const stateValue = relayState(row);
  if (stateValue === "on") return `<div class="iot-relay-state iot-relay-on">АСААЛТТАЙ</div>`;
  if (stateValue === "off") return `<div class="iot-relay-state iot-relay-off">УНТРААЛТТАЙ</div>`;
  return `<div class="iot-relay-state iot-relay-unknown">ТӨЛӨВ ТОДОРХОЙГҮЙ</div>`;
}

function commandBadge(row) {
  const s = row.command_confirmation_status;
  if (!s) return "";
  const cfg = {
    pending_confirmation: ["#fef3c7", "#92400e", "Баталгаажилт хүлээж байна"],
    sent_not_confirmed: ["#fee2e2", "#991b1b", "Команд илгээгдсэн ч баталгаажаагүй"],
    on_confirmed: ["#dcfce7", "#166534", "Асаалт баталгаажсан"],
    off_confirmed: ["#dcfce7", "#166534", "Унтраалт баталгаажсан"],
  };
  const [bg, fg, label] = cfg[s] || ["#f1f5f9", "#475569", s];
  return `<div class="iot-command-badge" style="background:${bg};color:${fg}">${label}</div>`;
}

commandBadge = function(row) {
  const s = row.command_confirmation_status || row.command_status;
  if (!s) return "";
  const cfg = {
    queued: ["#e0f2fe", "#075985", "command queued"],
    pending_confirmation: ["#e0f2fe", "#075985", "command queued"],
    txack_received: ["#ede9fe", "#5b21b6", "txack received"],
    ack_received: ["#dcfce7", "#166534", "ack received"],
    uplink_received: ["#fef3c7", "#92400e", "uplink received"],
    sent_not_confirmed: ["#fee2e2", "#991b1b", "relay not confirmed"],
    on_confirmed: ["#dcfce7", "#166534", "physical ON confirmed"],
    off_confirmed: ["#dcfce7", "#166534", "physical OFF confirmed"],
  };
  const [bg, fg, label] = cfg[s] || ["#f1f5f9", "#475569", s];
  return `<div class="iot-command-badge" style="background:${bg};color:${fg}">${label}</div>`;
};

relayStateBadge = function(row) {
  const stateValue = relayState(row);
  if (stateValue === "on") return `<div class="iot-relay-state iot-relay-on">АСААЛТТАЙ</div>`;
  if (stateValue === "off") return `<div class="iot-relay-state iot-relay-off">УНТРААЛТТАЙ</div>`;
  return `<div class="iot-relay-state iot-relay-unknown">ТӨЛӨВ БАТАЛГААЖААГҮЙ</div>`;
};

function renderSummary() {
  const total = _iotRows.length;
  const online = _iotRows.filter(r => isDeviceOnline(r)).length;
  const offline = total - online;
  const energy = _iotRows.reduce((sum, r) => sum + (Number(iotNumericValue(r, "energy")) || 0), 0);
  const power = _iotRows.reduce((sum, r) => sum + (Number(iotNumericValue(r, "power")) || 0), 0);
  const cards = [
    ["Нийт төхөөрөмж", total, "#eff6ff", "#1d4ed8"],
    ["Онлайн", online, "#dcfce7", "#166534"],
    ["Офлайн", offline, "#fee2e2", "#991b1b"],
    ["Нийт чадал", fmtNum(power, 2, " kW"), "#f8fafc", "#334155"],
    ["Нийт энерги", fmtNum(energy, 2, " kWh"), "#fefce8", "#854d0e"],
  ];
  return `<div class="iot-summary-grid">
    ${cards.map(([label, value, bg, color]) => `
      <div class="iot-summary-card" style="background:${bg};border-color:${color}22">
        <div style="font-size:12px;color:#64748b;margin-bottom:5px">${label}</div>
        <div style="font-size:24px;font-weight:800;color:${color}">${value}</div>
      </div>
    `).join("")}
  </div>`;
}

function renderTable() {
  return `
    <div class="iot-table-wrap">
      <table class="iot-meter-table">
        <thead>
          <tr style="background:#f8fafc">
            ${[
              "Төлөв","Төхөөрөмж","DevEUI","V","A","kW","kWh",
              "Hz","PF","DO","DI","RSSI","SNR","Сүүлд","Удирдлага"
            ].map((h, i) => `<th class="${i === 14 ? "iot-sticky-col" : ""}">${h}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${_iotRows.length ? _iotRows.map(row => `
            <tr style="border-bottom:1px solid #f1f5f9">
              <td>${statusBadge(row)}</td>
              <td class="iot-device-name">
                <div>${fmtText(row.deviceName)}</div>
                ${modelLine(row) ? `<div class="iot-model-inline">${escapeHtml(modelLine(row))}</div>` : ""}
                <div class="iot-payload-inline">${phaseLine(row)}</div>
              </td>
              <td class="iot-mono iot-deveui">${fmtText(row.devEui)}</td>
              <td class="iot-mono">${fmtIotValue(row, "voltage", 1, " V")}</td>
              <td class="iot-mono">${fmtIotValue(row, "current", 2, " A")}</td>
              <td class="iot-mono">${fmtIotValue(row, "power", 3, " kW")}</td>
              <td class="iot-mono iot-strong">${fmtIotValue(row, "energy", 3, " kWh")}</td>
              <td class="iot-mono">${fmtIotValue(row, "frequency", 2, " Hz")}</td>
              <td class="iot-mono">${fmtIotValue(row, "power_factor", 3)}</td>
              <td>${fmtIotState(row, "DO_State")}</td>
              <td>${fmtIotState(row, "DI_State")}</td>
              <td class="iot-mono">${fmtNum(row.rssi, 0, " dBm")}</td>
              <td class="iot-mono">${fmtNum(row.snr, 1, " dB")}</td>
              <td class="iot-last-seen">${fmtDate(row.last_seen)}</td>
              <td class="iot-sticky-col iot-control-cell iot-relay-${relayState(row)}">
                ${relayStateBadge(row)}
                ${commandBadge(row)}
                <div class="iot-control-buttons">
                  <button class="${commandButtonClass(row, "ON")}" onclick="iotSendDownlink('${escapeHtml(row.devEui)}','ON')">ON</button>
                  <button class="${commandButtonClass(row, "OFF")}" onclick="iotSendDownlink('${escapeHtml(row.devEui)}','OFF')">OFF</button>
                </div>
              </td>
            </tr>
          `).join("") : `
            <tr>
              <td colspan="15" style="padding:42px;text-align:center;color:#94a3b8">
                IoT хэмжилтийн мэдээлэл хараахан ирээгүй байна.
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>`;
}

function iotStats() {
  const total = _iotRows.length;
  const online = _iotRows.filter(r => isDeviceOnline(r)).length;
  const offline = total - online;
  const on = _iotRows.filter(r => relayState(r) === "on").length;
  const off = _iotRows.filter(r => relayState(r) === "off").length;
  const unknown = Math.max(0, total - on - off);
  const power = _iotRows.reduce((sum, r) => sum + (Number(iotNumericValue(r, "power")) || 0), 0);
  const energy = _iotRows.reduce((sum, r) => sum + (Number(iotNumericValue(r, "energy")) || 0), 0);
  const rssiVals = _iotRows.map(r => Number(r.rssi)).filter(Number.isFinite);
  const avgRssi = rssiVals.length ? rssiVals.reduce((a, b) => a + b, 0) / rssiVals.length : null;
  return { total, online, offline, on, off, unknown, power, energy, avgRssi };
}

function reportPeriodLabel(period) {
  return ({
    night: "Өнгөрсөн шөнө",
    today: "Өнөөдөр",
    "7d": "7 хоног",
    month: "Энэ сар",
    year: "Энэ жил",
  })[period] || period;
}

function reportEventText(event) {
  if (!event) return "-";
  if (event.type === "command") return `${event.action || "-"} command · ${event.status || "-"}`;
  if (event.type === "relay_change") return `Төлөв ${event.state || "-"} болсон · ${fmtNum(event.power, 3, " kW")}`;
  return event.type || "-";
}

function chartTimeLabel(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit" });
}

function renderUsageChart() {
  const series = _iotSeries?.series || [];
  if (!_iotSeries) return `<div class="iot-chart-empty">График ачааллаж байна...</div>`;
  if (!series.length) return `<div class="iot-chart-empty">Сонгосон хугацаанд график үүсгэх бичлэг алга.</div>`;
  const w = 860, h = 260, pl = 46, pr = 18, pt = 18, pb = 38;
  const cw = w - pl - pr, ch = h - pt - pb;
  const maxKw = Math.max(0.1, ...series.map(p => Number(p.avgPowerKw) || 0));
  const xOf = i => pl + (series.length === 1 ? cw / 2 : (i / (series.length - 1)) * cw);
  const yKw = v => pt + ch - ((Number(v) || 0) / maxKw) * ch;
  const yPct = v => pt + ch - ((Number(v) || 0) / 100) * ch;
  const powerPts = series.map((p, i) => `${xOf(i).toFixed(1)},${yKw(p.avgPowerKw).toFixed(1)}`).join(" ");
  const onPts = series.map((p, i) => `${xOf(i).toFixed(1)},${yPct(p.onPct).toFixed(1)}`).join(" ");
  const ticks = series.filter((_, i) => series.length <= 10 || i % Math.ceil(series.length / 8) === 0 || i === series.length - 1);
  return `<div class="iot-chart-wrap">
    <svg class="iot-usage-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="IoT хэрэглээний график">
      <path d="M${pl} ${pt} V${pt + ch} H${pl + cw}" fill="none" stroke="#b8c7d6"/>
      ${[0, .25, .5, .75, 1].map(r => {
        const y = pt + ch - r * ch;
        return `<path d="M${pl} ${y} H${pl + cw}" stroke="#d5e0ea" stroke-width="1"/><text x="8" y="${y + 4}" font-size="10" fill="#58728b">${fmtNum(maxKw * r, 2)}</text>`;
      }).join("")}
      <polyline points="${onPts}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5 4"/>
      <polyline points="${powerPts}" fill="none" stroke="#1f6fb2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${series.map((p, i) => {
        const x = xOf(i), y = yKw(p.avgPowerKw);
        return `<circle cx="${x}" cy="${y}" r="4" fill="#1f6fb2"><title>${chartTimeLabel(p.bucketStart)} · ${fmtNum(p.avgPowerKw, 3, " kW")} · ON ${fmtNum(p.onPct, 1, "%")} · ${p.samples} sample</title></circle>`;
      }).join("")}
      ${ticks.map((p, i) => `<text x="${xOf(series.indexOf(p))}" y="${h - 12}" text-anchor="${i === 0 ? "start" : "middle"}" font-size="10" fill="#58728b">${chartTimeLabel(p.bucketStart)}</text>`).join("")}
      <text x="${pl}" y="12" font-size="11" fill="#1f6fb2" font-weight="800">kW</text>
      <text x="${pl + 42}" y="12" font-size="11" fill="#64748b" font-weight="800">--- ON%</text>
    </svg>
  </div>`;
}

function renderTimeseriesPanel(devices) {
  const selected = _iotChartDevEui || devices[0]?.devEui || "";
  if (!_iotChartDevEui && selected) _iotChartDevEui = selected;
  return `<div class="iot-panel">
    <div class="iot-panel-head">
      <div>
        <div class="iot-panel-title">Цагийн интервалын график</div>
        <div class="iot-map-sub">Node сонгоод хэрэглээ, асаалттай хувь, sample-г bucket-аар харна.</div>
      </div>
      <div class="iot-chart-controls">
        <select onchange="iotSetChartDevice(this.value)">
          ${devices.map(d => `<option value="${escapeHtml(d.devEui)}" ${selected === d.devEui ? "selected" : ""}>${fmtText(d.deviceName)}</option>`).join("")}
        </select>
        <select onchange="iotSetChartBucket(this.value)">
          ${[5, 15, 30, 60].map(v => `<option value="${v}" ${Number(_iotChartBucket) === v ? "selected" : ""}>${v} мин</option>`).join("")}
        </select>
      </div>
    </div>
    ${renderUsageChart()}
  </div>`;
}

function renderReportPanel() {
  if (!_iotReport) {
    return `<div class="iot-panel" style="min-height:360px;display:flex;align-items:center;justify-content:center;color:#58728b;font-weight:900">Тайлан ачааллаж байна...</div>`;
  }
  const totals = _iotReport.totals || {};
  const devices = _iotReport.devices || [];
  const cards = [
    ["Төхөөрөмж", totals.devices || 0, `${totals.samples || 0} бичлэг`, "#2563eb"],
    ["Асаалттай хувь", fmtNum(totals.onPct, 1, "%"), "sample дээр үндэслэв", "#16a34a"],
    ["Хэрэглээ", fmtNum(totals.energyDeltaKwh, 3, " kWh"), _iotReport.label || reportPeriodLabel(_iotReportPeriod), "#f59e0b"],
    ["Max хүчин чадал", fmtNum(totals.maxCapacityKw, 2, " kW"), "гэрэл × ватт", "#8b5cf6"],
    ["Ассан гэрэл", `${fmtNum(totals.estimatedLitLamps, 1)} (${fmtNum(totals.estimatedLitPct, 1, "%")})`, "бодит kW-оос", "#06b6d4"],
    ["Schedule нийцэл", fmtNum(totals.scheduleMatchPct, 1, "%"), "цаг тохиргоотой тулгав", "#64748b"],
  ];
  const events = devices.flatMap(d => (d.events || []).map(e => ({ ...e, deviceName: d.deviceName })))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 12);
  return `<div class="iot-report">
    <div class="iot-report-toolbar">
      <div>
        <div class="iot-panel-title">IoT хэрэглээ, асаалтын тайлан</div>
        <div class="iot-map-sub">${fmtDate(_iotReport.from)} - ${fmtDate(_iotReport.to)} · ${_iotReport.timezone || "Asia/Ulaanbaatar"}</div>
      </div>
      <div class="iot-report-periods">
        ${["night", "today", "7d", "month", "year"].map(p => `
          <button class="${_iotReportPeriod === p ? "is-active" : ""}" onclick="iotSetReportPeriod('${p}')">${reportPeriodLabel(p)}</button>
        `).join("")}
      </div>
    </div>
    <div class="iot-report-cards">
      ${cards.map(([label, value, sub, color]) => `
        <div class="iot-report-card" style="--accent:${color}">
          <span>${label}</span>
          <b>${value}</b>
          <i>${sub}</i>
        </div>
      `).join("")}
    </div>
    ${renderTimeseriesPanel(devices)}
    <div class="iot-report-grid">
      <div class="iot-panel">
        <div class="iot-panel-head"><div class="iot-panel-title">Node бүрийн дүн</div><span>${devices.length} төхөөрөмж</span></div>
        <div class="iot-table-wrap">
          <table class="iot-meter-table iot-report-table">
            <thead><tr>
              ${["Төхөөрөмж","Schedule","Асаалт","Ассан гэрэл","kWh","Дундаж kW","V min/max","A min/max","Sample","Gap","Сүүлд"].map(h => `<th>${h}</th>`).join("")}
            </tr></thead>
            <tbody>${devices.length ? devices.map(d => `
              <tr>
                <td><b>${fmtText(d.deviceName)}</b><div class="iot-payload-inline">${fmtText(d.devEui)}</div></td>
                <td>${fmtText(d.scheduleCategory || d.model)}<div class="iot-payload-inline">${fmtText(d.scheduleOnTime || "—")} - ${fmtText(d.scheduleOffTime || "—")} · ${fmtNum(d.scheduleMatchPct, 1, "%")}</div></td>
                <td><b style="color:#16a34a">${fmtNum(d.onPct, 1, "%")}</b><div class="iot-payload-inline">${d.onSamples || 0}/${d.samples || 0}</div></td>
                <td class="iot-mono"><b>${fmtNum(d.estimatedLitLamps, 1)}</b> / ${fmtNum(d.lampCount, 0)}<div class="iot-payload-inline">${fmtNum(d.wattageW, 0, "W")} · max ${fmtNum(d.maxCapacityKw, 2, " kW")}</div></td>
                <td class="iot-mono iot-strong">${fmtNum(d.energyDeltaKwh, 3, " kWh")}</td>
                <td class="iot-mono">${fmtNum(d.avgPowerKw, 3, " kW")}</td>
                <td class="iot-mono">${fmtNum(d.minVoltage, 1, " V")} / ${fmtNum(d.maxVoltage, 1, " V")}</td>
                <td class="iot-mono">${fmtNum(d.minCurrent, 2, " A")} / ${fmtNum(d.maxCurrent, 2, " A")}</td>
                <td class="iot-mono">${d.samples || 0}</td>
                <td class="iot-mono">${d.offlineGaps || 0}${d.maxGapMinutes ? ` · ${fmtNum(d.maxGapMinutes, 0, " мин")}` : ""}</td>
                <td>${fmtDate(d.lastSeen)}</td>
              </tr>
            `).join("") : `<tr><td colspan="11" style="padding:34px;text-align:center;color:#94a3b8">Энэ хугацаанд IoT бичлэг алга.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
      <div class="iot-panel">
        <div class="iot-panel-head"><div class="iot-panel-title">Юу болсон</div><span>${events.length} event</span></div>
        ${events.length ? events.map(e => `
          <div class="iot-report-event">
            <b>${fmtText(e.deviceName)}</b>
            <span>${reportEventText(e)}</span>
            <time>${fmtDate(e.at)}</time>
          </div>
        `).join("") : `<div class="iot-empty-dark">Энэ хугацаанд command эсвэл төлөв солигдсон event алга.</div>`}
      </div>
    </div>
  </div>`;
}

function pct(part, total) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function renderCommandKpis() {
  const s = iotStats();
  const cards = [
    ["Нийт гэрэлтүүлэг", s.total, "100%", "🗼", "#0ea5e9"],
    ["Асаж байгаа", s.on || s.online, pct(s.on || s.online, s.total), "💡", "#22c55e"],
    ["Унтарсан", s.off || s.offline, pct(s.off || s.offline, s.total), "⚠", "#f59e0b"],
    ["Удирдлагын цэг", s.online, pct(s.online, s.total), "📍", "#8b5cf6"],
    ["Нийт эрчим хүч", fmtNum(s.power, 2, " kW"), "Одоогоор", "⚡", "#06b6d4"],
    ["Өнөөдрийн хэмжилт", fmtNum(s.energy, 2, " kWh"), s.energy ? "+ live" : "хүлээгдэж байна", "⌂", "#2563eb"],
  ];
  return `<div class="iot-command-kpis">
    ${cards.map(([label, value, sub, icon, color]) => `
      <div class="iot-command-kpi">
        <div class="iot-kpi-icon" style="--kpi:${color}">${icon}</div>
        <div>
          <div class="iot-kpi-label">${label}</div>
          <div class="iot-kpi-value">${value}</div>
          <div class="iot-kpi-sub">${sub}</div>
        </div>
      </div>
    `).join("")}
  </div>`;
}

function renderCategoryCards() {
  const s = iotStats();
  const online = s.online;
  const offline = s.offline;
  const groups = [
    ["IoT тоолуур / ADW300 380V · ADW310 220V", s.total, online, offline, "#2563eb", "▥"],
    ["Асаалттай хэлхээ", s.on || online, s.on || online, s.off || offline, "#22c55e", "⌁"],
    ["Сүлжээний төлөв", s.total, online, offline, "#8b5cf6", "⌬"],
  ];
  return `<div class="iot-category-stack">
    ${groups.map(([title, total, ok, bad, color, icon]) => `
      <div class="iot-category-card">
        <div class="iot-category-icon" style="background:${color}">${icon}</div>
        <div class="iot-category-main">
          <div class="iot-panel-title">${title}</div>
          <div class="iot-category-row"><span>Нийт</span><b>${total}</b></div>
          <div class="iot-category-row"><span>Ажиллаж байгаа</span><b>${ok} (${pct(ok, total)})</b></div>
          <div class="iot-category-row"><span>Анхаарах</span><b>${bad} (${pct(bad, total)})</b></div>
          <div class="iot-progress"><span style="width:${pct(ok, total)};background:${color}"></span><i style="width:${pct(bad, total)}"></i></div>
        </div>
      </div>
    `).join("")}
  </div>`;
}

function renderAlerts() {
  const rows = _iotRows
    .filter(r => !isDeviceOnline(r) || relayState(r) === "off" || r.command_confirmation_status === "sent_not_confirmed")
    .slice(0, 5);
  const fallback = _iotRows.slice(0, 3);
  const source = rows.length ? rows : fallback;
  return `<div class="iot-panel iot-alert-panel">
    <div class="iot-panel-head"><div class="iot-panel-title">Сэрэмжлүүлэг</div><button onclick="iotSetView('list')">Бүгдийг харах →</button></div>
    ${source.length ? source.map(row => {
      const bad = !isDeviceOnline(row) || relayState(row) === "off";
      return `<div class="iot-alert-row">
        <div class="iot-alert-icon ${bad ? "is-bad" : "is-ok"}">${bad ? "!" : "✓"}</div>
        <div>
          <b>${fmtText(row.deviceName)}</b>
          <span>${bad ? "Холболт/асаалт шалгах" : "Хэвийн хэмжилт ирсэн"}</span>
        </div>
        <time>${fmtDate(row.last_seen)}</time>
      </div>`;
    }).join("") : `<div class="iot-empty-dark">Мэдээлэл алга</div>`}
  </div>`;
}

function renderEnergyChart() {
  const vals = _iotRows.slice(0, 18).map(r => Number(iotNumericValue(r, "power")) || 0);
  const data = vals.length ? vals : [0.2, 0.35, 0.25, 0.5, 0.42, 0.6, 0.4];
  const max = Math.max(...data, 0.1);
  const points = data.map((v, i) => {
    const x = 18 + (i * (264 / Math.max(1, data.length - 1)));
    const y = 112 - (v / max) * 82;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<div class="iot-panel">
    <div class="iot-panel-head"><div class="iot-panel-title">Эрчим хүчний хэрэглээ</div><span>live</span></div>
    <svg class="iot-line-chart" viewBox="0 0 300 130" aria-label="Эрчим хүчний хэрэглээ">
      <path d="M18 112 H286 M18 84 H286 M18 56 H286 M18 28 H286" stroke="rgba(148,163,184,.16)" stroke-width="1"/>
      <polyline points="${points}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.split(" ").map(p => {
        const [x, y] = p.split(",");
        return `<circle cx="${x}" cy="${y}" r="3" fill="#38bdf8"/>`;
      }).join("")}
    </svg>
  </div>`;
}

function renderStatusDonut() {
  const s = iotStats();
  const onPct = s.total ? Math.round(((s.on || s.online) / s.total) * 100) : 0;
  const offPct = Math.max(0, 100 - onPct);
  return `<div class="iot-panel iot-donut-panel">
    <div class="iot-panel-title">Гэрэлтүүлгийн төлөв</div>
    <div class="iot-donut-wrap">
      <div class="iot-donut" style="background:conic-gradient(#22c55e 0 ${onPct}%, #f59e0b ${onPct}% ${onPct + Math.round(offPct / 2)}%, #ef4444 ${onPct + Math.round(offPct / 2)}% 100%)">
        <div><b>${s.total}</b><span>Нийт</span></div>
      </div>
      <div class="iot-donut-legend">
        <span><i style="background:#22c55e"></i>Ажиллаж байгаа <b>${s.on || s.online}</b></span>
        <span><i style="background:#f59e0b"></i>Унтарсан <b>${s.off || 0}</b></span>
        <span><i style="background:#ef4444"></i>Офлайн <b>${s.offline}</b></span>
      </div>
    </div>
  </div>`;
}

function renderErpSyncPanel() {
  const rows = _iotRows.slice(0, 4);
  return `<div class="iot-panel">
    <div class="iot-panel-head"><div class="iot-panel-title">ERP холболт - хэмжилт</div><button onclick="iotSetView('list')">Дэлгэрэнгүй →</button></div>
    <table class="iot-dark-table">
      <thead><tr><th>Төхөөрөмж</th><th>Хэрэглээ</th><th>Төлөв</th></tr></thead>
      <tbody>${rows.length ? rows.map(r => `
        <tr>
          <td>${fmtText(r.deviceName)}</td>
          <td>${fmtNum(iotNumericValue(r, "energy"), 2, " kWh")}</td>
          <td><span class="${isDeviceOnline(r) ? "ok" : "bad"}">${isDeviceOnline(r) ? "Ирсэн" : "Тасарсан"}</span></td>
        </tr>
      `).join("") : `<tr><td colspan="3">Мэдээлэл алга</td></tr>`}</tbody>
    </table>
  </div>`;
}

function renderWeatherLikePanel() {
  const s = iotStats();
  return `<div class="iot-panel iot-weather-panel">
    <div class="iot-panel-title">Системийн байдал</div>
    <div class="iot-weather-main"><span>☀</span><b>${s.avgRssi === null ? "-" : Math.round(s.avgRssi)} dBm</b></div>
    <div class="iot-weather-grid">
      <span>Сүлжээ</span><b>${s.online}/${s.total} онлайн</b>
      <span>Чадал</span><b>${fmtNum(s.power, 2, " kW")}</b>
      <span>Энерги</span><b>${fmtNum(s.energy, 2, " kWh")}</b>
    </div>
  </div>`;
}

function renderCommandDashboard() {
  return `
    <div class="iot-command-dashboard">
      <div class="iot-command-title">
        <div>
          <h2>ДОРНОД АЙМГИЙН УХААЛАГ ГУДАМЖНЫ ГЭРЭЛТҮҮЛГИЙН УДИРДЛАГА, ХЯНАЛТЫН СИСТЕМ</h2>
          <p>ADW300 380V 3 фаз / ADW310 220V 1 фаз · ChirpStack uplink · ERP live хяналт</p>
        </div>
        <div class="iot-title-actions">
          <button onclick="iotRefresh()">Шинэчлэх</button>
          <button onclick="iotToggleMaximize()">${_iotMaximized ? "Хэвийн" : "Дэлгэц дүүрэн"}</button>
        </div>
      </div>
      ${renderCommandKpis()}
      <div class="iot-command-grid">
        <aside>${renderCategoryCards()}</aside>
        <main>${renderMapPanel()}</main>
        <aside>${renderAlerts()}${renderWeatherLikePanel()}</aside>
      </div>
      <div class="iot-command-bottom">
        ${renderEnergyChart()}
        ${renderStatusDonut()}
        ${renderErpSyncPanel()}
      </div>
    </div>`;
}

function rawPayloadObject(row) {
  try {
    return JSON.parse(row?.rawPayload || "{}") || {};
  } catch (_) {
    return {};
  }
}

function base64ToHex(value) {
  try {
    return Array.from(atob(String(value || "")), ch =>
      ch.charCodeAt(0).toString(16).padStart(2, "0")
    ).join("");
  } catch (_) {
    return "";
  }
}

function rawDataHex(row) {
  const raw = rawPayloadObject(row);
  return raw.data_hex || raw.dataHex || base64ToHex(raw.data || raw.frm_payload || "");
}

function decodedPayloadSummary(row) {
  const raw = rawPayloadObject(row);
  const obj = raw.object || raw.decodedData || raw.objectJSON || {};
  const entries = Object.entries(obj || {})
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object");
  if (entries.length) {
    return entries.slice(0, 12).map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(String(v))}`).join(" · ");
  }
  const hex = rawDataHex(row);
  if (hex) return `Raw HEX: ${escapeHtml(hex.slice(0, 140))}${hex.length > 140 ? "..." : ""}`;
  return "Decoder object ирээгүй";
}

function pickNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function deepFindNumber(obj, keys) {
  if (!obj || typeof obj !== "object") return null;
  const wanted = new Set(keys.map(k => String(k).toLowerCase()));
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    for (const [key, value] of Object.entries(cur)) {
      if (wanted.has(String(key).toLowerCase())) {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
      }
      if (value && typeof value === "object") stack.push(value);
    }
  }
  return null;
}

function isChoibalsanCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= 47 && lat <= 49.5 &&
    lng >= 113 && lng <= 116.5;
}

function fallbackCoord(row, index) {
  const baseLat = 48.0789;
  const baseLng = 114.5357;
  const text = `${row?.devEui || ""}${row?.deviceName || ""}`;
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  const angle = ((hash % 360) * Math.PI) / 180;
  const radius = 0.006 + (index % 6) * 0.002;
  return {
    lat: baseLat + Math.sin(angle) * radius,
    lng: baseLng + Math.cos(angle) * radius,
    estimated: true,
  };
}

function coordForRow(row, index) {
  const raw = rawPayloadObject(row);
  const obj = raw.object || {};
  const deviceInfo = raw.deviceInfo || {};
  const lat = pickNumber(
    row?.lat, row?.latitude, row?.gps_lat, row?.gpsLat,
    obj.lat, obj.latitude, obj.gps_lat, obj.gpsLat,
    deviceInfo.lat, deviceInfo.latitude,
    deepFindNumber(raw, ["lat", "latitude", "gps_lat", "gpsLat"])
  );
  const lng = pickNumber(
    row?.lng, row?.lon, row?.long, row?.longitude, row?.gps_lng, row?.gpsLon,
    obj.lng, obj.lon, obj.long, obj.longitude, obj.gps_lng, obj.gpsLon,
    deviceInfo.lng, deviceInfo.lon, deviceInfo.longitude,
    deepFindNumber(raw, ["lng", "lon", "long", "longitude", "gps_lng", "gpsLon"])
  );
  if (lat !== null && lng !== null && isChoibalsanCoord(lat, lng)) {
    return { lat, lng, estimated: false };
  }
  return fallbackCoord(row, index);
}

function mapPopup(row, coord) {
  const online = isDeviceOnline(row);
  return `
    <div class="iot-map-popup">
      <div style="font-weight:900;color:#0f172a;margin-bottom:4px">${fmtText(row.deviceName)}</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:8px">${fmtText(row.devEui)}</div>
      <div style="display:grid;grid-template-columns:auto auto;gap:4px 12px;font-size:12px">
        <span>Төлөв</span><b style="color:${online ? "#166534" : "#991b1b"}">${online ? "Онлайн" : "Офлайн"}</b>
        <span>Чадал</span><b>${fmtNum(iotNumericValue(row, "power"), 3, " kW")}</b>
        <span>Энерги</span><b>${fmtNum(iotNumericValue(row, "energy"), 3, " kWh")}</b>
        <span>Сүүлд</span><b>${fmtDate(row.last_seen)}</b>
      </div>
      ${coord.estimated ? `<div style="margin-top:8px;color:#92400e;font-size:11px">Байршил payload-д байхгүй тул түр ойролцоогоор байрлуулсан.</div>` : ""}
    </div>
  `;
}

function markerHtml(row, coord) {
  const online = isDeviceOnline(row);
  const load = relayState(row);
  const color = online ? (load === "on" ? "#16a34a" : "#2563eb") : "#dc2626";
  const ring = coord.estimated ? "#f59e0b" : "#ffffff";
  return `<div class="iot-map-marker" style="background:${color};border-color:${ring}">
    <span>${load === "on" ? "ON" : load === "off" ? "OFF" : "IoT"}</span>
  </div>`;
}

function renderMapPanel() {
  const points = _iotRows.map((row, index) => ({ row, coord: coordForRow(row, index) }));
  const online = points.filter(p => isDeviceOnline(p.row)).length;
  const estimated = points.filter(p => p.coord.estimated).length;
  return `
    <div class="iot-map-shell">
      <div class="iot-map-toolbar">
        <div>
          <div class="iot-panel-title">Газрын зураг</div>
          <div class="iot-map-sub">${points.length} төхөөрөмж · ${online} онлайн · ${estimated} түр байршил</div>
        </div>
        <div class="iot-map-legend"><span><i class="ok"></i>Ажиллаж байгаа</span><span><i class="warn"></i>Түр байршил</span><span><i class="bad"></i>Офлайн</span></div>
      </div>
      <div id="iotMap" class="iot-map-canvas"></div>
    </div>`;
}

function renderIotBody() {
  if (_iotView === "report") return renderReportPanel();
  if (_iotView === "list") return renderTable();
  if (_iotView === "map") return renderMapPanel();
  return renderCommandDashboard();
}

function ensureLeaflet() {
  if (window.L) {
    _iotLeafletReady = true;
    return Promise.resolve();
  }
  if (_iotLeafletReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cssId = "iotLeafletCss";
    if (!document.getElementById(cssId)) {
      const css = document.createElement("link");
      css.id = cssId;
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      _iotLeafletReady = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Map сан ачаалахад алдаа гарлаа"));
    document.head.appendChild(script);
  });
}

async function initIotMap() {
  if (_iotView === "list") return;
  const mapEl = document.getElementById("iotMap");
  if (!mapEl) return;
  try {
    await ensureLeaflet();
  } catch (e) {
    mapEl.innerHTML = `<div class="iot-map-empty">${escapeHtml(e.message || "Map ачаалагдсангүй")}</div>`;
    return;
  }
  if (!window.L || !document.getElementById("iotMap")) return;
  const points = _iotRows.map((row, index) => ({ row, coord: coordForRow(row, index) }));
  _iotMap = window.L.map("iotMap", { zoomControl: true }).setView([48.0789, 114.5357], 13);
  window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap &copy; CARTO",
  }).addTo(_iotMap);
  _iotMarkers = window.L.featureGroup().addTo(_iotMap);
  points.forEach(({ row, coord }) => {
    const icon = window.L.divIcon({
      className: "iot-map-marker-wrap",
      html: markerHtml(row, coord),
      iconSize: [42, 42],
      iconAnchor: [21, 21],
      popupAnchor: [0, -18],
    });
    window.L.marker([coord.lat, coord.lng], { icon })
      .bindPopup(mapPopup(row, coord))
      .addTo(_iotMarkers);
  });
  if (points.length && _iotMarkers.getLayers().length) {
    _iotMap.fitBounds(_iotMarkers.getBounds().pad(0.18), { maxZoom: 15 });
  } else {
    _iotMap.setView([48.0789, 114.5357], 13);
  }
  setTimeout(() => _iotMap?.invalidateSize(), 80);
}

function syncIotMaximized() {
  document.body.classList.toggle("iot-maximized", _iotMaximized);
  setTimeout(() => _iotMap?.invalidateSize(), 120);
}

function iotToggleMaximize() {
  _iotMaximized = !_iotMaximized;
  syncIotMaximized();
  if (_iotMaximized && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else if (!_iotMaximized && document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  renderIotPage();
}

function iotSetView(view) {
  _iotView = ["overview", "map", "list", "report"].includes(view) ? view : "overview";
  _iotMap = null;
  _iotMarkers = null;
  renderIotPage();
  if (_iotView === "report") loadIotReport();
}

function renderIotPage() {
  const el = document.getElementById("main");
  if (!el) return;
  el.innerHTML = `
    <style>
      .iot-page{padding:24px;max-width:100%;box-sizing:border-box}
      .iot-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
      .iot-summary-grid{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:12px;margin-bottom:18px}
      .iot-summary-card{border:1px solid;border-radius:8px;padding:14px;min-width:0}
      .iot-table-wrap{overflow-x:auto;border:1px solid #e5e7eb;border-radius:8px;background:#fff;max-width:100%}
      .iot-tabs{display:flex;gap:6px;margin:0 0 12px}
      .iot-tab{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:900;cursor:pointer}
      .iot-tab.is-active{background:#2563eb;border-color:#2563eb;color:#fff;box-shadow:0 6px 16px rgba(37,99,235,.18)}
      .iot-meter-table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;font-size:12px;line-height:1.25}
      .iot-meter-table th,.iot-meter-table td{padding:9px 8px;text-align:left;border-bottom:1px solid #e5e7eb;white-space:nowrap;vertical-align:middle}
      .iot-meter-table th{color:#64748b;font-size:10px;font-weight:800;text-transform:uppercase;background:#f8fafc}
      .iot-meter-table tr:last-child td{border-bottom:none}
      .iot-mono{font-family:Consolas,Menlo,monospace;color:#0f172a}
      .iot-strong{font-weight:800}
      .iot-device-name{font-weight:800;max-width:220px;overflow:hidden;text-overflow:ellipsis}
      .iot-model-inline{margin-top:3px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1f6fb2;font-size:10px;font-weight:900}
      .iot-payload-inline{margin-top:4px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#64748b;font-size:10px;font-family:Consolas,Menlo,monospace;font-weight:600}
      .iot-deveui{max-width:126px;overflow:hidden;text-overflow:ellipsis;color:#475569}
      .iot-last-seen{color:#475569;max-width:132px;overflow:hidden;text-overflow:ellipsis}
      .iot-sticky-col{position:sticky;right:0;background:#fff;box-shadow:-8px 0 12px rgba(15,23,42,.05);z-index:2}
      th.iot-sticky-col{background:#f8fafc;z-index:3}
      .iot-control-cell{min-width:150px}
      .iot-control-cell.iot-relay-on{background:linear-gradient(90deg,#dcfce7 0%,#f0fdf4 100%);box-shadow:-10px 0 18px rgba(22,163,74,.16)}
      .iot-control-cell.iot-relay-off{background:linear-gradient(90deg,#fee2e2 0%,#fef2f2 100%);box-shadow:-10px 0 18px rgba(220,38,38,.16)}
      .iot-control-cell.iot-relay-unknown{background:#f8fafc}
      .iot-relay-state{display:inline-flex;align-items:center;border-radius:7px;font-size:11px;font-weight:900;letter-spacing:.2px;padding:4px 8px;margin-bottom:6px;border:1px solid}
      .iot-relay-on{background:#16a34a;color:#fff;border-color:#047857;box-shadow:0 4px 12px rgba(22,163,74,.24)}
      .iot-relay-off{background:#dc2626;color:#fff;border-color:#b91c1c;box-shadow:0 4px 12px rgba(220,38,38,.24)}
      .iot-relay-unknown{background:#e2e8f0;color:#475569;border-color:#cbd5e1}
      .iot-command-badge{display:block;width:max-content;max-width:108px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:999px;font-size:10px;font-weight:800;padding:2px 7px;margin-bottom:5px}
      .iot-control-buttons{display:flex;gap:6px}
      .iot-command-btn{border:1px solid #cbd5e1;border-radius:9px;background:#f8fafc;color:#64748b;font-size:12px;font-weight:900;padding:7px 11px;min-width:44px;cursor:pointer;opacity:.48;filter:grayscale(1);transition:background .15s,border-color .15s,box-shadow .15s,color .15s,transform .15s,opacity .15s}
      .iot-command-btn.iot-on:not(.is-active):hover{color:#15803d;border-color:#86efac;background:#f0fdf4;opacity:1;filter:none}
      .iot-command-btn.iot-off:not(.is-active):hover{color:#b91c1c;border-color:#fecaca;background:#fef2f2;opacity:1;filter:none}
      .iot-command-btn.iot-on.is-active{color:#fff;border-color:#047857;background:#16a34a;box-shadow:0 0 0 4px rgba(34,197,94,.28),0 8px 20px rgba(22,163,74,.32);opacity:1;filter:none}
      .iot-command-btn.iot-off.is-active{color:#fff;border-color:#b91c1c;background:#dc2626;box-shadow:0 0 0 4px rgba(239,68,68,.28),0 8px 20px rgba(220,38,38,.32);opacity:1;filter:none}
      .iot-command-btn.is-active{transform:translateY(-1px) scale(1.08)}
      .iot-map-shell{border:1px solid #e5e7eb;border-radius:8px;background:#fff;overflow:hidden}
      .iot-map-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #e5e7eb;background:#f8fafc}
      .iot-map-canvas{height:560px;width:100%;background:#e2e8f0}
      .iot-map-empty{height:100%;display:flex;align-items:center;justify-content:center;color:#64748b;font-weight:800}
      .iot-map-marker{width:38px;height:38px;border-radius:999px;border:3px solid #fff;box-shadow:0 8px 20px rgba(15,23,42,.26);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:900}
      .iot-map-marker span{line-height:1}
      .iot-map-popup{min-width:190px}
      @media (max-width:1200px){
        .iot-page{padding:18px}
        .iot-summary-grid{grid-template-columns:repeat(3,minmax(120px,1fr))}
        .iot-meter-table th,.iot-meter-table td{padding:8px 7px;font-size:11px}
      }
      @media (max-width:760px){
        .iot-head{align-items:stretch;flex-direction:column}
        .iot-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .iot-map-toolbar{align-items:stretch;flex-direction:column}
        .iot-map-canvas{height:460px}
      }
    </style>
    <div class="iot-page">
      <div class="iot-head">
        <div>
          <h2 style="margin:0;font-size:20px">Гэрэлтүүлгийн IoT хяналт</h2>
          <div style="margin-top:4px;color:#64748b;font-size:13px">ADW300 380V 3 фаз / ADW310 220V 1 фаз · ChirpStack uplink · сүүлийн хэмжилт</div>
        </div>
        <button class="btn secondary" onclick="iotRefresh()" style="padding:8px 14px;font-size:13px">Шинэчлэх</button>
      </div>
      <div id="iotSummary">${renderSummary()}</div>
      <div style="background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:8px;padding:10px 12px;font-size:12px;margin-bottom:12px">
        ADW300 380V 3 фаз, ADW310 220V 1 фаз тоолуур. DO удирдлага ажиллахын тулд ChirpStack EU868 RX2 DR=3, RX2 frequency=869525000 байх шаардлагатай.
      </div>
      <div class="iot-tabs" role="tablist" aria-label="IoT харагдац">
        <button class="iot-tab ${_iotView === "list" ? "is-active" : ""}" onclick="iotSetView('list')">Жагсаалт</button>
        <button class="iot-tab ${_iotView === "map" ? "is-active" : ""}" onclick="iotSetView('map')">Газрын зураг</button>
      </div>
      <div id="iotBody">${renderIotBody()}</div>
    </div>`;
  if (_iotView === "map") initIotMap();
}

renderIotPage = function() {
  const el = document.getElementById("main");
  if (!el) return;
  el.innerHTML = `
    <style>
      .iot-page{padding:16px;max-width:100%;min-height:calc(100vh - 72px);box-sizing:border-box;background:#e7edf3;color:#172033}
      body.iot-maximized{overflow:hidden}
      body.iot-maximized .top,body.iot-maximized .side{display:none!important}
      body.iot-maximized .layout{display:block!important;margin-top:0!important;min-height:100vh!important}
      body.iot-maximized .main{padding:0!important;width:100vw!important;height:100vh!important;overflow:auto!important}
      body.iot-maximized .iot-page{min-height:100vh;padding:10px}
      body.iot-maximized .iot-command-title{padding:12px 14px}
      body.iot-maximized .iot-command-title h2{font-size:22px}
      body.iot-maximized .iot-map-canvas{height:calc(100vh - 452px);min-height:300px}
      body.iot-maximized .iot-view-map .iot-map-canvas{height:calc(100vh - 92px);min-height:0}
      body.iot-maximized .iot-view-map .iot-map-toolbar{padding:8px 12px}
      body.iot-maximized .iot-view-map .iot-tabs{margin-bottom:8px}
      body.iot-maximized .iot-command-bottom{grid-template-columns:1fr .8fr 1.1fr}
      .iot-tabs{display:flex;gap:8px;margin:0 0 12px}
      .iot-tab{border:1px solid #a9bacb;background:#f8fafc;color:#23415f;border-radius:8px;padding:9px 13px;font-size:12px;font-weight:900;cursor:pointer}
      .iot-tab.is-active{background:#1f6fb2;border-color:#1f6fb2;color:#fff;box-shadow:0 8px 18px rgba(31,111,178,.18)}
      .iot-command-dashboard{display:flex;flex-direction:column;gap:12px}
      .iot-command-title{display:flex;align-items:center;justify-content:space-between;gap:18px;background:linear-gradient(180deg,#f8fbff 0%,#edf4fb 100%);border:1px solid #b8c7d6;border-left:5px solid #1f6fb2;border-radius:8px;padding:16px 18px}
      .iot-command-title h2{margin:0;max-width:980px;font-size:24px;line-height:1.22;letter-spacing:0;text-transform:uppercase;color:#152238}
      .iot-command-title p{margin:6px 0 0;color:#41617d;font-size:13px}
      .iot-command-title button,.iot-panel-head button{border:1px solid #8db4d8;background:#e8f2fb;color:#1f5f9a;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:900;cursor:pointer}
      .iot-title-actions{display:flex;gap:8px;align-items:center;flex:0 0 auto}
      .iot-command-kpis{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:10px}
      .iot-command-kpi,.iot-panel,.iot-category-card,.iot-map-shell{background:linear-gradient(180deg,#f8fbff,#edf4fa);border:1px solid #b8c7d6;border-radius:8px;box-shadow:0 10px 22px rgba(31,55,77,.08);min-width:0}
      .iot-command-kpi{display:flex;align-items:center;gap:12px;padding:14px}
      .iot-kpi-icon{width:40px;height:40px;border-radius:999px;background:var(--kpi);display:flex;align-items:center;justify-content:center;box-shadow:0 0 22px rgba(14,165,233,.25);font-size:18px}
      .iot-kpi-label{font-size:11px;color:#506f8b;text-transform:uppercase;font-weight:800}
      .iot-kpi-value{font-size:24px;line-height:1.1;font-weight:950;color:#102033;margin-top:3px}
      .iot-kpi-sub{font-size:11px;color:#1f6fb2;margin-top:5px}
      .iot-command-grid{display:grid;grid-template-columns:236px minmax(420px,1fr) 300px;gap:12px;align-items:stretch}
      .iot-command-grid aside{display:flex;flex-direction:column;gap:12px;min-width:0}
      .iot-category-stack{display:flex;flex-direction:column;gap:10px}
      .iot-category-card{display:flex;gap:12px;padding:13px}
      .iot-category-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;flex:0 0 auto}
      .iot-category-main{flex:1;min-width:0}
      .iot-category-row{display:flex;justify-content:space-between;gap:10px;color:#1d2f44;font-size:12px;margin-top:7px}
      .iot-category-row span{color:#58728b}
      .iot-progress{display:flex;height:5px;background:#d7e1eb;border-radius:999px;overflow:hidden;margin-top:10px}
      .iot-progress span,.iot-progress i{display:block;height:100%}
      .iot-progress i{background:#ef4444}
      .iot-panel{padding:14px}
      .iot-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .iot-panel-head span{font-size:11px;color:#1f6fb2}
      .iot-panel-title{font-size:13px;font-weight:950;color:#172033;text-transform:uppercase;letter-spacing:0}
      .iot-report{display:flex;flex-direction:column;gap:12px}
      .iot-report-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(180deg,#f8fbff,#edf4fa);border:1px solid #b8c7d6;border-radius:8px;padding:14px}
      .iot-report-periods{display:flex;flex-wrap:wrap;gap:7px}
      .iot-report-periods button{border:1px solid #a9bacb;background:#f8fafc;color:#23415f;border-radius:8px;padding:8px 11px;font-size:12px;font-weight:900;cursor:pointer}
      .iot-report-periods button.is-active{background:#1f6fb2;border-color:#1f6fb2;color:#fff}
      .iot-report-cards{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:10px}
      .iot-report-card{background:linear-gradient(180deg,#f8fbff,#edf4fa);border:1px solid #b8c7d6;border-left:4px solid var(--accent);border-radius:8px;padding:13px;min-width:0;box-shadow:0 10px 22px rgba(31,55,77,.08)}
      .iot-report-card span{display:block;color:#506f8b;font-size:11px;text-transform:uppercase;font-weight:900}
      .iot-report-card b{display:block;color:#102033;font-size:22px;line-height:1.15;margin-top:5px}
      .iot-report-card i{display:block;color:#58728b;font-size:11px;font-style:normal;margin-top:5px}
      .iot-report-grid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:12px;align-items:start}
      .iot-report-event{display:grid;grid-template-columns:1fr;gap:3px;border-top:1px solid #d5e0ea;padding:10px 0}
      .iot-report-event b{font-size:12px;color:#172033}.iot-report-event span{font-size:12px;color:#1d2f44}.iot-report-event time{font-size:11px;color:#58728b}
      .iot-chart-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .iot-chart-controls select{border:1px solid #a9bacb;background:#fff;color:#172033;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:800}
      .iot-chart-wrap{overflow-x:auto;border:1px solid #d5e0ea;border-radius:8px;background:#fff}
      .iot-usage-chart{display:block;min-width:720px;width:100%;height:300px}
      .iot-chart-empty{height:220px;display:flex;align-items:center;justify-content:center;color:#58728b;font-weight:900;background:#f8fbff;border:1px solid #d5e0ea;border-radius:8px}
      .iot-map-shell{overflow:hidden;padding:0}
      .iot-map-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #b8c7d6;background:#edf4fb}
      .iot-map-sub{font-size:12px;color:#58728b;margin-top:3px}
      .iot-map-legend{display:grid;gap:7px;font-size:12px;color:#1d2f44;background:#f8fbff;border:1px solid #c5d2df;border-radius:8px;padding:10px 12px}
      .iot-map-legend span{display:flex;align-items:center;gap:8px}
      .iot-map-legend i{width:10px;height:10px;border-radius:999px;display:inline-block}
      .iot-map-legend .ok{background:#22c55e}.iot-map-legend .warn{background:#f59e0b}.iot-map-legend .bad{background:#ef4444}
      .iot-map-canvas{height:386px;width:100%;background:#d7e1eb}
      .iot-view-map .iot-map-canvas{height:calc(100vh - 228px);min-height:640px}
      .iot-view-map .iot-map-toolbar{padding:10px 14px}
      .iot-view-map .iot-map-legend{display:flex;gap:14px;align-items:center}
      .iot-view-map .leaflet-control-attribution{font-size:9px;opacity:.28;transform:scale(.84);transform-origin:right bottom;background:rgba(255,255,255,.55)}
      .iot-view-map .leaflet-control-attribution:hover{opacity:.85}
      .iot-map-empty{height:100%;display:flex;align-items:center;justify-content:center;color:#58728b;font-weight:800}
      .iot-map-marker{width:38px;height:38px;border-radius:999px;border:3px solid #fff;box-shadow:0 4px 14px rgba(31,55,77,.22);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:900}
      .iot-map-marker span{line-height:1}
      .iot-map-popup{min-width:190px}
      .iot-alert-row{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;border-top:1px solid #d5e0ea;padding:10px 0}
      .iot-alert-row b{display:block;color:#172033;font-size:12px}
      .iot-alert-row span,.iot-alert-row time{font-size:11px;color:#58728b}
      .iot-alert-icon{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:950}
      .iot-alert-icon.is-bad{background:rgba(239,68,68,.18);color:#f87171}.iot-alert-icon.is-ok{background:rgba(34,197,94,.18);color:#4ade80}
      .iot-weather-main{display:flex;align-items:center;gap:12px;margin:18px 0;color:#172033}
      .iot-weather-main span{font-size:36px;color:#f59e0b}.iot-weather-main b{font-size:26px}
      .iot-weather-grid{display:grid;grid-template-columns:1fr auto;gap:8px;font-size:12px;color:#58728b}.iot-weather-grid b{color:#172033}
      .iot-command-bottom{display:grid;grid-template-columns:1.1fr .9fr 1.25fr;gap:12px}
      .iot-line-chart{width:100%;height:142px;display:block}
      .iot-donut-wrap{display:flex;align-items:center;gap:18px;margin-top:12px}
      .iot-donut{width:118px;height:118px;border-radius:999px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
      .iot-donut>div{width:72px;height:72px;border-radius:999px;background:#f8fbff;display:flex;flex-direction:column;align-items:center;justify-content:center}
      .iot-donut b{font-size:22px;color:#172033}.iot-donut span{font-size:11px;color:#58728b}
      .iot-donut-legend{display:grid;gap:9px;font-size:12px;color:#1d2f44;flex:1}.iot-donut-legend span{display:flex;align-items:center;gap:8px;justify-content:space-between}.iot-donut-legend i{width:9px;height:9px;border-radius:999px}
      .iot-dark-table{width:100%;border-collapse:collapse;font-size:12px;color:#1d2f44}
      .iot-dark-table th,.iot-dark-table td{padding:8px;border-bottom:1px solid #d5e0ea;text-align:left}
      .iot-dark-table th{color:#58728b;font-size:11px;font-weight:800}
      .iot-dark-table .ok,.iot-dark-table .bad{border-radius:999px;padding:3px 8px;font-weight:900;font-size:11px}.iot-dark-table .ok{background:#166534;color:#dcfce7}.iot-dark-table .bad{background:#7f1d1d;color:#fee2e2}
      .iot-empty-dark{color:#58728b;font-size:12px;padding:16px 0}
      .iot-table-wrap{overflow-x:auto;border:1px solid rgba(56,189,248,.18);border-radius:8px;background:#fff;max-width:100%}
      .iot-meter-table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;font-size:12px;line-height:1.25}
      .iot-meter-table th,.iot-meter-table td{padding:9px 8px;text-align:left;border-bottom:1px solid #e5e7eb;white-space:nowrap;vertical-align:middle}
      .iot-meter-table th{color:#64748b;font-size:10px;font-weight:800;text-transform:uppercase;background:#f8fafc}
      .iot-meter-table tr:last-child td{border-bottom:none}
      .iot-mono{font-family:Consolas,Menlo,monospace;color:#0f172a}
      .iot-strong{font-weight:800}
      .iot-device-name{font-weight:800;max-width:220px;overflow:hidden;text-overflow:ellipsis}
      .iot-model-inline{margin-top:3px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1f6fb2;font-size:10px;font-weight:900}
      .iot-payload-inline{margin-top:4px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#64748b;font-size:10px;font-family:Consolas,Menlo,monospace;font-weight:600}
      .iot-deveui{max-width:126px;overflow:hidden;text-overflow:ellipsis;color:#475569}
      .iot-last-seen{color:#475569;max-width:132px;overflow:hidden;text-overflow:ellipsis}
      .iot-sticky-col{position:sticky;right:0;background:#fff;box-shadow:-8px 0 12px rgba(15,23,42,.05);z-index:2}
      th.iot-sticky-col{background:#f8fafc;z-index:3}
      .iot-control-cell{min-width:150px}
      .iot-control-cell.iot-relay-on{background:linear-gradient(90deg,#dcfce7 0%,#f0fdf4 100%);box-shadow:-10px 0 18px rgba(22,163,74,.16)}
      .iot-control-cell.iot-relay-off{background:linear-gradient(90deg,#fee2e2 0%,#fef2f2 100%);box-shadow:-10px 0 18px rgba(220,38,38,.16)}
      .iot-control-cell.iot-relay-unknown{background:#f8fafc}
      .iot-relay-state{display:inline-flex;align-items:center;border-radius:7px;font-size:11px;font-weight:900;letter-spacing:.2px;padding:4px 8px;margin-bottom:6px;border:1px solid}
      .iot-relay-on{background:#16a34a;color:#fff;border-color:#047857;box-shadow:0 4px 12px rgba(22,163,74,.24)}
      .iot-relay-off{background:#dc2626;color:#fff;border-color:#b91c1c;box-shadow:0 4px 12px rgba(220,38,38,.24)}
      .iot-relay-unknown{background:#e2e8f0;color:#475569;border-color:#cbd5e1}
      .iot-command-badge{display:block;width:max-content;max-width:108px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:999px;font-size:10px;font-weight:800;padding:2px 7px;margin-bottom:5px}
      .iot-control-buttons{display:flex;gap:6px}
      .iot-command-btn{border:1px solid #cbd5e1;border-radius:9px;background:#f8fafc;color:#64748b;font-size:12px;font-weight:900;padding:7px 11px;min-width:44px;cursor:pointer;opacity:.48;filter:grayscale(1);transition:background .15s,border-color .15s,box-shadow .15s,color .15s,transform .15s,opacity .15s}
      .iot-command-btn.iot-on:not(.is-active):hover{color:#15803d;border-color:#86efac;background:#f0fdf4;opacity:1;filter:none}
      .iot-command-btn.iot-off:not(.is-active):hover{color:#b91c1c;border-color:#fecaca;background:#fef2f2;opacity:1;filter:none}
      .iot-command-btn.iot-on.is-active{color:#fff;border-color:#047857;background:#16a34a;box-shadow:0 0 0 4px rgba(34,197,94,.28),0 8px 20px rgba(22,163,74,.32);opacity:1;filter:none}
      .iot-command-btn.iot-off.is-active{color:#fff;border-color:#b91c1c;background:#dc2626;box-shadow:0 0 0 4px rgba(239,68,68,.28),0 8px 20px rgba(220,38,38,.32);opacity:1;filter:none}
      .iot-command-btn.is-active{transform:translateY(-1px) scale(1.08)}
      @media (max-width:1200px){
        .iot-command-kpis{grid-template-columns:repeat(3,minmax(140px,1fr))}
        .iot-report-cards{grid-template-columns:repeat(3,minmax(140px,1fr))}
        .iot-report-grid{grid-template-columns:1fr}
        .iot-command-grid{grid-template-columns:1fr}
        .iot-command-bottom{grid-template-columns:1fr}
        .iot-map-canvas{height:440px}
        .iot-meter-table th,.iot-meter-table td{padding:8px 7px;font-size:11px}
      }
      @media (max-width:760px){
        .iot-page{padding:10px}
        .iot-command-title{align-items:stretch;flex-direction:column}
        .iot-command-title h2{font-size:18px}
        .iot-command-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
        .iot-report-cards{grid-template-columns:repeat(2,minmax(0,1fr))}
        .iot-report-toolbar{align-items:stretch;flex-direction:column}
        .iot-map-toolbar{align-items:stretch;flex-direction:column}
        .iot-map-canvas{height:460px}
      }
    </style>
    <div class="iot-page iot-view-${_iotView}">
      <div class="iot-tabs" role="tablist" aria-label="IoT харагдац">
        <button class="iot-tab ${_iotView === "overview" ? "is-active" : ""}" onclick="iotSetView('overview')">Ерөнхий хяналт</button>
        <button class="iot-tab ${_iotView === "map" ? "is-active" : ""}" onclick="iotSetView('map')">Газрын зураг</button>
        <button class="iot-tab ${_iotView === "list" ? "is-active" : ""}" onclick="iotSetView('list')">Жагсаалт</button>
        <button class="iot-tab ${_iotView === "report" ? "is-active" : ""}" onclick="iotSetView('report')">Тайлан</button>
      </div>
      <div id="iotBody">${renderIotBody()}</div>
    </div>`;
  syncIotMaximized();
  if (_iotView === "overview" || _iotView === "map") initIotMap();
};

async function iotRefresh() {
  try {
    _iotRows = await api("/api/iot/devices");
    if (_iotView === "report") _iotReport = await api(`/api/iot/report?period=${encodeURIComponent(_iotReportPeriod)}`);
    renderIotPage();
  } catch (e) {
    const el = document.getElementById("main");
    if (el) {
      el.innerHTML = `
        <div style="padding:24px;max-width:900px">
          <h2 style="margin:0 0 10px;font-size:20px">Гэрэлтүүлгийн IoT хяналт</h2>
          <div style="background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:8px;padding:14px;font-size:13px;line-height:1.55">
            IoT API JSON буцаахгүй байна. Node server шинэ route-аар restart хийгдсэн эсэхийг шалгана уу.
          </div>
        </div>`;
    }
    toast(e.message || "IoT мэдээлэл татахад алдаа гарлаа");
  }
}

async function loadIotReport() {
  _iotReport = null;
  _iotSeries = null;
  renderIotPage();
  try {
    _iotReport = await api(`/api/iot/report?period=${encodeURIComponent(_iotReportPeriod)}`);
    if (!_iotChartDevEui && _iotReport.devices?.[0]?.devEui) _iotChartDevEui = _iotReport.devices[0].devEui;
    if (_iotChartDevEui) {
      _iotSeries = await api(`/api/iot/timeseries?period=${encodeURIComponent(_iotReportPeriod)}&devEui=${encodeURIComponent(_iotChartDevEui)}&bucket=${encodeURIComponent(_iotChartBucket)}`);
    }
    renderIotPage();
  } catch (e) {
    toast(e.message || "IoT тайлан татахад алдаа гарлаа");
  }
}

function iotSetReportPeriod(period) {
  _iotReportPeriod = ["night", "today", "7d", "month", "year"].includes(period) ? period : "night";
  loadIotReport();
}

async function loadIotSeries() {
  if (!_iotChartDevEui) return;
  _iotSeries = null;
  renderIotPage();
  try {
    _iotSeries = await api(`/api/iot/timeseries?period=${encodeURIComponent(_iotReportPeriod)}&devEui=${encodeURIComponent(_iotChartDevEui)}&bucket=${encodeURIComponent(_iotChartBucket)}`);
    renderIotPage();
  } catch (e) {
    toast(e.message || "IoT график татахад алдаа гарлаа");
  }
}

function iotSetChartDevice(devEui) {
  _iotChartDevEui = devEui;
  loadIotSeries();
}

function iotSetChartBucket(value) {
  _iotChartBucket = Number(value) || 15;
  loadIotSeries();
}

async function iotSendDownlink(devEui, action) {
  const row = _iotRows.find(r => r.devEui === devEui);
  const deviceName = row?.deviceName || devEui;
  const label = action === "ON" ? "асаах" : "унтраах";
  if (!confirm(`${deviceName} төхөөрөмжийг ${label} downlink илгээх үү?`)) return;
  try {
    const result = await api(`/api/iot/devices/${encodeURIComponent(devEui)}/downlink`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    toast(result.status === "queued" ? "Команд дараалалд орлоо" : `Downlink ${action} дараалалд орлоо`);
    await iotRefresh();
  } catch (e) {
    toast(e.message || "Downlink илгээхэд алдаа гарлаа");
  }
}

async function iot_monitor() {
  const el = document.getElementById("main");
  if (el) {
    el.innerHTML = `<div style="padding:24px;color:#64748b">IoT хэмжилтүүдийг ачааллаж байна...</div>`;
  }
  await iotRefresh();
  state.clockTimer = setInterval(iotRefresh, 60 * 1000);
}

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && _iotMaximized) {
    _iotMaximized = false;
    syncIotMaximized();
    renderIotPage();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && _iotMaximized && !document.fullscreenElement) {
    _iotMaximized = false;
    syncIotMaximized();
    renderIotPage();
  }
});

Object.assign(window, { iot_monitor, iotRefresh, iotSendDownlink, iotSetView, iotToggleMaximize, iotSetReportPeriod, iotSetChartDevice, iotSetChartBucket });
