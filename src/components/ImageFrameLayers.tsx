import { ShapePreview } from './ShapePreview';
import { FrameInteractionContext } from './frame-interaction';
import { cssBlendMode } from '../core/image-compositing';
import { imageLayerRows } from '../core/image-layers';
import { CaptionPreview } from './CaptionPreview';
import { OverlayPreview } from './OverlayPreview';
import { PaintingCanvas } from './PaintingCanvas';
import { changeInstance } from '../core/effect-instances';
import { frameDimensions } from '../core/geometry';
import type { EffectId } from '../core/effect-library';
import type { Editor } from '../hooks/useEditor';
/** Keep the compositor's paint/artwork order while letting frame objects update immediately. */
export function ImageFrameLayers({
  editor,
  selectedEffect,
  openEffect,
  interactionKey,
  startInteraction,
  finishInteraction,
}: {
  interactionKey: string;
  startInteraction: (key: string) => void;
  finishInteraction: (key: string) => void;
  editor: Editor;
  selectedEffect: { id: EffectId; instanceId?: string } | null;
  openEffect: (id: EffectId, instanceId?: string) => void;
}) {
  const edit = editor.edit!,
    asset = editor.asset!,
    dims = frameDimensions(asset, edit);
  const rows = imageLayerRows(asset, edit).filter(
    (row) => !row.hidden && ['painting', 'watermark', 'captions', 'shape'].includes(row.effect.id),
  );
  const painting =
    selectedEffect?.id === 'painting' &&
    rows.some((row) => row.id === selectedEffect.instanceId && !row.locked);
  return (
    <div className="image-frame-layers" data-painting={painting || undefined}>
      {rows.map((layer, index) => {
        const active =
          selectedEffect?.id === layer.effect.id &&
          selectedEffect.instanceId === layer.id &&
          !layer.locked;
        const disabled =
          !!editor.busy || layer.locked || (painting && layer.effect.id !== 'painting');
        const live = active && interactionKey === layer.key;
        return (
          <FrameInteractionContext.Provider
            key={layer.key}
            value={{
              active: live,
              start: () => startInteraction(layer.key),
              finish: () => finishInteraction(layer.key),
            }}
          >
            <div
              className="image-frame-layer"
              data-live={live || undefined}
              style={{
                zIndex: index + 1,
                mixBlendMode: live ? cssBlendMode(layer.state.blend) : undefined,
                opacity: live ? (layer.state.opacity ?? 1) : undefined,
              }}
              key={layer.key}
            >
              {layer.effect.id === 'painting' ? (
                active ? (
                  <PaintingCanvas
                    showExisting={live}
                    edit={layer.recipe}
                    update={(patch) =>
                      editor.update(layer.id ? changeInstance(edit, layer.id, null, patch) : patch)
                    }
                    width={dims.width}
                    height={dims.height}
                    disabled={disabled}
                    onError={editor.setNotice}
                  />
                ) : null
              ) : layer.effect.id === 'shape' ? (
                <ShapePreview
                  onlyInstance={layer.id ?? null}
                  edit={edit}
                  asset={asset}
                  disabled={disabled}
                  update={editor.update}
                  pause={() => {}}
                  openEffect={openEffect}
                  selectedEffect={selectedEffect}
                />
              ) : layer.effect.id === 'watermark' ? (
                <OverlayPreview
                  onlyInstance={layer.id ?? null}
                  outputPosition={0}
                  current={0}
                  asset={asset}
                  edit={edit}
                  disabled={disabled}
                  pause={() => {}}
                  update={editor.update}
                  openEffect={openEffect}
                  selectedEffect={selectedEffect}
                />
              ) : (
                <CaptionPreview
                  onlyInstance={layer.id ?? null}
                  outputPosition={0}
                  current={0}
                  asset={asset}
                  edit={edit}
                  disabled={disabled}
                  pause={() => {}}
                  update={editor.update}
                  openEffect={openEffect}
                  selectedEffect={selectedEffect}
                />
              )}
            </div>
          </FrameInteractionContext.Provider>
        );
      })}
    </div>
  );
}
