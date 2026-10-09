import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function validateSigningCredentials(keyPem, certificatePem, now = Date.now()) {
  let key, certificate;
  try { key = createPrivateKey(keyPem); certificate = new X509Certificate(certificatePem); }
  catch { throw new Error('Invalid Windows shell signing credentials. Supply an unencrypted PEM private key and PEM certificate.'); }
  if (certificate.subject !== 'CN=Frame' || certificate.ca || !certificate.keyUsage?.includes('1.3.6.1.5.5.7.3.3')) throw new Error('Expected a non-CA Frame code-signing certificate.');
  if (now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)) throw new Error('The Windows shell signing certificate is expired or not valid yet.');
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048) throw new Error('The Windows shell signing key must be RSA with at least 2048 bits.');
  const publicKey = value => value.export({ type: 'spki', format: 'der' });
  if (!publicKey(createPublicKey(key)).equals(publicKey(certificate.publicKey))) throw new Error('The Windows shell private key does not match its certificate.');
  return certificate;
}

export async function prepareSigningSecrets({ keyPem, certificatePem, directory }) {
  if (!keyPem && !certificatePem) return false;
  if (!keyPem || !certificatePem) throw new Error('Set both FRAME_WINDOWS_SHELL_PRIVATE_KEY_PEM and FRAME_WINDOWS_SHELL_CERTIFICATE_PEM in GitHub Secrets.');
  validateSigningCredentials(keyPem, certificatePem);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  try {
    await writeFile(join(directory, 'private-key.pem'), keyPem, { mode: 0o600, flag: 'wx' });
    await writeFile(join(directory, 'certificate.pem'), certificatePem, { mode: 0o600, flag: 'wx' });
  } catch {
    await rm(directory, { recursive: true, force: true });
    throw new Error('Could not prepare temporary Windows shell signing files.');
  }
  return true;
}
