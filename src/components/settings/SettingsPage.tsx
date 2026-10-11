import { useLoadingActivity } from '../../hooks/useLoadingActivity';
import { TransientMessage } from '../TransientMessage';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  AudioLines,
  FolderOpen,
  LoaderCircle,
  Monitor,
  Palette,
  RefreshCw,
} from 'lucide-react';
import type { ShellIntegrationStatus } from '../../core/system-integration';
import type { Theme } from '../../hooks/useTheme';
import { ThemeChoices } from './ThemeChoices';
import { CompletionNotifications } from './CompletionNotifications';
import { RecentExports } from './RecentExports';
import { WatchFolders } from './WatchFolders';
import { CertificateTrust } from './CertificateTrust';
import { AppUpdates } from './AppUpdates';

const webStatus: ShellIntegrationStatus = {
  platform: 'web',
  available: false,
  state: 'not-installed',
  detail: 'Available in the desktop app. Browsers cannot add actions to your file manager.',
};
export function SettingsPage({
  theme,
  setTheme,
  autoWaveforms,
  setAutoWaveforms,
  workspaceAutosave,
  setWorkspaceAutosave,
  timelinePreview,
  setTimelinePreview,
  back,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  autoWaveforms: boolean;
  setAutoWaveforms: (enabled: boolean) => void;
  workspaceAutosave: boolean;
  setWorkspaceAutosave: (enabled: boolean) => void;
  timelinePreview: boolean;
  setTimelinePreview: (enabled: boolean) => void;
  back: () => void;
}) {
  const bridge = window.frameDesktop;
  const [status, setStatus] = useState<ShellIntegrationStatus | null>(bridge ? null : webStatus);
  const [pending, setPending] = useState<
    'checking' | 'installing' | 'removing' | 'certificate' | null
  >(bridge ? 'checking' : null);
  const [error, setError] = useState('');
  useLoadingActivity(!!pending, 'Updating file-manager actions…');
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    bridge
      .shellIntegrationStatus()
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (active) setPending(null);
      });
    return () => {
      active = false;
    };
  }, [bridge]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        document.querySelector('dialog[open]')
      )
        return;
      event.preventDefault();
      back();
      document.querySelector<HTMLButtonElement>('.header-settings')?.focus();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [back]);
  async function update(enabled?: boolean) {
    if (!bridge || pending) return;
    setPending(enabled === undefined ? 'checking' : enabled ? 'installing' : 'removing');
    setError('');
    try {
      setStatus(
        await (enabled === undefined
          ? bridge.shellIntegrationStatus()
          : bridge.setShellIntegration(enabled)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      // A filesystem or registry change can fail halfway through. Report the actual state.
      try {
        setStatus(await bridge.shellIntegrationStatus());
      } catch {
        setStatus(null);
      }
    } finally {
      setPending(null);
    }
  }
  async function certificate(action: 'trust' | 'revoke') {
    if (!bridge || pending) return;
    setPending('certificate');
    setError('');
    try {
      setStatus(await bridge.changeShellCertificate(action));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      try {
        setStatus(await bridge.shellIntegrationStatus());
      } catch {
        setStatus(null);
      }
    } finally {
      setPending(null);
    }
  }
  const installed = status?.state === 'installed',
    partial = status?.state === 'partial';
  const needsCertificate = !!status?.certificate && !status.certificate.trusted;
  return (
    <main className="settings-page">
      <button className="settings-back" onClick={back}>
        <ArrowLeft size={15} />
        Back to workspace
      </button>
      <div className="settings-heading">
        <h1>Settings</h1>
        <p>Make Frame feel at home.</p>
      </div>
      <AppUpdates />
      <section className="settings-card" aria-labelledby="appearance-heading">
        <div className="settings-section-heading">
          <Palette size={19} />
          <div>
            <h2 id="appearance-heading">Appearance</h2>
            <p>Choose a theme, or let Frame follow your device.</p>
          </div>
        </div>
        <ThemeChoices theme={theme} setTheme={setTheme} />
      </section>
      <section className="settings-card" aria-labelledby="editing-heading">
        <div className="settings-section-heading">
          <AudioLines size={19} />
          <div>
            <h2 id="editing-heading">Editing</h2>
            <p>Choose how Frame prepares and saves your workspace.</p>
          </div>
        </div>
        <label className="switch-row settings-preference">
          <span>
            Show timeline preview
            <small id="timeline-preview-description">
              Show the miniature sequence overview above the timeline. Hide it for more room to
              edit.
            </small>
          </span>
          <input
            type="checkbox"
            checked={timelinePreview}
            onChange={(event) => setTimelinePreview(event.target.checked)}
            aria-label="Show timeline preview"
            aria-describedby="timeline-preview-description"
          />
        </label>
        <label className="switch-row settings-preference">
          <span>
            Generate audio waveforms automatically
            <small id="waveform-preference-description">
              Show waveforms for audio files, videos with audio, and inserted audio layers. Turn off
              to skip waveform analysis.
            </small>
          </span>
          <input
            type="checkbox"
            checked={autoWaveforms}
            onChange={(event) => setAutoWaveforms(event.target.checked)}
            aria-label="Generate audio waveforms automatically"
            aria-describedby="waveform-preference-description"
          />
        </label>
        <label className="switch-row settings-preference">
          <span>
            Autosave workspace
            <small id="autosave-preference-description">
              Keep media and edits on this device to reopen your workspace automatically. Turning
              off keeps the last saved workspace. Clear library removes it.
            </small>
          </span>
          <input
            type="checkbox"
            checked={workspaceAutosave}
            onChange={(event) => setWorkspaceAutosave(event.target.checked)}
            aria-label="Autosave workspace"
            aria-describedby="autosave-preference-description"
          />
        </label>
      </section>
      <CompletionNotifications />
      <WatchFolders />
      <RecentExports />
      <section className="settings-card" aria-labelledby="integration-heading">
        <div className="settings-section-heading">
          <FolderOpen size={19} />
          <div>
            <h2 id="integration-heading">File-manager actions</h2>
            <p>Start editing or converting directly from your files.</p>
          </div>
          <span className={`integration-badge ${installed ? 'installed' : ''}`}>
            {pending === 'checking'
              ? 'Checking…'
              : !status
                ? 'Status unavailable'
                : !status.available
                  ? status.platform === 'web'
                    ? 'Desktop only'
                    : 'Unavailable'
                  : installed
                    ? 'Installed'
                    : partial
                      ? 'Needs repair'
                      : 'Not installed'}
          </span>
        </div>
        <p className="integration-detail">
          {status?.detail || 'Refresh to check your file-manager actions.'}
        </p>
        <div className="integration-controls">
          <button
            className="button primary"
            disabled={
              !status?.available ||
              !!pending ||
              (needsCertificate ? !status?.certificate?.canTrust : installed)
            }
            onClick={() => void (needsCertificate ? certificate('trust') : update(true))}
          >
            {(pending === 'installing' || pending === 'certificate') && (
              <LoaderCircle size={14} className="spinner" />
            )}
            {pending === 'certificate'
              ? 'Waiting for Windows…'
              : pending === 'installing'
                ? 'Installing…'
                : needsCertificate
                  ? 'Trust certificate and enable menu…'
                  : partial
                    ? 'Repair actions'
                    : 'Install actions'}
          </button>
          <button
            className="button subtle"
            disabled={!status?.available || !!pending || (!installed && !partial)}
            onClick={() => void update(false)}
          >
            {pending === 'removing' ? 'Removing…' : 'Remove actions'}
          </button>
          {bridge && (
            <button
              className="icon-button"
              disabled={!!pending}
              aria-label="Refresh integration status"
              title="Refresh integration status"
              onClick={() => void update()}
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
        {error && (
          <TransientMessage className="settings-error" role="alert">
            {error}
          </TransientMessage>
        )}
        <p className="settings-note">
          <Monitor size={13} />
          Applies to your user account. Your default media apps stay the same.
        </p>
        {status?.certificate && (
          <CertificateTrust
            certificate={status.certificate}
            pending={!!pending}
            change={(action) => void certificate(action)}
          />
        )}
      </section>
    </main>
  );
}
