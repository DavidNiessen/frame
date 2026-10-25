import { joinPlaybackAudio } from './realtime-audio';

/**
 * A second decoder that waits, paused, on the first frame after the next cut.
 * When playback jumps there, it plays in place of the source while the source
 * seeks. The hidden, muted source then runs slightly faster or slower until it
 * shows the same frame, and takes over again. Cuts play without the freeze of a
 * decoder seek, as in an NLE.
 */
interface Bridge {
  standby: HTMLVideoElement;
  /** Seconds a source seek takes, measured at each cut. */
  latency: number;
  crossing: number;
  restore?: () => void;
}
const bridges = new WeakMap<HTMLMediaElement, Bridge>();
/** Start cueing this long before a cut, in source seconds at normal speed. */
export const cutLookahead = 2;
/** Hand back once both decoders are within a frame of each other. */
const aligned = 1 / 30;

export function attachCutBridge(media: HTMLMediaElement, standby: HTMLVideoElement) {
  const bridge: Bridge = { standby, latency: 0.15, crossing: 0 };
  bridges.set(media, bridge);
  return () => {
    if (bridges.get(media) === bridge) bridges.delete(media);
    finish(bridge);
  };
}
function finish(bridge: Bridge) {
  bridge.crossing = 0;
  bridge.restore?.();
  bridge.restore = undefined;
  bridge.standby.pause();
  bridge.standby.muted = true;
  delete bridge.standby.dataset.bridging;
}
/** Cue the standby decoder on the first frame of the next clip. */
export function prepareCut(media: HTMLMediaElement, target: number) {
  const bridge = bridges.get(media);
  if (!bridge || bridge.crossing) return;
  const { standby } = bridge;
  if (!standby.paused) standby.pause();
  if (Math.abs(standby.currentTime - target) > 0.01 && standby.readyState > 0)
    standby.currentTime = target;
}
/** Whether the standby decoder is covering a cut; the source's rate and sound are its own then. */
export function bridgingCut(media: HTMLMediaElement) {
  return !!bridges.get(media)?.crossing;
}
/** The element whose frame is on screen: the standby decoder while it bridges a cut. */
export function cutFrameSource(media: HTMLMediaElement) {
  const bridge = bridges.get(media);
  return bridge?.crossing ? bridge.standby : media;
}
/**
 * Jump across a cut. Returns where the source should seek: past the target by
 * the expected seek time when the standby decoder covers it, else the target.
 */
export function crossCut(media: HTMLMediaElement, target: number) {
  const bridge = bridges.get(media);
  const standby = bridge?.standby;
  if (
    !bridge ||
    !standby ||
    bridge.crossing ||
    media.paused ||
    standby.readyState < 2 ||
    standby.seeking ||
    Math.abs(standby.currentTime - target) > 0.02
  )
    return target;
  const rate = media.playbackRate,
    muted = media.muted;
  standby.playbackRate = rate;
  // The source is silent while it seeks, so the standby decoder carries the
  // sound, through the same live corrections.
  joinPlaybackAudio(media, standby);
  standby.volume = media.volume;
  standby.muted = muted || media.dataset.previewAudio === 'separate';
  standby.dataset.bridging = 'true';
  media.muted = true;
  const started = performance.now();
  bridge.crossing = started;
  bridge.restore = () => {
    media.playbackRate = rate;
    media.muted = muted;
  };
  void standby.play().catch(() => finish(bridge));
  const video = media as HTMLVideoElement;
  const next = (callback: () => void) => {
    if (typeof video.requestVideoFrameCallback === 'function')
      video.requestVideoFrameCallback(callback);
    else requestAnimationFrame(callback);
  };
  let side = 0;
  const align = () => {
    if (bridge.crossing !== started) return;
    const behind = standby.currentTime - media.currentTime;
    // Within a frame, or just past it: both decoders show the same picture.
    if (Math.abs(behind) <= aligned * rate || side * behind < 0) return finish(bridge);
    side = Math.sign(behind);
    // Hidden and muted, the source catches up with (or waits for) the shown frame.
    media.playbackRate = rate * (behind > 0 ? 2 : 0.5);
    next(align);
  };
  media.addEventListener('pause', () => bridge.crossing === started && finish(bridge), {
    once: true,
  });
  media.addEventListener(
    'seeked',
    () => {
      if (bridge.crossing !== started) return;
      bridge.latency = Math.min(1, (bridge.latency + (performance.now() - started) / 1000) / 2);
      next(align);
    },
    { once: true },
  );
  // A seek that never completes must not leave the standby decoder on screen.
  setTimeout(() => {
    if (bridge.crossing === started) finish(bridge);
  }, 3000);
  return target + bridge.latency * rate;
}
