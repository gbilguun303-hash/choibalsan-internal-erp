# Чойбалсан хөгжил — Дотоод ажил, тайлан, төлөвлөгөөний систем

## 1. Суулгах
```bash
npm install
npm start
```

## 2. Нээх
Сервер компьютер дээр:
```text
http://localhost:4000
```

Бусад компьютерээс:
```text
http://СЕРВЕРИЙН-IP:4000
```

Жишээ:
```text
http://192.168.8.100:4000
```

## 3. Эхний хэрэглэгчид
Default password source code-д байхгүй. Empty database дээр анхны хэрэглэгч
үүсгэхдээ `.env` дотор `INITIAL_USER_PASSWORD`-ийг 12-оос дээш тэмдэгттэй
түр нууц үгээр тохируулж, анхны нэвтрэлтийн дараа хэрэглэгч бүрийн нууц үгийг
солино.

## 4. Орсон боломжууд
- Username/code login
- Эрхийн ялгаа
- Ажлын явц бүртгэл
- Зураг upload хийхэд browser дээр автоматаар тамга тавина
- Материал орлого/зарлага
- Зардал
- Хүний нөөц: амралт, чөлөө, өвчтэй, тасалсан, сургалт
- Ирсэн/явсан бичиг, захирлын үүрэг, иргэдийн санал гомдол
- ХАБЭА эрсдэлийн бүртгэл
- Сарын/жилийн тайлан
- 2026 датагаас 2027 төлөвлөгөөний санал
- Audit log

## 5. Нууцлал
Регистр, утас, хаяг хадгалагдаж байгаа тул зөвхөн байгууллагын дотоод сүлжээнд ашиглана.
`JWT_SECRET` болон бусад нууцыг зөвхөн `.env` эсвэл production secret manager-д хадгална.
# ChatGPT Private MCP Connector

The ERP exposes a read-only Streamable HTTP MCP endpoint at:

```text
https://your-erp-host.example.com/mcp
```

Tools: `get_dashboard_summary`, `get_lighting_summary`, `get_lighting_objects`,
`get_fault_summary`, `search_work_orders`, `get_inventory_status`,
`get_attendance_summary`, `get_electricity_cost_summary`, and
`draft_dev_request`. The last tool creates text only and never writes to ERP.

## MCP Local Setup

1. Add the MCP values from `.env.example` to `.env`.
2. Run `npm install`, then `npm start`.
3. Set `MCP_TEST_USER_ID` to an active ERP user id.
4. Run `npm run test:mcp`.

Local mode accepts the existing ERP JWT:

```env
MCP_AUTH_MODE=erp_jwt
```

## MCP Production Setup

Production ChatGPT connectors should use OAuth 2.1/OIDC:

```env
MCP_AUTH_MODE=oauth
MCP_OAUTH_ISSUER=https://your-auth-provider.example.com/
MCP_OAUTH_AUDIENCE=https://erp.example.com/mcp
MCP_OAUTH_JWKS_URL=https://your-auth-provider.example.com/.well-known/jwks.json
MCP_OAUTH_USER_ID_CLAIM=https://erp.example.com/erp_user_id
MCP_OAUTH_SCOPES=erp.read
```

Configuration:

- `MCP_OAUTH_ISSUER`: OAuth/OIDC authorization server issuer. It must exactly
  match the token `iss` claim.
- `MCP_OAUTH_AUDIENCE`: MCP resource identifier. It must match the token `aud`
  claim, normally `https://erp.example.com/mcp`.
- `MCP_OAUTH_JWKS_URL`: HTTPS JWKS endpoint containing the public signing keys.
- `MCP_OAUTH_USER_ID_CLAIM`: Access-token claim containing the numeric ERP
  `users.id`. Default: `erp_user_id`.
- `MCP_OAUTH_SCOPES`: Space- or comma-separated scopes required on every MCP
  access token. Default: `erp.read`.
- `MCP_PUBLIC_URL`: Public HTTPS MCP URL used in OAuth protected-resource
  metadata.

The MCP server verifies token signature, issuer, audience, expiry, and the ERP
user-id claim. It then reloads the user from SQLite and uses the database role;
it never trusts a role supplied in the access token.

### Role Mapping

| OAuth ERP user role | Effective MCP role | Access |
| --- | --- | --- |
| `director` | `director` | All read-only summaries |
| `chief_engineer`, `engineer`, `electric` | `engineer` | Lighting, faults, work orders, inventory |
| `hr` | `hr` | Dashboard and attendance summary |
| `storekeeper`, `warehouse` | `storekeeper` | Dashboard and inventory |
| `worker`, `viewer` | `viewer` | Public dashboard summary only |

### Production Commands

Install and start:

```bash
npm ci --omit=dev
npm start
```

Health check:

```bash
curl https://erp.example.com/mcp/health
```

Local MCP test:

```bash
npm run test:mcp
```

Permission and audit integration test:

```bash
npm run test:mcp:permissions
```

OAuth discovery and challenge test:

```bash
npm run test:mcp:oauth
```

Expose `/mcp` through HTTPS, then add that URL as a connector in ChatGPT
developer mode. Configure the identity provider to issue an access token with
the configured audience and numeric ERP user-id claim.

Before creating the connector, confirm that the authorization server:

- publishes OAuth or OIDC discovery metadata;
- supports authorization code flow with PKCE `S256`;
- supports CIMD, DCR, or a predefined ChatGPT OAuth client;
- allows the ChatGPT callback URL shown in the connector management page;
- copies the requested MCP `resource` into the access-token `aud` claim;
- includes the numeric ERP user-id claim and the `erp.read` scope.

Keep the connector private in developer mode until the permission, audit, and
OAuth tests pass against the production identity provider.

### Current Private Connector Endpoint

The deployed MCP resource URL is:

```text
https://choibalsan-hugjil.com/mcp
```

Health check:

```text
https://choibalsan-hugjil.com/mcp/health
```

The Cloudflare tunnel and MCP endpoint are live. Before creating the ChatGPT
connector, configure an OAuth provider and set these production values:

```env
MCP_AUTH_MODE=oauth
MCP_OAUTH_ISSUER=https://<auth0-tenant>/
MCP_OAUTH_AUDIENCE=https://choibalsan-hugjil.com/mcp
MCP_OAUTH_JWKS_URL=https://<auth0-tenant>/.well-known/jwks.json
MCP_OAUTH_USER_ID_CLAIM=https://choibalsan-hugjil.com/erp_user_id
MCP_OAUTH_SCOPES=erp.read
```

In the identity provider, configure authorization code with PKCE `S256`,
enable the `erp.read` scope, add the numeric `erp_user_id` claim to access
tokens, and allow the ChatGPT callback URL displayed during connector setup.

For Auth0, authenticate the CLI and provision the API plus post-login Action:

```powershell
auth0 login
powershell -ExecutionPolicy Bypass -File scripts\setup_auth0_mcp.ps1
```

For every allowed Auth0 user, set `app_metadata.erp_user_id` to the matching
numeric ERP `users.id`. The Action denies MCP token issuance when that mapping
is missing or invalid.

Recommended Project instruction:

> ERP-ийн бодит тоо, асалт, гэмтэл, агуулах, ажлын явц, ирц, цахилгааны зардал асуусан үед ERP MCP tools ашиглана. ERP дата байхгүй үед таамаглаж хэлэхгүй. Tool response дээр үндэслэж, Монгол хэлээр товч, хүснэгттэй, удирдлагын шийдвэрт ашиглах хэлбэрээр хариулна.

See `docs/mcp-security.md` for the production security checklist.
