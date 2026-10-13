import { createRequire } from 'node:module';
import { cp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const packages = [
  'react',
  'react-dom',
  'lucide-react',
  'fflate',
  'exifr',
  'libheif-js',
  '@fontsource/public-sans',
];

/** Copy exact upstream license texts into both web and desktop distribution resources. */
export async function prepareNotices(destination = 'public/notices') {
  await mkdir(destination, { recursive: true });
  const lines = ['Frame — bundled libraries and fonts', ''];
  for (const name of packages) {
    const root = join('node_modules', name);
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const file = `${name.replaceAll('/', '-').replaceAll('@', '')}-LICENSE.txt`;
    await cp(join(root, 'LICENSE'), join(destination, file));
    lines.push(`${name} ${pkg.version} (${pkg.license}): ${file}`);
  }
  // Resolve the transitive package from React DOM so this also works with pnpm's layout.
  const reactRequire = createRequire(await realpath('node_modules/react-dom/package.json'));
  const schedulerRoot = dirname(reactRequire.resolve('scheduler/package.json'));
  const scheduler = JSON.parse(await readFile(join(schedulerRoot, 'package.json'), 'utf8'));
  await cp(join(schedulerRoot, 'LICENSE'), join(destination, 'scheduler-LICENSE.txt'));
  lines.push(`scheduler ${scheduler.version} (${scheduler.license}): scheduler-LICENSE.txt`);
  for (const file of [
    'IMAGE-DECODERS.txt',
    'libraw-LGPL.txt',
    'libraw-COPYRIGHT.txt',
    'little-cms-LICENSE.txt',
  ])
    await cp(`vendor/licenses/${file}`, join(destination, file));
  lines.push(
    'libraw-wasm 1.6.0: see IMAGE-DECODERS.txt for the wrapper and bundled codec notices.',
  );
  await cp('vendor/licenses/ffmpeg-wasm.LICENSE', join(destination, 'ffmpeg-wasm-LICENSE.txt'));
  await cp('vendor/licenses/GPL-2.0.txt', join(destination, 'GPL-2.0.txt'));
  await cp('vendor/licenses/LGPL-2.1.txt', join(destination, 'LGPL-2.1.txt'));
  lines.push(
    '@ffmpeg/ffmpeg: ffmpeg-wasm-LICENSE.txt (MIT)',
    '@ffmpeg/core: GPL-2.0.txt (GPL-2.0-or-later); see MEDIA-TOOLS.txt for source/build details.',
    '@ffprobe-installer/ffprobe: LGPL-2.1.txt; https://github.com/SavageCore/node-ffprobe-installer',
    'DejaVu fonts: ../fonts/LICENSE.txt',
    'yt-dlp and native FFmpeg: see bundled media-tool notices.',
    '',
  );
  await writeFile(join(destination, 'LIBRARIES.txt'), lines.join('\n'));
}
