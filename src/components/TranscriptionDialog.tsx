import { useEffect, useRef, useState } from 'react';
import { Captions, X } from 'lucide-react';
import {
  speechModel,
  speechLanguages,
  addTranscription,
  type TranscriptionOptions,
} from '../core/transcription';
import { editedDuration } from '../core/timeline';
import type { SubtitleCue } from '../core/subtitles';
import type { Editor } from '../hooks/useEditor';
import { time } from '../core/format';
export function TranscriptionDialog({ editor, close }: { editor: Editor; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null),
    active = useRef(true),
    cancel = useRef<(() => void) | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [cues, setCues] = useState<SubtitleCue[] | null>(null),
    [options, setOptions] = useState<TranscriptionOptions>({
      start: 0,
      end: Math.min(600, editedDuration(editor.edit!)),
      language: 'auto',
    });
  useEffect(() => {
    dialog.current?.showModal();
    active.current = true;
    return () => {
      active.current = false;
      cancel.current?.();
    };
  }, []);
  async function transcribe() {
    setLoading(true);
    setError('');
    setCues(null);
    try {
      const result = await editor.runExclusive('analysis', async (engine) => {
        cancel.current = () => engine.cancel();
        return engine.transcribe(editor.asset!, editor.edit!, options, () => {});
      });
      if (active.current) setCues(result);
    } catch (error) {
      if (active.current) setError((error as Error).message);
    } finally {
      cancel.current = null;
      if (active.current) setLoading(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="shortcuts-dialog transcription-dialog"
      aria-label="Generate captions locally"
      onCancel={(event) => {
        if (loading) {
          event.preventDefault();
          cancel.current?.();
        } else close();
      }}
    >
      <div className="dialog-heading">
        <h2>
          <Captions size={18} />
          Generate captions
        </h2>
        <button
          className="icon-button"
          aria-label="Close caption generation"
          onClick={() => {
            cancel.current?.();
            close();
          }}
        >
          <X size={18} />
        </button>
      </div>
      <p>Turn speech in the edited sequence into individual caption effects.</p>
      <p className="field-note">
        Whisper Tiny runs on your device. The first run downloads about{' '}
        {speechModel.downloadMegabytes} MB from Hugging Face and caches it for offline use. Your
        audio is never uploaded. Review names, punctuation and timing before export.
      </p>
      <fieldset disabled={loading || !!editor.busy} className="transcription-options">
        <label className="stacked-label">
          Speech language
          <select
            aria-label="Speech language"
            value={options.language}
            onChange={(event) =>
              setOptions({
                ...options,
                language: event.target.value as TranscriptionOptions['language'],
              })
            }
          >
            {speechLanguages.map((language) => (
              <option key={language} value={language}>
                {language === 'auto'
                  ? 'Detect automatically'
                  : language[0].toUpperCase() + language.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <div className="field-pair">
          <label className="stacked-label">
            Sequence start (seconds)
            <input
              aria-label="Transcription start"
              type="number"
              min={0}
              max={editedDuration(editor.edit!)}
              step={0.1}
              value={options.start}
              onChange={(event) => setOptions({ ...options, start: Number(event.target.value) })}
            />
          </label>
          <label className="stacked-label">
            Sequence end (seconds)
            <input
              aria-label="Transcription end"
              type="number"
              min={0.1}
              max={editedDuration(editor.edit!)}
              step={0.1}
              value={options.end}
              onChange={(event) => setOptions({ ...options, end: Number(event.target.value) })}
            />
          </label>
        </div>
        <p className="field-note">
          Up to 10 minutes per pass. Includes timeline cuts, playback speed and the audio mix.
        </p>
      </fieldset>
      {loading ? (
        <button className="button subtle" onClick={() => cancel.current?.()}>
          Cancel transcription
        </button>
      ) : (
        <button
          className="button primary"
          disabled={!!editor.busy}
          onClick={() => void transcribe()}
        >
          <Captions size={16} />
          {cues ? 'Generate again' : 'Generate captions locally'}
        </button>
      )}
      {error && (
        <p role="alert" className="field-note">
          {error}
        </p>
      )}
      {cues && (
        <section className="transcription-review" aria-label="Generated captions">
          <h3>{cues.length ? `${cues.length} captions ready to review` : 'No speech detected'}</h3>
          {cues.slice(0, 8).map((cue, index) => (
            <p key={index}>
              <span>
                {time(cue.start)}–{time(cue.end)}
              </span>
              {cue.text}
            </p>
          ))}
          {cues.length > 8 && (
            <p className="field-note">
              And {cues.length - 8} more. All captions remain editable on the timeline.
            </p>
          )}{' '}
          {!!cues.length && (
            <button
              className="button primary"
              disabled={!!editor.busy}
              onClick={() => {
                try {
                  editor.update(addTranscription(editor.edit!, cues));
                  close();
                  editor.setNotice(
                    `Added ${cues.length} individual captions. Review their text and timing in the timeline.`,
                  );
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            >
              Add {cues.length} captions to timeline
            </button>
          )}
        </section>
      )}
    </dialog>
  );
}
