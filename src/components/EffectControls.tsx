import { VolumeControls } from './VolumeControls';
import type { EffectDefinition } from '../core/effect-library';
import type { Editor } from '../hooks/useEditor';
import { AudioCleanupControls } from './AudioCleanupControls';
import { ColorControls } from './ColorControls';
import { CropControls } from './CropControls';
import { GeometryControls } from './GeometryControls';
import { OverlayControls } from './OverlayControls';
import { SilenceControls } from './SilenceControls';
import { SpeedControls } from './SpeedControls';
import { SubtitleControls } from './SubtitleControls';
import { editedDuration } from '../core/timeline';
export function EffectControls({ effect, editor, current, seek }: { effect: EffectDefinition; editor: Editor; current: number; seek: (time: number) => void }) {
  const scoped: Editor = { ...editor, edit: editor.scopedEdit, update: editor.updateClip }, edit = scoped.edit!, asset = editor.asset!;
  return <div className="effect-editor">
    {effect.scope === 'source' && effect.id !== 'captions' && <p className="effect-target-note">{effect.id === 'mix' ? 'Output timeline · tracks stay in place when clips move.' : effect.id === 'watermark' ? 'Timeline track · drag its bar to set timing.' : 'Source-wide analysis.'}</p>}
    {effect.id === 'volume' && <VolumeControls asset={asset} edit={edit} update={scoped.update} />}
    {effect.id === 'speed' && <SpeedControls edit={edit} update={scoped.update} />}
    {(['audioFadeIn', 'audioFadeOut', 'videoFadeIn', 'videoFadeOut'] as string[]).includes(effect.id) && <section className="control-section"><label className="stacked-label">Duration · {Number(edit[effect.id as 'audioFadeIn']).toFixed(2)}s<input type="range" aria-label={`${effect.name} duration`} min={0} max={editedDuration(edit)} step={.01} value={Number(edit[effect.id as 'audioFadeIn'])} onChange={event => scoped.update({ [effect.id]: Number(event.target.value) })} /></label><p className="field-note">Drag the bar to move this fade. Drag either edge to adjust its timing, including across splits.</p></section>}
    {(['normalize', 'noise', 'equalizer'] as string[]).includes(effect.id) && <AudioCleanupControls editor={scoped} effect={effect.id as 'normalize' | 'noise' | 'equalizer'} />}
    {effect.id === 'color' && <ColorControls editor={scoped} current={current} expanded />}
    {effect.id === 'crop' && <CropControls asset={asset} edit={edit} update={scoped.update} />}
    {effect.id === 'transform' && <GeometryControls asset={asset} edit={edit} update={scoped.update} expanded />}
    {effect.id === 'captions' && <SubtitleControls edit={editor.edit!} update={editor.update} />}
    {effect.id === 'watermark' && <OverlayControls expanded edit={editor.edit!} update={editor.update} />}
    {effect.id === 'silence' && <SilenceControls expanded editor={editor} seek={seek} />}
  </div>;
}
