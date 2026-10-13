import { MapPin, Camera, RotateCcw } from 'lucide-react';
import { imageMetadataFormats, parseImageMetadata } from '../core/image-metadata';
import type { EditSettings, MediaAsset } from '../core/types';
export function ImageMetadataControls({
  asset,
  edit,
  update,
  bulk = false,
}: {
  asset?: MediaAsset;
  edit: Pick<EditSettings, 'format' | 'imageMetadata' | 'keepMetadata'>;
  update: (patch: Partial<EditSettings>) => void;
  bulk?: boolean;
}) {
  const value = parseImageMetadata(edit.imageMetadata),
    source = asset?.imageMetadata;
  const change = (patch: Partial<typeof value>) =>
    update({ imageMetadata: { ...value, ...patch } });
  const supported = imageMetadataFormats.includes(edit.format);
  return (
    <details className="metadata-controls image-metadata-controls">
      <summary>Image credits & privacy</summary>
      <p className="field-note">
        {bulk ? 'Apply these credits and privacy choices to every selected image. ' : ''}Original
        files stay unchanged. Blank edited fields remove the source value.
      </p>
      {!supported && (
        <p className="field-note">
          BMP does not support EXIF metadata. Choose JPEG, PNG, WebP, or TIFF to include credits.
        </p>
      )}
      <fieldset disabled={!supported}>
        <div className="metadata-fields">
          {(['author', 'copyright', 'description'] as const).map((key) => (
            <label key={key} className="stacked-label">
              {key === 'author' ? 'Creator' : key === 'copyright' ? 'Copyright' : 'Description'}
              <input
                aria-label={`Image ${key}`}
                value={value[key] ?? ''}
                placeholder={edit.keepMetadata ? source?.[key] || 'Keep source value' : 'None'}
                maxLength={2000}
                onChange={(e) => change({ [key]: e.target.value })}
              />
              <small>
                {value[key] === ''
                  ? 'Removed from output'
                  : value[key] !== undefined
                    ? 'Replaces the source value'
                    : 'Follows Keep metadata'}
              </small>
            </label>
          ))}
        </div>
        <label className="switch-row">
          <span>
            <Camera size={14} /> Keep camera information
            <small>Camera, lens, capture date, and exposure settings</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Keep image camera information"
            checked={value.keepCamera}
            disabled={!edit.keepMetadata}
            onChange={(e) => change({ keepCamera: e.target.checked })}
          />
        </label>
        {source && (
          <p className="field-note">
            {[source.camera, source.model, source.lens, source.taken].filter(Boolean).join(' · ') ||
              'No camera information in this source.'}
          </p>
        )}
        <label className="switch-row">
          <span>
            <MapPin size={14} /> Include location
            <small>
              {source?.latitude !== undefined && source.longitude !== undefined
                ? `Source: ${source.latitude.toFixed(4)}, ${source.longitude.toFixed(4)}`
                : bulk
                  ? 'Include GPS coordinates when present in a source'
                  : 'No GPS coordinates in this source'}
            </small>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Include image location"
            checked={value.keepLocation}
            disabled={!edit.keepMetadata}
            onChange={(e) => change({ keepLocation: e.target.checked })}
          />
        </label>
        <p className="field-note">
          Location is excluded by default. Exported images never include the original embedded
          thumbnail or camera maker notes.
        </p>
        <button
          className="button subtle small"
          onClick={() => update({ imageMetadata: undefined })}
        >
          <RotateCcw size={13} />
          Reset credits & privacy
        </button>
      </fieldset>
    </details>
  );
}
