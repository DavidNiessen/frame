import { useLoadingActivity } from '../hooks/useLoadingActivity';
import { TransientMessage } from './TransientMessage';
import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { prepareCoverArtwork } from '../core/prepare-cover';
export function CoverArtworkControls({ artwork, update, bulk = false }: { artwork?: string | null; update: (artwork: string | null) => void; bulk?: boolean }) {
  const input = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useLoadingActivity(busy, 'Preparing artwork…');
  return <div className="cover-artwork-controls"><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose cover artwork" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setBusy(true); setError(''); void prepareCoverArtwork(file).then(update).catch(issue => setError((issue as Error).message)).finally(() => setBusy(false)); }} />{artwork && <div className="cover-artwork-preview"><img src={artwork} alt="Custom cover artwork" /><span>{bulk ? 'Used for every selected file' : 'Replaces embedded source artwork'}<small>{bulk ? 'Used for this conversion session' : 'Saved locally with the project'}</small></span><button type="button" className="icon-button" aria-label="Remove custom cover artwork" onClick={() => update(null)}><X size={14} /></button></div>}<button type="button" className="button subtle small" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={14} />{busy ? 'Preparing artwork…' : artwork ? 'Replace cover artwork' : 'Add cover artwork'}</button>{error && <TransientMessage className="field-note" role="alert">{error}</TransientMessage>}<p className="field-note">PNG, JPEG or WebP · large covers are resized. Export presets keep your format settings; artwork stays with this {bulk ? 'conversion session' : 'project'}.</p></div>;
}
