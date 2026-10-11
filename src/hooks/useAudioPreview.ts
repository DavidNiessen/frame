import { hasEditedAudio } from '../core/audio-layers';
import { useEffect, useRef, useState } from 'react';
import type { Editor } from './useEditor';
export function useAudioPreview(editor: Editor) {
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef(url);
  ref.current = url;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (ref.current) URL.revokeObjectURL(ref.current);
    setUrl(null);
    setError('');
  }, [editor.asset?.id, editor.edit]);
  useEffect(
    () => () => {
      if (ref.current) URL.revokeObjectURL(ref.current);
    },
    [],
  );
  async function generate() {
    if (!editor.asset || !editor.edit || !hasEditedAudio(editor.asset, editor.edit) || editor.busy)
      return;
    setLoading(true);
    setError('');
    try {
      const next = await editor.runExclusive('analysis', (engine) =>
        engine.previewAudio(editor.asset!, editor.edit!, () => {}),
      );
      if (ref.current) URL.revokeObjectURL(ref.current);
      setUrl(next);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }
  return { url, loading, error, generate };
}
