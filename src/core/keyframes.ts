export interface Keyframe {
  time: number;
  value: number;
}
export interface KeyframeTrack {
  interpolation: 'linear' | 'smooth' | 'hold';
  keys: Keyframe[];
}
export const animatedMediaProperties = ['x', 'y', 'width', 'height', 'opacity'] as const;
export type AnimatedMediaProperty = (typeof animatedMediaProperties)[number];
export type MediaAnimation = Partial<Record<AnimatedMediaProperty, KeyframeTrack>>;
export const animationLimits = {
  x: [-100, 200],
  y: [-100, 200],
  width: [1, 200],
  height: [1, 200],
  opacity: [0, 1],
} as const;
export function parseKeyframeTrack(
  input: unknown,
  min: number,
  max: number,
): KeyframeTrack | undefined {
  if (input === undefined) return undefined;
  const track = input as KeyframeTrack;
  if (
    !track ||
    !['linear', 'smooth', 'hold'].includes(track.interpolation) ||
    !Array.isArray(track.keys) ||
    !track.keys.length ||
    track.keys.length > 256
  )
    throw new Error('Use 1–256 keyframes per property.');
  let previous = -Infinity;
  for (const key of track.keys) {
    if (
      !key ||
      !Number.isFinite(key.time) ||
      Math.abs(key.time) > 86400 ||
      key.time <= previous ||
      !Number.isFinite(key.value) ||
      key.value < min ||
      key.value > max
    )
      throw new Error('Keyframes need ordered times and valid values.');
    previous = key.time;
  }
  return {
    interpolation: track.interpolation,
    keys: track.keys.map((key) => ({ time: key.time, value: key.value })),
  };
}
export function parseMediaAnimation(input: unknown): MediaAnimation | undefined {
  if (input === undefined) return undefined;
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (key) => !animatedMediaProperties.includes(key as AnimatedMediaProperty),
    )
  )
    throw new Error('Invalid animated media property.');
  const value = input as MediaAnimation,
    result: MediaAnimation = {};
  for (const property of animatedMediaProperties) {
    const [min, max] = animationLimits[property],
      track = parseKeyframeTrack(value[property], min, max);
    if (track) result[property] = track;
  }
  return result;
}
export function keyframeValue(
  track: KeyframeTrack | undefined,
  time: number,
  fallback: number,
): number {
  if (!track?.keys.length) return fallback;
  const keys = track.keys;
  if (time <= keys[0].time) return keys[0].value;
  for (let i = 1; i < keys.length; i++)
    if (time < keys[i].time) {
      const a = keys[i - 1],
        b = keys[i],
        progress = (time - a.time) / (b.time - a.time),
        weight =
          track.interpolation === 'hold'
            ? 0
            : track.interpolation === 'smooth'
              ? progress * progress * (3 - 2 * progress)
              : progress;
      return a.value + (b.value - a.value) * weight;
    }
  return keys.at(-1)!.value;
}
const decimal = (value: number) => String(Number(value.toFixed(6)));
/** The same easing function drives frame handles and FFmpeg's frame-by-frame expressions. */
export function keyframeExpression(
  track: KeyframeTrack | undefined,
  fallback: number,
  variable = 't',
  offset = 0,
): string {
  if (!track?.keys.length) return decimal(fallback);
  const keys = track.keys,
    time = `(if(isnan(${variable}),0,${variable})-${decimal(offset)})`;
  // Balanced branches keep FFmpeg's expression parser below its nesting limit,
  // including tracks produced by motion analysis.
  const segments = keys.slice(1).map((b, index) => {
    const a = keys[index],
      progress = `((${time}-${decimal(a.time)})/${decimal(b.time - a.time)})`,
      weight =
        track.interpolation === 'hold'
          ? '0'
          : track.interpolation === 'smooth'
            ? `(${progress}*${progress}*(3-2*${progress}))`
            : progress;
    return `(${decimal(a.value)}+${decimal(b.value - a.value)}*${weight})`;
  });
  const branch = (start: number, end: number): string => {
    if (start === end)
      return start === segments.length ? decimal(keys.at(-1)!.value) : segments[start];
    const middle = Math.floor((start + end) / 2);
    return `if(lt(${time},${decimal(keys[middle + 1].time)}),${branch(start, middle)},${branch(middle + 1, end)})`;
  };
  return `if(lte(${time},${decimal(keys[0].time)}),${decimal(keys[0].value)},${branch(0, segments.length)})`;
}
export function setKeyframe(
  track: KeyframeTrack | undefined,
  time: number,
  value: number,
): KeyframeTrack {
  const keys = (track?.keys ?? []).filter((key) => Math.abs(key.time - time) > 0.001);
  keys.push({ time: Number(time.toFixed(6)), value });
  keys.sort((a, b) => a.time - b.time);
  return { interpolation: track?.interpolation ?? 'linear', keys };
}
export function shiftKeyframes(track: KeyframeTrack | undefined, delta: number) {
  return track
    ? { ...track, keys: track.keys.map((key) => ({ ...key, time: key.time - delta })) }
    : undefined;
}
export function shiftMediaAnimation(
  animation: MediaAnimation | undefined,
  delta: number,
): MediaAnimation | undefined {
  return animation
    ? Object.fromEntries(
        animatedMediaProperties
          .filter((p) => animation[p])
          .map((p) => [p, shiftKeyframes(animation[p], delta)]),
      )
    : undefined;
}
export function animatedMedia<T extends Record<AnimatedMediaProperty, number>>(
  value: T,
  animation: MediaAnimation | undefined,
  time: number,
): T {
  return {
    ...value,
    ...Object.fromEntries(
      animatedMediaProperties.map((property) => [
        property,
        keyframeValue(animation?.[property], time, value[property]),
      ]),
    ),
  };
}
