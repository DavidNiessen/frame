import { defaultGeometry } from '../core/geometry';
import { MediaLayerPreview } from './MediaLayerPreview';
import { CanvasGuides } from './CanvasGuides';
import { CanvasGuidesMenu } from './CanvasGuidesMenu';
import { ShapePreview } from './ShapePreview';
import { PaintLayersPreview } from './PaintLayersPreview';
import { PaintingCanvas } from './PaintingCanvas';
import { instanceRecipe } from '../core/effect-instances';
import { useAudioBackdrop } from '../hooks/useAudioBackdrop';
import { useRealtimeAudio } from '../hooks/useRealtimeAudio';
import { MonitorVolume } from './MonitorVolume';
import { useLatest } from '../hooks/useLatest';
import type { EffectId } from '../core/effect-library';
import { captionItems } from '../core/caption-items';
import { changeInstance, extraInstances } from '../core/effect-instances';
import { stackedGeometryPreview, colorPreview } from '../core/visual-preview';
import { AudioMixPreview, ProcessedAudioPreview } from './AudioMixPreview';
import { GradedVideo } from './GradedVideo';
import { hasRealtimeGrade } from '../core/realtime-grade';
import { realtimeGradeFor } from '../engines/grade-renderer';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import {
  AudioLines,
  Maximize,
  Minimize,
  Pause,
  Play,
  SkipBack,
  StepBack,
  StepForward,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import type { PreviewRange } from '../core/preview-clock';
import type { EditSettings, MediaAsset } from '../core/types';
import { clipAtSource, clipPositions, clipRecipe } from '../core/clips';
import { outputTimeAtSource, sourceTimeAtOutput } from '../core/fades';
import { editedDuration, nextPlayableTime } from '../core/timeline';
import { time } from '../core/format';
import {
  applyPreviewEffects,
  usePreviewEffects,
  pauseOtherMedia,
} from '../hooks/usePreviewEffects';
import { frameDimensions, geometryPreview } from '../core/geometry';
import { OverlayPreview } from './OverlayPreview';
import { CropOverlay } from './CropOverlay';
import { CaptionPreview } from './CaptionPreview';
import { MediaInfo } from './MediaInfo';
import { PlaybackLoop, type LoopMode } from './PlaybackLoop';
import { editClips } from '../core/clips';
import { GoToTime } from './GoToTime';
import { preciseTimecode, stepFrame } from '../core/playhead';
import {
  configurePreviewClock,
  hasPreviewClock,
  readPreviewTime,
  seekPreviewTime,
} from '../core/preview-clock';
export function Preview({
  asset,
  edit,
  previewUrl,
  previewRanges,
  previewProcessed = false,
  previewGeometryProcessed = false,
  previewAudio,
  openMediaLayer,
  selectedMediaLayer,
  effectsRequested = false,
  previewStale = false,
  preparing = false,
  previewError,
  retryPreview,
  mediaRef,
  current,
  setCurrent,
  update,
  disabled,
  expanded,
  toggleExpanded,
  panelRef,
  selectedClip,
  assets,
  openEffect,
  selectedEffect,
  notify,
}: {
  notify: (message: string) => void;
  openEffect: (id: EffectId, instanceId?: string) => void;
  selectedEffect: { id: EffectId; instanceId?: string } | null;
  assets: MediaAsset[];
  selectedClip: string | null;
  expanded: boolean;
  toggleExpanded: () => void;
  panelRef: RefObject<HTMLElement | null>;
  previewRanges?: PreviewRange[];
  previewProcessed?: boolean;
  previewGeometryProcessed?: boolean;
  /** Processed soundtrack for audio-only corrections, synced to the playing source video. */
  previewAudio?: { url: string; ranges: PreviewRange[] };
  openMediaLayer: (id: string, keepView?: boolean) => void;
  selectedMediaLayer?: string;
  effectsRequested?: boolean;
  previewStale?: boolean;
  preparing?: boolean;
  previewError?: string;
  retryPreview?: () => void;
  previewUrl?: string;
  asset: MediaAsset;
  edit: EditSettings;
  mediaRef: RefObject<HTMLMediaElement | null>;
  current: number;
  setCurrent: (value: number) => void;
  update: (patch: Partial<EditSettings>) => void;
  disabled: boolean;
}) {
  const [loop, setLoop] = useState<LoopMode>('off'),
    [loopClip, setLoopClip] = useState<string | null>(null);
  const targetClip = useMemo(
    () => editClips(edit).find((clip) => clip.id === loopClip),
    [edit, loopClip],
  );
  const playbackEdit = useMemo(
    () =>
      loop === 'clip' && targetClip
        ? {
            ...edit,
            clips: editClips(edit).filter((clip) =>
              targetClip.groupId ? clip.groupId === targetClip.groupId : clip.id === targetClip.id,
            ),
          }
        : edit,
    [edit, loop, targetClip],
  );
  useEffect(() => {
    setLoop('off');
    setLoopClip(null);
  }, [asset.id]);
  useEffect(() => {
    if (loop === 'clip' && !targetClip) {
      setLoop('off');
      setLoopClip(null);
    }
  }, [edit, loop, targetClip]);
  useEffect(() => {
    if (loop === 'clip' && selectedClip) setLoopClip(selectedClip);
  }, [selectedClip, loop]);
  const [playing, setPlaying] = useState(false);
  const audioBackdrop = useRef<HTMLDivElement>(null);
  useAudioBackdrop(mediaRef, audioBackdrop, asset.kind === 'audio', asset.id);
  useRealtimeAudio(mediaRef, edit, asset.id);
  useEffect(() => {
    setPlaying(false);
  }, [asset.id]);
  const [failed, setFailed] = useState(false);
  const position = outputTimeAtSource(
    edit,
    current,
    mediaRef.current && hasPreviewClock(mediaRef.current)
      ? mediaRef.current.currentTime
      : undefined,
  );
  const clip = edit.clips
    ? (clipPositions(edit).find((item) => position >= item.start && position < item.end)?.clip ??
      clipAtSource(edit, current))
    : undefined;
  const recipe = clip ? clipRecipe(edit, clip) : edit;
  const trackCrop = !recipe.crop
    ? extraInstances(recipe, 'crop').find((instance) => instance.timeSpace === 'output')
    : undefined;
  const visual = trackCrop
    ? {
        ...recipe,
        crop: trackCrop.settings.crop ?? null,
        effectInstances: extraInstances(recipe).filter((instance) => instance.id !== trackCrop.id),
      }
    : recipe;
  const stackedVisual = extraInstances(visual).some(
    (instance) =>
      (instance.effect === 'crop' && instance.settings.crop) ||
      (instance.effect === 'transform' &&
        instance.settings.geometry &&
        (instance.settings.geometry.rotation ||
          instance.settings.geometry.flipHorizontal ||
          instance.settings.geometry.flipVertical ||
          instance.settings.geometry.resize)),
  );
  const renderedDimensions = frameDimensions(asset, visual);
  const displayAsset = previewGeometryProcessed ? { ...asset, ...renderedDimensions } : asset;
  const overlayEdit: EditSettings = previewGeometryProcessed
    ? {
        ...edit,
        crop: null,
        geometry: defaultGeometry(),
        effectInstances: extraInstances(edit).filter(
          (i) => !['crop', 'transform'].includes(i.effect),
        ),
        clips: edit.clips?.map((c) => ({
          ...c,
          effects: {
            ...c.effects,
            crop: null,
            geometry: defaultGeometry(),
            effectInstances: c.effects.effectInstances?.filter(
              (i) => !['crop', 'transform'].includes(i.effect),
            ),
          },
        })),
      }
    : edit;
  const geometry = previewGeometryProcessed
    ? geometryPreview(displayAsset, {
        ...visual,
        crop: null,
        geometry: defaultGeometry(),
        effectInstances: [],
      })
    : stackedVisual
      ? stackedGeometryPreview(asset, visual)
      : geometryPreview(asset, visual);
  const dimensions =
    visual.crop && !stackedVisual && !previewGeometryProcessed
      ? { width: asset.width ?? 640, height: asset.height ?? 360 }
      : frameDimensions(asset, visual);
  const sourceUrl = previewUrl ?? asset.previewUrl;
  const sequenceStart = edit.clips?.[0]?.start ?? edit.start;
  const gif = /\.gif$/i.test(asset.name) && !previewUrl;
  const loadedSource = useRef(''),
    desired = useRef(current);
  desired.current = current;
  const handoff = useRef({ assetId: asset.id, url: sourceUrl, resume: false });
  if (handoff.current.url !== sourceUrl) {
    if (mediaRef.current && hasPreviewClock(mediaRef.current))
      mediaRef.current.dataset.previewSeekOutput = String(position);
    const pending = loadedSource.current !== handoff.current.url;
    handoff.current = {
      assetId: asset.id,
      url: sourceUrl,
      resume:
        handoff.current.assetId === asset.id &&
        !disabled &&
        !!mediaRef.current &&
        (!mediaRef.current.paused || (pending && handoff.current.resume)),
    };
  }
  const [audioFailed, setAudioFailed] = useState('');
  const separateAudio =
    asset.kind === 'video' && !!previewAudio && audioFailed !== previewAudio.url;
  const [gradeFailed, setGradeFailed] = useState(false);
  const realtimeGrade = realtimeGradeFor(asset) && !gradeFailed;
  const graded = useMemo(() => hasRealtimeGrade(edit), [edit]);
  // Media-layer previews bake color and geometry, so the GPU grade must not apply twice.
  const liveGrade = realtimeGrade && graded && !gif && !previewGeometryProcessed;
  const colorFilter =
    liveGrade || previewGeometryProcessed || (previewProcessed && !realtimeGradeFor(asset))
      ? 'none'
      : colorPreview(visual, current, position);
  const sourceReset = useLatest({ sequenceStart, setCurrent });
  useEffect(() => {
    sourceReset.current.setCurrent(sourceReset.current.sequenceStart);
  }, [asset.id, sourceReset]);
  useEffect(() => {
    setFailed(false);
  }, [sourceUrl]);
  usePreviewEffects(
    mediaRef,
    playbackEdit,
    playing,
    current,
    asset.id,
    setCurrent,
    loop !== 'off',
    edit,
  );
  useEffect(() => {
    if (disabled) {
      handoff.current.resume = false;
      mediaRef.current?.pause();
    }
  }, [disabled, mediaRef]);
  function pauseSeek(source: number, output?: number) {
    handoff.current.resume = false;
    mediaRef.current?.pause();
    setPlaying(false);
    if (mediaRef.current) seekPreviewTime(mediaRef.current, source, output);
    setCurrent(source);
  }
  function step(direction: -1 | 1) {
    pauseSeek(stepFrame(edit, current, asset.frameRate ?? 30, direction));
  }
  function skip(direction: -1 | 1) {
    const media = mediaRef.current;
    if (!media) return;
    const position = outputTimeAtSource(
      edit,
      readPreviewTime(media),
      hasPreviewClock(media) ? media.currentTime : undefined,
    );
    const output = Math.max(0, Math.min(editedDuration(edit), position + direction * 5));
    const source = sourceTimeAtOutput(edit, output);
    seekPreviewTime(media, source, output);
    setCurrent(source);
  }
  function toggle() {
    const media = mediaRef.current;
    if (!media || failed) return;
    // A source swap temporarily pauses the decoder. The visible Pause action
    // must cancel its pending resume rather than starting playback again.
    if (playing || handoff.current.resume || !media.paused) {
      handoff.current.resume = false;
      media.pause();
      setPlaying(false);
    } else {
      const next = nextPlayableTime(playbackEdit, readPreviewTime(media));
      const start = next ?? playbackEdit.clips?.[0]?.start ?? playbackEdit.start;
      seekPreviewTime(media, start);
      void media.play().catch(() => setFailed(true));
    }
  }
  const mediaEvents = {
    onPlay: () => {
      if (mediaRef.current) pauseOtherMedia(mediaRef.current);
      setPlaying(true);
    },
    onPause: () => {
      if (!handoff.current.resume) setPlaying(false);
      if (mediaRef.current && loadedSource.current === sourceUrl)
        setCurrent(readPreviewTime(mediaRef.current));
    },
    onEnded: () => {
      const media = mediaRef.current;
      if (!media || loadedSource.current !== sourceUrl) return;
      // The source may end before the animation frame can advance a reordered clip.
      const index = hasPreviewClock(media)
        ? -1
        : (playbackEdit.clips?.findIndex((item) => Math.abs(item.end - media.duration) < 0.1) ??
          -1);
      const next = index >= 0 ? playbackEdit.clips?.[index + 1] : undefined;
      seekPreviewTime(
        media,
        next?.start ?? playbackEdit.clips?.[0]?.start ?? playbackEdit.start,
        next ? undefined : 0,
      );
      setCurrent(readPreviewTime(media));
      if (next || loop !== 'off') {
        applyPreviewEffects(media, edit);
        void media.play().catch(() => setFailed(true));
      } else setPlaying(false);
    },
    onError: () => setFailed(true),
    onLoadedMetadata: () => {
      if (mediaRef.current) {
        loadedSource.current = sourceUrl;
        delete mediaRef.current.dataset.previewSwitching;
        const source = nextPlayableTime(edit, desired.current) ?? sequenceStart;
        seekPreviewTime(
          mediaRef.current,
          source,
          mediaRef.current.dataset.previewSeekOutput !== undefined
            ? Number(mediaRef.current.dataset.previewSeekOutput)
            : undefined,
        );
        delete mediaRef.current.dataset.previewSeekOutput;
        setCurrent(source);
        applyPreviewEffects(mediaRef.current, edit);
        const resume = handoff.current.resume;
        handoff.current.resume = false;
        if (resume && !disabled) void mediaRef.current.play().catch(() => setFailed(true));
        else setPlaying(!mediaRef.current.paused && !disabled);
      }
    },
    onTimeUpdate: () => {
      const media = mediaRef.current;
      if (!media) return;
      if (media.paused && loadedSource.current === sourceUrl) setCurrent(readPreviewTime(media));
    },
  };
  return (
    <section ref={panelRef} id="media-preview" className="preview-panel" aria-label="Media preview">
      <div className="workspace-heading">
        <div>
          <h2 title={asset.name}>{asset.name}</h2>
        </div>
        <div className="preview-source-info">
          <span className="badge">
            {asset.kind === 'video' ? `${asset.width} × ${asset.height}` : 'Audio'} <span>·</span>{' '}
            {time(asset.duration)}
          </span>
          <MediaInfo asset={asset} />
        </div>
      </div>
      <div className={`preview-stage ${asset.kind === 'audio' ? 'audio-stage' : ''}`}>
        {asset.kind === 'video' ? (
          <div
            className="media-frame"
            data-canvas-guides
            style={
              {
                aspectRatio: `${dimensions.width} / ${dimensions.height}`,
                '--frame-ratio': dimensions.width / dimensions.height,
              } as CSSProperties
            }
          >
            <CanvasGuides>
              {gif ? (
                <img
                  style={{ ...geometry, filter: colorFilter }}
                  src={sourceUrl}
                  alt="Animated source preview"
                />
              ) : (
                <video
                  crossOrigin="anonymous"
                  data-frame-source={asset.id}
                  style={{
                    ...geometry,
                    filter: colorFilter,
                    ...(liveGrade ? { visibility: 'hidden' as const } : {}),
                  }}
                  data-preview-effects={previewProcessed ? 'rendered' : undefined}
                  data-preview-audio={separateAudio ? 'separate' : undefined}
                  data-preview-preparing={preparing || undefined}
                  data-preview-stale={previewStale || undefined}
                  ref={(node) => {
                    mediaRef.current = node;
                    if (node) {
                      configurePreviewClock(node, previewRanges);
                      if (loadedSource.current !== sourceUrl)
                        node.dataset.previewSwitching = 'true';
                    }
                  }}
                  src={sourceUrl}
                  {...mediaEvents}
                  playsInline
                  preload="metadata"
                />
              )}
              {liveGrade && (
                <GradedVideo
                  mediaRef={mediaRef}
                  asset={asset}
                  edit={edit}
                  style={geometry}
                  onFailure={() => setGradeFailed(true)}
                />
              )}
              <div
                className="paint-preview-area"
                style={
                  visual.crop && !stackedVisual && !previewGeometryProcessed
                    ? {
                        left: `${(visual.crop.x / asset.width!) * 100}%`,
                        top: `${(visual.crop.y / asset.height!) * 100}%`,
                        width: `${(visual.crop.width / asset.width!) * 100}%`,
                        height: `${(visual.crop.height / asset.height!) * 100}%`,
                      }
                    : undefined
                }
              >
                {selectedEffect?.id === 'painting' &&
                  (() => {
                    const instance = edit.effectInstances?.find(
                      (item) => item.id === selectedEffect.instanceId,
                    );
                    const recipe = instance ? instanceRecipe(edit, instance) : edit;
                    return (
                      <PaintingCanvas
                        showExisting
                        edit={recipe}
                        update={(patch) =>
                          update(instance ? changeInstance(edit, instance.id, null, patch) : patch)
                        }
                        width={frameDimensions(asset, recipe).width}
                        height={frameDimensions(asset, recipe).height}
                        disabled={disabled}
                        onError={notify}
                      />
                    );
                  })()}
                <PaintLayersPreview
                  edit={recipe}
                  current={current}
                  position={position}
                  selected={
                    selectedEffect?.id === 'painting'
                      ? (selectedEffect.instanceId ?? 'primary')
                      : undefined
                  }
                />
              </div>
              {selectedEffect?.id !== 'crop' && (
                <MediaLayerPreview
                  edit={overlayEdit}
                  assets={assets}
                  position={position}
                  selectedId={selectedMediaLayer}
                  disabled={disabled}
                  update={update}
                  openLayer={openMediaLayer}
                  pause={() => mediaRef.current?.pause()}
                />
              )}
              <ShapePreview
                edit={overlayEdit}
                asset={displayAsset}
                current={current}
                position={position}
                disabled={disabled}
                update={update}
                pause={() => mediaRef.current?.pause()}
                openEffect={openEffect}
                selectedEffect={selectedEffect}
              />
              <OverlayPreview
                outputPosition={position}
                current={current}
                edit={overlayEdit}
                asset={displayAsset}
                disabled={disabled}
                update={update}
                pause={() => mediaRef.current?.pause()}
                openEffect={openEffect}
                selectedEffect={selectedEffect}
              />
              {captionItems(edit).some((cue) => cue.mode !== 'none') && (
                <CaptionPreview
                  outputPosition={position}
                  openEffect={openEffect}
                  selectedEffect={selectedEffect}
                  asset={displayAsset}
                  edit={{
                    ...overlayEdit,
                    crop: previewGeometryProcessed || stackedVisual ? null : visual.crop,
                  }}
                  current={current}
                  disabled={disabled}
                  pause={() => mediaRef.current?.pause()}
                  update={update}
                />
              )}
              {!previewGeometryProcessed &&
                !stackedVisual &&
                visual.crop &&
                asset.width &&
                asset.height && (
                  <CropOverlay
                    crop={visual.crop!}
                    width={asset.width}
                    height={asset.height}
                    disabled={disabled}
                    onChange={(crop) =>
                      update(
                        trackCrop
                          ? changeInstance(edit, trackCrop.id, null, { crop })
                          : clip
                            ? {
                                clips: edit.clips!.map((item) =>
                                  item.id === clip.id
                                    ? { ...item, effects: { ...item.effects, crop } }
                                    : item,
                                ),
                              }
                            : { crop },
                      )
                    }
                  />
                )}
            </CanvasGuides>
          </div>
        ) : (
          <div className="audio-preview" ref={audioBackdrop}>
            <span className="audio-reactive-glow" aria-hidden="true" />
            <span className="audio-orbit" />
            <span className="audio-orbit second" />
            <div className="audio-art">
              <AudioLines size={54} strokeWidth={1.25} />
            </div>
            <h3>{asset.name.replace(/\.[^.]+$/, '')}</h3>
            <p>
              {asset.audioChannels
                ? `${asset.audioChannels === 1 ? 'Mono' : asset.audioChannels === 2 ? 'Stereo' : `${asset.audioChannels} channels`}${asset.audioSampleRate ? ` · ${asset.audioSampleRate / 1000} kHz` : ''}`
                : 'Audio source'}
            </p>
            <audio
              crossOrigin="anonymous"
              data-frame-source={asset.id}
              data-preview-effects={previewProcessed ? 'rendered' : undefined}
              data-preview-preparing={preparing || undefined}
              data-preview-stale={previewStale || undefined}
              ref={(node) => {
                mediaRef.current = node;
                if (node) {
                  configurePreviewClock(node, previewRanges);
                  if (loadedSource.current !== sourceUrl) node.dataset.previewSwitching = 'true';
                }
              }}
              src={sourceUrl}
              {...mediaEvents}
              preload="metadata"
            />
          </div>
        )}
        {failed && (
          <div className="preview-error">
            <p>This format cannot be previewed here.</p>
            <span>You can still edit and convert it to MP4 or MP3.</span>
          </div>
        )}
        <span className="preview-label">
          {edit.crop
            ? 'Drag the crop or its corners'
            : edit.subtitles.mode === 'burn' &&
                edit.subtitles.cues.some((c) => current >= c.start && current < c.end)
              ? 'Click for settings · double-click text to edit · drag corners to resize'
              : gif
                ? 'GIF source loops · edits apply on export'
                : edit.videoFadeIn || edit.videoFadeOut
                  ? 'Fade preview • source frame'
                  : liveGrade
                    ? 'Real-time effects preview'
                    : previewProcessed
                      ? 'Effects preview'
                      : previewRanges
                        ? 'Continuous sequence preview'
                        : previewUrl
                          ? 'Lightweight proxy preview'
                          : 'Original preview'}
        </span>
      </div>
      {previewError && (
        <div className="continuous-preview-status" role="status">
          {effectsRequested ? 'Effects preview unavailable.' : 'Continuous preview unavailable.'}{' '}
          {previewError}{' '}
          <button className="quiet-button" onClick={retryPreview}>
            Retry preview
          </button>
        </div>
      )}
      <AudioMixPreview
        outputPosition={position}
        assets={assets}
        edit={edit}
        current={current}
        playing={playing && !disabled && !previewProcessed && !separateAudio}
      />
      {separateAudio && (
        <ProcessedAudioPreview
          url={previewAudio.url}
          ranges={previewAudio.ranges}
          current={current}
          position={position}
          playing={playing && !disabled}
          onFailure={() => setAudioFailed(previewAudio.url)}
        />
      )}
      {expanded && (
        <div className="fullscreen-scrubber" data-preview-playback>
          <input
            type="range"
            aria-label="Fullscreen playback position"
            aria-valuetext={`${position.toFixed(2)} of ${editedDuration(edit).toFixed(2)} seconds`}
            min={0}
            max={editedDuration(edit)}
            step={0.01}
            value={position}
            disabled={disabled || gif || failed}
            onChange={(event) => {
              const output = Number(event.target.value),
                source = sourceTimeAtOutput(edit, output);
              if (mediaRef.current) seekPreviewTime(mediaRef.current, source, output);
              setCurrent(source);
            }}
          />
        </div>
      )}
      <div className="transport" data-preview-playback>
        <div className="transport-left">
          <button
            className="icon-button"
            aria-label="Back to trim start"
            disabled={disabled || gif || failed}
            onClick={() => {
              if (mediaRef.current) seekPreviewTime(mediaRef.current, sequenceStart, 0);
              setCurrent(sequenceStart);
            }}
          >
            <SkipBack size={17} />
          </button>
          <button
            className="icon-button skip-seconds"
            aria-label="Back five seconds"
            disabled={disabled || gif || failed}
            onClick={() => skip(-1)}
          >
            <RotateCcw size={21} />
            <span>5</span>
          </button>
          <button
            className="play-button"
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={disabled || gif || failed}
            onClick={toggle}
          >
            {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
          </button>
          <button
            className="icon-button skip-seconds"
            aria-label="Forward five seconds"
            disabled={disabled || gif || failed}
            onClick={() => skip(1)}
          >
            <RotateCw size={21} />
            <span>5</span>
          </button>
          {asset.kind === 'video' && (
            <>
              <button
                className="icon-button frame-step"
                aria-label="Previous frame"
                title="Previous frame · ,"
                disabled={disabled || gif || failed}
                onClick={() => step(-1)}
              >
                <StepBack size={15} />
              </button>
              <button
                className="icon-button frame-step"
                aria-label="Next frame"
                title={`Next frame · . · ${asset.frameRate ? Number(asset.frameRate.toFixed(3)) : 'estimated 30'} fps`}
                disabled={disabled || gif || failed}
                onClick={() => step(1)}
              >
                <StepForward size={15} />
              </button>
            </>
          )}
          <GoToTime
            current={position}
            duration={editedDuration(edit)}
            disabled={disabled || gif || failed}
            seek={(output) => pauseSeek(sourceTimeAtOutput(edit, output), output)}
          >
            {preciseTimecode(position)} <i>/ {time(editedDuration(edit))}</i>
          </GoToTime>
        </div>
        <div className="transport-right">
          <PlaybackLoop
            value={loop}
            disabled={disabled || gif || failed}
            change={(mode) => {
              setLoop(mode);
              if (mode === 'clip') {
                const id = selectedClip ?? clipAtSource(edit, current)?.id ?? editClips(edit)[0].id;
                setLoopClip(id);
                const clip = editClips(edit).find((clip) => clip.id === id)!;
                if (current < clip.start || current >= clip.end) pauseSeek(clip.start);
              }
            }}
          />
          {asset.kind === 'video' && <CanvasGuidesMenu />}
          <MonitorVolume />
          <button
            data-preview-expand
            className="icon-button"
            aria-label={expanded ? 'Exit fullscreen preview' : 'Fullscreen preview'}
            aria-pressed={expanded}
            title={expanded ? 'Restore editor · Escape' : 'Expand preview to fill the workspace'}
            disabled={asset.kind !== 'video'}
            onClick={toggleExpanded}
          >
            {expanded ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>
    </section>
  );
}
