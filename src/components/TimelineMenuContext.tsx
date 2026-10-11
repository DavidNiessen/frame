import { createContext } from 'react';
import type { MouseEvent } from 'react';
import type { TimeRange } from '../core/types';
import type { TimelineClipboard } from '../core/timeline-clipboard';
export interface TimelineMenuTarget {
  label: string;
  range: TimeRange;
  shown: TimeRange;
  limits: TimeRange;
  speed: number;
  minimum: number;
  edges: ('start' | 'end')[];
  clipId?: string;
  clipboard?: TimelineClipboard;
  select: () => void;
  change: (range: TimeRange) => void;
  move?: (delta: number) => void;
  moveLimits?: TimeRange;
  preview?: (range: TimeRange, edge: 'start' | 'end' | 'body') => void;
  remove?: () => void;
}
export const TimelineMenuContext = createContext<{
  open: (event: MouseEvent<HTMLElement>, target?: TimelineMenuTarget) => void;
  focus: (target: TimelineMenuTarget) => void;
} | null>(null);
