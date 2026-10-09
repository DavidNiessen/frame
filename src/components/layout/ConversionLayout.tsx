import { useRef, type CSSProperties, type ReactNode } from 'react';
import { clampPanel, defaultPanelSizes } from '../../core/panel-layout';
import { useElementSize } from '../../hooks/useElementSize';
import { usePanelSizes } from '../../hooks/usePanelSizes';
import { PanelDivider } from './PanelDivider';
export function ConversionLayout({ children, settings }: { children: ReactNode; settings: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const { sizes, resize } = usePanelSizes();
  const bounds = useElementSize(root, { width: innerWidth - 32, height: 0 });
  const stacked = bounds.width < 740;
  const maximum = stacked ? 480 : Math.min(480, bounds.width - 400 - 12);
  const width = clampPanel(sizes.inspector, 280, maximum);
  return <div ref={root} className="conversion-layout resizable-conversion" data-layout={stacked ? 'stacked' : 'wide'} style={{ '--conversion-settings-width': `${width}px` } as CSSProperties}>
    <div className="conversion-main">{children}</div>
    <div className="conversion-divider"><PanelDivider label="Resize conversion settings" controls="conversion-settings" axis="x" reverse value={width} min={280} max={maximum} defaultValue={defaultPanelSizes.inspector} resize={value => resize('inspector', value)} /></div>
    {settings}
  </div>;
}
