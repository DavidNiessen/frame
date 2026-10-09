# Keep this policy separate so tests can check it without modifying Windows settings.
function FramePackageMode([bool]$signed, [bool]$developerMode) {
  if ($signed) { return 'signed' }
  if ($developerMode) { return 'development' }
  throw 'Windows cannot register executable activations from an unsigned MSIX (0x80073D2B). For local builds, enable Developer Mode in Windows Settings, then choose Repair actions in Frame. Distributed installers require a trusted signed shell package. Running Frame as administrator does not fix this package restriction.'
}
function InstallFramePackage([ValidateSet('signed', 'development')][string]$mode, [string]$source, [string]$root) {
  # Sparse-package visual paths resolve under ExternalLocation, even for signed MSIX.
  CopyFrameAssets $source $root
  if ($mode -eq 'signed') {
    Add-AppxPackage -Path (Join-Path $source 'FrameShell.msix') -ExternalLocation $root -ErrorAction Stop
  } else {
    # Persist registration files outside the checkout/install directory so rebuilds do not mutate them.
    Copy-Item -LiteralPath (Join-Path $source 'AppxManifest.xml') -Destination $root -Force
    Add-AppxPackage -Register -Path (Join-Path $root 'AppxManifest.xml') -ExternalLocation $root -ErrorAction Stop
  }
}
function CopyFrameAssets([string]$source, [string]$root) {
  New-Item -ItemType Directory -Path (Join-Path $root 'Assets') -Force | Out-Null
  foreach ($name in @('StoreLogo.png', 'Logo44.png', 'Logo150.png')) {
    Copy-Item -LiteralPath (Join-Path $source "Assets\$name") -Destination (Join-Path $root "Assets\$name") -Force
  }
}
function FrameAssetsMatch([string]$source, [string]$root) {
  foreach ($name in @('StoreLogo.png', 'Logo44.png', 'Logo150.png')) {
    $target = Join-Path $root "Assets\$name"
    if (!(Test-Path -LiteralPath $target -PathType Leaf) -or (Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath (Join-Path $source "Assets\$name")).Hash) { return $false }
  }
  return $true
}
function FrameDevelopmentFilesMatch([string]$source, [string]$root) {
  $target = Join-Path $root 'AppxManifest.xml'
  return (Test-Path -LiteralPath $target -PathType Leaf) -and (Get-FileHash -LiteralPath $target).Hash -eq (Get-FileHash -LiteralPath (Join-Path $source 'AppxManifest.xml')).Hash -and (FrameAssetsMatch $source $root)
}
