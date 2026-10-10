import { TransientMessage } from './TransientMessage';
import { useState } from 'react';
import type { DesktopCapabilities, Acceleration } from '../core/hardware';
import type { Editor } from '../hooks/useEditor';
import type { Proxies } from '../hooks/useProxies';
import { bytes } from '../core/format';
export function DesktopControls({ editor, proxies }: { editor: Editor; proxies: Proxies }) {
  const [capabilities, setCapabilities] = useState<DesktopCapabilities | null>(null), [error, setError] = useState('');
  if (editor.platform !== 'desktop' || !editor.edit) return null;
  const edit = editor.edit;
  async function detect() { try { const result = await editor.runExclusive('analysis', e => { if (!e.desktopCapabilities) throw new Error('Desktop engine unavailable.'); return e.desktopCapabilities(() => {}); }); setCapabilities(result); setError(''); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  return <details className="advanced"><summary>Desktop performance</summary><div className="advanced-content">
    <label className="stacked-label">Export encoder<select aria-label="Desktop export encoder" value={edit.acceleration} onChange={e => editor.update({ acceleration: e.target.value as Acceleration })}><option value="software">Portable software FFmpeg</option><option value="auto">Automatic hardware acceleration</option>{[...new Set([...(capabilities?.encoders ?? []), ...(edit.acceleration !== 'software' && edit.acceleration !== 'auto' ? [edit.acceleration] : [])])].map(encoder => <option key={encoder} value={encoder}>{encoder}</option>)}</select></label>
    <button className="button subtle small" onClick={() => void detect()} disabled={!!editor.busy}>Check hardware encoders</button>
    {capabilities && <TransientMessage role="status">{capabilities.encoders.length ? `Usable encoders: ${capabilities.encoders.join(', ')}` : 'No usable hardware encoder found. Software FFmpeg remains available.'}</TransientMessage>}
    <p className="field-note">Hardware acceleration applies to H.264 video (MP4/MOV/MKV). Encoders are tested on this device; unavailable or failing hardware falls back to software. Hardware quality/compression can differ. Other formats use software.</p>
    {proxies.proxy ? <><p>Lightweight preview active · {bytes(proxies.proxy.size)}</p><button className="button subtle small" onClick={() => void proxies.clear()}>Use original preview</button></> : <button className="button subtle small" disabled={!!editor.busy} onClick={() => void proxies.generate()}>{proxies.loading ? 'Preparing proxy…' : 'Create lightweight preview'}</button>}
    <p className="field-note">Proxies convert the original to a temporary MP4 (up to 720 pixels) or MP3 for smoother, compatible playback. Edits and final exports always use the original. Proxies are removed when the source or session closes.</p>{(error || proxies.error) && <TransientMessage role="alert">{error || proxies.error}</TransientMessage>}
  </div></details>;
}
