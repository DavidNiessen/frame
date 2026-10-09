const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');
// ffmpeg-static downloads for the build machine. Reject cross-packaging mismatched binaries.
module.exports = async context => {
  const architectures = ['ia32', 'x64', 'armv7l', 'arm64', 'universal'];
  const targetArch = architectures[context.arch];
  if (context.electronPlatformName !== process.platform || targetArch !== process.arch) {
    throw new Error(`Build ${context.electronPlatformName}/${targetArch} on a matching machine so portable FFmpeg binaries match the application.`);
  }
  for (const binary of [require('ffmpeg-static'), require('@ffprobe-installer/ffprobe').path]) {
    if (!binary || !existsSync(binary)) throw new Error('The portable media tools are missing. Run npm ci on this platform.');
    execFileSync(binary, ['-version'], { timeout: 10000, stdio: 'ignore', env: { ...process.env, PATH: '' } });
  }
  const tools = require('./youtube-tools.json');
  const target = tools.platforms[`${process.platform}-${process.arch}`];
  if (!target) throw new Error('There is no portable YouTube downloader for this platform.');
  const binary = join(context.packager.projectDir, 'build/media-tools', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  for (const [name, hash] of Object.entries({ [require('node:path').basename(binary)]: target.sha256, ...tools.notices })) {
    const path = join(context.packager.projectDir, 'build/media-tools', name);
    if (!existsSync(path) || createHash('sha256').update(readFileSync(path)).digest('hex') !== hash) throw new Error('Portable YouTube tools are missing or corrupt. Run npm run build.');
  }
  if (execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 15000, env: { ...process.env, PATH: '' } }).trim() !== tools.version) throw new Error('Incorrect portable YouTube downloader version.');
  if (!existsSync(require('node:path').join(context.packager.projectDir, 'build/generated/windows-context-menu.nsh'))) {
    throw new Error('Shell integration assets are missing. Run npm run build before packaging.');
  }
  if (context.electronPlatformName === 'darwin') {
    context.packager.platformSpecificBuildOptions.fileAssociations = [{ ext: require('../src/core/media-extensions.json'), name: 'Frame media', role: 'Editor', rank: 'Alternate' }];
  }
};
