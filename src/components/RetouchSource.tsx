import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
interface RetouchSource {
  key: string;
  url: string;
  width: number;
  height: number;
}
const Context = createContext<{
  source: RetouchSource | null;
  setSource: (source: RetouchSource | null) => void;
} | null>(null);
export const useRetouchSource = () => useContext(Context);
export function RetouchSourceProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<RetouchSource | null>(null),
    value = useMemo(() => ({ source, setSource }), [source]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
