import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { windowsLaunchPrefix } from './shell-command';
import type { ShellActionLocation } from './shell-actions';
import type { ShellIntegrationStatus } from '../src/core/system-integration';
export interface PrimaryMenuStatus { supported: boolean; owned: boolean; state: ShellIntegrationStatus['state']; detail: string; certificate?: ShellIntegrationStatus['certificate'] }

export async function windowsPrimaryMenu(location: ShellActionLocation, operation: 'status' | 'install' | 'remove' | 'trust' | 'revoke'): Promise<PrimaryMenuStatus> {
  const root = location.args?.length ? join(__dirname, '../build/generated/shell-actions/windows') : join(location.resources, 'shell-actions/windows');
  const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    const child = execFile(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'manage-menu.ps1'), '-JsonFromStdin'],
      { windowsHide: true, timeout: operation === 'trust' || operation === 'revoke' ? 300000 : 60000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        try {
          const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) || '') as PrimaryMenuStatus;
          if (typeof result.supported !== 'boolean' || typeof result.owned !== 'boolean' || !['installed', 'partial', 'not-installed'].includes(result.state) || typeof result.detail !== 'string') throw new Error('Invalid Windows shell status.');
          if (result.certificate && (typeof result.certificate.canTrust !== 'boolean' || typeof result.certificate.trusted !== 'boolean' || typeof result.certificate.subject !== 'string' || !/^[a-f0-9]{64}$/i.test(result.certificate.fingerprint) || typeof result.certificate.expiresAt !== 'string')) throw new Error('Invalid Windows certificate status.');
          // A deployment refusal returns a usable partial state and the OS reason, retaining classic verbs.
          resolve(result);
        } catch { reject(error || new Error('Windows did not return the primary-menu registration status. Rebuild or reinstall Frame.')); }
      });
    child.stdin!.on('error', reject);
    child.stdin!.end(JSON.stringify({ operation, executable: location.executable, prefix: windowsLaunchPrefix(location) }), 'utf8');
  });
}
