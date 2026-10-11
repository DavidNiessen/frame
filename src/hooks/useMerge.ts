import { notifyCompletion } from '../core/completion-notifications';
import { useEffect, useRef, useState } from 'react';
import type { TransitionSettings } from '../core/transitions';
import type { Editor } from './useEditor';
import type { OutputSettings } from '../core/presets';
import type { ExportProgress, ExportResult } from '../core/types';
export function useMerge(editor: Editor) {
  const [result, setResult] = useState<ExportResult | null>(null);
  const resultRef = useRef(result);
  resultRef.current = result;
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
    },
    [],
  );
  async function start(ids: string[], settings: OutputSettings, transition?: TransitionSettings) {
    if (editor.busy) return;
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setError('');
    setProgress({ ratio: 0, message: 'Preparing merge…' });
    try {
      const clips = ids.map((id) => {
        const asset = editor.assets.find((a) => a.id === id);
        if (!asset) throw new Error('Import each merge source again.');
        return { asset, edit: structuredClone(editor.settingsFor(id)) };
      });
      const output = await editor.runExclusive('merge', (engine) =>
        engine.merge(clips, settings, setProgress, transition),
      );
      if (output) await notifyCompletion({ kind: 'merge', total: 1, completed: 1, failed: 0 });
      setResult(output);
      editor.setNotice(output ? 'Merge complete. Source files are unchanged.' : 'Merge cancelled.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      editor.setNotice(message);
    } finally {
      setProgress(null);
    }
  }
  return { result, progress, error, start };
}
export type Merge = ReturnType<typeof useMerge>;
