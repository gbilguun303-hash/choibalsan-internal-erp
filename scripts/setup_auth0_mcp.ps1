param(
  [string]$Tenant = ""
)

$ErrorActionPreference = "Stop"

$Auth0 = Join-Path $env:LOCALAPPDATA "Auth0CLI\auth0.exe"
$Audience = "https://choibalsan-hugjil.com/mcp"
$Claim = "https://choibalsan-hugjil.com/erp_user_id"
$ActionPath = Join-Path $PSScriptRoot "..\auth0\actions\add-erp-user-id.js"

if (!(Test-Path $Auth0)) {
  throw "Auth0 CLI is not installed."
}

$tenantArgs = @()
if ($Tenant) {
  $tenantArgs = @("--tenant", $Tenant)
}

function Invoke-Auth0Json {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  $output = & $Auth0 @Arguments @tenantArgs --no-input --no-color
  if ($LASTEXITCODE -ne 0) {
    throw "Auth0 CLI command failed: $($Arguments -join ' ')"
  }
  return ($output -join "`n") | ConvertFrom-Json
}

function Invoke-Auth0Api {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [object]$Payload = $null
  )

  if ($null -eq $Payload) {
    $output = & $Auth0 api $Method $Path @tenantArgs --no-input --no-color
  } else {
    $json = $Payload | ConvertTo-Json -Depth 12 -Compress
    $output = $json | & $Auth0 api $Method $Path @tenantArgs --no-input --no-color
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Auth0 Management API request failed: $Method $Path"
  }
  $text = $output -join "`n"
  if (!$text.Trim()) {
    return $null
  }
  return $text | ConvertFrom-Json
}

$tenantList = Invoke-Auth0Json -Arguments @("tenants", "list", "--json")
if (!$tenantList) {
  throw "No authenticated Auth0 tenant found. Run 'auth0 login' first."
}

$apis = Invoke-Auth0Json -Arguments @("apis", "list", "--json")
$api = $apis | Where-Object { $_.identifier -eq $Audience } | Select-Object -First 1
if (!$api) {
  $api = Invoke-Auth0Json -Arguments @(
    "apis", "create",
    "--name", "Choibalsan ERP MCP",
    "--identifier", $Audience,
    "--scopes", "erp.read",
    "--signing-alg", "RS256",
    "--token-dialect", "rfc9068_profile",
    "--token-lifetime", "3600",
    "--offline-access=false",
    "--json"
  )
}

$actionList = Invoke-Auth0Api -Method "get" -Path "actions/actions"
$action = $actionList.actions |
  Where-Object { $_.name -eq "Add ERP user id to MCP token" } |
  Select-Object -First 1
$code = Get-Content -LiteralPath $ActionPath -Raw
$actionPayload = @{
  name = "Add ERP user id to MCP token"
  supported_triggers = @(
    @{
      id = "post-login"
      version = "v3"
    }
  )
  code = $code
  runtime = "node22"
}

if (!$action) {
  $action = Invoke-Auth0Api -Method "post" -Path "actions/actions" -Payload $actionPayload
} else {
  $action = Invoke-Auth0Api -Method "patch" -Path "actions/actions/$($action.id)" -Payload $actionPayload
}

Invoke-Auth0Api -Method "post" -Path "actions/actions/$($action.id)/deploy" -Payload @{} | Out-Null

$bindingResponse = Invoke-Auth0Api -Method "get" -Path "actions/triggers/post-login/bindings"
$bindings = @($bindingResponse.bindings | Where-Object { $_.ref.value -ne $action.id })
$bindings += @{
  ref = @{
    type = "action_id"
    value = $action.id
  }
  display_name = "Add ERP user id to MCP token"
}
$bindingPayload = @{ bindings = $bindings }

Invoke-Auth0Api -Method "patch" -Path "actions/triggers/post-login/bindings" -Payload $bindingPayload | Out-Null

$activeTenant = $tenantList | Where-Object { $_.active } | Select-Object -First 1
if (!$activeTenant) {
  $activeTenant = $tenantList | Select-Object -First 1
}
$domain = if ($Tenant) { $Tenant } else { $activeTenant.domain }
if (!$domain) {
  $domain = $activeTenant.name
}
if (!$domain) {
  throw "Could not determine the Auth0 tenant domain."
}
$domain = $domain.TrimEnd("/")

Write-Output ""
Write-Output "Auth0 MCP provisioning complete."
Write-Output "Add app_metadata.erp_user_id to each allowed Auth0 user."
Write-Output ""
Write-Output "Set these values in .env:"
Write-Output "MCP_AUTH_MODE=oauth"
Write-Output "MCP_OAUTH_ISSUER=https://$domain/"
Write-Output "MCP_OAUTH_AUDIENCE=$Audience"
Write-Output "MCP_OAUTH_JWKS_URL=https://$domain/.well-known/jwks.json"
Write-Output "MCP_OAUTH_USER_ID_CLAIM=$Claim"
Write-Output "MCP_OAUTH_SCOPES=erp.read"
