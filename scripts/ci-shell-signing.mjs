import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareSigningSecrets } from './windows-signing-credentials.mjs';

try {
  const { RUNNER_TEMP, GITHUB_ENV, GITHUB_OUTPUT, GITHUB_EVENT_NAME, GITHUB_REF } = process.env;
  if (!RUNNER_TEMP || !GITHUB_ENV || !GITHUB_OUTPUT)
    throw new Error('Run this helper in GitHub Actions.');
  if (
    GITHUB_REF !== 'refs/heads/master' ||
    !['push', 'workflow_dispatch'].includes(GITHUB_EVENT_NAME)
  )
    throw new Error('Shell signing secrets are only accepted on master pushes or manual runs.');
  const directory = join(RUNNER_TEMP, 'frame-shell-signing');
  const enabled = await prepareSigningSecrets({
    directory,
    keyPem: process.env.FRAME_WINDOWS_SHELL_PRIVATE_KEY_PEM,
    certificatePem: process.env.FRAME_WINDOWS_SHELL_CERTIFICATE_PEM,
  });
  if (enabled) {
    // Distinct package versions avoid Windows rejecting changed contents under an existing identity.
    const counter = (name) => {
      const value = process.env[name];
      if (!/^[1-9]\d*$/.test(value || '') || Number(value) > 65535)
        throw new Error(`${name} must be between 1 and 65535 for the shell package version.`);
      return value;
    };
    const identityPath = 'native/windows-shell/identity.json';
    const identity = JSON.parse(await readFile(identityPath, 'utf8'));
    identity.version = [
      ...identity.version.split('.').slice(0, 2),
      counter('GITHUB_RUN_NUMBER'),
      counter('GITHUB_RUN_ATTEMPT'),
    ].join('.');
    await writeFile(identityPath, JSON.stringify(identity, null, 2) + '\n');
    await appendFile(GITHUB_ENV, `FRAME_WINDOWS_SHELL_SIGNING_DIR=${directory}\n`);
  }
  await appendFile(GITHUB_OUTPUT, `enabled=${enabled}\n`);
  console.log(
    enabled
      ? 'Signing credentials validated and staged in the runner’s temporary directory.'
      : 'No signing secrets configured; using the committed signed shell package.',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
