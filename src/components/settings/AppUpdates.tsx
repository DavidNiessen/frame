import { useState } from 'react';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { FRAME_RELEASES } from '../../core/app-updates';
import { useUpdateStatus } from '../../hooks/useAppUpdates';
import { TransientMessage } from '../TransientMessage';

export function AppUpdates() {
  const bridge = window.frameDesktop;
  const { status, setStatus, error, setError } = useUpdateStatus();
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<{ automatic: boolean; includePrereleases: boolean } | null>(
    null,
  );
  const busy = pending || status?.phase === 'checking' || status?.phase === 'downloading';
  const available = !!bridge && !!status?.supported;
  async function run(work: () => Promise<unknown>) {
    setPending(true);
    setError('');
    try {
      await work();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function preferences(patch: Partial<{ automatic: boolean; includePrereleases: boolean }>) {
    if (!bridge || !status || busy) return;
    const value = {
      automatic: status.automatic,
      includePrereleases: status.includePrereleases,
      ...patch,
    };
    // Keep the clicked state visible while the desktop process persists it.
    setDraft(value);
    await run(async () => setStatus(await bridge.setUpdatePreferences(value)));
    setDraft(null);
  }
  let message = !bridge
    ? 'The web app updates when a new full release is published. Reload to get the latest version.'
    : !status
      ? 'Loading update settings…'
      : !status.supported
        ? 'An installer is not available for this platform. Visit GitHub releases.'
        : status.phase === 'checking'
          ? 'Checking GitHub releases…'
          : status.phase === 'downloading'
            ? `Downloading ${status.release?.tag.slice(1)} · ${Math.round((status.ratio ?? 0) * 100)}%`
            : status.phase === 'downloaded'
              ? `Frame ${status.release?.tag.slice(1)} is downloaded and verified.`
              : status.release
                ? `Frame ${status.release.tag.slice(1)} is available${status.release.prerelease ? ' as a prerelease' : ''}.`
                : status.phase === 'current'
                  ? 'You’re up to date. No newer release is available in this channel.'
                  : status.phase === 'error'
                    ? 'Update check failed. You can try again.'
                    : 'Check GitHub for a new release of Frame.';
  if (status?.development) message += ' Automatic checks run in installed builds.';
  return (
    <section className="settings-card" aria-labelledby="updates-heading">
      <div className="settings-section-heading">
        <Download size={19} />
        <div>
          <h2 id="updates-heading">Updates</h2>
          <p>Get the latest Frame release from GitHub.</p>
        </div>
        <span className="integration-badge">
          {status
            ? status.development
              ? `Development · ${status.current.slice(1).split('-')[0]}`
              : status.current.slice(1)
            : bridge
              ? 'Desktop'
              : 'Web'}
        </span>
      </div>
      <p className="integration-detail" role="status">
        {message}
      </p>
      <div className="integration-controls">
        <button
          className="button subtle"
          disabled={!available || busy}
          onClick={() => void run(async () => setStatus(await bridge!.checkForUpdates()))}
        >
          <RefreshCw size={14} className={status?.phase === 'checking' ? 'spinner' : ''} />
          {status?.phase === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
        {status?.release && status.phase !== 'downloaded' && status.phase !== 'downloading' && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void run(async () => setStatus(await bridge!.downloadUpdate()))}
          >
            <Download size={14} />
            Download update
          </button>
        )}
        {status?.phase === 'downloading' && (
          <button className="button subtle" onClick={() => void bridge!.cancelUpdateDownload()}>
            Cancel download
          </button>
        )}
        {status?.phase === 'downloaded' && (
          <>
            {!status.release?.installer.name.endsWith('.AppImage') && (
              <button
                className="button primary"
                disabled={pending}
                onClick={() => void run(() => bridge!.openUpdateInstaller())}
              >
                Open installer
              </button>
            )}
            <button
              className={
                status.release?.installer.name.endsWith('.AppImage')
                  ? 'button primary'
                  : 'button subtle'
              }
              disabled={pending}
              onClick={() => void run(() => bridge!.revealUpdateInstaller())}
            >
              Show download
            </button>
          </>
        )}
        <a
          className="button subtle"
          href={status?.release?.page || FRAME_RELEASES}
          target="_blank"
          rel="noreferrer"
        >
          {status?.release ? 'Release notes' : 'GitHub releases'}
        </a>
      </div>
      <label className="switch-row settings-preference">
        <span>
          Check for updates automatically
          <small>
            Check shortly after startup and every six hours while Frame is open. Downloads start
            only when you choose.
          </small>
        </span>
        <input
          type="checkbox"
          aria-label="Check for updates automatically"
          checked={draft?.automatic ?? status?.automatic ?? true}
          disabled={!available || busy}
          onChange={(event) => {
            const automatic = event.target.checked;
            void preferences({ automatic });
          }}
        />
      </label>
      <label className="switch-row settings-preference">
        <span>
          Include prereleases<small>Try preview builds. Full releases are used by default.</small>
        </span>
        <input
          type="checkbox"
          aria-label="Include prereleases"
          checked={draft?.includePrereleases ?? status?.includePrereleases ?? false}
          disabled={!available || busy}
          onChange={(event) => {
            const includePrereleases = event.target.checked;
            void preferences({ includePrereleases });
          }}
        />
      </label>
      {status?.checkedAt && (
        <p className="settings-note">Last checked {new Date(status.checkedAt).toLocaleString()}.</p>
      )}
      {(error || status?.error) && (
        <TransientMessage className="settings-error" role="alert">
          {error || status?.error}
        </TransientMessage>
      )}
      {bridge && (
        <p className="settings-note">
          <ShieldCheck size={13} />
          Downloads are verified against the release’s SHA-256 checksum. Save your work before
          installing. On macOS, open the DMG and replace Frame in Applications; on Linux, replace
          your AppImage.
        </p>
      )}
    </section>
  );
}
