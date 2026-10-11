param([Parameter(Mandatory = $true)][string]$PlanPath)
$ErrorActionPreference = 'Stop'
# Frame must restart as the desktop GUI, even if the helper was invoked from a Node host.
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$plan = Get-Content -LiteralPath $PlanPath -Raw -Encoding UTF8 | ConvertFrom-Json
try {
  if ((Get-FileHash -LiteralPath $plan.source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $plan.checksum) { throw 'Installer checksum mismatch. Download the update again.' }
  [IO.File]::WriteAllText((Join-Path $plan.directory 'armed'), '')
  $parentProcess = Get-Process -Id $plan.parent -ErrorAction SilentlyContinue
  if ($null -ne $parentProcess) { Wait-Process -Id $plan.parent -Timeout 60 -ErrorAction Stop }
  if ((Get-FileHash -LiteralPath $plan.source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $plan.checksum) { throw 'Installer checksum mismatch. The update was not installed.' }
  # NSIS consumes /D through the end of the command line; it must be last and unquoted.
  # --updated preserves shortcuts. Relaunch as this user after NSIS completes, keeping their profile.
  $arguments = '/S --updated /D=' + $plan.target
  $installer = Start-Process -FilePath $plan.source -ArgumentList $arguments -Wait -PassThru
  if ($installer.ExitCode -ne 0) { throw "Frame update failed with exit code $($installer.ExitCode)." }
  Start-Process -FilePath (Join-Path $plan.target 'Frame.exe') -ArgumentList ('--updated "--user-data-dir=' + $plan.userData + '"')
  [IO.File]::WriteAllText((Join-Path $plan.directory 'complete'), '')
} catch {
  @{ error = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $plan.directory 'error.json') -Encoding UTF8
  @{ error = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $plan.userData 'update-install-error.json') -Encoding UTF8
  if ($null -eq (Get-Process -Id $plan.parent -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath (Join-Path $plan.target 'Frame.exe') -ArgumentList ('"--user-data-dir=' + $plan.userData + '"') -ErrorAction SilentlyContinue
  }
  exit 1
}
