import { filterPath, type RecipeResources } from './resources';
export interface ColorSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  lut: string | null;
  lutName: string | null;
}
export const defaultColor = (): ColorSettings => ({
  brightness: 0,
  contrast: 1,
  saturation: 1,
  temperature: 0,
  lut: null,
  lutName: null,
});
export function parseCube(text: string): string {
  if (text.length > 2_000_000) throw new Error('LUT files must be smaller than 2 MB.');
  let size = 0;
  const entries: number[][] = [];
  let low = [0, 0, 0],
    high = [1, 1, 1];
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line || line.startsWith('TITLE')) continue;
    const [key, ...parts] = line.split(/\s+/);
    if (key === 'LUT_3D_SIZE') {
      if (size || parts.length !== 1) throw new Error('Invalid LUT size.');
      size = Number(parts[0]);
      continue;
    }
    if (key === 'DOMAIN_MIN' || key === 'DOMAIN_MAX') {
      const numbers = parts.map(Number);
      if (numbers.length !== 3 || numbers.some((n) => !Number.isFinite(n)))
        throw new Error('Invalid LUT domain.');
      if (key === 'DOMAIN_MIN') low = numbers;
      else high = numbers;
      continue;
    }
    const numbers = line.split(/\s+/).map(Number);
    if (numbers.length !== 3 || numbers.some((n) => !Number.isFinite(n) || Math.abs(n) > 8))
      throw new Error('Choose a supported 3D .cube LUT.');
    entries.push(numbers);
  }
  if (
    !Number.isInteger(size) ||
    size < 2 ||
    size > 33 ||
    entries.length !== size ** 3 ||
    low.some((n, i) => n >= high[i] || n < -8 || high[i] > 8)
  )
    throw new Error('Use a complete 3D LUT with a size between 2 and 33.');
  return `LUT_3D_SIZE ${size}\nDOMAIN_MIN ${low.join(' ')}\nDOMAIN_MAX ${high.join(' ')}\n${entries.map((e) => e.join(' ')).join('\n')}\n`;
}
export function parseColor(value: unknown): ColorSettings {
  if (value === undefined) return defaultColor();
  const c = value as ColorSettings;
  if (
    !c ||
    ![c.brightness, c.contrast, c.saturation, c.temperature].every(Number.isFinite) ||
    Math.abs(c.brightness) > 1 ||
    c.contrast < 0 ||
    c.contrast > 3 ||
    c.saturation < 0 ||
    c.saturation > 3 ||
    Math.abs(c.temperature) > 1 ||
    (c.lut !== null && typeof c.lut !== 'string') ||
    (c.lutName !== null && (typeof c.lutName !== 'string' || c.lutName.length > 255))
  )
    throw new Error('Invalid color settings.');
  return { ...c, lut: c.lut === null ? null : parseCube(c.lut) };
}
export function colorFilters(c: ColorSettings, paths: RecipeResources): string[] {
  const filters: string[] = [];
  if (c.brightness || c.contrast !== 1 || c.saturation !== 1)
    filters.push(`eq=brightness=${c.brightness}:contrast=${c.contrast}:saturation=${c.saturation}`);
  if (c.temperature)
    filters.push(
      `colorbalance=rs=${c.temperature * 0.2}:bs=${-c.temperature * 0.2}:rm=${c.temperature * 0.1}:bm=${-c.temperature * 0.1}`,
    );
  if (c.lut) filters.push(`lut3d=file=${filterPath(paths.lut)}:interp=tetrahedral`);
  return filters;
}
