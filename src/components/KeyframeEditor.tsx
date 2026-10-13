import { Diamond, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { keyframeValue, setKeyframe, type KeyframeTrack } from '../core/keyframes';
import { time } from '../core/format';
export function KeyframeEditor({
  track,
  value,
  min,
  max,
  current,
  duration,
  label,
  change,
  seek,
}: {
  track?: KeyframeTrack;
  value: number;
  min: number;
  max: number;
  current: number;
  duration: number;
  label: string;
  change: (track: KeyframeTrack | undefined) => void;
  seek: (time: number) => void;
}) {
  const local = Math.max(0, Math.min(duration, current)),
    keys = track?.keys ?? [],
    present = keys.find((key) => Math.abs(key.time - local) < 0.01),
    shown = keyframeValue(track, local, value),
    previous = keys.filter((key) => key.time < local - 0.01).at(-1),
    next = keys.find((key) => key.time > local + 0.01);
  return (
    <section className="keyframe-editor control-section" aria-label={`${label} keyframes`}>
      <label className="switch-row">
        <span>
          <Diamond size={14} />
          Animate {label.toLowerCase()}
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label={`Animate ${label.toLowerCase()}`}
          checked={!!track}
          onChange={(e) =>
            change(
              e.target.checked
                ? { interpolation: 'linear', keys: [{ time: 0, value }] }
                : undefined,
            )
          }
        />
      </label>
      {track && (
        <>
          <label className="stacked-label">
            Interpolation
            <select
              aria-label={`${label} keyframe interpolation`}
              value={track.interpolation}
              onChange={(e) =>
                change({
                  ...track,
                  interpolation: e.target.value as KeyframeTrack['interpolation'],
                })
              }
            >
              <option value="linear">Linear</option>
              <option value="smooth">Smooth ease</option>
              <option value="hold">Hold</option>
            </select>
          </label>
          <label className="stacked-label">
            {label} at {time(local)}
            <input
              type="number"
              aria-label={`${label} keyframe value`}
              min={min}
              max={max}
              step={label === 'Opacity' ? 0.01 : 0.1}
              value={Number(shown.toFixed(4))}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (value >= min && value <= max) change(setKeyframe(track, local, value));
              }}
            />
          </label>
          <div className="keyframe-actions">
            <button
              className="icon-button"
              aria-label={`Previous ${label.toLowerCase()} keyframe`}
              disabled={!previous}
              onClick={() => seek(Math.max(0, previous!.time))}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              className="button subtle small"
              onClick={() => change(setKeyframe(track, local, shown))}
            >
              <Plus size={13} />
              {present ? 'Update' : 'Add'} keyframe
            </button>
            <button
              className="icon-button"
              aria-label={`Next ${label.toLowerCase()} keyframe`}
              disabled={!next}
              onClick={() => seek(Math.min(duration, next!.time))}
            >
              <ChevronRight size={15} />
            </button>
            <button
              className="icon-button danger"
              aria-label={`Remove ${label.toLowerCase()} keyframe`}
              disabled={!present}
              onClick={() => {
                const remaining = keys.filter((key) => key !== present);
                change(remaining.length ? { ...track, keys: remaining } : undefined);
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="keyframe-list">
            {keys
              .filter((key) => key.time >= 0 && key.time <= duration)
              .map((key) => (
                <button
                  key={key.time}
                  className={`button subtle small ${Math.abs(key.time - local) < 0.01 ? 'selected' : ''}`}
                  aria-label={`${label} keyframe at ${time(key.time)}`}
                  onClick={() => seek(key.time)}
                >
                  <Diamond size={10} />
                  {time(key.time)}
                </button>
              ))}
          </div>
          <p className="field-note">
            Move the playhead, then edit the value to create a keyframe. Animation moves with the
            track and survives trimming and splitting.
          </p>
        </>
      )}
    </section>
  );
}
