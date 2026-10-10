import { useEffect, useState } from 'react';

export function usePreferences() {
  const [timelinePreview, setTimelinePreview] = useState(() => {
    try { return localStorage.getItem('frame:timeline-preview') !== 'false'; }
    catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('frame:timeline-preview', String(timelinePreview)); }
    catch { /* Keep the session preference when storage is unavailable. */ }
  }, [timelinePreview]);
  const [autoWaveforms, setAutoWaveforms] = useState(() => {
    try { return localStorage.getItem('frame:auto-waveforms') !== 'false'; }
    catch { return true; }
  });
  const [workspaceAutosave, setWorkspaceAutosave] = useState(() => {
    try { return localStorage.getItem('frame:auto-save') !== 'false'; }
    catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('frame:auto-save', String(workspaceAutosave)); }
    catch { /* Keep the session preference when storage is unavailable. */ }
  }, [workspaceAutosave]);
  useEffect(() => {
    try { localStorage.setItem('frame:auto-waveforms', String(autoWaveforms)); }
    catch { /* The preference still applies to this session when storage is unavailable. */ }
  }, [autoWaveforms]);
  return { autoWaveforms, setAutoWaveforms, workspaceAutosave, setWorkspaceAutosave, timelinePreview, setTimelinePreview };
}
