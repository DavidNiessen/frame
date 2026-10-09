import { useEffect, useState } from 'react';

export function usePreferences() {
  const [autoWaveforms, setAutoWaveforms] = useState(() => {
    try { return localStorage.getItem('frame:auto-waveforms') !== 'false'; }
    catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('frame:auto-waveforms', String(autoWaveforms)); }
    catch { /* The preference still applies to this session when storage is unavailable. */ }
  }, [autoWaveforms]);
  return { autoWaveforms, setAutoWaveforms };
}
