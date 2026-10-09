import { Layers, MousePointer2 } from 'lucide-react';
import { editClips } from '../core/clips';
import { time } from '../core/format';
import type { Editor } from '../hooks/useEditor';
export function EffectScope({ editor, seek }: { editor: Editor; seek: (time: number) => void }) {
  if (!editor.edit) return null;
  const clips = editClips(editor.edit);
  return <div className="effect-scope"><span>{editor.selectedClip ? <MousePointer2 size={14} /> : <Layers size={14} />}Apply to</span>
    <select aria-label="Effect target" value={editor.selectedClip ?? 'all'} disabled={!!editor.busy} onChange={event => { const id = event.target.value; editor.selectClip(id === 'all' ? null : id); const clip = clips.find(clip => clip.id === id); if (clip) seek(clip.start); }}>
      <option value="all">All clips</option>{clips.map((clip, i) => <option key={clip.id} value={clip.id}>Clip {i + 1} · {time(clip.start)}–{time(clip.end)}</option>)}
    </select>
    {editor.selectedClip && <small>Only this clip changes. Other clips keep their settings.</small>}
  </div>;
}
