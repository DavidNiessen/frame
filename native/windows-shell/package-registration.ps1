# Keep this policy separate so tests can check it without modifying Windows settings.
function FramePackageMode([bool]$signed, [bool]$developerMode) {
  if ($signed) { return 'signed' }
  if ($developerMode) { return 'development' }
  throw 'Windows cannot register executable activations from an unsigned MSIX (0x80073D2B). For local builds, enable Developer Mode in Windows Settings, then choose Repair actions in Frame. Distributed installers require a trusted signed shell package. Running Frame as administrator does not fix this package restriction.'
}
function InstallFramePackage([ValidateSet('signed', 'development')][string]$mode, [string]$source, [string]$root) {
  if ($mode -eq 'signed') {
    Add-AppxPackage -Path (Join-Path $source 'FrameShell.msix') -ExternalLocation $root -ErrorAction Stop
  } else {
    # Persist registration files outside the checkout/install directory so rebuilds do not mutate them.
    Copy-Item -LiteralPath (Join-Path $source 'AppxManifest.xml') -Destination $root -Force
    Copy-Item -LiteralPath (Join-Path $source 'Assets') -Destination $root -Recurse -Force
    Add-AppxPackage -Register -Path (Join-Path $root 'AppxManifest.xml') -ExternalLocation $root -ErrorAction Stop
  }
}
function FrameDevelopmentFilesMatch([string]$source, [string]$root) {
  foreach ($name in @('AppxManifest.xml', 'Assets\StoreLogo.png', 'Assets\Logo44.png', 'Assets\Logo150.png')) {
    $target = Join-Path $root $name
    if (!(Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath (Join-Path $source $name)).Hash) { return $false }
  }
  return $true
}
