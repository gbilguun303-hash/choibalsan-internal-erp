"use strict";
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) throw new Error(".env file is required.");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function findTestUsers(all) {
  const rows = await all(
    `SELECT id,role FROM users
     WHERE active=1 AND can_login=1
     ORDER BY id`
  );
  const find = roles => rows.find(row => roles.includes(String(row.role || "").toLowerCase()));
  const users = {
    viewer: find(["viewer", "worker"]),
    engineer: find(["engineer", "chief_engineer", "electric"]),
    hr: find(["hr"]),
  };
  for (const [name, user] of Object.entries(users)) {
    if (!user) throw new Error(`No active ${name} test user exists.`);
  }
  return users;
}

async function createClient(url, secret, userId) {
  const token = jwt.sign({ id: userId }, secret, { expiresIn: "10m" });
  const client = new Client({ name: `mcp-permission-test-${userId}`, version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return { client, transport };
}

async function call(client, name, args) {
  return client.callTool({ name, arguments: args || {} });
}

async function main() {
  loadEnvFile();
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required in .env.");
  const url = process.env.MCP_TEST_URL || "http://localhost:4000/mcp";
  const { all, get } = require("../db");
  const { listMcpAuditLogs } = require("../services/mcp/audit");
  const users = await findTestUsers(all);
  const before = await get("SELECT COALESCE(MAX(id),0) id FROM mcp_tool_audit");
  const clients = [];

  try {
    const viewer = await createClient(url, secret, users.viewer.id);
    clients.push(viewer.transport);
    const viewerDashboard = await call(viewer.client, "get_dashboard_summary", { scope: "all" });
    assert(viewerDashboard.structuredContent?.ok === true, "Viewer must be able to call dashboard.");
    const viewerInventory = await call(viewer.client, "get_inventory_status", {
      category: "all", low_stock_only: false, limit: 50, offset: 0,
    });
    assert(viewerInventory.isError === true, "Viewer inventory call must fail.");
    assert(
      viewerInventory.structuredContent?.error?.code === "PERMISSION_DENIED",
      "Viewer inventory call must return PERMISSION_DENIED."
    );

    const engineer = await createClient(url, secret, users.engineer.id);
    clients.push(engineer.transport);
    for (const request of [
      ["get_lighting_summary", { category: "all" }],
      ["get_fault_summary", { category: "all", status: "all", age_bucket: "all" }],
      ["search_work_orders", { status: "all", category: "all", limit: 50 }],
    ]) {
      const result = await call(engineer.client, request[0], request[1]);
      assert(result.structuredContent?.ok === true, `Engineer must be able to call ${request[0]}.`);
    }
    const invalidWorkRange = await call(engineer.client, "search_work_orders", {
      status: "all",
      category: "all",
      date_from: "2025-01-01",
      date_to: "2026-12-31",
      limit: 50,
    });
    assert(
      invalidWorkRange.isError === true &&
      invalidWorkRange.structuredContent?.error?.code === "INVALID_PARAMETER",
      "Work order date ranges over 366 days must be rejected."
    );

    const hr = await createClient(url, secret, users.hr.id);
    clients.push(hr.transport);
    const attendance = await call(hr.client, "get_attendance_summary", {});
    assert(attendance.structuredContent?.ok === true, "HR must be able to call attendance.");

    const auditRows = await all(
      `SELECT user_id,tool_name,success,error_code
       FROM mcp_tool_audit WHERE id>? ORDER BY id`,
      [Number(before?.id || 0)]
    );
    assert(
      auditRows.some(row =>
        row.user_id === users.viewer.id &&
        row.tool_name === "get_dashboard_summary" &&
        row.success === 1
      ),
      "Successful viewer dashboard call was not audited."
    );
    assert(
      auditRows.some(row =>
        row.user_id === users.viewer.id &&
        row.tool_name === "get_inventory_status" &&
        row.success === 0 &&
        row.error_code === "PERMISSION_DENIED"
      ),
      "Denied viewer inventory call was not audited."
    );

    const today = new Date().toISOString().slice(0, 10);
    const validatedAuditRows = await listMcpAuditLogs({
      date_from: today,
      date_to: today,
      user_id: users.viewer.id,
      limit: 50,
      offset: 0,
    });
    assert(validatedAuditRows.length >= 2, "Validated audit query did not return expected rows.");

    let auditRangeRejected = false;
    try {
      await listMcpAuditLogs({ date_from: "2026-01-01", date_to: "2026-03-01" });
    } catch (error) {
      auditRangeRejected = error.code === "INVALID_PARAMETER";
    }
    assert(auditRangeRejected, "Audit log date ranges over 31 days must be rejected.");

    console.log(JSON.stringify({
      ok: true,
      users,
      assertions: {
        viewer_dashboard: "allowed",
        viewer_inventory: "denied",
        engineer_lighting_fault_work_orders: "allowed",
        work_order_date_range_validation: "passed",
        hr_attendance: "allowed",
        success_audit: "logged",
        denied_audit: "logged",
        audit_date_range_validation: "passed",
      },
    }, null, 2));
  } finally {
    for (const transport of clients) {
      await transport.close().catch(() => {});
    }
  }
}

main().catch(error => {
  console.error("[test:mcp:permissions]", error.message);
  process.exitCode = 1;
});
