// Deliberate maintainer command. Normal builds use the committed public certificate/package.
import { execFileSync } from 'node:child_process';
import { access, chmod, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { shellPackageFiles } from './windows-shell-assets.mjs';
import { readMsixArchive } from './msix-archive.mjs';
import { validateSigningCredentials } from './windows-signing-credentials.mjs';
const supplied = process.env.FRAME_WINDOWS_SHELL_SIGNING_DIR;
const secrets = resolve(supplied || '.local/windows-shell-signing'),
  output = resolve('native/windows-shell/package');
await mkdir(secrets, { recursive: true, mode: 0o700 });
await chmod(secrets, 0o700);
await mkdir(output, { recursive: true });
const key = join(secrets, 'private-key.pem'),
  certificate = join(secrets, 'certificate.pem');
const openssl = process.env.FRAME_OPENSSL || 'openssl',
  signer = process.env.FRAME_OSSLSIGNCODE || 'osslsigncode';
const packer = process.env.FRAME_MAKEMSIX || 'makemsix';
let exists = true;
try {
  await access(key);
} catch {
  exists = false;
}
if (!exists) {
  if (supplied)
    throw new Error(
      'The supplied Windows shell signing directory is missing its private key. CI never generates replacement credentials.',
    );
  execFileSync(
    openssl,
    ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:3072', '-out', key],
    { stdio: 'ignore' },
  );
  await chmod(key, 0o600);
  execFileSync(
    openssl,
    [
      'req',
      '-new',
      '-x509',
      '-key',
      key,
      '-out',
      certificate,
      '-days',
      '1825',
      '-sha256',
      '-subj',
      '/CN=Frame',
      '-addext',
      'basicConstraints=critical,CA:FALSE',
      '-addext',
      'keyUsage=critical,digitalSignature',
      '-addext',
      'extendedKeyUsage=codeSigning',
    ],
    { stdio: 'ignore' },
  );
}
const cert = validateSigningCredentials(await readFile(key), await readFile(certificate));
const identity = JSON.parse(await readFile('native/windows-shell/identity.json'));
if (identity.publisher !== cert.subject)
  throw new Error('The certificate subject must match the shell package publisher.');
// Use Microsoft's writer for ZIP layout, block compression and package metadata.
// A generic ZIP reader accepting a hand-built archive does not prove it is deployable.
const payload = resolve('build/generated/windows-signing');
await rm(payload, { recursive: true, force: true });
const files = await shellPackageFiles(identity, payload);
await writeFile(join(payload, 'AppxManifest.xml'), files['AppxManifest.xml']);
const unsigned = join(secrets, 'unsigned.msix'),
  signed = join(secrets, 'signed.msix');
await rm(unsigned, { force: true });
execFileSync(packer, ['pack', '-d', payload, '-p', unsigned], { stdio: 'inherit' });
await rm(signed, { force: true });
execFileSync(
  signer,
  ['sign', '-certs', certificate, '-key', key, '-h', 'sha256', '-in', unsigned, '-out', signed],
  { stdio: 'inherit' },
);
execFileSync(signer, ['verify', '-CAfile', certificate, '-in', signed], { stdio: 'inherit' });
const signedArchive = await readFile(signed);
readMsixArchive(signedArchive);
const verified = join(secrets, 'verified-package');
await rm(verified, { recursive: true, force: true });
try {
  // Allow this certificate's origin while preserving signature, digest and schema checks.
  execFileSync(packer, ['unpack', '-p', signed, '-d', verified, '-ac'], { stdio: 'inherit' });
} finally {
  await rm(verified, { recursive: true, force: true });
}
await writeFile(join(output, 'FrameShell.msix'), signedArchive);
await writeFile(join(output, 'Frame.cer'), cert.raw);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
await writeFile(
  join(output, 'signature.json'),
  JSON.stringify(
    {
      publisher: cert.subject,
      certificateSha256: digest(cert.raw),
      thumbprint: cert.fingerprint.replace(/:/g, ''),
      expiresAt: new Date(cert.validTo).toISOString(),
      packageSha256: digest(await readFile(signed)),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Signed shell package and exported public certificate. Rebuild native binaries before packaging; private signing files are never included in the output.',
);
