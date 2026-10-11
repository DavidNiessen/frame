import { useEffect, useId, useRef } from 'react';
import { Download, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
export type InspectorTab = 'effects' | 'export';
const tabs = [
  { id: 'effects', label: 'Effects', icon: Sparkles },
  { id: 'export', label: 'Export', icon: Download },
] as const;
export function InspectorTabs({
  selected,
  select,
  children,
}: {
  selected: InspectorTab;
  select: (tab: InspectorTab) => void;
  children: Record<InspectorTab, ReactNode>;
}) {
  const prefix = useId();
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scroll.current) return;
    scroll.current.scrollTop = 0;
    scroll.current
      .querySelectorAll<HTMLMediaElement>('[hidden] audio, [hidden] video')
      .forEach((media) => media.pause());
  }, [selected]);
  return (
    <>
      <div className="inspector-tabs" role="tablist" aria-label="Editing tools">
        {tabs.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            id={`${prefix}-${id}-tab`}
            role="tab"
            aria-selected={selected === id}
            aria-controls={`${prefix}-${id}-panel`}
            tabIndex={selected === id ? 0 : -1}
            onClick={() => select(id)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              select(tabs[next].id);
              document.getElementById(`${prefix}-${tabs[next].id}-tab`)?.focus();
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
      <div className="inspector-scroll" ref={scroll}>
        {tabs.map(({ id }) => (
          <div
            key={id}
            data-tool={id}
            role="tabpanel"
            id={`${prefix}-${id}-panel`}
            aria-labelledby={`${prefix}-${id}-tab`}
            hidden={selected !== id}
          >
            {children[id]}
          </div>
        ))}
      </div>
    </>
  );
}
