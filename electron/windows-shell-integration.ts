import { windowsShellActions } from './windows-shell-actions';
import { windowsPrimaryMenu, type PrimaryMenuStatus } from './windows-primary-menu';
import type { ShellActionLocation } from './shell-actions';
import type { ShellIntegrationStatus } from '../src/core/system-integration';

export function windowsIntegrationState(classic: ShellIntegrationStatus['state'], primary: PrimaryMenuStatus): ShellIntegrationStatus['state'] {
  if (!primary.supported) return classic;
  if (classic === 'installed' && primary.state === 'installed') return 'installed';
  if (classic === 'not-installed' && primary.state === 'not-installed') return 'not-installed';
  return 'partial';
}
export async function windowsShellStatus(location: ShellActionLocation, operation: 'status' | 'install' | 'remove' = 'status') {
  const classic = await windowsShellActions(location, operation);
  const primary = await windowsPrimaryMenu(location, operation);
  const detail = primary.supported ? primary.state === 'installed' && classic !== 'installed'
    ? 'Windows 11 primary menu installed. Classic entries need repair to appear under Show more options.' : primary.detail
    : 'Right-click media in File Explorer to Edit in Frame or Convert in Frame. ' + primary.detail;
  return { state: windowsIntegrationState(classic, primary), detail };
}
