export interface ActivityOptions {
  priority?: number; ratio?: number; message?: string; cancel?: () => void; cancelLabel?: string;
}
export interface LoadingTask extends ActivityOptions { label: string }
/** Independent jobs own tokens; foreground work stays visible over background preparation. */
export function createActivityStore() {
  const jobs = new Map<symbol, LoadingTask>(), listeners = new Set<() => void>();
  let current: LoadingTask | null = null;
  const emit = () => {
    current = [...jobs.values()].reduce<LoadingTask | null>((best, task) => !best || (task.priority ?? 0) >= (best.priority ?? 0) ? task : best, null);
    listeners.forEach(listener => listener());
  };
  const start = (label: string, options: ActivityOptions = {}) => {
    const token = Symbol(label); jobs.set(token, { label, ...options }); emit();
    return {
      update(patch: ActivityOptions) {
        const task = jobs.get(token); if (!task) return;
        if (Object.entries(patch).every(([key, value]) => task[key as keyof ActivityOptions] === value)) return;
        jobs.set(token, { ...task, ...patch }); emit();
      },
      finish() { if (jobs.delete(token)) emit(); },
    };
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => current?.label ?? '',
    taskSnapshot: () => current,
    start,
    begin: (label: string) => start(label).finish,
    async run<T>(label: string, work: () => Promise<T>): Promise<T> {
      const task = start(label);
      try { return await work(); } finally { task.finish(); }
    },
  };
}
export const loadingActivity = createActivityStore();
