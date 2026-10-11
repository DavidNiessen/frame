import { TransientMessage } from './TransientMessage';
import { useState } from 'react';
import { BookmarkPlus, Trash2, X } from 'lucide-react';
import { builtInPresets, compatiblePresets, outputSettings, sameOutput } from '../core/presets';
import { useExportPresets } from '../hooks/useExportPresets';
import type { EditSettings, MediaAsset } from '../core/types';
export function PresetControls({
  asset,
  edit,
  update,
}: {
  asset: MediaAsset;
  edit: EditSettings;
  update: (patch: Partial<EditSettings>) => void;
}) {
  const saved = useExportPresets();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const user = compatiblePresets(saved.presets, asset);
  const builtins = compatiblePresets(builtInPresets, asset);
  const presets = [...user, ...builtins];
  const selected = presets.find((p) => sameOutput(p.settings, outputSettings(edit)))?.id ?? '';
  return (
    <div className="preset-controls">
      <label className="stacked-label">
        Export preset
        <select
          aria-label="Export preset"
          value={selected}
          onChange={(event) => {
            const preset = presets.find((p) => p.id === event.target.value);
            if (preset) update(preset.settings);
          }}
        >
          <option value="">Custom settings</option>
          <optgroup label="Built-in">
            {builtins.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {!!user.length && (
            <optgroup label="Your presets">
              {user.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <div className="preset-actions">
        <button
          className="button subtle small"
          onClick={() => {
            setNaming(true);
            setName(user.find((p) => p.id === selected)?.name ?? '');
          }}
        >
          <BookmarkPlus size={13} />
          Save preset
        </button>
        {selected.startsWith('user:') && (
          <button
            className="icon-button"
            aria-label="Delete selected preset"
            onClick={() => saved.remove(selected)}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {naming && (
        <form
          className="preset-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (saved.save(name, edit)) setNaming(false);
          }}
        >
          <label className="stacked-label">
            Preset name
            <input
              type="text"
              autoFocus
              aria-label="Preset name"
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Podcast delivery"
            />
          </label>
          <div className="preset-actions">
            <button type="submit" className="button primary small">
              Save settings
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Cancel preset saving"
              onClick={() => setNaming(false)}
            >
              <X size={14} />
            </button>
          </div>
        </form>
      )}
      <p className="field-note">
        Presets change output settings. Your trim, crop, and volume stay as they are.
      </p>
      {saved.message && (
        <TransientMessage className="field-note" role="status">
          {saved.message}
        </TransientMessage>
      )}
    </div>
  );
}
