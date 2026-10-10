import { sourceRecipes } from '../core/effect-instances';
import type { EditSettings, MediaAsset } from '../core/types';
export function OverlayPreview({ edit, asset }: { edit: EditSettings; asset: MediaAsset }) {
  return <>{sourceRecipes(edit, 'watermark').map(({ id, recipe }) => <SingleOverlay key={id ?? 'primary'} edit={recipe} asset={asset} />)}</>;
}
function SingleOverlay({ edit, asset }: { edit: EditSettings; asset: MediaAsset }) {
  const o = edit.overlays; const position = { left: `${o.x}%`, top: `${o.y}%`, transform: `translate(-${o.x}%, -${o.y}%)`, opacity: o.opacity };
  return <div className="overlay-preview">{o.text && <span style={{ ...position, color: o.color, fontSize: `${o.size * 100 / (edit.crop?.width ?? asset.width ?? 640)}cqw` }}>{o.text}</span>}{o.image && <img src={o.image} alt="Watermark preview" style={{ ...position, width: `${o.imageWidth}%` }} />}</div>;
}
