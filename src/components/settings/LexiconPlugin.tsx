import { useLoadingActivity } from '../../hooks/useLoadingActivity';
import { TransientMessage } from '../TransientMessage';
import { useCallback, useEffect, useState } from 'react';
import { Disc3, LoaderCircle, RefreshCw } from 'lucide-react';
import type { LexiconPluginStatus } from '../../core/lexicon';

const labels: Record<LexiconPluginStatus['state'], string> = {
  'no-lexicon': 'Lexicon not found',
  'not-installed': 'Not installed',
  installed: 'Installed',
  outdated: 'Update available',
};
export function LexiconPlugin() {
  const bridge = window.frameDesktop,
    [status, setStatus] = useState<LexiconPluginStatus | null>(null),
    [pending, setPending] = useState<'checking' | 'installing' | 'removing' | null>(
      bridge ? 'checking' : null,
    ),
    [error, setError] = useState('');
  useLoadingActivity(
    pending === 'installing' || pending === 'removing',
    'Updating Lexicon plugin…',
  );
  const change = useCallback(
    (enabled?: boolean) => {
      if (!bridge) return;
      setPending(enabled === undefined ? 'checking' : enabled ? 'installing' : 'removing');
      setError('');
      void (enabled === undefined ? bridge.lexiconPluginStatus() : bridge.setLexiconPlugin(enabled))
        .then(setStatus)
        .catch((issue) => setError((issue as Error).message))
        .finally(() => setPending(null));
    },
    [bridge],
  );
  useEffect(() => change(), [change]);
  const installed = status?.state === 'installed' || status?.state === 'outdated';
  return (
    <section className="settings-card" aria-labelledby="lexicon-heading">
      <div className="settings-section-heading">
        <Disc3 size={19} />
        <div>
          <h2 id="lexicon-heading">Lexicon DJ</h2>
          <p>Convert tracks from your Lexicon library and relink them to the converted files.</p>
        </div>
        <span className={`integration-badge ${status?.state === 'installed' ? 'installed' : ''}`}>
          {!bridge
            ? 'Desktop only'
            : pending === 'checking'
              ? 'Checking…'
              : status
                ? labels[status.state]
                : 'Status unavailable'}
        </span>
      </div>
      <p className="integration-detail">
        {bridge
          ? status?.detail || 'Refresh to check the Lexicon plugin.'
          : 'Available in the desktop app.'}
      </p>
      <div className="integration-controls">
        <button
          className="button primary"
          disabled={!status?.available || !!pending || status.state === 'installed'}
          onClick={() => change(true)}
        >
          {pending === 'installing' && <LoaderCircle size={14} className="spinner" />}
          {pending === 'installing'
            ? 'Installing…'
            : status?.state === 'outdated'
              ? 'Update plugin'
              : 'Install plugin'}
        </button>
        <button
          className="button subtle"
          disabled={!status?.available || !!pending || !installed}
          onClick={() => change(false)}
        >
          {pending === 'removing' ? 'Removing…' : 'Remove plugin'}
        </button>
        {bridge && (
          <button
            className="icon-button"
            disabled={!!pending}
            aria-label="Refresh Lexicon plugin status"
            title="Refresh Lexicon plugin status"
            onClick={() => change()}
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
    </section>
  );
}
