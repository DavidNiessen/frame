import { filterPath, type RecipeResources } from './resources';
import type { MediaAsset, EditSettings } from './types';
export interface Overlays { text: string; x: number; y: number; size: number; color: string; opacity: number; image: string | null; imageWidth: number }
export const defaultOverlays = (): Overlays => ({ text: '', x: 95, y: 95, size: 28, color: '#ffffff', opacity: 1, image: null, imageWidth: 20 });
export function parseOverlays(value: unknown): Overlays {
  if (value === undefined) return defaultOverlays();
  const o = value as Overlays;
  if (!o || typeof o.text !== 'string' || o.text.length > 2000 || o.text.includes('\0') || !/^#[0-9a-f]{6}$/i.test(o.color) || ![o.x, o.y, o.size, o.opacity, o.imageWidth].every(Number.isFinite) || o.x < 0 || o.x > 100 || o.y < 0 || o.y > 100 || o.size < 12 || o.size > 200 || o.opacity < 0 || o.opacity > 1 || o.imageWidth < 1 || o.imageWidth > 100) throw new Error('Invalid text or watermark settings.');
  if (o.image !== null && (typeof o.image !== 'string' || o.image.length > 1_500_000 || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(o.image))) throw new Error('Use a PNG watermark smaller than 1 MB.');
  return { text: o.text, x: o.x, y: o.y, size: o.size, color: o.color, opacity: o.opacity, image: o.image, imageWidth: o.imageWidth };
}
export function overlayFilters(asset: MediaAsset, edit: EditSettings, paths: RecipeResources): string[] {
  const o = edit.overlays; const filters: string[] = [];
  if (o.text) filters.push(`subtitles=filename=${filterPath(paths.text)}:fontsdir=${filterPath(paths.fonts)}`);
  if (o.image) {
    const id = paths.image.replace(/[^a-z0-9]/gi, ''); const width = Math.max(1, Math.round((edit.crop?.width ?? asset.width ?? 640) * o.imageWidth / 100));
    filters.push(`null[base${id}];movie=filename=${filterPath(paths.image)}:dec_threads=1,scale=${width}:-1,format=rgba,colorchannelmixer=aa=${o.opacity}[mark${id}];[base${id}][mark${id}]overlay=x=(W-w)*${o.x / 100}:y=(H-h)*${o.y / 100}:eof_action=repeat`);
  }
  return filters;
}

export function textAss(edit: EditSettings, asset?: MediaAsset): string {
  const o = edit.overlays; const width = edit.crop?.width ?? asset?.width ?? 640, height = edit.crop?.height ?? asset?.height ?? 360;
  const color = `&H${Math.round((1 - o.opacity) * 255).toString(16).padStart(2, '0')}${o.color.slice(5, 7)}${o.color.slice(3, 5)}${o.color.slice(1, 3)}`;
  const alignment = (o.y < 50 ? 6 : 0) + (o.x < 50 ? 1 : 3);
  const text = o.text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\r/g, '').replace(/\n/g, '\\N');
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,${o.size},${color},&H00000000,1,0,0,${alignment},0,0,0,1\n[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:00.00,24:00:00.00,Default,{\\pos(${width * o.x / 100},${height * o.y / 100})}${text}\n`;
}
