param(
  [ValidateSet('Status', 'Install', 'Remove')][string]$Operation = 'Status',
  [string]$Executable,
  [switch]$JsonFromStdin
)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if ($JsonFromStdin) { $data = [Console]::In.ReadToEnd() | ConvertFrom-Json }
else { $data = @{ operation = $Operation; executable = $Executable; prefix = '"' + $Executable + '"' } }
$identity = Get-Content (Join-Path $PSScriptRoot 'identity.json') -Raw | ConvertFrom-Json
$base = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Frame\ShellActions'
$registry = [Microsoft.Win32.Registry]::CurrentUser
$settings = 'Software\Frame\ShellActions'
$state = 'not-installed'; $owned = $false; $detail = ''
$supported = [Environment]::OSVersion.Version.Build -ge 22000
if ($supported -and ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64')) { $supported = $false; $detail = 'The primary-menu extension currently supports x64 Windows 11. Classic entries remain available on this processor.' }
if (!$supported -and !$detail) { $detail = 'This Windows version uses the classic File Explorer context menu.' }

function ReadSetting([string]$name) {
  $key = $registry.OpenSubKey($settings)
  if ($null -eq $key) { return $null }
  try { return $key.GetValue($name) } finally { $key.Dispose() }
}
function ManagedRoot([string]$path) {
  if (!$path) { return $false }
  $full = [IO.Path]::GetFullPath($path)
  if (![string]::Equals([IO.Path]::GetDirectoryName($full), $base, [StringComparison]::OrdinalIgnoreCase)) { return $false }
  if ([IO.Path]::GetFileName($full) -notmatch '^[a-f0-9]{64}(-[a-f0-9]{8})?$') { return $false }
  if (Test-Path -LiteralPath $full) { return !((Get-Item -LiteralPath $full).Attributes -band [IO.FileAttributes]::ReparsePoint) }
  return $true
}
function OwnedPackage {
  $fullName = ReadSetting 'PrimaryPackage'
  if (!$fullName) { return $null }
  return Get-AppxPackage -Name $identity.name | Where-Object { $_.PackageFullName -eq $fullName } | Select-Object -First 1
}
function RefreshShell {
  Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class FramePrimaryShell { [DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, uint f, IntPtr a, IntPtr b); }'
  [FramePrimaryShell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
}
try {
  if ($supported) {
    $owned = (ReadSetting 'Executable') -eq $data.executable -and (ReadSetting 'CommandPrefix') -eq $data.prefix
    if ($data.operation -eq 'Install') {
      if (!(Test-Path -LiteralPath $data.executable -PathType Leaf)) { throw 'Frame executable is missing.' }
      New-Item -ItemType Directory -Path $base -Force | Out-Null
      if ((Get-Item -LiteralPath $base).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'The Frame shell component directory must not be a symbolic link.' }
      $hash = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'FrameShell.dll') -Algorithm SHA256).Hash.ToLowerInvariant()
      $root = Join-Path $base $hash
      if (!(ManagedRoot $root)) { throw 'The Frame shell component path is invalid.' }
      # Explorer can keep a DLL loaded. New builds use a new directory rather than replacing it.
      if ((Test-Path -LiteralPath (Join-Path $root 'FrameShell.dll')) -and (Get-FileHash -LiteralPath (Join-Path $root 'FrameShell.dll')).Hash.ToLowerInvariant() -ne $hash) { $root += '-' + [guid]::NewGuid().ToString('N').Substring(0, 8) }
      New-Item -ItemType Directory -Path $root -Force | Out-Null
      foreach ($name in @('FrameShell.dll', 'FrameShellLauncher.exe')) {
        $source = Join-Path $PSScriptRoot $name; $target = Join-Path $root $name
        if (!(Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $target).Hash) { Copy-Item -LiteralPath $source -Destination $target -Force }
      }
      $packageDigest = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'FrameShell.msix')).Hash
      $previousPackage = OwnedPackage
      $reuse = $null -ne $previousPackage -and (ReadSetting 'PrimaryRoot') -eq $root -and (ReadSetting 'PrimaryDigest') -eq $packageDigest -and $previousPackage.Status -eq 'Ok'
      if (!$reuse -and $null -ne $previousPackage) { Remove-AppxPackage -Package $previousPackage.PackageFullName -ErrorAction Stop }
      $key = $registry.CreateSubKey($settings)
      try {
        $key.SetValue('Executable', $data.executable); $key.SetValue('CommandPrefix', $data.prefix)
        $key.SetValue('PrimaryRoot', $root); $key.SetValue('PrimaryDigest', $packageDigest)
        $key.SetValue('Enabled', 1, [Microsoft.Win32.RegistryValueKind]::DWord)
      } finally { $key.Dispose() }
      $owned = $true
      if (!$reuse) {
        # This sparse package contains only manifest/images; the native code stays external.
        # Unsigned identity is explicitly separated by Microsoft's reserved publisher OID.
        $parameters = @{ Path = Join-Path $PSScriptRoot 'FrameShell.msix'; ExternalLocation = $root; ErrorAction = 'Stop' }
        if ($identity.publisher -match 'OID\.2\.25\.311729368913984317654407730594956997722=1') { $parameters.AllowUnsigned = $true }
        Add-AppxPackage @parameters
        $package = Get-AppxPackage -Name $identity.name | Where-Object { $_.Publisher -eq $identity.publisher } | Select-Object -First 1
        if ($null -eq $package) { throw 'Windows did not register the Frame shell package.' }
        $key = $registry.CreateSubKey($settings)
        try { $key.SetValue('PrimaryPackage', $package.PackageFullName); $key.DeleteValue('PrimaryError', $false) } finally { $key.Dispose() }
      }
      RefreshShell
    } elseif ($data.operation -eq 'Remove' -and $owned) {
      $key = $registry.CreateSubKey($settings)
      try { $key.SetValue('Enabled', 0, [Microsoft.Win32.RegistryValueKind]::DWord) } finally { $key.Dispose() }
      $package = OwnedPackage
      if ($null -ne $package) { Remove-AppxPackage -Package $package.PackageFullName -ErrorAction Stop }
      $key = $registry.CreateSubKey($settings)
      try { foreach ($name in @('PrimaryPackage', 'PrimaryRoot', 'PrimaryDigest', 'PrimaryError', 'Executable', 'CommandPrefix')) { $key.DeleteValue($name, $false) } } finally { $key.Dispose() }
      # Remove only component directories owned by Frame; locked previous DLLs can be cleaned later.
      if (Test-Path -LiteralPath $base) { foreach ($folder in Get-ChildItem -LiteralPath $base -Directory) { if (ManagedRoot $folder.FullName) { Remove-Item -LiteralPath $folder.FullName -Recurse -Force -ErrorAction SilentlyContinue } } }
      RefreshShell; $owned = $false
    }
    if ($owned) {
      $root = ReadSetting 'PrimaryRoot'; $package = OwnedPackage
      $complete = $null -ne $package -and $package.Status -eq 'Ok' -and (ManagedRoot $root) -and (ReadSetting 'Enabled') -eq 1 -and (ReadSetting 'PrimaryDigest') -eq (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'FrameShell.msix')).Hash
      if ($complete) { foreach ($name in @('FrameShell.dll', 'FrameShellLauncher.exe')) { $target = Join-Path $root $name; if (!(Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name)).Hash) { $complete = $false } } }
      $state = if ($complete) { 'installed' } else { 'partial' }
      $detail = if ($complete) { 'Windows 11 primary menu installed. Look for Frame, Edit in Frame, or Convert in Frame. Classic entries also remain under Show more options. Restart File Explorer if it has not refreshed.' } else { 'Windows 11 primary menu needs repair. ' + (ReadSetting 'PrimaryError') }
    } else { $detail = 'Install actions to add Frame to the Windows 11 primary menu and Show more options.' }
  }
} catch {
  $state = 'partial'
  $detail = 'Windows could not register or remove the primary-menu extension: ' + $_.Exception.Message + ' Classic entries remain independently available. Windows policy may require administrator approval for unsigned packages.'
  if ($data.operation -ne 'Status') { $key = $registry.CreateSubKey($settings); try { $key.SetValue('PrimaryError', $detail) } finally { $key.Dispose() } }
}
@{ supported = $supported; owned = $owned; state = $state; detail = $detail } | ConvertTo-Json -Compress
if ($supported -and $data.operation -eq 'Install' -and $state -ne 'installed') { exit 1 }
if ($supported -and $data.operation -eq 'Remove' -and $state -eq 'partial') { exit 1 }
