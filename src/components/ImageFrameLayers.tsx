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
}: {
  editor: Editor;
  selectedEffect: { id: EffectId; instanceId?: string } | null;
  openEffect: (id: EffectId, instanceId?: string) => void;
}) {
  const edit = editor.edit!,
    asset = editor.asset!,
    dims = frameDimensions(asset, edit);
  const rows = imageLayerRows(asset, edit).filter(
    (row) => !row.hidden && ['painting', 'watermark', 'captions'].includes(row.effect.id),
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
        return (
          <div
            className="image-frame-layer"
            data-live={active || undefined}
            style={{ zIndex: index + 1 }}
            key={layer.key}
          >
            {layer.effect.id === 'painting' ? (
              active ? (
                <PaintingCanvas
                  showExisting
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
        );
      })}
    </div>
  );
}
