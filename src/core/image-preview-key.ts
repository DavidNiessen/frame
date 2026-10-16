import { effectPreviewRecipe } from './effect-preview';
import type { EditSettings, MediaAsset } from './types';

/** Compact keys avoid retaining another copy of large paint/mask data URLs per cached image. */
export async function imagePreviewKey(asset: MediaAsset, edit: EditSettings) {
  const bytes = new TextEncoder().encode(JSON.stringify(effectPreviewRecipe(asset, edit)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `${asset.id}:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
