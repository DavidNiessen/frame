export const rawImageExtensions = [
  'dng',
  'cr2',
  'cr3',
  'nef',
  'nrw',
  'arw',
  'sr2',
  'srf',
  'raf',
  'orf',
  'rw2',
  'pef',
  'srw',
  '3fr',
  'erf',
  'kdc',
  'dcr',
];
export const heifImageExtensions = ['heic', 'heif', 'hif'];
export const portableImageExtensions = [...heifImageExtensions, ...rawImageExtensions];
export const portableImageKind = (name: string): 'raw' | 'heif' | null => {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  return heifImageExtensions.includes(extension)
    ? 'heif'
    : rawImageExtensions.includes(extension)
      ? 'raw'
      : null;
};
export function validateDecodedImage(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    width * height > 33_554_432
  )
    throw new Error('Use an image with up to 32 megapixels and 16,384 pixels per side.');
}
export const MAX_PORTABLE_IMAGE_BYTES = 128 * 1024 * 1024;
