import { createContext } from 'react';
/** Images use an exact composite while idle and a live object only during a gesture. */
export const FrameInteractionContext = createContext<{
  active: boolean;
  start: () => void;
  finish: () => void;
} | null>(null);
