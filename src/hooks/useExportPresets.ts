import { useEffect, useState } from 'react';
import {
  outputSettings,
  parseOutputSettings,
  readPresets,
  type ExportPreset,
} from '../core/presets';
import type { EditSettings } from '../core/types';
const key = 'frame-export-presets';
export function useExportPresets() {
  const [presets, setPresets] = useState<ExportPreset[]>(() => {
    try {
      return readPresets(localStorage.getItem(key));
    } catch {
      return [];
    }
  });
  const [message, setMessage] = useState('');
  useEffect(() => {
    // The Lexicon plugin offers saved audio presets; Frame's main process cannot read storage.
    void window.frameDesktop?.shareLexiconPresets?.(presets).catch(() => {});
  }, [presets]);
  function store(next: ExportPreset[]) {
    setPresets(next);
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, presets: next }));
      return true;
    } catch {
      setMessage('Browser storage is unavailable. Presets will last for this session.');
      return false;
    }
  }
  function save(name: string, edit: EditSettings): boolean {
    try {
      name = name.trim();
      if (!name || name.length > 60) throw new Error('Choose a preset name of 1–60 characters.');
      const settings = parseOutputSettings(outputSettings(edit));
      const existing = presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (!existing && presets.length >= 20)
        throw new Error('You can save up to 20 presets. Delete one to add another.');
      const next = presets.filter((p) => p.id !== existing?.id);
      next.push({ id: existing?.id ?? `user:${crypto.randomUUID()}`, name, settings });
      setMessage('');
      if (store(next)) setMessage('Preset saved on this device.');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the preset.');
      return false;
    }
  }
  function remove(id: string) {
    setMessage('');
    if (store(presets.filter((p) => p.id !== id)))
      setMessage('Preset deleted. Current settings are unchanged.');
  }
  return { presets, message, save, remove };
}
