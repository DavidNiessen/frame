param([string]$Package = (Join-Path $PSScriptRoot '../native/windows-shell/package/FrameShell.msix'))
$ErrorActionPreference = 'Stop'
try {
  if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'This diagnostic needs Windows and its native Appx package reader.' }
  $path = (Resolve-Path -LiteralPath $Package).ProviderPath
  Write-Output "Package: $path"
  Write-Output "SHA-256: $((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash)"
  Add-Type -Path (Join-Path $PSScriptRoot 'windows-shell-reader.cs')
  $identity = [FramePackageReader]::Validate($path)
  Write-Output "Windows package reader accepted: $identity"
} catch {
  Write-Output $_.Exception.Message
  exit 1
}
