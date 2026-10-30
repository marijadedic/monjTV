# Start monjTV from a Windows desktop shortcut. Same steps as scripts/start.sh:
# build the UI, replace a server already on the port, then open the remote.
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

function ListenerPids {
  $found = @()
  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  } catch {
    $conn = $null
  }
  if ($conn) {
    $found = @($conn | Select-Object -ExpandProperty OwningProcess -Unique)
  }
  if ($found.Count -eq 0) {
    $found = @(netstat -ano |
      Select-String -Pattern "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$" |
      ForEach-Object { $_.Matches[0].Groups[1].Value } |
      Select-Object -Unique)
  }
  return $found
}

function Stop-Server {
  if (-not (Healthy)) { return }
  $roots = @(ListenerPids | Where-Object { $_ })
  if ($roots.Count -eq 0) {
    Fail "monjTV is running on port $Port, but its process was not found."
  }
  $pids = [System.Collections.Generic.List[int]]::new()
  foreach ($procId in $roots) {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.ParentProcessId -eq [int]$procId } |
      ForEach-Object { [void]$pids.Add([int]$_.ProcessId) }
    [void]$pids.Add([int]$procId)
  }
  foreach ($procId in ($pids | Select-Object -Unique)) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
  for ($i = 0; $i -lt 40; $i++) {
    if (-not (Healthy)) { return }
    Start-Sleep -Milliseconds 250
  }
  Fail "monjTV on port $Port did not stop. See logs\monjtv.log in the monjTV folder."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Fail "npm was not found. Install Node.js, then run this shortcut again."
}
if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Fail "Run npm install in $Root first."
}

Add-Content -Path (Join-Path $Root "logs\monjtv.log") -Value "---- $(Get-Date) build ----"
npm run build *>> (Join-Path $Root "logs\monjtv.log")
if ($LASTEXITCODE -ne 0) {
  Fail "monjTV build failed. See logs\monjtv.log in the monjTV folder."
}

Stop-Server
$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = "cmd.exe"
$start.Arguments = "/c npm run start:server >> logs\monjtv.log 2>&1"
$start.WorkingDirectory = $Root
$start.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$start.CreateNoWindow = $true
$start.UseShellExecute = $false
[void][System.Diagnostics.Process]::Start($start)
for ($i = 0; $i -lt 60; $i++) {
  if (Healthy) { break }
  Start-Sleep -Milliseconds 500
}
if (-not (Healthy)) {
  Fail "monjTV did not start. See logs\monjtv.log in the monjTV folder."
}

Start-Process "http://127.0.0.1:${Port}/"
