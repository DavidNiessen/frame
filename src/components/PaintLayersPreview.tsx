import { extraInstances } from '../core/effect-instances';
import { activeAtSource } from '../core/timed-adjustments';
import type { EditSettings } from '../core/types';
/** Static paint layers remain interactive while the independent video/audio preview is rendering. */
export function PaintLayersPreview({
  edit,
  current,
  position,
  selected,
}: {
  edit: EditSettings;
  current: number;
  position: number;
  selected?: string;
}) {
  const layers = [
    ...(edit.painting?.image && selected !== 'primary'
      ? [{ id: 'primary', image: edit.painting.image }]
      : []),
    ...extraInstances(edit, 'painting')
      .filter(
        (item) =>
          item.id !== selected &&
          item.settings.painting?.image &&
          activeAtSource(item.range, item.timeSpace === 'output' ? position : current),
      )
      .map((item) => ({ id: item.id, image: item.settings.painting!.image! })),
  ];
  return (
    <>
      {layers.map((layer) => (
        <img
          key={layer.id}
          className="paint-layer-preview"
          src={layer.image}
          alt=""
          draggable={false}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
