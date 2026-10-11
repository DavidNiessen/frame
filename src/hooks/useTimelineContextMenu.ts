import { useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  ClipboardPaste,
  Copy,
  Scissors,
  Trash2,
  Combine,
  Pencil,
  CopyPlus,
  Undo2,
  Redo2,
  LocateFixed,
  ArrowLeftToLine,
  ArrowRightToLine,
  RotateCcw,
  Magnet,
  Minimize2,
  Maximize,
} from 'lucide-react';
import { clipPositions, editClips, splitClip } from '../core/clips';
import { clipGroups } from '../core/clip-groups';
import { adjacentSplitJoin, joinSplitClips } from '../core/join-clips';
import {
  clipboardUnavailable,
  copySection,
  pasteTimeline,
  type TimelineClipboard,
} from '../core/timeline-clipboard';
import { sourceTimeAtOutput } from '../core/fades';
import { time } from '../core/format';
import { minimumSourceDuration } from '../core/time-range';
import { audioLayerSource } from '../core/audio-layers';
import type { EditSettings, MediaAsset } from '../core/types';
import type { TimelineMenuTarget } from '../components/TimelineMenuContext';
import type { TimelineMenuAction } from '../components/TimelineContextMenu';
interface Options {
  edit: EditSettings;
  asset: MediaAsset;
  assets: MediaAsset[];
  total: number;
  disabled: boolean;
  current: number;
  update: (patch: Partial<EditSettings>) => void;
  seek: (source: number, output?: number) => void;
  selectClip: (id: string | null) => void;
  selectedClip: string | null;
  notify: (message: string) => void;
  openEffect: (id: import('../core/effect-library').EffectId, instanceId?: string) => void;
  openAudioLayer: (id: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  snapping: boolean;
  toggleSnapping: () => void;
  compact: boolean;
  toggleCompact: () => void;
  fit: () => void;
  bounds: () => DOMRect | undefined;
}
export function useTimelineContextMenu(options: Options) {
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    output: number;
    target?: TimelineMenuTarget;
  } | null>(null);
  const [clipboard, setClipboard] = useState<TimelineClipboard | null>(null);
  const focus = useRef<TimelineMenuTarget | undefined>(undefined),
    anchor = useRef<HTMLElement | null>(null);
  const latest = useRef(options);
  latest.current = options;
  function close(restore = false) {
    setMenu(null);
    if (restore && anchor.current?.isConnected) anchor.current.focus({ preventScroll: true });
  }
  useEffect(() => {
    close();
    focus.current = undefined;
  }, [options.asset.id, options.disabled]);
  function open(event: MouseEvent<HTMLElement>, target?: TimelineMenuTarget) {
    event.preventDefault();
    event.stopPropagation();
    if (options.disabled) return;
    const node = event.target as HTMLElement,
      lane = node.closest('.timeline-lane'),
      bounds = lane?.getBoundingClientRect() ?? options.bounds();
    const output = bounds?.width
      ? Math.max(
          0,
          Math.min(options.total, ((event.clientX - bounds.left) / bounds.width) * options.total),
        )
      : options.current;
    anchor.current = node.closest<HTMLElement>('button, [tabindex]');
    focus.current = target;
    if (target?.clipId) options.selectClip(target.clipId);
    setMenu({ x: event.clientX, y: event.clientY, output, target });
  }
  const copy = (target?: TimelineMenuTarget) => {
    const value = target?.clipId
      ? copySection(options.edit, options.asset.id, target.clipId)
      : target?.clipboard;
    if (value) {
      setClipboard(structuredClone(value));
      options.notify('Copied to the timeline clipboard.');
    }
  };
  const unavailable = (value: TimelineClipboard | null) =>
    value?.kind === 'audio' && !audioLayerSource(value.layer, options.assets)
      ? 'The audio source is no longer in the library.'
      : clipboardUnavailable(value, options.edit, options.asset);
  function paste(value = clipboard, output = menu?.output ?? options.current) {
    if (!value) return;
    const reason = unavailable(value);
    if (reason) {
      options.notify(reason);
      return;
    }
    try {
      const result = pasteTimeline(value, options.edit, options.asset, output);
      options.update(result.patch);
      if (value.kind === 'clips') options.selectClip(result.id);
      else if (value.kind === 'effect') {
        options.selectClip(null);
        options.openEffect(value.instance.effect, result.id);
      } else options.openAudioLayer(result.id);
      options.seek(
        sourceTimeAtOutput({ ...options.edit, ...result.patch }, result.output),
        result.output,
      );
    } catch (error) {
      options.notify((error as Error).message);
    }
  }
  function remove(target?: TimelineMenuTarget) {
    if (!target?.clipId) {
      target?.remove?.();
      return;
    }
    const group = clipGroups(options.edit).find((group) =>
      group.clips.some((clip) => clip.id === target.clipId),
    );
    if (!group || clipGroups(options.edit).length < 2) return;
    const kept = editClips(options.edit).filter((clip) => !group.clips.includes(clip));
    options.update({ clips: kept });
    options.selectClip(null);
    options.seek(kept[0].start, 0);
  }
  const target = menu?.target,
    output = menu?.output ?? options.current;
  const clipId =
    target?.clipId ??
    clipPositions(options.edit).find(
      (position) => output >= position.start && output < position.end,
    )?.clip.id;
  const copyValue = target?.clipId
    ? copySection(options.edit, options.asset.id, target.clipId)
    : target?.clipboard;
  const cannotPaste = unavailable(clipboard);
  const cannotDuplicate = unavailable(copyValue ?? null);
  const canRemove = target?.clipId ? clipGroups(options.edit).length > 1 : !!target?.remove;
  const actions: TimelineMenuAction[] = [];
  if (target) {
    const value = target.range.start + (output - target.shown.start) * target.speed;
    for (const edge of ['start', 'end'] as const)
      if (target.edges.includes(edge)) {
        const valid =
          edge === 'start'
            ? value >= target.limits.start && value <= target.range.end - target.minimum
            : value <= target.limits.end && value >= target.range.start + target.minimum;
        actions.push({
          label: `Set ${edge} here`,
          icon: edge === 'start' ? ArrowLeftToLine : ArrowRightToLine,
          disabled: !valid,
          run: () => {
            const range = { ...target.range, [edge]: value };
            target.change(range);
            target.preview?.(range, edge);
          },
        });
      }
    if (target.clipId) {
      const pair = adjacentSplitJoin(options.edit, target.clipId);
      actions.push({
        label: 'Join with neighbour',
        icon: Combine,
        disabled: !pair,
        run: () => {
          options.update(joinSplitClips(options.edit, target.clipId!));
          options.selectClip(pair!.left.id);
        },
      });
      actions.push({
        label: 'Restore trimmed edges',
        icon: RotateCcw,
        run: () => target.change({ start: target.limits.start, end: target.limits.end }),
      });
    } else actions.push({ label: 'Edit settings', icon: Pencil, run: target.select });
    if (target.move)
      actions.push({
        label: 'Move to playhead',
        icon: LocateFixed,
        run: () => {
          const delta = Math.max(
            target.moveLimits?.start ?? target.limits.start - target.range.start,
            Math.min(
              target.moveLimits?.end ?? target.limits.end - target.range.end,
              (options.current - target.shown.start) * target.speed,
            ),
          );
          target.move!(delta);
        },
      });
  }
  if (!target || target.clipId) {
    const position = clipPositions(options.edit).find((position) => position.clip.id === clipId);
    const minimum = position ? minimumSourceDuration(position.speed) / position.speed : 0.05;
    const canSplit =
      !!position && output >= position.start + minimum && output <= position.end - minimum;
    actions.push({
      label: 'Split here',
      icon: Scissors,
      disabled: !canSplit,
      run: () => {
        options.update(
          splitClip(
            options.edit,
            clipId!,
            position!.clip.start + (output - position!.start) * position!.speed,
          ),
        );
        options.selectClip(clipId!);
        options.seek(sourceTimeAtOutput(options.edit, output), output);
      },
    });
  }
  actions.push({
    label: 'Move playhead here',
    icon: LocateFixed,
    run: () => options.seek(sourceTimeAtOutput(options.edit, output), output),
  });
  if (target) {
    actions.push({
      label: 'Copy',
      icon: Copy,
      shortcut: '⌘/Ctrl C',
      disabled: !copyValue,
      divider: true,
      run: () => copy(target),
    });
    actions.push({
      label: 'Cut',
      icon: Scissors,
      shortcut: '⌘/Ctrl X',
      disabled: !copyValue || !canRemove,
      run: () => {
        copy(target);
        remove(target);
      },
    });
    actions.push({
      label: 'Duplicate',
      icon: CopyPlus,
      shortcut: '⌘/Ctrl D',
      disabled: !!cannotDuplicate,
      reason: cannotDuplicate,
      run: () => paste(copyValue!, target.shown.end),
    });
  }
  actions.push({
    label: 'Paste here',
    icon: ClipboardPaste,
    shortcut: '⌘/Ctrl V',
    disabled: !!cannotPaste,
    reason: cannotPaste,
    run: () => paste(),
  });
  if (target)
    actions.push({
      label: 'Delete',
      icon: Trash2,
      shortcut: 'Delete',
      danger: true,
      disabled: !canRemove,
      run: () => remove(target),
    });
  actions.push(
    { label: 'Undo', icon: Undo2, disabled: !options.canUndo, divider: true, run: options.undo },
    { label: 'Redo', icon: Redo2, disabled: !options.canRedo, run: options.redo },
  );
  actions.push(
    { label: 'Fit timeline', icon: Maximize, divider: true, run: options.fit },
    { label: 'Snapping', icon: Magnet, checked: options.snapping, run: options.toggleSnapping },
    {
      label: 'Compact lanes',
      icon: Minimize2,
      checked: options.compact,
      run: options.toggleCompact,
    },
  );
  // Limit clipboard shortcuts to the timeline; text editors keep their native clipboard.
  const commands = useRef({ copy, paste, remove });
  commands.current = { copy, paste, remove };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const node = event.target as HTMLElement;
      if (
        event.defaultPrevented ||
        latest.current.disabled ||
        node.matches('input, textarea, select') ||
        node.isContentEditable ||
        !node.closest('#media-timeline, .timeline-context-menu')
      )
        return;
      if (['Delete', 'Backspace'].includes(event.key) && focus.current) {
        event.preventDefault();
        close();
        commands.current.remove(focus.current);
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = focus.current,
        command = event.key.toLowerCase();
      if (!['c', 'v', 'x', 'd'].includes(command)) return;
      event.preventDefault();
      close();
      if (command === 'v') commands.current.paste();
      else if (command === 'd') {
        const value = target?.clipId
          ? copySection(latest.current.edit, latest.current.asset.id, target.clipId)
          : target?.clipboard;
        if (value) commands.current.paste(value, target?.shown.end);
      } else {
        commands.current.copy(target);
        if (command === 'x') commands.current.remove(target);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return {
    menu,
    actions,
    close,
    open,
    focus: (target: TimelineMenuTarget) => {
      focus.current = target;
    },
    title: `${target?.label ?? 'Timeline'} · ${time(output)}`,
  };
}
