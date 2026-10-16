import { CanvasGuides } from './CanvasGuides';
import { ImageMaskOverlay } from './ImageMaskOverlay';
import { imageEditBeforeLayer, imageLayerKey, imageLayerRows } from '../core/image-layers';
import { effectAction } from '../core/effect-actions';
import { ImageToolbar } from './ImageToolbar';
import { ImageFrameLayers } from './ImageFrameLayers';
import { defaultGeometry } from '../core/geometry';
import { useElementSize } from '../hooks/useElementSize';
import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useImageRender } from '../hooks/useImageRender';
import { changeInstance, instanceRecipe } from '../core/effect-instances';
import { frameDimensions } from '../core/geometry';
import type { EffectId } from '../core/effect-library';
import type { Editor } from '../hooks/useEditor';
import { CropOverlay } from './CropOverlay';
export function ImagePreview({
  editor,
  selectedEffect,
  expanded,
  toggleExpanded,
  openEffect,
  selectedMediaLayer,
  openMediaLayer,
  panelRef,
}: {
  panelRef: RefObject<HTMLElement | null>;
  editor: Editor;
  selectedMediaLayer?: string;
  openMediaLayer: (id: string, keepView?: boolean) => void;
  selectedEffect: { id: EffectId; instanceId?: string } | null;
  expanded: boolean;
  toggleExpanded: () => void;
  openEffect: (id: EffectId, instanceId?: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    bounds = useElementSize(viewport, { width: 640, height: 480 });
  const asset = editor.asset!,
    edit = editor.edit!,
    instance = edit.effectInstances?.find((item) => item.id === selectedEffect?.instanceId);
  const selected = useMemo(
    () => (instance ? instanceRecipe(edit, instance) : edit),
    [edit, instance],
  );
  const change = (patch: Partial<typeof edit>) =>
    editor.update(instance ? changeInstance(edit, instance.id, null, patch) : patch);
  const cropping = selectedEffect?.id === 'crop';
  const base = useMemo(
    () =>
      cropping
        ? instance
          ? {
              ...edit,
              effectInstances: edit.effectInstances?.slice(
                0,
                edit.effectInstances.indexOf(instance),
              ),
            }
          : { ...edit, crop: null, geometry: defaultGeometry(), effectInstances: [] }
        : edit,
    [cropping, instance, edit],
  );
  const activeLayer = useMemo(() => {
    if (!selectedMediaLayer && !selectedEffect) return undefined;
    const rows = imageLayerRows(asset, edit);
    return selectedMediaLayer
      ? rows.find((row) => row.mediaLayer?.id === selectedMediaLayer)
      : rows.find(
          (row) => row.key === imageLayerKey(selectedEffect!.id, selectedEffect!.instanceId),
        );
  }, [asset, edit, selectedMediaLayer, selectedEffect]);
  const liveObject =
    activeLayer &&
    !activeLayer.hidden &&
    !activeLayer.locked &&
    ['captions', 'painting', 'watermark', 'shape', 'retouch', 'cutout', 'media'].includes(
      activeLayer.effect.id,
    );
  // Cache an exact composite and an object-free base for responsive gestures.
  const interactionEdit = useMemo(() => {
    if (!liveObject || !activeLayer) return undefined;
    return ['retouch', 'cutout', 'media'].includes(activeLayer.effect.id)
      ? imageEditBeforeLayer(asset, base, activeLayer.key)
      : activeLayer.id
        ? {
            ...base,
            effectInstances: base.effectInstances?.filter((item) => item.id !== activeLayer.id),
          }
        : { ...base, ...effectAction(base, asset, activeLayer.effect, null, 'remove') };
  }, [liveObject, activeLayer, asset, base]);
  const renderEdit = base;
  const render = useImageRender(
    { ...editor, edit: renderEdit },
    interactionEdit,
    liveObject ? activeLayer.key : '',
  );
  const [interaction, setInteraction] = useState({
    key: '',
    phase: 'idle' as 'idle' | 'active' | 'settling',
  });
  const interacting =
    !!liveObject && interaction.key === activeLayer?.key && interaction.phase !== 'idle';
  useEffect(() => {
    if (
      (interaction.key && interaction.key !== activeLayer?.key) ||
      (interaction.phase === 'settling' && !render.preparing)
    )
      setInteraction({ key: '', phase: 'idle' });
  }, [interaction, activeLayer?.key, render.preparing]);
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [before, setBefore] = useState(false);
  const drag = useRef<{ x: number; y: number; pan: typeof pan } | null>(null);
  const dims = before
      ? { width: asset.width!, height: asset.height! }
      : frameDimensions(asset, renderEdit),
    displayWidth = Math.max(
      1,
      Math.min(bounds.width - 48, ((bounds.height - 48) * dims.width) / dims.height),
    ),
    minimumZoom = Math.min(0.25, (dims.width / displayWidth) * 0.1),
    maximumZoom = Math.max(8, (dims.width / displayWidth) * 8),
    fit = () => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        setZoom((z) =>
          Math.max(minimumZoom, Math.min(maximumZoom, z * (event.deltaY < 0 ? 1.1 : 0.9))),
        );
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [minimumZoom, maximumZoom]);
  function start(event: PointerEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      ['painting', 'retouch', 'cutout', 'media'].includes(selectedEffect?.id ?? '') ||
      cropping ||
      zoom === 1
    )
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, pan };
  }
  const geometry = selected.geometry;
  return (
    <section
      id="media-preview"
      ref={panelRef}
      className="panel image-preview"
      aria-label="Image canvas"
      key={asset.id}
    >
      <ImageToolbar
        editor={editor}
        before={before}
        setBefore={setBefore}
        originalFailed={!render.original}
        expanded={expanded}
        toggleExpanded={toggleExpanded}
      />

      <div
        ref={viewport}
        className="image-viewport"
        onPointerDown={start}
        onPointerMove={(e) => {
          if (drag.current)
            setPan({
              x: drag.current.pan.x + e.clientX - drag.current.x,
              y: drag.current.pan.y + e.clientY - drag.current.y,
            });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <div
          className="image-canvas-frame"
          data-canvas-guides
          aria-busy={render.preparing}
          style={{
            width: displayWidth,
            aspectRatio: `${dims.width}/${dims.height}`,
            transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
          }}
        >
          <CanvasGuides>
            <img
              crossOrigin="anonymous"
              src={before ? render.original : interacting && render.base ? render.base : render.url}
              alt={before ? 'Original image' : asset.name}
              draggable={false}
              onError={() => {
                if (before) {
                  setBefore(false);
                }
              }}
            />
            {!cropping && !before && (
              <ImageFrameLayers
                editor={editor}
                selectedEffect={selectedEffect}
                selectedMediaLayer={selectedMediaLayer}
                openMediaLayer={openMediaLayer}
                openEffect={openEffect}
                baseUrl={render.base}
                interactionKey={interacting ? interaction.key : ''}
                startInteraction={(key) => setInteraction({ key, phase: 'active' })}
                finishInteraction={(key) =>
                  setInteraction((current) =>
                    current.key === key ? { ...current, phase: 'settling' } : current,
                  )
                }
              />
            )}
            {!cropping && !before && (
              <ImageMaskOverlay
                key={
                  selectedEffect
                    ? imageLayerKey(selectedEffect.id, selectedEffect.instanceId)
                    : 'none'
                }
                editor={editor}
                selectedEffect={selectedEffect}
              />
            )}
            {cropping && !before && (
              <CropOverlay
                crop={selected.crop ?? { x: 0, y: 0, width: dims.width, height: dims.height }}
                width={dims.width}
                height={dims.height}
                disabled={!!editor.busy}
                onChange={(crop) => change({ crop })}
              />
            )}
          </CanvasGuides>
        </div>
        {before && <span className="image-original-badge">Original</span>}
      </div>
      <div className="image-status">
        <span title={asset.name}>
          {dims.width} × {dims.height} <span className="image-status-dot">·</span>{' '}
          {edit.format.toUpperCase()}
          {cropping
            ? ' · Drag the corners to crop'
            : selectedEffect?.id === 'painting'
              ? ' · Paint on the canvas'
              : ''}
        </span>
        <div className="image-toolbar-group">
          <button
            className="icon-button"
            aria-label="Zoom out image"
            disabled={zoom <= minimumZoom}
            onClick={() => setZoom((z) => Math.max(minimumZoom, z / 1.25))}
          >
            <ZoomOut size={15} />
          </button>
          <span>{Math.round(((zoom * displayWidth) / dims.width) * 100)}%</span>
          <button
            className="icon-button"
            aria-label="Zoom in image"
            disabled={zoom >= maximumZoom}
            onClick={() => setZoom((z) => Math.min(maximumZoom, z * 1.25))}
          >
            <ZoomIn size={15} />
          </button>
          <button
            className="button subtle small"
            aria-label="Actual image size"
            onClick={() => {
              setZoom(dims.width / displayWidth);
              setPan({ x: 0, y: 0 });
            }}
          >
            1:1
          </button>
          <button className="button subtle small" onClick={fit}>
            <Maximize size={13} /> Fit
          </button>
        </div>
      </div>
      {render.error && (
        <div className="image-render-error" role="alert">
          {render.error}
          <button className="button subtle small" onClick={render.retry}>
            Retry preview
          </button>
        </div>
      )}
      <span className="sr-only">Rotation {geometry.rotation} degrees</span>
    </section>
  );
}
