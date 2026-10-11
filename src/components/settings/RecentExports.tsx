import { useLoadingActivity } from '../../hooks/useLoadingActivity';
import { TransientMessage } from '../TransientMessage';
import { useEffect, useState } from 'react';
import { Clock3, FolderOpen, Trash2, Search, X } from 'lucide-react';
import { useRef } from 'react';
import type { ExportHistoryStatus } from '../../core/export-history';
import { bytes } from '../../core/format';
export function RecentExports() {
  const search = useRef<HTMLInputElement>(null);
  const bridge = window.frameDesktop,
    [status, setStatus] = useState<ExportHistoryStatus>({ entries: [], error: '' }),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useLoadingActivity(busy, 'Updating recent exports…');
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (bridge?.exportHistory)
        void bridge
          .exportHistory()
          .then((value) => {
            if (active) setStatus(value);
          })
          .catch((issue) => {
            if (active) setError((issue as Error).message);
          });
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [bridge]);
  async function action(task: () => Promise<ExportHistoryStatus | void>) {
    setBusy(true);
    setError('');
    try {
      const value = await task();
      if (value) setStatus(value);
    } catch (issue) {
      setError((issue as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const matches = status.entries.filter((entry) =>
      `${entry.name} ${entry.source} ${entry.kind}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    ),
    pages = Math.max(1, Math.ceil(matches.length / 8)),
    shown = Math.min(page, pages - 1);
  return (
    <section className="settings-card settings-history" aria-labelledby="history-heading">
      <div className="settings-section-heading">
        <Clock3 size={19} />
        <div>
          <h2 id="history-heading">Recent exports</h2>
          <p>Find saved files from editing, conversion and watch folders.</p>
        </div>
        <span className="integration-badge">
          {bridge ? `${status.entries.length} saved` : 'Desktop only'}
        </span>
      </div>
      {bridge ? (
        <>
          <div className="recent-export-toolbar">
            <div className="recent-export-search">
              <Search size={16} aria-hidden="true" />
              <input
                ref={search}
                type="search"
                aria-label="Search recent exports"
                placeholder="Search saved files…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
              {query && (
                <button
                  className="icon-button"
                  aria-label="Clear saved files search"
                  onClick={() => {
                    setQuery('');
                    setPage(0);
                    search.current?.focus();
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              className="button subtle small"
              disabled={busy || !status.entries.length}
              onClick={() => void action(() => bridge.clearExportHistory())}
            >
              Clear list
            </button>
          </div>
          <ul className="recent-export-list">
            {matches.slice(shown * 8, shown * 8 + 8).map((entry) => (
              <li key={entry.id}>
                <div>
                  <strong title={entry.path}>{entry.name}</strong>
                  <small>
                    {entry.kind} · {bytes(entry.size)} · {new Date(entry.savedAt).toLocaleString()}
                  </small>
                  <p title={entry.path}>{entry.path}</p>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Show ${entry.name} in folder`}
                  disabled={busy}
                  onClick={() => void action(() => bridge.revealExport(entry.id))}
                >
                  <FolderOpen size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Forget ${entry.name}`}
                  disabled={busy}
                  onClick={() => void action(() => bridge.removeExportHistory(entry.id))}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          {!matches.length && (
            <p className="integration-detail">
              {status.entries.length
                ? 'No matching saved files.'
                : 'Your next saved export will appear here.'}
            </p>
          )}
          {pages > 1 && (
            <div className="recent-export-pagination">
              <button
                className="button subtle small"
                disabled={shown === 0}
                onClick={() => setPage(shown - 1)}
              >
                Previous
              </button>
              <span>
                {shown + 1} / {pages}
              </span>
              <button
                className="button subtle small"
                disabled={shown >= pages - 1}
                onClick={() => setPage(shown + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <button className="button subtle" disabled>
          Show saved exports
        </button>
      )}
      {(error || status.error) && (
        <TransientMessage className="settings-error" role="alert">
          {error || status.error}
        </TransientMessage>
      )}
      <p className="settings-note">
        {bridge
          ? 'Stored only on this device, up to 100 files. Clearing or forgetting entries keeps the saved files.'
          : 'Available in the desktop app, where Frame can reveal files in your file manager.'}
      </p>
    </section>
  );
}
