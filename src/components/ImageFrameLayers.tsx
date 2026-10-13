import { CaptionPreview } from './CaptionPreview';
import { OverlayPreview } from './OverlayPreview';
import { PaintingCanvas } from './PaintingCanvas';
import { changeInstance, extraInstances, instanceRecipe } from '../core/effect-instances';
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
    painting = selectedEffect?.id === 'painting',
    dims = frameDimensions(asset, edit);
  const layers = [
    ...(edit.painting?.image || (painting && !selectedEffect.instanceId)
      ? [{ id: undefined, effect: 'painting' as const, recipe: edit }]
      : []),
    ...(edit.overlays.text || edit.overlays.image
      ? [{ id: undefined, effect: 'watermark' as const, recipe: edit }]
      : []),
    ...extraInstances(edit)
      .filter((item) => ['painting', 'watermark'].includes(item.effect))
      .map((item) => ({ id: item.id, effect: item.effect, recipe: instanceRecipe(edit, item) })),
  ];
  return (
    <div className="image-frame-layers" data-painting={painting || undefined}>
      {layers.map((layer, index) => (
        <div
          className="image-frame-layer"
          style={{ zIndex: index + 1 }}
          key={layer.id ?? layer.effect}
        >
          {layer.effect === 'painting' ? (
            painting && selectedEffect.instanceId === layer.id ? (
              <PaintingCanvas
                showExisting
                edit={layer.recipe}
                update={(patch) =>
                  editor.update(layer.id ? changeInstance(edit, layer.id, null, patch) : patch)
                }
                width={dims.width}
                height={dims.height}
                disabled={!!editor.busy}
                onError={editor.setNotice}
              />
            ) : (
              layer.recipe.painting?.image && (
                <img
                  className="image-paint-layer"
                  src={layer.recipe.painting.image}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                />
              )
            )
          ) : (
            <OverlayPreview
              onlyInstance={layer.id ?? null}
              outputPosition={0}
              current={0}
              asset={asset}
              edit={edit}
              disabled={!!editor.busy || painting}
              pause={() => {}}
              update={editor.update}
              openEffect={openEffect}
              selectedEffect={selectedEffect}
            />
          )}
        </div>
      ))}
      <div className="image-frame-layer" style={{ zIndex: layers.length + 1 }}>
        <CaptionPreview
          outputPosition={0}
          current={0}
          asset={asset}
          edit={edit}
          disabled={!!editor.busy || painting}
          pause={() => {}}
          update={editor.update}
          openEffect={openEffect}
          selectedEffect={selectedEffect}
        />
      </div>
    </div>
  );
}
