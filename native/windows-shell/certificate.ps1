function FrameCertificateInfo([string]$source, $identity) {
  if ($null -eq $identity.certificate) { return $null }
  $metadata = $identity.certificate
  $path = Join-Path $source 'Frame.cer'; $helper = Join-Path $source 'FrameCertificateHelper.exe'
  if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $metadata.certificateSha256 -or (Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ne $metadata.helperSha256 -or (Get-FileHash -LiteralPath (Join-Path $source 'FrameShell.msix') -Algorithm SHA256).Hash -ne $metadata.packageSha256) { throw 'The bundled certificate, signed package, or trust helper was modified. Rebuild or reinstall Frame.' }
  $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($path)
  try {
    if ($certificate.Thumbprint -ne $metadata.thumbprint -or $certificate.Subject -ne $metadata.publisher) { throw 'The bundled certificate does not match Frame.' }
    $valid = $certificate.NotBefore -le (Get-Date) -and $certificate.NotAfter -gt (Get-Date)
    $store = [Security.Cryptography.X509Certificates.X509Store]::new('TrustedPeople', 'LocalMachine')
    $trusted = $false
    try {
      $store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly -bor [Security.Cryptography.X509Certificates.OpenFlags]::OpenExistingOnly)
      $found = $store.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint, $certificate.Thumbprint, $false)
      $trusted = @($found | Where-Object { [Convert]::ToBase64String($_.RawData) -eq [Convert]::ToBase64String($certificate.RawData) }).Count -gt 0
    } catch [Security.Cryptography.CryptographicException] { $trusted = $false
    } finally { $store.Close(); $store.Dispose() }
    return @{ canTrust = $valid; trusted = $trusted; subject = $certificate.Subject; fingerprint = $metadata.certificateSha256; expiresAt = $metadata.expiresAt }
  } finally { $certificate.Dispose() }
}
function ChangeFrameCertificate([string]$source, [ValidateSet('trust', 'revoke')][string]$action) {
  # Elevate only the native helper. It accepts one action and pins the adjacent public certificate.
  # Package registration happens in the original user's non-elevated process afterwards.
  try {
    $process = Start-Process -FilePath (Join-Path $source 'FrameCertificateHelper.exe') -ArgumentList "--$action" -Verb RunAs -Wait -PassThru -ErrorAction Stop
  } catch {
    if ($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.InnerException.NativeErrorCode -eq 1223) { throw 'Administrator approval was cancelled. Certificate trust was not changed.' }
    throw
  }
  if ($process.ExitCode -ne 0) { throw "Frame could not $action its certificate (Windows error $($process.ExitCode)). Certificate trust was not changed." }
}
