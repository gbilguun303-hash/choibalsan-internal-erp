# ERP MCP Security Notes

## Release boundary

- All exposed tools are read-only and declare `readOnlyHint: true`.
- `draft_dev_request` returns text only. It does not insert into `assistant_dev_requests`.
- No write, delete, approval, payment, payroll, or salary transaction tool is registered.

## Authentication

- Local development can verify the ERP JWT with `MCP_AUTH_MODE=erp_jwt`.
- A ChatGPT private connector should use `MCP_AUTH_MODE=oauth` with an established OAuth 2.1/OIDC provider.
- OAuth tokens are checked for signature, issuer, audience, expiry, and the configured ERP user id claim.
- Every MCP request reloads the active ERP user from SQLite. Disabled users cannot use an existing token.
- Do not expose the production MCP endpoint without a strong, unique `JWT_SECRET`.
- `JWT_SECRET` has no source-code fallback and must be supplied through `.env`
  or a production secret manager.

## Authorization and privacy

- Role checks run inside every tool handler.
- `worker` is treated as the limited `viewer` role. `warehouse` maps to the existing `storekeeper` role.
- Attendance returns aggregate counts only.
- Inventory omits price, supplier, receiver, and transaction details.
- Tools never select register number, phone, salary, bank account, address, or private employee fields.

## Data minimization

- List tools have hard limits and bounded filters.
- List tools default to 50 rows and have a hard maximum of 200 rows.
- Attendance date ranges are limited to 31 days.
- Work order date ranges are limited to 366 days.
- MCP audit log date ranges are limited to 31 days.
- Tool results contain selected columns only, never raw table dumps.
- Capacity charges are not guessed. The calculator reports them as excluded.

## Audit and operations

- `mcp_tool_audit` records user, role, tool, redacted parameters, result count, outcome, IP, session id, and duration.
- Authorization headers and tokens are never stored.
- Put `/mcp` behind HTTPS, rate limiting, request-size limits, and production monitoring.
- The application also enforces a per-user/IP MCP tool-call rate limit.
- Consider restricting ingress to OpenAI connector egress ranges or validating OpenAI connector mTLS.
