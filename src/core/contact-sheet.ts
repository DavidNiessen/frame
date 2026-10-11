import { clipFilterGraph } from './clip-filters';
import { editClips } from './clips';
import { validateEdit } from './export-plan';
import { resourcePaths, type RecipeResources } from './resources';
import { editedDuration } from './timeline';
import type { EditSettings, MediaAsset } from './types';
export interface ContactSheetOptions {
  columns: number;
  rows: number;
  width: number;
  timestamps: boolean;
}
export const defaultContactSheet = (): ContactSheetOptions => ({
  columns: 4,
  rows: 3,
  width: 320,
  timestamps: true,
});
export function parseContactSheet(value: unknown): ContactSheetOptions {
  const options = value as ContactSheetOptions;
  if (
    !options ||
    ![options.columns, options.rows].every((n) => Number.isInteger(n) && n >= 2 && n <= 6) ||
    ![160, 240, 320, 480].includes(options.width) ||
    typeof options.timestamps !== 'boolean'
  )
    throw new Error('Choose a 2–6 row and column contact sheet with supported frame sizes.');
  return {
    columns: options.columns,
    rows: options.rows,
    width: options.width,
    timestamps: options.timestamps,
  };
}
export function sheetDimensions(options: ContactSheetOptions) {
  const o = parseContactSheet(options),
    frameHeight = Math.round((o.width * 9) / 16),
    labelHeight = o.timestamps ? 24 : 0;
  return {
    width: o.columns * (o.width + 8) + 8,
    height: o.rows * (frameHeight + labelHeight + 8) + 8,
    frameHeight,
    labelHeight,
  };
}
export function contactSheetArgs(
  asset: MediaAsset,
  edit: EditSettings,
  options: ContactSheetOptions,
  input: string,
  output: string,
  paths: RecipeResources = resourcePaths(),
): string[] {
  validateEdit(asset, edit);
  const o = parseContactSheet(options);
  if (asset.kind !== 'video') throw new Error('Contact sheets require video.');
  const recipe = { ...edit, clips: editClips(edit), cuts: [], splits: [] },
    count = o.columns * o.rows,
    dimensions = sheetDimensions(o);
  const graph = clipFilterGraph(asset, recipe, '0', 'sheet', paths, true, false).graph;
  graph.push(
    `[sheetv]fps=${count / editedDuration(recipe)}:start_time=0:round=up,scale=${o.width}:${dimensions.frameHeight}:force_original_aspect_ratio=decrease,pad=${o.width}:${dimensions.frameHeight + dimensions.labelHeight}:(ow-iw)/2:(${dimensions.frameHeight}-ih)/2:color=0x10121a,tile=${o.columns}x${o.rows}:nb_frames=${count}:padding=8:margin=8:color=0x10121a[sheet]`,
  );
  return [
    '-y',
    '-ss',
    String(recipe.start),
    '-t',
    String(recipe.end - recipe.start),
    '-i',
    input,
    '-filter_complex',
    graph.join(';'),
    '-map',
    '[sheet]',
    '-an',
    '-frames:v',
    '1',
    '-c:v',
    'png',
    '-threads',
    '1',
    '-update',
    '1',
    output,
  ];
}
