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
  # The Appx manifest reader does not validate the signature through Windows' SIP.
  $signature = Get-AuthenticodeSignature -LiteralPath $path
  Write-Output "Windows signature status: $($signature.Status)"
  Write-Output "Windows signature details: $($signature.StatusMessage)"
  if ($signature.Status -in @('HashMismatch', 'NotSigned')) { throw 'Windows rejected the package signature. Restore or rebuild the signed shell package.' }
  if (!$PSBoundParameters.ContainsKey('Package')) {
    $staged = Join-Path $PSScriptRoot '../build/generated/shell-actions/windows/FrameShell.msix'
    if (Test-Path -LiteralPath $staged) {
      $staged = (Resolve-Path -LiteralPath $staged).ProviderPath
      Write-Output "Desktop staged package: $staged"
      $stagedHash = (Get-FileHash -LiteralPath $staged -Algorithm SHA256).Hash
      Write-Output "Staged SHA-256: $stagedHash"
      if ($stagedHash -ne (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash) { throw 'Desktop staging differs from the committed package. Close Frame, stop the desktop dev command, restart pnpm desktop, and retry Repair actions.' }
      Write-Output "Windows staged-package reader accepted: $([FramePackageReader]::Validate($staged))"
    }
  }
} catch {
  Write-Output $_.Exception.Message
  exit 1
}
