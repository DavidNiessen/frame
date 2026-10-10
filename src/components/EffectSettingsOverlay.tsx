import { frameDimensions } from '../core/geometry';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { changeInstance, instanceRecipe, primaryPresent, scopedInstances } from '../core/effect-instances';
import { availableEffects, resetEffect, sameEffectSettings, type EffectId } from '../core/effect-library';
import { effectAction } from '../core/effect-actions';
import { clipRecipe, editClips } from '../core/clips';
import type { Editor } from '../hooks/useEditor';
import { EffectControls } from './EffectControls';
import { AudioEffectsPreview } from './AudioEffectsPreview';

/** A modeless overlay keeps the live preview and timeline available while adjusting. */
export function EffectSettingsOverlay({ id, instanceId, editor, current, seek, close }: {
  id: EffectId; instanceId?: string; editor: Editor; current: number; seek: (time: number) => void; close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null), heading = useId(), latestClose = useRef(close);
  const [bounds, setBounds] = useState<{ top: number; left: number; width: number; height: number }>();
  latestClose.current = close;
  const asset = editor.asset!, edit = editor.edit!;
  const originClip = useRef(editor.selectedClip), clips = editClips(edit);
  const effect = availableEffects(asset).find(item => item.id === id)!;
  const clipIndex = clips.findIndex(clip => clip.id === editor.selectedClip);
  const sequenceFade = id.includes('Fade');
  const target = effect.scope === 'source' ? 'Entire source' : clipIndex >= 0 ? `Clip ${clipIndex + 1}` : sequenceFade ? 'Whole sequence' : 'All clips';
  const shared = effect.scope === 'clip' && !editor.selectedClip;
  const settingsFor = (recipe: typeof edit) => { const item = instanceId ? recipe.effectInstances?.find(item => item.id === instanceId) : undefined; return item ? instanceRecipe(recipe, item) : recipe; };
  const mixed = shared && clips.some(clip => !sameEffectSettings(effect, settingsFor(clipRecipe(edit, clips[0])), settingsFor(clipRecipe(edit, clip))));
  const instance = instanceId ? scopedInstances(edit, editor.selectedClip).find(item => item.id === instanceId) ?? edit.clips?.flatMap(clip => scopedInstances(edit, clip.id)).find(item => item.id === instanceId) : undefined;
  const present = instanceId ? !!instance : primaryPresent(editor.scopedEdit!, asset, id) || !editor.selectedClip && clips.some(clip => primaryPresent(clipRecipe(edit, clip), asset, id));
  const view = instance ? instanceRecipe(edit, instance) : edit;
  const scopedView = instance ? instanceRecipe(editor.scopedEdit!, instance) : editor.scopedEdit;
  const change = (patch: Partial<typeof edit>) => editor.update(instanceId ? changeInstance(edit, instanceId, editor.selectedClip, patch) : patch);
  const previous = instance ? scopedInstances(edit, editor.selectedClip).findIndex(item => item.id === instance.id) : -1;
  const inputAsset = instance && ['crop', 'transform'].includes(id) ? { ...asset, ...frameDimensions(asset, { ...editor.scopedEdit!, effectInstances: scopedInstances(edit, editor.selectedClip).slice(0, previous) }) } : asset;
  const controlsEditor = instance ? { ...editor, asset: inputAsset, edit: view, scopedEdit: scopedView, update: change, updateClip: change } : editor;
  const instanceIds = [...new Set([...scopedInstances(edit, editor.selectedClip), ...clips.flatMap(clip => scopedInstances(edit, clip.id))].filter(item => item.effect === id).map(item => item.id))];
  const ordinal = instanceId ? instanceIds.indexOf(instanceId) + 2 : 1;
  const wasPresent = useRef(present);
  useEffect(() => { if (wasPresent.current && !present) latestClose.current(); wasPresent.current = present; }, [present]);
  useLayoutEffect(() => {
    const island = document.getElementById('media-inspector');
    if (!island) return;
    function position() {
      const rect = island!.getBoundingClientRect(), width = Math.min(rect.width, innerWidth - 24);
      const height = Math.min(rect.height, innerHeight - 24), top = Math.max(12, Math.min(rect.top, innerHeight - height - 12));
      setBounds({ top, left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)), width, height });
    }
    position(); const observer = new ResizeObserver(position); observer.observe(island);
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, []);
  useLayoutEffect(() => {
    const dialog = ref.current!, opener = document.activeElement as HTMLElement | null;
    dialog.querySelector<HTMLButtonElement>('[data-close]')?.focus({ preventScroll: true });
    function outside(event: PointerEvent) {
      if (!dialog.contains(event.target as Node)) latestClose.current();
    }
    function focusOutside(event: FocusEvent) {
      if (event.target !== document.body && !dialog.contains(event.target as Node)) latestClose.current();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[aria-modal="true"][open]')) {
        event.preventDefault(); event.stopPropagation(); latestClose.current();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', focusOutside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);
      document.removeEventListener('focusin', focusOutside);
      dialog.querySelectorAll('audio, video').forEach(media => (media as HTMLMediaElement).pause());
      if (dialog.contains(document.activeElement) && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return <dialog open ref={ref} className="effect-settings-overlay" style={bounds} aria-modal="false" aria-labelledby={heading}>
    <header className="effect-overlay-heading"><div><span><Sparkles size={14} />{target}</span><h2 id={heading}>{effect.name}<span className="sr-only"> settings</span></h2><p title={asset.name}>{asset.name}{ordinal > 1 ? ` · Instance ${ordinal}` : ''}</p></div><button data-close className="icon-button" aria-label="Close effect settings" onClick={close}><X size={18} /></button></header>
    {effect.scope === 'clip' && originClip.current && clips.length > 1 && <div className="effect-overlay-scope"><label className="switch-row">{sequenceFade ? 'Apply to whole sequence' : 'Apply settings to all clips'}<input type="checkbox" checked={shared} disabled={!!editor.busy} onChange={event => editor.selectClip(event.target.checked ? null : originClip.current)} /></label>{shared && sequenceFade ? <p className="field-note">Shared fades apply once at the output’s edges.</p> : mixed && <p className="field-note">Some clips have different settings. Changes apply to all clips.</p>}</div>}
    <div className="effect-overlay-body"><fieldset disabled={!!editor.busy}><EffectControls effect={effect} editor={controlsEditor} current={current} seek={seek} />
      {['normalize', 'noise', 'equalizer'].includes(id) && <AudioEffectsPreview editor={{ ...editor, edit: editor.scopedEdit, update: editor.updateClip }} />}
    </fieldset></div>
    <footer className="effect-overlay-footer"><button className="button subtle small" disabled={!!editor.busy} aria-label={`Reset ${effect.name}`} onClick={() => editor.update(instanceId ? changeInstance(edit, instanceId, editor.selectedClip, Object.fromEntries(effect.keys.map(key => [key, resetEffect(effect, asset)[key]]))) : effectAction(edit, asset, effect, editor.selectedClip, 'reset'))}><RotateCcw size={14} />Reset</button><button className="button subtle small danger" disabled={!!editor.busy} aria-label={`Remove ${effect.name}`} onClick={() => { editor.update(instanceId ? changeInstance(edit, instanceId, editor.selectedClip, 'remove') : effectAction(edit, asset, effect, editor.selectedClip, 'remove')); close(); }}><Trash2 size={14} />Remove</button><button className="button primary small" onClick={close}>Done</button></footer>
  </dialog>;
}
