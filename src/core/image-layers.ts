import { parseImageMask, type ImageMask } from './image-masks';
import { imageBlendModes, type ImageBlendMode } from './image-compositing';
import { appliedEffects, type EffectId } from './effect-library';
import { definitionFor, extraInstances, instanceRecipe } from './effect-instances';
import type { EditSettings, MediaAsset } from './types';
export interface ImageLayerState {
  mask?: ImageMask;
  blend?: ImageBlendMode;
  opacity?: number;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  group?: string;
}
export interface ImageLayerGroup {
  id: string;
  name: string;
  hidden: boolean;
  locked: boolean;
  collapsed: boolean;
}
export interface ImageLayerStack {
  order: string[];
  entries: Record<string, ImageLayerState>;
  groups: ImageLayerGroup[];
}
export const emptyImageLayers = (): ImageLayerStack => ({ order: [], entries: {}, groups: [] });
export const imageLayerKey = (id: EffectId, instanceId?: string) =>
  instanceId ? `instance:${instanceId}` : `primary:${id}`;
export function parseImageLayers(value: unknown): ImageLayerStack | undefined {
  if (value === undefined) return undefined;
  const s = value as ImageLayerStack;
  const key = (v: unknown) =>
    typeof v === 'string' && /^(primary|instance):[a-zA-Z0-9_-]{1,120}$/.test(v);
  const name = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 80;
  if (
    !s ||
    !Array.isArray(s.order) ||
    s.order.length > 1200 ||
    !s.order.every(key) ||
    new Set(s.order).size !== s.order.length ||
    !s.entries ||
    typeof s.entries !== 'object' ||
    Array.isArray(s.entries) ||
    Object.keys(s.entries).length > 1200 ||
    !Array.isArray(s.groups) ||
    s.groups.length > 100
  )
    throw new Error('Invalid image layer stack.');
  const groups = new Set<string>();
  for (const g of s.groups) {
    if (
      !g ||
      !/^[a-zA-Z0-9_-]{1,120}$/.test(g.id) ||
      groups.has(g.id) ||
      !name(g.name) ||
      ![g.hidden, g.locked, g.collapsed].every((v) => typeof v === 'boolean')
    )
      throw new Error('Invalid layer group.');
    groups.add(g.id);
  }
  for (const [id, e] of Object.entries(s.entries)) {
    if (
      !key(id) ||
      !e ||
      typeof e !== 'object' ||
      Array.isArray(e) ||
      (e.name !== undefined && !name(e.name)) ||
      (e.blend !== undefined && !imageBlendModes.includes(e.blend)) ||
      (e.opacity !== undefined &&
        (!Number.isFinite(e.opacity) || e.opacity < 0 || e.opacity > 1)) ||
      ['hidden', 'locked'].some(
        (k) => e[k as 'hidden'] !== undefined && typeof e[k as 'hidden'] !== 'boolean',
      ) ||
      (e.group !== undefined && !groups.has(e.group))
    )
      throw new Error('Invalid image layer.');
    if (e.mask !== undefined) parseImageMask(e.mask);
  }
  return structuredClone(s);
}
export function imageLayerRows(asset: MediaAsset, edit: EditSettings) {
  const primary = appliedEffects(asset, { ...edit, effectInstances: [] }, null);
  const rows = [
    ...primary.map((effect) => ({
      effect,
      recipe: edit,
      id: undefined as string | undefined,
      key: imageLayerKey(effect.id),
    })),
    ...extraInstances(edit).map((instance) => ({
      effect: definitionFor(instance.effect),
      recipe: instanceRecipe(edit, instance),
      id: instance.id,
      key: imageLayerKey(instance.effect, instance.id),
    })),
  ];
  // Geometry defines the canvas; everything else is a bottom-to-top processing stack.
  const rank = (row: (typeof rows)[number]) => {
    if (row.effect.id === 'crop') return -2;
    if (row.effect.id === 'transform') return -1;
    const index = edit.imageLayers?.order.indexOf(row.key) ?? -1;
    return index < 0
      ? 1200 +
          (row.id
            ? 100 + rows.indexOf(row)
            : ['painting', 'watermark', 'captions', 'shape', 'retouch'].includes(row.effect.id)
              ? 80 +
                ['painting', 'watermark', 'captions', 'shape', 'retouch'].indexOf(row.effect.id)
              : rows.indexOf(row))
      : index;
  };
  return rows
    .sort((a, b) => rank(a) - rank(b))
    .map((row) => {
      const state = edit.imageLayers?.entries[row.key] ?? {},
        group = edit.imageLayers?.groups.find((g) => g.id === state.group);
      return {
        ...row,
        state,
        group,
        hidden: !!(state.hidden || group?.hidden),
        locked: !!(state.locked || group?.locked),
        fixed: ['crop', 'transform'].includes(row.effect.id),
      };
    });
}
export function changeImageLayer(
  edit: EditSettings,
  key: string,
  patch: Partial<ImageLayerState>,
): Partial<EditSettings> {
  const s = edit.imageLayers ?? emptyImageLayers();
  return {
    imageLayers: { ...s, entries: { ...s.entries, [key]: { ...s.entries[key], ...patch } } },
  };
}
export function moveImageLayer(
  asset: MediaAsset,
  edit: EditSettings,
  key: string,
  offset: number,
): Partial<EditSettings> {
  const rows = imageLayerRows(asset, edit).filter((row) => !row.fixed),
    order = rows.map((r) => r.key),
    index = order.indexOf(key),
    target = index + offset;
  if (
    index < 0 ||
    target < 0 ||
    target >= order.length ||
    rows[index].locked ||
    rows[target].locked
  )
    return {};
  [order[index], order[target]] = [order[target], order[index]];
  return { imageLayers: { ...(edit.imageLayers ?? emptyImageLayers()), order } };
}

/** Retouch samples the canvas below its layer, so adjustments above it are not baked twice. */
export function imageEditBeforeLayer(
  asset: MediaAsset,
  edit: EditSettings,
  key: string,
): EditSettings {
  const rows = imageLayerRows(asset, edit),
    index = rows.findIndex((row) => row.key === key);
  if (index < 0) return edit;
  let next = edit;
  for (const row of rows.slice(index))
    if (!row.fixed) next = { ...next, ...changeImageLayer(next, row.key, { hidden: true }) };
  return next;
}
