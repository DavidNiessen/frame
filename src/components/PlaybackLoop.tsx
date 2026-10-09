import { useEffect, useRef } from 'react';
import { Repeat } from 'lucide-react';
export type LoopMode = 'off' | 'sequence' | 'clip';
export function PlaybackLoop({ value, change, disabled }: { value: LoopMode; change: (mode: LoopMode) => void; disabled: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { const dismiss = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && menu.current) menu.current.open = false; }; document.addEventListener('pointerdown', dismiss); return () => document.removeEventListener('pointerdown', dismiss); }, []);
  return <details ref={menu} className={`playback-loop ${value !== 'off' ? 'active' : ''}`} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}><summary className="icon-button" aria-label="Playback loop" title={`Loop: ${value}`}><Repeat size={16} /></summary><div className="playback-loop-menu"><strong>Review playback</strong>{(['off', 'sequence', 'clip'] as const).map(mode => <button key={mode} disabled={disabled} aria-pressed={value === mode} onClick={() => { change(mode); if (menu.current) menu.current.open = false; }}>{mode === 'off' ? 'Loop off' : mode === 'sequence' ? 'Loop sequence' : 'Loop selected clip'}</button>)}</div></details>;
}
