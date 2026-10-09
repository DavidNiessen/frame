import { AudioLines, ChevronDown } from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
import { pauseOtherMedia } from '../hooks/usePreviewEffects';
import { useAudioPreview } from '../hooks/useAudioPreview';
export function AudioCleanupControls({ editor, effect }: { editor: Editor; effect?: 'normalize' | 'noise' | 'equalizer' }) {
  const preview = useAudioPreview(editor); const { edit, asset, update } = editor;
  if (!edit || !asset?.hasAudio) return null;
  return <details className="advanced" open={effect ? true : undefined}><summary><AudioLines size={15} />Audio cleanup & EQ<ChevronDown size={15} /></summary><div className="advanced-content">
    {(!effect || effect === 'normalize') && edit.normalizeLoudness && <label className="stacked-label">Loudness target <span className="unit">LUFS</span><input type="number" aria-label="Loudness target" min={-30} max={-5} step={1} value={edit.targetLufs} onChange={event => update({ targetLufs: Number(event.target.value) })} /></label>}
    {(!effect || effect === 'noise') && edit.reduceNoise && <div className="field-grid"><label>Reduction <span className="unit">dB</span><input type="number" aria-label="Noise reduction amount" min={1} max={30} value={edit.noiseStrength} onChange={event => update({ noiseStrength: Number(event.target.value) })} /></label><label>Noise floor <span className="unit">dB</span><input type="number" aria-label="Noise floor" min={-80} max={-20} value={edit.noiseFloor} onChange={event => update({ noiseFloor: Number(event.target.value) })} /></label></div>}
    {(!effect || effect === 'equalizer') && <div className="equalizer">{(['bass', 'mid', 'treble'] as const).map(band => <label key={band} className="stacked-label">{band} <span className="unit">{edit.equalizer[band]} dB</span><input type="range" aria-label={`Equalizer ${band}`} min={-12} max={12} step={1} value={edit.equalizer[band]} onChange={event => update({ equalizer: { ...edit.equalizer, [band]: Number(event.target.value) } })} /></label>)}<button className="button subtle small" onClick={() => update({ equalizer: { bass: 0, mid: 0, treble: 0 } })}>Reset equalizer</button></div>}
    <button className="button subtle small" disabled={preview.loading} onClick={() => void preview.generate()}>{preview.loading ? 'Preparing preview…' : 'Preview audio effects'}</button>
    {preview.url && <audio className="effects-audio" aria-label="Processed audio preview" controls src={preview.url} onPlay={event => pauseOtherMedia(event.currentTarget)} />}
    {preview.error && <p className="field-note" role="alert">{preview.error}</p>}
    <p className="field-note">Preview processes a retained section up to 10 seconds, without fades. Export processes the full edit. Volume gain applies after normalization; boosting it can clip.</p>
  </div></details>;
}
