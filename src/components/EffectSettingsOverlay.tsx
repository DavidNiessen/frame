import { useInspectorOverlay } from '../hooks/useInspectorOverlay';
import { frameDimensions } from '../core/geometry';
import { useEffect, useId, useMemo, useRef } from 'react';
import { RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import {
  changeInstance,
  instanceRecipe,
  primaryPresent,
  scopedInstances,
} from '../core/effect-instances';
import {
  availableEffects,
  resetEffect,
  sameEffectSettings,
  type EffectId,
} from '../core/effect-library';
import { effectAction } from '../core/effect-actions';
import { captionItems } from '../core/caption-items';
import { resetCaption } from '../core/caption-effects';
import { clipRecipe, editClips } from '../core/clips';
import type { Editor } from '../hooks/useEditor';
import { EffectControls } from './EffectControls';
import { AudioEffectsPreview } from './AudioEffectsPreview';

/** A modeless overlay keeps the live preview and timeline available while adjusting. */
export function EffectSettingsOverlay({
  id,
  instanceId,
  editor,
  current,
  seek,
  close,
  keepView = false,
}: {
  id: EffectId;
  instanceId?: string;
  keepView?: boolean;
  editor: Editor;
  current: number;
  seek: (time: number) => void;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    heading = useId(),
    latestClose = useRef(close);
  const bounds = useInspectorOverlay(ref, close, keepView);
  latestClose.current = close;
  const asset = editor.asset!,
    edit = editor.edit!;
  const originClip = useRef(editor.selectedClip),
    clips = editClips(edit);
  const effect = availableEffects(asset).find((item) => item.id === id)!;
  const clipIndex = clips.findIndex((clip) => clip.id === editor.selectedClip);
  const sequenceFade = id.includes('Fade');
  const caption =
    id === 'captions'
      ? captionItems(edit).find((item) => item.instanceId === instanceId)
      : undefined;
  const timelineInstance = edit.effectInstances?.find(
    (item) => item.id === instanceId && item.timeSpace === 'output',
  );
  const target =
    id === 'captions'
      ? `Caption ${(caption?.index ?? 0) + 1}`
      : timelineInstance
        ? 'Timeline track'
        : id === 'mix'
          ? 'Output timeline'
          : effect.scope === 'source'
            ? 'Original source'
            : clipIndex >= 0
              ? `Clip ${clipIndex + 1}`
              : sequenceFade
                ? 'Whole sequence'
                : 'All clips';
  const shared = effect.scope === 'clip' && !editor.selectedClip;
  const settingsFor = (recipe: typeof edit) => {
    const item = instanceId
      ? recipe.effectInstances?.find((item) => item.id === instanceId)
      : undefined;
    return item ? instanceRecipe(recipe, item) : recipe;
  };
  const mixed =
    shared &&
    clips.some(
      (clip) =>
        !sameEffectSettings(
          effect,
          settingsFor(clipRecipe(edit, clips[0])),
          settingsFor(clipRecipe(edit, clip)),
        ),
    );
  const instance =
    timelineInstance ??
    (instanceId
      ? (scopedInstances(edit, editor.selectedClip).find((item) => item.id === instanceId) ??
        edit.clips
          ?.flatMap((clip) => scopedInstances(edit, clip.id))
          .find((item) => item.id === instanceId))
      : undefined);
  const present =
    id === 'captions'
      ? !!caption
      : instanceId
        ? !!instance
        : primaryPresent(editor.scopedEdit!, asset, id) ||
          (!editor.selectedClip &&
            clips.some((clip) => primaryPresent(clipRecipe(edit, clip), asset, id)));
  const view = useMemo(() => (instance ? instanceRecipe(edit, instance) : edit), [edit, instance]);
  const scopedView = useMemo(
    () =>
      instance
        ? instanceRecipe(timelineInstance ? edit : editor.scopedEdit!, instance)
        : editor.scopedEdit,
    [edit, editor.scopedEdit, instance, timelineInstance],
  );
  const change = (patch: Partial<typeof edit>) =>
    editor.update(
      instanceId ? changeInstance(edit, instanceId, editor.selectedClip, patch) : patch,
    );
  const previous = instance
    ? scopedInstances(edit, editor.selectedClip).findIndex((item) => item.id === instance.id)
    : -1;
  const inputAsset =
    instance && ['crop', 'transform'].includes(id)
      ? {
          ...asset,
          ...frameDimensions(asset, {
            ...editor.scopedEdit!,
            effectInstances: scopedInstances(edit, editor.selectedClip).slice(0, previous),
          }),
        }
      : asset;
  const controlsEditor = instance
    ? {
        ...editor,
        asset: inputAsset,
        edit: view,
        scopedEdit: scopedView,
        update: change,
        updateClip: change,
      }
    : editor;
  const instanceIds = [
    ...new Set(
      [
        ...scopedInstances(edit, editor.selectedClip),
        ...clips.flatMap((clip) => scopedInstances(edit, clip.id)),
      ]
        .filter((item) => item.effect === id)
        .map((item) => item.id),
    ),
  ];
  const ordinal = instanceId ? instanceIds.indexOf(instanceId) + (timelineInstance ? 1 : 2) : 1;
  const wasPresent = useRef(present);
  useEffect(() => {
    if (wasPresent.current && !present) latestClose.current();
    wasPresent.current = present;
  }, [present]);
  return (
    <dialog
      open
      ref={ref}
      className="effect-settings-overlay"
      style={bounds}
      aria-modal="false"
      aria-labelledby={heading}
    >
      <header className="effect-overlay-heading">
        <div>
          <span>
            <Sparkles size={14} />
            {target}
          </span>
          <h2 id={heading}>
            {id === 'captions' ? 'Caption' : effect.name}
            <span className="sr-only"> settings</span>
          </h2>
          <p title={asset.name}>
            {asset.name}
            {ordinal > 1 && id !== 'captions' ? ` · Instance ${ordinal}` : ''}
          </p>
        </div>
        <button
          data-close
          className="icon-button"
          aria-label="Close effect settings"
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      {!timelineInstance && effect.scope === 'clip' && originClip.current && clips.length > 1 && (
        <div className="effect-overlay-scope">
          <label className="switch-row">
            {sequenceFade ? 'Apply to whole sequence' : 'Apply settings to all clips'}
            <input
              type="checkbox"
              checked={shared}
              disabled={!!editor.busy}
              onChange={(event) =>
                editor.selectClip(event.target.checked ? null : originClip.current)
              }
            />
          </label>
          {shared && sequenceFade ? (
            <p className="field-note">Shared fades apply once at the output’s edges.</p>
          ) : (
            mixed && (
              <p className="field-note">
                Some clips have different settings. Changes apply to all clips.
              </p>
            )
          )}
        </div>
      )}
      <div className="effect-overlay-body">
        <fieldset disabled={!!editor.busy}>
          <EffectControls effect={effect} editor={controlsEditor} current={current} seek={seek} />
          {['normalize', 'noise', 'equalizer'].includes(id) && (
            <AudioEffectsPreview
              editor={{
                ...editor,
                edit: timelineInstance ? edit : editor.scopedEdit,
                update: timelineInstance ? editor.update : editor.updateClip,
              }}
            />
          )}
        </fieldset>
      </div>
      <footer className="effect-overlay-footer">
        <button
          className="button subtle small"
          disabled={!!editor.busy}
          aria-label={`Reset ${id === 'captions' ? 'Caption' : effect.name}`}
          onClick={() => {
            if (id === 'captions') change({ subtitles: resetCaption(view.subtitles) });
            else
              editor.update(
                instanceId
                  ? changeInstance(
                      edit,
                      instanceId,
                      editor.selectedClip,
                      Object.fromEntries(
                        effect.keys.map((key) => [key, resetEffect(effect, asset)[key]]),
                      ),
                    )
                  : effectAction(edit, asset, effect, editor.selectedClip, 'reset'),
              );
          }}
        >
          <RotateCcw size={14} />
          Reset
        </button>
        <button
          className="button subtle small danger"
          disabled={!!editor.busy}
          aria-label={`Remove ${id === 'captions' ? 'Caption' : effect.name}`}
          onClick={() => {
            editor.update(
              instanceId
                ? changeInstance(edit, instanceId, editor.selectedClip, 'remove')
                : effectAction(edit, asset, effect, editor.selectedClip, 'remove'),
            );
            close();
          }}
        >
          <Trash2 size={14} />
          Remove
        </button>
        <button className="button primary small" onClick={close}>
          Done
        </button>
      </footer>
    </dialog>
  );
}
