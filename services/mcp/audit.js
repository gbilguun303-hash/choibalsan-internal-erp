"use strict";
const { run, all } = require("../../db");
const { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, boundedInt, validateDateRange } = require("./validation");

function safeParams(params) {
  const blocked = new Set(["token", "authorization", "password", "salary", "bank_account", "register_no", "phone"]);
  const clean = {};
  for (const [key, value] of Object.entries(params || {})) {
    clean[key] = blocked.has(key.toLowerCase()) ? "[REDACTED]" : value;
  }
  return JSON.stringify(clean).slice(0, 4000);
}

async function auditMcpCall({ user, toolName, params, resultCount, success, errorCode, ip, sessionId, durationMs }) {
  await run(
    `INSERT INTO mcp_tool_audit
      (user_id,role,tool_name,query_params,result_count,success,error_code,ip_address,session_id,duration_ms,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`,
    [
      user?.id || null,
      user?.role || "",
      toolName,
      safeParams(params),
      Number(resultCount || 0),
      success ? 1 : 0,
      errorCode || null,
      String(ip || "").slice(0, 100),
      String(sessionId || user?.session_id || "").slice(0, 200),
      Number(durationMs || 0),
    ]
  ).catch(error => console.error("[mcp audit]", error.message));
}

async function listMcpAuditLogs({ date_from, date_to, user_id, tool_name, limit, offset } = {}) {
  const { from, to } = validateDateRange(date_from, date_to, { maxDays: 31 });
  const rowLimit = boundedInt(limit, DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT, "limit");
  const rowOffset = boundedInt(offset, 0, 0, 100000, "offset");
  const where = [];
  const params = [];
  if (from) { where.push("date(created_at)>=?"); params.push(from); }
  if (to) { where.push("date(created_at)<=?"); params.push(to); }
  if (user_id != null) { where.push("user_id=?"); params.push(Number(user_id)); }
  if (tool_name) { where.push("tool_name=?"); params.push(String(tool_name).slice(0, 100)); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return all(
    `SELECT id,user_id,role,tool_name,query_params,result_count,success,error_code,
            ip_address,session_id,duration_ms,created_at
     FROM mcp_tool_audit ${clause}
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, rowLimit, rowOffset]
  );
}

module.exports = { auditMcpCall, listMcpAuditLogs, safeParams };
