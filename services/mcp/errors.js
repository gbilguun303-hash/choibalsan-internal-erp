"use strict";

class McpToolError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
    this.status = status;
  }
}

function invalid(message) {
  throw new McpToolError("INVALID_PARAMETER", message, 400);
}

function denied(message = "This role cannot use the requested ERP tool.") {
  throw new McpToolError("PERMISSION_DENIED", message, 403);
}

function noData(message = "No matching ERP data was found.") {
  throw new McpToolError("NO_DATA_FOUND", message, 404);
}

function timeout(message = "The ERP query timed out.") {
  throw new McpToolError("TIMEOUT", message, 504);
}

function database(message = "The ERP database query failed.") {
  throw new McpToolError("DATABASE_ERROR", message, 500);
}

function errorPayload(error) {
  const known = error instanceof McpToolError;
  const payload = {
    ok: false,
    error: {
      code: known ? error.code : "DATABASE_ERROR",
      message: known ? error.message : "The ERP request could not be completed.",
    },
  };
  if (known && error.retryAfterSec) payload.error.retry_after_sec = error.retryAfterSec;
  return payload;
}

module.exports = { McpToolError, invalid, denied, noData, timeout, database, errorPayload };
