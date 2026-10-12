import { AudioLines, Video } from 'lucide-react';
import type { DownloadOptions, OnlineMedia } from '../core/online-media';

export function UrlMediaOptions({
  source,
  options,
  setOptions,
  running,
}: {
  source: OnlineMedia;
  options: DownloadOptions;
  setOptions: (options: DownloadOptions) => void;
  running: boolean;
}) {
  const audio = source.kind === 'audio';
  return (
    <div className="online-media-import-options">
      <p className="online-media-source">
        {audio ? <AudioLines size={16} /> : <Video size={16} />}
        <strong>{source.name}</strong>
        <span>{audio ? 'Music track · Audio only' : 'Video link'}</span>
      </p>
      {!audio && (
        <label className="stacked-label">
          Import as
          <select
            aria-label={`${source.name} import type`}
            value={options.mode}
            disabled={running}
            onChange={(event) =>
              setOptions({ ...options, mode: event.target.value as DownloadOptions['mode'] })
            }
          >
            <option value="video">Video with audio</option>
            <option value="audio">Audio only</option>
          </select>
        </label>
      )}
      {!audio && options.mode === 'video' && (
        <label className="stacked-label">
          Video quality
          <select
            aria-label={`${source.name} video quality`}
            value={options.quality}
            disabled={running}
            onChange={(event) =>
              setOptions({ ...options, quality: event.target.value as DownloadOptions['quality'] })
            }
          >
            <option value="1080">Up to 1080p</option>
            <option value="720">Up to 720p</option>
            <option value="480">Up to 480p</option>
            <option value="best">Best available</option>
          </select>
        </label>
      )}
      <p className="field-note">
        {audio
          ? 'Downloads the best available audio stream.'
          : 'Downloads the original streams; audio-only imports extract sound when needed.'}{' '}
        Choose your output format after import. Public, individual links only; sign-in and live
        streams are not supported.
      </p>
    </div>
  );
}
