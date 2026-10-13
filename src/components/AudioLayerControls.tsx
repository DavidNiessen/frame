import { changeMediaLayer } from '../core/media-layers';
import { keyframeValue, setKeyframe } from '../core/keyframes';
import { KeyframeEditor } from './KeyframeEditor';
import { useRef } from 'react';
import { useMonitorMediaVolume } from '../hooks/useMonitorVolume';
import { TransientMessage } from './TransientMessage';
import { useAudioPreview } from '../hooks/useAudioPreview';
import { pauseOtherMedia } from '../hooks/usePreviewEffects';
import { allAudioLayers, updateAudioLayers } from '../core/effect-instances';
import { audioLayerSource, type AudioLayer } from '../core/audio-layers';
import type { Editor } from '../hooks/useEditor';
import { editedDuration } from '../core/timeline';
import { TimelineSnapContext } from './TimelineSnapContext';
import { TimelineRange } from './TimelineRange';
import { LoudnessControls } from './LoudnessControls';
import { time } from '../core/format';

export function AudioLayerControls({
  editor,
  layer,
  current = 0,
  seek = () => {},
}: {
  editor: Editor;
  layer: AudioLayer;
  current?: number;
  seek?: (output: number) => void;
}) {
  const preview = useAudioPreview(editor),
    edit = editor.edit!,
    linkedPicture = edit.mediaLayers?.find((picture) => picture.audioLayerId === layer.id),
    tracks = allAudioLayers(edit),
    index = tracks.findIndex((item) => item.id === layer.id) + 1;
  const patch = (values: Partial<AudioLayer>) =>
    editor.update(
      updateAudioLayers(
        edit,
        tracks.map((item) => {
          if (item.id !== layer.id) return item;
          const next = {
            ...item,
            ...values,
            ...(item.volumeKeyframes && values.volume !== undefined
              ? {
                  volumeKeyframes: setKeyframe(
                    item.volumeKeyframes,
                    Math.max(0, Math.min(layer.end - layer.start, current - layer.start)),
                    values.volume,
                  ),
                }
              : {}),
          };
          return {
            ...next,
            fadeIn: Math.min(next.fadeIn, next.end - next.start),
            fadeOut: Math.min(next.fadeOut, next.end - next.start),
          };
        }),
      ),
    );
  const audio = useRef<HTMLAudioElement>(null);
  useMonitorMediaVolume(audio, preview.url);
  return (
    <div className="audio-layer-controls">
      <KeyframeEditor
        label="Volume"
        track={layer.volumeKeyframes}
        value={keyframeValue(layer.volumeKeyframes, current - layer.start, layer.volume)}
        min={0}
        max={3}
        current={current - layer.start}
        duration={layer.end - layer.start}
        change={(track) => patch({ volumeKeyframes: track })}
        seek={(at) => seek(layer.start + at)}
      />
      {!audioLayerSource(layer, editor.assets) && (
        <p className="field-note" role="alert">
          Import this source to restore its audio layer.
        </p>
      )}
      <section className="control-section">
        <p className="field-note">
          {time(layer.start)}–{time(layer.end)} in the sequence
          {layer.start >= editedDuration(edit) ? ' · outside current edit' : ''}. Drag the timeline
          bar to move it, or its edges to trim.
        </p>
        <label className="stacked-label">
          Volume ·{' '}
          {Math.round(
            keyframeValue(layer.volumeKeyframes, current - layer.start, layer.volume) * 100,
          )}
          %
          <input
            type="range"
            aria-label={`Track ${index} volume`}
            min={0}
            max={3}
            step={0.01}
            value={keyframeValue(layer.volumeKeyframes, current - layer.start, layer.volume)}
            onChange={(event) => patch({ volume: Number(event.target.value) })}
          />
        </label>
        <label className="switch-row">
          <span>Mute layer</span>
          <input
            type="checkbox"
            aria-label={`Mute track ${index}`}
            checked={layer.muted}
            onChange={(event) => patch({ muted: event.target.checked })}
          />
        </label>
        <label className="switch-row">
          <span>Loop source excerpt</span>
          <input
            type="checkbox"
            aria-label={`Loop track ${index}`}
            checked={layer.loop}
            disabled={!!linkedPicture || layer.sourceEnd - layer.sourceStart > 300}
            onChange={(event) => patch({ loop: event.target.checked })}
          />
        </label>
        <label className="stacked-label">
          Fade in · {layer.fadeIn.toFixed(2)}s
          <input
            type="range"
            aria-label={`Track ${index} fade in`}
            min={0}
            max={layer.end - layer.start}
            step={0.01}
            value={layer.fadeIn}
            onChange={(event) => patch({ fadeIn: Number(event.target.value) })}
          />
        </label>
        <label className="stacked-label">
          Fade out · {layer.fadeOut.toFixed(2)}s
          <input
            type="range"
            aria-label={`Track ${index} fade out`}
            min={0}
            max={layer.end - layer.start}
            step={0.01}
            value={layer.fadeOut}
            onChange={(event) => patch({ fadeOut: Number(event.target.value) })}
          />
        </label>
        {linkedPicture && (
          <div className="field-note">
            Picture and audio stay synchronized.{' '}
            <button
              className="button subtle small"
              onClick={() =>
                editor.update(changeMediaLayer(edit, linkedPicture.id, { audioLayerId: undefined }))
              }
            >
              Unlink picture and audio
            </button>
          </div>
        )}
        <details className="audio-source-excerpt">
          <summary>
            Source excerpt · {time(layer.sourceStart)}–{time(layer.sourceEnd)}
          </summary>
          <TimelineSnapContext value={{ enabled: false, targets: { source: [], output: [] } }}>
            <div className="timeline-lane">
              <TimelineRange
                wideHandles
                range={{ start: layer.sourceStart, end: layer.sourceEnd }}
                limits={{ start: 0, end: layer.source.duration }}
                duration={layer.source.duration}
                label={`Track ${index} source excerpt`}
                disabled={!!linkedPicture}
                onSelect={() => {}}
                onChange={(range) =>
                  patch({
                    sourceStart: range.start,
                    sourceEnd: range.end,
                    loop: layer.loop && range.end - range.start <= 300,
                  })
                }
              />
            </div>
          </TimelineSnapContext>
          <p className="field-note">
            Choose the part of the original file to use. Loop excerpts up to five minutes.
          </p>
        </details>
      </section>
      <section className="control-section">
        <div className="section-title">
          <h3>Mix settings</h3>
        </div>
        <label className="stacked-label">
          Layer purpose
          <select
            aria-label={`Track ${index} purpose`}
            value={layer.role ?? 'music'}
            onChange={(event) => patch({ role: event.target.value as AudioLayer['role'] })}
          >
            <option value="music">Background audio</option>
            <option value="voiceover">Dialogue</option>
          </select>
        </label>
        <label className="switch-row">
          <span>
            Duck music under dialogue
            <small>Lower background layers while original audio or dialogue plays.</small>
          </span>
          <input
            type="checkbox"
            aria-label="Duck music under dialogue"
            checked={edit.audioDucking ?? false}
            onChange={(event) => editor.update({ audioDucking: event.target.checked })}
          />
        </label>
        {edit.audioDucking && (
          <p className="field-note">
            Ducking uses the actual dialogue level. The player updates the processed mix
            automatically while you edit.
          </p>
        )}
        <label className="switch-row">
          <span>
            Protect mixed peaks<small>Limit the exported mix to avoid digital clipping.</small>
          </span>
          <input
            type="checkbox"
            aria-label="Protect mixed peaks"
            checked={edit.audioMixProtectPeaks !== false}
            onChange={(event) => editor.update({ audioMixProtectPeaks: event.target.checked })}
          />
        </label>
        <button
          className="button subtle small"
          disabled={preview.loading}
          onClick={() => void preview.generate()}
        >
          {preview.loading ? 'Preparing mix…' : 'Preview exported mix'}
        </button>
        {preview.url && (
          <audio
            ref={audio}
            className="effects-audio"
            aria-label="Exported mix preview"
            controls
            src={preview.url}
            onPlay={(event) => pauseOtherMedia(event.currentTarget)}
          />
        )}
        {preview.error && (
          <TransientMessage className="field-note" role="alert">
            {preview.error}
          </TransientMessage>
        )}
        <LoudnessControls editor={editor} />
      </section>
    </div>
  );
}
