import { describe, expect, it } from 'vitest';
import {
  compareReleaseTags,
  FRAME_RELEASES,
  installerChecksum,
  installerName,
  selectUpdateRelease,
} from '../src/core/app-updates';

function release(tag: string, platform = 'win32', arch = 'x64') {
  const name = installerName(tag.slice(1).split('-')[0], platform, arch)!;
  const asset = (name: string) => ({
    name,
    size: 123,
    browser_download_url: `${FRAME_RELEASES}/download/${tag}/${name}`,
  });
  return {
    tag_name: tag,
    prerelease: tag.includes('-build.'),
    draft: false,
    assets: [asset(name), asset('SHA256SUMS.txt')],
  };
}
describe('Frame release selection', () => {
  it('orders numeric versions and preview builds without offering a downgrade', () => {
    expect(compareReleaseTags('v1.0.1-build.10', 'v1.0.1-build.9')).toBeGreaterThan(0);
    expect(compareReleaseTags('v1.0.1', 'v1.0.1-build.999')).toBeGreaterThan(0);
    expect(compareReleaseTags('v1.10.0', 'v1.9.0')).toBeGreaterThan(0);
    expect(compareReleaseTags('v1.0.2-build.1', 'v1.0.1')).toBeGreaterThan(0);
    const releases = [release('v1.0.1-build.11'), release('v1.0.1'), release('v1.0.2-build.12')];
    expect(selectUpdateRelease(releases, 'v1.0.0', 'win32', 'x64', false)?.tag).toBe('v1.0.1');
    expect(selectUpdateRelease(releases, 'v1.0.1-build.10', 'win32', 'x64', true)?.tag).toBe(
      'v1.0.2-build.12',
    );
    expect(
      selectUpdateRelease([release('v1.0.1')], 'v1.0.2-build.10', 'win32', 'x64', false),
    ).toBeUndefined();
    expect(
      selectUpdateRelease([release('v1.0.1-build.10')], 'v1.0.1-build.10', 'win32', 'x64', true),
    ).toBeUndefined();
  });
  it('selects exact platform installers and rejects incomplete or foreign releases', () => {
    const arm = release('v1.0.1', 'darwin', 'arm64');
    expect(selectUpdateRelease([arm], 'v1.0.0', 'darwin', 'arm64', false)?.installer.name).toBe(
      'Frame-1.0.1-mac-arm64.dmg',
    );
    expect(selectUpdateRelease([arm], 'v1.0.0', 'darwin', 'x64', false)).toBeUndefined();
    expect(
      selectUpdateRelease([release('v1.0.1', 'linux')], 'v1.0.0', 'linux', 'x64', false)?.installer
        .name,
    ).toBe('Frame-1.0.1-linux-x86_64.AppImage');
    expect(
      selectUpdateRelease([{ ...arm, draft: true }], 'v1.0.0', 'darwin', 'arm64', true),
    ).toBeUndefined();
    expect(
      selectUpdateRelease([{ ...arm, prerelease: true }], 'v1.0.0', 'darwin', 'arm64', true),
    ).toBeUndefined();
    expect(
      selectUpdateRelease(
        [{ ...arm, assets: arm.assets.slice(0, 1) }],
        'v1.0.0',
        'darwin',
        'arm64',
        false,
      ),
    ).toBeUndefined();
    arm.assets[0].browser_download_url = 'https://example.com/Frame.dmg';
    expect(selectUpdateRelease([arm], 'v1.0.0', 'darwin', 'arm64', false)).toBeUndefined();
    expect(installerName('1.0.1', 'linux', 'arm64')).toBeNull();
    expect(() => compareReleaseTags('v01.0.0', 'v1.0.0')).toThrow();
  });
  it('requires one exact installer checksum and rejects ambiguity and wrong filenames', () => {
    const line = `${'A'.repeat(64)}  Frame-1.0.1-win-x64.exe`;
    expect(installerChecksum(line, 'Frame-1.0.1-win-x64.exe')).toBe('a'.repeat(64));
    expect(() => installerChecksum(`${line}\n${line}`, 'Frame-1.0.1-win-x64.exe')).toThrow(
      'unique',
    );
    expect(() => installerChecksum(line, 'Other.exe')).toThrow('unique');
  });
});
