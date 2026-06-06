import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { getApiBaseUrl } from '@/constants/config';

interface MaintenanceContextType {
  isMaintenance: boolean;
  isOffline: boolean;
  setMaintenance: (value: boolean) => void;
  setOffline: (value: boolean) => void;
  checkHealth: () => Promise<void>;
}

const MaintenanceContext = createContext<MaintenanceContextType>({
  isMaintenance: false,
  isOffline: false,
  setMaintenance: () => {},
  setOffline: () => {},
  checkHealth: async () => {},
});

export function MaintenanceProvider({ children }: { children: React.ReactNode }) {
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const checkingRef = useRef(false);

  const setMaintenance = useCallback((value: boolean) => {
    setIsMaintenance(value);
    if (value) setIsOffline(false);
  }, []);

  const setOffline = useCallback((value: boolean) => {
    setIsOffline(value);
    if (value) setIsMaintenance(false);
  }, []);

  const checkHealth = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const resp = await fetch(`${getApiBaseUrl()}/health`, { signal: AbortSignal.timeout(6000) });
      if (resp.ok) {
        setIsMaintenance(false);
        setIsOffline(false);
      } else if (resp.status === 503) {
        const data = await resp.json().catch(() => ({}));
        if (data.maintenance) {
          setIsMaintenance(true);
          setIsOffline(false);
        }
      }
    } catch {
      setIsOffline(true);
      setIsMaintenance(false);
    } finally {
      checkingRef.current = false;
    }
  }, []);

  return (
    <MaintenanceContext.Provider value={{ isMaintenance, isOffline, setMaintenance, setOffline, checkHealth }}>
      {children}
    </MaintenanceContext.Provider>
  );
}

export const useMaintenance = () => useContext(MaintenanceContext);
