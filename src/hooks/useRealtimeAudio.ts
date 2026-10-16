import { useEffect, type RefObject } from 'react';
import { startPlaybackAudio, releasePlaybackAudio } from '../core/realtime-audio';
import { applyPreviewEffects } from './usePreviewEffects';
import { useLatest } from './useLatest';
import type { EditSettings } from '../core/types';

export function useRealtimeAudio(
  ref: RefObject<HTMLMediaElement | null>,
  edit: EditSettings,
  assetId: string,
) {
  const latest = useLatest(edit);
  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    let disposed = false;
    const start = () =>
      void startPlaybackAudio(media, () => !disposed)
        .then(() => {
          if (!disposed) applyPreviewEffects(media, latest.current);
        })
        .catch(() => {});
    // `play` is dispatched from the user's playback action, allowing resume.
    media.addEventListener('play', start);
    if (!media.paused) start();
    return () => {
      disposed = true;
      media.removeEventListener('play', start);
      releasePlaybackAudio(media);
    };
  }, [ref, assetId, latest]);
}
