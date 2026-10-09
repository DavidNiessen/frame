export interface ShellCertificateStatus {
  canTrust: boolean;
  trusted: boolean;
  subject: string;
  fingerprint: string;
  expiresAt: string;
}
export interface ShellIntegrationStatus {
  platform: string;
  available: boolean;
  state: 'installed' | 'partial' | 'not-installed';
  detail: string;
  certificate?: ShellCertificateStatus;
}
