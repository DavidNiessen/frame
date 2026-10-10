export const captionFonts = [
  { id: 'sans', name: 'Sans serif', family: 'DejaVu Sans', file: 'DejaVuSans', italic: 'Oblique' },
  { id: 'serif', name: 'Serif', family: 'DejaVu Serif', file: 'DejaVuSerif', italic: 'Italic' },
  { id: 'mono', name: 'Monospace', family: 'DejaVu Sans Mono', file: 'DejaVuSansMono', italic: 'Oblique' },
] as const;
export interface CaptionStyle {
  font: typeof captionFonts[number]['id'] | `system:${string}`; size: number; bold: boolean; italic: boolean;
  color: string; background: string; backgroundOpacity: number; outline: boolean; outlineColor: string;
  align: 'left' | 'center' | 'right';
}
/** Size is a percentage of the output frame width, consistent across resolutions. */
export const defaultCaptionStyle: CaptionStyle = { font: 'sans', size: 3.5, bold: false, italic: false, color: '#ffffff', background: '#000000', backgroundOpacity: .6, outline: false, outlineColor: '#000000', align: 'center' };
export function parseCaptionStyle(value: unknown): CaptionStyle | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(defaultCaptionStyle, key))) throw new Error('Invalid caption style.');
  const style = { ...defaultCaptionStyle, ...value } as CaptionStyle;
  if (!(captionFonts.some(font => font.id === style.font) || typeof style.font === 'string' && style.font.startsWith('system:') && validSystemFont(style.font.slice(7))) || !Number.isFinite(style.size) || style.size < 1 || style.size > 12 || !Number.isFinite(style.backgroundOpacity) || style.backgroundOpacity < 0 || style.backgroundOpacity > 1 || !['left', 'center', 'right'].includes(style.align) || [style.bold, style.italic, style.outline].some(value => typeof value !== 'boolean') || [style.color, style.background, style.outlineColor].some(color => typeof color !== 'string' || !/^#[a-f0-9]{6}$/i.test(color))) throw new Error('Invalid caption style.');
  return style;
}
export const validSystemFont = (family: string) => /^[^,\\\r\n\x00-\x1f\x7f]{1,100}$/.test(family) && family === family.trim();
export const systemFontFamily = (style?: CaptionStyle) => style?.font.startsWith('system:') ? style.font.slice(7) : undefined;
export const captionFont = (style: CaptionStyle) => ({ family: systemFontFamily(style) ?? captionFonts.find(font => font.id === style.font)!.family });
export function captionFontFile(style: CaptionStyle) {
  const font = captionFonts.find(font => font.id === style.font)!, variant = style.bold ? `-Bold${style.italic ? font.italic : ''}` : style.italic ? `-${font.italic}` : '';
  return `${font.file}${variant}.ttf`;
}
export const assColor = (color: string, opacity = 1) => `&H${Math.round((1 - opacity) * 255).toString(16).padStart(2, '0')}${color.slice(5, 7)}${color.slice(3, 5)}${color.slice(1, 3)}`.toUpperCase();
