import { useEffect, useState, type RefObject } from 'react';
import { AudioLines, Maximize, Pause, Play, SkipBack, Volume2 } from 'lucide-react';
import type { EditSettings, MediaAsset } from '../core/types';
import { nextPlayableTime } from '../core/timeline';
import { time } from '../core/format';
import { CropOverlay } from './CropOverlay';
export function Preview({ asset, edit, mediaRef, current, setCurrent, update, disabled }: {
  asset: MediaAsset; edit: EditSettings; mediaRef: RefObject<HTMLMediaElement | null>;
  current: number; setCurrent: (value: number) => void; update: (patch: Partial<EditSettings>) => void; disabled: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const gif = /\.gif$/i.test(asset.name);
  useEffect(() => { setFailed(false); setPlaying(false); setCurrent(edit.start); }, [asset.id]); // Source changes reset playback.
  useEffect(() => { if (mediaRef.current) mediaRef.current.volume = Math.min(1, edit.volume); }, [edit.volume, mediaRef]);
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
    onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onEnded: () => setPlaying(false),
    onError: () => setFailed(true),
    onLoadedMetadata: () => { if (mediaRef.current) { mediaRef.current.currentTime = edit.start; mediaRef.current.volume = Math.min(1, edit.volume); } },
    onTimeUpdate: () => {
      const media = mediaRef.current; if (!media) return;
      if (!media.paused) {
        const next = nextPlayableTime(edit, media.currentTime);
        if (next === null) { media.pause(); media.currentTime = edit.start; }
        else if (next !== media.currentTime) media.currentTime = next;
      }
      setCurrent(media.currentTime);
    },
  };
  return <section className="preview-panel">
    <div className="workspace-heading"><div><span className="eyebrow">Preview</span><h2 title={asset.name}>{asset.name}</h2></div><span className="badge">{asset.kind === 'video' ? `${asset.width} × ${asset.height}` : 'Audio'} <span>·</span> {time(asset.duration)}</span></div>
    <div className={`preview-stage ${asset.kind === 'audio' ? 'audio-stage' : ''}`}>
      {asset.kind === 'video' ? <div className="media-frame" style={{ aspectRatio: `${asset.width ?? 16} / ${asset.height ?? 9}`, maxWidth: `${370 * (asset.width ?? 16) / (asset.height ?? 9)}px` }}>
        {gif ? <img src={asset.previewUrl} alt="Animated source preview" /> : <video ref={node => { mediaRef.current = node; }} src={asset.previewUrl} {...mediaEvents} playsInline preload="metadata" />}
        {edit.crop && asset.width && asset.height && <CropOverlay crop={edit.crop} width={asset.width} height={asset.height} disabled={disabled} onChange={crop => update({ crop })} />}
      </div> : <div className="audio-preview"><span className="audio-orbit" /><span className="audio-orbit second" /><div className="audio-art"><AudioLines size={54} strokeWidth={1.25} /></div><h3>{asset.name.replace(/\.[^.]+$/, '')}</h3><p>Sound, with a little more intention.</p><audio ref={node => { mediaRef.current = node; }} src={asset.previewUrl} {...mediaEvents} preload="metadata" /></div>}
      {failed && <div className="preview-error"><p>This format cannot be previewed here.</p><span>You can still edit and convert it to MP4 or MP3.</span></div>}
      <span className="preview-label">{edit.crop ? 'Drag the crop or its corners' : gif ? 'GIF source loops · trim is applied on export' : 'Original preview'}</span>
    </div>
    <div className="transport"><div className="transport-left"><button className="icon-button" aria-label="Back to trim start" disabled={disabled || gif || failed} onClick={() => { if (mediaRef.current) mediaRef.current.currentTime = edit.start; setCurrent(edit.start); }}><SkipBack size={17} /></button><button className="play-button" aria-label={playing ? 'Pause' : 'Play'} disabled={disabled || gif || failed} onClick={toggle}>{playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button><span className="timecode">{time(current)} <i>/ {time(asset.duration)}</i></span></div><div className="transport-right"><span className="preview-volume"><Volume2 size={15} />{Math.round(edit.volume * 100)}%{edit.volume > 1 ? ' on export' : ''}</span><button className="icon-button" aria-label="Fullscreen preview" disabled={asset.kind !== 'video'} onClick={() => { const parent = document.querySelector('.preview-stage'); if (parent?.requestFullscreen) void parent.requestFullscreen().catch(() => {}); }}><Maximize size={16} /></button></div></div>
  </section>;
}
