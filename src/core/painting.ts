export interface PaintPoint {
  x: number;
  y: number;
}
export interface PaintStroke {
  points: PaintPoint[];
  color: string;
  size: number;
  opacity: number;
  erase: boolean;
}
export interface PaintingSettings {
  strokes: PaintStroke[];
  image: string | null;
  color: string;
  size: number;
  opacity: number;
  erase: boolean;
}
export const defaultPainting = (): PaintingSettings => ({
  strokes: [],
  image: null,
  color: '#a99bff',
  size: 0.015,
  opacity: 1,
  erase: false,
});
export function parsePainting(value: unknown): PaintingSettings {
  if (value === undefined) return defaultPainting();
  const p = value as PaintingSettings;
  if (
    !p ||
    !Array.isArray(p.strokes) ||
    p.strokes.length > 1000 ||
    !/^#[a-f0-9]{6}$/i.test(p.color) ||
    !Number.isFinite(p.size) ||
    p.size < 0.001 ||
    p.size > 0.3 ||
    !Number.isFinite(p.opacity) ||
    p.opacity < 0 ||
    p.opacity > 1 ||
    typeof p.erase !== 'boolean'
  )
    throw new Error('Invalid painting settings.');
  if (
    p.strokes.reduce((n, s) => n + (Array.isArray(s?.points) ? s.points.length : 100000), 0) >
    100000
  )
    throw new Error('This paint layer has too many brush points. Add another layer.');
  for (const s of p.strokes)
    if (
      !s ||
      !Array.isArray(s?.points) ||
      !s.points.length ||
      !/^#[a-f0-9]{6}$/i.test(s.color) ||
      !Number.isFinite(s.size) ||
      s.size < 0.001 ||
      s.size > 0.3 ||
      !Number.isFinite(s.opacity) ||
      s.opacity < 0 ||
      s.opacity > 1 ||
      typeof s.erase !== 'boolean' ||
      s.points.some(
        (q) =>
          !q ||
          !Number.isFinite(q.x) ||
          !Number.isFinite(q.y) ||
          q.x < 0 ||
          q.x > 1 ||
          q.y < 0 ||
          q.y > 1,
      )
    )
      throw new Error('Invalid brush stroke.');
  if (
    p.image !== null &&
    (typeof p.image !== 'string' ||
      p.image.length > 16000000 ||
      !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(p.image))
  )
    throw new Error('Invalid paint layer image.');
  if (p.image) {
    const header = Uint8Array.from(atob(p.image.slice(22, 54)), (c) => c.charCodeAt(0));
    if (header.length < 24 || String.fromCharCode(...header.slice(12, 16)) !== 'IHDR')
      throw new Error('Invalid paint layer PNG.');
    const bytes = new DataView(header.buffer),
      w = bytes.getUint32(16),
      h = bytes.getUint32(20);
    if (!w || !h || w > 4096 || h > 4096 || w * h > 16000000)
      throw new Error('Paint layers must fit within 4,096 pixels and 16 megapixels.');
  }
  return structuredClone(p);
}
export function drawStroke(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  stroke: PaintStroke,
  width: number,
  height: number,
) {
  context.save();
  context.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.globalAlpha = stroke.opacity;
  context.lineWidth = stroke.size * width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  const first = stroke.points[0];
  context.moveTo(first.x * width, first.y * height);
  if (stroke.points.length === 1) {
    context.arc(first.x * width, first.y * height, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    for (const point of stroke.points.slice(1)) context.lineTo(point.x * width, point.y * height);
    context.stroke();
  }
  context.restore();
}
