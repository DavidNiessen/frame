import type { MediaClip } from './composition';
import { editedDuration } from './timeline';
export interface TransitionSettings {
  type: 'none' | 'fade';
  duration: number;
}
export const defaultTransition: TransitionSettings = { type: 'none', duration: 0.3 };
export function parseTransition(value: unknown): TransitionSettings {
  if (value === undefined) return { ...defaultTransition };
  if (!value || typeof value !== 'object') throw new Error('Invalid transition settings.');
  const settings = value as TransitionSettings;
  if (
    !['none', 'fade'].includes(settings.type) ||
    !Number.isFinite(settings.duration) ||
    settings.duration < 0.05 ||
    settings.duration > 30
  )
    throw new Error('Transition duration must be between 0.05 and 30 seconds.');
  return { type: settings.type, duration: settings.duration };
}
export function validateTransition(
  clips: MediaClip[],
  value: TransitionSettings,
): TransitionSettings {
  const settings = parseTransition(value);
  if (
    settings.type === 'fade' &&
    settings.duration > Math.min(...clips.map((c) => editedDuration(c.edit))) / 2 + 1e-6
  )
    throw new Error('A transition can use at most half of the shortest clip.');
  return settings;
}
