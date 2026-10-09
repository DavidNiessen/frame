import { ShieldCheck } from 'lucide-react';
import type { ShellCertificateStatus } from '../../core/system-integration';
export function CertificateTrust({ certificate, pending, change }: { certificate: ShellCertificateStatus; pending: boolean; change: (action: 'trust' | 'revoke') => void }) {
  return <div className="certificate-trust">
    <div className="certificate-trust-heading"><ShieldCheck size={16} /><strong>{certificate.trusted ? 'Frame certificate trusted on this PC' : 'Enable the Windows 11 menu without Developer Mode'}</strong></div>
    <p>{certificate.trusted ? 'The primary menu can use Frame’s signed shell package. Removing file-manager actions keeps this certificate trusted until you remove its trust below.' : 'Trust Frame’s signing certificate once to enable the primary right-click menu. Frame will explain the change, then Windows will ask for administrator approval. Classic menu entries work without this.'}</p>
    <details><summary>Certificate details</summary><dl><dt>Publisher</dt><dd>{certificate.subject}</dd><dt>SHA-256 fingerprint</dt><dd className="certificate-fingerprint">{certificate.fingerprint}</dd><dt>Expires</dt><dd>{new Date(certificate.expiresAt).toLocaleDateString()}</dd><dt>Trust scope</dt><dd>Trusted People, for all users of this PC</dd></dl></details>
    {!certificate.canTrust && <p role="alert">The signing certificate has expired or is not valid yet. Update Frame or check your device’s date.</p>}
    {certificate.trusted && <button className="button subtle" disabled={pending} onClick={() => change('revoke')}>{pending ? 'Waiting for Windows…' : 'Remove certificate trust…'}</button>}
  </div>;
}
