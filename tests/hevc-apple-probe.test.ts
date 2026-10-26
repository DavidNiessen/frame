// Temporary diagnostic: which HEVC smart-render variants AVFoundation can decode.
import { it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath } from '../electron/native';
const exec = promisify(execFile);
it.runIf(process.platform === 'darwin')(
  'reports AVFoundation HEVC decoding',
  async () => {
    const d = await mkdtemp(join(tmpdir(), 'hevc-probe-'));
    const f = (args: string[]) => exec(ffmpegPath(), ['-v', 'error', '-y', ...args]);
    const results: string[] = [];
    const decode = async (name: string, path: string) => {
      try {
        await exec('avconvert', [
          '--source',
          path,
          '--preset',
          'PresetAppleProRes422LPCM',
          '--output',
          join(d, `${name}.mov`),
          '--replace',
        ]);
        results.push(`${name}: ok`);
      } catch (error) {
        results.push(`${name}: FAIL ${(error as Error).message.split('\n').slice(-3).join(' ')}`);
      }
    };
    for (const depth of ['yuv420p', 'yuv420p10le']) {
      const src = join(d, `src-${depth}.mov`);
      const x265 = (extra: string) => [
        '-c:v',
        'libx265',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        depth,
        '-x265-params',
        `log-level=error:keyint=45:min-keyint=45:scenecut=0:open-gop=0${extra}`,
      ];
      await f([
        '-f',
        'lavfi',
        '-i',
        'testsrc2=s=320x180:r=30:d=6',
        ...x265(''),
        '-tag:v',
        'hvc1',
        src,
      ]);
      await decode(`${depth}-source`, src);
      const head = join(d, `${depth}-head.mp4`);
      await f([
        '-ss',
        '0.7',
        '-i',
        src,
        '-frames:v',
        '24',
        ...x265(':repeat-headers=1'),
        '-bsf:v',
        'hevc_mp4toannexb',
        '-tag:v',
        'hvc1',
        '-video_track_timescale',
        '15360',
        head,
      ]);
      await decode(`${depth}-head-repeat`, head);
      const headPlain = join(d, `${depth}-headplain.mp4`);
      await f([
        '-ss',
        '0.7',
        '-i',
        src,
        '-frames:v',
        '24',
        ...x265(''),
        '-tag:v',
        'hvc1',
        '-video_track_timescale',
        '15360',
        headPlain,
      ]);
      await decode(`${depth}-head-plain`, headPlain);
      const copy = join(d, `${depth}-copy.mp4`);
      await f([
        '-ss',
        '1.4995',
        '-i',
        src,
        '-frames:v',
        '90',
        '-c:v',
        'copy',
        '-copypriorss',
        '0',
        '-bsf:v',
        'hevc_mp4toannexb',
        '-tag:v',
        'hvc1',
        '-video_track_timescale',
        '15360',
        copy,
      ]);
      await decode(`${depth}-copy-annexb`, copy);
      const copyPlain = join(d, `${depth}-copyplain.mp4`);
      await f([
        '-ss',
        '1.4995',
        '-i',
        src,
        '-frames:v',
        '90',
        '-c:v',
        'copy',
        '-copypriorss',
        '0',
        '-tag:v',
        'hvc1',
        '-video_track_timescale',
        '15360',
        copyPlain,
      ]);
      await decode(`${depth}-copy-plain`, copyPlain);
      for (const [name, pieces, tag] of [
        ['join-repeat-annexb', [head, copy], 'hvc1'],
        ['join-repeat-annexb-hev1', [head, copy], 'hev1'],
        ['join-copy-only', [copy, copy], 'hvc1'],
        ['join-plain', [headPlain, copyPlain], 'hvc1'],
      ] as const) {
        const list = join(d, `${depth}-${name}.txt`);
        await writeFile(list, pieces.map((p) => `file '${p}'\n`).join(''));
        const out = join(d, `${depth}-${name}.mp4`);
        await f(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-tag:v', tag, out]);
        await decode(`${depth}-${name}`, out);
      }
    }
    console.log(`HEVC-PROBE\n${results.join('\n')}`);
  },
  180000,
);
