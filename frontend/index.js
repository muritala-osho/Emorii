import { registerRootComponent } from "expo";
import { AppRegistry, Platform } from 'react-native';

if (typeof global !== 'undefined') {
  global.Platform = Platform;
}

if (typeof global !== 'undefined' && global.ErrorUtils) {
  const _originalGlobalHandler = global.ErrorUtils.getGlobalHandler?.();
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    try {
      console.error(
        '[GlobalErrorHandler]',
        isFatal ? 'FATAL:' : 'Non-fatal:',
        error?.message || String(error),
        '\nStack:', error?.stack || '(no stack trace)',
      );
    } catch {}
    if (typeof _originalGlobalHandler === 'function') {
      _originalGlobalHandler(error, isFatal);
    }
  });
}

if (Platform.OS === 'android') {
  try {
    const { setupAndroidChannels } = require('@/services/notifications');
    setupAndroidChannels().catch((err) => {
      console.warn('[index.js] Early channel setup failed:', err?.message || err);
    });
  } catch (err) {
    console.warn('[index.js] Could not import setupAndroidChannels:', err?.message || err);
  }
}

import App from "@/App";

registerRootComponent(App);

if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('BackgroundCallTask', () => {
    return async (taskData) => {
      try {
        const { displayIncomingCall, initCallKeep } = require('@/services/callkeep');
        await initCallKeep('Emorii');
        const { callerId, callerName, callType } = taskData || {};
        if (callerId) {
          await displayIncomingCall(callerId, callerName || 'Unknown', callType === 'video');
          global.__pendingVoipCall = {
            callerId,
            callerName: callerName || 'Unknown',
            callType:   callType || 'voice',
            callData:   taskData?.callData || {},
          };
        }
      } catch (err) {
        console.error('[BackgroundCallTask] Error:', err);
      }
    };
  });
}
