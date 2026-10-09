import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { AudioLines, Maximize, Pause, Play, SkipBack, Volume2 } from 'lucide-react';
import type { EditSettings, MediaAsset } from '../core/types';
import { nextPlayableTime } from '../core/timeline';
import { time } from '../core/format';
import { applyPreviewEffects, usePreviewEffects, pauseOtherMedia } from '../hooks/usePreviewEffects';
import { frameDimensions, geometryPreview } from '../core/geometry';
import { OverlayPreview } from './OverlayPreview';
import { CropOverlay } from './CropOverlay';
import { CaptionPreview } from './CaptionPreview';
export function Preview({ asset, edit, previewUrl, mediaRef, current, setCurrent, update, disabled }: {
  previewUrl?: string; asset: MediaAsset; edit: EditSettings; mediaRef: RefObject<HTMLMediaElement | null>;
  current: number; setCurrent: (value: number) => void; update: (patch: Partial<EditSettings>) => void; disabled: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const dimensions = edit.crop ? { width: asset.width ?? 640, height: asset.height ?? 360 } : frameDimensions(asset, edit);
  const sourceUrl = previewUrl ?? asset.previewUrl;
  const gif = /\.gif$/i.test(asset.name) && !previewUrl;
  useEffect(() => { setFailed(false); setPlaying(false); setCurrent(edit.start); }, [asset.id, sourceUrl]); // Source changes reset playback.
  usePreviewEffects(mediaRef, edit, playing, current, asset.id, setCurrent);
  useEffect(() => { if (disabled) mediaRef.current?.pause(); }, [disabled, mediaRef]);
  function toggle() {
    const media = mediaRef.current; if (!media || failed) return;
    if (!media.paused) media.pause();
    else {
      const next = nextPlayableTime(edit, media.currentTime);
      media.currentTime = next ?? edit.start;
      void media.play().catch(() => setFailed(true));
    }
  }
  const mediaEvents = {
    onPlay: () => { if (mediaRef.current) pauseOtherMedia(mediaRef.current); setPlaying(true); }, onPause: () => { setPlaying(false); if (mediaRef.current) setCurrent(mediaRef.current.currentTime); }, onEnded: () => setPlaying(false),
    onError: () => setFailed(true),
    onLoadedMetadata: () => { if (mediaRef.current) { mediaRef.current.currentTime = edit.start; applyPreviewEffects(mediaRef.current, edit); } },
    onTimeUpdate: () => {
      const media = mediaRef.current; if (!media) return;
      if (media.paused) setCurrent(media.currentTime);
    },
  };
  return <section className="preview-panel">
    <div className="workspace-heading"><div><h2 title={asset.name}>{asset.name}</h2></div><span className="badge">{asset.kind === 'video' ? `${asset.width} × ${asset.height}` : 'Audio'} <span>·</span> {time(asset.duration)}</span></div>
    <div className={`preview-stage ${asset.kind === 'audio' ? 'audio-stage' : ''}`}>
      {asset.kind === 'video' ? <div className="media-frame" style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}`, maxWidth: `${370 * dimensions.width / dimensions.height}px`, '--frame-ratio': dimensions.width / dimensions.height } as CSSProperties}>
        {gif ? <img style={geometryPreview(asset, edit)} src={sourceUrl} alt="Animated source preview" /> : <video style={geometryPreview(asset, edit)} ref={node => { mediaRef.current = node; }} src={sourceUrl} {...mediaEvents} playsInline preload="metadata" />}
        <OverlayPreview edit={edit} asset={asset} />
        {edit.subtitles.mode !== 'none' && <CaptionPreview asset={asset} edit={edit} current={current} disabled={disabled} pause={() => mediaRef.current?.pause()} update={update} />}
        {edit.crop && asset.width && asset.height && <CropOverlay crop={edit.crop} width={asset.width} height={asset.height} disabled={disabled} onChange={crop => update({ crop })} />}
      </div> : <div className="audio-preview"><span className="audio-orbit" /><span className="audio-orbit second" /><div className="audio-art"><AudioLines size={54} strokeWidth={1.25} /></div><h3>{asset.name.replace(/\.[^.]+$/, '')}</h3><p>{asset.audioChannels ? `${asset.audioChannels === 1 ? 'Mono' : asset.audioChannels === 2 ? 'Stereo' : `${asset.audioChannels} channels`}${asset.audioSampleRate ? ` · ${asset.audioSampleRate / 1000} kHz` : ''}` : 'Audio source'}</p><audio ref={node => { mediaRef.current = node; }} src={sourceUrl} {...mediaEvents} preload="metadata" /></div>}
      {failed && <div className="preview-error"><p>This format cannot be previewed here.</p><span>You can still edit and convert it to MP4 or MP3.</span></div>}
      <span className="preview-label">{edit.crop ? 'Drag the crop or its corners' : edit.subtitles.mode === 'burn' && edit.subtitles.cues.some(c => current >= c.start && current < c.end) ? 'Drag captions to position · arrow keys to nudge' : gif ? 'GIF source loops · edits apply on export' : edit.videoFadeIn || edit.videoFadeOut ? 'Fade preview • source frame' : previewUrl ? 'Lightweight proxy preview' : 'Original preview'}</span>
    </div>
    <div className="transport"><div className="transport-left"><button className="icon-button" aria-label="Back to trim start" disabled={disabled || gif || failed} onClick={() => { if (mediaRef.current) mediaRef.current.currentTime = edit.start; setCurrent(edit.start); }}><SkipBack size={17} /></button><button className="play-button" aria-label={playing ? 'Pause' : 'Play'} disabled={disabled || gif || failed} onClick={toggle}>{playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button><span className="timecode">{time(current)} <i>/ {time(asset.duration)}</i></span></div><div className="transport-right"><span className="preview-volume"><Volume2 size={15} />{Math.round(edit.volume * 100)}%{edit.volume > 1 ? ' on export' : ''}</span><button className="icon-button" aria-label="Fullscreen preview" disabled={asset.kind !== 'video'} onClick={() => { const parent = document.querySelector('.preview-stage'); if (parent?.requestFullscreen) void parent.requestFullscreen().catch(() => {}); }}><Maximize size={16} /></button></div></div>
  </section>;
}
