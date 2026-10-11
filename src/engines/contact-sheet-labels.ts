import { sheetDimensions, type ContactSheetOptions } from '../core/contact-sheet';
import { preciseTimecode } from '../core/playhead';
export async function labelContactSheet(
  url: string,
  name: string,
  duration: number,
  options: ContactSheetOptions,
): Promise<string> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const dimensions = sheetDimensions(options),
    canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight + 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image drawing is unavailable.');
  context.fillStyle = '#10121a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 64);
  context.fillStyle = '#edeef7';
  context.font = '600 18px system-ui';
  let title = name;
  while (context.measureText(title).width > canvas.width - 32 && title.length > 1)
    title = title.slice(0, -2) + '…';
  context.fillText(title, 16, 26);
  context.font = '12px system-ui';
  context.fillStyle = '#a9adc5';
  context.fillText(
    `${preciseTimecode(duration)} · ${options.columns * options.rows} frames · Frame`,
    16,
    46,
  );
  if (options.timestamps) {
    context.font = `${options.width < 240 ? 11 : 13}px ui-monospace, monospace`;
    context.fillStyle = '#edeef7';
    context.textAlign = 'center';
    for (let index = 0; index < options.columns * options.rows; index++) {
      const column = index % options.columns,
        row = Math.floor(index / options.columns);
      const x = 8 + column * (options.width + 8) + options.width / 2,
        y =
          64 +
          8 +
          row * (dimensions.frameHeight + dimensions.labelHeight + 8) +
          dimensions.frameHeight +
          16;
      context.fillText(
        preciseTimecode((index * duration) / (options.columns * options.rows)),
        x,
        y,
      );
    }
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the contact sheet.'))),
      'image/png',
    ),
  );
  return URL.createObjectURL(blob);
}
