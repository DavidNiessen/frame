import type { MessageBoxOptions } from 'electron';
import type {
  ShellCertificateStatus,
  ShellIntegrationStatus,
} from '../src/core/system-integration';
export type CertificateAction = 'trust' | 'revoke';
export function certificatePrompt(
  certificate: ShellCertificateStatus,
  action: CertificateAction,
): MessageBoxOptions {
  const trust = action === 'trust';
  return {
    type: 'question',
    title: trust ? 'Enable Windows 11 menu' : 'Remove Frame certificate trust',
    message: trust
      ? 'Trust Frame’s signing certificate?'
      : 'Remove Frame’s certificate trust from this PC?',
    detail:
      (trust
        ? 'Windows needs administrator approval to trust this certificate for all users of this PC. This trusts software and packages signed with this certificate. Frame will then enable Edit in Frame and Convert in Frame without Developer Mode. You can remove the trust later in Settings.'
        : 'This removes Frame’s signing certificate from Trusted People for all users of this PC, and removes your Frame file-manager actions. Other users may need to trust it again to install or update Frame’s menu. Windows will ask for administrator approval.') +
      `\n\nPublisher: ${certificate.subject}\nSHA-256: ${certificate.fingerprint}\nExpires: ${certificate.expiresAt.slice(0, 10)}`,
    buttons: ['Cancel', trust ? 'Trust certificate and enable menu' : 'Remove certificate trust'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
}
export interface CertificateServices {
  status(): Promise<ShellIntegrationStatus>;
  confirm(options: MessageBoxOptions): Promise<number>;
  change(action: CertificateAction): Promise<void>;
  menu(enabled: boolean): Promise<unknown>;
}
export async function changeShellCertificate(
  action: CertificateAction,
  services: CertificateServices,
) {
  const status = await services.status(),
    certificate = status.certificate;
  if (status.platform !== 'win32' || !certificate)
    throw new Error('Certificate trust is available for the bundled Windows 11 shell package.');
  if (action === 'trust' && !certificate.canTrust)
    throw new Error(
      'The bundled signing certificate has expired or is not valid yet. Update Frame.',
    );
  if (action === 'trust' && certificate.trusted) {
    await services.menu(true);
    return services.status();
  }
  if ((await services.confirm(certificatePrompt(certificate, action))) !== 1) return status;
  await services.change(action);
  await services.menu(action === 'trust');
  return services.status();
}
