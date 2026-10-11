import { expect, it } from 'vitest';
import {
  certificatePrompt,
  changeShellCertificate,
  type CertificateServices,
} from '../electron/certificate-consent';
import type { ShellIntegrationStatus } from '../src/core/system-integration';
const status: ShellIntegrationStatus = {
  platform: 'win32',
  available: true,
  state: 'partial',
  detail: '',
  certificate: {
    canTrust: true,
    trusted: false,
    subject: 'CN=Frame',
    fingerprint: 'a'.repeat(64),
    expiresAt: '2031-10-08T00:00:00Z',
  },
};
function services(response = 1) {
  const calls: string[] = [];
  const api: CertificateServices = {
    status: async () => status,
    confirm: async () => {
      calls.push('confirm');
      return response;
    },
    change: async (action) => {
      calls.push(action);
    },
    menu: async (enabled) => {
      calls.push(`menu:${enabled}`);
    },
  };
  return { api, calls };
}
it('explains machine-wide certificate trust and defaults to Cancel', () => {
  const prompt = certificatePrompt(status.certificate!, 'trust');
  expect(prompt.buttons).toEqual(['Cancel', 'Trust certificate and enable menu']);
  expect(prompt.defaultId).toBe(0);
  expect(prompt.cancelId).toBe(0);
  expect(prompt.detail).toContain('all users of this PC');
  expect(prompt.detail).toContain(status.certificate!.fingerprint);
  expect(certificatePrompt(status.certificate!, 'revoke').detail).toContain(
    'Trusted People for all users',
  );
});
it('requires confirmation before elevation and registers menus only after trust succeeds', async () => {
  const { api, calls } = services();
  await changeShellCertificate('trust', api);
  expect(calls).toEqual(['confirm', 'trust', 'menu:true']);
});
it('does not change trust or menus when the Frame confirmation is cancelled', async () => {
  const { api, calls } = services(0);
  expect(await changeShellCertificate('trust', api)).toEqual(status);
  expect(calls).toEqual(['confirm']);
});
it('retains existing menus when administrator approval fails or is cancelled', async () => {
  const { api, calls } = services();
  api.change = async () => {
    calls.push('elevation');
    throw new Error('Administrator approval was cancelled.');
  };
  await expect(changeShellCertificate('trust', api)).rejects.toThrow('cancelled');
  expect(calls).toEqual(['confirm', 'elevation']);
});
it('only removes this user’s menus after explicit machine-wide revocation succeeds', async () => {
  const { api, calls } = services();
  await changeShellCertificate('revoke', api);
  expect(calls).toEqual(['confirm', 'revoke', 'menu:false']);
});
it('rejects web/unsupported builds and expired certificates before any prompt or changes', async () => {
  const { api, calls } = services();
  api.status = async () => ({ ...status, platform: 'web', certificate: undefined });
  await expect(changeShellCertificate('trust', api)).rejects.toThrow('Windows 11');
  expect(calls).toEqual([]);
  api.status = async () => ({
    ...status,
    certificate: { ...status.certificate!, canTrust: false },
  });
  await expect(changeShellCertificate('trust', api)).rejects.toThrow('expired');
  expect(calls).toEqual([]);
});
