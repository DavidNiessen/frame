import { memo, useMemo } from 'react';
import { ChevronDown, Captions, AudioLines } from 'lucide-react';
import { fadeKeys, fadeLabel, fadeRange, resizeFade } from '../core/timed-effects';
import { keptRanges } from '../core/timeline';
import type { EditSettings, MediaAsset } from '../core/types';
import { TimelineRange } from './TimelineRange';
interface Props { asset: MediaAsset; edit: EditSettings; disabled: boolean; update: (patch: Partial<EditSettings>) => void; seek: (time: number) => void }
export const TimedLanes = memo(function TimedLanes({ asset, edit, disabled, update, seek }: Props) {
  const captionRows = useMemo(() => {
    const rows: { index: number; start: number; end: number; text: string }[][] = [];
    edit.subtitles.cues.map((cue, index) => ({ ...cue, index, start: Math.max(0, cue.start), end: Math.min(asset.duration, cue.end) }))
      .filter(cue => cue.end > cue.start).sort((a, b) => a.start - b.start).forEach(cue => {
        const row = rows.find(r => r.at(-1)!.end <= cue.start);
        if (row) row.push(cue); else rows.push([cue]);
      });
    return rows;
  }, [edit.subtitles.cues, asset.duration]);
  const fades = fadeKeys(asset).filter(key => edit[key] > 0), retained = keptRanges(edit);
  if (!captionRows.length && !fades.length) return null;
  return <div className="timed-lanes">
    {captionRows.length > 0 && <details className="timeline-lane-group" open>
      <summary><Captions size={14} />Captions <span>{edit.subtitles.cues.length}{edit.subtitles.mode === 'none' ? ' · off' : ''}</span><ChevronDown size={14} /></summary>
      {captionRows.map((row, rowIndex) => <div className="timeline-lane caption-lane" key={rowIndex}>
        {row.map(cue => <TimelineRange selectOnPointer key={cue.index} range={cue} limits={{ start: 0, end: asset.duration }} duration={asset.duration}
          label={`Caption ${cue.index + 1}`} text={cue.text} className={`caption-bar ${edit.subtitles.mode === 'none' ? 'inactive' : ''}`} disabled={disabled}
          onSelect={() => seek(cue.start)} onChange={range => update({ subtitles: { ...edit.subtitles,
            cues: edit.subtitles.cues.map((original, i) => i === cue.index ? { ...original, start: range.start, end: range.end } : original) } })} />)}
      </div>)}
    </details>}
    {fades.length > 0 && <details className="timeline-lane-group" open>
      <summary><AudioLines size={14} />Timed effects <span>{fades.length}</span><ChevronDown size={14} /></summary>
      {fades.map(key => <div className="timeline-lane effect-lane" key={key}>
        <TimelineRange selectOnPointer range={fadeRange(edit, key)} limits={{ start: retained[0]?.start ?? edit.start, end: retained.at(-1)?.end ?? edit.end }}
          duration={asset.duration} label={fadeLabel(key)} text={`${fadeLabel(key)} · ${edit[key].toFixed(2)}s`} className={`fade-bar ${key.endsWith('In') ? 'fade-in' : 'fade-out'}`} minimum={0.01 * edit.speed}
          edges={[key.endsWith('In') ? 'end' : 'start']} disabled={disabled} onSelect={() => seek(fadeRange(edit, key).start)}
          onChange={range => update(resizeFade(edit, key, range))} />
        <span className="effect-lane-label">{fadeLabel(key)} · {edit[key].toFixed(2)}s</span>
      </div>)}
    </details>}
  </div>;
});
