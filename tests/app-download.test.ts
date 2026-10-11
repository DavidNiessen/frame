import { describe, expect, it } from 'vitest';
import {
  detectDownloadTarget,
  downloadArchitectures,
  normalizeDownloadTarget,
  selectDownloadRelease,
} from '../src/core/app-download';
import { FRAME_RELEASES, installerName } from '../src/core/app-updates';

function release(tag: string, preview = tag.includes('-build.')) {
  const names = [
    ['win32', 'x64'],
    ['darwin', 'arm64'],
    ['darwin', 'x64'],
    ['linux', 'x64'],
  ].map(([platform, arch]) => installerName(tag.slice(1).split('-')[0], platform, arch)!);
  return {
    tag_name: tag,
    prerelease: preview,
    draft: false,
    assets: [...names, 'SHA256SUMS.txt'].map((name) => ({
      name,
      size: 123,
      browser_download_url: `${FRAME_RELEASES}/download/${tag}/${name}`,
    })),
  };
}
describe('browser app downloads', () => {
  it('restricts architecture choices to the builds offered for each OS', () => {
    expect(downloadArchitectures('darwin')).toEqual(['arm64', 'x64']);
    for (const platform of ['linux', 'win32'] as const) {
      expect(downloadArchitectures(platform)).toEqual(['x64']);
      expect(normalizeDownloadTarget({ platform, arch: 'arm64' })).toEqual({
        platform,
        arch: 'x64',
      });
    }
    expect(downloadArchitectures(null)).toEqual([]);
  });
  it('uses high entropy CPU hints instead of a frozen or translated user agent', async () => {
    expect(
      await detectDownloadTarget({
        userAgent: 'Intel Mac',
        platform: 'MacIntel',
        userAgentData: {
          platform: 'macOS',
          mobile: false,
          getHighEntropyValues: async () => ({ architecture: 'arm', bitness: '64' }),
        },
      }),
    ).toEqual({ platform: 'darwin', arch: 'arm64' });
    expect(
      await detectDownloadTarget({
        userAgent: 'Win64; x64',
        platform: 'Win32',
        userAgentData: {
          platform: 'Windows',
          mobile: false,
          getHighEntropyValues: async () => ({ architecture: 'arm', bitness: '64' }),
        },
      }),
    ).toEqual({ platform: 'win32', arch: 'arm64' });
  });
  it('detects desktop fallback platforms without claiming to detect Safari’s Mac CPU', async () => {
    expect(
      await detectDownloadTarget({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
      }),
    ).toEqual({ platform: 'win32', arch: 'x64' });
    expect(
      await detectDownloadTarget({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        platform: 'Linux x86_64',
      }),
    ).toEqual({ platform: 'linux', arch: 'x64' });
    expect(
      await detectDownloadTarget({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
      }),
    ).toEqual({ platform: 'darwin', arch: null });
  });
  it('leaves mobile and unknown platforms for manual selection', async () => {
    for (const browser of [
      { userAgent: 'Android; Linux aarch64', platform: 'Linux aarch64' },
      { userAgent: 'iPhone', platform: 'iPhone' },
      { userAgent: 'Macintosh; Intel Mac OS X', platform: 'MacIntel', maxTouchPoints: 5 },
      { userAgent: '', platform: '' },
    ])
      expect(await detectDownloadTarget(browser)).toEqual({ platform: null, arch: null });
  });
  it('falls back when the browser refuses architecture hints', async () => {
    expect(
      await detectDownloadTarget({
        userAgent: 'Linux x86_64',
        platform: 'Linux',
        userAgentData: {
          platform: 'Linux',
          mobile: false,
          getHighEntropyValues: async () => {
            throw new Error('denied');
          },
        },
      }),
    ).toEqual({ platform: 'linux', arch: 'x64' });
  });
  it('chooses stable or preview explicitly and matches each installer architecture', () => {
    const releases = [release('v1.0.1-build.9'), release('v1.0.1'), release('v1.0.1-build.10')];
    expect(selectDownloadRelease(releases, { platform: 'win32', arch: 'x64' }, false)?.tag).toBe(
      'v1.0.1',
    );
    expect(
      selectDownloadRelease(releases, { platform: 'darwin', arch: 'arm64' }, true)?.installer.name,
    ).toBe('Frame-1.0.1-mac-arm64.dmg');
    expect(selectDownloadRelease(releases, { platform: 'darwin', arch: 'x64' }, true)?.tag).toBe(
      'v1.0.1-build.10',
    );
    expect(
      selectDownloadRelease(releases, { platform: 'linux', arch: 'x64' }, true)?.installer.name,
    ).toBe('Frame-1.0.1-linux-x86_64.AppImage');
    expect(
      selectDownloadRelease(releases, { platform: 'linux', arch: 'arm64' }, false),
    ).toBeUndefined();
    expect(selectDownloadRelease(releases, { platform: null, arch: null }, true)).toBeUndefined();
    expect(
      selectDownloadRelease([release('v1.0.1')], { platform: 'win32', arch: 'x64' }, true),
    ).toBeUndefined();
  });
  it('rejects draft, incomplete and foreign downloads', () => {
    const preview = release('v1.0.1-build.10');
    preview.assets[0].browser_download_url = 'https://example.com/wrong.exe';
    expect(
      selectDownloadRelease([preview], { platform: 'win32', arch: 'x64' }, true),
    ).toBeUndefined();
    expect(
      selectDownloadRelease(
        [{ ...release('v1.0.1'), draft: true }],
        { platform: 'win32', arch: 'x64' },
        false,
      ),
    ).toBeUndefined();
  });
});
