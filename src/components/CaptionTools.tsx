import { TransientMessage } from './TransientMessage';
import { useRef, useState } from 'react';
import { captionItems } from '../core/caption-items';
import { importCaptionEffects } from '../core/caption-effects';
import { extraInstances, sourceRecipes } from '../core/effect-instances';
import { importSubtitles, outputCues, serializeSrt } from '../core/subtitles';
import type { Editor } from '../hooks/useEditor';
import { CaptionFindReplace } from './CaptionFindReplace';
import { sourceTimeAtOutput } from '../core/fades';

/** Batch tools live in the browser; a caption overlay only edits its own effect. */
export function CaptionTools({ editor, seek, openCaption }: { editor: Editor; seek: (time: number) => void; openCaption: (instanceId?: string) => void }) {
  const input = useRef<HTMLInputElement>(null), [error, setError] = useState('');
  const edit = editor.edit!, items = captionItems(edit);
  function save() {
    const cues = sourceRecipes(edit, 'captions').flatMap(({ recipe }) => outputCues(recipe)).sort((a, b) => a.start - b.start);
    const url = URL.createObjectURL(new Blob([serializeSrt(cues)], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = 'captions.srt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  return <details className="advanced caption-tools"><summary>Caption tools</summary><div className="advanced-content">
    <input ref={input} type="file" accept=".srt,.vtt" hidden aria-label="Import subtitle file" onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      void file.text().then(text => { editor.update(importCaptionEffects(edit, importSubtitles(text))); setError(''); }).catch(issue => setError(issue.message));
    }} />
    <button className="button subtle small" onClick={() => input.current?.click()}>Import SRT / VTT</button>
    <p className="field-note">Each imported caption becomes a separate timeline effect. Existing captions stay in place.</p>
    {!!items.length && <><CaptionFindReplace subtitles={{ mode: 'burn', cues: items }} change={subtitles => {
      const text = (instanceId: string | undefined, index: number) => subtitles.cues[items.findIndex(item => item.instanceId === instanceId && item.localIndex === index)].text;
      editor.update({ subtitles: { ...edit.subtitles, cues: edit.subtitles.cues.map((cue, index) => ({ ...cue, text: text(undefined, index) })) },
        effectInstances: extraInstances(edit).map(instance => instance.effect === 'captions' && instance.settings.subtitles ? { ...instance, settings: { subtitles: { ...instance.settings.subtitles, cues: instance.settings.subtitles.cues.map((cue, index) => ({ ...cue, text: text(instance.id, index) })) } } } : instance),
      });
    }} jump={index => { seek(items[index].timeSpace === 'output' ? sourceTimeAtOutput(edit, items[index].start) : items[index].start); openCaption(items[index].instanceId); }} /><button className="button subtle small" onClick={save}>Save output SRT</button></>}
    {error && <TransientMessage role="alert">{error}</TransientMessage>}
  </div></details>;
}
