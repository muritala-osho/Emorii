import logger from '@/utils/logger';

import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { getApiBaseUrl } from '@/constants/config';
import { useMaintenance } from '@/contexts/MaintenanceContext';
import { tokenManager } from '@/utils/tokenManager';

const getApiUrl = () => `${getApiBaseUrl()}/api`;

// ─── In-flight request deduplication ──────────────────────────────────────
// Module-level cache so it's shared across every component that calls
// useApi(). If two parts of the app fire the EXACT same GET (same URL, same
// auth token) at the same moment, the second caller waits on the first
// caller's network promise instead of hitting the backend twice.
//
// This is a safety net for things like a parent and child component both
// asking for the same data on mount, focus-effect refetches racing with
// initial-render fetches, or accidental React effect-loops. It only applies
// to GETs — methods with side-effects (POST/PUT/PATCH/DELETE) are never
// deduped.
const inflightGets = new Map<string, Promise<any>>();

function getDeviceHeaders(): Record<string, string> {
  const osName = Device.osName || (Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web');
  const osVersion = Device.osVersion || '';
  const model = Device.modelName || osName;
  const deviceName = osVersion ? `${model} · ${osName} ${osVersion}` : `${model} · ${osName}`;
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  return { 'x-device-name': deviceName, 'x-platform': platform };
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  [key: string]: any;
}

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadingRef = useRef(false);
  const errorRef   = useRef<string | null>(null);

  const { setMaintenance } = useMaintenance();

  const request = useCallback(async <T,>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> => {
    loadingRef.current = true;
    setLoading(true);
    errorRef.current = null;
    setError(null);

    try {
      const response = await fetch(`${getApiUrl()}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...getDeviceHeaders(),
          ...options.headers,
        },
      });

      if (response.status === 503) {
        const data = await response.json().catch(() => ({}));
        if (data.maintenance) {
          setMaintenance(true);
          const err = 'Platform is under maintenance.';
          setError(err);
          return { success: false, error: err, message: err };
        }
      }

      setMaintenance(false);

      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        const text = await response.text();
        logger.error('Non-JSON response received:', text.substring(0, 200));
        throw new Error('Server returned an invalid response. The backend might be down or restarting.');
      }

      const jsonData = await response.json();

      if (response.status === 401 && !endpoint.includes('/auth/')) {
        const newToken = await tokenManager.refresh();
        if (newToken) {
          const retryHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            ...getDeviceHeaders(),
            ...(options.headers as Record<string, string> || {}),
            Authorization: `Bearer ${newToken}`,
          };
          const retryResponse = await fetch(`${getApiUrl()}${endpoint}`, { ...options, headers: retryHeaders });

          if (retryResponse.status === 503) {
            const rb = await retryResponse.json().catch(() => ({}));
            if (rb.maintenance) {
              setMaintenance(true);
              const err = 'Platform is under maintenance.';
              errorRef.current = err; setError(err); loadingRef.current = false; setLoading(false);
              return { success: false, error: err, message: err };
            }
          }
          setMaintenance(false);
          const retryData = await retryResponse.json();
          if (!retryResponse.ok) throw new Error(retryData.message || 'API request failed');
          loadingRef.current = false; setLoading(false);
          const rd = retryData.data !== undefined ? retryData.data : retryData;
          return { success: retryData.success ?? true, data: rd as T, message: retryData.message };
        }
        const expiredMsg = 'Session expired. Please log in again.';
        errorRef.current = expiredMsg; setError(expiredMsg); loadingRef.current = false; setLoading(false);
        return { success: false, error: 'TOKEN_EXPIRED', message: expiredMsg };
      }

      if (!response.ok) {
        throw new Error(jsonData.message || 'API request failed');
      }

      loadingRef.current = false;
      setLoading(false);

      const responseData = jsonData.data !== undefined ? jsonData.data : jsonData;

      return {
        success: jsonData.success ?? true,
        data: responseData as T,
        message: jsonData.message,
      };
    } catch (err: any) {
      const errorMessage = err.message || 'Network error';
      errorRef.current = errorMessage;
      setError(errorMessage);
      loadingRef.current = false;
      setLoading(false);
      return { success: false, error: errorMessage, message: errorMessage };
    }
  }, [setMaintenance]);

  const get = useCallback(<T,>(endpoint: string, paramsOrToken?: Record<string, any> | string, token?: string) => {
    let url = endpoint;
    let authToken: string | undefined = token;

    if (typeof paramsOrToken === 'string') {
      authToken = paramsOrToken;
    } else if (paramsOrToken && typeof paramsOrToken === 'object' && Object.keys(paramsOrToken).length > 0) {
      const queryString = Object.entries(paramsOrToken)
        .filter(([_, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');
      url = `${endpoint}?${queryString}`;
    }

    // Coalesce identical in-flight GETs so a render loop or two components
    // mounting at once can't hammer the backend with the same request.
    const dedupeKey = `${url}::${authToken || ''}`;
    const existing = inflightGets.get(dedupeKey);
    if (existing) {
      return existing as Promise<ApiResponse<T>>;
    }

    const promise = request<T>(url, {
      method: 'GET',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    }).finally(() => {
      inflightGets.delete(dedupeKey);
    });

    inflightGets.set(dedupeKey, promise);
    return promise;
  }, [request]);

  const post = useCallback(<T,>(endpoint: string, body: any, token?: string) => {
    return request<T>(endpoint, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    });
  }, [request]);

  const put = useCallback(<T,>(endpoint: string, body: any, token?: string) => {
    return request<T>(endpoint, {
      method: 'PUT',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    });
  }, [request]);

  const patch = useCallback(<T,>(endpoint: string, body: any, token?: string) => {
    return request<T>(endpoint, {
      method: 'PATCH',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    });
  }, [request]);

  const del = useCallback(<T,>(endpoint: string, token?: string, body?: any) => {
    return request<T>(endpoint, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }, [request]);

  return { get, post, put, patch, del, loading, error };
}
