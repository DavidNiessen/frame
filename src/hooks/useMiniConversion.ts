import { useEffect, useRef, useState } from 'react';
import type { Editor } from './useEditor';
import type { Conversion } from './useConversion';

export function useMiniConversion(editor: Editor, conversion: Conversion) {
  const [expanded, setExpanded] = useState(true), [finishing, setFinishing] = useState(false);
  const collapsedRun = useRef(false);
  const running = conversion.batch.running;
  const active = conversion.batch.jobs.some(job => job.status === 'running');
  useEffect(() => {
    void window.frameDesktop!.setMiniExpanded(expanded, matchMedia('(prefers-reduced-motion: reduce)').matches).catch(error => editor.setNotice(String(error)));
  }, [expanded]);
  useEffect(() => {
    if (running && active && !collapsedRun.current) { collapsedRun.current = true; setExpanded(false); }
    if (!running) {
      collapsedRun.current = false;
      if (conversion.unfinished.length) setExpanded(true);
    }
  }, [running, active, conversion.unfinished.length]);
  const successful = !running && !editor.busy && !conversion.selected.length && conversion.batch.jobs.length > 0 && conversion.batch.jobs.every(job => job.status === 'done') && !editor.importReport?.issues.length;
  useEffect(() => {
    setFinishing(false);
    if (!successful) return;
    const fade = setTimeout(() => setFinishing(true), 350);
    const close = setTimeout(() => {
      void window.frameDesktop!.finishMini().then(closed => { if (!closed) setFinishing(false); }).catch(() => { /* The renderer may close before the IPC reply. */ });
    }, 600);
    return () => { clearTimeout(fade); clearTimeout(close); };
  }, [successful, editor.busy, editor.assets.length]);
  function dismiss() { if (!conversion.busy) void window.frameDesktop!.dismissMini().catch(error => editor.setNotice(String(error))); }
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !conversion.busy) dismiss(); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [conversion.busy]);
  return { expanded, setExpanded, finishing, dismiss };
}
