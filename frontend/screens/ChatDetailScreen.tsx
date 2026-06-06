import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScreenErrorFallback } from "@/components/ScreenErrorFallback";
import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Dimensions,
  Keyboard,
  ScrollView,
  ImageBackground,
  Animated,
  PanResponder,
  Linking,
  DeviceEventEmitter,
  AppState,
  AppStateStatus,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { reverseGeocode } from "@/utils/geocode";
import { startLiveLocationShare, stopLiveLocationShare, isSharingLive } from "@/utils/liveLocationShare";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { Audio, Video, ResizeMode } from "../utils/expoAvCompat";
import { useApi } from "@/hooks/useApi";
import { KeyboardAvoidingView as KAVController } from "react-native-keyboard-controller";
import socketService from "@/services/socket";
import { getPhotoSource } from "@/utils/photos";
import { getApiBaseUrl } from "@/constants/config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadCachedMessages, saveCachedMessages, mergeMessages } from "@/services/chatCache";
import {
  enqueue,
  dequeue,
  getPendingQueue,
  incrementRetry,
  MAX_RETRIES,
} from "@/services/messageQueue";
import * as ScreenCapture from "expo-screen-capture";
import { useFocusEffect } from "@react-navigation/native";
import { setChatScreenOpen } from "@/contexts/UnreadContext";
import { clearConversationThread, setActiveChatMatchId } from "@/services/notifeeService";
import { VerificationBadge } from "@/components/VerificationBadge";
import SwipeableMessage from "@/components/chat/SwipeableMessage";
import ChatHeader from "@/components/chat/ChatHeader";
import AttachmentMenu from "@/components/chat/AttachmentMenu";
import LiveLocationPicker from "@/components/chat/LiveLocationPicker";
import OptionsMenu from "@/components/chat/OptionsMenu";
import ChatThemeModal from "@/components/chat/ChatThemeModal";
import ReportModal from "@/components/chat/ReportModal";
import VideoViewerModal from "@/components/chat/VideoViewerModal";
import ImageViewerModal from "@/components/chat/ImageViewerModal";
import MessageContextMenu from "@/components/chat/MessageContextMenu";
import EditMessageModal from "@/components/chat/EditMessageModal";
import TranslateModal from "@/components/chat/TranslateModal";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { scanForSensitiveInfo, showPersonalInfoWarning } from "@/utils/securityWarnings";
import WavyWaveform from "@/components/chat/WavyWaveform";
import { LinearGradient } from "expo-linear-gradient";
import { Message, MessageReaction } from "@/types/chat";
import { EMOJI_LIST, REPORT_REASONS, CHAT_THEMES, AI_SUGGESTIONS } from "@/constants/chatConstants";
import logger from "@/utils/logger";
import ZoomablePhoto from "@/components/ZoomablePhoto";
import { formatMessageTime, formatDateHeader } from "@/utils/formatters";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

type ChatDetailScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "ChatDetail"
>;
type ChatDetailScreenRouteProp = RouteProp<RootStackParamList, "ChatDetail">;

interface ChatDetailScreenProps {
  navigation: ChatDetailScreenNavigationProp;
  route: ChatDetailScreenRouteProp;
}




function ChatDetailScreen({
  navigation,
  route,
}: ChatDetailScreenProps) {
  const {
    theme,
    isDark,
    setThemeMode,
    chatBubbleStyle,
    hapticFeedback: hapticEnabled,
  } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { userId = "", userName = "", userPhoto, matchId: matchIdFromParam } = (route.params as any) || {};
  const { get, post, put, patch } = useApi();

  const myId = useMemo(() => (user as any)?._id || user?.id || "", [user]);
  const isPremium = !!user?.premium?.isActive;
  // Keep a ref so loadChat's useCallback doesn't need `user` in its dep array,
  // which would cause the entire chat to reload on every profile update.
  const isPremiumRef = useRef(isPremium);
  useEffect(() => { isPremiumRef.current = isPremium; }, [isPremium]);

  const [message, setMessage] = useState("");
  const [hasMessage, setHasMessage] = useState(false);
  // Keep `hasMessage` in lock-step with the input from every code path
  // (typing, drafts, icebreakers, emoji picker, send-clear, etc.).
  // The boolean is what drives the send/mic swap, so isolating it
  // from `message` lets the memoized swap re-render only when needed
  // and keeps the toggle visually instant.
  useEffect(() => {
    const next = message.trim().length > 0;
    setHasMessage((prev) => (prev === next ? prev : next));
  }, [message]);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const [isOffline, setIsOffline] = useState(false);
  const cacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(matchIdFromParam || null);
  const [isTyping, setIsTyping] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const inputPaddingAnim = useRef(new Animated.Value(Math.max(insets.bottom, 4))).current;
  const [isOtherRecording, setIsOtherRecording] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [otherUserVerified, setOtherUserVerified] = useState(false);
  const [lastSeenDate, setLastSeenDate] = useState<Date | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messageSkip, setMessageSkip] = useState(0);
  // True once the user has scrolled away from the latest message. Drives the
  // floating "scroll to bottom" pill — we only show it while the user is
  // actively reading older history.
  const [showScrollToBottomFab, setShowScrollToBottomFab] = useState(false);
  // How many new messages have arrived while the user was reading older
  // history. Shown as a badge on the floating button and reset when the user
  // taps it (or scrolls back to the bottom themselves).
  const [historyUnreadCount, setHistoryUnreadCount] = useState(0);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [isSendingLocation, setIsSendingLocation] = useState(false);
  const [showLivePicker, setShowLivePicker] = useState(false);
  const [, setLiveTick] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [icebreakerPopup, setIcebreakerPopup] = useState<string | null>(null);
  const [icebreakerDismissed, setIcebreakerDismissed] = useState<boolean | null>(null);
  const icebreakerSlide = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const [selectedReportReason, setSelectedReportReason] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportTargetMessage, setReportTargetMessage] = useState<Message | null>(null);

  const [chatTheme, setChatTheme] = useState<string>("default");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>(AI_SUGGESTIONS);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const playingAudioIdRef = useRef<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const playbackRateRef = useRef<number>(1);
  const [playedAudioIds, setPlayedAudioIds] = useState<Set<string>>(new Set());
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingPreview, setRecordingPreview] = useState<{ uri: string; duration: number } | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [imageGallery, setImageGallery] = useState<string[]>([]);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  const [imageViewerZoomed, setImageViewerZoomed] = useState(false);
  const imageViewerListRef = useRef<FlatList<string>>(null);
  const [viewingVideo, setViewingVideo] = useState<string | null>(null);
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());

  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showTranslateModal, setShowTranslateModal] = useState(false);
  const [translatedText, setTranslatedText] = useState("");
  const [savedTranslateLang, setSavedTranslateLang] = useState("");
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(false);
  const [translatingMessageIds, setTranslatingMessageIds] = useState<Set<string>>(new Set());
  const [autoTranslatedMessages, setAutoTranslatedMessages] = useState<Record<string, string>>({});
  const autoTranslatingRef = React.useRef<Set<string>>(new Set());
  const [showingOriginal, setShowingOriginal] = useState<Set<string>>(new Set());
  const [showEditModal, setShowEditModal] = useState(false);
  const [editText, setEditText] = useState("");
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateTargetLang, setTranslateTargetLang] = useState("");
  const [screenshotProtection, setScreenshotProtection] = useState(false);
  const [viewOnceMode, setViewOnceMode] = useState(false);
  const viewOnceModeRef = React.useRef(false);
  const [viewOnceSent, setViewOnceSent] = useState(false);
  const [openedViewOnceIds, setOpenedViewOnceIds] = useState<Set<string>>(new Set());
  const [viewOnceViewerActive, setViewOnceViewerActive] = useState(false);
  const viewOnceTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const [viewOnceCountdown, setViewOnceCountdown] = useState(10);
  const viewOnceCountdownRef = React.useRef<NodeJS.Timeout | null>(null);

  /* Clean up view-once timers on unmount */
  useEffect(() => {
    return () => {
      if (viewOnceTimerRef.current) clearTimeout(viewOnceTimerRef.current);
      if (viewOnceCountdownRef.current) clearInterval(viewOnceCountdownRef.current);
    };
  }, []);

  
  const setViewOnceModeSync = (val: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof val === 'function' ? val(viewOnceModeRef.current) : val;
    viewOnceModeRef.current = next;
    setViewOnceMode(next);
  };

  useEffect(() => {
    const loadDraft = async () => {
      if (!userId) return;
      try {
        const [savedDraft, savedLang, savedPlayed, savedRate, savedAutoTranslate] = await Promise.all([
          AsyncStorage.getItem(`chat_draft_${userId}`),
          AsyncStorage.getItem("@emorii_translate_lang"),
          AsyncStorage.getItem(`played_audio_${userId}`),
          AsyncStorage.getItem("@emorii_audio_rate"),
          AsyncStorage.getItem(`@emorii_auto_translate_${userId}`),
        ]);
        if (savedDraft) setMessage(savedDraft);
        if (savedLang) setSavedTranslateLang(savedLang);
        if (savedAutoTranslate === "true") setAutoTranslateEnabled(true);
        // After AsyncStorage, sync with server to handle cross-device state
        if (token) {
          get<{ success: boolean; autoTranslate: boolean; preferredLanguage: string }>(
            '/users/me/translation-settings', token
          ).then(res => {
            if (!res.success || !res.data) return;
            if (res.data.autoTranslate !== undefined) {
              setAutoTranslateEnabled(res.data.autoTranslate);
              AsyncStorage.setItem(`@emorii_auto_translate_${userId}`, res.data.autoTranslate ? 'true' : 'false').catch(() => {});
            }
            if (res.data.preferredLanguage) {
              setSavedTranslateLang(res.data.preferredLanguage);
              AsyncStorage.setItem('@emorii_translate_lang', res.data.preferredLanguage).catch(() => {});
            } else if (res.data.autoTranslate) {
              setSavedTranslateLang(prev => {
                if (prev) return prev;
                const deviceLang = Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0] || 'en';
                AsyncStorage.setItem('@emorii_translate_lang', deviceLang).catch(() => {});
                return deviceLang;
              });
            }
          }).catch(() => {});
        }
        if (savedPlayed) {
          try { setPlayedAudioIds(new Set(JSON.parse(savedPlayed))); } catch (_) {}
        }
        if (savedRate) {
          const r = parseFloat(savedRate);
          if (!isNaN(r) && [1, 1.5, 2].includes(r)) {
            setPlaybackRate(r);
            playbackRateRef.current = r;
          }
        }
      } catch (error) {
        logger.error("Failed to load draft:", error);
      }
    };
    loadDraft();
  }, [userId]);

  const markAudioPlayed = (messageId: string) => {
    setPlayedAudioIds((prev) => {
      if (prev.has(messageId)) return prev;
      const next = new Set(prev);
      next.add(messageId);
      if (userId) AsyncStorage.setItem(`played_audio_${userId}`, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  };

  const togglePlaybackSpeed = async () => {
    const order = [1, 1.5, 2];
    const idx = order.indexOf(playbackRateRef.current);
    const next = order[(idx + 1) % order.length];
    playbackRateRef.current = next;
    setPlaybackRate(next);
    AsyncStorage.setItem("@emorii_audio_rate", String(next)).catch(() => {});
    try {
      if (soundRef.current) {
        await soundRef.current.setRateAsync(next, true);
      }
      if (htmlAudioRef.current) {
        htmlAudioRef.current.playbackRate = next;
      }
    } catch (e) { logger.log("setRate error", e); }
  };

  const openImageViewer = (url: string) => {
    const list = (messagesRef.current || [])
      .filter((m: any) => m.type === "image" && m.imageUrl)
      .map((m: any) => m.imageUrl as string);
    const idx = Math.max(0, list.findIndex((u) => u === url));
    setImageGallery(list.length ? list : [url]);
    setImageViewerIndex(idx);
    setImageViewerZoomed(false);
    setViewingImage(url);
  };

  const closeImageViewer = () => {
    setViewingImage(null);
    setImageGallery([]);
    setImageViewerIndex(0);
    setImageViewerZoomed(false);
  };

  const seekAudio = async (fraction: number) => {
    try {
      if (soundRef.current) {
        const status: any = await soundRef.current.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          await soundRef.current.setPositionAsync(Math.floor(status.durationMillis * fraction));
          setAudioProgress(fraction);
        }
      } else if (htmlAudioRef.current && htmlAudioRef.current.duration) {
        htmlAudioRef.current.currentTime = htmlAudioRef.current.duration * fraction;
        setAudioProgress(fraction);
      }
    } catch (e) { logger.log("seek error", e); }
  };

  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlashList<any>>(null);
  const isNearBottomRef = useRef(true);
  // Tracks whether we've completed the first scroll-to-latest after the chat
  // opened. Until this is true, every layout/content-size pass force-snaps to
  // the newest message so the chat never opens on an older bubble.
  const initialScrollDoneRef = useRef(false);
  // Helper that reliably scrolls the FlashList to the newest message at the
  // bottom of the chat (chronological list — newest is the last item). Uses
  // requestAnimationFrame plus a few staggered retries to survive slow layout
  // passes / FlashList's async measurement on lower-end devices and on web.
  const scrollToBottom = useCallback((animated: boolean = true) => {
    // Two-phase scroll: one immediate rAF (for the common case where layout
    // is already settled) and one short backstop at 250ms (for FlashList's
    // async measurement on slower devices). The previous 4-stage staggered
    // version (80/250/600ms) caused visible "jitter" on Android during
    // rapid message bursts because each timeout would re-snap the list.
    const doScroll = () => {
      try { flatListRef.current?.scrollToEnd({ animated }); } catch {}
    };
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(doScroll);
    } else {
      doScroll();
    }
    setTimeout(doScroll, 250);
  }, []);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Throttle outgoing typing emits to once per 2s, and remember whether we
  // currently have an "I'm typing" state on the wire so we can send a final
  // `isTyping:false` when the user pauses or sends.
  const lastTypingSentRef = useRef<number>(0);
  const typingStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isCurrentlyTypingRef = useRef<boolean>(false);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingDurationRef = useRef<number>(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const htmlAudioRef = useRef<any>(null);
  const sendMessageRef = useRef<any>(null);
  const recentlyWarnedTextRef = useRef<string>("");
  const matchIdRef = useRef<string | null>(matchIdFromParam || null);
  // Internal gate to prevent double-sends. Separate from the `sending` UI
  // state so the button can reset immediately (WhatsApp-style) while the
  // HTTP request is still in flight.
  const isSendingInFlightRef = useRef(false);

  const [typingDotAnim1] = useState(new Animated.Value(0));
  const [typingDotAnim2] = useState(new Animated.Value(0));
  const [typingDotAnim3] = useState(new Animated.Value(0));
  const [recordingPulse] = useState(new Animated.Value(1));

  useFocusEffect(
    useCallback(() => {
      setChatScreenOpen(true);
      // Tell notifeeService which conversation is open so it skips posting
      // notification banners for messages the user is already reading live.
      // matchIdRef holds the current matchId even before state re-renders.
      if (matchIdRef.current) setActiveChatMatchId(matchIdRef.current);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
      return () => {
        clearTimeout(timer);
        setChatScreenOpen(false);
        setActiveChatMatchId(null);
      };
    }, [])
  );

  useEffect(() => {
    if (isTyping) {
      const createDotAnimation = (anim: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
          ]),
        );
      const a1 = createDotAnimation(typingDotAnim1, 0);
      const a2 = createDotAnimation(typingDotAnim2, 150);
      const a3 = createDotAnimation(typingDotAnim3, 300);
      a1.start(); a2.start(); a3.start();
      return () => {
        a1.stop(); a2.stop(); a3.stop();
        typingDotAnim1.setValue(0); typingDotAnim2.setValue(0); typingDotAnim3.setValue(0);
      };
    }
  }, [isTyping]);

  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(recordingPulse, { toValue: 1.4, duration: 600, useNativeDriver: true }),
          Animated.timing(recordingPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => { pulse.stop(); recordingPulse.setValue(1); };
    }
  }, [isRecording]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(inputPaddingAnim, {
        toValue: 4,
        duration: Platform.OS === "ios" ? (e.duration || 250) : 80,
        useNativeDriver: false,
      }).start();
      // When the keyboard opens the viewport shrinks — scroll to the newest
      // message so it isn't hidden behind the keyboard.
      if (isNearBottomRef.current) scrollToBottom(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(inputPaddingAnim, {
        toValue: Math.max(insets.bottom, 4),
        duration: Platform.OS === "ios" ? (e.duration || 250) : 80,
        useNativeDriver: false,
      }).start();
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, [insets.bottom]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const vv = typeof window !== "undefined" ? (window as any).visualViewport : null;
    if (!vv) return;
    const handleResize = () => {
      const kbHeight = Math.max(0, window.innerHeight - vv.height);
      if (kbHeight > 50 && isNearBottomRef.current) scrollToBottom(true);
    };
    vv.addEventListener("resize", handleResize);
    vv.addEventListener("scroll", handleResize);
    return () => { vv.removeEventListener("resize", handleResize); vv.removeEventListener("scroll", handleResize); };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(`chat_theme_${userId}`)
      .then((v) => { if (v) setChatTheme(v); })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    let subscription: ScreenCapture.Subscription | null = null;
    const setupListener = async () => {
      if (Platform.OS !== "web") {
        try {
          subscription = ScreenCapture.addScreenshotListener(async () => {
            if (!screenshotProtection && matchIdRef.current && token) {
              const systemMsg = {
                _id: `screenshot_${Date.now()}`,
                content: "📸 A screenshot was taken!",
                type: "system",
                sender: myId,
                matchId: matchIdRef.current,
                createdAt: new Date().toISOString(),
                status: "sent",
              };
              setMessages((prev) => [...prev, systemMsg as any]);
              post(`/chat/${matchIdRef.current}/message`, { content: "📸 A screenshot was taken!", type: "system" }, token).catch(() => {});
            }
          });
          if (screenshotProtection) {
            await ScreenCapture.preventScreenCaptureAsync();
          } else {
            await ScreenCapture.allowScreenCaptureAsync();
          }
        } catch (e) {
          logger.log("Screenshot listener error:", e);
        }
      }
    };
    setupListener();
    return () => {
      if (subscription) subscription.remove();
      if (Platform.OS !== "web" && !screenshotProtection) {
        try { ScreenCapture.allowScreenCaptureAsync(); } catch (e) {}
      }
    };
  }, [screenshotProtection, user, matchId]);

  useEffect(() => {
    if (!matchId) return;
    const handleProtectionUpdate = (data: any) => {
      if (data.chatId === matchId) {
        setScreenshotProtection(data.enabled);
        if (Platform.OS !== "web") {
          try {
            if (data.enabled) ScreenCapture.preventScreenCaptureAsync();
            else ScreenCapture.allowScreenCaptureAsync();
          } catch (e) {}
        }
      }
    };
    socketService.on("chat:screenshot-protection-updated", handleProtectionUpdate);
    return () => socketService.off("chat:screenshot-protection-updated", handleProtectionUpdate);
  }, [matchId, myId, userName]);

  const toggleScreenshotProtection = useCallback(async () => {
    const newValue = !screenshotProtection;
    setScreenshotProtection(newValue);
    if (Platform.OS !== "web") {
      try {
        if (newValue) await ScreenCapture.preventScreenCaptureAsync();
        else await ScreenCapture.allowScreenCaptureAsync();
      } catch (e) {}
    }
    if (matchId) {
      socketService.emit("chat:screenshot-protection", { chatId: matchId, enabled: newValue, userId: myId });
    }
    Alert.alert(
      newValue ? "Screenshot Protection On" : "Screenshot Protection Off",
      newValue ? "Screenshots and screen recording are now blocked for both users in this chat." : "Screenshot protection has been disabled for this chat.",
    );
  }, [screenshotProtection, matchId, myId]);

  const saveChatTheme = async (themeId: string) => {
    setChatTheme(themeId);
    await AsyncStorage.setItem(`chat_theme_${userId}`, themeId);
    setShowThemeModal(false);
  };

  const getStatusText = useCallback(() => {
    if (isOtherRecording) return "recording voice...";
    if (isTyping) return "typing...";
    if (isOnline) return "Online";
    if (!lastSeenDate) return "Offline";
    const now = new Date();
    const diffMs = now.getTime() - lastSeenDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return lastSeenDate.toLocaleDateString();
  }, [isOnline, isTyping, isOtherRecording, lastSeenDate]);

  useEffect(() => {
    if (!userId) return;
    const handleUserStatus = (data: any) => {
      if (data.userId === userId) {
        const online = data.isOnline === true || data.status === "online";
        setIsOnline(online);
        if (!online) setLastSeenDate(new Date());
      }
    };
    socketService.onUserStatus(handleUserStatus);
    return () => socketService.off("user:status", handleUserStatus);
  }, [userId]);

  const handleVoiceCall = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("VoiceCall" as any, { userId, userName, userPhoto });
  }, [navigation, userId, userName, userPhoto]);

  const handleVideoCall = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("VideoCall" as any, { userId, userName, userPhoto });
  }, [navigation, userId, userName, userPhoto]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // ─── OFFLINE-FIRST ───────────────────────────────────────────────────────
  // Immediately hydrate the message list from the local AsyncStorage cache the
  // moment the screen mounts — before any network call is made.  This ensures
  // chat history is visible even when the device is fully offline, and removes
  // the dependency on user-profile data for the initial render.
  useEffect(() => {
    let cancelled = false;
    const earlyLoad = async () => {
      // 1. Determine the matchId we can use right now (no network needed).
      let knownMatchId: string | null = matchIdFromParam || null;
      if (!knownMatchId && userId) {
        // Fall back to the matchId we persisted last time this conversation
        // was opened successfully (covers navigating from the Chats list).
        const stored = await AsyncStorage.getItem(`chat_matchid_${userId}`).catch(() => null);
        if (stored) knownMatchId = stored;
      }
      if (!knownMatchId || cancelled) return;

      // 2. Sync state so socket / send logic can use the matchId immediately.
      if (!matchIdRef.current) {
        setMatchId(knownMatchId);
        matchIdRef.current = knownMatchId;
      }

      // 3. Load cache and render it — this is instant, zero network.
      const cached = await loadCachedMessages(knownMatchId);
      if (!cancelled && cached.length > 0) {
        setMessages(cached);
        setLoading(false);   // cache is enough — hide the spinner right away
      }
    };
    earlyLoad();
    return () => { cancelled = true; };
  }, []); // intentionally empty — runs exactly once on mount
  // ─────────────────────────────────────────────────────────────────────────

  const loadChat = useCallback(async () => {
    if (!token) return;
    // Only show the blocking spinner when we have nothing cached yet.
    // If the early-load effect already populated messages, skip the spinner
    // so the user continues reading while the network sync runs in the background.
    if (messagesRef.current.length === 0) setLoading(true);
    try {
      const matchesResponse = await get<{ matches: any[] }>("/match/my-matches", token);
      if (matchesResponse.success && matchesResponse.data) {
        // When a matchId was passed via the notification deep-link, use it as
        // the primary key so the exact conversation opens — this handles the
        // edge case where the same two users have more than one Match document.
        let match = matchesResponse.data.matches.find((m: any) => {
          const mId = String(m._id || m.id || '');
          if (matchIdFromParam && mId === String(matchIdFromParam)) return true;
          return (
            !matchIdFromParam &&
            m.users.some((u: any) => u._id === userId || u.id === userId)
          );
        });

        // If no match exists and the current user is premium, initiate a direct
        // message conversation (premium feature: message anyone without matching).
        if (!match && !matchIdFromParam && userId && isPremiumRef.current) {
          try {
            const directRes = await post<{ matchId: string }>(
              "/chat/direct/initiate",
              { recipientId: userId },
              token,
            );
            if (directRes.success && directRes.data?.matchId) {
              const mId = directRes.data.matchId;
              setMatchId(mId);
              matchIdRef.current = mId;
              const messagesResponse = await get<{ messages: Message[]; pagination: any }>(
                `/chat/${mId}?limit=1000`,
                token,
              );
              if (messagesResponse.success && messagesResponse.data) {
                setMessages(messagesResponse.data.messages || []);
                const pagination = messagesResponse.data.pagination;
                if (pagination) {
                  setHasMoreMessages(pagination.hasMore);
                  setMessageSkip(pagination.limit);
                }
              }
              put(`/chat/${mId}/read`, {}, token).catch(() => {});
              setLoading(false);
              return;
            }
          } catch (directErr) {
            logger.error("Direct initiate error:", directErr);
          }
        }

        if (match) {
          const mId = match._id || match.id;
          setMatchId(mId);
          matchIdRef.current = mId;
          // Persist the resolved matchId so the offline-first early-load effect
          // can hydrate the cache on the next open without a network call.
          if (userId) AsyncStorage.setItem(`chat_matchid_${userId}`, mId).catch(() => {});

          if (match.screenshotProtection) {
            setScreenshotProtection(true);
            if (Platform.OS !== "web") {
              try { await ScreenCapture.preventScreenCaptureAsync(); } catch (e) {}
            }
          }
          const otherUser = match.users.find((u: any) => u._id === userId || u.id === userId);
          if (otherUser) {
            setIsOnline(otherUser.onlineStatus === "online" || false);
            setOtherUserVerified(otherUser.verified || false);
            if (otherUser.lastActive) setLastSeenDate(new Date(otherUser.lastActive));
          }

          // Use whatever is already in memory (from the offline-first early-load
          // effect) as our merge base.  Only read AsyncStorage when the early-load
          // had nothing to show (e.g. brand-new conversation, first device open).
          const alreadyLoaded = messagesRef.current;
          let localCached: Message[];
          if (alreadyLoaded.length > 0) {
            localCached = alreadyLoaded;
          } else {
            localCached = await loadCachedMessages(mId);
            if (localCached.length > 0) {
              setMessages(localCached);
              setLoading(false);
            }
          }

          const messagesResponse = await get<{ messages: Message[]; pagination: any }>(
            `/chat/${mId}?limit=1000`,
            token,
          );
          if (messagesResponse.success && messagesResponse.data) {
            const fetched = messagesResponse.data.messages || [];
            setMessages(mergeMessages(localCached, fetched));
            const pagination = messagesResponse.data.pagination;
            if (pagination) {
              setHasMoreMessages(pagination.hasMore);
              setMessageSkip(pagination.limit);
            }
          }

          put(`/chat/${mId}/read`, {}, token).catch(() => {});

          // Force the chat to open on the newest message. We reset the
          // "initial scroll done" flag so onContentSizeChange / onLayout will
          // keep re-snapping to the end of the list (newest message at the
          // bottom) until the latest message is actually on screen.
          initialScrollDoneRef.current = false;
          isNearBottomRef.current = true;
          scrollToBottom(false);
        }
      }
    } catch (error) {
      logger.error("Chat load error:", error);
      // If the network call fails (offline or server error), the early-load
      // effect will have already shown cached messages — just surface the
      // offline banner and stop blocking the UI.
      setIsOffline(true);
    } finally {
      setLoading(false);
    }
  }, [token, userId, get, post, put]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  const processQueue = useCallback(async () => {
    if (!token) return;
    const queue = await getPendingQueue();
    if (queue.length === 0) return;
    let wentOnline = false;
    for (const queued of queue) {
      try {
        const response = await post<{ message: Message }>(
          `/chat/${queued.matchId}/message`,
          {
            content: queued.content,
            type: queued.type,
            localId: queued.localId,
            ...(queued.replyTo ? { replyTo: queued.replyTo } : {}),
            ...(queued.extraData || {}),
          },
          token,
        );
        if (response.success && response.data?.message) {
          const serverMsg = response.data.message as any;
          await dequeue(queued.localId);
          wentOnline = true;
          setMessages((prev) =>
            prev.map((m) =>
              (m as any).localId === queued.localId
                ? { ...serverMsg, status: "sent", localId: queued.localId }
                : m,
            ),
          );
        }
      } catch {
        const retries = await incrementRetry(queued.localId);
        if (retries >= MAX_RETRIES) {
          await dequeue(queued.localId);
          setMessages((prev) =>
            prev.map((m) =>
              (m as any).localId === queued.localId
                ? ({ ...m, status: "failed" } as any)
                : m,
            ),
          );
        }
      }
    }
    if (wentOnline) setIsOffline(false);
  }, [token, post]);

  useEffect(() => {
    processQueue();
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        processQueue();
        setIsOffline(false);
      }
    });
    return () => sub.remove();
  }, [processQueue]);

  useEffect(() => {
    if (!matchId || messages.length === 0) return;
    if (cacheTimerRef.current) clearTimeout(cacheTimerRef.current);
    cacheTimerRef.current = setTimeout(() => {
      saveCachedMessages(matchId, messagesRef.current);
    }, 2000);
    return () => {
      if (cacheTimerRef.current) clearTimeout(cacheTimerRef.current);
    };
  }, [messages, matchId]);

  const loadMoreMessages = useCallback(async () => {
    if (!matchId || !token || loadingMore || !hasMoreMessages) return;
    setLoadingMore(true);
    try {
      const response = await get<{ messages: Message[]; pagination: any }>(
        `/chat/${matchId}?limit=500&skip=${messageSkip}`,
        token,
      );
      if (response.success && response.data) {
        const older = response.data.messages || [];
        setMessages((prev) => [...older, ...prev]);
        const pagination = response.data.pagination;
        if (pagination) {
          setHasMoreMessages(pagination.hasMore);
          setMessageSkip((prev) => prev + older.length);
        }
      }
    } catch (error) {
      logger.error("Load more error:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [matchId, token, loadingMore, hasMoreMessages, messageSkip, get]);

  useEffect(() => {
    if (!matchId) return;

    DeviceEventEmitter.emit("chat:read-local", matchId);
    socketService.joinChat(matchId);
    socketService.markMessagesRead({ chatId: matchId, userId: myId });
    clearConversationThread(matchId);
    // matchId may resolve after the screen is already focused (loadChat is async).
    // Update the active-chat tracker now so any FCM messages that arrive after
    // this point are suppressed for this conversation.
    setActiveChatMatchId(matchId);

    const handleNewMessage = (data: any) => {
      const msg = data.message || data;
      const msgMatchId = data.matchId || msg.matchId;
      if (
        String(msgMatchId) !== String(matchId) &&
        String(msg.matchId) !== String(matchId)
      ) return;

      const senderId = typeof msg.sender === "string" ? msg.sender : msg.sender?._id;
      if (String(senderId) === String(myId)) return; // ignore own echo

      let isDuplicate = false;
      setMessages((prev) => {
        if (prev.some((m) => m._id === msg._id)) {
          isDuplicate = true;
          return prev;
        }
        return [...prev, msg];
      });
      if (isDuplicate) return;

      // WhatsApp behaviour:
      //  - If the user is already reading the bottom of the chat, auto-scroll
      //    to the new message so they see it instantly.
      //  - If the user has scrolled up to read older history, DO NOT yank
      //    them down. Instead, bump the unread badge on the floating
      //    "scroll to bottom" pill so they can tap it when they're ready.
      if (isNearBottomRef.current) {
        scrollToBottom(true);
      } else {
        setHistoryUnreadCount((c) => c + 1);
        setShowScrollToBottomFab(true);
      }

      socketService.markMessagesRead({ chatId: matchId, userId: myId, messageId: msg._id });
      put(`/chat/${matchId}/read`, {}, token || "").catch(() => {});
      DeviceEventEmitter.emit("chat:read-local", matchId);
    };

    const handleMessageDelivered = (data: any) => {
      if (!data.messageId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m._id === data.messageId && m.status === "sent"
            ? { ...m, status: "delivered" }
            : m,
        ),
      );
    };

    const handleMessagesRead = (data: any) => {
      const msgMatchId = data.matchId || data.chatId || data.roomId;
      const readByUserId = data.userId || data.readBy;

      if (!readByUserId || String(readByUserId) === String(myId)) return;

      const matchesByRoom = msgMatchId && msgMatchId === matchId;
      const matchesByUser = String(readByUserId) === String(userId);
      if (!matchesByRoom && !matchesByUser) return;

      const readAtIso =
        data.readAt || data.seenAt || new Date().toISOString();

      setMessages((prev) =>
        prev.map((m) => {
          const senderId = typeof m.sender === "string" ? m.sender : m.sender?._id;
          if (String(senderId) === String(myId) && m.status !== "seen") {
            return { ...m, status: "seen", seenAt: m.seenAt || readAtIso };
          }
          return m;
        }),
      );
    };

    const handleTyping = (data: any) => {
      const typingUserId = data.userId || data.senderId;
      if (typingUserId && String(typingUserId) !== String(myId)) {
        // Honor explicit isTyping:false so the indicator hides immediately
        // when the other side stops, instead of waiting for the 3s fallback.
        const isTypingFlag = data.isTyping !== false;
        setIsTyping(isTypingFlag);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        if (isTypingFlag) {
          // Safety-net: clear the bubble after 3s of silence in case we miss
          // the matching isTyping:false event (e.g. socket drop on sender).
          typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
        }
      }
    };

    const handleRecordingVoice = (data: any) => {
      if (data.userId && String(data.userId) !== String(myId)) {
        setIsOtherRecording(!!data.isRecording);
      }
    };

    const handleMessageUpdated = (data: any) => {
      if (data.message && data.message._id) {
        setMessages((prev) =>
          prev.map((m) => (m._id === data.message._id ? { ...m, ...data.message } : m)),
        );
      }
    };

    const handleMessageDeleted = (data: any) => {
      if (data.messageId) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === data.messageId
              ? { ...m, content: "This message was deleted", text: "This message was deleted", type: "system" as const, deletedForEveryone: true }
              : m,
          ),
        );
      }
    };

    const handleLiveLocationUpdate = (data: any) => {
      if (!data?.messageId) return;
      setMessages((prev) =>
        prev.map((m: any) =>
          String(m._id) === String(data.messageId)
            ? {
                ...m,
                ...(typeof data.latitude === "number" ? { latitude: data.latitude } : {}),
                ...(typeof data.longitude === "number" ? { longitude: data.longitude } : {}),
                ...(data.lastLocationUpdate ? { lastLocationUpdate: data.lastLocationUpdate } : {}),
                ...(data.liveExpiresAt ? { liveExpiresAt: data.liveExpiresAt } : {}),
              }
            : m
        )
      );
    };

    const handleMessageEdited = (data: any) => {
      if (data.messageId) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === data.messageId
              ? { ...m, content: data.content, edited: true, editedAt: data.editedAt }
              : m
          )
        );
      }
    };

    const handleReaction = (data: { messageId: string; reactions: MessageReaction[] }) => {
      setMessages(prev => prev.map(m => m._id === data.messageId ? { ...m, reactions: data.reactions } : m));
    };

    const handleMessageTranslated = (data: {
      messageId: string;
      matchId: string;
      translatedText: string;
      detectedLanguage: string;
      targetLanguage: string;
    }) => {
      if (data.matchId !== matchId) return;
      setMessages(prev =>
        prev.map(m =>
          m._id === data.messageId
            ? { ...m, translatedText: data.translatedText, detectedLanguage: data.detectedLanguage, targetLanguage: data.targetLanguage } as any
            : m
        )
      );
    };

    // When the recipient opens a view-once message the server emits this event
    // to the sender so their bubble flips to "opened" in real time without
    // waiting for the next full message fetch.
    const handleViewOnceOpened = (data: { messageId: string; matchId: string; openedBy: string }) => {
      if (data.matchId?.toString() !== matchId) return;
      setMessages(prev =>
        prev.map(m =>
          m._id === data.messageId.toString()
            ? { ...m, viewOnceOpenedBy: [...(m.viewOnceOpenedBy || []), data.openedBy] } as any
            : m
        )
      );
    };

    socketService.on("chat:new-message", handleNewMessage);
    socketService.on("message:new", handleNewMessage);
    socketService.on("chat:message-delivered", handleMessageDelivered);
    socketService.on("chat:messages-read", handleMessagesRead);
    socketService.on("chat:message-read", handleMessagesRead);
    socketService.on("chat:read", handleMessagesRead);
    socketService.on("chat:message-updated", handleMessageUpdated);
    socketService.on("chat:message-deleted", handleMessageDeleted);
    socketService.on("chat:live-location-update", handleLiveLocationUpdate);
    socketService.on("chat:message-edited", handleMessageEdited);
    socketService.on("chat:user-typing", handleTyping);
    socketService.on("chat:recording-voice", handleRecordingVoice);
    socketService.on("message:reaction", handleReaction);
    socketService.on("message:translated", handleMessageTranslated);
    socketService.on("chat:view-once-opened", handleViewOnceOpened);

    return () => {
      if (isCurrentlyTypingRef.current && matchId) {
        socketService.emit("chat:typing", { chatId: matchId, userId: myId, isTyping: false });
        isCurrentlyTypingRef.current = false;
      }
      if (typingStopTimerRef.current) { clearTimeout(typingStopTimerRef.current); typingStopTimerRef.current = null; }
      if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }

      socketService.off("chat:new-message", handleNewMessage);
      socketService.off("message:new", handleNewMessage);
      socketService.off("chat:message-delivered", handleMessageDelivered);
      socketService.off("chat:messages-read", handleMessagesRead);
      socketService.off("chat:message-read", handleMessagesRead);
      socketService.off("chat:read", handleMessagesRead);
      socketService.off("chat:message-updated", handleMessageUpdated);
      socketService.off("chat:message-deleted", handleMessageDeleted);
      socketService.off("chat:message-edited", handleMessageEdited);
      socketService.off("message:reaction", handleReaction);
      socketService.off("message:translated", handleMessageTranslated);
      socketService.off("chat:user-typing", handleTyping);
      socketService.off("chat:recording-voice", handleRecordingVoice);
      socketService.off("chat:live-location-update", handleLiveLocationUpdate);
      socketService.off("chat:view-once-opened", handleViewOnceOpened);
    };
  }, [matchId, userId, myId, token, put]);

  const sendMessage = async (content?: string, type: string = "text", extraData?: any) => {
    const textToSend = content || message.trim();
    if (!textToSend && type === "text") return;
    if (!matchId || !token) return;
    // Use a ref guard instead of `sending` state so the button can reset
    // immediately after the optimistic add (WhatsApp-style), while the HTTP
    // request is still in flight.
    if (isSendingInFlightRef.current) return;
    isSendingInFlightRef.current = true;

    // Safety scan: warn before sending text that contains personal/contact info
    if (
      type === "text" &&
      recentlyWarnedTextRef.current !== textToSend
    ) {
      const scan = scanForSensitiveInfo(textToSend);
      if (scan.isSensitive) {
        recentlyWarnedTextRef.current = textToSend;
        showPersonalInfoWarning(
          scan.reasons,
          () => {
            // Fire-and-forget audit log so admins can spot risky patterns
            post("/safety/warning-bypassed", {
              matchId,
              reasons: scan.reasons,
              contentLength: textToSend.length,
            }, token).catch(() => {});
            // Release the guard before recursing so the call goes through
            isSendingInFlightRef.current = false;
            sendMessage(textToSend, type, extraData);
          },
          () => {
            isSendingInFlightRef.current = false;
            setMessage(textToSend);
          },
        );
        return;
      }
    }

    setMessage("");
    recentlyWarnedTextRef.current = "";
    // Tell the receiver we stopped typing the moment we hit send, so their
    // "typing…" bubble disappears instead of lingering for 2-3s.
    if (matchId && isCurrentlyTypingRef.current) {
      socketService.emit("chat:typing", { chatId: matchId, userId: myId, isTyping: false });
      isCurrentlyTypingRef.current = false;
      if (typingStopTimerRef.current) { clearTimeout(typingStopTimerRef.current); typingStopTimerRef.current = null; }
    }
    if (userId) AsyncStorage.removeItem(`chat_draft_${userId}`).catch(() => {});
    setShowEmojiPicker(false);
    setShowAISuggestions(false);

    let replyData: any = undefined;
    if (replyingTo) {
      const replySenderId = typeof replyingTo.sender === "string" ? replyingTo.sender : replyingTo.sender?._id;
      replyData = {
        messageId: replyingTo._id,
        content: replyingTo.content || replyingTo.text || "",
        type: replyingTo.type,
        senderName: String(replySenderId) === String(myId) ? "You" : userName,
      };
    }

    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const tempMessage: Message = {
      _id: `temp_${Date.now()}`,
      localId,
      sender: myId,
      content: textToSend,
      type: type as any,
      createdAt: new Date().toISOString(),
      status: "sent",
      ...(replyData ? { replyTo: replyData } : {}),
      ...extraData,
    };
    setMessages((prev) => [...prev, tempMessage]);
    setReplyingTo(null);

    // Reset the send button IMMEDIATELY after the optimistic message is added
    // (WhatsApp-style) so the user can start typing their next message right
    // away without waiting for the server response.
    setSending(false);

    // After sending we always want the user to see their own message at the
    // bottom — mark them as "at bottom" and run the robust scroll helper.
    isNearBottomRef.current = true;
    scrollToBottom(true);

    try {
      const response = await post<{ message: Message }>(
        `/chat/${matchId}/message`,
        { content: textToSend, type, localId, ...(replyData ? { replyTo: replyData } : {}), ...extraData },
        token,
      );
      if (response.success && response.data?.message) {
        const serverMsg = response.data!.message as any;
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempMessage._id
              ? {
                  ...serverMsg,
                  status: "sent",
                  ...(tempMessage.viewOnce ? { viewOnce: true } : {}),
                }
              : m,
          ),
        );
        return response.data.message;
      }
    } catch (error: any) {
      logger.error("Send error:", error);
      const data = error?.response?.data;
      const isPaused = data?.code === "MESSAGING_PAUSED" || error?.response?.status === 403 && /paused|review/i.test(data?.message || "");
      const isNetworkError = !error?.response;

      if (isNetworkError && type === "text") {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempMessage._id ? ({ ...m, status: "pending" } as any) : m,
          ),
        );
        await enqueue({
          localId,
          matchId: matchId!,
          content: textToSend,
          type,
          replyTo: replyData,
          createdAt: tempMessage.createdAt,
        });
        setIsOffline(true);
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== tempMessage._id));
        if (isPaused) {
          const until = data?.pausedUntil ? new Date(data.pausedUntil) : null;
          const untilStr = until ? ` until ${until.toLocaleString()}` : "";
          Alert.alert(
            "Messaging Paused",
            `${data?.message || "Your messaging has been paused for safety review."}${untilStr}`,
            [{ text: "OK" }],
          );
        } else {
          Alert.alert("Error", "Failed to send message");
        }
      }
    } finally {
      // Release the double-send guard. The UI button was already re-enabled
      // right after the optimistic message was added (WhatsApp-style).
      isSendingInFlightRef.current = false;
    }
    return undefined;
  };

  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // Load the per-chat "dismissed" flag from device storage so the popup
  // doesn't reappear after closing and reopening this conversation.
  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(`icebreaker_dismissed_${userId}`)
      .then((v) => setIcebreakerDismissed(v === "1"))
      .catch(() => setIcebreakerDismissed(false));
  }, [userId]);

  // Show a slide-in icebreaker suggestion when the conversation is brand new.
  // Auto-fetches a single tailored question on first load. The popup hides
  // itself the moment any message exists in the thread, or when dismissed.
  useEffect(() => {
    if (icebreakerDismissed === null) return; // wait for storage to load
    if (icebreakerDismissed) return;
    if (messages.length > 0) {
      if (icebreakerPopup) setIcebreakerPopup(null);
      return;
    }
    if (icebreakerPopup || !userId || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/icebreakers/suggest/${userId}?limit=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const tailored = data?.suggestions?.[0]?.question;
        const fallback = AI_SUGGESTIONS[Math.floor(Math.random() * AI_SUGGESTIONS.length)];
        if (!cancelled) setIcebreakerPopup(tailored || fallback);
      } catch {
        if (!cancelled) setIcebreakerPopup(AI_SUGGESTIONS[Math.floor(Math.random() * AI_SUGGESTIONS.length)]);
      }
    })();
    return () => { cancelled = true; };
  }, [messages.length, userId, token, icebreakerDismissed, icebreakerPopup]);

  // Slide the popup in from the right when it appears, slide it out when it's gone.
  useEffect(() => {
    Animated.spring(icebreakerSlide, {
      toValue: icebreakerPopup ? 0 : SCREEN_WIDTH,
      useNativeDriver: true,
      damping: 18,
      stiffness: 140,
    }).start();
  }, [icebreakerPopup, icebreakerSlide]);

  const persistIcebreakerDismissed = useCallback(() => {
    if (userId) {
      AsyncStorage.setItem(`icebreaker_dismissed_${userId}`, "1").catch(() => {});
    }
  }, [userId]);

  const useIcebreakerPopup = useCallback(() => {
    if (icebreakerPopup) {
      setMessage(icebreakerPopup);
      setIcebreakerPopup(null);
      setIcebreakerDismissed(true);
      persistIcebreakerDismissed();
      inputRef.current?.focus();
    }
  }, [icebreakerPopup, persistIcebreakerDismissed]);

  const dismissIcebreakerPopup = useCallback(() => {
    setIcebreakerPopup(null);
    setIcebreakerDismissed(true);
    persistIcebreakerDismissed();
  }, [persistIcebreakerDismissed]);

  // Tick once a second so any active live-location countdown stays accurate
  useEffect(() => {
    const hasLive = messages.some(
      (m: any) => m.type === "location" && m.liveExpiresAt && new Date(m.liveExpiresAt) > new Date()
    );
    if (!hasLive) return;
    const id = setInterval(() => setLiveTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [messages]);

  const handleStopLiveShare = useCallback((messageId: string) => {
    Alert.alert("Stop sharing live location?", "Your live location will no longer update.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Stop",
        style: "destructive",
        onPress: () => {
          stopLiveLocationShare(messageId);
          setMessages((prev) =>
            prev.map((m: any) =>
              String(m._id) === String(messageId) ? { ...m, liveExpiresAt: new Date().toISOString() } : m
            )
          );
          setLiveTick((t) => t + 1);
        },
      },
    ]);
  }, []);

  const formatLiveRemaining = useCallback((expiresAt: string | Date) => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "Ended";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m left`;
    if (m > 0) return `${m}m ${s}s left`;
    return `${s}s left`;
  }, []);

  const handleMarkViewOnce = (messageId: string) => {
    if (!token || openedViewOnceIds.has(messageId)) return;
    setOpenedViewOnceIds(prev => new Set(prev).add(messageId));
    fetch(`${getApiBaseUrl()}/api/chat/messages/${messageId}/view-once`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    }).catch(e => logger.error("View once mark error:", e));
  };

  /** Start the 10-second view-once countdown and handle auto-close. */
  const startViewOnceCountdown = (onClose: () => void) => {
    if (Platform.OS !== "web" && !screenshotProtection) {
      try { ScreenCapture.preventScreenCaptureAsync(); } catch (_) {}
    }
    if (viewOnceTimerRef.current) clearTimeout(viewOnceTimerRef.current);
    if (viewOnceCountdownRef.current) clearInterval(viewOnceCountdownRef.current);
    setViewOnceCountdown(10);
    let remaining = 10;
    viewOnceCountdownRef.current = setInterval(() => {
      remaining -= 1;
      setViewOnceCountdown(remaining);
      if (remaining <= 0 && viewOnceCountdownRef.current) {
        clearInterval(viewOnceCountdownRef.current);
        viewOnceCountdownRef.current = null;
      }
    }, 1000);
    viewOnceTimerRef.current = setTimeout(() => {
      onClose();
      viewOnceTimerRef.current = null;
    }, 10000);
  };

  /** Stop the countdown and re-allow screenshots (unless global protection is on). */
  const stopViewOnceCountdown = () => {
    if (viewOnceTimerRef.current) { clearTimeout(viewOnceTimerRef.current); viewOnceTimerRef.current = null; }
    if (viewOnceCountdownRef.current) { clearInterval(viewOnceCountdownRef.current); viewOnceCountdownRef.current = null; }
    if (Platform.OS !== "web" && !screenshotProtection) {
      try { ScreenCapture.allowScreenCaptureAsync(); } catch (_) {}
    }
    setViewOnceViewerActive(false);
    setViewOnceCountdown(10);
  };

  /**
   * Notify the other side that we're typing — but throttle so we don't
   * flood the socket with one event per keystroke. We also schedule a
   * trailing isTyping:false 2s after the last keystroke so their bubble
   * disappears the moment we pause (instead of waiting for the 3s fallback).
   */
  const handleTypingIndicator = useCallback(() => {
    if (!matchId || !token) return;

    const now = Date.now();
    if (!isCurrentlyTypingRef.current || now - lastTypingSentRef.current > 2000) {
      socketService.emit("chat:typing", { chatId: matchId, userId: myId, isTyping: true });
      lastTypingSentRef.current = now;
      isCurrentlyTypingRef.current = true;
    }

    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      if (isCurrentlyTypingRef.current && matchId) {
        socketService.emit("chat:typing", { chatId: matchId, userId: myId, isTyping: false });
        isCurrentlyTypingRef.current = false;
      }
    }, 2000);
  }, [matchId, token, myId]);

  const handleEmojiSelect = (emoji: string) => setMessage((prev) => prev + emoji);

  const uploadChatImageAsset = async (uri: string) => {
    const filename = uri.split("/").pop() || "chat_image.jpg";
    const extMatch = /\.([a-zA-Z0-9]+)$/.exec(filename);
    const ext = (extMatch?.[1] || "jpg").toLowerCase();
    const mime =
      ext === "png" ? "image/png" :
      ext === "webp" ? "image/webp" :
      ext === "heic" || ext === "heif" ? "image/heic" :
      "image/jpeg";

    const formData = new FormData();
    formData.append("image", { uri, type: mime, name: filename } as any);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    try {
      const uploadResponse = await fetch(`${getApiBaseUrl()}/api/upload/chat-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        body: formData,
        signal: controller.signal,
      });
      const contentType = uploadResponse.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await uploadResponse.text().catch(() => "");
        throw new Error(`Upload failed (${uploadResponse.status}). ${text.slice(0, 120)}`);
      }
      return await uploadResponse.json();
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // Optimistically insert a media message using the local URI, upload in the
  // background, then post the chat message and replace the temp with the
  // server response. Makes image/video sends feel instant.
  const sendMediaOptimistic = async (
    kind: "image" | "video",
    localUri: string,
    uploadFn: () => Promise<{ success?: boolean; url?: string; message?: string }>,
  ) => {
    if (!matchId || !token) return;
    const isVO = viewOnceModeRef.current;
    if (isVO) {
      setViewOnceModeSync(false);
      setViewOnceSent(true);
      setTimeout(() => setViewOnceSent(false), 2500);
    }

    const tempId = `temp_${Date.now()}_${kind}`;
    const labelContent = kind === "image" ? "📷 Photo" : "🎬 Video";
    const urlField = kind === "image" ? "imageUrl" : "videoUrl";

    const tempMsg: any = {
      _id: tempId,
      sender: myId,
      content: labelContent,
      type: kind,
      [urlField]: localUri,
      createdAt: new Date().toISOString(),
      status: "sending",
      ...(isVO ? { viewOnce: true } : {}),
    };
    setMessages((prev) => [...prev, tempMsg]);
    isNearBottomRef.current = true;
    scrollToBottom(true);

    try {
      const uploadData = await uploadFn();
      if (!uploadData?.success || !uploadData.url) {
        throw new Error(uploadData?.message || "Upload failed");
      }
      // Swap to the cloud URL so we don't re-fetch a local thumbnail later.
      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? { ...m, [urlField]: uploadData.url } : m)),
      );

      const response = await post<{ message: Message }>(
        `/chat/${matchId}/message`,
        { content: labelContent, type: kind, [urlField]: uploadData.url, ...(isVO ? { viewOnce: true } : {}) },
        token,
      );
      if (response.success && response.data?.message) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId
              ? { ...response.data!.message, status: "sent", ...(isVO ? { viewOnce: true } : {}) }
              : m,
          ),
        );
      }
    } catch (error: any) {
      logger.error(`${kind} send error:`, error);
      setMessages((prev) => prev.map((m) => (m._id === tempId ? ({ ...m, status: "failed" } as any) : m)));
      const msg = error?.name === "AbortError"
        ? "Upload timed out. Try a smaller file or a stronger connection."
        : `Failed to send ${kind}. Check your connection and try again.`;
      Alert.alert("Send Failed", msg);
    }
  };

  const retryFailedMedia = (item: any) => {
    if (!item || item.status !== "failed") return;
    if (item.type === "audio") {
      const localUri = item.audioUrl;
      if (!localUri) return;
      const duration = item.audioDuration || 1;
      setMessages((prev) => prev.filter((m) => m._id !== item._id));
      sendVoiceOptimistic(localUri, duration);
      return;
    }
    const localUri = item.imageUrl || item.videoUrl;
    if (!localUri) return;
    const kind: "image" | "video" = item.type === "video" ? "video" : "image";
    setMessages((prev) => prev.filter((m) => m._id !== item._id));
    const uploadFn = kind === "video"
      ? () => uploadChatVideoAsset(localUri)
      : () => uploadChatImageAsset(localUri);
    sendMediaOptimistic(kind, localUri, uploadFn);
  };

  const uploadChatVideoAsset = async (uri: string) => {
    const formData = new FormData();
    formData.append("video", { uri, type: "video/mp4", name: "chat_video.mp4" } as any);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const uploadResponse = await fetch(`${getApiBaseUrl()}/api/upload/chat-video`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        body: formData,
        signal: controller.signal,
      });
      const contentType = uploadResponse.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await uploadResponse.text().catch(() => "");
        throw new Error(`Upload failed (${uploadResponse.status}). ${text.slice(0, 120)}`);
      }
      return await uploadResponse.json();
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handlePickImage = async () => {
    setShowAttachmentMenu(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"] as ImagePicker.MediaType[],
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      sendMediaOptimistic("image", uri, () => uploadChatImageAsset(uri));
    }
  };

  const handlePickVideo = async () => {
    setShowAttachmentMenu(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"] as ImagePicker.MediaType[],
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      sendMediaOptimistic("video", uri, () => uploadChatVideoAsset(uri));
    }
  };

  const handleTakePhoto = async () => {
    setShowAttachmentMenu(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { Alert.alert("Permission Needed", "Camera permission is required to take photos"); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, base64: false });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      sendMediaOptimistic("image", uri, () => uploadChatImageAsset(uri));
    }
  };

  const handleShareLocation = async (liveDurationMin?: number) => {
    if (isSendingLocation) return;
    setShowAttachmentMenu(false);
    setShowLivePicker(false);
    setIsSendingLocation(true);

    try {
      // 1. Make sure GPS itself is on (separate from app permission)
      const servicesOn = await Location.hasServicesEnabledAsync();
      if (!servicesOn) {
        Alert.alert(
          "Location is off",
          "Turn on location services in your device settings to share your location.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      // 2. App-level permission (with a path back to settings if denied)
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location permission needed",
          canAskAgain
            ? "Please allow location access to share where you are."
            : "Location access was previously denied. You can enable it in Settings.",
          canAskAgain
            ? [{ text: "OK" }]
            : [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() },
              ]
        );
        return;
      }

      // 3. Get coordinates fast: use last-known instantly if recent (<2 min),
      //    otherwise race a fresh fix against an 8s timeout so we never hang.
      let coords: { latitude: number; longitude: number } | null = null;
      const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 120_000 }).catch(() => null);
      if (lastKnown?.coords) {
        coords = { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
      } else {
        try {
          const fresh = await Promise.race<Location.LocationObject>([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<Location.LocationObject>((_, reject) =>
              setTimeout(() => reject(new Error("location_timeout")), 8000)
            ),
          ]);
          coords = { latitude: fresh.coords.latitude, longitude: fresh.coords.longitude };
        } catch {
          Alert.alert(
            "Couldn't get your location",
            "We couldn't find your location in time. Please check your signal and try again."
          );
          return;
        }
      }

      const { latitude, longitude } = coords;

      // 4. Send the message immediately with coords (no text — the bubble already
      //    renders the address). Reverse-geocoding happens in the background and
      //    the bubble updates the moment we know the address.
      const sentMsg: any = await sendMessage("", "location", {
        latitude,
        longitude,
        ...(liveDurationMin ? { liveDurationMin } : {}),
      });

      reverseGeocode(latitude, longitude).then((g) => {
        if (g.address) {
          setMessages((prev) =>
            prev.map((m: any) =>
              m.type === "location" &&
              m.latitude === latitude &&
              m.longitude === longitude &&
              !m.address
                ? { ...m, address: g.address }
                : m
            )
          );
        }
      });

      // 5. If this is a live share, kick off the periodic GPS pusher
      if (liveDurationMin && sentMsg?._id) {
        startLiveLocationShare(String(sentMsg._id), String(matchId || ""), liveDurationMin);
        setLiveTick((t) => t + 1);
      }
    } catch {
      Alert.alert("Error", "Could not share your location. Please try again.");
    } finally {
      setIsSendingLocation(false);
    }
  };

  const startRecording = async () => {
    if (Platform.OS === "web") { Alert.alert("Not Supported", "Voice recording is only available in the mobile app"); return; }
    if (isRecording || recordingRef.current) return;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) { Alert.alert("Permission Needed", "Microphone permission is required"); return; }
      if (soundRef.current) {
        try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch (_) {}
        soundRef.current = null;
        playingAudioIdRef.current = null;
        setPlayingAudioId(null);
        setAudioProgress(0);
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingDurationRef.current = 0;
      if (matchId) socketService.emit("chat:recording-voice", { chatId: matchId, userId: myId, isRecording: true });
      recordingIntervalRef.current = setInterval(() => {
        recordingDurationRef.current += 1;
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      logger.error("Recording error:", error);
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
      Alert.alert("Error", "Could not start recording. Please try again.");
    }
  };

  const pauseRecording = async () => {
    if (!recordingRef.current || recordingPaused) return;
    try {
      await recordingRef.current.pauseAsync();
      if (recordingIntervalRef.current) { clearInterval(recordingIntervalRef.current); recordingIntervalRef.current = null; }
      setRecordingPaused(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) { logger.log("Pause recording error:", e); }
  };

  const resumeRecording = async () => {
    if (!recordingRef.current || !recordingPaused) return;
    try {
      await recordingRef.current.startAsync();
      setRecordingPaused(false);
      recordingIntervalRef.current = setInterval(() => {
        recordingDurationRef.current += 1;
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) { logger.log("Resume recording error:", e); }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) { setIsRecording(false); setRecordingPaused(false); return; }
    try {
      if (recordingIntervalRef.current) { clearInterval(recordingIntervalRef.current); recordingIntervalRef.current = null; }
      const recording = recordingRef.current;
      const duration = recordingDurationRef.current;
      recordingRef.current = null;
      setIsRecording(false);
      setRecordingPaused(false);
      if (matchId) socketService.emit("chat:recording-voice", { chatId: matchId, userId: myId, isRecording: false });
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
      const uri = recording.getURI();
      if (uri && duration >= 1) {
        // Show preview UI instead of auto-sending so user can review/discard.
        setRecordingPreview({ uri, duration });
        setPreviewProgress(0);
        setPreviewPlaying(false);
      } else if (uri && duration < 1) {
        Alert.alert("Too Short", "Voice message must be at least 1 second long");
      }
      setRecordingDuration(0);
      recordingDurationRef.current = 0;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      logger.error("Stop recording error:", error);
      setIsRecording(false);
      setRecordingPaused(false);
      setRecordingDuration(0);
      recordingDurationRef.current = 0;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
    }
  };

  const togglePreviewPlay = async () => {
    if (!recordingPreview) return;
    try {
      if (previewSoundRef.current) {
        const status: any = await previewSoundRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (status.isPlaying) { await previewSoundRef.current.pauseAsync(); setPreviewPlaying(false); return; }
          await previewSoundRef.current.playAsync(); setPreviewPlaying(true); return;
        }
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: recordingPreview.uri },
        { shouldPlay: true, progressUpdateIntervalMillis: 100 },
        (status: any) => {
          if (status.isLoaded) {
            if (status.durationMillis > 0) setPreviewProgress(status.positionMillis / status.durationMillis);
            if (status.didJustFinish) {
              setPreviewPlaying(false); setPreviewProgress(0);
              if (previewSoundRef.current) { previewSoundRef.current.unloadAsync().catch(() => {}); previewSoundRef.current = null; }
            }
          }
        },
      );
      previewSoundRef.current = sound;
      setPreviewPlaying(true);
    } catch (e) { logger.error("Preview play error:", e); }
  };

  const discardRecordingPreview = async () => {
    if (previewSoundRef.current) {
      try { await previewSoundRef.current.unloadAsync(); } catch (_) {}
      previewSoundRef.current = null;
    }
    setRecordingPreview(null);
    setPreviewProgress(0);
    setPreviewPlaying(false);
  };

  const sendVoiceOptimistic = async (uri: string, duration: number) => {
    if (!matchId || !token) return;
    const tempId = `temp_${Date.now()}_audio`;
    const labelContent = `🎤 Voice message (${duration}s)`;
    const tempMsg: any = {
      _id: tempId,
      sender: myId,
      content: labelContent,
      type: "audio",
      audioUrl: uri,
      audioDuration: duration,
      createdAt: new Date().toISOString(),
      status: "sending",
    };
    setMessages((prev) => [...prev, tempMsg]);
    isNearBottomRef.current = true;
    scrollToBottom(true);
    try {
      const ext = uri.split(".").pop()?.toLowerCase() || "m4a";
      const mimeMap: Record<string, string> = { m4a: "audio/m4a", mp4: "audio/mp4", caf: "audio/x-caf", wav: "audio/wav", "3gp": "audio/3gpp", aac: "audio/aac", webm: "audio/webm" };
      const mimeType = mimeMap[ext] || (Platform.OS === "android" ? "application/octet-stream" : "audio/m4a");
      const formData = new FormData();
      formData.append("audio", { uri, type: mimeType, name: `voice_message.${ext}` } as any);
      formData.append("duration", duration.toString());
      const uploadResponse = await fetch(`${getApiBaseUrl()}/api/upload/audio`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const uploadData = await uploadResponse.json();
      if (!uploadData.success || !uploadData.url) throw new Error(uploadData.message || "Upload failed");
      // Swap to cloud URL so future plays don't depend on local file.
      setMessages((prev) => prev.map((m) => (m._id === tempId ? { ...m, audioUrl: uploadData.url } : m)));
      const response = await post<{ message: Message }>(
        `/chat/${matchId}/message`,
        { content: labelContent, type: "audio", audioUrl: uploadData.url, audioDuration: duration },
        token,
      );
      if (response.success && response.data?.message) {
        setMessages((prev) =>
          prev.map((m) => (m._id === tempId ? { ...response.data!.message, status: "sent" } : m)),
        );
      }
    } catch (error: any) {
      logger.error("Voice send error:", error);
      setMessages((prev) => prev.map((m) => (m._id === tempId ? ({ ...m, status: "failed" } as any) : m)));
      Alert.alert("Send Failed", "Failed to send voice message. Tap the bubble to retry.");
    }
  };

  const sendRecordingPreview = async () => {
    if (!recordingPreview) return;
    const { uri, duration } = recordingPreview;
    await discardRecordingPreview();
    sendVoiceOptimistic(uri, duration);
  };

  const cancelRecording = async () => {
    if (recordingIntervalRef.current) { clearInterval(recordingIntervalRef.current); recordingIntervalRef.current = null; }
    if (!recordingRef.current) { setIsRecording(false); setRecordingDuration(0); recordingDurationRef.current = 0; return; }
    try {
      if (Platform.OS !== "web") {
        const recording = recordingRef.current;
        recordingRef.current = null;
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
      } else {
        recordingRef.current = null;
      }
    } catch (error) { logger.log("Cancel recording cleanup:", error); }
    if (matchId) socketService.emit("chat:recording-voice", { chatId: matchId, userId: myId, isRecording: false });
    setIsRecording(false);
    setRecordingDuration(0);
    recordingDurationRef.current = 0;
  };

  const updatePlayingId = (id: string | null) => {
    playingAudioIdRef.current = id;
    setPlayingAudioId(id);
  };

  const playAudio = async (audioUrl: string, messageId: string) => {
    try {
      if (!audioUrl || audioUrl.trim() === "") { Alert.alert("Error", "No audio URL available for this voice message"); return; }
      const currentId = playingAudioIdRef.current;

      if (htmlAudioRef.current) {
        if (currentId === messageId && !htmlAudioRef.current.paused) { htmlAudioRef.current.pause(); updatePlayingId("paused:" + messageId); return; }
        if (currentId === "paused:" + messageId && htmlAudioRef.current.paused) { htmlAudioRef.current.play(); updatePlayingId(messageId); return; }
        htmlAudioRef.current.pause(); htmlAudioRef.current.src = ""; htmlAudioRef.current = null;
      }

      if (soundRef.current) {
        try {
          const status: any = await soundRef.current.getStatusAsync();
          if (status.isLoaded) {
            if (currentId === messageId && status.isPlaying) { await soundRef.current.pauseAsync(); updatePlayingId("paused:" + messageId); return; }
            if (currentId === "paused:" + messageId && !status.isPlaying) { await soundRef.current.playAsync(); updatePlayingId(messageId); return; }
          }
        } catch (e) { logger.log("Status check error:", e); }
        try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch (cleanupErr) {}
        soundRef.current = null;
      }

      updatePlayingId(null);
      setAudioProgress(0);

      const playNextUnplayed = (afterId: string) => {
        try {
          const list = messagesRef.current || [];
          const idx = list.findIndex((m: any) => m._id === afterId);
          if (idx < 0) return;
          for (let i = idx + 1; i < list.length; i++) {
            const m: any = list[i];
            if (m.type !== "audio" || !m.audioUrl) continue;
            const senderId = String(typeof m.sender === "string" ? m.sender : m.sender?._id);
            const isMine = senderId === String(myId);
            if (isMine) continue;
            if (playedAudioIds.has(m._id)) continue;
            // Defer slightly so the previous sound finishes unloading.
            setTimeout(() => playAudio(m.audioUrl, m._id), 250);
            return;
          }
        } catch (e) { logger.log("auto-next error", e); }
      };

      const onStatus = (status: any) => {
        if (status.isLoaded) {
          if (status.durationMillis > 0) setAudioProgress(status.positionMillis / status.durationMillis);
          if (status.didJustFinish) {
            markAudioPlayed(messageId);
            updatePlayingId(null); setAudioProgress(0);
            if (soundRef.current) { soundRef.current.unloadAsync().catch(() => {}); soundRef.current = null; }
            playNextUnplayed(messageId);
          }
        }
      };

      if (Platform.OS === "web") {
        try {
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: true });
          const { sound } = await Audio.Sound.createAsync({ uri: audioUrl }, { shouldPlay: true, progressUpdateIntervalMillis: 100, rate: playbackRateRef.current, shouldCorrectPitch: true }, onStatus);
          soundRef.current = sound; updatePlayingId(messageId);
        } catch (expoError) {
          logger.log("expo-av failed on web, trying HTML5 Audio fallback:", expoError);
          try {
            const htmlAudio = new window.Audio(audioUrl);
            htmlAudioRef.current = htmlAudio;
            htmlAudio.playbackRate = playbackRateRef.current;
            htmlAudio.onended = () => { markAudioPlayed(messageId); updatePlayingId(null); setAudioProgress(0); playNextUnplayed(messageId); };
            htmlAudio.ontimeupdate = () => { if (htmlAudio.duration > 0) setAudioProgress(htmlAudio.currentTime / htmlAudio.duration); };
            htmlAudio.onerror = () => { updatePlayingId(null); setAudioProgress(0); Alert.alert("Playback Error", "Could not play this voice message. The audio format may not be supported."); };
            await htmlAudio.play(); updatePlayingId(messageId);
          } catch (htmlError: any) {
            logger.error("HTML5 Audio fallback also failed:", htmlError);
            Alert.alert("Playback Error", `Could not play voice message: ${htmlError.message || "Unknown error"}`);
          }
        }
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: true, playThroughEarpieceAndroid: false });
      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl }, { shouldPlay: true, progressUpdateIntervalMillis: 100, rate: playbackRateRef.current, shouldCorrectPitch: true }, onStatus);
      soundRef.current = sound; updatePlayingId(messageId);
    } catch (error: any) {
      logger.error("Audio playback error for URL:", audioUrl, error);
      Alert.alert("Playback Error", `Could not play voice message: ${error.message || "Unknown error"}`);
    }
  };

  useEffect(() => {
    return () => {
      if (soundRef.current) { soundRef.current.unloadAsync().catch(() => {}); soundRef.current = null; }
      if (htmlAudioRef.current) { htmlAudioRef.current.pause(); htmlAudioRef.current.src = ""; htmlAudioRef.current = null; }
      if (recordingRef.current) {
        const rec = recordingRef.current; recordingRef.current = null;
        rec.stopAndUnloadAsync().then(() => Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true })).catch(() => {});
      }
      if (recordingIntervalRef.current) { clearInterval(recordingIntervalRef.current); recordingIntervalRef.current = null; }
      recordingDurationRef.current = 0;
      if (previewSoundRef.current) { previewSoundRef.current.unloadAsync().catch(() => {}); previewSoundRef.current = null; }
    };
  }, []);

  const saveImage = async (imageUrl: string) => {
    try {
      if (Platform.OS === "web") { const link = document.createElement("a"); link.href = imageUrl; link.download = `emorii_${Date.now()}.jpg`; link.target = "_blank"; link.click(); return; }
      const fileUri = `${FileSystem.cacheDirectory}emorii_${Date.now()}.jpg`;
      const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri);
      if (downloadResult.status !== 200) { Alert.alert("Error", "Failed to download image."); return; }
      try { const { status } = await MediaLibrary.requestPermissionsAsync(); if (status === "granted") { await MediaLibrary.saveToLibraryAsync(downloadResult.uri); Alert.alert("Saved", "Image saved to your gallery."); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); return; } } catch (_permError) {}
      if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(downloadResult.uri, { mimeType: "image/jpeg", dialogTitle: "Save Image" }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
      else Alert.alert("Error", "Cannot save images in this environment. Try a development build.");
    } catch (error) { logger.error("Save image error:", error); Alert.alert("Error", "Could not save image."); }
  };

  const saveVideo = async (url: string) => {
    try {
      if (Platform.OS === "web") { const link = document.createElement("a"); link.href = url; link.download = `emorii_${Date.now()}.mp4`; link.target = "_blank"; link.click(); return; }
      const fileUri = `${FileSystem.cacheDirectory}emorii_${Date.now()}.mp4`;
      const downloadResult = await FileSystem.downloadAsync(url, fileUri);
      if (downloadResult.status !== 200) { Alert.alert("Error", "Failed to download video."); return; }
      try { const { status } = await MediaLibrary.requestPermissionsAsync(); if (status === "granted") { await MediaLibrary.saveToLibraryAsync(downloadResult.uri); Alert.alert("Saved!", "Video saved to your gallery"); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); return; } } catch (_permError) {}
      if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(downloadResult.uri, { mimeType: "video/mp4", dialogTitle: "Save Video" }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
      else Alert.alert("Error", "Cannot save videos in this environment. Try a development build.");
    } catch (error) { logger.error("Save video error:", error); Alert.alert("Error", "Failed to save video"); }
  };

  const fetchAISuggestions = useCallback(async () => {
    setShowAISuggestions(true);
    const fallback = [...AI_SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 5);
    setAiSuggestions(fallback);
    if (!userId || !token) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/icebreakers/suggest/${userId}?limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.success && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setAiSuggestions(data.suggestions.map((s: any) => s.question));
      }
    } catch (e) {
      logger.log("icebreaker fetch failed, using fallback", e);
    }
  }, [userId, token]);

  const handleBlockUser = async () => {
    setShowOptionsMenu(false);
    Alert.alert("Block User", `Are you sure you want to block ${userName}? They won't be able to contact you anymore.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block", style: "destructive", onPress: async () => {
          try {
            const response = await post(`/block/${userId}`, {}, token || "");
            if (response.success) { Alert.alert("Blocked", `${userName} has been blocked`); navigation.goBack(); }
          } catch (error) { Alert.alert("Error", "Failed to block user"); }
        },
      },
    ]);
  };

  const handleMessageLongPress = useCallback((msg: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMessage(msg);
    setShowMessageMenu(true);
  }, []);

  const handleReply = useCallback(() => {
    const msg = selectedMessage;
    setShowMessageMenu(false);
    setSelectedMessage(null);
    if (msg) setReplyingTo(msg);
  }, [selectedMessage]);

  const handleDeleteForMe = useCallback(async () => {
    if (!selectedMessage || !token) return;
    setShowMessageMenu(false);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/chat/message/${selectedMessage._id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success || response.ok) setMessages((prev) => prev.filter((m) => m._id !== selectedMessage._id));
      else Alert.alert("Error", data.message || "Failed to delete message");
    } catch (error) { Alert.alert("Error", "Failed to delete message"); }
    setSelectedMessage(null);
  }, [selectedMessage, token]);

  const handleDeleteForEveryone = useCallback(async () => {
    if (!selectedMessage || !token) return;
    setShowMessageMenu(false);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/chat/message/${selectedMessage._id}?deleteForEveryone=true`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success || response.ok) {
        setMessages((prev) => prev.map((m) => m._id === selectedMessage._id ? { ...m, content: "This message was deleted", text: "This message was deleted", type: "system" as const, deletedForEveryone: true } : m));
      } else Alert.alert("Error", data.message || "Failed to delete message");
    } catch (error) { Alert.alert("Error", "Failed to delete message"); }
    setSelectedMessage(null);
  }, [selectedMessage, token]);

  const handleEditOpen = useCallback(() => {
    if (!selectedMessage) return;
    setShowMessageMenu(false);
    setEditText(selectedMessage.content || selectedMessage.text || "");
    setEditingMessage(selectedMessage);
    setShowEditModal(true);
  }, [selectedMessage]);

  const handleEditSubmit = useCallback(async () => {
    if (!editingMessage || !token || !editText.trim()) return;
    setSubmittingEdit(true);
    try {
      const response = await patch<{ message: any }>(
        `/chat/message/${editingMessage._id}`,
        { content: editText.trim() },
        token
      );
      if (response.success) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === editingMessage._id
              ? { ...m, content: editText.trim(), edited: true, editedAt: new Date().toISOString() }
              : m
          )
        );
        setShowEditModal(false);
        setEditingMessage(null);
        setEditText("");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Cannot edit", response.message || response.error || "Failed to edit message");
      }
    } catch {
      Alert.alert("Error", "Failed to edit message");
    } finally {
      setSubmittingEdit(false);
    }
  }, [editingMessage, token, editText, patch]);

  const handleTranslateOpen = useCallback(() => {
    setShowMessageMenu(false);
    setTranslatedText("");
    setTranslateTargetLang(savedTranslateLang);
    setShowTranslateModal(true);
  }, [savedTranslateLang]);

  const handleTranslate = useCallback(async (targetLanguage: string) => {
    if (!selectedMessage || !token) return;
    const textToTranslate = selectedMessage.content || selectedMessage.text || "";
    if (!textToTranslate) return;
    setTranslating(true);
    try {
      const response = await post<{ translatedText: string }>("/ai/translate", { text: textToTranslate, targetLanguage, sourceLanguage: "auto" }, token);
      if (response.success && response.data?.translatedText) {
        setTranslatedText(response.data.translatedText);
        setSavedTranslateLang(targetLanguage);
        AsyncStorage.setItem("@emorii_translate_lang", targetLanguage).catch(() => {});
      } else Alert.alert("Error", response.message || "Translation failed");
    } catch (error) { Alert.alert("Error", (error as any)?.message || "Translation failed"); }
    finally { setTranslating(false); }
  }, [selectedMessage, token, post]);

  const handleCopyTranslation = useCallback(async () => {
    if (translatedText) { await Clipboard.setStringAsync(translatedText); Alert.alert("Copied", "Translation copied to clipboard"); }
  }, [translatedText]);


  useEffect(() => {
    if (!autoTranslateEnabled || !savedTranslateLang || !token) return;
    const untranslated = enrichedMessages.filter(m => {
      const senderId = typeof m.sender === "string" ? m.sender : m.sender?._id;
      const isMe = String(senderId) === String(myId);
      const text = m.content || (m as any).text || "";
      return !isMe && text && m.type === "text" && !autoTranslatedMessages[m._id] && !autoTranslatingRef.current.has(m._id);
    });
    if (untranslated.length === 0) return;
    untranslated.slice(0, 5).forEach(async (msg) => {
      const text = msg.content || (msg as any).text || "";
      autoTranslatingRef.current.add(msg._id);
      setTranslatingMessageIds(prev => new Set([...prev, msg._id]));
      try {
        const response = await post<{ translatedText: string }>("/ai/translate", { text, targetLanguage: savedTranslateLang, sourceLanguage: "auto" }, token);
        if (response.success && response.data?.translatedText) {
          setAutoTranslatedMessages(prev => ({ ...prev, [msg._id]: response.data!.translatedText }));
        }
      } catch (_) {}
      finally {
        autoTranslatingRef.current.delete(msg._id);
        setTranslatingMessageIds(prev => { const n = new Set(prev); n.delete(msg._id); return n; });
      }
    });
  }, [autoTranslateEnabled, savedTranslateLang, enrichedMessages, token, myId]);

  const handleReact = useCallback(async (emoji: string) => {
    if (!selectedMessage || !matchId || !token) return;
    setShowReactionPicker(false);
    setShowMessageMenu(false);
    try {
      const response = await post<{ reactions: MessageReaction[] }>(
        `/chat/${matchId}/messages/${selectedMessage._id}/react`,
        { emoji },
        token
      );
      if (response.success && response.data?.reactions) {
        setMessages(prev => prev.map(m =>
          m._id === selectedMessage._id ? { ...m, reactions: response.data!.reactions } : m
        ));
      }
    } catch (e) {
      logger.error('React error:', e);
    }
    setSelectedMessage(null);
  }, [selectedMessage, matchId, token, post]);

  const handleSubmitReport = async () => {
    if (!selectedReportReason) { Alert.alert("Select Reason", "Please select a reason for reporting"); return; }
    setSubmittingReport(true);
    try {
      const payload: any = { reportedUserId: userId, reason: selectedReportReason, description: reportDetails, matchId };
      if (reportTargetMessage) {
        payload.contentId = reportTargetMessage._id;
        if (reportTargetMessage.type === "image" && reportTargetMessage.imageUrl) {
          payload.contentType = "message_image";
          payload.contentUrl = reportTargetMessage.imageUrl;
          payload.contentPreview = reportTargetMessage.content || "Reported image message";
        } else if (reportTargetMessage.type === "audio") {
          payload.contentType = "message_audio";
          payload.contentPreview = "Voice message";
        } else if (reportTargetMessage.type === "video") {
          payload.contentType = "message_video";
          payload.contentPreview = "Video message";
        } else {
          payload.contentType = "message_text";
          payload.contentPreview = reportTargetMessage.content || reportTargetMessage.text || "Text message";
        }
      }
      const response = await post("/reports", payload, token || "");
      if (response.success) { setShowReportModal(false); setSelectedReportReason(null); setReportDetails(""); setReportTargetMessage(null); Alert.alert("Report Submitted", "Thank you for your report. Our team will review it shortly."); }
    } catch (error) { Alert.alert("Error", "Failed to submit report. Please try again."); }
    finally { setSubmittingReport(false); }
  };


  const shouldShowDateHeader = (currentMsg: Message, prevMsg: Message | null) => {
    if (!prevMsg) return true;
    return new Date(currentMsg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
  };

  type EnrichedMessage = Message & { _showDateHeader: boolean };

  const enrichedMessages = useMemo<EnrichedMessage[]>(() => {
    // Fast path: messages from the API and from optimistic-append are already
    // in chronological order. Skip the sort unless we actually find an item
    // out of order (paranoid safety net for socket race conditions).
    let needsSort = false;
    for (let i = 1; i < messages.length; i++) {
      if (
        new Date(messages[i].createdAt).getTime() <
        new Date(messages[i - 1].createdAt).getTime()
      ) {
        needsSort = true;
        break;
      }
    }
    const sorted = needsSort
      ? [...messages].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )
      : messages;
    return sorted.map((msg, index) => ({
      ...msg,
      _showDateHeader: shouldShowDateHeader(msg, index > 0 ? sorted[index - 1] : null),
    }));
  }, [messages]);


  // Identify the last own message that has been seen — we only render the
  // "Seen at HH:MM" caption on this single message to avoid noisy footers
  // on every bubble (matches WhatsApp / iMessage behavior).
  const lastSeenOwnMessageId = useMemo(() => {
    for (let i = enrichedMessages.length - 1; i >= 0; i--) {
      const m = enrichedMessages[i];
      const senderId = typeof m.sender === "string" ? m.sender : m.sender?._id;
      if (String(senderId) === String(myId) && m.status === "seen") {
        return m._id;
      }
    }
    return null;
  }, [enrichedMessages, myId]);

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSwipeReply = useCallback((item: Message) => setReplyingTo(item), []);

  const scrollToMessage = useCallback((messageId: string) => {
    const originalIndex = enrichedMessages.findIndex(m => m._id === messageId);
    if (originalIndex === -1) return;
    try {
      flatListRef.current?.scrollToIndex({ index: originalIndex, animated: true, viewPosition: 0.5 });
    } catch {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    setHighlightedMessageId(messageId);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedMessageId(null), 1500);
  }, [enrichedMessages]);

  const renderMessage = useCallback(
    ({ item }: { item: EnrichedMessage }) => {
      const senderId = typeof item.sender === "string" ? item.sender : item.sender?._id;
      const isMe = String(senderId) === String(myId);
      const showDateHeader = item._showDateHeader;
      const messageText = item.deletedForEveryone ? "This message was deleted" : item.content || item.text || "";

      return (
        <View>
          {showDateHeader && (
            <View style={styles.dateHeaderContainer}>
              <View style={[styles.dateHeader, { backgroundColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.10)" }]}>
                <ThemedText style={[styles.dateHeaderText, { color: isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.55)" }]}>{formatDateHeader(item.createdAt)}</ThemedText>
              </View>
            </View>
          )}

          {item.type === "call" ? (
            <View style={styles.callLogContainer}>
              <View style={[styles.callLogCard, { backgroundColor: isDark ? "#131929" : "#F0F4FF", borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)" }]}>
                <View style={[styles.callLogIconCircle, {
                  backgroundColor: messageText.toLowerCase().includes("video") ? "#0EA5E9" + "22" : theme.primary + "22",
                }]}>
                  <Ionicons
                    name={messageText.toLowerCase().includes("video") ? "videocam" : "call"}
                    size={17}
                    color={messageText.toLowerCase().includes("video") ? "#0EA5E9" : theme.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.callLogText, { color: theme.text }]}>{messageText}</ThemedText>
                  <ThemedText style={[styles.callLogTime, { color: theme.textSecondary }]}>{formatMessageTime(item.createdAt)}</ThemedText>
                </View>
              </View>
            </View>
          ) : item.type === "system" || item.deletedForEveryone ? (
            <View style={styles.systemMessageContainer}>
              <View style={[styles.systemMessage, { backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)" }]}>
                {item.deletedForEveryone && (
                  <Ionicons name="trash-outline" size={12} color={isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.40)"} style={{ marginRight: 5 }} />
                )}
                <ThemedText style={[styles.systemMessageText, { color: isDark ? "rgba(255,255,255,0.50)" : "rgba(0,0,0,0.42)" }]}>{messageText}</ThemedText>
              </View>
            </View>
          ) : (
            <SwipeableMessage item={item} isMe={isMe} onReply={handleSwipeReply} themeTextSecondary={theme.textSecondary}>
              <Pressable onLongPress={() => handleMessageLongPress(item)} delayLongPress={400}>
                <View style={[styles.messageRow, isMe ? styles.messageRowRight : styles.messageRowLeft]}>

                  <GradientBubble
                    isMe={isMe}
                    style={[
                      styles.messageBubble,
                      isMe ? styles.myBubble : styles.theirBubble,
                      !isMe && { backgroundColor: isDark ? "#1C2333" : "#FFFFFF" },
                      chatBubbleStyle === "sharp" && { borderRadius: 6 },
                      chatBubbleStyle === "sharp" && (isMe ? { borderBottomRightRadius: 2 } : { borderBottomLeftRadius: 2 }),
                      chatBubbleStyle === "minimal" && { borderRadius: 14, borderBottomRightRadius: isMe ? 14 : undefined, borderBottomLeftRadius: !isMe ? 14 : undefined },
                      (item.type === "image" || item.type === "video") && !messageText ? { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 0 } : {},
                      item.type === "location" ? { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 0 } : {},
                      item._id === highlightedMessageId && { borderWidth: 2, borderColor: isMe ? "rgba(255,255,255,0.7)" : theme.primary },
                    ]}
                  >
                    {item.replyTo && (
                      <Pressable
                        onPress={() => scrollToMessage(item.replyTo!.messageId)}
                        style={({ pressed }) => [
                          styles.replyPreviewInBubble,
                          { backgroundColor: isMe ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.06)", borderLeftColor: isMe ? "#FFF" : theme.primary, opacity: pressed ? 0.7 : 1 }
                        ]}
                      >
                        <ThemedText style={[styles.replyPreviewName, { color: isMe ? "rgba(255,255,255,0.9)" : theme.primary }]} numberOfLines={1}>{item.replyTo.senderName}</ThemedText>
                        <ThemedText style={[styles.replyPreviewText, { color: isMe ? "rgba(255,255,255,0.7)" : theme.textSecondary }]} numberOfLines={2}>
                          {item.replyTo.type === "image" ? "📷 Photo" : item.replyTo.type === "video" ? "🎬 Video" : item.replyTo.type === "audio" ? "🎤 Voice message" : item.replyTo.content}
                        </ThemedText>
                      </Pressable>
                    )}

                    {/* ── Story reaction / reply bubble ── */}
                    {(item.type === "story_reaction" || item.type === "story_reply") && (
                      <View style={[
                        styles.storyContextCard,
                        { backgroundColor: isMe ? "rgba(255,255,255,0.15)" : isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
                          borderColor: isMe ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.08)" }
                      ]}>
                        {/* Story icon + label */}
                        <View style={styles.storyContextHeader}>
                          <Ionicons
                            name={item.type === "story_reaction" ? "heart" : "chatbubble-ellipses"}
                            size={12}
                            color={isMe ? "rgba(255,255,255,0.8)" : theme.primary}
                          />
                          <ThemedText style={[styles.storyContextLabel, { color: isMe ? "rgba(255,255,255,0.75)" : theme.textSecondary }]}>
                            {item.type === "story_reaction" ? "Reacted to your story" : "Replied to your story"}
                          </ThemedText>
                        </View>

                        {/* Story preview snippet */}
                        {item.storyReaction?.storyPreview ? (
                          <View style={styles.storyPreviewRow}>
                            {/* If it's an image/video URL, show a thumbnail */}
                            {item.storyReaction.storyPreview.startsWith("http") ? (
                              <View style={[styles.storyThumbnail, { backgroundColor: "rgba(0,0,0,0.2)" }]}>
                                <Ionicons name="images-outline" size={18} color="rgba(255,255,255,0.6)" />
                              </View>
                            ) : (
                              <ThemedText
                                style={[styles.storyPreviewText, { color: isMe ? "rgba(255,255,255,0.65)" : theme.textSecondary }]}
                                numberOfLines={2}
                              >
                                {item.storyReaction.storyPreview}
                              </ThemedText>
                            )}
                            {/* Emoji for reactions */}
                            {item.type === "story_reaction" && item.storyReaction.emoji && (
                              <ThemedText style={styles.storyEmoji}>{item.storyReaction.emoji}</ThemedText>
                            )}
                          </View>
                        ) : null}
                      </View>
                    )}

                    {item.type === "image" && item.imageUrl && (() => {
                      const isSender = String(typeof item.sender === 'string' ? item.sender : item.sender?._id) === String(myId);
                      const isViewedByMe = openedViewOnceIds.has(item._id) || (item.viewOnceOpenedBy || []).some((id: string) => String(id) === String(myId));
                      if (item.viewOnce && isSender) {
                        return (
                          <View style={[styles.viewOncePlaceholder, { backgroundColor: 'rgba(0,0,0,0.10)' }]}>
                            <Ionicons name="eye-outline" size={20} color="rgba(255,255,255,0.7)" />
                            <ThemedText style={[styles.viewOnceLabel, { color: 'rgba(255,255,255,0.75)' }]}>View once photo sent</ThemedText>
                          </View>
                        );
                      }
                      if (item.viewOnce && !isSender && isViewedByMe) {
                        return (
                          <View style={[styles.viewOncePlaceholder, { backgroundColor: 'rgba(0,0,0,0.08)' }]}>
                            <Ionicons name="eye-off-outline" size={20} color="rgba(128,128,128,0.6)" />
                            <ThemedText style={[styles.viewOnceLabel, { color: theme.textSecondary }]}>Photo opened</ThemedText>
                          </View>
                        );
                      }
                      if (item.viewOnce && !isSender && !isViewedByMe) {
                        return (
                          <Pressable style={[styles.viewOnceTap, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}
                            onPress={() => {
                              handleMarkViewOnce(item._id);
                              setViewOnceViewerActive(true);
                              setViewingImage(item.imageUrl!);
                              startViewOnceCountdown(() => {
                                setViewingImage(null);
                                stopViewOnceCountdown();
                              });
                            }}>
                            <Ionicons name="eye-outline" size={22} color={theme.primary} />
                            <ThemedText style={[styles.viewOnceLabel, { color: theme.primary }]}>Tap to view (once)</ThemedText>
                          </Pressable>
                        );
                      }
                      const isFailed = (item as any).status === "failed";
                      const isSending = (item as any).status === "sending";
                      return (
                        <Pressable
                          onPress={() => {
                            if (isFailed) { retryFailedMedia(item); return; }
                            if (isSending) return;
                            setViewOnceViewerActive(false);
                            openImageViewer(item.imageUrl!);
                          }}
                          onLongPress={() => !isFailed && !isSending && saveImage(item.imageUrl!)}
                        >
                          <Image source={{ uri: item.imageUrl }} style={styles.messageImage} contentFit="cover" />
                          {isSending && (
                            <View style={styles.mediaStatusBadge}>
                              <ActivityIndicator color="#FFF" size="small" />
                            </View>
                          )}
                          {isFailed && (
                            <View style={styles.mediaStatusOverlay}>
                              <Ionicons name="refresh-circle" size={36} color="#FFF" />
                              <ThemedText style={styles.mediaStatusText}>Tap to retry</ThemedText>
                            </View>
                          )}
                          {!isSending && !isFailed && (
                            <Pressable style={styles.imageSaveButton} onPress={() => saveImage(item.imageUrl!)}>
                              <Ionicons name="download-outline" size={16} color="#FFF" />
                            </Pressable>
                          )}
                        </Pressable>
                      );
                    })()}
                    {item.type === "video" && (item.videoUrl || item.imageUrl) && (() => {
                      const isSender = String(typeof item.sender === 'string' ? item.sender : item.sender?._id) === String(myId);
                      const isViewedByMe = openedViewOnceIds.has(item._id) || (item.viewOnceOpenedBy || []).some((id: string) => String(id) === String(myId));
                      if (item.viewOnce && isSender) {
                        return (
                          <View style={[styles.viewOncePlaceholder, { backgroundColor: 'rgba(0,0,0,0.10)' }]}>
                            <Ionicons name="eye-outline" size={20} color="rgba(255,255,255,0.7)" />
                            <ThemedText style={[styles.viewOnceLabel, { color: 'rgba(255,255,255,0.75)' }]}>View once video sent</ThemedText>
                          </View>
                        );
                      }
                      if (item.viewOnce && !isSender && isViewedByMe) {
                        return (
                          <View style={[styles.viewOncePlaceholder, { backgroundColor: 'rgba(0,0,0,0.08)' }]}>
                            <Ionicons name="eye-off-outline" size={20} color="rgba(128,128,128,0.6)" />
                            <ThemedText style={[styles.viewOnceLabel, { color: theme.textSecondary }]}>Video opened</ThemedText>
                          </View>
                        );
                      }
                      if (item.viewOnce && !isSender && !isViewedByMe) {
                        return (
                          <Pressable style={[styles.viewOnceTap, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}
                            onPress={() => {
                              const url = item.videoUrl || item.imageUrl;
                              if (url) {
                                handleMarkViewOnce(item._id);
                                setViewOnceViewerActive(true);
                                setViewingVideo(url);
                                startViewOnceCountdown(() => {
                                  setViewingVideo(null);
                                  stopViewOnceCountdown();
                                });
                              }
                            }}>
                            <Ionicons name="eye-outline" size={22} color={theme.primary} />
                            <ThemedText style={[styles.viewOnceLabel, { color: theme.primary }]}>Tap to view (once)</ThemedText>
                          </Pressable>
                        );
                      }
                      const isFailedVid = (item as any).status === "failed";
                      const isSendingVid = (item as any).status === "sending";
                      return (
                        <Pressable
                          onPress={() => {
                            if (isFailedVid) { retryFailedMedia(item); return; }
                            if (isSendingVid) return;
                            const url = item.videoUrl || item.imageUrl;
                            if (url) { setViewOnceViewerActive(false); setViewingVideo(url); }
                          }}
                          style={styles.videoContainer}
                        >
                          {failedThumbnails.has(item._id) ? (
                            <View style={[styles.videoThumbnail, { backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" }]}>
                              <Ionicons name="videocam" size={48} color="rgba(255,255,255,0.7)" />
                              <ThemedText style={{ color: "#FFF", fontSize: 12, marginTop: 4 }}>Tap to play</ThemedText>
                            </View>
                          ) : (
                            <Image
                              source={{ uri: (() => { const url = item.videoUrl || item.imageUrl || ""; if (url.includes("cloudinary.com")) return url.replace("/upload/", "/upload/so_0,w_400,h_300,c_fill/").replace(/.(mp4|mov|avi|webm)$/i, ".jpg"); return url.replace(/.[^.]+$/, ".jpg"); })() }}
                              style={styles.videoThumbnail} contentFit="cover"
                              onError={() => setFailedThumbnails((prev) => new Set(prev).add(item._id))}
                            />
                          )}
                          {isSendingVid ? (
                            <View style={styles.mediaStatusBadge}>
                              <ActivityIndicator color="#FFF" size="small" />
                            </View>
                          ) : isFailedVid ? (
                            <View style={styles.mediaStatusOverlay}>
                              <Ionicons name="refresh-circle" size={36} color="#FFF" />
                              <ThemedText style={styles.mediaStatusText}>Tap to retry</ThemedText>
                            </View>
                          ) : (
                            <View style={styles.videoOverlay}>
                              <View style={styles.videoPlayButton}>
                                <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.9)" />
                              </View>
                            </View>
                          )}
                          {!item.viewOnce && !isSendingVid && !isFailedVid && (
                            <Pressable style={styles.imageSaveButton} onPress={(e: any) => { e.stopPropagation(); saveVideo(item.videoUrl || item.imageUrl!); }}>
                              <Ionicons name="download-outline" size={16} color="#FFF" />
                            </Pressable>
                          )}
                        </Pressable>
                      );
                    })()}

                    {item.type === "audio" && item.audioUrl && (() => {
                      const isFailedAud = (item as any).status === "failed";
                      const isSendingAud = (item as any).status === "sending";
                      const isActiveBubble = playingAudioId === item._id || playingAudioId === "paused:" + item._id;
                      const isUnplayed = !isMe && !isSendingAud && !isFailedAud && !playedAudioIds.has(item._id);
                      return (
                        <View>
                          <Pressable
                            style={[styles.audioPlayer, { backgroundColor: isMe ? "rgba(255,255,255,0.15)" : isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", opacity: isSendingAud ? 0.7 : 1 }]}
                            onPress={() => {
                              if (isFailedAud) { retryFailedMedia(item); return; }
                              if (isSendingAud) return;
                              playAudio(item.audioUrl!, item._id);
                            }}
                            onLongPress={() => !isSendingAud && handleMessageLongPress(item)}
                            delayLongPress={400}
                          >
                            <View style={[styles.audioPlayBtn, { backgroundColor: isMe ? "rgba(255,255,255,0.25)" : theme.primary + "22" }]}>
                              {isSendingAud ? (
                                <ActivityIndicator size="small" color={isMe ? "#FFF" : theme.primary} />
                              ) : isFailedAud ? (
                                <Ionicons name="refresh" size={18} color={isMe ? "#FFF" : theme.primary} />
                              ) : (
                                <Ionicons
                                  name={playingAudioId === item._id ? "pause" : "play"}
                                  size={18}
                                  color={isMe ? "#FFF" : theme.primary}
                                />
                              )}
                            </View>
                            <View style={styles.audioWaveform}>
                              <WavyWaveform
                                isPlaying={playingAudioId === item._id}
                                progress={isActiveBubble ? audioProgress : 0}
                                isMe={isMe}
                                theme={theme}
                                duration={(item as any).audioDuration}
                                onSeek={isActiveBubble ? seekAudio : undefined}
                              />
                            </View>
                            {isActiveBubble && (
                              <Pressable
                                onPress={(e: any) => { e.stopPropagation?.(); togglePlaybackSpeed(); }}
                                style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, backgroundColor: isMe ? "rgba(255,255,255,0.25)" : theme.primary + "22" }}
                              >
                                <ThemedText style={{ fontSize: 11, fontWeight: "700", color: isMe ? "#FFF" : theme.primary }}>
                                  {playbackRate}x
                                </ThemedText>
                              </Pressable>
                            )}
                            {isUnplayed && (
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary, marginLeft: 2 }} />
                            )}
                          </Pressable>
                          {isFailedAud && (
                            <ThemedText style={{ fontSize: 10, color: "#dc2626", marginTop: 4, marginLeft: 4 }}>
                              Tap to retry
                            </ThemedText>
                          )}
                        </View>
                      );
                    })()}

                    {item.type === "location" && item.latitude != null && item.longitude != null && (() => {
                      const lat = item.latitude!;
                      const lng = item.longitude!;
                      const z = 15;
                      const n = Math.pow(2, z);
                      const fx = ((lng + 180) / 360) * n;
                      const fy = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
                      const cx = Math.floor(fx);
                      const cy = Math.floor(fy);
                      const subTileX = (fx - cx) * 256;
                      const subTileY = (fy - cy) * 256;
                      const MAP_W = 240;
                      const MAP_H = 160;
                      const gridLeft = -(256 + subTileX - MAP_W / 2);
                      const gridTop = -(256 + subTileY - MAP_H / 2);
                      const tiles = [];
                      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push({ x: cx + dx, y: cy + dy, dx, dy });
                      return (
                        <Pressable
                          onPress={() => {
                            const label = item.address || `${lat}, ${lng}`;
                            const url = Platform.select({ ios: `maps:0,0?q=${label}@${lat},${lng}`, android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`, default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` });
                            Linking.openURL(url!).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`));
                          }}
                          style={styles.locationBubble}
                        >
                          <View style={styles.locationMapContainer}>
                            <View style={[styles.locationTileGrid, { top: gridTop, left: gridLeft }]}>
                              {tiles.map((t, i) => (
                                <Image key={i}
                                  source={{ uri: Platform.OS === "web" ? `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${t.x}/${t.y}@2x.png` : `https://tile.openstreetmap.org/${z}/${t.x}/${t.y}.png`, headers: Platform.OS !== "web" ? { "User-Agent": "Emorii/1.0" } : undefined }}
                                  style={styles.locationTile} contentFit="cover"
                                />
                              ))}
                            </View>
                            <View style={styles.locationGradientOverlay}>
                              <View style={styles.locationGradientLayer1} />
                              <View style={styles.locationGradientLayer2} />
                              <View style={styles.locationGradientLayer3} />
                            </View>
                            <View style={styles.locationPinOverlay}>
                              <View style={styles.locationPinShadow} />
                              <Ionicons name="location-sharp" size={32} color="#E53935" style={{ marginTop: -16, textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 }} />
                            </View>
                          </View>
                          <View style={[styles.locationInfoRow, { backgroundColor: isMe ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.03)" }]}>
                            <View style={[styles.locationIconCircle, { backgroundColor: isMe ? "rgba(255,255,255,0.2)" : theme.primary + "18" }]}>
                              <Ionicons name="navigate" size={14} color={isMe ? "#FFF" : theme.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <ThemedText style={[styles.locationAddress, { color: isMe ? "#FFF" : theme.text }]} numberOfLines={2}>{item.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</ThemedText>
                              {(() => {
                                const isLive = item.liveExpiresAt && new Date(item.liveExpiresAt) > new Date();
                                if (isLive) {
                                  return (
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#dc2626", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                                        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" }} />
                                        <ThemedText style={{ fontSize: 9, color: "#fff", fontWeight: "700", letterSpacing: 0.5 }}>LIVE</ThemedText>
                                      </View>
                                      <ThemedText style={[styles.locationTapText, { color: isMe ? "rgba(255,255,255,0.7)" : theme.textSecondary }]}>
                                        {formatLiveRemaining(item.liveExpiresAt)}
                                      </ThemedText>
                                    </View>
                                  );
                                }
                                return (
                                  <View style={styles.locationTapHint}>
                                    <ThemedText style={[styles.locationTapText, { color: isMe ? "rgba(255,255,255,0.6)" : theme.textSecondary }]}>Tap to open in maps</ThemedText>
                                    <Feather name="external-link" size={10} color={isMe ? "rgba(255,255,255,0.5)" : theme.textSecondary} />
                                  </View>
                                );
                              })()}
                            </View>
                          </View>
                          {isMe && item.liveExpiresAt && new Date(item.liveExpiresAt) > new Date() && (
                            <Pressable
                              onPress={(e) => { e.stopPropagation(); handleStopLiveShare(String(item._id)); }}
                              style={{ paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.2)", alignItems: "center" }}
                            >
                              <ThemedText style={{ color: "#fecaca", fontSize: 12, fontWeight: "600" }}>Stop sharing</ThemedText>
                            </Pressable>
                          )}
                        </Pressable>
                      );
                    })()}

                    {(() => {
                      const serverTx = !isMe ? (item as any).translatedText as string | undefined : undefined;
                      const clientTx = !isMe && autoTranslateEnabled ? autoTranslatedMessages[item._id] : undefined;
                      const activeTx = serverTx || clientTx;
                      const isViewingOriginal = showingOriginal.has(item._id);
                      const displayText = activeTx && !isViewingOriginal ? activeTx : messageText;
                      const txLangLabel = ((item as any).targetLanguage || savedTranslateLang || '').toUpperCase();
                      return (
                        <>
                          {displayText && item.type !== "audio" && item.type !== "location" ? (
                            <ThemedText style={[styles.messageText, { color: isMe ? "#FFF" : theme.text }]}>{displayText}</ThemedText>
                          ) : null}
                          {activeTx && item.type === "text" && (
                            <Pressable
                              onPress={() => setShowingOriginal(prev => {
                                const next = new Set(prev);
                                if (next.has(item._id)) next.delete(item._id); else next.add(item._id);
                                return next;
                              })}
                              style={{ alignSelf: "flex-end", marginTop: 3 }}
                              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                            >
                              <ThemedText style={{ fontSize: 10, color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)", fontStyle: "italic", textDecorationLine: "underline" }}>
                                {isViewingOriginal ? `${txLangLabel ? txLangLabel + ' ' : ''}translation` : "original"}
                              </ThemedText>
                            </Pressable>
                          )}
                          {!activeTx && !isMe && autoTranslateEnabled && item.type === "text" && translatingMessageIds.has(item._id) && (
                            <ThemedText style={{ fontSize: 10, color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.22)", fontStyle: "italic", marginTop: 2, alignSelf: "flex-end" }}>
                              translating…
                            </ThemedText>
                          )}
                        </>
                      );
                    })()}

                    <View style={styles.messageFooter}>
                      {item.edited && (
                        <ThemedText style={[styles.messageTime, { color: isMe ? "rgba(255,255,255,0.55)" : theme.textSecondary, fontStyle: "italic", marginRight: 4 }]}>edited</ThemedText>
                      )}
                      <ThemedText style={[styles.messageTime, { color: isMe ? "rgba(255,255,255,0.7)" : theme.textSecondary }]}>{formatMessageTime(item.createdAt)}</ThemedText>
                      {isMe && (
                        (item as any).status === "pending" ? (
                          <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
                        ) : (item as any).status === "failed" ? (
                          <Ionicons name="alert-circle-outline" size={14} color="#FF6B6B" style={{ marginLeft: 4 }} />
                        ) : (
                          <Ionicons
                            name={item.status === "seen" || item.status === "delivered" ? "checkmark-done" : "checkmark"}
                            size={14}
                            color={item.status === "seen" ? "#4FC3F7" : item.status === "delivered" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)"}
                            style={{ marginLeft: 4 }}
                          />
                        )
                      )}
                    </View>
                    {isMe && item._id === lastSeenOwnMessageId && item.status === "seen" && (
                      <ThemedText
                        style={{
                          fontSize: 10,
                          color: "rgba(255,255,255,0.65)",
                          alignSelf: "flex-end",
                          marginTop: 2,
                          fontStyle: "italic",
                        }}
                      >
                        Seen{isPremium && item.seenAt ? ` at ${formatMessageTime(item.seenAt)}` : ""}
                      </ThemedText>
                    )}
                  </GradientBubble>

                </View>

                  {item.reactions && item.reactions.length > 0 && (
                    <View style={[styles.reactionsRow, isMe ? { alignSelf: 'flex-end', marginRight: 12 } : { alignSelf: 'flex-start', marginLeft: 12 }]}>
                      {(() => {
                        const grouped: Record<string, number> = {};
                        (item.reactions || []).forEach(r => { grouped[r.emoji] = (grouped[r.emoji] || 0) + 1; });
                        return Object.entries(grouped).map(([emoji, count]) => (
                          <Pressable
                            key={emoji}
                            style={[styles.reactionBubble, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)' }]}
                            onPress={() => {
                              setSelectedMessage(item);
                              handleReact(emoji);
                            }}
                          >
                            <ThemedText style={styles.reactionEmoji}>{emoji}</ThemedText>
                            {count > 1 && <ThemedText style={[styles.reactionCount, { color: theme.textSecondary }]}>{count}</ThemedText>}
                          </Pressable>
                        ));
                      })()}
                    </View>
                  )}
              </Pressable>
            </SwipeableMessage>
          )}
        </View>
      );
    },
    [myId, theme, isDark, userPhoto, handleMessageLongPress, handleSwipeReply, playingAudioId, audioProgress, failedThumbnails, chatBubbleStyle, highlightedMessageId, scrollToMessage, openedViewOnceIds, lastSeenOwnMessageId, isPremium],
  );

  const keyExtractor = useCallback((item: EnrichedMessage) => item._id, []);
  const currentTheme = CHAT_THEMES.find((t) => t.id === chatTheme);
  const photoSource = getPhotoSource(userPhoto);

  const chatContent = (
    <>
      {isOffline && (
        <View style={{ backgroundColor: "#f59e0b", paddingVertical: 7, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" style={{ marginRight: 6 }} />
          <ThemedText style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
            You're offline — messages will send when reconnected
          </ThemedText>
        </View>
      )}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlashList
          ref={flatListRef}
          data={enrichedMessages}
          keyExtractor={keyExtractor}
          renderItem={renderMessage}
          extraData={[playingAudioId, audioProgress, highlightedMessageId, openedViewOnceIds, showingOriginal, autoTranslatedMessages]}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={80}
          initialNumToRender={20}
          // Tell FlashList how to recycle items by content type. Without this,
          // a text-bubble row may try to recycle a slot that previously held a
          // tall image/voice row, causing visible layout shifts ("jumping")
          // during fast scrolling. Grouping by type lets the recycler reuse
          // similarly-sized cells.
          getItemType={(item: EnrichedMessage) => {
            if (item.type === 'system' || item.type === 'call') return 'system';
            if (item.type === 'image' || item.type === 'video') return 'media';
            if (item.type === 'audio') return 'audio';
            return 'text';
          }}
          maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 0.2, startRenderingFromBottom: true }}
          onScrollToIndexFailed={(info: { index: number; highestMeasuredFrameIndex?: number; averageItemLength?: number }) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            }, 300);
          }}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distanceFromBottom = Math.max(
              0,
              contentSize.height - (contentOffset.y + layoutMeasurement.height),
            );
            const distanceFromTop = contentOffset.y;
            const nearBottom = distanceFromBottom < 120;
            isNearBottomRef.current = nearBottom;
            // The first real user-driven scroll AWAY from the bottom counts
            // as "initial scroll done" — after this point we stop force-
            // snapping to the bottom and only auto-follow when they're
            // already near the latest message. This is what lets users
            // freely scroll up through history without getting yanked back
            // down.
            if (distanceFromBottom > 120) initialScrollDoneRef.current = true;
            // Show the floating "scroll to latest" pill once the user has
            // scrolled noticeably away from the bottom; hide it (and clear
            // the unread badge) the moment they scroll back to the latest
            // message.
            if (nearBottom) {
              if (showScrollToBottomFab) setShowScrollToBottomFab(false);
              if (historyUnreadCount > 0) setHistoryUnreadCount(0);
            } else if (distanceFromBottom > 240 && !showScrollToBottomFab) {
              setShowScrollToBottomFab(true);
            }
            // Load older messages when the user scrolls near the top of
            // the chronological list (oldest message at top).
            if (distanceFromTop < 120 && hasMoreMessages && !loadingMore) {
              loadMoreMessages();
            }
          }}
          scrollEventThrottle={100}
          onLayout={() => {
            // Initial layout pass — make sure the chat opens on the newest
            // message even if FlashList's first render measured before the
            // messages were ready.
            if (!initialScrollDoneRef.current) scrollToBottom(false);
          }}
          onContentSizeChange={() => {
            // Two cases:
            //  1. The chat just opened and content finished laying out — we
            //     force-snap to the newest message regardless of state so
            //     the user never lands on an older bubble.
            //  2. A new message arrived while the user is already at the
            //     bottom — keep them at the bottom (WhatsApp behaviour).
            if (!initialScrollDoneRef.current) {
              scrollToBottom(false);
              // Mark initial scroll done after a short delay so any
              // remaining layout passes still snap correctly.
              setTimeout(() => { initialScrollDoneRef.current = true; }, 800);
            } else if (isNearBottomRef.current) {
              scrollToBottom(true);
            }
          }}
          ListHeaderComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 12, alignItems: "center" }}>
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            ) : hasMoreMessages ? (
              <Pressable style={{ paddingVertical: 12, alignItems: "center" }} onPress={loadMoreMessages}>
                <ThemedText style={{ color: theme.primary, fontSize: 13 }}>Load older messages</ThemedText>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconContainer, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                <Feather name="message-circle" size={40} color="#FFF" />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: "#FFF" }]}>Start the conversation</ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: "rgba(255,255,255,0.7)" }]}>Say hello to {userName}!</ThemedText>
              <Pressable style={[styles.aiSuggestButton, { backgroundColor: theme.primary }]} onPress={fetchAISuggestions}>
                <MaterialCommunityIcons name="robot" size={18} color="#FFF" />
                <ThemedText style={styles.aiSuggestButtonText}>Get AI Suggestions</ThemedText>
              </Pressable>
            </View>
          }
        />
      )}

      {/* Floating "scroll to latest message" pill — appears when the user has
          scrolled up to read older history. Shows a badge with the number of
          new messages that arrived while they were reading. Tapping it
          jumps to the newest message and clears the badge. */}
      {showScrollToBottomFab && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            historyUnreadCount > 0
              ? `${historyUnreadCount} new message${historyUnreadCount === 1 ? "" : "s"}, scroll to latest`
              : "Scroll to latest message"
          }
          onPress={() => {
            isNearBottomRef.current = true;
            setHistoryUnreadCount(0);
            setShowScrollToBottomFab(false);
            scrollToBottom(true);
          }}
          style={[
            styles.scrollToBottomFab,
            {
              backgroundColor: isDark ? "rgba(30,30,40,0.95)" : "#FFFFFF",
              borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
            },
          ]}
        >
          <Feather name="chevron-down" size={22} color={isDark ? "#FFF" : theme.text} />
          {historyUnreadCount > 0 && (
            <View style={[styles.scrollToBottomBadge, { backgroundColor: theme.primary }]}>
              <ThemedText style={styles.scrollToBottomBadgeText}>
                {historyUnreadCount > 99 ? "99+" : String(historyUnreadCount)}
              </ThemedText>
            </View>
          )}
        </Pressable>
      )}

      {isOtherRecording && !isTyping && (
        <View style={styles.typingIndicator}>
          <View style={[styles.typingBubble, { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)" }]}>
            <Feather name="mic" size={14} color="#F44336" />
            <ThemedText style={[styles.typingLabel, { color: "#F44336", marginLeft: 6 }]}>recording voice</ThemedText>
          </View>
        </View>
      )}

      {isTyping && (
        <View style={styles.typingIndicator}>
          <View style={[styles.typingBubble, { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)" }]}>
            <View style={styles.typingDots}>
              <Animated.View style={[styles.typingDot, { backgroundColor: theme.primary, transform: [{ scale: typingDotAnim1.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.2] }) }], opacity: typingDotAnim1.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }]} />
              <Animated.View style={[styles.typingDot, { backgroundColor: theme.primary, marginHorizontal: 5, transform: [{ scale: typingDotAnim2.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.2] }) }], opacity: typingDotAnim2.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }]} />
              <Animated.View style={[styles.typingDot, { backgroundColor: theme.primary, transform: [{ scale: typingDotAnim3.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.2] }) }], opacity: typingDotAnim3.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }]} />
            </View>
            <ThemedText style={[styles.typingLabel, { color: theme.textSecondary }]}>typing</ThemedText>
          </View>
        </View>
      )}
    </>
  );

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <ChatHeader
        theme={theme}
        isDark={isDark}
        photoSource={photoSource}
        userName={userName}
        otherUserVerified={otherUserVerified}
        isOnline={isOnline}
        isTyping={isTyping}
        isOtherRecording={isOtherRecording}
        statusText={getStatusText()}
        onBack={() => navigation.goBack()}
        onProfilePress={() => navigation.navigate("ProfileDetail" as any, { userId })}
        onVoiceCall={handleVoiceCall}
        onVideoCall={handleVideoCall}
        onOpenOptions={() => setShowOptionsMenu(true)}
      />

      {/* BODY */}
      <KAVController style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        {currentTheme?.image ? (
          <ImageBackground source={currentTheme.image} style={[styles.chatBackground, { flex: 1 }]} resizeMode="cover">{chatContent}</ImageBackground>
        ) : (
          <View style={[styles.chatBackground, { flex: 1, backgroundColor: isDark ? "#080C16" : "#E9EDF2" }]}>{chatContent}</View>
        )}

        {showAISuggestions && (
          <View style={[styles.aiSuggestionsContainer, { backgroundColor: theme.background, borderTopColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }]}>
            <View style={styles.aiSuggestionsHeader}>
              <MaterialCommunityIcons name="robot" size={18} color={theme.primary} />
              <ThemedText style={[styles.aiSuggestionsTitle, { color: theme.text }]}>AI Suggestions</ThemedText>
              <Pressable onPress={() => setShowAISuggestions(false)}><Feather name="x" size={20} color={theme.textSecondary} /></Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.aiSuggestionsScroll}>
              {aiSuggestions.map((suggestion, index) => (
                <Pressable key={index} style={[styles.aiSuggestionChip, { backgroundColor: theme.primary + "20", borderColor: theme.primary }]} onPress={() => sendMessage(suggestion)}>
                  <ThemedText style={[styles.aiSuggestionText, { color: theme.primary }]} numberOfLines={2}>{suggestion}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {showEmojiPicker && (
          <View style={[styles.emojiPicker, { backgroundColor: theme.background, borderTopColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiScrollContent}>
              {EMOJI_LIST.map((emoji, index) => (
                <Pressable key={index} onPress={() => handleEmojiSelect(emoji)} style={styles.emojiButton}>
                  <ThemedText style={styles.emojiText}>{emoji}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {replyingTo && (
          <View style={[styles.replyBar, { backgroundColor: theme.background, borderTopColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }]}>
            <View style={[styles.replyBarAccent, { backgroundColor: theme.primary }]} />
            <View style={styles.replyBarContent}>
              <ThemedText style={[styles.replyBarName, { color: theme.primary }]} numberOfLines={1}>
                {(() => { const sid = typeof replyingTo.sender === "string" ? replyingTo.sender : replyingTo.sender?._id; return String(sid) === String(myId) ? "You" : userName; })()}
              </ThemedText>
              <ThemedText style={[styles.replyBarText, { color: theme.textSecondary }]} numberOfLines={1}>
                {replyingTo.type === "image" ? "📷 Photo" : replyingTo.type === "video" ? "🎬 Video" : replyingTo.type === "audio" ? "🎤 Voice message" : replyingTo.content || replyingTo.text || ""}
              </ThemedText>
            </View>
            <Pressable onPress={() => setReplyingTo(null)} style={styles.replyBarClose}><Feather name="x" size={20} color={theme.textSecondary} /></Pressable>
          </View>
        )}

        {/* Slide-in icebreaker popup — only when the conversation is empty */}
        {icebreakerPopup ? (
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.icebreakerPopupWrap,
              { transform: [{ translateX: icebreakerSlide }] },
            ]}
          >
            <Pressable
              onPress={useIcebreakerPopup}
              style={[
                styles.icebreakerPopup,
                {
                  backgroundColor: theme.primary,
                  shadowColor: isDark ? "#000" : theme.primary,
                },
              ]}
            >
              <View style={styles.icebreakerHeaderRow}>
                <View style={styles.icebreakerSparkleCircle}>
                  <MaterialCommunityIcons name="lightbulb-on" size={14} color="#FFF" />
                </View>
                <ThemedText style={styles.icebreakerLabel}>Icebreaker</ThemedText>
                <Pressable onPress={dismissIcebreakerPopup} hitSlop={10} style={styles.icebreakerClose}>
                  <Feather name="x" size={16} color="rgba(255,255,255,0.85)" />
                </Pressable>
              </View>
              <ThemedText style={styles.icebreakerText} numberOfLines={3}>
                {icebreakerPopup}
              </ThemedText>
              <View style={styles.icebreakerCta}>
                <ThemedText style={styles.icebreakerCtaText}>Tap to use</ThemedText>
                <Feather name="arrow-right" size={13} color="#FFF" />
              </View>
            </Pressable>
          </Animated.View>
        ) : null}

        <Animated.View style={[styles.inputContainer, { backgroundColor: theme.background, borderTopColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)", paddingBottom: inputPaddingAnim, minHeight: 60 }]}>
          {recordingPreview ? (
            <View style={styles.recordingContainer}>
              <Pressable onPress={discardRecordingPreview} style={styles.cancelRecordButton}><Feather name="trash-2" size={22} color="#F44336" /></Pressable>
              <Pressable onPress={togglePreviewPlay} style={[styles.audioPlayBtn, { backgroundColor: theme.primary + "22", marginLeft: 8 }]}>
                <Ionicons name={previewPlaying ? "pause" : "play"} size={18} color={theme.primary} />
              </Pressable>
              <View style={[styles.recordingInfo, { flex: 1 }]}>
                <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.border + "55", overflow: "hidden" }}>
                  <View style={{ width: `${Math.min(100, previewProgress * 100)}%`, height: "100%", backgroundColor: theme.primary }} />
                </View>
                <ThemedText style={[styles.recordingTime, { color: theme.text, marginLeft: 10 }]}>
                  {formatRecordingTime(recordingPreview.duration)}
                </ThemedText>
              </View>
              <Pressable onPress={sendRecordingPreview} style={[styles.sendRecordButton, { backgroundColor: theme.primary }]}>
                <Feather name="send" size={20} color="#FFF" />
              </Pressable>
            </View>
          ) : isRecording ? (
            <View style={styles.recordingContainer}>
              <Pressable onPress={cancelRecording} style={styles.cancelRecordButton}><Feather name="x" size={24} color="#F44336" /></Pressable>
              <View style={styles.recordingInfo}>
                <Animated.View style={[styles.recordingDot, { transform: [{ scale: recordingPulse }], opacity: recordingPaused ? 0.3 : 1 }]} />
                <ThemedText style={[styles.recordingTime, { color: theme.text }]}>{formatRecordingTime(recordingDuration)}</ThemedText>
                <ThemedText style={[styles.recordingLabel, { color: theme.textSecondary }]}>{recordingPaused ? "Paused" : "Recording"}</ThemedText>
              </View>
              <Pressable
                onPress={recordingPaused ? resumeRecording : pauseRecording}
                style={[styles.audioPlayBtn, { backgroundColor: theme.primary + "22", marginRight: 8 }]}
              >
                <Ionicons name={recordingPaused ? "play" : "pause"} size={18} color={theme.primary} />
              </Pressable>
              <Pressable onPress={stopRecording} style={[styles.sendRecordButton, { backgroundColor: theme.primary }]}><Feather name="check" size={20} color="#FFF" /></Pressable>
            </View>
          ) : (
            <>
              {/* View-once active indicator — visible in the input bar when toggle is ON.
                  Persists after the attachment menu closes so the user always knows
                  the next media will be sent as view-once. Tap it to cancel. */}
              {viewOnceSent ? (
                <View style={[styles.viewOnceChip, { backgroundColor: '#22C55E18', borderColor: '#22C55E40' }]}>
                  <Ionicons name="checkmark-circle-outline" size={13} color="#22C55E" />
                  <ThemedText style={[styles.viewOnceChipText, { color: '#22C55E' }]}>Saved & Sent</ThemedText>
                </View>
              ) : viewOnceMode && (
                <Pressable
                  style={styles.viewOnceChip}
                  onPress={() => setViewOnceModeSync(false)}
                  accessibilityLabel="View Once active — tap to disable"
                >
                  <Ionicons name="eye-outline" size={13} color="#FF6B6B" />
                  <ThemedText style={styles.viewOnceChipText}>View Once</ThemedText>
                  <Feather name="x" size={11} color="#FF6B6B" />
                </Pressable>
              )}
              <Pressable style={styles.attachButton} onPress={() => setShowAttachmentMenu(true)}><Feather name="plus-circle" size={26} color={theme.primary} /></Pressable>
              <View style={[styles.inputWrapper, { backgroundColor: isDark ? "#1A2035" : "#F0F2F5" }]}>
                <TextInput
                  ref={inputRef}
                  style={[styles.textInput, { color: theme.text }]}
                  placeholder="Type a message..."
                  placeholderTextColor={theme.textSecondary}
                  value={message}
                  autoCorrect={true}
                  autoCapitalize="sentences"
                  onChangeText={(text) => {
                    setMessage(text);
                    handleTypingIndicator();
                    if (userId) {
                      if (text.trim()) AsyncStorage.setItem(`chat_draft_${userId}`, text).catch(() => {});
                      else AsyncStorage.removeItem(`chat_draft_${userId}`).catch(() => {});
                    }
                  }}
                  multiline
                  maxLength={1000}
                />
                <Pressable style={styles.emojiToggle} onPress={() => setShowEmojiPicker(!showEmojiPicker)}>
                  <Feather name="smile" size={22} color={showEmojiPicker ? theme.primary : theme.textSecondary} />
                </Pressable>
              </View>
              <Pressable style={styles.aiButton} onPress={fetchAISuggestions}>
                <MaterialCommunityIcons name="robot" size={24} color={showAISuggestions ? theme.primary : theme.textSecondary} />
              </Pressable>
              <SendOrMicSwap
                hasMessage={hasMessage}
                sending={sending}
                themePrimary={theme.primary}
                onSend={() => sendMessage()}
                onMicStart={startRecording}
              />
            </>
          )}
        </Animated.View>
      </KAVController>

      <AttachmentMenu
        visible={showAttachmentMenu}
        theme={theme}
        viewOnceMode={viewOnceMode}
        isSendingLocation={isSendingLocation}
        onClose={() => setShowAttachmentMenu(false)}
        onToggleViewOnce={() => setViewOnceModeSync(v => !v)}
        onTakePhoto={handleTakePhoto}
        onPickImage={handlePickImage}
        onPickVideo={handlePickVideo}
        onOpenLivePicker={() => { setShowAttachmentMenu(false); setShowLivePicker(true); }}
      />

      <LiveLocationPicker
        visible={showLivePicker}
        theme={theme}
        onClose={() => setShowLivePicker(false)}
        onSendCurrent={() => { setShowLivePicker(false); handleShareLocation(); }}
        onShareLive={(mins) => handleShareLocation(mins)}
      />

      <OptionsMenu
        visible={showOptionsMenu}
        theme={theme}
        isDark={isDark}
        screenshotProtection={screenshotProtection}
        onClose={() => setShowOptionsMenu(false)}
        onToggleProtection={() => { setShowOptionsMenu(false); toggleScreenshotProtection(); }}
        onOpenTheme={() => { setShowOptionsMenu(false); setShowThemeModal(true); }}
        onToggleColorMode={() => { setShowOptionsMenu(false); setThemeMode(isDark ? "light" : "dark"); }}
        onOpenReport={() => { setShowOptionsMenu(false); setReportTargetMessage(null); setShowReportModal(true); }}
        onBlockUser={handleBlockUser}
      />

      <ChatThemeModal
        visible={showThemeModal}
        theme={theme}
        isDark={isDark}
        themes={CHAT_THEMES as any}
        currentChatTheme={chatTheme}
        onClose={() => setShowThemeModal(false)}
        onSelect={saveChatTheme}
      />

      <ReportModal
        visible={showReportModal}
        theme={theme}
        isDark={isDark}
        userName={userName}
        isReportingMessage={!!reportTargetMessage}
        reasons={REPORT_REASONS as any}
        selectedReportReason={selectedReportReason}
        reportDetails={reportDetails}
        submittingReport={submittingReport}
        onClose={() => { setShowReportModal(false); setReportTargetMessage(null); }}
        onSelectReason={setSelectedReportReason}
        onChangeDetails={setReportDetails}
        onSubmit={handleSubmitReport}
      />

      <ImageViewerModal
        viewingImage={viewingImage}
        imageGallery={imageGallery}
        imageViewerIndex={imageViewerIndex}
        imageViewerZoomed={imageViewerZoomed}
        imageViewerListRef={imageViewerListRef}
        viewOnceActive={viewOnceViewerActive}
        viewOnceCountdown={viewOnceCountdown}
        screenWidth={SCREEN_WIDTH}
        screenHeight={SCREEN_HEIGHT}
        onClose={() => { closeImageViewer(); stopViewOnceCountdown(); }}
        onSave={saveImage}
        onIndexChange={setImageViewerIndex}
        onZoomChange={setImageViewerZoomed}
      />

      <VideoViewerModal
        videoUri={viewingVideo}
        viewOnceActive={viewOnceViewerActive}
        viewOnceCountdown={viewOnceCountdown}
        onClose={() => { setViewingVideo(null); stopViewOnceCountdown(); }}
        onSave={saveVideo}
      />

      <MessageContextMenu
        visible={showMessageMenu}
        theme={theme}
        isDark={isDark}
        selectedMessage={selectedMessage}
        myId={myId}
        onClose={() => { setShowMessageMenu(false); setSelectedMessage(null); }}
        onReact={handleReact}
        onReply={handleReply}
        onTranslate={handleTranslateOpen}
        onEdit={handleEditOpen}
        onReportMessage={() => { setReportTargetMessage(selectedMessage); setShowMessageMenu(false); setShowReportModal(true); }}
        onDeleteForMe={handleDeleteForMe}
        onDeleteForEveryone={handleDeleteForEveryone}
      />

      <EditMessageModal
        visible={showEditModal}
        theme={theme}
        isDark={isDark}
        editText={editText}
        submittingEdit={submittingEdit}
        onChangeText={setEditText}
        onClose={() => { setShowEditModal(false); setEditingMessage(null); }}
        onSubmit={handleEditSubmit}
      />

      <TranslateModal
        visible={showTranslateModal}
        theme={theme}
        isDark={isDark}
        selectedMessage={selectedMessage}
        translateTargetLang={translateTargetLang}
        translatedText={translatedText}
        translating={translating}
        savedTranslateLang={savedTranslateLang}
        onClose={() => { setShowTranslateModal(false); setSelectedMessage(null); }}
        onSetLang={setTranslateTargetLang}
        onTranslate={handleTranslate}
        onCopyTranslation={handleCopyTranslation}
        onClearTranslation={() => setTranslatedText("")}
      />
    </ThemedView>
  );
}

// Gradient bubble wrapper — renders LinearGradient for sent messages and a
// plain View for received messages. Defined outside the main component so
// React never remounts it during re-renders.
const GradientBubble = React.memo(function GradientBubble({
  isMe,
  style,
  children,
}: {
  isMe: boolean;
  style: any;
  children: React.ReactNode;
}) {
  if (isMe) {
    return (
      <LinearGradient
        colors={["#34D399", "#10B981", "#059669"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={style}
      >
        {children}
      </LinearGradient>
    );
  }
  return <View style={style}>{children}</View>;
});

// Memoized swap between the send icon and the mic icon. Both views are
// kept mounted and crossfade with a fast (110ms) native-driven transition,
// so the toggle is perceptually instant and immune to the parent's
// keystroke re-renders.
const SendOrMicSwap = React.memo(function SendOrMicSwap({
  hasMessage,
  sending,
  themePrimary,
  onSend,
  onMicStart,
}: {
  hasMessage: boolean;
  sending: boolean;
  themePrimary: string;
  onSend: () => void;
  onMicStart: () => void;
}) {
  const sendOpacity = useRef(new Animated.Value(hasMessage ? 1 : 0)).current;
  const micOpacity = useRef(new Animated.Value(hasMessage ? 0 : 1)).current;
  const sendScale = useRef(new Animated.Value(hasMessage ? 1 : 0.6)).current;
  const micScale = useRef(new Animated.Value(hasMessage ? 0.6 : 1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(sendOpacity, { toValue: hasMessage ? 1 : 0, duration: 110, useNativeDriver: true }),
      Animated.timing(micOpacity, { toValue: hasMessage ? 0 : 1, duration: 110, useNativeDriver: true }),
      Animated.spring(sendScale, { toValue: hasMessage ? 1 : 0.6, useNativeDriver: true, bounciness: 6, speed: 28 }),
      Animated.spring(micScale, { toValue: hasMessage ? 0.6 : 1, useNativeDriver: true, bounciness: 6, speed: 28 }),
    ]).start();
  }, [hasMessage, sendOpacity, micOpacity, sendScale, micScale]);

  return (
    <View style={styles.sendMicSwap} pointerEvents="box-none">
      <Animated.View
        style={[styles.swapLayer, { opacity: micOpacity, transform: [{ scale: micScale }] }]}
        pointerEvents={hasMessage ? "none" : "auto"}
      >
        <Pressable style={styles.micButton} onPress={onMicStart} hitSlop={8}>
          <Feather name="mic" size={24} color={themePrimary} />
        </Pressable>
      </Animated.View>
      <Animated.View
        style={[styles.swapLayer, { opacity: sendOpacity, transform: [{ scale: sendScale }] }]}
        pointerEvents={hasMessage ? "auto" : "none"}
      >
        <Pressable
          onPress={onSend}
          style={[styles.sendButton, { backgroundColor: themePrimary }]}
          disabled={sending}
          hitSlop={8}
        >
          {sending ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={20} color="#FFF" />}
        </Pressable>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create<any>({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1 },
  backButton: { padding: 8 },
  headerProfile: { flex: 1, flexDirection: "row", alignItems: "center", marginLeft: 4 },
  avatarContainer: { position: "relative" },
  headerAvatar: { width: 44, height: 44, borderRadius: 22 },
  onlineIndicator: { position: "absolute", bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: "#22C55E", borderWidth: 2, borderColor: "#0D1117" },
  headerInfo: { marginLeft: 12, flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  headerName: { fontSize: 17, fontWeight: "700" },
  verifiedBadge: { width: 18, height: 18, marginLeft: 6 },
  headerStatus: { fontSize: 13, marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center" },
  headerActionButton: { padding: 10, marginLeft: 4 },
  chatBackground: { flex: 1 },
  scrollToBottomFab: {
    position: "absolute",
    right: 14,
    bottom: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  scrollToBottomBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollToBottomBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 13,
  },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  messagesList: { paddingHorizontal: 14, paddingVertical: 18, flexGrow: 1 },
  dateHeaderContainer: { alignItems: "center", marginVertical: 20 },
  dateHeader: { paddingHorizontal: 18, paddingVertical: 6, borderRadius: 20 },
  dateHeaderText: { fontSize: 11, fontWeight: "600", letterSpacing: 0.2 },
  systemMessageContainer: { alignItems: "center", marginVertical: 6 },
  systemMessage: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14 },
  systemMessageText: { fontSize: 12, fontWeight: "400" },
  callLogContainer: { alignItems: "center", marginVertical: 8, paddingHorizontal: 24 },
  callLogCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
    width: "100%",
  },
  callLogIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  callLogText: { fontSize: 14, fontWeight: "600" },
  callLogTime: { fontSize: 11, marginTop: 2 },
  messageRow: { flexDirection: "row", marginVertical: 3, alignItems: "flex-end" },
  messageRowLeft: { justifyContent: "flex-start" },
  messageRowRight: { justifyContent: "flex-end" },
  messageAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },
  messageBubble: {
    maxWidth: "75%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.10,
    shadowRadius: 4,
    elevation: 2,
  },
  myBubble: { borderBottomRightRadius: 4 },
  theirBubble: { borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 22 },
  messageImage: { width: 200, height: 150, borderRadius: 16, marginBottom: 6, overflow: "hidden" },
  messageFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 4 },
  messageTime: { fontSize: 11 },
  typingIndicator: { paddingHorizontal: 16, paddingVertical: 6 },
  typingBubble: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderBottomLeftRadius: 4, gap: 8 },
  typingDots: { flexDirection: "row", alignItems: "center" },
  typingDot: { width: 7, height: 7, borderRadius: 4 },
  typingLabel: { fontSize: 12, fontWeight: "500" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 100 },
  emptyIconContainer: { width: 80, height: 80, borderRadius: 40, justifyContent: "center", alignItems: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: "center", marginBottom: 20 },
  aiSuggestButton: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25 },
  aiSuggestButtonText: { color: "#FFF", fontSize: 14, fontWeight: "600", marginLeft: 8 },
  icebreakerPopupWrap: {
    position: "absolute",
    right: 12,
    bottom: 78,
    maxWidth: 280,
    zIndex: 50,
  },
  icebreakerPopup: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderBottomRightRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  icebreakerHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  icebreakerSparkleCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center",
    marginRight: 6,
  },
  icebreakerLabel: { flex: 1, color: "#FFF", fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  icebreakerClose: { padding: 2 },
  icebreakerText: { color: "#FFF", fontSize: 14, lineHeight: 19, fontWeight: "500" },
  icebreakerCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    alignSelf: "flex-end",
  },
  icebreakerCtaText: { color: "#FFF", fontSize: 12, fontWeight: "700", opacity: 0.9 },
  aiSuggestionsContainer: { borderTopWidth: 1, paddingVertical: 12 },
  aiSuggestionsHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 10 },
  aiSuggestionsTitle: { flex: 1, fontSize: 14, fontWeight: "600", marginLeft: 8 },
  aiSuggestionsScroll: { paddingHorizontal: 12 },
  aiSuggestionChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1, marginHorizontal: 4, maxWidth: 200 },
  aiSuggestionText: { fontSize: 13 },
  emojiPicker: { borderTopWidth: 1, paddingVertical: 12 },
  emojiScrollContent: { paddingHorizontal: 12 },
  emojiButton: { padding: 6 },
  emojiText: { fontSize: 28 },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 6,
  },
  recordingContainer: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cancelRecordButton: { padding: 12 },
  recordingInfo: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#F44336" },
  recordingTime: { fontSize: 18, fontWeight: "600" },
  recordingLabel: { fontSize: 13, fontWeight: "500" },
  sendRecordButton: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  attachButton: { padding: 6, marginBottom: 4 },
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 26,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 8 : 6,
    marginHorizontal: 6,
    minHeight: 46,
    maxHeight: 120,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  textInput: { flex: 1, fontSize: 15, maxHeight: 100, paddingHorizontal: 2, paddingTop: Platform.OS === "ios" ? 2 : 0, paddingBottom: Platform.OS === "ios" ? 2 : 2 },
  emojiToggle: { padding: 4, marginLeft: 6, marginBottom: Platform.OS === "ios" ? 2 : 0 },
  aiButton: { padding: 6, marginBottom: 4 },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  micButton: { padding: 8, marginBottom: 2 },
  sendMicSwap: { width: 46, height: 46, justifyContent: "center", alignItems: "center", marginBottom: 2 },
  swapLayer: { position: "absolute", justifyContent: "center", alignItems: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  attachmentMenu: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  attachmentTitle: { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 20 },
  attachmentOptions: { flexDirection: "row", justifyContent: "space-around", marginBottom: 24 },
  attachmentOption: { alignItems: "center" },
  attachmentIcon: { width: 60, height: 60, borderRadius: 30, justifyContent: "center", alignItems: "center", marginBottom: 8 },
  attachmentLabel: { fontSize: 14, fontWeight: "500" },
  cancelButton: { paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  cancelButtonText: { fontSize: 16, fontWeight: "600" },
  optionsMenu: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  optionsTitle: { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 20 },
  optionItem: { flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.1)" },
  optionText: { fontSize: 16, marginLeft: 16, flex: 1 },
  themeModal: { margin: 20, borderRadius: 20, padding: 20, maxHeight: "80%" },
  themeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  themeTitle: { fontSize: 20, fontWeight: "700" },
  themeGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  themeItem: { width: "31%", marginBottom: 16, borderRadius: 12, overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  themePreview: { width: "100%", aspectRatio: 0.8, justifyContent: "center", alignItems: "center" },
  themeName: { fontSize: 12, fontWeight: "500", textAlign: "center", paddingVertical: 6 },
  themeCheck: { position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  reportModal: { margin: 20, borderRadius: 20, padding: 24, maxHeight: "80%" },
  reportHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  reportTitle: { fontSize: 20, fontWeight: "700" },
  reportSubtitle: { fontSize: 14, marginBottom: 20 },
  reportReasons: { maxHeight: 280 },
  reportReasonItem: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  reportReasonText: { flex: 1, marginLeft: 12, fontSize: 15 },
  reportInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginTop: 16, minHeight: 80, textAlignVertical: "top" },
  submitReportButton: { marginTop: 20, paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  submitReportText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  imageSaveButton: { position: "absolute", bottom: 12, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  mediaStatusOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", borderRadius: 12 },
  mediaStatusBadge: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12, paddingHorizontal: 6, paddingVertical: 4, justifyContent: "center", alignItems: "center" },
  mediaStatusText: { color: "#FFF", fontSize: 12, fontWeight: "600", marginTop: 6 },
  audioPlayer: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16, minWidth: 180, gap: 8 },
  audioPlayBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: -8, marginBottom: 4, zIndex: 2, paddingHorizontal: 4 },
  reactionBubble: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 3, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, elevation: 2 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, fontWeight: "600" },
  quickReactionBar: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)", marginBottom: 4 },
  quickReactionBtn: { padding: 6 },
  quickReactionEmoji: { fontSize: 26 },
  audioWaveform: { flex: 1 },
  audioProgressBar: { height: 4, borderRadius: 2, overflow: "hidden" },
  audioProgressFill: { height: "100%", borderRadius: 2 },
  imageViewerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" },
  imageViewerClose: { position: "absolute", top: 50, right: 20, zIndex: 10, padding: 8 },
  imageViewerActions: { position: "absolute", top: 50, left: 20, zIndex: 10, flexDirection: "row", gap: 16 },
  imageViewerActionBtn: { padding: 8 },
  imageViewerImage: { width: SCREEN_WIDTH, height: "80%" },
  replyPreviewInBubble: { paddingHorizontal: 10, paddingVertical: 6, borderLeftWidth: 3, borderRadius: 6, marginBottom: 6 },
  replyPreviewName: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  replyPreviewText: { fontSize: 12 },
  replyBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
  replyBarAccent: { width: 4, height: "100%", borderRadius: 2, minHeight: 36 },
  replyBarContent: { flex: 1, marginLeft: 10 },
  replyBarName: { fontSize: 13, fontWeight: "700" },
  replyBarText: { fontSize: 13, marginTop: 2 },
  replyBarClose: { padding: 8 },
  messageMenuModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  messageMenuPreview: { padding: 12, borderRadius: 12, marginBottom: 16 },
  messageMenuPreviewText: { fontSize: 14 },
  messageMenuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" },
  messageMenuItemText: { fontSize: 16, marginLeft: 16, flex: 1 },
  translateModal: { margin: 20, borderRadius: 20, padding: 24, maxHeight: "80%" },
  translateHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  translateTitle: { fontSize: 20, fontWeight: "700" },
  translateOriginal: { padding: 12, borderRadius: 12, marginBottom: 16 },
  translateOriginalLabel: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  translateOriginalText: { fontSize: 14 },
  translateLoading: { alignItems: "center", paddingVertical: 40 },
  translateLoadingText: { marginTop: 12, fontSize: 14 },
  translateResult: { padding: 16, borderRadius: 12, borderWidth: 1 },
  translateResultLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  translateResultText: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  translateCopyBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  translateCopyText: { color: "#FFF", fontSize: 13, fontWeight: "600", marginLeft: 6 },
  translatePickLabel: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
  translateLangInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 16 },
  translateButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, gap: 8 },
  translateButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  videoContainer: { width: 200, height: 150, borderRadius: 16, overflow: "hidden", marginBottom: 6, position: "relative" },
  videoThumbnail: { width: 200, height: 150, borderRadius: 12 },
  videoOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 12 },
  videoPlayButton: { justifyContent: "center", alignItems: "center" },
  locationBubble: { width: 240, borderRadius: 16, overflow: "hidden", marginBottom: 4 },
  locationMapContainer: { width: 240, height: 160, position: "relative", backgroundColor: "#E0E0E0", overflow: "hidden", borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  locationTileGrid: { width: 256 * 3, height: 256 * 3, flexDirection: "row", flexWrap: "wrap", position: "absolute" },
  locationTile: { width: 256, height: 256 },
  locationGradientOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, height: 50 },
  locationGradientLayer1: { position: "absolute", bottom: 0, left: 0, right: 0, height: 50, backgroundColor: "rgba(0,0,0,0.08)" },
  locationGradientLayer2: { position: "absolute", bottom: 0, left: 0, right: 0, height: 30, backgroundColor: "rgba(0,0,0,0.12)" },
  locationGradientLayer3: { position: "absolute", bottom: 0, left: 0, right: 0, height: 12, backgroundColor: "rgba(0,0,0,0.18)" },
  locationPinOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  locationPinShadow: { position: "absolute", width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.25)", top: "53%" as any },
  locationInfoRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  locationIconCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  locationAddress: { fontSize: 13, fontWeight: "600", flex: 1, lineHeight: 17 },
  locationTapHint: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  locationTapText: { fontSize: 10 },

  viewOncePlaceholder: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, minWidth: 140 },
  viewOnceTap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, minWidth: 160 },
  viewOnceLabel: { fontSize: 13, fontWeight: '600' },
  viewOnceSenderBadge: { position: 'absolute', top: 6, right: 6, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, padding: 3 },
  viewOnceToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', marginBottom: 12 },
  viewOnceChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(255,107,107,0.12)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.3)', marginRight: 4 },
  viewOnceChipText: { fontSize: 11, color: '#FF6B6B', fontWeight: '600' },
  viewOnceToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewOnceToggleTitle: { fontSize: 13, fontWeight: '700' },
  viewOnceToggleDesc: { fontSize: 11, marginTop: 1 },
  viewOnceTogglePill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  viewOnceTogglePillText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  storyContextCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    marginBottom: 6,
  },
  storyContextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 5,
  },
  storyContextLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  storyPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storyThumbnail: {
    width: 36,
    height: 36,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyPreviewText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  storyEmoji: {
    fontSize: 22,
  },
});

export default function ChatDetailScreenWithBoundary(props: { navigation: any; route: any }) {
  return (
    <ErrorBoundary FallbackComponent={ScreenErrorFallback}>
      <ChatDetailScreen {...props} />
    </ErrorBoundary>
  );
}