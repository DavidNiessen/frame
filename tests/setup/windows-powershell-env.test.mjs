import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowsPowerShellEnv } from '../../scripts/windows-powershell-env.mjs';
test('starts Windows PowerShell with its own module discovery without changing the parent environment', () => {
  const parent = {
    PSModulePath: 'C:\\Program Files\\PowerShell\\7\\Modules',
    psmodulepath: 'custom',
    PATH: 'system tools',
    SystemRoot: 'C:\\Windows',
    FRAME_DEV_URL: 'http://localhost:5173',
  };
  assert.deepEqual(windowsPowerShellEnv(parent), {
    PATH: parent.PATH,
    SystemRoot: parent.SystemRoot,
    FRAME_DEV_URL: parent.FRAME_DEV_URL,
  });
  assert.equal(parent.PSModulePath, 'C:\\Program Files\\PowerShell\\7\\Modules');
  assert.deepEqual(windowsPowerShellEnv({ PATH: 'tools' }), { PATH: 'tools' });
});
