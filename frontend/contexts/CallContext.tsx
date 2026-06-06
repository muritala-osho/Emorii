import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

export type CallStatus = "connecting" | "ringing" | "connected" | "ended" | "failed" | "busy" | "declined" | "missed";
export type CallType = "voice" | "video";

export interface ActiveCallInfo {
  userId: string;
  userName: string;
  userPhoto?: string;
  isIncoming: boolean;
  callStatus: CallStatus;
  callType: CallType;
  duration: number;
}

interface CallContextValue {
  activeCall: ActiveCallInfo | null;
  isCallMinimized: boolean;
  isOnCallScreen: boolean;
  setActiveCall: (call: ActiveCallInfo | null) => void;
  updateCallStatus: (status: CallStatus) => void;
  startGlobalTimer: () => void;
  stopGlobalTimer: () => void;
  minimizeCall: () => void;
  maximizeCall: () => void;
  clearCall: () => void;
  setIsOnCallScreen: (value: boolean) => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [activeCall, setActiveCallState] = useState<ActiveCallInfo | null>(null);
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const [isOnCallScreen, setIsOnCallScreen] = useState(false);
  const globalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopGlobalTimer = useCallback(() => {
    if (globalTimerRef.current) {
      clearInterval(globalTimerRef.current);
      globalTimerRef.current = null;
    }
  }, []);

  const startGlobalTimer = useCallback(() => {
    stopGlobalTimer();
    globalTimerRef.current = setInterval(() => {
      setActiveCallState((prev) =>
        prev && prev.callStatus === "connected"
          ? { ...prev, duration: prev.duration + 1 }
          : prev
      );
    }, 1000);
  }, [stopGlobalTimer]);

  useEffect(() => {
    return () => stopGlobalTimer();
  }, [stopGlobalTimer]);

  const setActiveCall = useCallback((call: ActiveCallInfo | null) => {
    setActiveCallState(call);
    if (call) setIsCallMinimized(false);
    else stopGlobalTimer();
  }, [stopGlobalTimer]);

  const updateCallStatus = useCallback((status: CallStatus) => {
    setActiveCallState((prev) => prev ? { ...prev, callStatus: status } : null);
    if (status !== "connected") stopGlobalTimer();
  }, [stopGlobalTimer]);

  const minimizeCall = useCallback(() => setIsCallMinimized(true), []);
  const maximizeCall = useCallback(() => setIsCallMinimized(false), []);

  const clearCall = useCallback(() => {
    stopGlobalTimer();
    setActiveCallState(null);
    setIsCallMinimized(false);
  }, [stopGlobalTimer]);

  return (
    <CallContext.Provider value={{
      activeCall,
      isCallMinimized,
      isOnCallScreen,
      setActiveCall,
      updateCallStatus,
      startGlobalTimer,
      stopGlobalTimer,
      minimizeCall,
      maximizeCall,
      clearCall,
      setIsOnCallScreen,
    }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCallContext() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCallContext must be used inside CallProvider");
  return ctx;
}
