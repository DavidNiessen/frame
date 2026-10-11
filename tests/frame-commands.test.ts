import { expect, it, vi } from 'vitest';
import { frameCommands } from '../src/hooks/frame-commands';
import { effectLibrary } from '../src/core/effect-library';
import { addTimelineEffect } from '../src/core/timeline-effects';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import type { Editor } from '../src/hooks/useEditor';
import type { Projects } from '../src/hooks/useProjects';
const video = { kind: 'video', hasAudio: true, duration: 6, width: 640, height: 360 } as MediaAsset;
function commands(
  asset: MediaAsset | null,
  edit = asset ? defaultSettings(asset) : null,
  busy = false,
) {
  const run = vi.fn(),
    editor = { assets: [], asset, edit, busy: busy ? 'export' : null } as unknown as Editor;
  const noop = vi.fn(),
    actions: Parameters<typeof frameCommands>[2] = {
      applyEffect: run,
      workspaceBusy: false,
      importFiles: noop,
      importFolder: noop,
      folderSupported: true,
      url: noop,
      edit: noop,
      convert: noop,
      settings: noop,
      openProject: noop,
      effects: noop,
      exportSettings: noop,
      contactSheet: noop,
      scenes: noop,
      merge: noop,
      batch: noop,
      timelineAvailable: true,
      resetLayout: noop,
      shortcuts: noop,
    };
  return { run, list: frameCommands(editor, {} as Projects, actions) };
}
it('lists every registered effect, explains unavailable sources and removes manual waveform commands', () => {
  const empty = commands(null).list.filter((command) => command.id.startsWith('effect-'));
  expect(empty.map((command) => command.id)).toEqual(
    effectLibrary.map((effect) => `effect-${effect.id}`),
  );
  expect(empty.every((command) => command.disabled === 'Import media first')).toBe(true);
  expect(commands(video).list.some((command) => command.id === 'waveform')).toBe(false);
  const audio = { ...video, kind: 'audio' } as MediaAsset;
  expect(commands(audio).list.find((command) => command.id === 'effect-captions')?.disabled).toBe(
    'Select a video first',
  );
  expect(
    commands({ ...video, hasAudio: false }).list.find(
      (command) => command.id === 'effect-equalizer',
    )?.disabled,
  ).toBe('This source has no audio');
  expect(
    commands(video, defaultSettings(video), true).list.find(
      (command) => command.id === 'effect-volume',
    )?.disabled,
  ).toContain('operation');
});
it('keeps repeatable commands as Add and changes singletons to Edit', () => {
  let edit = defaultSettings(video);
  for (const id of ['crop', 'captions'] as const)
    edit = { ...edit, ...addTimelineEffect(edit, video, id, 0) };
  const result = commands(video, edit);
  expect(result.list.find((command) => command.id === 'effect-crop')?.label).toBe('Edit Crop');
  expect(result.list.find((command) => command.id === 'effect-captions')?.label).toBe(
    'Add Captions',
  );
  result.list.find((command) => command.id === 'effect-captions')!.run();
  expect(result.run).toHaveBeenCalledWith('captions');
});
