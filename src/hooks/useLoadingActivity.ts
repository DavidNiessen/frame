import { useEffect, useSyncExternalStore } from 'react';
import { loadingActivity } from '../core/loading-activity';
export function useLoadingActivity(active: boolean, label: string) {
  useEffect(() => { if (active) return loadingActivity.begin(label); }, [active, label]);
}
export function useLoadingStatus() {
  return useSyncExternalStore(loadingActivity.subscribe, loadingActivity.snapshot, () => '');
}
