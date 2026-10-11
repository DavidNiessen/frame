import { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import { bytes, time } from '../core/format';
import type { MediaAsset } from '../core/types';

export function MediaInfo({ asset }: { asset: MediaAsset }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="icon-button"
        aria-label={`Media information for ${asset.relativePath || asset.name}`}
        title="Source information"
        onClick={() => setOpen(true)}
      >
        <Info size={15} />
      </button>
      {open && <MediaInfoDialog asset={asset} close={() => setOpen(false)} />}
    </>
  );
}
function MediaInfoDialog({ asset, close }: { asset: MediaAsset; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const rows: [string, string][] = [
    ['File', asset.name],
    ['Size', bytes(asset.size)],
    ['Duration', `${time(asset.duration)} (${asset.duration.toFixed(3)} seconds)`],
  ];
  if (asset.relativePath) rows.push(['Folder path', asset.relativePath]);
  if (asset.width && asset.height) rows.push(['Dimensions', `${asset.width} × ${asset.height}`]);
  if (asset.frameRate) rows.push(['Frame rate', `${Number(asset.frameRate.toFixed(3))} fps`]);
  if (asset.videoCodec) rows.push(['Video codec', asset.videoCodec.toUpperCase()]);
  if (asset.audioCodec) rows.push(['Audio codec', asset.audioCodec.toUpperCase()]);
  if (asset.hasAudio) {
    if (asset.audioChannels)
      rows.push([
        'Channels',
        asset.audioChannels === 1
          ? 'Mono (1)'
          : asset.audioChannels === 2
            ? 'Stereo (2)'
            : String(asset.audioChannels),
      ]);
    if (asset.audioSampleRate)
      rows.push(['Sample rate', `${asset.audioSampleRate.toLocaleString()} Hz`]);
  }
  rows.push(['Embedded artwork', asset.artworkIndex === undefined ? 'None' : 'Included']);
  return (
    <dialog
      ref={dialog}
      className="shortcuts-dialog media-info-dialog"
      aria-label="Source information"
      onCancel={close}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
    >
      <div className="dialog-heading">
        <h2>
          <Info size={18} />
          Source information
        </h2>
        <button className="icon-button" aria-label="Close source information" onClick={close}>
          <X size={18} />
        </button>
      </div>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {Object.keys(asset.metadata ?? {}).length > 0 && (
        <>
          <h3>Metadata</h3>
          <dl>
            {Object.entries(asset.metadata!).map(([label, value]) => (
              <div key={label}>
                <dt>{label.replaceAll('_', ' ')}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </dialog>
  );
}
