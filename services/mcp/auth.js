"use strict";
const jwt = require("jsonwebtoken");
const { get } = require("../../db");

function oauthScopes() {
  return String(process.env.MCP_OAUTH_SCOPES || "erp.read")
    .split(/[\s,]+/)
    .map(scope => scope.trim())
    .filter(Boolean);
}

function canonicalMcpResource() {
  const configured = String(process.env.MCP_PUBLIC_URL || process.env.APP_URL || "").replace(/\/+$/, "");
  if (!configured) return "";
  return configured.endsWith("/mcp") ? configured : `${configured}/mcp`;
}

function protectedResourceMetadataUrl() {
  const resource = canonicalMcpResource();
  if (!resource) return "";
  return `${resource.slice(0, -4).replace(/\/+$/, "")}/.well-known/oauth-protected-resource`;
}

function oauthChallenge(error, description) {
  const parts = [];
  const metadata = protectedResourceMetadataUrl();
  const scopes = oauthScopes();
  if (metadata) parts.push(`resource_metadata="${metadata}"`);
  if (scopes.length) parts.push(`scope="${scopes.join(" ")}"`);
  if (error) parts.push(`error="${error}"`);
  if (description) {
    const safeDescription = String(description).replace(/["\\\r\n]/g, " ");
    parts.push(`error_description="${safeDescription}"`);
  }
  return `Bearer${parts.length ? ` ${parts.join(", ")}` : ""}`;
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required.");
  return secret;
}

function bearerToken(req) {
  const value = String(req.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function verifyExternalJwt(token) {
  const issuer = process.env.MCP_OAUTH_ISSUER;
  const audience = process.env.MCP_OAUTH_AUDIENCE;
  const jwksUrl = process.env.MCP_OAUTH_JWKS_URL;
  if (!issuer || !audience || !jwksUrl) {
    throw new Error("OAuth issuer, audience, and JWKS URL are required.");
  }

  const { createRemoteJWKSet, jwtVerify } = await import("jose");
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  const { payload } = await jwtVerify(token, jwks, { issuer, audience });
  const grantedScopes = new Set(
    Array.isArray(payload.scope)
      ? payload.scope
      : String(payload.scope || "").split(/\s+/).filter(Boolean)
  );
  for (const requiredScope of oauthScopes()) {
    if (!grantedScopes.has(requiredScope)) {
      const error = new Error(`Missing required OAuth scope: ${requiredScope}`);
      error.code = "INSUFFICIENT_SCOPE";
      throw error;
    }
  }
  const claim = process.env.MCP_OAUTH_USER_ID_CLAIM || "erp_user_id";
  const userId = Number(payload[claim]);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error(`OAuth claim ${claim} must contain a positive ERP user id.`);
  }
  return { userId, sessionId: String(payload.sid || payload.jti || "") };
}

async function resolveUser(token) {
  let identity = null;
  if ((process.env.MCP_AUTH_MODE || "erp_jwt") === "oauth") {
    identity = await verifyExternalJwt(token);
  } else {
    const payload = jwt.verify(token, jwtSecret());
    identity = { userId: Number(payload.id), sessionId: String(payload.sid || payload.jti || "") };
  }
  if (!identity?.userId) return null;

  const user = await get(
    `SELECT id,username,full_name,role,permissions,active,can_login
     FROM users WHERE id=? AND active=1 AND can_login=1`,
    [identity.userId]
  );
  return user ? { ...user, session_id: identity.sessionId } : null;
}

async function mcpAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    res.setHeader("WWW-Authenticate", oauthChallenge("invalid_token", "An access token is required."));
    return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
  }
  try {
    const user = await resolveUser(token);
    if (!user) throw new Error("User not found");
    req.mcpUser = user;
    next();
  } catch (error) {
    const insufficientScope = error?.code === "INSUFFICIENT_SCOPE";
    res.setHeader(
      "WWW-Authenticate",
      oauthChallenge(
        insufficientScope ? "insufficient_scope" : "invalid_token",
        insufficientScope ? error.message : "The access token is invalid or expired."
      )
    );
    return res.status(401).json({ error: insufficientScope ? "INSUFFICIENT_SCOPE" : "INVALID_TOKEN" });
  }
}

module.exports = {
  mcpAuth,
  resolveUser,
  oauthScopes,
  canonicalMcpResource,
  protectedResourceMetadataUrl,
  oauthChallenge,
};
