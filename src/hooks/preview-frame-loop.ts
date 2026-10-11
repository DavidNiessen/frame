/** Decoder events restart the clock even when a source swap batches React's pause/play updates. */
export function previewFrameLoop(media: HTMLMediaElement, publish: () => void) {
  let frame = 0,
    disposed = false;
  function schedule() {
    if (!disposed && !frame && !media.paused) frame = requestAnimationFrame(tick);
  }
  function tick() {
    frame = 0;
    if (disposed || media.paused) return;
    publish();
    schedule();
  }
  function pause() {
    if (media.paused) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }
  const events = ['play', 'playing', 'loadedmetadata', 'seeked'] as const;
  events.forEach((event) => media.addEventListener(event, schedule));
  media.addEventListener('pause', pause);
  schedule();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    events.forEach((event) => media.removeEventListener(event, schedule));
    media.removeEventListener('pause', pause);
  };
}
