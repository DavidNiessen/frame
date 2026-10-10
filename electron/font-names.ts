import { validSystemFont } from '../src/core/caption-style';

/** Read family names from SFNT/OpenType name tables, including TTC collections. */
export function fontFamilies(data: Buffer): string[] {
  const names = new Set<string>();
  function face(offset: number) {
    if (offset < 0 || offset + 12 > data.length) return;
    const tables = data.readUInt16BE(offset + 4); if (tables > 128 || offset + 12 + tables * 16 > data.length) return;
    for (let index = 0; index < tables; index++) {
      const table = offset + 12 + index * 16;
      if (data.toString('ascii', table, table + 4) !== 'name') continue;
      const start = data.readUInt32BE(table + 8), length = data.readUInt32BE(table + 12);
      if (length < 6 || start + length > data.length) continue;
      const count = data.readUInt16BE(start + 2), strings = start + data.readUInt16BE(start + 4);
      if (count > 512 || start + 6 + count * 12 > start + length) continue;
      const candidates: { name: string; rank: number }[] = [];
      for (let n = 0; n < count; n++) {
        const record = start + 6 + n * 12, platform = data.readUInt16BE(record), language = data.readUInt16BE(record + 4), id = data.readUInt16BE(record + 6);
        if (id !== 1 && id !== 16) continue;
        const size = data.readUInt16BE(record + 8), from = strings + data.readUInt16BE(record + 10);
        if (from < start || from + size > start + length) continue;
        const bytes = data.subarray(from, from + size);
        const name = platform === 0 || platform === 3 ? Array.from({ length: Math.floor(bytes.length / 2) }, (_, i) => String.fromCharCode(bytes.readUInt16BE(i * 2))).join('') : bytes.toString('latin1');
        if (validSystemFont(name.trim())) candidates.push({ name: name.trim(), rank: (id === 16 ? 4 : 0) + (language === 0x409 ? 2 : 0) + (platform === 3 ? 1 : 0) });
      }
      const chosen = candidates.sort((a, b) => b.rank - a.rank)[0]; if (chosen) names.add(chosen.name);
    }
  }
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'ttcf') {
    const count = data.readUInt32BE(8); if (count > 64 || 12 + count * 4 > data.length) return [];
    for (let i = 0; i < count; i++) face(data.readUInt32BE(12 + i * 4));
  } else if (data.length >= 4 && (data.readUInt32BE(0) === 0x00010000 || ['OTTO', 'true'].includes(data.toString('ascii', 0, 4)))) face(0);
  return [...names];
}
