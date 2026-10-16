import type { EditSettings } from './types';

/** Recipes contain JSON values and immutable collections; retained media strings stay shared. */
export function sameEditSettings(left: EditSettings, right: EditSettings) {
  return sameValue(left, right);
}
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    );
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>;
  const keys = Object.keys(a).filter((key) => a[key] !== undefined);
  if (keys.length !== Object.keys(b).filter((key) => b[key] !== undefined).length) return false;
  return keys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && sameValue(a[key], b[key]),
  );
}
