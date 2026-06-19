"use strict";
const { McpToolError } = require("./errors");

const buckets = new Map();

function rateConfig() {
  return {
    max: Math.max(1, Number(process.env.MCP_RATE_LIMIT_MAX || 60)),
    windowMs: Math.max(1000, Number(process.env.MCP_RATE_LIMIT_WINDOW_MS || 60000)),
  };
}

function checkMcpToolRateLimit(user, ip) {
  const now = Date.now();
  const { max, windowMs } = rateConfig();
  const key = `${user?.id || "anonymous"}:${ip || ""}`;
  const bucket = buckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start >= windowMs) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  buckets.set(key, bucket);

  if (buckets.size > 2000) {
    for (const [bucketKey, value] of buckets) {
      if (now - value.start > windowMs * 2) buckets.delete(bucketKey);
    }
  }

  if (bucket.count > max) {
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - bucket.start)) / 1000));
    const error = new McpToolError("RATE_LIMITED", `Too many MCP tool calls. Retry after ${retryAfterSec} seconds.`, 429);
    error.retryAfterSec = retryAfterSec;
    throw error;
  }
  return { remaining: Math.max(0, max - bucket.count), max, windowMs };
}

module.exports = { checkMcpToolRateLimit, rateConfig };
