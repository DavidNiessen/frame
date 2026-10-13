export interface ImageOutput {
  quality: number;
  lossless: boolean;
  background: string;
}
export const defaultImageOutput = (): ImageOutput => ({
  quality: 90,
  lossless: false,
  background: '#ffffff',
});
export function parseImageOutput(input: unknown): ImageOutput {
  if (input === undefined) return defaultImageOutput();
  const value = input as ImageOutput;
  if (
    !value ||
    !Number.isFinite(value.quality) ||
    value.quality < 1 ||
    value.quality > 100 ||
    typeof value.lossless !== 'boolean' ||
    !/^#[a-f0-9]{6}$/i.test(value.background)
  )
    throw new Error('Invalid image output settings.');
  return { ...value };
}
