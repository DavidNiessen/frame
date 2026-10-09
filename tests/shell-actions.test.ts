import { expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dolphinActions, extensions, finderAction, shellActions, windowsInstaller } from '../electron/shell-action-definitions';
import { installShellActions, shellActionState } from '../electron/shell-actions';

it('registers both verbs for every supported extension and only removes commands owned by this install', () => {
  const installer = windowsInstaller();
  for (const extension of extensions) for (const action of shellActions) {
    expect(installer).toContain(`!insertmacro FrameContextVerb "${extension}" "${action.verb}" "${action.label}" "${action.workflow}"`);
    expect(installer).toContain(`!insertmacro FrameRemoveContextVerb "${extension}" "${action.verb}" "${action.workflow}"`);
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
      await writeFile(join(root, 'Info.plist'), files.info); await writeFile(join(root, 'document.wflow'), files.document);
      expect(files.document).toContain('--frame-workflow=' + action.workflow);
      expect(files.document).toContain('&quot;$@&quot;');
    }
    const unrelated = join(home, 'Library', 'Services', 'Other.workflow'); await mkdir(unrelated, { recursive: true });
    await writeFile(join(unrelated, 'keep'), 'Other service');
    const location = { platform: 'darwin' as const, home, resources, executable: '/Applications/Frame.app/Contents/MacOS/Frame' };
    expect(await shellActionState(location)).toBe('not-installed');
    await installShellActions(location);
    expect(await shellActionState(location)).toBe('installed');
    await rm(join(home, 'Library', 'Services', 'Edit in Frame.workflow', 'Contents', 'document.wflow'));
    expect(await shellActionState(location)).toBe('partial');
    await installShellActions(location);
    expect(await shellActionState(location)).toBe('installed');
    expect(await readFile(join(home, 'Library', 'Services', 'Convert in Frame.workflow', 'Contents', 'Info.plist'), 'utf8')).toContain('Convert in Frame');
    await installShellActions(location, true);
    expect(await shellActionState(location)).toBe('not-installed');
    expect(await readFile(join(unrelated, 'keep'), 'utf8')).toBe('Other service');
    await expect(stat(join(home, 'Library', 'Services', 'Convert in Frame.workflow'))).rejects.toThrow();
  } finally { await rm(home, { recursive: true, force: true }); }
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
    expect(entry).toContain('X-KDE-MinNumberOfUrls=1'); expect(entry).toContain('X-KDE-MaxNumberOfUrls=2000');
    expect(entry).toContain(' --frame-workflow=convert -- %F');
    if (process.platform !== 'win32') expect((await stat(target)).mode & 0o111).not.toBe(0);
    // Decode the two layers of Desktop Entry / Exec escaping to verify the original path.
    const line = entry.split('\n').find(line => line.startsWith('Exec='))!.slice(5);
    const decoded = line.replace(/\\\\/g, '\\');
    expect(decoded.slice(1, decoded.indexOf(' --frame-workflow') - 1).replace(/\\([\\"`$])/g, '$1')).toBe(executable);
    await writeFile(target, 'stale executable');
    expect(await shellActionState(location)).toBe('partial');
    await installShellActions(location);
    expect(await shellActionState(location)).toBe('installed');
    await writeFile(join(dataHome, 'kio', 'servicemenus', 'other.desktop'), 'Other action');
    await installShellActions(location, true);
    expect(await readFile(join(dataHome, 'kio', 'servicemenus', 'other.desktop'), 'utf8')).toBe('Other action');
    await expect(stat(target)).rejects.toThrow();
    expect(await shellActionState(location)).toBe('not-installed');
    expect(() => dolphinActions('/path/Frame\n.AppImage')).toThrow('control characters');
  } finally { await rm(home, { recursive: true, force: true }); }
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
});
