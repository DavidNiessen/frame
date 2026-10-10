import { createContext, useContext, useEffect } from 'react';

/** The desktop host keeps window controls visible while the preview fills the workspace. */
export const DesktopChromeContext = createContext<((pinned: boolean) => void) | null>(null);

export function useDesktopChrome(pinned: boolean) {
  const setPinned = useContext(DesktopChromeContext);
  useEffect(() => {
    setPinned?.(pinned);
    return () => setPinned?.(false);
  }, [setPinned, pinned]);
}
