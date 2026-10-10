import { expect, it } from 'vitest';
import { conversionReport } from '../src/core/conversion-report';
import { defaultSettings, type MediaAsset } from '../src/core/types';
it('reports actual outputs and failures with quoted CSV and spreadsheet-safe user text', () => {
  const asset: MediaAsset = { id: 'song', name: '=unsafe,"Song".wav', size: 2000, duration: 2, kind: 'audio', hasAudio: true, previewUrl: '' }, edit = { ...defaultSettings(asset), format: 'flac' as const };
  const report = conversionReport([{ id: 'done', asset, edit, status: 'done', progress: 1, result: { name: 'song.flac', path: '/saved/song.flac', size: 1000 } }, { id: 'failed', asset: { ...asset, name: 'é.wav', size: 0 }, edit, status: 'failed', progress: 0, error: '=bad\n"message"' }]);
  expect(report.startsWith('\ufeff"Source"')).toBe(true); expect(report).toContain('"\'=unsafe,""Song"".wav"'); expect(report).toContain('"/saved/song.flac",2000,1000,-50.0,2.000'); expect(report).toContain('"é.wav","failed","flac","",0,,,2.000,"\'=bad\n""message"""');
});
