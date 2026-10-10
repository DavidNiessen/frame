import type { EditSettings } from '../core/types';
import { CaptionStyleControls } from './CaptionStyleControls';
export function SubtitleControls({ edit, update }: { edit: EditSettings; update: (patch: Partial<EditSettings>) => void }) {
  const subtitles = edit.subtitles, cue = subtitles.cues[0];
  if (!cue) return null;
  const change = (patch: Partial<typeof cue>) => update({ subtitles: { ...subtitles, cues: [{ ...cue, ...patch }] } });
  return <section className="control-section caption-settings">
    <label className="stacked-label">Caption text<textarea aria-label="Caption text" maxLength={2000} value={cue.text} onChange={event => change({ text: event.target.value })} /></label>
    <span className="cue-timing">{cue.start.toFixed(2)}–{cue.end.toFixed(2)}s</span>
    <p className="field-note">Drag this caption’s bar or its edges in the timeline to adjust timing.</p>
    <label className="stacked-label">Caption export<select value={subtitles.mode} onChange={event => update({ subtitles: { ...subtitles, mode: event.target.value as typeof subtitles.mode } })}><option value="none">Off</option><option value="burn">Burn into video</option><option value="embed">Embed selectable captions</option></select></label>
    {cue.position && <button className="button subtle small" onClick={() => change({ position: undefined })}>Reset caption position</button>}
    <CaptionStyleControls value={cue.style} change={style => change({ style })} selectable={subtitles.mode === 'embed'} />
    <p className="field-note">Drag this caption in the preview to place it. Arrow keys nudge; Shift moves faster. Selectable captions use the player’s layout and require MP4, MOV, MKV or WebM.</p>
  </section>;
}
