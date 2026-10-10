/** Release native decoder/file handles before deleting an imported source. */
export function detachSourceMedia(id: string) {
  for (const media of document.querySelectorAll<HTMLMediaElement>('audio[data-frame-source], video[data-frame-source]')) {
    if (media.dataset.frameSource !== id) continue;
    media.pause(); media.removeAttribute('src'); media.load();
  }
}
