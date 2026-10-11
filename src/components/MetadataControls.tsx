import { X } from 'lucide-react';
import type { MediaAsset } from '../core/types';
import { editableMediaTags, type MediaTagOverrides } from '../core/media-tags';
const tagLabels = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  album_artist: 'Album artist',
  track: 'Track number',
  date: 'Date / year',
  genre: 'Genre',
  comment: 'Comment',
  copyright: 'Copyright',
};
export function MetadataControls({
  tags = {},
  source,
  update,
  bulk = false,
}: {
  tags?: MediaTagOverrides;
  source?: MediaAsset;
  update: (tags: MediaTagOverrides) => void;
  bulk?: boolean;
}) {
  return (
    <details className="metadata-controls">
      <summary>
        Edit output metadata
        {Object.keys(tags).length ? ` · ${Object.keys(tags).length} changes` : ''}
      </summary>
      <p className="field-note">
        {bulk
          ? 'Changes apply to every selected file. Untouched fields follow Keep metadata.'
          : 'Untouched fields follow Keep metadata. Clearing a field removes its source tag.'}
      </p>
      <div className="metadata-fields">
        {editableMediaTags.map((key) => (
          <label className="stacked-label" key={key}>
            {tagLabels[key]}
            <span className="metadata-field-input">
              <input
                type="text"
                aria-label={`Output ${tagLabels[key].toLowerCase()}`}
                maxLength={2000}
                value={tags[key] ?? ''}
                placeholder={source?.metadata?.[key] || 'Keep source value'}
                onChange={(event) => update({ ...tags, [key]: event.target.value })}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove output ${tagLabels[key].toLowerCase()}`}
                title="Remove this tag from output"
                disabled={tags[key] === ''}
                onClick={() => update({ ...tags, [key]: '' })}
              >
                <X size={12} />
              </button>
            </span>
            <small>
              {tags[key] === ''
                ? 'This tag will be removed'
                : tags[key] !== undefined
                  ? 'Replaces the source tag'
                  : ''}
            </small>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="button subtle small"
        disabled={!Object.keys(tags).length}
        onClick={() => update({})}
      >
        Reset metadata changes
      </button>
    </details>
  );
}
