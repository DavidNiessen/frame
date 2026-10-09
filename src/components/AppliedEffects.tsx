import { clipRecipe, editClips } from '../core/clips';
import { availableEffects, effectActive } from '../core/effect-library';
import { Sparkles } from 'lucide-react';
import type { EditSettings, MediaAsset } from '../core/types';
export function AppliedEffects({ asset, edit, open }: { asset: MediaAsset; edit: EditSettings; open: () => void }) {
  const effects = availableEffects(asset).filter(effect => effectActive(effect, edit, asset) || editClips(edit).some(clip => effectActive(effect, clipRecipe(edit, clip), asset))).map(effect => effect.name).join(' · ');
  if (!effects) return null;
  return <button className="applied-effects" onClick={open} aria-label={`View applied effects: ${effects}`}>
    <Sparkles size={14} /><span><small>Effects applied</small>{effects}</span>
  </button>;
}
