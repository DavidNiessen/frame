export function parseCoverArtwork(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 1500000 || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Use PNG cover artwork smaller than 1 MB.');
  const header = Uint8Array.from(atob(value.slice('data:image/png;base64,'.length, 'data:image/png;base64,'.length + 32)), character => character.charCodeAt(0));
  if (header.length < 24 || String.fromCharCode(...header.slice(12, 16)) !== 'IHDR') throw new Error('Invalid cover artwork.');
  const bytes = new DataView(header.buffer), width = bytes.getUint32(16), height = bytes.getUint32(20);
  if (!width || !height || width > 4096 || height > 4096 || width * height > 16000000) throw new Error('Cover artwork dimensions must fit within 4,096 × 4,096 pixels.');
  return value;
}
