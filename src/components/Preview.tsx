import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { AudioLines, Maximize, Minimize, Pause, Play, SkipBack, Volume2 } from 'lucide-react';
import type { EditSettings, MediaAsset } from '../core/types';
import { clipAtSource, clipRecipe } from '../core/clips';
import { outputTimeAtSource, sourceTimeAtOutput } from '../core/fades';
import { editedDuration, nextPlayableTime } from '../core/timeline';
import { time } from '../core/format';
import { applyPreviewEffects, usePreviewEffects, pauseOtherMedia } from '../hooks/usePreviewEffects';
import { frameDimensions, geometryPreview } from '../core/geometry';
import { OverlayPreview } from './OverlayPreview';
import { CropOverlay } from './CropOverlay';
import { CaptionPreview } from './CaptionPreview';
export function Preview({ asset, edit, previewUrl, mediaRef, current, setCurrent, update, disabled, expanded, toggleExpanded, panelRef }: {
  expanded: boolean; toggleExpanded: () => void; panelRef: RefObject<HTMLElement | null>;
  previewUrl?: string; asset: MediaAsset; edit: EditSettings; mediaRef: RefObject<HTMLMediaElement | null>;
  current: number; setCurrent: (value: number) => void; update: (patch: Partial<EditSettings>) => void; disabled: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const clip = edit.clips ? clipAtSource(edit, current) : undefined;
  const visual = clip ? clipRecipe(edit, clip) : edit;
  const dimensions = visual.crop ? { width: asset.width ?? 640, height: asset.height ?? 360 } : frameDimensions(asset, visual);
  const sourceUrl = previewUrl ?? asset.previewUrl;
  const sequenceStart = edit.clips?.[0]?.start ?? edit.start;
  const gif = /\.gif$/i.test(asset.name) && !previewUrl;
  useEffect(() => { setFailed(false); setPlaying(false); setCurrent(sequenceStart); }, [asset.id, sourceUrl]); // Source changes reset playback.
  usePreviewEffects(mediaRef, edit, playing, current, asset.id, setCurrent);
  useEffect(() => { if (disabled) mediaRef.current?.pause(); }, [disabled, mediaRef]);
  function toggle() {
    const media = mediaRef.current; if (!media || failed) return;
    if (!media.paused) media.pause();
    else {
      const next = nextPlayableTime(edit, media.currentTime);
      media.currentTime = next ?? sequenceStart;
      void media.play().catch(() => setFailed(true));
    }
  }
  const mediaEvents = {
    onPlay: () => { if (mediaRef.current) pauseOtherMedia(mediaRef.current); setPlaying(true); }, onPause: () => { setPlaying(false); if (mediaRef.current) setCurrent(mediaRef.current.currentTime); },
    onEnded: () => {
      const media = mediaRef.current; if (!media) return;
      // The source may end before the animation frame can advance a reordered clip.
      const index = edit.clips?.findIndex(item => Math.abs(item.end - media.duration) < .1) ?? -1;
      const next = index >= 0 ? edit.clips?.[index + 1] : undefined;
      media.currentTime = next?.start ?? sequenceStart; setCurrent(media.currentTime);
      if (next) { applyPreviewEffects(media, edit); void media.play().catch(() => setFailed(true)); }
      else setPlaying(false);
    },
    onError: () => setFailed(true),
    onLoadedMetadata: () => { if (mediaRef.current) { mediaRef.current.currentTime = sequenceStart; applyPreviewEffects(mediaRef.current, edit); } },
    onTimeUpdate: () => {
      const media = mediaRef.current; if (!media) return;
      if (media.paused) setCurrent(media.currentTime);
    },
  };
  return <section ref={panelRef} id="media-preview" className="preview-panel" aria-label="Media preview">
    <div className="workspace-heading"><div><h2 title={asset.name}>{asset.name}</h2></div><span className="badge">{asset.kind === 'video' ? `${asset.width} × ${asset.height}` : 'Audio'} <span>·</span> {time(asset.duration)}</span></div>
    <div className={`preview-stage ${asset.kind === 'audio' ? 'audio-stage' : ''}`}>
      {asset.kind === 'video' ? <div className="media-frame" style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}`, '--frame-ratio': dimensions.width / dimensions.height } as CSSProperties}>
        {gif ? <img style={{ ...geometryPreview(asset, visual), filter: `brightness(${1 + visual.color.brightness}) contrast(${visual.color.contrast}) saturate(${visual.color.saturation})` }} src={sourceUrl} alt="Animated source preview" /> : <video style={{ ...geometryPreview(asset, visual), filter: `brightness(${1 + visual.color.brightness}) contrast(${visual.color.contrast}) saturate(${visual.color.saturation})` }} ref={node => { mediaRef.current = node; }} src={sourceUrl} {...mediaEvents} playsInline preload="metadata" />}
        <OverlayPreview edit={edit} asset={asset} />
        {edit.subtitles.mode !== 'none' && <CaptionPreview asset={asset} edit={edit} current={current} disabled={disabled} pause={() => mediaRef.current?.pause()} update={update} />}
        {visual.crop && asset.width && asset.height && <CropOverlay crop={visual.crop!} width={asset.width} height={asset.height} disabled={disabled} onChange={crop => update(clip ? { clips: edit.clips!.map(item => item.id === clip.id ? { ...item, effects: { ...item.effects, crop } } : item) } : { crop })} />}
      </div> : <div className="audio-preview"><span className="audio-orbit" /><span className="audio-orbit second" /><div className="audio-art"><AudioLines size={54} strokeWidth={1.25} /></div><h3>{asset.name.replace(/\.[^.]+$/, '')}</h3><p>{asset.audioChannels ? `${asset.audioChannels === 1 ? 'Mono' : asset.audioChannels === 2 ? 'Stereo' : `${asset.audioChannels} channels`}${asset.audioSampleRate ? ` · ${asset.audioSampleRate / 1000} kHz` : ''}` : 'Audio source'}</p><audio ref={node => { mediaRef.current = node; }} src={sourceUrl} {...mediaEvents} preload="metadata" /></div>}
      {failed && <div className="preview-error"><p>This format cannot be previewed here.</p><span>You can still edit and convert it to MP4 or MP3.</span></div>}
      <span className="preview-label">{edit.crop ? 'Drag the crop or its corners' : edit.subtitles.mode === 'burn' && edit.subtitles.cues.some(c => current >= c.start && current < c.end) ? 'Drag captions to position · arrow keys to nudge' : gif ? 'GIF source loops · edits apply on export' : edit.videoFadeIn || edit.videoFadeOut ? 'Fade preview • source frame' : previewUrl ? 'Lightweight proxy preview' : 'Original preview'}</span>
    </div>
    {expanded && <div className="fullscreen-scrubber"><input type="range" aria-label="Fullscreen playback position" aria-valuetext={`${outputTimeAtSource(edit, current).toFixed(2)} of ${editedDuration(edit).toFixed(2)} seconds`} min={0} max={editedDuration(edit)} step={.01} value={outputTimeAtSource(edit, current)} disabled={disabled || gif || failed} onChange={event => { const source = sourceTimeAtOutput(edit, Number(event.target.value)); if (mediaRef.current) mediaRef.current.currentTime = source; setCurrent(source); }} /></div>}
    <div className="transport"><div className="transport-left"><button className="icon-button" aria-label="Back to trim start" disabled={disabled || gif || failed} onClick={() => { if (mediaRef.current) mediaRef.current.currentTime = sequenceStart; setCurrent(sequenceStart); }}><SkipBack size={17} /></button><button className="play-button" aria-label={playing ? 'Pause' : 'Play'} disabled={disabled || gif || failed} onClick={toggle}>{playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button><span className="timecode">{time(edit.clips ? outputTimeAtSource(edit, current) : current)} <i>/ {time(edit.clips ? editedDuration(edit) : asset.duration)}</i></span></div><div className="transport-right"><span className="preview-volume"><Volume2 size={15} />{Math.round(visual.volume * 100)}%{visual.volume > 1 ? ' on export' : ''}</span><button data-preview-expand className="icon-button" aria-label={expanded ? 'Exit fullscreen preview' : 'Fullscreen preview'} aria-pressed={expanded} title={expanded ? 'Restore editor · Escape' : 'Expand preview to fill the workspace'} disabled={asset.kind !== 'video'} onClick={toggleExpanded}>{expanded ? <Minimize size={16} /> : <Maximize size={16} />}</button></div></div>
  </section>;
}
