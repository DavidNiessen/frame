import { parseCoverArtwork } from './cover-art';
/** Decode locally, resize oversized covers, and keep portable projects small. */
export async function prepareCoverArtwork(file: File): Promise<string> {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error('Choose a PNG, JPEG or WebP image smaller than 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 32000000 || bitmap.width > 12000 || bitmap.height > 12000)
      throw new Error('Choose an image with at most 32 million pixels.');
    const canvas = document.createElement('canvas');
    let maximum = 1200,
      data = '';
    do {
      const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare cover artwork.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      data = canvas.toDataURL('image/png');
      maximum = Math.floor(maximum * 0.8);
    } while (data.length > 1500000 && maximum >= 160);
    return parseCoverArtwork(data)!;
  } finally {
    bitmap.close();
  }
}
