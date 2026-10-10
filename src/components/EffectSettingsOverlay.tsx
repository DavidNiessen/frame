import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { appliedEffects, availableEffects, sameEffectSettings, type EffectId } from '../core/effect-library';
import { effectAction } from '../core/effect-actions';
import { clipRecipe, editClips } from '../core/clips';
import type { Editor } from '../hooks/useEditor';
import { EffectControls } from './EffectControls';
import { AudioEffectsPreview } from './AudioEffectsPreview';

/** A modeless overlay keeps the live preview and timeline available while adjusting. */
export function EffectSettingsOverlay({ id, editor, current, seek, close }: {
  id: EffectId; editor: Editor; current: number; seek: (time: number) => void; close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null), heading = useId(), latestClose = useRef(close);
  const [bounds, setBounds] = useState<{ top: number; left: number; width: number; maxHeight: number }>();
  latestClose.current = close;
  const asset = editor.asset!, edit = editor.edit!;
  const originClip = useRef(editor.selectedClip), clips = editClips(edit);
  const effect = availableEffects(asset).find(item => item.id === id)!;
  const clipIndex = clips.findIndex(clip => clip.id === editor.selectedClip);
  const sequenceFade = id.includes('Fade');
  const target = effect.scope === 'source' ? 'Entire source' : clipIndex >= 0 ? `Clip ${clipIndex + 1}` : sequenceFade ? 'Whole sequence' : 'All clips';
  const shared = effect.scope === 'clip' && !editor.selectedClip;
  const mixed = shared && clips.some(clip => !sameEffectSettings(effect, clipRecipe(edit, clips[0]), clipRecipe(edit, clip)));
  const present = appliedEffects(asset, edit, editor.selectedClip).some(item => item.id === id);
  const wasPresent = useRef(present);
  useEffect(() => { if (wasPresent.current && !present) latestClose.current(); wasPresent.current = present; }, [present]);
  useLayoutEffect(() => {
    const island = document.getElementById('media-inspector');
    if (!island) return;
    function position() {
      const rect = island!.getBoundingClientRect(), width = Math.min(rect.width, innerWidth - 24);
      const top = Math.max(12, Math.min(rect.top, innerHeight - 240));
      setBounds({ top, left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)), width, maxHeight: Math.min(rect.height, innerHeight - top - 12) });
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
    <header className="effect-overlay-heading"><div><span><Sparkles size={14} />{target}</span><h2 id={heading}>{effect.name}<span className="sr-only"> settings</span></h2><p title={asset.name}>{asset.name}</p></div><button data-close className="icon-button" aria-label="Close effect settings" onClick={close}><X size={18} /></button></header>
    {effect.scope === 'clip' && originClip.current && clips.length > 1 && <div className="effect-overlay-scope"><label className="switch-row">{sequenceFade ? 'Apply to whole sequence' : 'Apply settings to all clips'}<input type="checkbox" checked={shared} disabled={!!editor.busy} onChange={event => editor.selectClip(event.target.checked ? null : originClip.current)} /></label>{shared && sequenceFade ? <p className="field-note">Shared fades apply once at the output’s edges.</p> : mixed && <p className="field-note">Some clips have different settings. Changes apply to all clips.</p>}</div>}
    <div className="effect-overlay-body"><fieldset disabled={!!editor.busy}><EffectControls effect={effect} editor={editor} current={current} seek={seek} />
      {['normalize', 'noise', 'equalizer'].includes(id) && <AudioEffectsPreview editor={{ ...editor, edit: editor.scopedEdit, update: editor.updateClip }} />}
    </fieldset></div>
    <footer className="effect-overlay-footer"><button className="button subtle small" disabled={!!editor.busy} aria-label={`Reset ${effect.name}`} onClick={() => editor.update(effectAction(edit, asset, effect, editor.selectedClip, 'reset'))}><RotateCcw size={14} />Reset</button><button className="button subtle small danger" disabled={!!editor.busy} aria-label={`Remove ${effect.name}`} onClick={() => { editor.update(effectAction(edit, asset, effect, editor.selectedClip, 'remove')); close(); }}><Trash2 size={14} />Remove</button><button className="button primary small" onClick={close}>Done</button></footer>
  </dialog>;
}
