const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');
// Prepare and package the host's vendored tools. Reject cross-packaging mismatched binaries.
module.exports = async context => {
  const architectures = ['ia32', 'x64', 'armv7l', 'arm64', 'universal'];
  const targetArch = architectures[context.arch];
  if (context.electronPlatformName !== process.platform || targetArch !== process.arch) {
    throw new Error(`Build ${context.electronPlatformName}/${targetArch} on a matching machine so portable FFmpeg binaries match the application.`);
  }
  for (const binary of [require('@ffprobe-installer/ffprobe').path]) {
    if (!binary || !existsSync(binary)) throw new Error('The portable media tools are missing. Run npm ci on this platform.');
    execFileSync(binary, ['-version'], { timeout: 10000, stdio: 'ignore', env: { ...process.env, PATH: '' } });
  }
  const ffmpeg = require('./ffmpeg-tools.json').platforms[`${process.platform}-${process.arch}`];
  if (!ffmpeg) throw new Error('There is no portable FFmpeg binary for this platform.');
  const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  for (const [name, hash] of Object.entries({ [ffmpegName]: ffmpeg.binarySha256, ...Object.fromEntries(Object.entries(ffmpeg.notices).map(([name, file]) => [`${ffmpegName}.${name}`, file.sha256])) })) {
    const path = join(context.packager.projectDir, 'build/media-tools', name);
    if (!existsSync(path) || createHash('sha256').update(readFileSync(path)).digest('hex') !== hash) throw new Error('Portable FFmpeg files are missing or corrupt. Run npm run build.');
  }
  execFileSync(join(context.packager.projectDir, 'build/media-tools', ffmpegName), ['-version'], { timeout: 10000, stdio: 'ignore', env: { ...process.env, PATH: '' } });
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
  if (context.electronPlatformName === 'win32') {
    const binaries = require('../native/windows-shell/binaries.json').platforms[`win32-${targetArch}`];
    if (!binaries) throw new Error('There is no native Windows shell extension for this architecture.');
    for (const [name, hash] of Object.entries(binaries)) {
      const path = join(context.packager.projectDir, 'build/generated/shell-actions/windows', name);
      if (!existsSync(path) || createHash('sha256').update(readFileSync(path)).digest('hex') !== hash) throw new Error('The Windows shell extension is missing or corrupt. Run npm run build.');
    }
    const root = join(context.packager.projectDir, 'build/generated/shell-actions/windows');
    for (const name of ['FrameShell.msix', 'AppxManifest.xml', 'Frame.cer', 'manage-menu.ps1', 'package-registration.ps1', 'certificate.ps1', 'identity.json']) if (!existsSync(join(root, name))) throw new Error('Windows primary-menu registration files are missing. Run npm run build.');
    const certificate = JSON.parse(readFileSync(join(root, 'identity.json'))).certificate;
    if (certificate) for (const [name, hash] of Object.entries({ 'Frame.cer': certificate.certificateSha256, 'FrameShell.msix': certificate.packageSha256 })) {
      if (createHash('sha256').update(readFileSync(join(root, name))).digest('hex') !== hash) throw new Error('The signed shell package or public certificate is corrupt. Run npm run build.');
    }
  }
  if (context.electronPlatformName === 'darwin') {
    context.packager.platformSpecificBuildOptions.fileAssociations = [{ ext: require('../src/core/media-extensions.json'), name: 'Frame media', role: 'Editor', rank: 'Alternate' }];
  }
};
