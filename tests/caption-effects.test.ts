import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { captionItems, changeCaption } from '../src/core/caption-items';
import { importCaptionEffects, resetCaption } from '../src/core/caption-effects';
import { defaultCaptionStyle, parseCaptionStyle } from '../src/core/caption-style';
import { effectAction } from '../src/core/effect-actions';
import { effectLibrary } from '../src/core/effect-library';
import { extraInstances, changeInstance } from '../src/core/effect-instances';
import { parseEdit } from '../src/core/project';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { importSubtitles, parseSubtitles, serializeCaptionAss } from '../src/core/subtitles';
import { burnedCues, embeddedCues, recipeFiles, resourcePaths } from '../src/core/resources';
import { videoFilters } from '../src/core/filters';
import { fontFamilies } from '../electron/font-names';
const asset: MediaAsset = { id: 'clip', name: 'clip.mp4', duration: 6, width: 640, height: 360, size: 1, kind: 'video', hasAudio: true, previewUrl: '' };
const captions = importSubtitles('1\n00:00:00,000 --> 00:00:03,000\nFirst\n\n2\n00:00:02,000 --> 00:00:05,000\nSecond');
it('imports each cue as an independent, persistable effect without replacing existing captions', () => {
  let edit = { ...defaultSettings(asset), ...importCaptionEffects(defaultSettings(asset), captions) };
  const second = extraInstances(edit, 'captions')[0];
  edit = { ...edit, ...changeInstance(edit, second.id, null, { subtitles: { mode: 'embed', cues: [{ ...second.settings.subtitles!.cues[0], style: { ...defaultCaptionStyle, font: 'serif', color: '#ff0000' } }] } }) };
  edit = { ...edit, ...importCaptionEffects(edit, captions) };
  expect(captionItems(edit).map(item => [item.text, item.mode])).toEqual([['First', 'burn'], ['Second', 'embed'], ['First', 'burn'], ['Second', 'burn']]);
  expect(parseEdit(JSON.parse(JSON.stringify(edit)), asset)).toEqual(edit);
  expect(edit.subtitles.cues).toHaveLength(1); expect(extraInstances(edit, 'captions').every(item => item.settings.subtitles!.cues.length === 1)).toBe(true);
  edit = { ...edit, ...changeCaption(edit, captionItems(edit)[1], 'remove') }; expect(extraInstances(edit, 'captions')).toHaveLength(2);
  edit = { ...edit, ...changeCaption(edit, captionItems(edit)[0], 'remove') }; expect(edit.addedEffects).not.toContain('captions');
});
it('upgrades grouped legacy captions once while retaining styles, positions and export modes', () => {
  const cue = { ...captions.cues[0], position: { x: 20, y: 30 }, style: { ...defaultCaptionStyle, font: 'mono' as const, size: 5 } };
  const legacy = { ...defaultSettings(asset), subtitles: { ...captions, cues: [cue, captions.cues[1]] }, effectInstances: [{ id: 'legacy', effect: 'captions', settings: { subtitles: { ...captions, mode: 'embed', cues: [{ ...cue, text: 'Extra one' }, { ...cue, text: 'Extra two' }] } } }] };
  const edit = parseEdit(legacy, asset), saved = parseEdit(JSON.parse(JSON.stringify(edit)), asset);
  expect(captionItems(edit).map(item => [item.text, item.mode])).toEqual([['First', 'burn'], ['Second', 'burn'], ['Extra one', 'embed'], ['Extra two', 'embed']]);
  expect(captionItems(edit)[0].cue).toEqual(cue); expect(captionItems(edit)[3].cue.position).toEqual(cue.position); expect(saved).toEqual(edit);
});
it('supports 1,000 individually editable captions without consuming the other effect budget', () => {
  let edit = { ...defaultSettings(asset), ...importCaptionEffects(defaultSettings(asset), { mode: 'burn', cues: Array.from({ length: 1000 }, (_, index) => ({ start: 0, end: 1, text: String(index) })) }) };
  expect(parseEdit(edit, asset).effectInstances).toHaveLength(999);
  const volume = effectLibrary.find(effect => effect.id === 'volume')!, caption = effectLibrary.find(effect => effect.id === 'captions')!;
  edit = { ...edit, ...effectAction(edit, asset, volume, null, 'add') };
  edit = { ...edit, ...effectAction(edit, asset, volume, null, 'add') };
  expect(extraInstances(parseEdit(edit, asset), 'volume')).toHaveLength(1);
  expect(() => importCaptionEffects(edit, captions)).toThrow('1,000 captions');
  expect(() => effectAction(edit, asset, caption, null, 'add')).toThrow('1,000 captions');
});
it('rejects malformed and injected caption styling and keeps legacy cues unchanged', () => {
  for (const style of [null, [], { size: NaN }, { size: .5 }, { backgroundOpacity: 2 }, { color: 'red' }, { font: 'unknown' }, { font: 'system:Bad,font' }, { font: 'system:bad\nStyle:' }, { bold: 'yes' }, { extra: true }]) expect(() => parseCaptionStyle(style)).toThrow('Invalid caption style');
  expect(parseCaptionStyle({ color: '#ff0000', font: 'system:Arial' })).toEqual({ ...defaultCaptionStyle, color: '#ff0000', font: 'system:Arial' });
  expect(parseSubtitles(captions)).toEqual(captions);
  expect(resetCaption({ mode: 'embed', cues: [{ ...captions.cues[0], style: defaultCaptionStyle, position: { x: 20, y: 30 } }] })).toEqual({ mode: 'burn', cues: [{ ...captions.cues[0], text: 'New caption' }] });
});
it('serializes independent caption styles and uses one burn filter for a whole subtitle file', () => {
  const edit = { ...defaultSettings(asset), ...importCaptionEffects(defaultSettings(asset), captions) }, second = extraInstances(edit, 'captions')[0];
  second.settings.subtitles!.cues[0].style = { ...defaultCaptionStyle, font: 'serif', size: 6, bold: true, italic: true, color: '#ff0000', align: 'left', backgroundOpacity: .2, outline: true };
  const ass = serializeCaptionAss(burnedCues(edit), { width: 640, height: 360 });
  expect(ass).toContain('Caption1,DejaVu Serif,38.4,&H000000FF'); expect(ass).toContain(',-1,-1,4,');
  expect(videoFilters(asset, edit).filter(filter => filter.startsWith('subtitles='))).toHaveLength(1);
  expect(recipeFiles(edit, resourcePaths('test', 'burn'), asset).some(file => file.path === 'test-captions.ass-burned.ass' && file.text.includes('Second'))).toBe(true);
  const embedded = { ...edit, ...changeInstance(edit, second.id, null, { subtitles: { ...second.settings.subtitles!, mode: 'embed' } }) };
  expect(burnedCues(embedded).map(cue => cue.text)).toEqual(['First']); expect(embeddedCues(embedded).map(cue => cue.text)).toEqual(['Second']);
});
it('reads bundled and installed OpenType families and tolerates corrupt font files', async () => {
  const fonts = await Promise.all(['DejaVuSans', 'DejaVuSerif', 'DejaVuSansMono'].map(file => readFile(`public/fonts/${file}.ttf`)));
  expect(fonts.map(fontFamilies)).toEqual([['DejaVu Sans'], ['DejaVu Serif'], ['DejaVu Sans Mono']]);
  const header = Buffer.alloc(20); header.write('ttcf'); header.writeUInt32BE(0x10000, 4); header.writeUInt32BE(2, 8); header.writeUInt32BE(20, 12); header.writeUInt32BE(20 + fonts[0].length, 16);
  const adjusted = fonts.slice(0, 2).map((data, index) => {
    const copy = Buffer.from(data), base = index === 0 ? 20 : 20 + fonts[0].length;
    for (let table = 0; table < copy.readUInt16BE(4); table++) { const pointer = 12 + table * 16 + 8; copy.writeUInt32BE(copy.readUInt32BE(pointer) + base, pointer); }
    return copy;
  });
  expect(fontFamilies(Buffer.concat([header, ...adjusted]))).toEqual(['DejaVu Sans', 'DejaVu Serif']);
  for (const bytes of [Buffer.alloc(0), Buffer.from('ttcf'), Buffer.alloc(50), Buffer.from('OTTO00000000bad')]) expect(fontFamilies(bytes)).toEqual([]);
});
