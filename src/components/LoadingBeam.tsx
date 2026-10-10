import { useEffect, useState } from 'react';
import { useLoadingActivity, useLoadingStatus } from '../hooks/useLoadingActivity';
export function LoadingBeam({ active }: { active: boolean }) {
  return <span className="loading-beam" data-active={active} aria-hidden="true"><span /></span>;
}
export function AppFooter({ children }: { children: React.ReactNode }) {
  const status = useLoadingStatus();
  const [watching, setWatching] = useState(false);
  useLoadingActivity(watching, 'Converting watched files…');
  useEffect(() => {
    const bridge = window.frameDesktop; if (!bridge?.watchFoldersStatus) return;
    let alive = true;
    const refresh = () => { void bridge.watchFoldersStatus().then(value => { if (alive) setWatching(value.activity.some(item => item.status === 'converting')); }).catch(() => { if (alive) setWatching(false); }); };
    refresh(); const timer = setInterval(refresh, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return <footer className="app-footer" aria-label="Workspace status" aria-busy={!!status}>
    <LoadingBeam active={!!status} />
    <span className="footer-activity" role="status"><span className="status-dot" />{status || 'All processing happens on your device'}</span>{children}
  </footer>;
}
