import { Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { setMonitorVolume } from '../core/monitor-volume';
import { useMonitorVolume } from '../hooks/useMonitorVolume';
export function MonitorVolume() {
  const volume = useMonitorVolume(),
    ref = useRef<HTMLDetailsElement>(null),
    previous = useRef(1);
  if (volume > 0) previous.current = volume;
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) ref.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return (
    <details
      ref={ref}
      className="monitor-volume"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && ref.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          ref.current.open = false;
          ref.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary
        aria-label={`Playback volume: ${Math.round(volume * 100)}%`}
        title="Playback volume — exports unchanged"
      >
        {volume ? <Volume2 size={15} /> : <VolumeX size={15} />}
        <span>{Math.round(volume * 100)}%</span>
      </summary>
      <div className="monitor-volume-popover">
        <div>
          <strong>Playback volume</strong>
          <button
            type="button"
            className="icon-button"
            aria-label={volume ? 'Mute playback' : 'Unmute playback'}
            onClick={() => setMonitorVolume(volume ? 0 : previous.current)}
          >
            {volume ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
        <input
          type="range"
          aria-label="Playback volume"
          min="0"
          max="100"
          step="1"
          value={Math.round(volume * 100)}
          onChange={(event) => setMonitorVolume(Number(event.target.value) / 100)}
        />
        <small>Monitoring only. Exports stay unchanged.</small>
      </div>
    </details>
  );
}
