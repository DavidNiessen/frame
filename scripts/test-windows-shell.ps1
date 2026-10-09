$ErrorActionPreference = 'Stop'
$installer = Get-ChildItem 'release' -Filter '*.exe' | Where-Object { $_.Name -notlike '*Uninstall*' } | Select-Object -First 1
if ($null -eq $installer) { throw 'Build the Windows NSIS installer before testing shell integration.' }
$installDir = Join-Path $env:TEMP "Frame Shell Integration $([guid]::NewGuid())"
$extensions = Get-Content 'src/core/media-extensions.json' -Raw | ConvertFrom-Json
$root = 'HKCU:\Software\Classes\SystemFileAssociations'
$primarySupported = [Environment]::OSVersion.Version.Build -ge 22000 -and $env:PROCESSOR_ARCHITECTURE -ne 'ARM64' -and $env:PROCESSOR_ARCHITEW6432 -ne 'ARM64'
$identity = Get-Content 'native/windows-shell/identity.json' -Raw | ConvertFrom-Json
$signature = Get-Content 'native/windows-shell/package/signature.json' -Raw | ConvertFrom-Json
$certificatePath = Join-Path (Get-Location) 'native/windows-shell/package/Frame.cer'
$certificateWasTrusted = Test-Path "Cert:\LocalMachine\TrustedPeople\$($signature.thumbprint)"
$helperRoot = Join-Path $env:TEMP "Frame Certificate Test $([guid]::NewGuid())"
function CertificateHelper([string]$action) {
  $process = Start-Process -FilePath (Join-Path $helperRoot 'FrameCertificateHelper.exe') -ArgumentList "--$action" -Wait -PassThru
  return $process.ExitCode
}
function AssertPrimaryMenu([bool]$installed) {
  if (!$primarySupported) { return }
  $key = Get-Item 'HKCU:\Software\Frame\ShellActions' -ErrorAction SilentlyContinue
  $fullName = if ($null -ne $key) { $key.GetValue('PrimaryPackage') } else { $null }
  $package = Get-AppxPackage -Name $identity.name
  if ($installed) {
    if ($null -eq $key) { throw 'Windows 11 primary-menu settings are missing.' }
    if (!$fullName -or $null -eq $package -or $package.PackageFullName -ne $fullName -or $package.Status -ne 'Ok') { throw "Windows 11 primary-menu package is not registered: $($key.GetValue('PrimaryError'))" }
    if ($key.GetValue('PrimaryMode') -ne 'signed' -or $package.IsDevelopmentMode) { throw 'Primary-menu tests must use signed deployment without Developer Mode.' }
    foreach ($name in @('FrameShell.dll', 'FrameShellLauncher.exe')) {
      if (!(Test-Path -LiteralPath (Join-Path ($key.GetValue('PrimaryRoot')) $name))) { throw "Missing native shell component $name." }
    }
  } elseif ($fullName -or $null -ne $package) { throw 'Primary-menu registration remains after removal.' }
}
$defaults = @{}
foreach ($extension in $extensions) {
  $association = Get-Item "HKCU:\Software\Classes\.$extension" -ErrorAction SilentlyContinue
  $defaults[$extension] = if ($null -eq $association) { $null } else { $association.GetValue('') }
}
try {
  if ($primarySupported) {
    $developer = Get-ItemPropertyValue -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name AllowDevelopmentWithoutDevLicense -ErrorAction SilentlyContinue
    if ($developer -eq 1) { throw 'Run these signing tests with Developer Mode disabled. This script does not change Windows policy.' }
    if ((Get-FileHash -LiteralPath $certificatePath).Hash -ne $signature.certificateSha256) { throw 'Unexpected Frame certificate.' }
    New-Item -ItemType Directory -Path $helperRoot | Out-Null
    Copy-Item -LiteralPath 'build/generated/shell-actions/windows/FrameCertificateHelper.exe' -Destination $helperRoot
    $changed = [IO.File]::ReadAllBytes($certificatePath); $changed[$changed.Length - 1] = $changed[$changed.Length - 1] -bxor 1
    [IO.File]::WriteAllBytes((Join-Path $helperRoot 'Frame.cer'), $changed)
    if ((CertificateHelper 'trust') -ne 13) { throw 'The trust helper must reject an altered certificate.' }
    Copy-Item -LiteralPath $certificatePath -Destination (Join-Path $helperRoot 'Frame.cer') -Force
    if ((CertificateHelper 'trust') -ne 0 -or !(Test-Path "Cert:\LocalMachine\TrustedPeople\$($signature.thumbprint)")) { throw 'The pinned certificate helper did not trust Frame.' }
  }
  $process = Start-Process -FilePath $installer.FullName -ArgumentList '/S', "/D=$installDir" -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Installer failed with exit code $($process.ExitCode)." }
  $executable = Join-Path $installDir 'Frame.exe'
  AssertPrimaryMenu $true
  foreach ($extension in $extensions) {
    $association = Get-Item "HKCU:\Software\Classes\.$extension" -ErrorAction SilentlyContinue
    $value = if ($null -eq $association) { $null } else { $association.GetValue('') }
    if ($value -ne $defaults[$extension]) { throw 'Frame changed the default file association.' }
    foreach ($workflow in @('Edit', 'Convert')) {
      $key = Join-Path $root ".$extension\shell\Frame.$workflow"
      if ((Get-Item $key).GetValue('') -ne "$workflow in Frame") { throw "Missing $workflow menu label for .$extension" }
      if ((Get-Item $key).GetValue('MultiSelectModel') -ne 'Player') { throw 'Context menu must support multiple selections.' }
      $expected = '"' + $executable + '" --frame-workflow=' + $workflow.ToLowerInvariant() + ' -- "%1"'
      if ((Get-Item (Join-Path $key 'command')).GetValue('') -ne $expected) { throw "Incorrect launch command for .$extension" }
    }
  }
  $env:FRAME_TEST_EXECUTABLE = $executable
  $env:FRAME_TEST_SHELL_ACTIONS = '1'
  if ($primarySupported) { $env:FRAME_TEST_PRIMARY_MENU = '1' }
  & npx playwright test --config playwright.electron.config.ts tests/electron/launch.spec.ts tests/electron/settings.spec.ts
  if ($LASTEXITCODE -ne 0) { throw 'Installed shell launch/settings tests failed.' }
  Remove-Item Env:FRAME_TEST_EXECUTABLE
  & npx playwright test --config playwright.electron.config.ts tests/electron/settings.spec.ts tests/electron/launch.spec.ts --grep 'manages file-manager|cold-starts a development'
  if ($LASTEXITCODE -ne 0) { throw 'Development file-manager tests failed.' }
  # Restore installer ownership after the development checkout registered its commands.
  $process = Start-Process -FilePath $installer.FullName -ArgumentList '/S', '/FRAMECONTEXTMENU', "/D=$installDir" -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw 'Could not restore installed context-menu commands.' }
  foreach ($mode in @('opt-out', 'remember', 'opt-in')) {
    $arguments = @('/S')
    if ($mode -eq 'opt-out') { $arguments += '/NOFRAMECONTEXTMENU' }
    if ($mode -eq 'opt-in') { $arguments += '/FRAMECONTEXTMENU' }
    $arguments += "/D=$installDir"
    $process = Start-Process -FilePath $installer.FullName -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installer failed during $mode." }
    foreach ($extension in $extensions) {
      foreach ($workflow in @('Edit', 'Convert')) {
        $exists = Test-Path (Join-Path $root ".$extension\shell\Frame.$workflow")
        if ($exists -ne ($mode -eq 'opt-in')) { throw "Incorrect context-menu registration during $mode for .$extension." }
      }
    }
    $expectedPreference = if ($mode -eq 'opt-in') { 1 } else { 0 }
    if ((Get-Item 'HKCU:\Software\Frame\ShellActions').GetValue('Enabled') -ne $expectedPreference) { throw "Incorrect remembered preference during $mode." }
    AssertPrimaryMenu ($mode -eq 'opt-in')
  }
} finally {
  Remove-Item Env:FRAME_TEST_EXECUTABLE -ErrorAction SilentlyContinue
  Remove-Item Env:FRAME_TEST_SHELL_ACTIONS -ErrorAction SilentlyContinue
  Remove-Item Env:FRAME_TEST_PRIMARY_MENU -ErrorAction SilentlyContinue
  $uninstaller = Join-Path $installDir 'Uninstall Frame.exe'
  if (Test-Path $uninstaller) {
    Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
      $remaining = @($extensions | Where-Object { Test-Path (Join-Path $root ".$_\shell\Frame.Convert") })
      $primaryRemaining = $primarySupported -and $null -ne (Get-AppxPackage -Name $identity.name)
      if ($remaining.Count -eq 0 -and !$primaryRemaining) { break }
      Start-Sleep -Milliseconds 200
    }
    foreach ($extension in $extensions) {
      foreach ($workflow in @('Edit', 'Convert')) {
        if (Test-Path (Join-Path $root ".$extension\shell\Frame.$workflow")) { throw 'The uninstaller left context-menu entries behind.' }
      }
    }
    AssertPrimaryMenu $false
  }
  Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
  if ($primarySupported -and !$certificateWasTrusted -and (Test-Path (Join-Path $helperRoot 'FrameCertificateHelper.exe'))) {
    # A failed tampering test can leave the rejected certificate in the helper directory.
    Copy-Item -LiteralPath $certificatePath -Destination (Join-Path $helperRoot 'Frame.cer') -Force
    if ((CertificateHelper 'revoke') -ne 0 -or (Test-Path "Cert:\LocalMachine\TrustedPeople\$($signature.thumbprint)")) { throw 'The pinned helper did not remove its certificate.' }
  }
  Remove-Item $helperRoot -Recurse -Force -ErrorAction SilentlyContinue
}
