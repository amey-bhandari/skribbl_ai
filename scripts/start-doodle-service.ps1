$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$serviceSuffix = [IO.Path]::Combine("services", "doodle_classifier", "app.py")
$currentPid = $PID

$existingProcesses = Get-CimInstance Win32_Process |
  Where-Object {
    $_.ProcessId -ne $currentPid -and
    $_.CommandLine -and
    $_.CommandLine -like "*$serviceSuffix*"
  }

foreach ($process in $existingProcesses) {
  try {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    Write-Host "[doodle] stopped stale process $($process.ProcessId)"
  } catch {
    Write-Warning "[doodle] failed to stop stale process $($process.ProcessId): $($_.Exception.Message)"
  }
}

Set-Location $workspaceRoot
python services/doodle_classifier/app.py
