import { expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dolphinActions,
  extensions,
  finderAction,
  shellActions,
  windowsInstaller,
} from '../electron/shell-action-definitions';
import { installShellActions, shellActionState } from '../electron/shell-actions';
import { windowsShellCommand } from '../electron/shell-command';
import { windowsIntegrationState } from '../electron/windows-shell-integration';

it('registers both verbs for every supported extension and only removes commands owned by this install', () => {
  const installer = windowsInstaller();
  for (const extension of extensions)
    for (const action of shellActions) {
      expect(installer).toContain(
        `!insertmacro FrameContextVerb "${extension}" "${action.verb}" "${action.label}" "${action.workflow}"`,
      );
      expect(installer).toContain(
        `!insertmacro FrameRemoveContextVerb "${extension}" "${action.verb}" "${action.workflow}"`,
      );
    }
  expect(installer).toContain('"MultiSelectModel" "Player"');
  expect(installer).toContain('--frame-workflow=${Workflow} -- "%1"');
  expect(installer).toContain('StrCmp $R0');
  expect(installer).not.toMatch(/WriteRegStr\s+HKCU\s+"Software\\Classes\\\./);
});
it('installs and removes Finder actions without touching other user services', async () => {
  const home = await mkdtemp(join(tmpdir(), 'frame-finder-'));
  try {
    const resources = join(home, 'resources');
    for (const action of shellActions) {
      const root = join(resources, 'shell-actions', 'mac', `${action.label}.workflow`, 'Contents');
      await mkdir(root, { recursive: true });
      const files = finderAction(action);
      await writeFile(join(root, 'Info.plist'), files.info);
      await writeFile(join(root, 'document.wflow'), files.document);
      expect(files.document).toContain('--frame-workflow=' + action.workflow);
      expect(files.document).toContain('&quot;$@&quot;');
    }
    const unrelated = join(home, 'Library', 'Services', 'Other.workflow');
    await mkdir(unrelated, { recursive: true });
    await writeFile(join(unrelated, 'keep'), 'Other service');
    const location = {
      platform: 'darwin' as const,
      home,
      resources,
      executable: '/Applications/Frame.app/Contents/MacOS/Frame',
    };
    expect(await shellActionState(location)).toBe('not-installed');
    await installShellActions(location);
    expect(await shellActionState(location)).toBe('installed');
    await rm(
      join(home, 'Library', 'Services', 'Edit in Frame.workflow', 'Contents', 'document.wflow'),
    );
    expect(await shellActionState(location)).toBe('partial');
    await installShellActions(location);
    expect(await shellActionState(location)).toBe('installed');
    expect(
      await readFile(
        join(home, 'Library', 'Services', 'Convert in Frame.workflow', 'Contents', 'Info.plist'),
        'utf8',
      ),
    ).toContain('Convert in Frame');
    await installShellActions(location, true);
    expect(await shellActionState(location)).toBe('not-installed');
    expect(await readFile(join(unrelated, 'keep'), 'utf8')).toBe('Other service');
    await expect(
      stat(join(home, 'Library', 'Services', 'Convert in Frame.workflow')),
    ).rejects.toThrow();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
it('installs executable local-file Dolphin actions with quoted paths and removes only Frame’s entries', async () => {
  const home = await mkdtemp(join(tmpdir(), 'frame-dolphin-'));
  try {
    const executable = '/Applications/Frame $test "special".AppImage';
    const dataHome = join(home, 'data');
    const location = { platform: 'linux' as const, home, dataHome, executable, resources: '' };
    expect(await shellActionState(location)).toBe('not-installed');
    await installShellActions(location);
    expect(await shellActionState(location)).toBe('installed');
    const target = join(dataHome, 'kio', 'servicemenus', 'frame-media-editor.desktop');
    const entry = await readFile(target, 'utf8');
    expect(entry).toContain('MimeType=audio/*;video/*;image/gif;');
    expect(entry).toContain('X-KDE-Protocol=file');
    expect(entry).toContain('X-KDE-MinNumberOfUrls=1');
    expect(entry).toContain('X-KDE-MaxNumberOfUrls=2000');
    expect(entry).toContain(' --frame-workflow=convert -- %F');
    if (process.platform !== 'win32') expect((await stat(target)).mode & 0o111).not.toBe(0);
    // Decode the two layers of Desktop Entry / Exec escaping to verify the original path.
    const line = entry
      .split('\n')
      .find((line) => line.startsWith('Exec='))!
      .slice(5);
    const decoded = line.replace(/\\\\/g, '\\');
    expect(
      decoded.slice(1, decoded.indexOf(' --frame-workflow') - 1).replace(/\\([\\"`$])/g, '$1'),
    ).toBe(executable);
    await writeFile(target, 'stale executable');
    expect(await shellActionState(location)).toBe('partial');
    await installShellActions(location);
    expect(await shellActionState(location)).toBe('installed');
    await writeFile(join(dataHome, 'kio', 'servicemenus', 'other.desktop'), 'Other action');
    await installShellActions(location, true);
    expect(await readFile(join(dataHome, 'kio', 'servicemenus', 'other.desktop'), 'utf8')).toBe(
      'Other action',
    );
    await expect(stat(target)).rejects.toThrow();
    expect(await shellActionState(location)).toBe('not-installed');
    expect(() => dolphinActions('/path/Frame\n.AppImage')).toThrow('control characters');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

it('offers an initially checked installer checkbox, restores the preference, and permits explicit silent overrides', () => {
  const installer = windowsInstaller();
  expect(installer).toContain('StrCpy $FrameShellEnabled 1');
  expect(installer).toContain('ReadRegDWORD $R0 HKCU "Software\\Frame\\ShellActions" "Enabled"');
  expect(installer).toContain('${NSD_CreateCheckbox}');
  expect(installer).toContain('${NSD_SetState} $FrameShellCheckbox $FrameShellEnabled');
  expect(installer).toContain('${NSD_GetState} $FrameShellCheckbox $FrameShellEnabled');
  expect(installer).toContain('/NOFRAMECONTEXTMENU');
  expect(installer).toContain('/FRAMECONTEXTMENU');
  expect(installer).toContain('${If} $FrameShellEnabled == 1');
  expect(installer).toContain('!insertmacro FramePrimaryMenu "Install"');
  expect(installer.match(/!insertmacro FramePrimaryMenu "Remove"/g)).toHaveLength(2);
  expect(installer).toContain('"$INSTDIR\\resources\\shell-actions\\windows\\manage-menu.ps1"');
  expect(installer).toContain('$WINDIR\\Sysnative\\WindowsPowerShell');
  expect(installer).toContain('Windows 11 adds a Frame entry in the primary menu');
  expect(installer).toContain('MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2');
  expect(installer).toContain('/SD IDNO IDNO +2');
  expect(installer).toContain('Call FrameTrustAndInstall');
  expect(installer).toContain('!insertmacro FramePrimaryMenu "Trust"');
});
it('reports repair when either supported Windows menu component is incomplete', () => {
  const primary = { supported: true, owned: true, state: 'installed' as const, detail: '' };
  expect(windowsIntegrationState('installed', primary)).toBe('installed');
  expect(windowsIntegrationState('partial', primary)).toBe('partial');
  expect(windowsIntegrationState('not-installed', primary)).toBe('partial');
  expect(windowsIntegrationState('installed', { ...primary, state: 'partial' })).toBe('partial');
  expect(windowsIntegrationState('installed', { ...primary, state: 'not-installed' })).toBe(
    'partial',
  );
  expect(
    windowsIntegrationState('not-installed', { ...primary, state: 'not-installed', owned: false }),
  ).toBe('not-installed');
  expect(
    windowsIntegrationState('installed', { ...primary, supported: false, state: 'not-installed' }),
  ).toBe('installed');
});
it('launches a development checkout using the Electron executable and safely quoted project arguments', () => {
  const launch = {
    executable: 'C:\\Program Files\\Electron\\electron.exe',
    args: ['C:\\Projects\\Frame & songs\\'],
  };
  expect(windowsShellCommand(launch, 'convert')).toBe(
    '"C:\\Program Files\\Electron\\electron.exe" "C:\\Projects\\Frame & songs\\\\" --frame-workflow=convert -- "%1"',
  );
  expect(windowsShellCommand({ executable: 'C:\\Frame\\Frame.exe' }, 'edit')).toBe(
    '"C:\\Frame\\Frame.exe" --frame-workflow=edit -- "%1"',
  );
  const finder = finderAction(shellActions[1], {
    executable: '/Applications/Electron.app/Contents/MacOS/Electron',
    args: ["/Projects/Frame's media"],
  });
  expect(finder.document).toContain("'/Projects/Frame'\\''s media'");
  expect(finder.document).not.toContain('path to application id');
  expect(finder.document).toContain('--frame-workflow=convert -- &quot;$@&quot;');
  expect(dolphinActions('/opt/Electron/electron', ['/Projects/Frame songs'])).toContain(
    'Exec="/opt/Electron/electron" "/Projects/Frame songs" --frame-workflow=convert -- %F',
  );
});
it('installs development Finder workflows with a direct checkout launch without packaged resources', async () => {
  const home = await mkdtemp(join(tmpdir(), 'frame-finder-development-'));
  const location = {
    platform: 'darwin' as const,
    home,
    executable: '/Electron.app/Contents/MacOS/Electron',
    args: ["/Projects/Frame's media"],
    resources: '',
  };
  try {
    await installShellActions(location);
    expect(await shellActionState(location)).toBe('installed');
    const workflow = await readFile(
      join(home, 'Library', 'Services', 'Edit in Frame.workflow', 'Contents', 'document.wflow'),
      'utf8',
    );
    expect(workflow).toContain("'/Projects/Frame'\\''s media'");
    await installShellActions(location, true);
    expect(await shellActionState(location)).toBe('not-installed');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
