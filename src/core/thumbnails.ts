import type { MediaAsset } from './types';
export const thumbnailCount = 12;
export const thumbnailWidth = 160;
export const thumbnailHeight = 90;
export function thumbnailArgs(asset: MediaAsset, input: string, output: string): string[] {
  if (asset.kind !== 'video') throw new Error('Only video has timeline thumbnails.');
  return ['-y', '-i', input, '-an', '-vf', `fps=${thumbnailCount / asset.duration},scale=${thumbnailWidth}:${thumbnailHeight}:force_original_aspect_ratio=decrease,pad=${thumbnailWidth}:${thumbnailHeight}:(ow-iw)/2:(oh-ih)/2,tile=${thumbnailCount}x1`, '-frames:v', '1', '-threads', '2', output];
}
