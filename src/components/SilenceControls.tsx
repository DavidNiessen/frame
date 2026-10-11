import { TransientMessage } from './TransientMessage';
import { useEffect, useState } from 'react';
import { applySilenceCuts, defaultSilence, silenceCandidates } from '../core/silence';
import { time } from '../core/format';
import type { TimeRange } from '../core/types';
import type { Editor } from '../hooks/useEditor';
export function SilenceControls({
  editor,
  seek,
  expanded = false,
}: {
  expanded?: boolean;
  editor: Editor;
  seek: (time: number) => void;
}) {
  const options = editor.edit?.silenceOptions ?? defaultSilence,
    setOptions = (silenceOptions: typeof defaultSilence) => editor.update({ silenceOptions });
  const [ranges, setRanges] = useState<TimeRange[] | null>(null),
    [selected, setSelected] = useState<number[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setRanges(null);
    setSelected([]);
    setError('');
  }, [editor.asset?.id, editor.edit, options]);
  async function detect() {
    if (!editor.asset || !editor.edit || editor.busy) return;
    setLoading(true);
    setError('');
    try {
      const found = await editor.runExclusive('analysis', (e) =>
        e.detectSilence(editor.asset!, options, () => {}),
      );
      const candidates = silenceCandidates(found, editor.edit, options.padding);
      setRanges(candidates);
      setSelected(candidates.map((_, i) => i));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <details className="advanced" open={expanded || undefined}>
      <summary>Remove silence</summary>
      <div className="advanced-content">
        <div className="field-grid">
          {(['threshold', 'minimum', 'padding'] as const).map((key) => (
            <label key={key}>
              {
                { threshold: 'Threshold dB', minimum: 'Minimum sec', padding: 'Keep padding sec' }[
                  key
                ]
              }
              <input
                aria-label={`Silence ${key}`}
                type="number"
                step={key === 'threshold' ? 1 : 0.1}
                min={key === 'threshold' ? -80 : key === 'minimum' ? 0.1 : 0}
                max={key === 'threshold' ? -10 : key === 'minimum' ? 30 : 2}
                value={options[key]}
                onChange={(e) => setOptions({ ...options, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
        <button
          className="button subtle small"
          onClick={() => void detect()}
          disabled={loading || !!editor.busy}
        >
          {loading ? 'Detecting…' : 'Find silent sections'}
        </button>
        {ranges && (
          <>
            <p role="status">
              {ranges.length
                ? `${ranges.length} proposed cuts. Review before applying.`
                : 'No removable silence found with these settings.'}
            </p>
            <div className="cue-list">
              {ranges.map((r, i) => (
                <div className="cue" key={i}>
                  <label className="switch-row">
                    {time(r.start)} – {time(r.end)}
                    <input
                      aria-label={`Remove silent section ${i + 1}`}
                      type="checkbox"
                      checked={selected.includes(i)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? [...selected, i] : selected.filter((n) => n !== i),
                        )
                      }
                    />
                  </label>
                  <button
                    className="button subtle small"
                    onClick={() => seek(Math.max(editor.edit!.start, r.start - 0.25))}
                  >
                    Review section {i + 1}
                  </button>
                </div>
              ))}
            </div>
            <button
              className="button subtle small"
              disabled={!selected.length}
              onClick={() => {
                try {
                  editor.update(
                    applySilenceCuts(
                      editor.edit!,
                      ranges.filter((_, i) => selected.includes(i)),
                    ),
                  );
                  editor.setNotice('Reviewed silence cuts applied. Undo to restore them.');
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Apply selected silence cuts
            </button>
          </>
        )}
        <p className="field-note">
          Detection reads the original audio. Padding preserves breathing room around quiet
          sections. Only selected, reviewed sections are removed; the source file stays intact.
        </p>
        {error && <TransientMessage role="alert">{error}</TransientMessage>}
      </div>
    </details>
  );
}
