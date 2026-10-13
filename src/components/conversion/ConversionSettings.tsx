import { ImageResizeControls } from '../ImageResizeControls';
import { ImageOutputControls } from '../ImageOutputControls';
import { TransientMessage } from '../TransientMessage';
import { CoverArtworkControls } from '../CoverArtworkControls';
import { MetadataControls } from '../MetadataControls';
import { ConversionNaming } from './ConversionNaming';
import { GifOutputControls } from '../GifOutputControls';
import { AudioOutputControls } from '../AudioOutputControls';
import { ArrowRight, Check, ChevronDown, FolderTree, Settings2 } from 'lucide-react';
import { formats, getFormat } from '../../core/formats';
import type { FormatId } from '../../core/types';
import type { Conversion } from '../../hooks/useConversion';
import type { Editor } from '../../hooks/useEditor';

export function ConversionSettings({
  conversion: c,
  editor,
}: {
  conversion: Conversion;
  editor: Editor;
}) {
  const { output: s } = c;
  const format = getFormat(s.format);
  const lossless = s.format === 'wav' || s.format === 'flac';
  const retryable = c.unfinished.filter((job) =>
    c.selected.some((asset) => asset.id === job.asset.id),
  );
  const allDone =
    editor.assets.length > 0 &&
    editor.assets.every((asset) => c.latestJobs.get(asset.id)?.status === 'done');
  return (
    <aside
      id="conversion-settings"
      className="conversion-settings panel"
      aria-labelledby="conversion-settings-title"
    >
      <div className="conversion-panel-title">
        <span className="conversion-step">2</span>
        <div>
          <h2 id="conversion-settings-title">Format & quality</h2>
          <p>One setup for every selected file.</p>
        </div>
      </div>
      <fieldset disabled={c.busy} className="conversion-settings-body">
        <label className="stacked-label" htmlFor="conversion-format">
          Convert to
        </label>
        <select
          id="conversion-format"
          aria-label="Conversion format"
          value={s.format}
          onChange={(event) => c.update({ format: event.target.value as FormatId })}
        >
          {(['image', 'audio', 'video'] as const).map((kind) => (
            <optgroup
              key={kind}
              label={
                kind === 'image'
                  ? 'Image formats'
                  : kind === 'audio'
                    ? 'Audio formats'
                    : 'Video formats'
              }
            >
              {formats
                .filter((format) => format.kind === kind)
                .map((format) => (
                  <option key={format.id} value={format.id}>
                    {format.label} — {format.description}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <div className="conversion-format-note">
          <strong>{format.label}</strong>
          <span>
            {format.description}
            {format.kind === 'audio' && editor.assets.some((asset) => asset.kind === 'video')
              ? ' · extracts video audio'
              : ''}
          </span>
        </div>
        {format.kind === 'image' ? (
          <>
            <ImageResizeControls output={s} update={c.update} assets={c.selected} />
            <ImageOutputControls edit={s} update={c.update} />
          </>
        ) : lossless ? (
          <p className="conversion-quality-note">
            <Check size={15} />
            {s.format === 'flac'
              ? 'Lossless compression. No target bitrate.'
              : 'Uncompressed PCM audio. No target bitrate.'}
          </p>
        ) : s.format === 'gif' ? (
          <label className="stacked-label">
            Frame rate
            <select
              aria-label="Conversion GIF frame rate"
              value={s.fps}
              onChange={(event) => c.update({ fps: Number(event.target.value) })}
            >
              {[5, 10, 12, 15, 20, 24, 30, 60].map((fps) => (
                <option key={fps} value={fps}>
                  {fps} fps
                </option>
              ))}
            </select>
            <small>GIFs contain no audio.</small>
          </label>
        ) : (
          <>
            <label className="stacked-label">
              {format.kind === 'audio' ? 'Audio quality' : 'Video quality'}
            </label>
            <div className="segmented conversion-quality" aria-label="Conversion quality">
              {format.kind === 'audio'
                ? ([128, 192, 320] as const).map((rate) => (
                    <button
                      key={rate}
                      aria-pressed={s.audioBitrate === rate}
                      className={s.audioBitrate === rate ? 'selected' : ''}
                      onClick={() => c.update({ audioBitrate: rate })}
                    >
                      {rate === 128 ? 'Compact' : rate === 192 ? 'Balanced' : 'High'}
                      <small>{rate} kbps</small>
                    </button>
                  ))
                : (['small', 'balanced', 'high'] as const).map((quality) => (
                    <button
                      key={quality}
                      aria-pressed={s.quality === quality}
                      className={s.quality === quality ? 'selected' : ''}
                      onClick={() => c.update({ quality, videoBitrate: null })}
                    >
                      {quality === 'small'
                        ? 'Compact'
                        : quality === 'balanced'
                          ? 'Balanced'
                          : 'High'}
                    </button>
                  ))}
            </div>
            <p className="field-note">
              {format.kind === 'audio'
                ? `${s.audioBitrate} kbps · Higher quality uses more space.`
                : s.videoBitrate
                  ? `Custom video bitrate: ${s.videoBitrate} kbps.`
                  : 'Original dimensions. Choose your quality / size balance.'}
            </p>
          </>
        )}
        <label className="conversion-folder-option">
          <FolderTree size={18} />
          <span>
            Keep folder structure
            <small>
              {editor.platform === 'desktop'
                ? 'Preserve album and subfolder organization.'
                : 'Keep album folders in your ZIP download.'}
            </small>
          </span>
          <input
            type="checkbox"
            aria-label="Keep folder structure"
            checked={c.keepFolders}
            onChange={(event) => c.setKeepFolders(event.target.checked)}
          />
        </label>
        <details className="conversion-advanced">
          <summary>
            <Settings2 size={15} />
            Advanced options
            <ChevronDown size={15} />
          </summary>
          <div>
            {format.kind === 'video' && s.format !== 'gif' && (
              <label className="stacked-label">
                Video bitrate <span className="unit">kbps</span>
                <input
                  aria-label="Conversion video bitrate"
                  type="number"
                  min={100}
                  max={100000}
                  step={100}
                  placeholder="Automatic"
                  value={s.videoBitrate ?? ''}
                  onChange={(event) =>
                    c.update({
                      videoBitrate: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                />
              </label>
            )}
            {format.kind !== 'image' && !lossless && s.format !== 'gif' && (
              <label className="stacked-label">
                Audio bitrate
                <select
                  aria-label="Conversion audio bitrate"
                  value={s.audioBitrate}
                  onChange={(event) => c.update({ audioBitrate: Number(event.target.value) })}
                >
                  {[64, 96, 128, 192, 256, 320].map((rate) => (
                    <option value={rate} key={rate}>
                      {rate} kbps
                    </option>
                  ))}
                </select>
              </label>
            )}
            {s.format === 'gif' && <GifOutputControls settings={s} update={c.update} />}
            {format.kind !== 'image' && s.format !== 'gif' && (
              <AudioOutputControls settings={s} update={c.update} />
            )}
            {format.kind !== 'image' && (
              <label className="switch-row">
                <span>
                  Include artwork
                  <small>
                    {format.artwork
                      ? 'Keep embedded album covers when present.'
                      : 'This format does not support cover artwork.'}
                  </small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Conversion include artwork"
                  checked={format.artwork && s.includeArtwork}
                  disabled={!format.artwork}
                  onChange={(event) => c.update({ includeArtwork: event.target.checked })}
                />
              </label>
            )}
            <label className="switch-row">
              <span>
                Keep metadata<small>Titles, artists, albums and other source tags.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Conversion keep metadata"
                checked={s.keepMetadata}
                onChange={(event) => c.update({ keepMetadata: event.target.checked })}
              />
            </label>
            {format.kind !== 'image' && s.format !== 'gif' && (
              <MetadataControls
                tags={s.outputTags}
                update={(outputTags) => c.update({ outputTags })}
                bulk
              />
            )}
            {format.artwork && (
              <CoverArtworkControls
                artwork={c.artwork}
                update={(value) => {
                  c.setArtwork(value);
                  if (value) c.update({ includeArtwork: true });
                }}
                bulk
              />
            )}
            <ConversionNaming conversion={c} />
          </div>
        </details>
      </fieldset>
      <div className="conversion-action">
        <div className="conversion-output-summary">
          <span>{s.keepMetadata ? 'Metadata retained' : 'Metadata removed'}</span>
          {format.artwork && (
            <span>{s.includeArtwork ? 'Artwork retained' : 'Artwork removed'}</span>
          )}
        </div>
        <p className="conversion-destination">
          {editor.platform === 'desktop'
            ? 'Choose an output folder when you start. Existing files get numbered names.'
            : 'Download the converted files together as a ZIP, or save them individually.'}
        </p>
        {c.error && (
          <TransientMessage className="conversion-error" role="alert">
            {c.error}
            {c.incompatible.length > 0 && (
              <button
                onClick={() =>
                  c.setIds(c.ids.filter((id) => !c.incompatible.some((asset) => asset.id === id)))
                }
              >
                Deselect incompatible files
              </button>
            )}
          </TransientMessage>
        )}
        {c.batch.running ? (
          <button className="button subtle conversion-start" disabled>
            Converting…
          </button>
        ) : (
          <button
            className="button primary conversion-start"
            disabled={c.busy || !c.selected.length || !!c.error}
            onClick={c.start}
          >
            {allDone ? (
              <>
                <Check size={17} />
                Conversion complete
              </>
            ) : (
              <>
                <ArrowRight size={17} />
                Convert {c.selected.length || ''} {c.selected.length === 1 ? 'file' : 'files'}
              </>
            )}
          </button>
        )}
        {retryable.length > 0 && !c.batch.running && (
          <button className="conversion-retry" disabled={c.busy || !!c.error} onClick={c.retry}>
            Retry unfinished files
          </button>
        )}
        <span className="conversion-originals">
          {allDone
            ? 'Clear results to convert these files again.'
            : 'Full-length files. Originals untouched.'}
        </span>
      </div>
    </aside>
  );
}
