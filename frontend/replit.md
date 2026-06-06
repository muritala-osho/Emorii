# Emorii - Dating App

## Overview
Emorii is a modern, location-based dating application built with React Native (Expo) for cross-platform mobile support. It allows users to discover potential matches through a swipe-based interface, engage in real-time chat, and connect based on shared interests, location proximity, and preferences. The platform features user authentication, profile management, matching algorithms, real-time messaging, and integrated video/audio calling. The project's ambition is to create a comprehensive and engaging dating experience with a focus on user verification and security.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework & Platform**: React Native with Expo SDK 54.
- **Navigation**: React Navigation v7 with native stack and bottom tab navigators.
- **State Management**: React Context API for authentication and global state; AsyncStorage for persistent client-side data.
- **UI/UX**: Custom themed components supporting light/dark mode, with consistent spacing, typography, and color tokens. AnimatedTabBar with Tinder coral pink accents.
- **Animations**: Reanimated v4 for smooth animations and gestures, including animated action buttons with haptic feedback.
- **Image Handling**: `expo-image` for optimized image loading and caching.
- **Core Features**:
    - **Photo Verification**: Multi-step process (ID scan, 3-pose selfie) with professional tips and progress tracking.
    - **Animated Verification Badge**: Subtle pulsing badge for verified users.
    - **Chat Features**: Message liking, photo comments modal, message replies, story reactions in chat.
    - **Profile & Discovery UI**: Enhanced profile image animations, improved discovery screen header, and visually prominent action buttons.
    - **Theme System**: `ThemeProvider` with light/dark/system support, persisted via AsyncStorage.
    - **Language System**: `LanguageProvider` supporting 12 African and international languages, with local persistence.
    - **Settings Screen**: Redesigned with card-based sections, theme/language selectors, in-app legal screens, and privacy controls.
    - **Welcome Screen**: Automated background slideshow with fading couple images and a dark overlay for readability.
    - **Admin Dashboard**: Accessible to admin users from settings, providing tools for user, report, verification, and content management.

### Backend Architecture
- **Framework**: Node.js with Express.js.
- **Database**: MongoDB with Mongoose ODM.
- **Authentication**: JWT-based token authentication with bcrypt for password hashing; Google OAuth integration.
- **Real-time Communication**: Socket.io for WebSockets (chat, presence, call signaling).
- **File Uploads**: Multer middleware for image uploads, integrated with Cloudinary.
- **Email**: Nodemailer for transactional emails (OTP, password resets, event reminders).
- **Core Models**: User, Match, Message, FriendRequest, CallHistory.
- **API Structure**: RESTful endpoints, protected by JWT middleware, with CORS enabled and centralized error handling.
- **Matching Algorithm**: Location-based filtering (haversine distance), age/gender preferences, shared interest scoring, swipe mechanics.
- **Security Measures**: Rate limiting for general API, authentication attempts, verification uploads, and chat messages.

### System Design Choices
- **Gateway Proxy Architecture**: Gateway server on port 5000 proxies `/api/*` and `/socket.io/*` to the Backend on port 3000, and other requests to Expo Web on port 19006.
- **Environment Configuration**: `.env` files for managing `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_REPLIT_DOMAIN` for different environments.
- **Performance & Stability**: Memoization of API functions using `useCallback` to prevent excessive re-renders, auth-aware data reloading, and optimized chat message pagination.
- **Verification System**: Verification photos uploaded to Cloudinary, URLs stored in user profiles, managed via `/api/verification` endpoint.
- **Real-time Features**: WebSocket connection on authentication for live typing indicators, online/offline presence, message delivery/read receipts, and call status updates.

## External Dependencies

### Third-Party Services
- **Cloudinary**: Image upload and CDN hosting for user and verification photos.
- **Agora SDK**: Real-time video and audio calling infrastructure.
- **MongoDB Atlas**: Cloud-hosted MongoDB database for production.

### Key Libraries
- **Socket.io Client/Server**: For real-time chat, presence, and call signaling.
- **expo-location**: Device GPS access for location-based features.
- **expo-image-picker**: Access to camera and photo library.
- **react-native-gesture-handler**: For swipe card mechanics and other gestures.
- **expo-haptics**: For tactile feedback.
- **expo-notifications**: Configured for push notifications (implementation pending).

### Development Environment
- **Replit**: Hosting platform for development.
- **Environment Variables**: Stored in `.env` for API keys and service credentials.