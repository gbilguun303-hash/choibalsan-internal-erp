"use strict";
const express = require("express");
const { installMcpRoutes } = require("../services/mcp/server");

async function main() {
  const original = {
    MCP_PUBLIC_URL: process.env.MCP_PUBLIC_URL,
    MCP_OAUTH_ISSUER: process.env.MCP_OAUTH_ISSUER,
    MCP_OAUTH_SCOPES: process.env.MCP_OAUTH_SCOPES,
  };

  process.env.MCP_PUBLIC_URL = "https://erp.example.com/mcp";
  process.env.MCP_OAUTH_ISSUER = "https://auth.example.com/";
  process.env.MCP_OAUTH_SCOPES = "erp.read";

  const app = express();
  app.use(express.json());
  installMcpRoutes(app);
  const listener = await new Promise(resolve => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });

  try {
    const address = listener.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const metadataResponse = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
    const metadata = await metadataResponse.json();
    if (metadataResponse.status !== 200) throw new Error("OAuth metadata endpoint did not return 200.");
    if (metadata.resource !== "https://erp.example.com/mcp") throw new Error("OAuth resource is incorrect.");
    if (metadata.authorization_servers?.[0] !== "https://auth.example.com") {
      throw new Error("OAuth authorization server is incorrect.");
    }
    if (!metadata.scopes_supported?.includes("erp.read")) throw new Error("OAuth scope is missing.");

    const unauthorizedResponse = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    const challenge = unauthorizedResponse.headers.get("www-authenticate") || "";
    if (unauthorizedResponse.status !== 401) throw new Error("Unauthenticated MCP request did not return 401.");
    if (!challenge.includes("resource_metadata=")) throw new Error("OAuth metadata challenge is missing.");
    if (!challenge.includes('scope="erp.read"')) throw new Error("OAuth scope challenge is missing.");
    if (!challenge.includes('error="invalid_token"')) throw new Error("OAuth error challenge is missing.");

    console.log(JSON.stringify({
      ok: true,
      resource: metadata.resource,
      authorization_server: metadata.authorization_servers[0],
      scopes: metadata.scopes_supported,
      unauthenticated_status: unauthorizedResponse.status,
    }, null, 2));
  } finally {
    await new Promise((resolve, reject) => {
      listener.close(error => error ? reject(error) : resolve());
    });
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

main().catch(error => {
  console.error("[test:mcp:oauth]", error.message);
  process.exitCode = 1;
});
