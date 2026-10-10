import type { EffectId } from '../core/effect-library';
import { captionItems } from '../core/caption-items';
import { changeInstance, effectiveVolume, extraInstances } from '../core/effect-instances';
import { stackedGeometryPreview, colorPreview } from '../core/visual-preview';
import { AudioMixPreview } from './AudioMixPreview';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { AudioLines, Maximize, Minimize, Pause, Play, SkipBack, StepBack, StepForward, Volume2 } from 'lucide-react';
import type { EditSettings, MediaAsset, TimeRange } from '../core/types';
import { clipAtSource, clipRecipe } from '../core/clips';
import { outputTimeAtSource, sourceTimeAtOutput } from '../core/fades';
import { editedDuration, nextPlayableTime } from '../core/timeline';
import { time } from '../core/format';
import { applyPreviewEffects, usePreviewEffects, pauseOtherMedia } from '../hooks/usePreviewEffects';
import { frameDimensions, geometryPreview } from '../core/geometry';
import { OverlayPreview } from './OverlayPreview';
import { CropOverlay } from './CropOverlay';
import { CaptionPreview } from './CaptionPreview';
import { MediaInfo } from './MediaInfo';
import { PlaybackLoop, type LoopMode } from './PlaybackLoop';
import { editClips } from '../core/clips';
import { GoToTime } from './GoToTime';
import { preciseTimecode, skipSeconds, stepFrame } from '../core/playhead';
import { configurePreviewClock, hasPreviewClock, readPreviewTime, seekPreviewTime } from '../core/preview-clock';
export function Preview({ asset, edit, previewUrl, previewRanges, preparing = false, previewProgress = 0, previewError, retryPreview, mediaRef, current, setCurrent, update, disabled, expanded, toggleExpanded, panelRef, selectedClip, assets, openEffect, selectedEffect }: {
  openEffect: (id: EffectId, instanceId?: string) => void; selectedEffect: { id: EffectId; instanceId?: string } | null;
  assets: MediaAsset[]; selectedClip: string | null;
  expanded: boolean; toggleExpanded: () => void; panelRef: RefObject<HTMLElement | null>;
  previewRanges?: TimeRange[]; preparing?: boolean; previewProgress?: number; previewError?: string; retryPreview?: () => void;
  previewUrl?: string; asset: MediaAsset; edit: EditSettings; mediaRef: RefObject<HTMLMediaElement | null>;
  current: number; setCurrent: (value: number) => void; update: (patch: Partial<EditSettings>) => void; disabled: boolean;
}) {
  const [loop, setLoop] = useState<LoopMode>('off'), [loopClip, setLoopClip] = useState<string | null>(null);
  const targetClip = editClips(edit).find(clip => clip.id === loopClip);
  const playbackEdit = useMemo(() => loop === 'clip' && targetClip ? { ...edit, clips: editClips(edit).filter(clip => targetClip.groupId ? clip.groupId === targetClip.groupId : clip.id === targetClip.id) } : edit, [edit, loop, loopClip]);
  useEffect(() => { setLoop('off'); setLoopClip(null); }, [asset.id]);
  useEffect(() => { if (loop === 'clip' && !targetClip) { setLoop('off'); setLoopClip(null); } }, [edit, loop, loopClip]);
  useEffect(() => { if (loop === 'clip' && selectedClip) setLoopClip(selectedClip); }, [selectedClip, loop]);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const clip = edit.clips ? clipAtSource(edit, current) : undefined;
  const recipe = clip ? clipRecipe(edit, clip) : edit;
  const trackCrop = !recipe.crop ? extraInstances(recipe, 'crop').find(instance => instance.timeSpace === 'output') : undefined;
  const visual = trackCrop ? { ...recipe, crop: trackCrop.settings.crop ?? null, effectInstances: extraInstances(recipe).filter(instance => instance.id !== trackCrop.id) } : recipe;
  const stackedVisual = extraInstances(visual).some(instance => instance.effect === 'crop' && instance.settings.crop || instance.effect === 'transform' && instance.settings.geometry && (instance.settings.geometry.rotation || instance.settings.geometry.flipHorizontal || instance.settings.geometry.flipVertical || instance.settings.geometry.resize));
  const geometry = stackedVisual ? stackedGeometryPreview(asset, visual) : geometryPreview(asset, visual);
  const dimensions = visual.crop && !stackedVisual ? { width: asset.width ?? 640, height: asset.height ?? 360 } : frameDimensions(asset, visual);
  const sourceUrl = previewUrl ?? asset.previewUrl;
  const sequenceStart = edit.clips?.[0]?.start ?? edit.start;
  const gif = /\.gif$/i.test(asset.name) && !previewUrl;
  const loadedSource = useRef(''), desired = useRef(current); desired.current = current;
  const changing = loadedSource.current !== sourceUrl;
  useEffect(() => { setCurrent(sequenceStart); }, [asset.id]);
  useEffect(() => { setFailed(false); setPlaying(false); }, [sourceUrl]);
  usePreviewEffects(mediaRef, playbackEdit, playing, current, asset.id, setCurrent, loop !== 'off', edit);
  useEffect(() => { if (disabled || preparing) mediaRef.current?.pause(); }, [disabled, preparing, mediaRef]);
  function pauseSeek(source: number) { mediaRef.current?.pause(); if (mediaRef.current) seekPreviewTime(mediaRef.current, source); setCurrent(source); }
  function step(direction: -1 | 1) { pauseSeek(asset.kind === 'video' ? stepFrame(edit, current, asset.frameRate ?? 30, direction) : skipSeconds(edit, current, direction)); }
  function toggle() {
    const media = mediaRef.current; if (!media || failed || preparing) return;
    if (!media.paused) media.pause();
    else {
      const next = nextPlayableTime(playbackEdit, readPreviewTime(media));
      const start = next ?? playbackEdit.clips?.[0]?.start ?? playbackEdit.start;
      seekPreviewTime(media, start);
      void media.play().catch(() => setFailed(true));
    }
  }
  const mediaEvents = {
    onPlay: () => { if (mediaRef.current) pauseOtherMedia(mediaRef.current); setPlaying(true); }, onPause: () => { setPlaying(false); if (mediaRef.current && !changing) setCurrent(readPreviewTime(mediaRef.current)); },
    onEnded: () => {
      const media = mediaRef.current; if (!media) return;
      // The source may end before the animation frame can advance a reordered clip.
      const index = hasPreviewClock(media) ? -1 : playbackEdit.clips?.findIndex(item => Math.abs(item.end - media.duration) < .1) ?? -1;
      const next = index >= 0 ? playbackEdit.clips?.[index + 1] : undefined;
      seekPreviewTime(media, next?.start ?? playbackEdit.clips?.[0]?.start ?? playbackEdit.start); setCurrent(readPreviewTime(media));
      if (next || loop !== 'off') { applyPreviewEffects(media, edit); void media.play().catch(() => setFailed(true)); }
      else setPlaying(false);
    },
    onError: () => setFailed(true),
    onLoadedMetadata: () => { if (mediaRef.current) { loadedSource.current = sourceUrl; const source = nextPlayableTime(edit, desired.current) ?? sequenceStart; seekPreviewTime(mediaRef.current, source); setCurrent(source); applyPreviewEffects(mediaRef.current, edit); } },
    onTimeUpdate: () => {
      const media = mediaRef.current; if (!media) return;
      if (media.paused && loadedSource.current === sourceUrl) setCurrent(readPreviewTime(media));
    },
  };
  return <section ref={panelRef} id="media-preview" className="preview-panel" aria-label="Media preview">
    <div className="workspace-heading"><div><h2 title={asset.name}>{asset.name}</h2></div><div className="preview-source-info"><span className="badge">{asset.kind === 'video' ? `${asset.width} × ${asset.height}` : 'Audio'} <span>·</span> {time(asset.duration)}</span><MediaInfo asset={asset} /></div></div>
    <div className={`preview-stage ${asset.kind === 'audio' ? 'audio-stage' : ''}`}>
      {asset.kind === 'video' ? <div className="media-frame" style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}`, '--frame-ratio': dimensions.width / dimensions.height } as CSSProperties}>
        {gif ? <img style={{ ...geometry, filter: colorPreview(visual, current, outputTimeAtSource(edit, current)) }} src={sourceUrl} alt="Animated source preview" /> : <video data-frame-source={asset.id} style={{ ...geometry, filter: colorPreview(visual, current, outputTimeAtSource(edit, current)) }} data-preview-preparing={preparing || undefined} ref={node => { mediaRef.current = node; if (node) configurePreviewClock(node, previewRanges); }} src={sourceUrl} {...mediaEvents} playsInline preload="metadata" />}
        <OverlayPreview current={current} edit={edit} asset={asset} disabled={disabled} update={update} pause={() => mediaRef.current?.pause()} openEffect={openEffect} selectedEffect={selectedEffect} />
        {captionItems(edit).some(cue => cue.mode !== 'none') && <CaptionPreview openEffect={openEffect} selectedEffect={selectedEffect} asset={asset} edit={{ ...edit, crop: stackedVisual ? null : visual.crop }} current={current} disabled={disabled} pause={() => mediaRef.current?.pause()} update={update} />}
        {!stackedVisual && visual.crop && asset.width && asset.height && <CropOverlay crop={visual.crop!} width={asset.width} height={asset.height} disabled={disabled} onChange={crop => update(trackCrop ? changeInstance(edit, trackCrop.id, null, { crop }) : clip ? { clips: edit.clips!.map(item => item.id === clip.id ? { ...item, effects: { ...item.effects, crop } } : item) } : { crop })} />}
      </div> : <div className="audio-preview"><span className="audio-orbit" /><span className="audio-orbit second" /><div className="audio-art"><AudioLines size={54} strokeWidth={1.25} /></div><h3>{asset.name.replace(/\.[^.]+$/, '')}</h3><p>{asset.audioChannels ? `${asset.audioChannels === 1 ? 'Mono' : asset.audioChannels === 2 ? 'Stereo' : `${asset.audioChannels} channels`}${asset.audioSampleRate ? ` · ${asset.audioSampleRate / 1000} kHz` : ''}` : 'Audio source'}</p><audio data-frame-source={asset.id} data-preview-preparing={preparing || undefined} ref={node => { mediaRef.current = node; if (node) configurePreviewClock(node, previewRanges); }} src={sourceUrl} {...mediaEvents} preload="metadata" /></div>}
      {failed && <div className="preview-error"><p>This format cannot be previewed here.</p><span>You can still edit and convert it to MP4 or MP3.</span></div>}
      <span className="preview-label">{edit.crop ? 'Drag the crop or its corners' : edit.subtitles.mode === 'burn' && edit.subtitles.cues.some(c => current >= c.start && current < c.end) ? 'Click for settings · double-click text to edit · drag corners to resize' : gif ? 'GIF source loops · edits apply on export' : edit.videoFadeIn || edit.videoFadeOut ? 'Fade preview • source frame' : previewRanges ? 'Continuous joined preview' : previewUrl ? 'Lightweight proxy preview' : 'Original preview'}</span>
    </div>
    {preparing && <div className="continuous-preview-status" role="status">Preparing continuous preview… <progress aria-label="Continuous preview preparation" max={1} value={previewProgress} /></div>}
    {previewError && <div className="continuous-preview-status" role="status">Continuous preview unavailable. {previewError} <button className="quiet-button" onClick={retryPreview}>Retry preview</button></div>}
    <AudioMixPreview assets={assets} edit={edit} current={current} playing={playing && !disabled} />
    {expanded && <div className="fullscreen-scrubber" data-preview-playback><input type="range" aria-label="Fullscreen playback position" aria-valuetext={`${outputTimeAtSource(edit, current).toFixed(2)} of ${editedDuration(edit).toFixed(2)} seconds`} min={0} max={editedDuration(edit)} step={.01} value={outputTimeAtSource(edit, current)} disabled={disabled || preparing || gif || failed} onChange={event => { const source = sourceTimeAtOutput(edit, Number(event.target.value)); if (mediaRef.current) seekPreviewTime(mediaRef.current, source); setCurrent(source); }} /></div>}
    <div className="transport" data-preview-playback><div className="transport-left"><button className="icon-button" aria-label="Back to trim start" disabled={disabled || preparing || gif || failed} onClick={() => { if (mediaRef.current) seekPreviewTime(mediaRef.current, sequenceStart); setCurrent(sequenceStart); }}><SkipBack size={17} /></button><button className="play-button" aria-label={playing ? 'Pause' : 'Play'} disabled={disabled || preparing || gif || failed} onClick={toggle}>{playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button><button className="icon-button frame-step" aria-label={asset.kind === 'video' ? 'Previous frame' : 'Back one second'} title={asset.kind === 'video' ? 'Previous frame · ,' : 'Back one second · ,'} disabled={disabled || preparing || gif || failed} onClick={() => step(-1)}><StepBack size={15} /></button><button className="icon-button frame-step" aria-label={asset.kind === 'video' ? 'Next frame' : 'Forward one second'} title={asset.kind === 'video' ? `Next frame · . · ${asset.frameRate ? Number(asset.frameRate.toFixed(3)) : 'estimated 30'} fps` : 'Forward one second · .'} disabled={disabled || preparing || gif || failed} onClick={() => step(1)}><StepForward size={15} /></button><GoToTime current={outputTimeAtSource(edit, current)} duration={editedDuration(edit)} disabled={disabled || preparing || gif || failed} seek={output => pauseSeek(sourceTimeAtOutput(edit, output))}>{preciseTimecode(outputTimeAtSource(edit, current))} <i>/ {time(editedDuration(edit))}</i></GoToTime></div><div className="transport-right"><PlaybackLoop value={loop} disabled={disabled || preparing || gif || failed} change={mode => { setLoop(mode); if (mode === 'clip') { const id = selectedClip ?? clipAtSource(edit, current)?.id ?? editClips(edit)[0].id; setLoopClip(id); const clip = editClips(edit).find(clip => clip.id === id)!; if (current < clip.start || current >= clip.end) pauseSeek(clip.start); } }} /><span className="preview-volume"><Volume2 size={15} />{Math.round(effectiveVolume(visual, current, outputTimeAtSource(edit, current)) * 100)}%{effectiveVolume(visual, current, outputTimeAtSource(edit, current)) > 1 ? ' on export' : ''}</span><button data-preview-expand className="icon-button" aria-label={expanded ? 'Exit fullscreen preview' : 'Fullscreen preview'} aria-pressed={expanded} title={expanded ? 'Restore editor · Escape' : 'Expand preview to fill the workspace'} disabled={asset.kind !== 'video'} onClick={toggleExpanded}>{expanded ? <Minimize size={16} /> : <Maximize size={16} />}</button></div></div>
  </section>;
}
