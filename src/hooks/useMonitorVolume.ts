import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { monitorVolume, subscribeMonitorVolume } from '../core/monitor-volume';
export function useMonitorVolume() {
  return useSyncExternalStore(subscribeMonitorVolume, monitorVolume, () => 1);
}
export function useMonitorMediaVolume(
  ref: RefObject<HTMLMediaElement | null>,
  source?: string | null,
) {
  const volume = useMonitorVolume();
  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [ref, volume, source]);
}
