"use strict";
const crypto = require("crypto");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { isInitializeRequest } = require("@modelcontextprotocol/sdk/types.js");
const { mcpAuth, oauthScopes, canonicalMcpResource } = require("./auth");
const { assertToolPermission } = require("./permissions");
const { auditMcpCall } = require("./audit");
const { McpToolError, timeout, errorPayload } = require("./errors");
const { checkMcpToolRateLimit, rateConfig } = require("./rate-limit");
const { TOOL_SCHEMAS } = require("./tool-schemas");
const service = require("./erp-read-service");

const TOOL_HANDLERS = {
  get_dashboard_summary: service.getDashboardSummary,
  get_lighting_summary: service.getLightingSummary,
  get_lighting_objects: service.getLightingObjects,
  get_fault_summary: service.getFaultSummary,
  search_work_orders: service.searchWorkOrders,
  get_inventory_status: service.getInventoryStatus,
  get_attendance_summary: service.getAttendanceSummary,
  get_electricity_cost_summary: service.getElectricityCostSummary,
  draft_dev_request: service.draftDevRequest,
};

const SERVER_INSTRUCTIONS =
  "ERP-ийн бодит тоо, асалт, гэмтэл, агуулах, ажлын явц, ирц, цахилгааны зардал асуусан үед ERP MCP tools ашиглана. ERP дата байхгүй үед таамаглаж хэлэхгүй. Tool response дээр үндэслэж, Монгол хэлээр товч, хүснэгттэй, удирдлагын шийдвэрт ашиглах хэлбэрээр хариулна.";

function resultCount(data) {
  if (Array.isArray(data?.items)) return data.items.length;
  if (Array.isArray(data?.oldest_faults)) return data.oldest_faults.length;
  if (Array.isArray(data?.by_category)) return data.by_category.length;
  return data ? 1 : 0;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        try {
          timeout();
        } catch (error) {
          reject(error);
        }
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function createMcpServer(context) {
  const server = new McpServer(
    { name: "choibalsan-erp", version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS }
  );

  for (const [toolName, schema] of Object.entries(TOOL_SCHEMAS)) {
    server.registerTool(
      toolName,
      {
        ...schema,
        _meta: {
          ...(schema._meta || {}),
          securitySchemes: [{ type: "oauth2", scopes: oauthScopes() }],
        },
        annotations: {
          title: schema.title,
          readOnlyHint: true,
          openWorldHint: false,
          destructiveHint: false,
        },
      },
      async input => {
        const started = Date.now();
        let count = 0;
        try {
          checkMcpToolRateLimit(context.user, context.ip);
          assertToolPermission(context.user, toolName);
          const data = await withTimeout(
            TOOL_HANDLERS[toolName](input || {}, context.user),
            Number(process.env.MCP_TOOL_TIMEOUT_MS || 8000)
          );
          count = resultCount(data);
          await auditMcpCall({
            user: context.user,
            toolName,
            params: input,
            resultCount: count,
            success: true,
            ip: context.ip,
            sessionId: context.sessionId,
            durationMs: Date.now() - started,
          });
          const payload = { ok: true, data };
          return {
            structuredContent: payload,
            content: [{ type: "text", text: JSON.stringify(payload) }],
          };
        } catch (error) {
          const normalized = error instanceof McpToolError
            ? error
            : new McpToolError("DATABASE_ERROR", "The ERP database query failed.", 500);
          await auditMcpCall({
            user: context.user,
            toolName,
            params: input,
            resultCount: count,
            success: false,
            errorCode: normalized.code,
            ip: context.ip,
            sessionId: context.sessionId,
            durationMs: Date.now() - started,
          });
          const payload = errorPayload(normalized);
          return {
            isError: true,
            structuredContent: payload,
            content: [{ type: "text", text: JSON.stringify(payload) }],
          };
        }
      }
    );
  }
  return server;
}

function installMcpRoutes(app) {
  const transports = new Map();

  app.get("/mcp/health", async (_req, res) => {
    try {
      const { get } = require("../../db");
      await get("SELECT 1 ok");
      const rate = rateConfig();
      res.json({
        ok: true,
        service: "choibalsan-erp-mcp",
        version: "1.0.0",
        database: "ok",
        auth_mode: process.env.MCP_AUTH_MODE || "erp_jwt",
        read_only: true,
        rate_limit: { max: rate.max, window_ms: rate.windowMs },
      });
    } catch (_) {
      res.status(503).json({ ok: false, service: "choibalsan-erp-mcp", database: "error" });
    }
  });

  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    const resource = canonicalMcpResource();
    const issuer = String(process.env.MCP_OAUTH_ISSUER || "").replace(/\/+$/, "");
    if (!resource || !issuer) {
      return res.status(503).json({
        error: "OAUTH_NOT_CONFIGURED",
        message: "MCP_PUBLIC_URL and MCP_OAUTH_ISSUER are required.",
      });
    }
    res.json({
      resource,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: oauthScopes(),
      resource_documentation: process.env.MCP_RESOURCE_DOCUMENTATION_URL || undefined,
    });
  });

  app.use("/mcp", mcpAuth);

  app.post("/mcp", async (req, res) => {
    const sessionId = String(req.headers["mcp-session-id"] || "");
    try {
      let entry = sessionId ? transports.get(sessionId) : null;
      if (entry && entry.userId !== req.mcpUser.id) {
        return res.status(403).json({ error: "MCP_SESSION_USER_MISMATCH" });
      }
      if (entry) entry.context.user = req.mcpUser;
      if (!entry && !sessionId && isInitializeRequest(req.body)) {
        const context = {
          user: req.mcpUser,
          ip: req.ip,
          sessionId: req.mcpUser.session_id || "",
        };
        let transport;
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: id => {
            transports.set(id, { transport, userId: req.mcpUser.id, context });
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) transports.delete(transport.sessionId);
        };
        const server = createMcpServer(context);
        await server.connect(transport);
        return transport.handleRequest(req, res, req.body);
      }
      if (!entry) {
        return res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Invalid or missing MCP session." },
          id: null,
        });
      }
      return entry.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("[mcp post]", error.message);
      if (!res.headersSent) res.status(500).json({ error: "MCP_TRANSPORT_ERROR" });
    }
  });

  app.get("/mcp", async (req, res) => {
    const entry = transports.get(String(req.headers["mcp-session-id"] || ""));
    if (!entry) return res.status(400).send("Invalid or missing MCP session.");
    if (entry.userId !== req.mcpUser.id) return res.status(403).send("MCP session user mismatch.");
    return entry.transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const entry = transports.get(String(req.headers["mcp-session-id"] || ""));
    if (!entry) return res.status(400).send("Invalid or missing MCP session.");
    if (entry.userId !== req.mcpUser.id) return res.status(403).send("MCP session user mismatch.");
    return entry.transport.handleRequest(req, res);
  });
}

module.exports = { installMcpRoutes, createMcpServer, SERVER_INSTRUCTIONS };
