import { drawStroke, type PaintStroke } from '../core/painting';
self.onmessage = async (
  event: MessageEvent<{ strokes: PaintStroke[]; width: number; height: number }>,
) => {
  try {
    const { strokes, width, height } = event.data,
      canvas = new OffscreenCanvas(width, height),
      context = canvas.getContext('2d')!;
    for (const stroke of strokes) drawStroke(context, stroke, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
