import React, { useState, useEffect, useRef, useCallback } from "react";
import logger from '@/utils/logger';
import { formatTimeAgo } from '@/utils/formatters';
import {
  View, StyleSheet, Pressable, Dimensions, StatusBar, Animated,
  ActivityIndicator, TextInput, Platform, Alert, Modal, ScrollView,
  Keyboard, FlatList,
} from "react-native";
import { KeyboardAvoidingView as KAVController, KeyboardStickyView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import { Video, ResizeMode } from "../utils/expoAvCompat";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getPhotoSource } from "@/utils/photos";
import { getCachedStories, setCachedStories } from "@/utils/storyCache";
import * as Haptics from "expo-haptics";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const STORY_DURATION = 5000;

type StoryViewerScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "StoryViewer">;
type StoryViewerScreenRouteProp = RouteProp<RootStackParamList, "StoryViewer">;

interface StoryViewerScreenProps {
  navigation: StoryViewerScreenNavigationProp;
  route: StoryViewerScreenRouteProp;
}

interface StoryViewer {
  id: string;
  name: string;
  photo?: string;
  viewedAt: string;
}

interface Story {
  _id: string;
  type: "image" | "text" | "video";
  imageUrl?: string;
  mediaUrl?: string;
  textContent?: string;
  backgroundColor?: string[];
  createdAt: string;
  viewedBy?: string[];
  viewers?: StoryViewer[];
  viewCount?: number;
}

interface StoryUserEntry {
  id: string;
  name: string;
  photo?: string;
}

// ─── Single-user story page ───────────────────────────────────────────────────

interface UserStoryPageProps {
  userId: string;
  userName: string;
  userPhoto?: string;
  isActive: boolean;
  onFinished: () => void;
  onGoBack: () => void;
  navigation: StoryViewerScreenNavigationProp;
  isOwnStoryOverride?: boolean;
}

const UserStoryPage = React.memo(function UserStoryPage({
  userId,
  userName,
  userPhoto,
  isActive,
  onFinished,
  onGoBack,
  navigation,
  isOwnStoryOverride,
}: UserStoryPageProps) {
  const { theme } = useTheme();
  const { token, user } = useAuth();
  const { get, post, put, del } = useApi();
  const insets = useSafeAreaInsets();

  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [editingText, setEditingText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [videoDuration, setVideoDuration] = useState(STORY_DURATION);
  const [showViewers, setShowViewers] = useState(false);
  const [showStoryMenu, setShowStoryMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('inappropriate');
  const [reportDetails, setReportDetails] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  const isOwnStory =
    isOwnStoryOverride !== undefined
      ? isOwnStoryOverride
      : String(userId) === String(user?.id) || String(userId) === String((user as any)?._id);

  const REACTIONS = ["❤️", "🔥", "😍", "😂", "😮", "😢"];

  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const videoDurationSet = useRef(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setCurrentIndex(0);
    setLoading(true);
    setAccessDenied(false);

    const fetchStories = async () => {
      const isOwn =
        String(userId) === String(user?.id) ||
        String(userId) === String((user as any)?._id) ||
        isOwnStoryOverride === true;

      try {
        const cached = await getCachedStories<Story[]>(String(userId));
        if (!cancelled && cached && cached.length > 0) {
          setStories(cached);
          setLoading(false);
        }
      } catch { /* non-fatal */ }

      try {
        const endpoint = isOwn ? `/stories/my-stories` : `/stories/user/${userId}`;
        const response = await get<{ stories: Story[]; message?: string }>(endpoint, token);
        if (cancelled) return;
        if (response.success && response.data?.stories) {
          const fetchedStories = response.data.stories;
          setStories(fetchedStories);
          setCachedStories(String(userId), fetchedStories).catch(() => {});
          if (fetchedStories.length > 0 && !isOwn) {
            markStoryViewed(fetchedStories[0]._id);
          }
        } else if (!response.success) {
          const errorMsg = (response as any).message || "Unable to view stories";
          if (errorMsg.includes("authorized") || errorMsg.includes("friends") || errorMsg.includes("matches")) {
            setAccessDenied(true);
            setAccessMessage(errorMsg);
          }
        }
      } catch (error: any) {
        if (cancelled) return;
        logger.error("Error fetching stories:", error);
        if (error?.response?.status === 403 || error?.message?.includes("403")) {
          setAccessDenied(true);
          setAccessMessage("You need to match with this user to view their stories");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStories();
    return () => { cancelled = true; };
  }, [userId, token, user?.id]);

  useEffect(() => {
    videoDurationSet.current = false;
    if (isActive && stories.length > 0 && !paused) {
      startProgress();
    } else {
      if (progressAnimation.current) {
        progressAnimation.current.stop();
      }
    }
    return () => {
      if (progressAnimation.current) {
        progressAnimation.current.stop();
      }
    };
  }, [currentIndex, stories.length, paused, isActive]);

  const markStoryViewed = async (storyId: string) => {
    if (!token || !storyId || isOwnStory) return;
    try {
      await post(`/stories/${storyId}/view`, {}, token);
    } catch (error) {
      logger.error("Mark story viewed error:", error);
    }
  };

  const handleDeleteStory = async () => {
    if (!token || !currentStory) return;
    Alert.alert("Delete Story", "Are you sure you want to delete this story?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const response = await del(`/stories/${currentStory._id}`, token);
            if (response.success) {
              if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              const newStories = stories.filter(s => s._id !== currentStory._id);
              if (newStories.length === 0) {
                onFinished();
              } else {
                setStories(newStories);
                if (currentIndex >= newStories.length) {
                  setCurrentIndex(newStories.length - 1);
                }
              }
            } else {
              Alert.alert("Error", "Failed to delete story");
            }
          } catch (error) {
            logger.error("Delete story error:", error);
            Alert.alert("Error", "Failed to delete story");
          }
        },
      },
    ]);
  };

  const handleUpdateStory = async () => {
    if (!token || !currentStory || !editingText.trim()) return;
    setIsSaving(true);
    try {
      const response = await put<{ success: boolean; message: string }>(
        `/stories/${currentStory._id}`,
        { textContent: editingText, backgroundColor: currentStory.backgroundColor },
        token,
      );
      if (response.success) {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Story updated successfully!");
        setStories(stories.map(s => s._id === currentStory._id ? { ...s, textContent: editingText } : s));
        setIsEditing(false);
        resumeProgress();
      } else {
        Alert.alert("Error", "Failed to update story");
      }
    } catch (error) {
      logger.error("Update story error:", error);
      Alert.alert("Error", "Failed to update story");
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = () => {
    if (currentStory.type !== 'text') return;
    pauseProgress();
    setEditingText(currentStory.textContent || "");
    setIsEditing(true);
  };

  const startProgress = (customDuration?: number) => {
    const duration = customDuration || (stories[currentIndex]?.type === 'video' ? videoDuration : STORY_DURATION);
    progressAnim.setValue(0);
    progressAnimation.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    });
    progressAnimation.current.start(({ finished }) => {
      if (finished) goToNext();
    });
  };

  const pauseProgress = () => {
    setPaused(true);
    if (progressAnimation.current) progressAnimation.current.stop();
  };

  const resumeProgress = () => {
    setPaused(false);
  };

  const goToNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
      markStoryViewed(stories[currentIndex + 1]?._id);
    } else {
      onFinished();
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      onGoBack();
    }
  };

  const handleTap = (side: "left" | "right") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (side === "left") goToPrevious();
    else goToNext();
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !token) return;
    try {
      await post(`/stories/${stories[currentIndex]._id}/reply`, { message: replyText }, token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReplyText("");
      setShowReplyInput(false);
      Alert.alert("Reply sent!");
    } catch (error) {
      logger.error("Reply error:", error);
      Alert.alert("Error", "Failed to send reply. Please try again.");
    }
  };

  const handleReaction = async (emoji: string) => {
    if (!token || !stories[currentIndex]) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (userReaction === emoji) {
        await del(`/stories/${stories[currentIndex]._id}/react`, token);
        setUserReaction(null);
      } else {
        await post(`/stories/${stories[currentIndex]._id}/react`, { emoji }, token);
        setUserReaction(emoji);
      }
      setShowReactionPicker(false);
    } catch (error) {
      logger.error("Reaction error:", error);
    }
  };

  const toggleReactionPicker = () => {
    pauseProgress();
    setShowReactionPicker(!showReactionPicker);
    if (showReactionPicker) resumeProgress();
  };

  const handleShareStory = async () => {
    if (!currentStory) { Alert.alert("Error", "This story cannot be shared"); return; }
    try {
      const { Share } = require('react-native');
      await Share.share({ message: "Hey! Check out this story on Emorii - Download the app to see it! 🌍❤️" });
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  const handleReportStory = () => {
    if (!currentStory) return;
    pauseProgress();
    setReportReason('inappropriate');
    setReportDetails('');
    setShowReportModal(true);
  };

  const handleSubmitReport = async () => {
    if (!token || !currentStory || reportLoading) return;
    setReportLoading(true);
    try {
      const response = await post("/reports", {
        reportedUserId: userId,
        reason: reportReason,
        description: reportDetails.trim() || undefined,
        contentType: "story",
        contentId: currentStory._id,
        contentUrl: currentStory.imageUrl || currentStory.mediaUrl,
        contentPreview: currentStory.textContent || "Reported story",
      }, token);
      setShowReportModal(false);
      resumeProgress();
      if (response.success) {
        Alert.alert("Reported", "Thank you. Our team will review this story.");
      } else {
        Alert.alert("Error", "Failed to submit report");
      }
    } catch {
      Alert.alert("Error", "Failed to submit report");
    } finally {
      setReportLoading(false);
    }
  };

  const currentStory = stories[currentIndex];

  const storyBg = React.useMemo(() => {
    if (!currentStory) return ["#FF6B6B", "#FF8E8E"];
    if (currentStory.type === "image" || currentStory.type === "video") return ["transparent", "transparent"];
    if (Array.isArray(currentStory.backgroundColor)) return currentStory.backgroundColor;
    if (typeof currentStory.backgroundColor === "string") return [currentStory.backgroundColor, currentStory.backgroundColor];
    return ["#FF6B6B", "#FF8E8E"];
  }, [currentStory]);

  if (loading) {
    return (
      <View style={[pageStyles.page, pageStyles.centered]}>
        <ActivityIndicator size="large" color="#FFF" />
      </View>
    );
  }

  if (!currentStory || stories.length === 0 || accessDenied) {
    return (
      <View style={[pageStyles.page, pageStyles.centered]}>
        <Ionicons
          name={accessDenied ? "lock-closed-outline" : "images-outline"}
          size={64}
          color="rgba(255,255,255,0.5)"
        />
        <ThemedText style={pageStyles.noStoriesText}>
          {accessDenied ? accessMessage || "Stories are private" : "No stories available"}
        </ThemedText>
        {accessDenied && (
          <ThemedText style={pageStyles.accessHint}>
            Match with {userName} to view their stories
          </ThemedText>
        )}
      </View>
    );
  }

  return (
    <View style={pageStyles.page}>
      {currentStory.type === "image" && (currentStory.imageUrl || currentStory.mediaUrl) ? (
        <View style={StyleSheet.absoluteFillObject}>
          <Image
            source={{ uri: currentStory.imageUrl || currentStory.mediaUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            cachePolicy="disk"
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
            transition={200}
          />
        </View>
      ) : currentStory.type === "video" && (currentStory.imageUrl || currentStory.mediaUrl) ? (
        <View style={[StyleSheet.absoluteFillObject, { borderRadius: 24, overflow: 'hidden' }]}>
          <Video
            source={{ uri: (currentStory.imageUrl || currentStory.mediaUrl) as string }}
            style={{ width: '100%', height: '100%' }}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={isActive && !paused}
            isLooping={false}
            onPlaybackStatusUpdate={(status: any) => {
              if (status.isLoaded && status.durationMillis && !videoDurationSet.current) {
                videoDurationSet.current = true;
                setVideoDuration(status.durationMillis);
                if (isActive && !paused) startProgress(status.durationMillis);
              }
              if (status.didJustFinish) goToNext();
            }}
            useNativeControls={false}
          />
        </View>
      ) : (
        <LinearGradient colors={storyBg as [string, string]} style={pageStyles.textStoryBg}>
          {isEditing ? (
            <View style={pageStyles.editContainer}>
              <TextInput
                style={pageStyles.editInput}
                value={editingText}
                onChangeText={setEditingText}
                multiline
                autoFocus
                maxLength={200}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
              <View style={pageStyles.editActions}>
                <Pressable
                  style={[pageStyles.editActionButton, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
                  onPress={() => { setIsEditing(false); resumeProgress(); }}
                >
                  <ThemedText style={pageStyles.editActionText}>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  style={[pageStyles.editActionButton, { backgroundColor: theme.primary }]}
                  onPress={handleUpdateStory}
                  disabled={isSaving}
                >
                  {isSaving
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <ThemedText style={pageStyles.editActionText}>Save</ThemedText>
                  }
                </Pressable>
              </View>
            </View>
          ) : (
            <ThemedText style={pageStyles.textStoryContent}>
              {currentStory.textContent}
            </ThemedText>
          )}
        </LinearGradient>
      )}

      {/* Top gradient + progress bars + header */}
      <LinearGradient
        colors={["rgba(0,0,0,0.6)", "transparent"]}
        style={[pageStyles.topGradient, { paddingTop: insets.top }]}
      >
        <View style={pageStyles.progressContainer}>
          {stories.map((_, index) => (
            <View key={index} style={pageStyles.progressBarBg}>
              <Animated.View
                style={[
                  pageStyles.progressBarFill,
                  {
                    width:
                      index < currentIndex
                        ? "100%"
                        : index === currentIndex
                        ? progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] })
                        : "0%",
                  },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={pageStyles.header}>
          <Pressable
            style={pageStyles.userInfo}
            onPress={() => {
              if (isOwnStory) {
                navigation.navigate("MainTabs" as any, { screen: "MyProfile" });
              } else {
                navigation.navigate("ProfileDetail", { userId });
              }
            }}
          >
            <View style={pageStyles.avatarContainer}>
              <Image
                source={userPhoto ? getPhotoSource(userPhoto) : require('../assets/icon.png')}
                style={pageStyles.userAvatar}
              />
              {isOwnStory && (
                <Pressable
                  style={[pageStyles.addStoryBadge, { backgroundColor: theme.primary }]}
                  onPress={(e) => { e.stopPropagation(); navigation.navigate("StoryUpload" as any); }}
                >
                  <Ionicons name="add" size={12} color="#FFF" />
                </Pressable>
              )}
            </View>
            <View style={{ maxWidth: 120 }}>
              <ThemedText style={pageStyles.userName} numberOfLines={1}>{userName}</ThemedText>
              <ThemedText style={pageStyles.storyTime}>{formatTimeAgo(currentStory.createdAt)}</ThemedText>
            </View>
          </Pressable>

          <View style={[pageStyles.headerActions, { flexShrink: 0 }]}>
            {isOwnStory && (
              <View>
                <Pressable
                  style={pageStyles.headerButtonHighVis}
                  onPress={(e) => { e.stopPropagation(); setShowStoryMenu(v => !v); pauseProgress(); }}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color="#FFF" />
                </Pressable>
                {showStoryMenu && (
                  <View style={pageStyles.storyMenuDropdown}>
                    {currentStory?.type === 'text' && (
                      <Pressable
                        style={pageStyles.storyMenuItem}
                        onPress={() => { setShowStoryMenu(false); startEditing(); }}
                      >
                        <Ionicons name="pencil" size={16} color="#FFF" />
                        <ThemedText style={pageStyles.storyMenuItemText}>Edit</ThemedText>
                      </Pressable>
                    )}
                    <Pressable
                      style={[pageStyles.storyMenuItem, pageStyles.storyMenuItemDanger]}
                      onPress={() => { setShowStoryMenu(false); resumeProgress(); handleDeleteStory(); }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#FF6B6B" />
                      <ThemedText style={[pageStyles.storyMenuItemText, { color: '#FF6B6B' }]}>Delete</ThemedText>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
            {!isOwnStory && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  style={pageStyles.headerButtonHighVis}
                  onPress={handleReportStory}
                >
                  <Ionicons name="flag-outline" size={16} color="#FFF" />
                </Pressable>
              </View>
            )}
            <Pressable
              style={pageStyles.headerButtonHighVis}
              onPress={paused ? resumeProgress : pauseProgress}
            >
              <Ionicons name={paused ? "play" : "pause"} size={16} color="#FFF" />
            </Pressable>
            <Pressable
              style={pageStyles.headerButtonHighVis}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="close" size={18} color="#FFF" />
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      {/* Tap areas for prev/next story */}
      <View style={pageStyles.tapAreas}>
        <Pressable
          style={pageStyles.leftTap}
          onPress={() => handleTap("left")}
          onLongPress={pauseProgress}
          onPressOut={resumeProgress}
        />
        <Pressable
          style={pageStyles.rightTap}
          onPress={() => handleTap("right")}
          onLongPress={pauseProgress}
          onPressOut={resumeProgress}
        />
      </View>

      {/* Bottom actions */}
      <KeyboardStickyView style={pageStyles.bottomGradientWrapper}>
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.6)"]}
          style={[pageStyles.bottomGradient, { paddingBottom: showReplyInput ? 16 : insets.bottom + 16 }]}
        >
          {showReplyInput ? (
            <View style={pageStyles.replyInputContainer}>
              <Pressable
                style={pageStyles.replyCloseButton}
                onPress={() => { setShowReplyInput(false); setReplyText(''); Keyboard.dismiss(); resumeProgress(); }}
              >
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
              </Pressable>
              <TextInput
                style={pageStyles.replyInput}
                placeholder="Send a message..."
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={replyText}
                onChangeText={setReplyText}
                autoFocus
                returnKeyType="send"
                onSubmitEditing={handleSendReply}
                blurOnSubmit={false}
              />
              <Pressable style={pageStyles.sendButton} onPress={handleSendReply}>
                <Ionicons name="send" size={20} color="#FFF" />
              </Pressable>
            </View>
          ) : !isOwnStory ? (
            <View style={pageStyles.bottomActions}>
              {showReactionPicker && (
                <View style={pageStyles.reactionPicker}>
                  {REACTIONS.map((emoji) => (
                    <Pressable
                      key={emoji}
                      style={[pageStyles.reactionEmoji, userReaction === emoji && pageStyles.reactionEmojiSelected]}
                      onPress={() => handleReaction(emoji)}
                    >
                      <ThemedText style={pageStyles.reactionEmojiText}>{emoji}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              )}
              <Pressable style={pageStyles.replyButton} onPress={() => { pauseProgress(); setShowReplyInput(true); }}>
                <Feather name="message-circle" size={24} color="#FFF" />
                <ThemedText style={pageStyles.replyButtonText}>Reply</ThemedText>
              </Pressable>
              <View style={pageStyles.actionButtons}>
                <Pressable style={pageStyles.actionButton} onPress={toggleReactionPicker}>
                  {userReaction
                    ? <ThemedText style={pageStyles.activeReaction}>{userReaction}</ThemedText>
                    : <Ionicons name="heart-outline" size={28} color="#FFF" />
                  }
                </Pressable>
                <Pressable style={pageStyles.actionButton} onPress={handleShareStory}>
                  <Ionicons name="share-outline" size={28} color="#FFF" />
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              style={[pageStyles.bottomActions, { justifyContent: 'center' }]}
              onPress={() => { pauseProgress(); setShowViewers(true); }}
            >
              <View style={pageStyles.viewersRow}>
                <Ionicons name="eye-outline" size={16} color="rgba(255,255,255,0.7)" />
                <ThemedText style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginLeft: 6 }}>
                  Viewed by {currentStory.viewCount ?? currentStory.viewers?.length ?? currentStory.viewedBy?.length ?? 0}{' '}
                  {(currentStory.viewCount ?? currentStory.viewers?.length ?? currentStory.viewedBy?.length ?? 0) === 1 ? 'person' : 'people'}
                </ThemedText>
                <Ionicons name="chevron-up" size={14} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
              </View>
            </Pressable>
          )}
        </LinearGradient>
      </KeyboardStickyView>

      {/* Viewers modal */}
      <Modal
        visible={showViewers}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowViewers(false); resumeProgress(); }}
      >
        <Pressable style={pageStyles.viewerModalOverlay} onPress={() => { setShowViewers(false); resumeProgress(); }}>
          <Pressable style={pageStyles.viewerModalContent} onPress={() => {}}>
            <View style={pageStyles.viewerModalHandle} />
            <ThemedText style={pageStyles.viewerModalTitle}>
              Viewed by {currentStory.viewCount ?? currentStory.viewers?.length ?? currentStory.viewedBy?.length ?? 0}
            </ThemedText>
            {currentStory.viewers && currentStory.viewers.length > 0 ? (
              <ScrollView style={pageStyles.viewerList} showsVerticalScrollIndicator={false}>
                {currentStory.viewers.map((viewer) => (
                  <Pressable
                    key={viewer.id}
                    style={pageStyles.viewerItem}
                    onPress={() => {
                      setShowViewers(false);
                      resumeProgress();
                      navigation.navigate("ProfileDetail", { userId: viewer.id });
                    }}
                  >
                    <Image
                      source={viewer.photo ? getPhotoSource(viewer.photo) : require('../assets/icon.png')}
                      style={pageStyles.viewerAvatar}
                    />
                    <View style={pageStyles.viewerInfo}>
                      <ThemedText style={pageStyles.viewerName}>{viewer.name}</ThemedText>
                      <ThemedText style={pageStyles.viewerTime}>{formatTimeAgo(viewer.viewedAt)}</ThemedText>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <View style={pageStyles.viewerEmptyState}>
                <Ionicons name="eye-outline" size={32} color="rgba(255,255,255,0.3)" />
                <ThemedText style={pageStyles.viewerEmptyText}>
                  {(currentStory.viewCount ?? currentStory.viewedBy?.length ?? 0) > 0
                    ? `${currentStory.viewCount ?? currentStory.viewedBy?.length ?? 0} ${(currentStory.viewCount ?? currentStory.viewedBy?.length ?? 0) === 1 ? 'person' : 'people'} viewed your story.\nUpgrade to Premium to see who.`
                    : 'No views yet'}
                </ThemedText>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Report modal */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowReportModal(false); resumeProgress(); }}
      >
        <Pressable style={pageStyles.reportModalOverlay} onPress={() => { setShowReportModal(false); resumeProgress(); }}>
          <KAVController behavior="padding" style={{ width: '100%' }}>
            <Pressable style={pageStyles.reportModalSheet} onPress={() => {}}>
              <View style={pageStyles.reportModalHandle} />
              <ThemedText style={pageStyles.reportModalTitle}>Report Story</ThemedText>
              <ThemedText style={pageStyles.reportModalSubtitle}>
                What's wrong with {userName}'s story?
              </ThemedText>
              <View style={pageStyles.reportReasonList}>
                {[
                  { id: 'inappropriate', label: 'Inappropriate Content' },
                  { id: 'harassment', label: 'Harassment or Bullying' },
                  { id: 'spam', label: 'Spam or Scam' },
                  { id: 'fake', label: 'Fake Profile' },
                  { id: 'underage', label: 'Underage User' },
                  { id: 'other', label: 'Other' },
                ].map(r => (
                  <Pressable
                    key={r.id}
                    style={[pageStyles.reportReasonChip, reportReason === r.id && pageStyles.reportReasonChipSelected]}
                    onPress={() => setReportReason(r.id)}
                  >
                    {reportReason === r.id && (
                      <Ionicons name="checkmark-circle" size={16} color="#FF6B6B" style={{ marginRight: 6 }} />
                    )}
                    <ThemedText style={[pageStyles.reportReasonText, reportReason === r.id && pageStyles.reportReasonTextSelected]}>
                      {r.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={pageStyles.reportDetailsInput}
                placeholder="Add more details (optional)..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={reportDetails}
                onChangeText={setReportDetails}
                multiline
                numberOfLines={3}
                maxLength={300}
              />
              <View style={pageStyles.reportModalActions}>
                <Pressable
                  style={pageStyles.reportCancelButton}
                  onPress={() => { setShowReportModal(false); resumeProgress(); }}
                >
                  <ThemedText style={pageStyles.reportCancelText}>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  style={[pageStyles.reportSubmitButton, reportLoading && { opacity: 0.6 }]}
                  onPress={handleSubmitReport}
                  disabled={reportLoading}
                >
                  {reportLoading
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <ThemedText style={pageStyles.reportSubmitText}>Submit Report</ThemedText>
                  }
                </Pressable>
              </View>
            </Pressable>
          </KAVController>
        </Pressable>
      </Modal>
    </View>
  );
});

// ─── Outer screen: horizontal pager across users ─────────────────────────────

const AVATAR_SLOT = 44;

export default function StoryViewerScreen({ navigation, route }: StoryViewerScreenProps) {
  const params = route.params as any;
  const { userId, userName, userPhoto, allUsers, initialUserIndex, isOwnStory } = params;
  const insets = useSafeAreaInsets();

  const users: StoryUserEntry[] = allUsers?.length
    ? allUsers
    : [{ id: userId, name: userName, photo: userPhoto }];

  const startIndex = Math.max(0, Math.min(initialUserIndex ?? 0, users.length - 1));

  const [activeIndex, setActiveIndex] = useState(startIndex);
  const activeIndexRef = useRef(startIndex);
  const flatListRef = useRef<FlatList<StoryUserEntry>>(null);
  const indicatorRef = useRef<FlatList>(null);

  useEffect(() => {
    if (users.length <= 1) return;
    indicatorRef.current?.scrollToIndex({
      index: activeIndex,
      animated: true,
      viewPosition: 0.5,
    });
  }, [activeIndex, users.length]);

  const goToNextUser = useCallback(() => {
    const current = activeIndexRef.current;
    if (current < users.length - 1) {
      const next = current + 1;
      activeIndexRef.current = next;
      setActiveIndex(next);
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
    } else {
      navigation.goBack();
    }
  }, [users.length, navigation]);

  const goToPrevUser = useCallback(() => {
    const current = activeIndexRef.current;
    if (current > 0) {
      const prev = current - 1;
      activeIndexRef.current = prev;
      setActiveIndex(prev);
      flatListRef.current?.scrollToIndex({ index: prev, animated: true });
    }
  }, []);

  const handleMomentumScrollEnd = useCallback((e: any) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (newIndex !== activeIndexRef.current) {
      activeIndexRef.current = newIndex;
      setActiveIndex(newIndex);
    }
  }, []);

  const renderItem = useCallback(({ item, index }: { item: StoryUserEntry; index: number }) => (
    <UserStoryPage
      userId={item.id}
      userName={item.name}
      userPhoto={item.photo}
      isActive={index === activeIndex}
      onFinished={goToNextUser}
      onGoBack={goToPrevUser}
      navigation={navigation}
      isOwnStoryOverride={isOwnStory === true && item.id === userId ? true : undefined}
    />
  ), [activeIndex, goToNextUser, goToPrevUser, navigation, isOwnStory, userId]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: SCREEN_WIDTH,
    offset: SCREEN_WIDTH * index,
    index,
  }), []);

  const renderIndicatorItem = useCallback(({ item, index }: { item: StoryUserEntry; index: number }) => {
    const isActive = index === activeIndex;
    return (
      <View style={[wrapperStyles.indicatorAvatarWrap, isActive && wrapperStyles.indicatorAvatarWrapActive]}>
        <Image
          source={item.photo ? getPhotoSource(item.photo) : require('../assets/icon.png')}
          style={[wrapperStyles.indicatorAvatarImg, !isActive && wrapperStyles.indicatorAvatarImgDim]}
        />
      </View>
    );
  }, [activeIndex]);

  return (
    <View style={wrapperStyles.container}>
      <StatusBar barStyle="light-content" />
      <FlatList
        ref={flatListRef}
        data={users}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={startIndex}
        getItemLayout={getItemLayout}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={Math.min(3, users.length)}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        scrollEventThrottle={16}
        decelerationRate="fast"
        bounces={false}
        overScrollMode="never"
      />
      {users.length > 1 && (
        <View
          style={[wrapperStyles.indicatorWrapper, { bottom: insets.bottom + 10 }]}
          pointerEvents="none"
        >
          <View style={wrapperStyles.indicatorPill}>
            <FlatList
              ref={indicatorRef}
              data={users}
              horizontal
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              renderItem={renderIndicatorItem}
              getItemLayout={(_, index) => ({ length: AVATAR_SLOT, offset: AVATAR_SLOT * index, index })}
              contentContainerStyle={wrapperStyles.indicatorContent}
            />
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const wrapperStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  indicatorWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  indicatorPill: {
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 32,
    paddingVertical: 5,
    paddingHorizontal: 8,
    maxWidth: SCREEN_WIDTH * 0.85,
  },
  indicatorContent: {
    alignItems: "center",
    gap: 6,
  },
  indicatorAvatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
    opacity: 0.45,
  },
  indicatorAvatarWrapActive: {
    borderColor: "#FFF",
    opacity: 1,
    transform: [{ scale: 1.15 }],
  },
  indicatorAvatarImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  indicatorAvatarImgDim: {},
});

const pageStyles = StyleSheet.create({
  page: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: "#000",
    overflow: 'hidden',
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  noStoriesText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 18,
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  accessHint: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  textStoryBg: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  textStoryContent: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFF",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    paddingHorizontal: 20,
    lineHeight: 38,
  },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 20,
    zIndex: 10,
  },
  progressContainer: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 12,
    paddingTop: 8,
  },
  progressBarBg: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#FFF",
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 10,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  addStoryBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  storyTime: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerButtonHighVis: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  storyMenuDropdown: {
    position: 'absolute',
    top: 40,
    right: 0,
    backgroundColor: 'rgba(30,30,30,0.97)',
    borderRadius: 14,
    overflow: 'hidden',
    minWidth: 150,
    zIndex: 100,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  storyMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  storyMenuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  storyMenuItemText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '500',
  },
  tapAreas: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    zIndex: 5,
  },
  leftTap: {
    flex: 1,
  },
  rightTap: {
    flex: 2,
  },
  bottomGradientWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  bottomGradient: {
    paddingHorizontal: 16,
    paddingTop: 40,
  },
  bottomActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  replyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 24,
  },
  replyButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "500",
  },
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionButton: {
    padding: 8,
  },
  replyInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 24,
    paddingHorizontal: 16,
    gap: 12,
  },
  replyInput: {
    flex: 1,
    color: "#FFF",
    fontSize: 16,
    paddingVertical: 14,
  },
  replyCloseButton: {
    padding: 6,
    marginRight: 4,
  },
  sendButton: {
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
  },
  reactionPicker: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 32,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 8,
  },
  reactionEmoji: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  reactionEmojiSelected: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    transform: [{ scale: 1.1 }],
  },
  reactionEmojiText: {
    fontSize: 24,
  },
  activeReaction: {
    fontSize: 28,
  },
  editContainer: {
    width: '100%',
    alignItems: 'center',
    zIndex: 20,
  },
  editInput: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFF",
    textAlign: "center",
    width: '100%',
    minHeight: 150,
  },
  editActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 24,
  },
  editActionButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
  },
  editActionText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  viewersRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  viewerModalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  viewerModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  viewerModalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  viewerList: {
    maxHeight: SCREEN_HEIGHT * 0.4,
  },
  viewerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  viewerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  viewerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  viewerName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  viewerTime: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  viewerEmptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  viewerEmptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  reportModalSheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  reportModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  reportModalTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  reportModalSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginBottom: 20,
  },
  reportReasonList: {
    gap: 8,
    marginBottom: 16,
  },
  reportReasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  reportReasonChipSelected: {
    borderColor: '#FF6B6B',
    backgroundColor: 'rgba(255,107,107,0.12)',
  },
  reportReasonText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '500',
  },
  reportReasonTextSelected: {
    color: '#FF6B6B',
    fontWeight: '600',
  },
  reportDetailsInput: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#FFF',
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  reportModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  reportCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  reportCancelText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '600',
  },
  reportSubmitButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
  },
  reportSubmitText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
