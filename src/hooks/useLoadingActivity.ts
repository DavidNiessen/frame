import { useEffect, useRef, useSyncExternalStore } from 'react';
import { loadingActivity, type ActivityOptions } from '../core/loading-activity';
export function useLoadingActivity(active: boolean, label: string, options: ActivityOptions = {}) {
  const latest = useRef(options);
  latest.current = options;
  const owner = useRef<ReturnType<typeof loadingActivity.start> | null>(null);
  useEffect(() => {
    if (!active) return;
    const task = loadingActivity.start(label, {
      ...latest.current,
      cancel: latest.current.cancel ? () => latest.current.cancel?.() : undefined,
    });
    owner.current = task;
    return () => {
      owner.current = null;
      task.finish();
    };
  }, [active, label]);
  useEffect(() => {
    owner.current?.update({
      ratio: options.ratio,
      message: options.message,
      priority: options.priority,
      cancelLabel: options.cancelLabel,
    });
  }, [options.ratio, options.message, options.priority, options.cancelLabel]);
}
export function useLoadingStatus() {
  return useSyncExternalStore(loadingActivity.subscribe, loadingActivity.snapshot, () => '');
}
export function useLoadingTask() {
  return useSyncExternalStore(loadingActivity.subscribe, loadingActivity.taskSnapshot, () => null);
}
