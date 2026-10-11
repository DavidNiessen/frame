import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../core/app-updates';
import { useLoadingActivity } from './useLoadingActivity';

export function useUpdateStatus() {
  const bridge = window.frameDesktop;
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!bridge?.updateStatus) return;
    let active = true,
      received = false;
    const unsubscribe = bridge.onUpdateStatus((value) => {
      received = true;
      if (active) setStatus(value);
    });
    void bridge
      .updateStatus()
      .then((value) => {
        if (active && !received) setStatus(value);
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);
  return { status, setStatus, error, setError };
}
export function useAppUpdateActivity() {
  const { status } = useUpdateStatus();
  useLoadingActivity(status?.phase === 'checking', 'Checking for Frame updates…', { priority: -1 });
  useLoadingActivity(status?.phase === 'downloading', 'Downloading Frame update…', {
    ratio: status?.ratio,
    priority: 2,
    cancel: () => void window.frameDesktop?.cancelUpdateDownload(),
    cancelLabel: 'Cancel download',
  });
}
