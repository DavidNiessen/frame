import type { MediaAsset } from './types';
export const editableMediaTags = ['title', 'artist', 'album', 'album_artist', 'track', 'date', 'genre', 'comment', 'copyright'] as const;
export type MediaTagOverrides = Partial<Record<typeof editableMediaTags[number], string>>;
export function parseTagOverrides(value: unknown): MediaTagOverrides {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid output metadata.');
  const tags: MediaTagOverrides = {};
  for (const [key, text] of Object.entries(value)) {
    if (!editableMediaTags.includes(key as typeof editableMediaTags[number]) || typeof text !== 'string' || text.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error('Use supported metadata fields with up to 2,000 characters.');
    tags[key as keyof MediaTagOverrides] = text;
  }
  return tags;
}
export function mediaTagArgs(value: unknown): string[] {
  return Object.entries(parseTagOverrides(value)).flatMap(([key, text]) => ['-metadata', `${key}=${text}`]);
}

export const taggedNamingAsset = (asset: MediaAsset, tags?: MediaTagOverrides): MediaAsset => ({ ...asset, metadata: { ...asset.metadata, ...parseTagOverrides(tags) } });
