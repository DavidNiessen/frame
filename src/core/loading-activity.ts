/** Independent jobs own a token so finishing one never hides another job's activity. */
export function createActivityStore() {
  const jobs = new Map<symbol, string>(), listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => jobs.size ? [...jobs.values()].at(-1)! : '',
    begin(label: string) {
      const token = Symbol(label); jobs.set(token, label); emit();
      return () => { if (jobs.delete(token)) emit(); };
    },
    async run<T>(label: string, work: () => Promise<T>): Promise<T> {
      const finish = this.begin(label);
      try { return await work(); } finally { finish(); }
    },
  };
}
export const loadingActivity = createActivityStore();
