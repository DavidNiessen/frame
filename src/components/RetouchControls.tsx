import { useEffect, useRef, useState } from 'react';
import { parseRetouch } from '../core/retouch';
import { rasterRetouch } from '../engines/retouch-renderer';
import { useRetouchSource } from './RetouchSource';
import { useLoadingActivity } from '../hooks/useLoadingActivity';
import type { Editor } from '../hooks/useEditor';
export function RetouchControls({ editor, layerKey }: { editor: Editor; layerKey: string }) {
  const value = parseRetouch(editor.edit!.retouch),
    change = (patch: Partial<typeof value>) => editor.update({ retouch: { ...value, ...patch } }),
    context = useRetouchSource(),
    [saving, setSaving] = useState(false),
    source = context?.source?.key === layerKey ? context.source : null;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useLoadingActivity(saving, 'Rendering retouch layer…');
  async function undo() {
    if (!source) return;
    setSaving(true);
    try {
      const next = { ...value, strokes: value.strokes.slice(0, -1) },
        image = await rasterRetouch(source.url, next, source.width, source.height);
      if (alive.current) change({ ...next, image });
    } catch (error) {
      if (alive.current) editor.setNotice((error as Error).message);
    } finally {
      if (alive.current) setSaving(false);
    }
  }
  return (
    <section className="control-section retouch-controls">
      <p className="field-note">
        Alt/Option-click the canvas to choose a source, then paint over the area to repair. Each
        stroke keeps a fixed source offset. Healing matches surrounding color while retaining
        texture.
      </p>
      <div className="segmented">
        {(['clone', 'heal', 'erase'] as const).map((mode) => (
          <button key={mode} aria-pressed={value.mode === mode} onClick={() => change({ mode })}>
            {mode === 'clone' ? 'Clone' : mode === 'heal' ? 'Heal' : 'Erase'}
          </button>
        ))}
      </div>
      <label className="stacked-label">
        Brush size · {Math.round(value.size * 1000) / 10}%
        <input
          aria-label="Retouch brush size"
          type="range"
          min={0.001}
          max={0.2}
          step={0.001}
          value={value.size}
          onChange={(e) => change({ size: Number(e.target.value) })}
        />
      </label>
      <label className="stacked-label">
        Hardness · {Math.round(value.hardness * 100)}%
        <input
          aria-label="Retouch brush hardness"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value.hardness}
          onChange={(e) => change({ hardness: Number(e.target.value) })}
        />
      </label>
      <label className="stacked-label">
        Opacity · {Math.round(value.opacity * 100)}%
        <input
          aria-label="Retouch brush opacity"
          type="range"
          min={0.01}
          max={1}
          step={0.01}
          value={value.opacity}
          onChange={(e) => change({ opacity: Number(e.target.value) })}
        />
      </label>
      <p className="field-note" role="status">
        {value.source ? 'Source selected. Paint on the canvas.' : 'Choose a source point first.'}{' '}
        {value.strokes.length} strokes
      </p>
      <div className="painting-actions">
        <button
          className="button subtle small"
          disabled={saving || !source || !value.strokes.length}
          onClick={() => void undo()}
        >
          Undo retouch stroke
        </button>
        <button
          className="button subtle small"
          disabled={saving || !value.strokes.length}
          onClick={() => change({ strokes: [], image: null })}
        >
          Clear retouch layer
        </button>
        <button
          className="button subtle small"
          disabled={!value.source || saving}
          onClick={() => change({ source: null })}
        >
          Choose new source
        </button>
      </div>
    </section>
  );
}
