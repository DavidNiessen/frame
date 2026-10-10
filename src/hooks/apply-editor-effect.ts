import { availableEffects, type EffectId } from '../core/effect-library';
import { effectAction, existingEffectTarget } from '../core/effect-actions';
import { addTimelineEffect } from '../core/timeline-effects';
import type { Editor } from './useEditor';

/** Catalogue and command search share instance creation, limits and singleton behavior. */
export function applyEditorEffect(editor: Editor, id: EffectId, current: number) {
  const { asset, edit } = editor;
  if (!asset || !edit || editor.busy) return null;
  const effect = availableEffects(asset).find(effect => effect.id === id);
  if (!effect) return null;
  const existing = existingEffectTarget(edit, asset, effect, null);
  if (existing) {
    if (effect.scope === 'clip') editor.selectClip(existing.clipId);
    return { existing: true, instanceId: existing.instanceId };
  }
  const patch = ['mix', 'silence'].includes(id) ? effectAction(edit, asset, effect, null, 'add', current) : addTimelineEffect(edit, asset, id, current);
  editor.update(patch); editor.selectClip(null);
  return { existing: false, instanceId: patch.effectInstances?.at(-1)?.id };
}
