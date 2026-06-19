"use strict";
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

let activeTransport = null;

function debug(message) {
  if (process.env.MCP_TEST_DEBUG === "1") console.error(`[test:mcp:debug] ${message}`);
}

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
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

async function main() {
  loadEnvFile();
  const url = process.env.MCP_TEST_URL || "http://localhost:4000/mcp";
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required in .env.");
  const userId = Number(process.env.MCP_TEST_USER_ID || 1);
  const token = process.env.MCP_TEST_TOKEN || jwt.sign({ id: userId }, secret, { expiresIn: "10m" });

  const client = new Client({ name: "choibalsan-erp-local-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  activeTransport = transport;

  debug("connecting");
  await client.connect(transport);
  debug("listing tools");
  const tools = await client.listTools();
  const names = tools.tools.map(tool => tool.name);
  const expected = [
    "get_dashboard_summary",
    "get_lighting_summary",
    "get_lighting_objects",
    "get_fault_summary",
    "search_work_orders",
    "get_inventory_status",
    "get_attendance_summary",
    "get_electricity_cost_summary",
    "draft_dev_request",
  ];
  for (const name of expected) {
    if (!names.includes(name)) throw new Error(`Missing tool: ${name}`);
  }
  for (const tool of tools.tools) {
    const schemes = tool.securitySchemes || tool._meta?.securitySchemes || [];
    const oauth = schemes.find(scheme => scheme.type === "oauth2");
    if (!oauth || !oauth.scopes?.includes("erp.read")) {
      throw new Error(`Missing OAuth security scheme: ${tool.name}`);
    }
  }

  debug("checking unauthenticated challenge");
  const unauthenticated = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  if (unauthenticated.status !== 401) {
    throw new Error(`Expected unauthenticated MCP request to return 401, got ${unauthenticated.status}.`);
  }
  const challenge = unauthenticated.headers.get("www-authenticate") || "";
  await unauthenticated.json();
  if (!challenge.includes("resource_metadata=") || !challenge.includes('scope="erp.read"')) {
    throw new Error("MCP 401 response is missing the OAuth resource metadata challenge.");
  }

  debug("calling dashboard");
  const dashboard = await client.callTool({
    name: "get_dashboard_summary",
    arguments: { scope: "all" },
  });
  const lighting = await client.callTool({
    name: "get_lighting_summary",
    arguments: { category: "all" },
  });
  const topFaultObjects = await client.callTool({
    name: "get_lighting_objects",
    arguments: { category: "road", limit: 10, offset: 0 },
  });
  const roadFaults = await client.callTool({
    name: "get_fault_summary",
    arguments: { category: "road", status: "all", age_bucket: "all" },
  });
  const ledInventory = await client.callTool({
    name: "get_inventory_status",
    arguments: { category: "LED", low_stock_only: false },
  });
  const electricity = await client.callTool({
    name: "get_electricity_cost_summary",
    arguments: {
      lamp_power_w: 150,
      count: 2582,
      annual_hours: 2271,
      tariff_mnt_per_kwh: 241,
      vat_percent: 10,
      include_capacity_charge: false,
    },
  });
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
  const workOrders = await client.callTool({
    name: "search_work_orders",
    arguments: { status: "open", category: "all", date_from: monthStart, date_to: monthEnd, limit: 20 },
  });

  debug("printing results");
  console.log(JSON.stringify({
    ok: true,
    tool_count: names.length,
    dashboard: dashboard.structuredContent,
    lighting: lighting.structuredContent,
    top_fault_objects: topFaultObjects.structuredContent,
    road_faults: roadFaults.structuredContent,
    led_inventory: ledInventory.structuredContent,
    electricity: electricity.structuredContent,
    current_month_open_work_orders: workOrders.structuredContent,
  }, null, 2));
  debug("closing transport");
  await transport.close();
  activeTransport = null;
  debug("done");
}

main().catch(async error => {
  if (activeTransport) {
    await activeTransport.close().catch(() => {});
    activeTransport = null;
  }
  console.error("[test:mcp]", error.message);
  process.exitCode = 1;
});
