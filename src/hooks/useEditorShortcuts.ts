import { useEffect, type RefObject } from 'react';
import type { Editor } from './useEditor';
import type { Workflow } from '../core/launch';
import { skipSeconds, stepFrame } from '../core/playhead';
import { useLatest } from './useLatest';

interface ShortcutContext {
  editor: Editor;
  current: number;
  workflow: Workflow;
  settingsOpen: boolean;
  blocked: boolean;
  mediaRef: RefObject<HTMLMediaElement | null>;
  onImport: () => void;
  seek: (value: number, output?: number) => void;
}

export function useEditorShortcuts(context: ShortcutContext) {
  const latest = useLatest(context);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      const { editor, current, workflow, settingsOpen, blocked, mediaRef, onImport, seek } =
        latest.current;
      const target = event.target as HTMLElement,
        tag = target?.tagName;
      const textEntry =
        target?.matches(
          'textarea, select, input:not([type="range"]):not([type="checkbox"]):not([type="radio"])',
        ) || target?.isContentEditable;
      if (
        event.code === 'Space' &&
        !event.defaultPrevented &&
        !textEntry &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        workflow === 'edit' &&
        !settingsOpen &&
        editor.edit &&
        mediaRef.current
      ) {
        event.preventDefault();
        if (event.repeat || editor.busy) return;
        // Share the transport's pending-preview handling and selected-clip loop.
        document.querySelector<HTMLButtonElement>('[data-preview-playback] .play-button')?.click();
        return;
      }
      if (
        event.defaultPrevented ||
        ['INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY'].includes(tag) ||
        target?.isContentEditable ||
        target?.closest('dialog[open]') ||
        settingsOpen ||
        blocked
      )
        return;
      const modified = event.metaKey || event.ctrlKey;
      if (modified && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        if (!editor.busy) onImport();
      }
      if (workflow === 'convert') return;
      if (modified && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      }
      if (!editor.edit || editor.busy || modified || event.altKey) return;
      if ((event.key === ',' || event.key === '.') && editor.asset && mediaRef.current) {
        event.preventDefault();
        mediaRef.current.pause();
        seek(
          editor.asset.kind === 'video'
            ? stepFrame(
                editor.edit,
                current,
                editor.asset.frameRate ?? 30,
                event.key === ',' ? -1 : 1,
              )
            : skipSeconds(editor.edit, current, event.key === ',' ? -1 : 1),
        );
      }
      if (event.key.toLowerCase() === 'i')
        editor.updateClip({ start: Math.min(current, editor.scopedEdit!.end - 0.05) });
      if (event.key.toLowerCase() === 'o')
        editor.updateClip({ end: Math.max(current, editor.scopedEdit!.start + 0.05) });
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [latest]);
}
