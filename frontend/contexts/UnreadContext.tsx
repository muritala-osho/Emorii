import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import socketService from '@/services/socket';
import { getApiBaseUrl } from '@/constants/config';
import { tokenManager } from '@/utils/tokenManager';

interface UnreadContextType {
  unreadCount: number;
  resetUnread: () => void;
  incrementUnread: () => void;
  unreadNotifCount: number;
  setUnreadNotifCount: (n: number) => void;
  refreshNotifCount: () => void;
  newMatchCount: number;
  resetMatchBadge: () => void;
  newProfileCount: number;
  resetProfileBadge: () => void;
}

const UnreadContext = createContext<UnreadContextType>({
  unreadCount: 0,
  resetUnread: () => {},
  incrementUnread: () => {},
  unreadNotifCount: 0,
  setUnreadNotifCount: () => {},
  refreshNotifCount: () => {},
  newMatchCount: 0,
  resetMatchBadge: () => {},
  newProfileCount: 0,
  resetProfileBadge: () => {},
});

/** Safely update the OS-level app icon badge (iOS + some Android launchers). */
function syncOsBadge(count: number) {
  if (Platform.OS === 'web') return;
  Notifications.setBadgeCountAsync(count).catch(() => {});
}

async function fetchUnreadByType(authToken: string, type: string): Promise<number> {
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/api/notifications/unread-count?type=${type}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return data.success && typeof data.count === 'number' ? data.count : 0;
  } catch {
    return 0;
  }
}

async function markTypeRead(authToken: string, type: string): Promise<void> {
  try {
    await fetch(`${getApiBaseUrl()}/api/notifications/mark-type-read`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type }),
    });
  } catch {}
}

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [newMatchCount, setNewMatchCount] = useState(0);
  const [newProfileCount, setNewProfileCount] = useState(0);

  const chatOpenRef = useRef(false);

  const incrementUnread = useCallback(() => {
    if (!chatOpenRef.current) {
      setUnreadCount(prev => {
        const next = prev + 1;
        syncOsBadge(next);
        return next;
      });
    }
  }, []);

  const resetUnread = useCallback(() => {
    setUnreadCount(0);
    syncOsBadge(0);
  }, []);

  (UnreadContext as any)._setChatOpen = (open: boolean) => {
    chatOpenRef.current = open;
    if (open) {
      setUnreadCount(0);
      syncOsBadge(0);
    }
  };

  const refreshNotifCount = useCallback(async () => {
    try {
      const authToken = await tokenManager.getAccessToken();
      if (!authToken) return;
      const res = await fetch(`${getApiBaseUrl()}/api/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && typeof data.count === 'number') {
        setUnreadNotifCount(data.count);
      }
    } catch {}
  }, []);

  const resetMatchBadge = useCallback(async () => {
    setNewMatchCount(0);
    try {
      const authToken = await tokenManager.getAccessToken();
      if (authToken) await markTypeRead(authToken, 'match');
    } catch {}
  }, []);

  const resetProfileBadge = useCallback(async () => {
    setNewProfileCount(0);
    try {
      const authToken = await tokenManager.getAccessToken();
      if (authToken) await markTypeRead(authToken, 'profile_view,super_like,verification');
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchInitialUnread = async () => {
      try {
        const authToken = await tokenManager.getAccessToken();
        if (!authToken) return;

        const [chatRes, notifRes, matchCount, profileCount] = await Promise.all([
          fetch(`${getApiBaseUrl()}/api/chat/unread-count`, {
            headers: { Authorization: `Bearer ${authToken}` },
          }).catch(() => null),
          fetch(`${getApiBaseUrl()}/api/notifications/unread-count`, {
            headers: { Authorization: `Bearer ${authToken}` },
          }).catch(() => null),
          fetchUnreadByType(authToken, 'match'),
          fetchUnreadByType(authToken, 'profile_view,super_like,verification'),
        ]);

        if (!cancelled && chatRes?.ok) {
          const data = await chatRes.json();
          if (data.success && typeof data.count === 'number') {
            setUnreadCount(data.count);
            syncOsBadge(data.count);
          }
        }
        if (!cancelled && notifRes?.ok) {
          const data = await notifRes.json();
          if (data.success && typeof data.count === 'number') {
            setUnreadNotifCount(data.count);
          }
        }
        if (!cancelled) {
          setNewMatchCount(matchCount);
          setNewProfileCount(profileCount);
        }
      } catch {
      }
    };

    fetchInitialUnread();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleNewMessage = (_message: any) => {
      incrementUnread();
    };

    socketService.onNewMessage(handleNewMessage);

    return () => {
      socketService.off('chat:new-message', handleNewMessage);
    };
  }, [incrementUnread]);

  return (
    <UnreadContext.Provider value={{
      unreadCount, resetUnread, incrementUnread,
      unreadNotifCount, setUnreadNotifCount, refreshNotifCount,
      newMatchCount, resetMatchBadge,
      newProfileCount, resetProfileBadge,
    }}>
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  return useContext(UnreadContext);
}

export function setChatScreenOpen(open: boolean) {
  const fn = (UnreadContext as any)._setChatOpen;
  if (typeof fn === 'function') fn(open);
}
