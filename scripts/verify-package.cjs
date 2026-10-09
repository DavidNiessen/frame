const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
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
  if (!existsSync(require('node:path').join(context.packager.projectDir, 'build/generated/windows-context-menu.nsh'))) {
    throw new Error('Shell integration assets are missing. Run npm run build before packaging.');
  }
  if (context.electronPlatformName === 'darwin') {
    context.packager.platformSpecificBuildOptions.fileAssociations = [{ ext: require('../src/core/media-extensions.json'), name: 'Frame media', role: 'Editor', rank: 'Alternate' }];
  }
};
