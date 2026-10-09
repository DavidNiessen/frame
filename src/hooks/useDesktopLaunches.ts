import { useCallback, useEffect, useRef } from 'react';
import type { Workflow } from '../core/launch';
import type { Editor } from './useEditor';

export function useDesktopLaunches(editor: Editor, activate: (workflow: Workflow) => void, blocked: boolean, selectConversion: (ids: string[], append: boolean) => void) {
  const latest = useRef({ editor, activate, blocked, selectConversion }); latest.current = { editor, activate, blocked, selectConversion };
  const selectionGroup = useRef('');
  const mounted = useRef(false), draining = useRef(false), wake = useRef(false);
  const drain = useCallback(async () => {
    wake.current = true;
    if (draining.current || !window.frameDesktop) return;
    draining.current = true;
    try {
      while (mounted.current && !latest.current.editor.busy && !latest.current.blocked) {
        wake.current = false;
        const request = await window.frameDesktop.nextLaunch();
        if (!request || !mounted.current || latest.current.editor.busy || latest.current.blocked) break;
        const accepted = await latest.current.editor.importLaunch(request.id, () => latest.current.activate(request.workflow), ids => {
          if (request.workflow === 'convert' && request.count) {
            latest.current.selectConversion(ids, selectionGroup.current === request.group);
            selectionGroup.current = request.group;
          }
        });
        if (!accepted) break;
      }
    } catch (error) { if (mounted.current) latest.current.editor.setNotice(error instanceof Error ? error.message : 'Could not open the selected files.'); }
    finally {
      draining.current = false;
      if (wake.current && mounted.current && !latest.current.editor.busy && !latest.current.blocked) void drain();
    }
  }, []);
  useEffect(() => {
    if (!window.frameDesktop) return;
    mounted.current = true;
    const remove = window.frameDesktop.onLaunchAvailable(() => {
      if (latest.current.editor.busy || latest.current.blocked) latest.current.editor.setNotice('Selected files are queued and will open when Frame is available.');
      void drain();
    });
    void drain();
    return () => { mounted.current = false; remove(); };
  }, [drain]);
  useEffect(() => { if (!editor.busy && !blocked) void drain(); }, [editor.busy, blocked, drain]);
}
