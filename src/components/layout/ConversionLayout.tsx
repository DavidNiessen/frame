import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { clampPanel, defaultPanelSizes } from '../../core/panel-layout';
import { useElementSize } from '../../hooks/useElementSize';
import { usePanelSizes } from '../../hooks/usePanelSizes';
import { PanelDivider } from './PanelDivider';
export function ConversionLayout({
  children,
  settings,
  fileCount,
}: {
  children: ReactNode;
  settings: ReactNode;
  fileCount: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { sizes, resize } = usePanelSizes();
  const bounds = useElementSize(root, { width: innerWidth - 32, height: 0 });
  const stacked = bounds.width < 740;
  const [pane, setPane] = useState<'files' | 'settings'>(fileCount ? 'settings' : 'files');
  const previous = useRef({ stacked, fileCount });
  useEffect(() => {
    if (stacked && fileCount && (!previous.current.stacked || !previous.current.fileCount))
      setPane('settings');
    previous.current = { stacked, fileCount };
  }, [stacked, fileCount]);
  const maximum = stacked ? 480 : Math.min(480, bounds.width - 400 - 12);
  const width = clampPanel(sizes.inspector, 280, maximum);
  return (
    <div
      ref={root}
      className="conversion-layout resizable-conversion"
      data-layout={stacked ? 'stacked' : 'wide'}
      data-pane={pane}
      style={{ '--conversion-settings-width': `${width}px` } as CSSProperties}
    >
      <nav className="conversion-pane-nav segmented" aria-label="Conversion panels">
        <button
          aria-pressed={pane === 'files'}
          aria-controls="conversion-main"
          className={pane === 'files' ? 'selected' : ''}
          onClick={() => setPane('files')}
        >
          Files <span className="count">{fileCount}</span>
        </button>
        <button
          aria-pressed={pane === 'settings'}
          aria-controls="conversion-settings"
          className={pane === 'settings' ? 'selected' : ''}
          onClick={() => setPane('settings')}
        >
          Format & quality
        </button>
      </nav>
      <div id="conversion-main" className="conversion-main">
        {children}
      </div>
      <div className="conversion-divider">
        <PanelDivider
          label="Resize conversion settings"
          controls="conversion-settings"
          axis="x"
          reverse
          value={width}
          min={280}
          max={maximum}
          defaultValue={defaultPanelSizes.inspector}
          resize={(value) => resize('inspector', value)}
        />
      </div>
      {settings}
    </div>
  );
}
