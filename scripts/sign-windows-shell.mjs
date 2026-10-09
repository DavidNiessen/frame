// Deliberate maintainer command. Normal builds use the committed public certificate/package.
import { execFileSync } from 'node:child_process';
import { access, chmod, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash, X509Certificate } from 'node:crypto';
import { join, resolve } from 'node:path';
import { shellPackageFiles } from './windows-shell-assets.mjs';
import { sparseMsix } from './windows-shell-package.mjs';
import { readMsixArchive } from './msix-archive.mjs';
const secrets = resolve('.local/windows-shell-signing'), output = resolve('native/windows-shell/package');
await mkdir(secrets, { recursive: true, mode: 0o700 });
await chmod(secrets, 0o700);
await mkdir(output, { recursive: true });
const key = join(secrets, 'private-key.pem'), certificate = join(secrets, 'certificate.pem');
const openssl = process.env.FRAME_OPENSSL || 'openssl', signer = process.env.FRAME_OSSLSIGNCODE || 'osslsigncode';
let exists = true; try { await access(key); } catch { exists = false; }
if (!exists) {
  execFileSync(openssl, ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:3072', '-out', key], { stdio: 'ignore' });
  await chmod(key, 0o600);
  execFileSync(openssl, ['req', '-new', '-x509', '-key', key, '-out', certificate, '-days', '1825', '-sha256', '-subj', '/CN=Frame', '-addext', 'basicConstraints=critical,CA:FALSE', '-addext', 'keyUsage=critical,digitalSignature', '-addext', 'extendedKeyUsage=codeSigning'], { stdio: 'ignore' });
}
const cert = new X509Certificate(await readFile(certificate));
if (cert.subject !== 'CN=Frame' || cert.ca || !cert.keyUsage?.includes('1.3.6.1.5.5.7.3.3')) throw new Error('Expected a non-CA Frame code-signing certificate.');
const identity = JSON.parse(await readFile('native/windows-shell/identity.json'));
if (identity.publisher !== cert.subject) throw new Error('The certificate subject must match the shell package publisher.');
const files = await shellPackageFiles(identity, resolve('build/generated/windows-signing'));
const unsigned = join(secrets, 'unsigned.msix'), signed = join(secrets, 'signed.msix');
await writeFile(unsigned, sparseMsix(files));
await rm(signed, { force: true });
execFileSync(signer, ['sign', '-certs', certificate, '-key', key, '-h', 'sha256', '-in', unsigned, '-out', signed], { stdio: 'inherit' });
execFileSync(signer, ['verify', '-CAfile', certificate, '-in', signed], { stdio: 'inherit' });
const signedArchive = await readFile(signed);
readMsixArchive(signedArchive);
await writeFile(join(output, 'FrameShell.msix'), signedArchive);
await writeFile(join(output, 'Frame.cer'), cert.raw);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await writeFile(join(output, 'signature.json'), JSON.stringify({
  publisher: cert.subject, certificateSha256: digest(cert.raw), thumbprint: cert.fingerprint.replace(/:/g, ''),
  expiresAt: new Date(cert.validTo).toISOString(), packageSha256: digest(await readFile(signed)),
}, null, 2) + '\n');
console.log('Signed shell package and exported public certificate. Rebuild native binaries after changing the certificate; the private key remains in ignored .local/windows-shell-signing.');
