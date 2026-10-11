import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, Monitor, Sparkles, X } from 'lucide-react';
import { FRAME_RELEASES } from '../core/app-updates';
import {
  detectDownloadTarget,
  downloadArchitectures,
  normalizeDownloadTarget,
  fetchDownloadReleases,
  selectDownloadRelease,
  type DownloadTarget,
} from '../core/app-download';

const platforms = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' } as const;

export function DownloadApp() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<DownloadTarget>({ platform: null, arch: null });
  const [previews, setPreviews] = useState(false);
  const [releases, setReleases] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [requested, setRequested] = useState(false);
  const manuallySelected = useRef(false);
  useEffect(() => {
    let active = true;
    void detectDownloadTarget(navigator).then((detected) => {
      if (active && !manuallySelected.current) setTarget(normalizeDownloadTarget(detected));
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError('');
    setRequested(false);
    setReleases([]);
    void fetchDownloadReleases(previews, controller.signal)
      .then((items) => {
        if (active) setReleases(items);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          controller.signal.aborted
            ? 'GitHub took too long to respond. Try again or use the releases page.'
            : cause instanceof Error
              ? cause.message
              : 'Could not load releases.',
        );
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort('dismissed');
    };
  }, [open, previews, retry]);
  const release =
    !loading && !error ? selectDownloadRelease(releases, target, previews) : undefined;
  function choose(next: DownloadTarget) {
    manuallySelected.current = true;
    setTarget(normalizeDownloadTarget(next));
    setRequested(false);
  }
  let note = !target.platform
    ? 'Choose the computer where you want to install Frame.'
    : !target.arch
      ? target.platform === 'darwin'
        ? 'Choose Apple Silicon (M1 or newer) or Intel to match your Mac.'
        : 'Choose the processor for your computer.'
      : loading
        ? 'Finding the latest release on GitHub…'
        : release
          ? `${platforms[target.platform]} · ${release.installer.name.endsWith('.dmg') ? 'DMG' : release.installer.name.endsWith('.exe') ? 'EXE' : 'AppImage'} · ${Math.round(release.installer.size / 1024 ** 2)} MB`
          : error ||
            (!previews && releases.length === 0
              ? 'No full release has been published yet. Select the latest prerelease to try Frame.'
              : `No ${previews ? 'prerelease' : 'full release'} installer is available for this platform and processor.`);
  if (requested) note = 'Download requested. Check your browser’s downloads.';
  return (
    <>
      <button
        className="button download-app-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Download size={16} />
        Install App
      </button>
      {createPortal(
        <dialog
          ref={dialog}
          className="shortcuts-dialog download-app-dialog"
          aria-labelledby="download-app-title"
          aria-describedby="download-app-description"
          onClose={() => setOpen(false)}
          onCancel={() => setOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              const bounds = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < bounds.left ||
                event.clientX > bounds.right ||
                event.clientY < bounds.top ||
                event.clientY > bounds.bottom
              )
                setOpen(false);
            }
          }}
        >
          <div className="dialog-heading">
            <span className="download-app-mark">
              <Monitor size={24} />
            </span>
            <button
              className="icon-button"
              aria-label="Close app download"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="download-app-body">
            <span className="download-app-eyebrow">YOUR EDITOR. ON YOUR DESKTOP.</span>
            <h2 id="download-app-title">More room to create.</h2>
            <p id="download-app-description">
              Native media processing, folder imports, and YouTube downloads. Get Frame for your
              computer.
            </p>
            <div className="download-app-selectors">
              <label className="stacked-label">
                Operating system
                <select
                  value={target.platform ?? ''}
                  onChange={(event) =>
                    choose({
                      ...target,
                      platform: event.target.value as DownloadTarget['platform'],
                    })
                  }
                >
                  <option value="" disabled>
                    Choose your OS
                  </option>
                  {Object.entries(platforms).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="stacked-label">
                Architecture
                <select
                  value={target.arch ?? ''}
                  disabled={downloadArchitectures(target.platform).length < 2}
                  onChange={(event) =>
                    choose({ ...target, arch: event.target.value as DownloadTarget['arch'] })
                  }
                >
                  <option value="" disabled>
                    Choose your processor
                  </option>
                  {downloadArchitectures(target.platform).map((arch) => (
                    <option key={arch} value={arch}>
                      {arch === 'arm64'
                        ? 'Apple Silicon · ARM64'
                        : target.platform === 'darwin'
                          ? 'Intel · x64'
                          : 'Intel / AMD · x64'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="download-app-detection">
              {target.platform === 'darwin'
                ? 'Choose Apple Silicon or Intel to match your Mac.'
                : 'Windows and Linux builds use x64. Choose macOS for Apple Silicon or Intel.'}
            </p>
            <label className="download-app-channel">
              <input
                type="checkbox"
                checked={previews}
                onChange={(event) => setPreviews(event.target.checked)}
              />
              <span>
                Download the latest prerelease
                <small>Preview new features before the next full release.</small>
              </span>
              <Sparkles size={17} />
            </label>
            <div className="download-app-result" aria-live="polite" aria-busy={loading}>
              {release && (
                <strong>
                  Frame {release.tag.slice(1)}{' '}
                  <span>{release.prerelease ? 'Prerelease' : 'Full release'}</span>
                </strong>
              )}
              <p role={error ? 'alert' : 'status'}>{note}</p>
              {error && (
                <button
                  className="button subtle small"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Try again
                </button>
              )}
            </div>
          </div>
          <footer className="download-app-footer">
            {release ? (
              <a
                className="button primary download-app-submit"
                href={release.installer.url}
                download={release.installer.name}
                onClick={() => setRequested(true)}
              >
                <Download size={17} /> Install for {platforms[target.platform!]}{' '}
                <span>{target.arch === 'arm64' ? 'ARM64' : 'x64'}</span>
              </a>
            ) : (
              <button className="button primary download-app-submit" disabled>
                <Download size={17} />
                {loading ? 'Finding your installer…' : 'Install Frame'}
              </button>
            )}
            <a
              className="download-app-releases"
              href={FRAME_RELEASES}
              target="_blank"
              rel="noreferrer"
            >
              View all GitHub releases <ExternalLink size={13} />
            </a>
          </footer>
        </dialog>,
        document.body,
      )}
    </>
  );
}
