import { useState } from 'react';
import { Download, RefreshCw, ShieldCheck, Power } from 'lucide-react';
import { FRAME_RELEASES } from '../../core/app-updates';
import { useUpdateStatus } from '../../hooks/useAppUpdates';
import { TransientMessage } from '../TransientMessage';

export function AppUpdates() {
  const bridge = window.frameDesktop;
  const { status, setStatus, error, setError } = useUpdateStatus();
  const [pending, setPending] = useState(false);
  const [manualChecking, setManualChecking] = useState(false);
  const [draft, setDraft] = useState<{ automatic: boolean; includePrereleases: boolean } | null>(
    null,
  );
  const busy =
    pending ||
    status?.phase === 'checking' ||
    status?.phase === 'downloading' ||
    status?.phase === 'installing';
  const available = !!bridge && !!status?.supported;
  const checking = manualChecking || status?.phase === 'checking';
  const attention =
    !!status?.release &&
    ['available', 'downloading', 'downloaded', 'installing'].includes(status.phase);
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
  async function check() {
    if (!bridge || busy) return;
    setManualChecking(true);
    const started = performance.now();
    await run(async () => {
      try {
        setStatus(await bridge.checkForUpdates());
      } finally {
        // Cached responses can finish before a frame is painted on repeat checks.
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, 600 - (performance.now() - started))),
        );
      }
    });
    setManualChecking(false);
  }
  async function install() {
    const tasks: Promise<unknown>[] = [];
    window.dispatchEvent(new CustomEvent('frame:prepare-update', { detail: { tasks } }));
    await Promise.all(tasks);
    setStatus(await bridge!.installUpdate());
  }
  let message = !bridge
    ? 'The web app updates when a new full release is published. Reload to get the latest version.'
    : !status
      ? 'Loading update settings…'
      : !status.supported
        ? 'An installer is not available for this platform. Visit GitHub releases.'
        : checking
          ? 'Checking GitHub releases…'
          : status.phase === 'downloading'
            ? `Downloading ${status.release?.tag.slice(1)} · ${Math.round((status.ratio ?? 0) * 100)}%`
            : status.phase === 'installing'
              ? 'Preparing the verified update. Frame will restart when it is ready…'
              : status.phase === 'downloaded'
                ? `Frame ${status.release?.tag.slice(1)} is ready. Restart to update.`
                : status.release
                  ? `Frame ${status.release.tag.slice(1)} is available${status.release.prerelease ? ' as a prerelease' : ''}.`
                  : status.phase === 'current'
                    ? 'You’re up to date. No newer release is available in this channel.'
                    : status.phase === 'error'
                      ? 'Update check failed. You can try again.'
                      : 'Check GitHub for a new release of Frame.';
  if (status?.development) message += ' Automatic checks run in installed builds.';
  return (
    <section
      className="settings-card settings-updates"
      data-update-available={attention}
      aria-labelledby="updates-heading"
    >
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
          onClick={() => void check()}
        >
          <RefreshCw size={14} className={checking ? 'spinner' : ''} />
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
        {status?.release &&
          status.phase !== 'downloaded' &&
          status.phase !== 'downloading' &&
          status.phase !== 'installing' && (
            <button
              className="button primary update-install-button"
              disabled={busy}
              onClick={() => void run(async () => setStatus(await bridge!.downloadUpdate()))}
            >
              <Download size={14} />
              Install update
            </button>
          )}
        {status?.phase === 'downloading' && (
          <button className="button subtle" onClick={() => void bridge!.cancelUpdateDownload()}>
            Cancel download
          </button>
        )}
        {status?.phase === 'downloaded' && (
          <>
            <button
              className="button primary update-install-button"
              disabled={pending || !status.installSupported}
              onClick={() => void run(install)}
            >
              <Power size={14} /> Restart to update
            </button>
            <button
              className="button subtle"
              disabled={pending}
              onClick={() => void run(() => bridge!.revealUpdateInstaller())}
            >
              Show download
            </button>
          </>
        )}
        {status?.phase === 'installing' && (
          <button className="button primary" disabled>
            <RefreshCw size={14} className="spinner" /> Preparing update…
          </button>
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
            Check shortly after startup and every six hours. Installed apps download updates in the
            background; you choose when to restart.
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
          Updates are verified against the release’s SHA-256 checksum and installed when you
          restart. Enabled workspace autosave finishes first. Save your project if autosave is off.
          {status?.development
            ? ' Restart-to-update is disabled in development checkouts.'
            : status && !status.installSupported
              ? ' On Linux, run the installed AppImage to enable automatic installation.'
              : ''}
        </p>
      )}
    </section>
  );
}
