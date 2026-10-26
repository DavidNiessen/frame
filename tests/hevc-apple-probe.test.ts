// Temporary diagnostic: which pieces of a real HEVC smart render AVFoundation can decode.
import { it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath } from '../electron/native';
import { inspect } from '../electron/smart-render';
import { planSmartRender, smartPieceArgs } from '../src/core/smart-render';
const exec = promisify(execFile);
const decoder = process.platform === 'darwin' ? 'avconvert' : null;
it('reports AVFoundation HEVC decoding of smart render pieces', async () => {
  const d = await mkdtemp(join(tmpdir(), 'hevc-probe-'));
  const f = (args: string[]) => exec(ffmpegPath(), ['-v', 'error', '-y', ...args]);
  const results: string[] = [];
  const decode = async (name: string, path: string) => {
    try {
      if (decoder)
        await exec(decoder, [
          '--source',
          path,
          '--preset',
          'PresetAppleProRes422LPCM',
          '--output',
          join(d, `${name}.mov`),
          '--replace',
        ]);
      else await f(['-i', path, '-f', 'null', '-']);
      results.push(`${name}: ok`);
    } catch (error) {
      results.push(`${name}: FAIL ${(error as Error).message.split('\n').slice(-3).join(' ')}`);
    }
  };
  const variants: [string, string[]][] = [
    ['bf3', ['bframes=3']],
    ['bf0', ['bframes=0']],
  ];
  for (const [label, params] of variants) {
    const src = join(d, `${label}.mov`);
    await f([
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=320x180:r=30:d=12',
      '-c:v',
      'libx265',
      '-preset',
      'ultrafast',
      '-x265-params',
      `log-level=error:keyint=45:min-keyint=45:scenecut=0:open-gop=0:${params.join(':')}`,
      '-pix_fmt',
      'yuv420p10le',
      '-color_primaries',
      'bt2020',
      '-color_trc',
      'arib-std-b67',
      '-colorspace',
      'bt2020nc',
      '-tag:v',
      'hvc1',
      src,
    ]);
    await decode(`${label}-source`, src);
    const inspected = (await inspect(src, new AbortController().signal))!;
    const pieces = planSmartRender(inspected.packets, [
      { start: 0, end: 3.2 },
      { start: 7.9, end: 12 },
    ]);
    results.push(`${label} pieces ${JSON.stringify(pieces)}`);
    const paths: string[] = [];
    for (const [i, piece] of pieces.entries()) {
      const out = join(d, `${label}-piece-${i}.mp4`);
      await f(smartPieceArgs(piece, inspected.source, src, out, 'high'));
      paths.push(out);
      await decode(`${label}-piece-${i}-${piece.kind}`, out);
    }
    for (let n = 2; n <= paths.length; n++) {
      for (const start of [0, n - 2]) {
        const list = join(d, `${label}-${start}-${n}.txt`);
        await writeFile(
          list,
          paths
            .slice(start, n)
            .map((p) => `file '${p}'\n`)
            .join(''),
        );
        const out = join(d, `${label}-join-${start}-${n}.mp4`);
        await f(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-tag:v', 'hvc1', out]);
        await decode(`${label}-join-pieces-${start}..${n - 1}`, out);
      }
    }
    const all = join(d, `${label}-all.txt`);
    await writeFile(all, paths.map((p) => `file '${p}'\n`).join(''));
    const audio = join(d, `${label}-audio.m4a`);
    await f(['-f', 'lavfi', '-i', 'sine=f=440:d=7.3', '-c:a', 'aac', audio]);
    for (const [name, extra] of [
      [
        'mux-audio-faststart',
        ['-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-movflags', '+faststart'],
      ],
      ['mux-audio', ['-i', audio, '-map', '0:v:0', '-map', '1:a:0']],
      ['mux-faststart', ['-map', '0:v:0', '-movflags', '+faststart']],
    ] as const) {
      const out = join(d, `${label}-${name}.mp4`);
      await f([
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        all,
        ...extra,
        '-map_metadata',
        '-1',
        '-c',
        'copy',
        '-tag:v',
        'hvc1',
        out,
      ]);
      await decode(`${label}-${name}`, out);
    }
  }
  console.log(`HEVC-PROBE\n${results.join('\n')}`);
}, 240000);
