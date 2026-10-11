import { ActivityStatus } from './ActivityStatus';
import { useEffect, useState } from 'react';
import { useLoadingActivity, useLoadingStatus } from '../hooks/useLoadingActivity';
import type { WatchActivity } from '../core/watch-folders';
export function LoadingBeam({ active }: { active: boolean }) {
  return (
    <span className="loading-beam" data-active={active} aria-hidden="true">
      <span />
    </span>
  );
}
export function AppFooter({ children }: { children: React.ReactNode }) {
  const status = useLoadingStatus();
  const [watching, setWatching] = useState<WatchActivity>();
  useLoadingActivity(!!watching, 'Converting watched files…', {
    priority: 1,
    ratio: watching?.progress,
    message: watching?.name,
  });
  useEffect(() => {
    const bridge = window.frameDesktop;
    if (!bridge?.watchFoldersStatus) return;
    let alive = true;
    const refresh = () => {
      void bridge
        .watchFoldersStatus()
        .then((value) => {
          if (alive) setWatching(value.activity.find((item) => item.status === 'converting'));
        })
        .catch(() => {
          if (alive) setWatching(undefined);
        });
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <footer className="app-footer" aria-label="Workspace status" aria-busy={!!status}>
      <LoadingBeam active={!!status} />
      <ActivityStatus />
      {children}
    </footer>
  );
}
