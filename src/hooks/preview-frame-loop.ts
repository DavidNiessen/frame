/** Decoder events restart the clock even when a source swap batches React's pause/play updates. */
export function previewFrameLoop(media: HTMLMediaElement, publish: () => void) {
  let frame = 0,
    disposed = false;
  const video = media as HTMLVideoElement;
  const decodedFrames =
    media.tagName === 'VIDEO' && typeof video.requestVideoFrameCallback === 'function';
  function schedule() {
    if (!disposed && !frame && !media.paused)
      frame = decodedFrames ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  }
  function cancel() {
    if (decodedFrames) video.cancelVideoFrameCallback(frame);
    else cancelAnimationFrame(frame);
    frame = 0;
  }
  function tick() {
    frame = 0;
    if (disposed || media.paused) return;
    publish();
    schedule();
  }
  function pause() {
    if (media.paused) {
      cancel();
    }
  }
  const events = ['play', 'playing', 'loadedmetadata', 'seeked'] as const;
  events.forEach((event) => media.addEventListener(event, schedule));
  media.addEventListener('pause', pause);
  schedule();
  return () => {
    disposed = true;
    cancel();
    events.forEach((event) => media.removeEventListener(event, schedule));
    media.removeEventListener('pause', pause);
  };
}
