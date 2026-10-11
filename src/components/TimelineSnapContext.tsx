import { createContext } from 'react';
import type { SnapSpace } from '../core/snapping';
export const TimelineSnapContext = createContext<{
  enabled: boolean;
  targets: Record<SnapSpace, number[]>;
  frameRate?: number;
}>({ enabled: false, targets: { source: [], output: [] } });
