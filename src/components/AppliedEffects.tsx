import { Sparkles } from 'lucide-react';
import type { EditSettings, MediaAsset } from '../core/types';
export function AppliedEffects({ asset, edit, open }: { asset: MediaAsset; edit: EditSettings; open: () => void }) {
  const effects = [
    edit.speed !== 1 && `Speed ${edit.speed}×`,
    (edit.audioFadeIn || edit.audioFadeOut || edit.videoFadeIn || edit.videoFadeOut) && 'Fades',
    asset.hasAudio && (edit.normalizeLoudness || edit.reduceNoise || Object.values(edit.equalizer).some(Boolean)) && 'Audio cleanup',
    asset.kind === 'video' && (edit.geometry.rotation || edit.geometry.flipHorizontal || edit.geometry.flipVertical || edit.geometry.resize) && 'Transform',
    asset.kind === 'video' && (edit.color.brightness || edit.color.contrast !== 1 || edit.color.saturation !== 1 || edit.color.temperature || edit.color.lut) && 'Color',
    asset.kind === 'video' && edit.subtitles.mode !== 'none' && edit.subtitles.cues.length > 0 && 'Subtitles',
    asset.kind === 'video' && (edit.overlays.text || edit.overlays.image) && 'Watermark',
  ].filter(Boolean).join(' · ');
  if (!effects) return null;
  return <button className="applied-effects" onClick={open} aria-label={`View applied effects: ${effects}`}>
    <Sparkles size={14} /><span><small>Effects applied</small>{effects}</span>
  </button>;
}
