export type Corner = 'nw' | 'ne' | 'sw' | 'se';
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export const round = (value: number) => Math.round(value * 100) / 100;
/** Resize with a fixed opposite corner and preserve the object's aspect ratio. */
export function resizeFactor(box: Box, frame: Box, corner: Corner, dx: number, dy: number) {
  const west = corner.endsWith('w'),
    north = corner.startsWith('n');
  const availableWidth = west
    ? box.left + box.width - frame.left
    : frame.left + frame.width - box.left;
  const availableHeight = north
    ? box.top + box.height - frame.top
    : frame.top + frame.height - box.top;
  const factor =
    1 +
    ((west ? -dx : dx) * box.width + (north ? -dy : dy) * box.height) /
      Math.max(1, box.width ** 2 + box.height ** 2);
  return clamp(
    factor,
    0.01,
    Math.max(0.01, Math.min(availableWidth / box.width, availableHeight / box.height)),
  );
}
export function resizedBox(box: Box, corner: Corner, factor: number): Box {
  const width = box.width * factor,
    height = box.height * factor;
  return {
    left: corner.endsWith('w') ? box.left + box.width - width : box.left,
    top: corner.startsWith('n') ? box.top + box.height - height : box.top,
    width,
    height,
  };
}
