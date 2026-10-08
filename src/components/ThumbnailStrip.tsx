import { thumbnailCount, thumbnailHeight, thumbnailWidth } from '../core/thumbnails';
export function ThumbnailStrip({ url, duration, seek, disabled }: { url: string; duration: number; seek: (time: number) => void; disabled: boolean }) {
  return <div className="thumbnail-strip" role="group" aria-label="Timeline thumbnails">{Array.from({ length: thumbnailCount }, (_, index) => <button key={index} aria-label={`Seek thumbnail ${index + 1}`} disabled={disabled} onClick={() => seek(Math.min(duration, (index + 0.5) * duration / thumbnailCount))} style={{ backgroundImage: `url(${url})`, backgroundSize: `${thumbnailCount * 100}% 100%`, backgroundPosition: `${index / (thumbnailCount - 1) * 100}% 0`, aspectRatio: `${thumbnailWidth}/${thumbnailHeight}` }} />)}</div>;
}
