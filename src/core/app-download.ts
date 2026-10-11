import { FRAME_RELEASES_API, selectUpdateRelease, type UpdateRelease } from './app-updates';

export type DownloadPlatform = 'win32' | 'darwin' | 'linux';
export type DownloadArchitecture = 'x64' | 'arm64';
export interface DownloadTarget {
  platform: DownloadPlatform | null;
  arch: DownloadArchitecture | null;
}
interface BrowserIdentity {
  userAgent: string;
  platform: string;
  maxTouchPoints?: number;
  userAgentData?: {
    mobile: boolean;
    platform: string;
    getHighEntropyValues?: (hints: string[]) => Promise<{
      architecture?: string;
      bitness?: string;
    }>;
  };
}

/** Browser hints are best effort; Safari's "Intel Mac" also describes Apple Silicon. */
export async function detectDownloadTarget(browser: BrowserIdentity): Promise<DownloadTarget> {
  const agent = browser.userAgent;
  if (
    browser.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod/i.test(agent) ||
    (browser.platform === 'MacIntel' && (browser.maxTouchPoints ?? 0) > 1)
  )
    return { platform: null, arch: null };
  const system = browser.userAgentData?.platform || `${browser.platform} ${agent}`;
  const platform = /Windows|Win32|Win64/i.test(system)
    ? 'win32'
    : /macOS|Macintosh|MacIntel|MacPPC/i.test(system)
      ? 'darwin'
      : /Linux/i.test(system)
        ? 'linux'
        : null;
  let arch: DownloadArchitecture | null = null;
  try {
    const hints = await browser.userAgentData?.getHighEntropyValues?.(['architecture', 'bitness']);
    if (hints?.bitness === '64') {
      if (hints.architecture === 'arm') arch = 'arm64';
      if (hints.architecture === 'x86') arch = 'x64';
    }
  } catch {
    // Browsers may decline high-entropy hints; keep the manual selector available.
  }
  if (!arch) {
    if (/aarch64|arm64/i.test(agent)) arch = 'arm64';
    else if (platform !== 'darwin' && /x86_64|x64|Win64|WOW64|amd64/i.test(agent)) arch = 'x64';
  }
  return { platform, arch };
}

export async function fetchDownloadReleases(previews: boolean, signal: AbortSignal) {
  const address = previews ? `${FRAME_RELEASES_API}?per_page=100` : `${FRAME_RELEASES_API}/latest`;
  const response = await fetch(address, {
    signal,
    headers: { Accept: 'application/vnd.github+json' },
    credentials: 'omit',
  });
  if (response.status === 404 && !previews) return [];
  if (response.status === 403 || response.status === 429)
    throw new Error(
      'GitHub’s request limit was reached. Try again later or use the releases page.',
    );
  if (!response.ok)
    throw new Error('Could not load GitHub releases. Try again or use the releases page.');
  const body: unknown = await response.json();
  if (previews && !Array.isArray(body)) throw new Error('GitHub returned an invalid release list.');
  return previews ? (body as unknown[]) : [body];
}

/** Reuse the desktop updater's exact repository, filename, and complete-release checks. */
export function selectDownloadRelease(
  releases: unknown[],
  target: DownloadTarget,
  previews: boolean,
): UpdateRelease | undefined {
  if (!target.platform || !target.arch) return;
  const channel = releases.filter(
    (value) =>
      value && typeof value === 'object' && 'prerelease' in value && value.prerelease === previews,
  );
  return selectUpdateRelease(channel, 'v0.0.0-build.0', target.platform, target.arch, previews);
}
