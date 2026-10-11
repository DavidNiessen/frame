export const FRAME_RELEASES = 'https://github.com/DavidNiessen/frame/releases';
export const FRAME_RELEASES_API = 'https://api.github.com/repos/DavidNiessen/frame/releases';

export interface UpdateRelease {
  tag: string;
  prerelease: boolean;
  page: string;
  installer: { name: string; url: string; size: number };
  checksums: string;
}
export interface UpdateStatus {
  current: string;
  development: boolean;
  supported: boolean;
  installSupported?: boolean;
  automatic: boolean;
  includePrereleases: boolean;
  phase:
    | 'idle'
    | 'checking'
    | 'current'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error';
  checkedAt?: number;
  release?: UpdateRelease;
  downloaded?: string;
  ratio?: number;
  error?: string;
}
export interface UpdateBridge {
  updateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  setUpdatePreferences(preferences: {
    automatic: boolean;
    includePrereleases: boolean;
  }): Promise<UpdateStatus>;
  downloadUpdate(): Promise<UpdateStatus>;
  cancelUpdateDownload(): Promise<void>;
  installUpdate(): Promise<UpdateStatus>;
  revealUpdateInstaller(): Promise<void>;
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
}

export function releaseVersion(tag: string) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-build\.(0|[1-9]\d*))?$/.exec(tag);
  if (!match) return null;
  const values = match.slice(1).map((value) => (value === undefined ? undefined : Number(value)));
  if (values.some((value) => value !== undefined && !Number.isSafeInteger(value))) return null;
  return { parts: values.slice(0, 3) as number[], build: values[3] };
}
export function compareReleaseTags(left: string, right: string) {
  const a = releaseVersion(left),
    b = releaseVersion(right);
  if (!a || !b) throw new Error('Invalid Frame release version.');
  for (let i = 0; i < 3; i++) if (a.parts[i] !== b.parts[i]) return a.parts[i] - b.parts[i];
  // A full release is newer than every preview on the same release line.
  if (a.build === undefined) return b.build === undefined ? 0 : 1;
  if (b.build === undefined) return -1;
  return a.build - b.build;
}
export function installerName(version: string, platform: string, arch: string) {
  if (platform === 'win32' && arch === 'x64') return `Frame-${version}-win-x64.exe`;
  if (platform === 'darwin' && ['arm64', 'x64'].includes(arch))
    return `Frame-${version}-mac-${arch}.dmg`;
  if (platform === 'linux' && arch === 'x64') return `Frame-${version}-linux-x86_64.AppImage`;
  return null;
}
function releaseAssetUrl(tag: string, name: string) {
  return `${FRAME_RELEASES}/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
}

/** Only complete releases from this repository may supply an installer. */
export function selectUpdateRelease(
  input: unknown,
  current: string,
  platform: string,
  arch: string,
  includePrereleases: boolean,
): UpdateRelease | undefined {
  if (!Array.isArray(input)) throw new Error('GitHub returned an invalid release list.');
  const candidates: UpdateRelease[] = [];
  for (const value of input) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>,
      tag = item.tag_name;
    if (
      typeof tag !== 'string' ||
      !releaseVersion(tag) ||
      item.draft ||
      typeof item.prerelease !== 'boolean'
    )
      continue;
    const version = releaseVersion(tag)!;
    if (
      item.prerelease !== (version.build !== undefined) ||
      (!includePrereleases && item.prerelease) ||
      compareReleaseTags(tag, current) <= 0
    )
      continue;
    const name = installerName(tag.slice(1).split('-')[0], platform, arch);
    if (!name || !Array.isArray(item.assets)) continue;
    const asset = item.assets.find((entry) => entry?.name === name);
    const checksum = item.assets.find((entry) => entry?.name === 'SHA256SUMS.txt');
    if (
      !asset ||
      asset.browser_download_url !== releaseAssetUrl(tag, name) ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      asset.size > 8 * 1024 ** 3
    )
      continue;
    if (!checksum || checksum.browser_download_url !== releaseAssetUrl(tag, 'SHA256SUMS.txt'))
      continue;
    candidates.push({
      tag,
      prerelease: item.prerelease,
      page: `${FRAME_RELEASES}/tag/${encodeURIComponent(tag)}`,
      installer: { name, url: asset.browser_download_url, size: asset.size },
      checksums: checksum.browser_download_url,
    });
  }
  return candidates.sort((a, b) => compareReleaseTags(b.tag, a.tag))[0];
}
export function installerChecksum(text: string, name: string) {
  const matches = text
    .split(/\r?\n/)
    .map((line) => /^([a-fA-F0-9]{64}) {2}(.+)$/.exec(line))
    .filter((entry) => entry?.[2] === name);
  if (matches.length !== 1)
    throw new Error('The release does not contain a unique installer checksum.');
  return matches[0]![1].toLowerCase();
}
