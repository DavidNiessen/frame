import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, stat, rm, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareSigningSecrets, validateSigningCredentials } from '../../scripts/windows-signing-credentials.mjs';

let directory, keyPem, certificatePem, caPem;
let hasOpenSSL = true;
try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); }
catch { hasOpenSSL = false; }
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'frame-signing-tests-'));
  if (!hasOpenSSL) return;
  keyPem = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
  await writeFile(join(directory, 'key.pem'), keyPem, { mode: 0o600 });
  for (const [name, ca] of [['cert.pem', false], ['ca.pem', true]]) {
    // Use one explicit extension section; host OpenSSL configs can add conflicting CA extensions.
    const config = join(directory, `${name}.cnf`);
    await writeFile(config, `[req]\ndistinguished_name = subject\nx509_extensions = extensions\n[subject]\nCN = Frame\n[extensions]\nbasicConstraints = critical,CA:${ca ? 'TRUE' : 'FALSE'}\nkeyUsage = critical,digitalSignature${ca ? ',keyCertSign' : ''}\nextendedKeyUsage = codeSigning\n`);
    execFileSync('openssl', ['req', '-new', '-x509', '-config', config, '-key', join(directory, 'key.pem'), '-out', join(directory, name), '-days', '1', '-subj', '/CN=Frame'], { stdio: 'ignore' });
  }
  certificatePem = await readFile(join(directory, 'cert.pem'), 'utf8');
  caPem = await readFile(join(directory, 'ca.pem'), 'utf8');
  assert.equal(new X509Certificate(certificatePem).ca, false);
  assert.equal(new X509Certificate(caPem).ca, true);
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test('uses committed artifacts when neither signing secret is configured, without creating keys', async () => {
  const target = join(directory, 'absent');
  assert.equal(await prepareSigningSecrets({ directory: target }), false);
  await assert.rejects(stat(target), { code: 'ENOENT' });
});
test('rejects incomplete or invalid signing secrets without exposing their contents', async () => {
  const keyPem = 'secret-key-sentinel', certificatePem = 'secret-cert-sentinel', target = join(directory, 'invalid');
  await assert.rejects(prepareSigningSecrets({ directory: target, keyPem }), /Set both FRAME_WINDOWS_SHELL/);
  await assert.rejects(prepareSigningSecrets({ directory: target, keyPem, certificatePem }), error => {
    assert.match(error.message, /Invalid Windows shell signing credentials/);
    assert.doesNotMatch(error.message, /secret-key-sentinel|secret-cert-sentinel/);
    return true;
  });
  await assert.rejects(stat(target), { code: 'ENOENT' });
});
test('requires a matching, current, non-CA code-signing certificate', { skip: !hasOpenSSL }, () => {
  const certificate = validateSigningCredentials(keyPem, certificatePem);
  assert.equal(certificate.subject, 'CN=Frame');
  const other = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
  assert.throws(() => validateSigningCredentials(other, certificatePem), /does not match/);
  assert.throws(() => validateSigningCredentials(keyPem, caPem), /non-CA/);
  assert.throws(() => validateSigningCredentials(keyPem, certificatePem, Date.parse(certificate.validFrom) - 1000), /not valid yet/);
  assert.throws(() => validateSigningCredentials(keyPem, certificatePem, Date.parse(certificate.validTo)), /expired/);
});
test('stages PEM credentials with private permissions and cleans up partial writes', { skip: !hasOpenSSL }, async () => {
  const target = join(directory, 'staged');
  assert.equal(await prepareSigningSecrets({ directory: target, keyPem, certificatePem }), true);
  assert.equal(await readFile(join(target, 'private-key.pem'), 'utf8'), keyPem);
  assert.equal(await readFile(join(target, 'certificate.pem'), 'utf8'), certificatePem);
  if (process.platform !== 'win32') {
    assert.equal((await stat(target)).mode & 0o777, 0o700);
    assert.equal((await stat(join(target, 'private-key.pem'))).mode & 0o777, 0o600);
  }
  const partial = join(directory, 'partial');
  await mkdir(partial); await writeFile(join(partial, 'certificate.pem'), 'existing');
  await assert.rejects(prepareSigningSecrets({ directory: partial, keyPem, certificatePem }), /Could not prepare/);
  await assert.rejects(stat(partial), { code: 'ENOENT' });
});
test('the Actions entry point refuses pull requests even if credentials are accidentally supplied', () => {
  assert.throws(() => execFileSync(process.execPath, ['scripts/ci-shell-signing.mjs'], { env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/heads/master', RUNNER_TEMP: directory, GITHUB_ENV: join(directory, 'env'), GITHUB_OUTPUT: join(directory, 'output'), FRAME_WINDOWS_SHELL_PRIVATE_KEY_PEM: 'secret-key-sentinel' }, stdio: 'pipe' }), error => {
    assert.match(error.stderr.toString(), /only accepted on master/);
    assert.doesNotMatch(error.stderr.toString(), /secret-key-sentinel/);
    return true;
  });
});
test('the Actions entry point emits only paths and availability, and versions signed packages', { skip: !hasOpenSSL }, async () => {
  const fixture = join(directory, 'actions');
  await mkdir(join(fixture, 'native/windows-shell'), { recursive: true });
  await writeFile(join(fixture, 'native/windows-shell/identity.json'), JSON.stringify({ version: '1.0.0.1' }));
  const envPath = join(fixture, 'env'), outputPath = join(fixture, 'output');
  const stdout = execFileSync(process.execPath, [resolve('scripts/ci-shell-signing.mjs')], { cwd: fixture, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/master', GITHUB_RUN_NUMBER: '123', GITHUB_RUN_ATTEMPT: '2', RUNNER_TEMP: fixture, GITHUB_ENV: envPath, GITHUB_OUTPUT: outputPath, FRAME_WINDOWS_SHELL_PRIVATE_KEY_PEM: keyPem, FRAME_WINDOWS_SHELL_CERTIFICATE_PEM: certificatePem } });
  assert.doesNotMatch(stdout + await readFile(envPath, 'utf8'), /BEGIN.*PRIVATE KEY|BEGIN CERTIFICATE/);
  assert.equal(await readFile(outputPath, 'utf8'), 'enabled=true\n');
  assert.equal(JSON.parse(await readFile(join(fixture, 'native/windows-shell/identity.json'))).version, '1.0.123.2');
  assert.match(await readFile(envPath, 'utf8'), /FRAME_WINDOWS_SHELL_SIGNING_DIR=/);
});
