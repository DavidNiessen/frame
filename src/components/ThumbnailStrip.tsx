import { thumbnailCount, thumbnailHeight, thumbnailWidth } from '../core/thumbnails';
import type { EditSettings } from '../core/types';
import { sourceTimeAtOutput } from '../core/fades';
import { editedDuration } from '../core/timeline';
export function ThumbnailStrip({ url, duration, edit, seek, disabled }: { url: string; duration: number; edit?: EditSettings; seek: (time: number) => void; disabled: boolean }) {
  return <div className="thumbnail-strip" role="group" aria-label="Timeline thumbnails">{Array.from({ length: thumbnailCount }, (_, index) => {
    const time = edit?.clips ? sourceTimeAtOutput(edit, (index + .5) * editedDuration(edit) / thumbnailCount) : Math.min(duration, (index + .5) * duration / thumbnailCount);
    const frame = Math.min(thumbnailCount - 1, Math.floor(time / duration * thumbnailCount));
    return <button key={index} aria-label={`Seek thumbnail ${index + 1}`} disabled={disabled} onClick={() => seek(time)} style={{ backgroundImage: `url(${url})`, backgroundSize: `${thumbnailCount * 100}% 100%`, backgroundPosition: `${frame / (thumbnailCount - 1) * 100}% 0`, aspectRatio: `${thumbnailWidth}/${thumbnailHeight}` }} />;
  })}</div>;
}
