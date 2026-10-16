# Start monjTV from a Windows desktop shortcut. Same steps as scripts/start.sh.
param(
  [string]$NodeDir = ""
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show($Message, "monjTV")
  } catch {
    Write-Error $Message
  }
  exit 1
}

if ($NodeDir) {
  $env:Path = "$NodeDir;$env:Path"
}

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs") | Out-Null
$Port = if ($env:PORT) { $env:PORT } else { "3000" }

function Healthy {
  if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    & curl.exe -sf "http://127.0.0.1:${Port}/api/health" *> $null
    return $LASTEXITCODE -eq 0
  }
  try {
    $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Healthy)) {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail "npm was not found. Install Node.js, then run this shortcut again."
  }
  if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Fail "Run npm install in $Root first."
  }
  if (-not (Test-Path (Join-Path $Root "dist\client\index.html"))) {
    & cmd.exe /c "npm run build >> logs\monjtv.log 2>&1"
    if ($LASTEXITCODE -ne 0) {
      Fail "npm run build failed. See logs\monjtv.log in the monjTV folder."
    }
  }
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = "cmd.exe"
  $start.Arguments = "/c npm start >> logs\monjtv.log 2>&1"
  $start.WorkingDirectory = $Root
  $start.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $start.CreateNoWindow = $true
  $start.UseShellExecute = $false
  [void][System.Diagnostics.Process]::Start($start)
  for ($i = 0; $i -lt 40; $i++) {
    if (Healthy) { break }
    Start-Sleep -Milliseconds 250
  }
}

Start-Process "http://127.0.0.1:${Port}/"
if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
  & curl.exe -sf -X POST "http://127.0.0.1:${Port}/api/player/start" *> $null
} else {
  try {
    Invoke-WebRequest -UseBasicParsing -Method POST "http://127.0.0.1:$Port/api/player/start" -TimeoutSec 5 | Out-Null
  } catch {
    # The remote is open either way. Start TV on Today starts mpv when this post missed.
  }
}
