import { useLatest } from '../hooks/useLatest';
import { TransientMessage } from './TransientMessage';
import { MetadataControls } from './MetadataControls';
import { chapterFormats } from '../core/chapters';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, GripVertical, X, Combine } from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
import type { Merge } from '../hooks/useMerge';
import { availableFormats, getFormat } from '../core/formats';
import { outputSettings, type OutputSettings } from '../core/presets';
import { defaultTransition, type TransitionSettings } from '../core/transitions';
import { editedDuration } from '../core/timeline';
import { defaultSettings } from '../core/types';
export function MergeDialog({
  open,
  close,
  editor,
  merge,
}: {
  open: boolean;
  close: () => void;
  editor: Editor;
  merge: Merge;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const latestEditor = useLatest(editor);
  const [ids, setIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<OutputSettings | null>(null);
  const [transition, setTransition] = useState<TransitionSettings>({ ...defaultTransition });
  const drag = useRef<number | null>(null);
  useEffect(() => {
    const editor = latestEditor.current;
    if (open && editor.asset && editor.edit) {
      setIds(editor.assets.filter((a) => a.kind !== 'image').map((a) => a.id));
      setTransition({ ...defaultTransition });
      setSettings(outputSettings(editor.edit));
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open, latestEditor]);
  const clips = ids.map((id) => editor.assets.find((a) => a.id === id)!).filter(Boolean);
  const formats = availableFormats({
    kind: clips.every((a) => a.kind === 'video') ? 'video' : 'audio',
    hasAudio: clips.some((a) => a.hasAudio),
  });
  const format =
    settings && formats.some((f) => f.id === settings.format) ? settings.format : formats[0]?.id;
  const maxTransition = Math.min(
    30,
    ...ids.map((id) => editedDuration(editor.settingsFor(id)) / 2),
  );
  const running = editor.busy === 'merge';
  function move(from: number, to: number) {
    setIds((current) => {
      const next = [...current];
      const [id] = next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
  }
  return (
    <dialog
      ref={dialog}
      className="shortcuts-dialog project-dialog"
      aria-labelledby="merge-title"
      onCancel={(event) => {
        if (running) event.preventDefault();
        else close();
      }}
    >
      <div className="dialog-heading">
        <h2 id="merge-title">
          <Combine size={18} />
          Merge clips
        </h2>
        <button className="icon-button" aria-label="Close merge" disabled={running} onClick={close}>
          <X size={18} />
        </button>
      </div>
      <p className="project-intro">
        Arrange source clips below. Each keeps its current trims, cuts, crop, and volume. Video
        frames fit the first clip; missing video audio becomes silence.
      </p>
      <fieldset disabled={!!editor.busy}>
        <ol className="merge-clips">
          {clips.map((asset, index) => (
            <li
              key={`${asset.id}-${index}`}
              draggable={!editor.busy}
              onDragStart={(event) => {
                drag.current = index;
                event.dataTransfer.setData('application/x-frame-clip', String(index));
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (drag.current !== null) move(drag.current, index);
                drag.current = null;
              }}
            >
              <GripVertical size={15} />
              <span>
                {index + 1}. {asset.name}
              </span>
              <button
                className="icon-button"
                aria-label={`Move clip ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                className="icon-button"
                aria-label={`Move clip ${index + 1} down`}
                disabled={index === clips.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                className="icon-button"
                aria-label={`Remove merge clip ${index + 1}`}
                onClick={() => setIds((current) => current.filter((_, i) => i !== index))}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ol>
        <label className="stacked-label">
          Add a clip
          <select
            aria-label="Add merge clip"
            value=""
            onChange={(event) => {
              if (event.target.value) setIds((current) => [...current, event.target.value]);
            }}
          >
            <option value="">Choose imported media…</option>
            {editor.assets
              .filter((a) => a.kind !== 'image')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label className="stacked-label">
          Merge format
          <select
            aria-label="Merge format"
            value={format ?? ''}
            onChange={(event) =>
              setSettings((current) => ({
                ...(current ?? outputSettings(defaultSettings(editor.asset!))),
                format: event.target.value as OutputSettings['format'],
              }))
            }
          >
            {formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="stacked-label">
          Between clips
          <select
            aria-label="Merge transition"
            value={transition.type}
            onChange={(event) =>
              setTransition({
                type: event.target.value as TransitionSettings['type'],
                duration: Math.min(0.3, Math.max(0.05, maxTransition)),
              })
            }
          >
            <option value="none">Cut — no overlap</option>
            <option value="fade" disabled={maxTransition < 0.05}>
              Crossfade audio and video
            </option>
          </select>
        </label>
        {transition.type === 'fade' && (
          <label className="stacked-label">
            Transition duration <span className="unit">sec</span>
            <input
              type="number"
              aria-label="Transition duration"
              min={0.05}
              max={maxTransition}
              step={0.05}
              value={transition.duration}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value))
                  setTransition((current) => ({
                    ...current,
                    duration: Math.max(0.05, Math.min(maxTransition, value)),
                  }));
              }}
            />
          </label>
        )}
        {settings && (
          <label className="switch-row">
            <span>
              Include first clip artwork<small>For compatible audio formats</small>
            </span>
            <input
              type="checkbox"
              aria-label="Include merge artwork"
              checked={settings.includeArtwork}
              disabled={
                !format ||
                !getFormat(format).artwork ||
                !clips[0] ||
                (clips[0]?.artworkIndex === undefined &&
                  !editor.settingsFor(clips[0]?.id ?? '').customArtwork)
              }
              onChange={(event) =>
                setSettings((current) =>
                  current ? { ...current, includeArtwork: event.target.checked } : current,
                )
              }
            />
          </label>
        )}
        {settings && (
          <label className="switch-row">
            <span>
              Include chapters<small>Use clip names and timeline markers</small>
            </span>
            <input
              type="checkbox"
              aria-label="Include merge chapters"
              checked={settings.includeChapters ?? false}
              disabled={!format || !chapterFormats.includes(format)}
              onChange={(event) =>
                setSettings((current) =>
                  current ? { ...current, includeChapters: event.target.checked } : current,
                )
              }
            />
          </label>
        )}
        {settings && format !== 'gif' && (
          <MetadataControls
            tags={settings.outputTags}
            update={(outputTags) =>
              setSettings((current) => (current ? { ...current, outputTags } : current))
            }
          />
        )}
        <p className="field-note">
          {(
            ids.reduce((total, id) => total + editedDuration(editor.settingsFor(id)), 0) -
            (transition.type === 'fade' ? transition.duration * Math.max(0, ids.length - 1) : 0)
          ).toFixed(2)}{' '}
          seconds • output quality and bitrate use your current settings.
        </p>
      </fieldset>
      {merge.error && (
        <TransientMessage className="project-error" role="alert">
          {merge.error}
        </TransientMessage>
      )}
      {merge.result?.url && (
        <a className="button subtle small" href={merge.result.url} download={merge.result.name}>
          Save merged file
        </a>
      )}
      {merge.result?.path && <p className="saved-path">Saved to {merge.result.path}</p>}
      <div className="project-actions">
        {running ? (
          <button className="button subtle small" onClick={editor.cancel}>
            Cancel merge
          </button>
        ) : (
          <button
            className="button primary small"
            disabled={!!editor.busy || ids.length < 2 || !format}
            onClick={() => {
              if (settings && format) void merge.start(ids, { ...settings, format }, transition);
            }}
          >
            Export merged file
          </button>
        )}
      </div>
    </dialog>
  );
}
