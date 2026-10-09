param([string]$Helper, [string]$Directory)
$ErrorActionPreference = 'Stop'
. $Helper
foreach ($name in @('package-registration.ps1', 'manage-menu.ps1')) {
  $tokens = $null; $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Split-Path $Helper) $name), [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count) { throw ($errors | Out-String) }
}
if ((FramePackageMode $true $false) -ne 'signed') { throw 'Signed packages must not require Developer Mode.' }
if ((FramePackageMode $true $true) -ne 'signed') { throw 'Always prefer a signed package when provided.' }
if ((FramePackageMode $false $true) -ne 'development') { throw 'Use manifest registration for local development.' }
$blocked = $false
try { FramePackageMode $false $false | Out-Null } catch {
  if ($_.Exception.Message -notmatch 'Developer Mode' -or $_.Exception.Message -notmatch 'administrator does not fix') { throw 'Missing actionable unsigned activation diagnostic.' }
  $blocked = $true
}
if (!$blocked) { throw 'Never attempt unsigned executable package deployment.' }

# Shadow Windows deployment: these tests only exercise policy, files, and parameter selection.
$script:calls = @()
function Add-AppxPackage {
  param([switch]$Register, [string]$Path, [string]$ExternalLocation, [string]$ErrorAction)
  $script:calls += @{ register = $Register.IsPresent; path = $Path; root = $ExternalLocation }
}
$source = Join-Path $Directory 'source'; $target = Join-Path $Directory 'target'
New-Item -ItemType Directory -Path (Join-Path $source 'Assets'), $target -Force | Out-Null
Set-Content -LiteralPath (Join-Path $source 'AppxManifest.xml') -Value '<Package />'
foreach ($name in @('StoreLogo.png', 'Logo44.png', 'Logo150.png')) { Set-Content -LiteralPath (Join-Path $source "Assets\$name") -Value "test $name" }
InstallFramePackage 'signed' $source $target
if ($script:calls.Count -ne 1 -or $script:calls[0].register -or $script:calls[0].path -ne (Join-Path $source 'FrameShell.msix')) { throw 'Signed packages must use normal package deployment.' }
if (Test-Path -LiteralPath (Join-Path $target 'AppxManifest.xml')) { throw 'Do not register loose files for signed packages.' }
InstallFramePackage 'development' $source $target
if (!$script:calls[1].register -or $script:calls[1].path -ne (Join-Path $target 'AppxManifest.xml') -or $script:calls[1].root -ne $target) { throw 'Development must register the persistent manifest and external location.' }
if (!(FrameDevelopmentFilesMatch $source $target)) { throw 'Development registration files were not copied.' }
Set-Content -LiteralPath (Join-Path $target 'Assets\Logo44.png') -Value 'damaged'
if (FrameDevelopmentFilesMatch $source $target) { throw 'Status must detect changed development assets.' }
InstallFramePackage 'development' $source $target
if (!(FrameDevelopmentFilesMatch $source $target)) { throw 'Repair must restore development files.' }
if (Test-Path -LiteralPath (Join-Path $target 'Assets\Assets')) { throw 'Repair must not nest Assets directories.' }
Remove-Item -LiteralPath (Join-Path $target 'AppxManifest.xml')
if (FrameDevelopmentFilesMatch $source $target) { throw 'Missing registration manifests require repair.' }
Write-Output 'Windows package registration policy and lifecycle checks passed.'
