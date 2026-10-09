$ErrorActionPreference = 'Stop'
$installer = Get-ChildItem 'release' -Filter '*.exe' | Where-Object { $_.Name -notlike '*Uninstall*' } | Select-Object -First 1
if ($null -eq $installer) { throw 'Build the Windows NSIS installer before testing shell integration.' }
$installDir = Join-Path $env:TEMP "Frame Shell Integration $([guid]::NewGuid())"
$extensions = Get-Content 'src/core/media-extensions.json' -Raw | ConvertFrom-Json
$root = 'HKCU:\Software\Classes\SystemFileAssociations'
$defaults = @{}
foreach ($extension in $extensions) {
  $association = Get-Item "HKCU:\Software\Classes\.$extension" -ErrorAction SilentlyContinue
  $defaults[$extension] = if ($null -eq $association) { $null } else { $association.GetValue('') }
}
try {
  $process = Start-Process -FilePath $installer.FullName -ArgumentList '/S', "/D=$installDir" -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Installer failed with exit code $($process.ExitCode)." }
  $executable = Join-Path $installDir 'Frame.exe'
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
  & npx playwright test --config playwright.electron.config.ts tests/electron/launch.spec.ts tests/electron/settings.spec.ts
  if ($LASTEXITCODE -ne 0) { throw 'Installed shell launch/settings tests failed.' }
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
  }
} finally {
  Remove-Item Env:FRAME_TEST_EXECUTABLE -ErrorAction SilentlyContinue
  Remove-Item Env:FRAME_TEST_SHELL_ACTIONS -ErrorAction SilentlyContinue
  $uninstaller = Join-Path $installDir 'Uninstall Frame.exe'
  if (Test-Path $uninstaller) {
    Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
      $remaining = @($extensions | Where-Object { Test-Path (Join-Path $root ".$_\shell\Frame.Convert") })
      if ($remaining.Count -eq 0) { break }
      Start-Sleep -Milliseconds 200
    }
    foreach ($extension in $extensions) {
      foreach ($workflow in @('Edit', 'Convert')) {
        if (Test-Path (Join-Path $root ".$extension\shell\Frame.$workflow")) { throw 'The uninstaller left context-menu entries behind.' }
      }
    }
  }
  Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
}
