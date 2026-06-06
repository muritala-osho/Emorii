# Emorii

Emorii is a dating and social application for the African diaspora, connecting individuals through real-time chat, personalized icebreakers, and advanced user management.

## Run & Operate

**Required Env Vars (Backend)**
*   `FIREBASE_SERVICE_ACCOUNT`: Firebase Admin SDK JSON for Android FCM data messages.
*   `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY`: Apple APNs VoIP credentials for iOS CallKit.
*   `EXPO_ACCESS_TOKEN`: Expo push gateway auth (optional, prevents rate limiting).
*   `GOOGLE_SERVICE_ACCOUNT_JSON`: Google Play IAP receipt validation.
*   `APPLE_IAP_SHARED_SECRET`: Apple IAP receipt validation.
*   `GOOGLE_RTDN_TOKEN`: Optional, for Google Play RTDN webhook protection.
*   `SENTRY_DSN`: For backend Sentry error monitoring.

**Required Env Vars (Admin Dashboard)**
*   `VITE_SENTRY_DSN`: For admin dashboard Sentry error monitoring.

**Required Env Vars (Frontend)**
*   `EXPO_PUBLIC_API_URL`: Base URL for the backend API (`https://api.emorii.com`). Must be set in `frontend/.env`.

## Stack

*   **Backend**: Node.js, Express, MongoDB (Mongoose ORM), Socket.io, Redis (caching).
*   **Frontend**: Expo SDK 55, React Native 0.83, TypeScript, `@shopify/flash-list`, `react-native-callkeep`, `react-native-voip-push-notification`, `react-native-iap`, `lottie-react-native`.
*   **Admin Dashboard**: React 18, Vite, Tailwind CSS, Recharts, Lucide React, TypeScript.
*   **Build Tool**: Vite (Admin), Expo CLI (Frontend).

## Where things live

*   `/backend`: Node.js/Express API.
    *   `models/User.js`: User schema.
    *   `routes/auth.js`: Authentication logic.
    *   `routes/chat.js`: Chat API endpoints.
    *   `routes/admin.js`: Admin API endpoints.
    *   `public/agora-call.html`: Agora WebView bridge for calls.
    *   `utils/emailService.js`: Email templates and sending.
    *   `utils/fcmPush.js`: FCM push notification logic.
    *   `utils/pushNotifications.js`: Expo push notification logic.
    *   `utils/notificationLogger.js`: Logs all outgoing notifications.
    *   `utils/scheduledJobs.js`: Scheduled tasks (e.g., admin grant expiry warnings).
*   `/frontend`: Expo/React Native mobile app.
    *   `app.json`: Expo configuration and plugins.
    *   `constants/config.ts`: API base URL configuration.
    *   `hooks/useApi.ts`: API interception and 401 handling.
    *   `hooks/useAuth.tsx`: Auth context and discovery pre-fetch.
    *   `screens`: Main application screens (e.g., `DiscoveryScreen.tsx`, `ChatDetailScreen.tsx`).
    *   `services`: External service integrations (e.g., `iapService.ts`, `callkeep.ts`, `firebaseMessaging.ts`).
    *   `plugins`: Custom Expo plugins (e.g., `withCallKeep.js`).
*   `/admin-dashboard`: React admin dashboard.
    *   `views`: Admin specific views (e.g., `UserManagement.tsx`, `SentryMonitor.tsx`).
*   **DB Schema**: Defined in Mongoose models under `/backend/models`.
*   **API Contracts**: Implicitly defined by routes in `/backend/routes`.

## Architecture decisions

*   **Monorepo Structure**: Three independent applications (backend, frontend, admin) within a single repository for streamlined development.
*   **Refresh Token Rotation Removed**: Due to client-side persistence issues and complexity, refresh tokens are long-lived and non-rotating, mirroring standard first-party mobile app patterns. Server-side revocation mechanisms remain.
*   **Discovery Location Gating**: `/api/users/nearby` explicitly returns `requiresLocation: true` if no valid origin location is available, forcing a clear "enable location" UI on the client, rather than silently returning an unfiltered list.
*   **Chat Message Delivery & Read States**: `status: 'delivered'` is strictly defined as "message reached recipient's device," not just server persistence. Tick progression (sent → delivered → seen) is implemented with server-side logic and client-side rendering.
*   **Android CallKeep `selfManaged: true`**: Adopted to bypass Android's "Phone account" opt-in requirement for native call UI, using a high-priority full-screen intent notification instead.
*   **Expo-only Push Notifications**: `@notifee/react-native` and `@react-native-firebase/messaging` have been fully removed. All push notification delivery now goes exclusively through `expo-notifications`. The Firebase background message handler was intercepting FCM messages and routing through Notifee — when Notifee failed silently (manifest conflicts, foreground service type issues), messages were lost. Removing both libraries lets expo-notifications' own FCM service handle all delivery without interference. `notifeeService.ts` is retained as a no-op shim to preserve call-site compatibility.

## Product

*   **User Connection**: Dating and social features for the African diaspora.
*   **Real-time Communication**: Chat with rich media (voice notes, GIFs, photos) and real-time voice/video calls.
*   **Personalized Discovery**: Icebreakers and location-based matching.
*   **User Management & Moderation**: Admin dashboard for user, content, and verification management.
*   **Monetization**: In-app purchases for Premium features with robust subscription handling and webhooks.
*   **Notifications**: Comprehensive push notification system for chat, calls, and system events across platforms, including rich push and inline replies.
*   **Face Verification**: Liveness detection and admin-approved verification process to gate core features.
*   **Support System**: Integrated support ticket system with agent assignment and notification history.

## User preferences

I want iterative development. Ask before making major changes.

## Gotchas

*   **Frontend API URL**: `EXPO_PUBLIC_API_URL` must be set in `frontend/.env` and Metro restarted; no fallback exists.
*   **Firebase/Notifee Removed**: `@react-native-firebase/messaging`, `@react-native-firebase/app`, and `@notifee/react-native` have been fully removed from `package.json` and `app.json`. The `withFirebaseManifestFix.js`, `withFirebaseMessagingService.js`, and `withNotifeeManifest.js` plugin files still exist on disk but are no longer listed in `app.json` and are not loaded. A new EAS Build is required for native changes to take effect.
*   **Background Notification Task (Killed State)**: `expo-task-manager` is installed and `EMORII_INCOMING_CALL_TASK` is defined at the top level of `frontend/services/notifications.ts`. It writes `@afro_pending_call` to AsyncStorage whenever a call notification arrives while the app is killed. `Notifications.registerTaskAsync` is called inside `registerForPushNotificationsAsync` after permission is granted. IncomingCallHandler reads this key on mount and shows the ringing UI with Accept/Decline. On notification tap, `navigateFromNotification` no longer auto-routes to the call screen (which lacked Agora params); instead it triggers `__showIncomingCallFromFCM` (if app was backgrounded) or writes `__pendingVoipCall` + `@afro_pending_call` as a safety net for cold-start.
*   **Sentry Mobile Removal**: Sentry was fully removed from the mobile app. Re-enabling requires reinstalling `@sentry/react-native`, restoring the Expo plugin, and initializing Sentry in `index.js`.
*   **iOS Rich Push Notifications**: Currently, the iOS build does not ship a Notification Service Extension (NSE), so rich image pushes silently fall back to plain notifications. An NSE must be added to enable this feature.
*   **Agora Voice Call Mic Issue**: On Android, `MODE_IN_CALL` with `playThroughEarpieceAndroid: true` blocks mic capture in WebView. Ensure `playThroughEarpieceAndroid: false` is set when ringtone playback stops.

## Pointers

*   [Expo Documentation](https://docs.expo.dev/)
*   [React Native Documentation](https://reactnative.dev/docs/getting-started)
*   [MongoDB Documentation](https://www.mongodb.com/docs/)
*   [Socket.io Documentation](https://socket.io/docs/)
*   [Agora Documentation](https://docs.agora.io/en/)
*   [Firebase Documentation](https://firebase.google.com/docs/)
*   [Sentry Documentation](https://docs.sentry.io/)