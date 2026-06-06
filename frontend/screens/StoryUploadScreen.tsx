import logger from '@/utils/logger';
import { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  StatusBar,
  ScrollView,
  Platform,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { getApiBaseUrl } from "@/constants/config";
import { LinearGradient } from "expo-linear-gradient";
import { tokenManager } from "@/utils/tokenManager";

type StoryUploadScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "StoryUpload"
>;

interface StoryUploadScreenProps {
  navigation: StoryUploadScreenNavigationProp;
}

const BACKGROUND_COLORS = [
  ["#FF6B6B", "#FF8E8E"],
  ["#4ECDC4", "#6EE7DF"],
  ["#45B7D1", "#68D8F4"],
  ["#96CEB4", "#B8E8D0"],
  ["#FFEAA7", "#FFF6C9"],
  ["#DDA0DD", "#E8C5E8"],
  ["#FF9FF3", "#FFC0F9"],
  ["#54A0FF", "#7BB8FF"],
];

export default function StoryUploadScreen({
  navigation,
}: StoryUploadScreenProps) {
  const { theme, isDark } = useTheme();
  const { token, user } = useAuth();
  const { post } = useApi();
  const insets = useSafeAreaInsets();

  const [isUploading, setIsUploading] = useState(false);
  const [storyType, setStoryType] = useState<"text" | "image" | "video">("image");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [textContent, setTextContent] = useState("");
  const [selectedBgIndex, setSelectedBgIndex] = useState(0);
  const [duration, setDuration] = useState(24);

  const pickMedia = async (type: 'image' | 'video') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission Required",
        `Please allow access to your ${type} library`
      );
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: type === 'image' ? ['images'] : ['videos'],
        quality: 0.6,
        allowsEditing: true,
        aspect: [9, 16],
        videoMaxDuration: 30,
        exif: false,
      });

      if (!result.canceled && result.assets[0]) {
        if (type === 'image') {
          setSelectedImage(result.assets[0].uri);
          setSelectedVideo(null);
          setStoryType("image");
        } else {
          setSelectedVideo(result.assets[0].uri);
          setSelectedImage(null);
          setStoryType("video");
        }
      }
    } catch (error) {
      logger.error("Media picker error:", error);
      Alert.alert("Error", `Failed to pick ${type}`);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Please allow camera access");
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.6,
        allowsEditing: true,
        aspect: [9, 16],
        videoMaxDuration: 30,
        exif: false,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        setStoryType("image");
      }
    } catch (error) {
      logger.error("Camera error:", error);
      Alert.alert("Error", "Failed to take photo");
    }
  };

  const uploadStory = async () => {
    if (storyType === "text" && !textContent.trim()) {
      Alert.alert("Error", "Please enter some text for your story");
      return;
    }

    if (storyType === "image" && !selectedImage) {
      Alert.alert("Error", "Please select an image for your story");
      return;
    }

    // Snapshot all the inputs we need so the upload can keep running
    // after the user navigates away from this screen.
    const snapshot = {
      storyType,
      selectedImage,
      selectedVideo,
      textContent,
      durationInt: parseInt(duration.toString()),
      bgColor: Array.isArray(BACKGROUND_COLORS[selectedBgIndex])
        ? (BACKGROUND_COLORS[selectedBgIndex] as any)[0]
        : (BACKGROUND_COLORS[selectedBgIndex] as any),
      authToken: token || "",
    };

    // Give immediate feedback and pop the screen — the upload runs
    // invisibly in the background so the user can keep using the app.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    navigation.goBack();

    // Background uploader (no awaits in the click handler past this point).
    (async () => {
      // Build the multipart body (only needed for image/video stories).
      const buildFormData = async () => {
        const formData = new FormData();
        const uri =
          snapshot.storyType === "image" ? snapshot.selectedImage : snapshot.selectedVideo;
        const fieldName = "file";
        if (Platform.OS === "web") {
          const response = await fetch(uri!);
          const blob = await response.blob();
          formData.append(
            fieldName,
            blob,
            `story_${Date.now()}.${snapshot.storyType === "image" ? "jpg" : "mp4"}`,
          );
        } else {
          formData.append(fieldName, {
            uri: uri,
            type: snapshot.storyType === "image" ? "image/jpeg" : "video/mp4",
            name: `story_${Date.now()}.${snapshot.storyType === "image" ? "jpg" : "mp4"}`,
          } as any);
        }
        return formData;
      };

      // Performs the file upload with one automatic token refresh on 401.
      const uploadWithAuth = async (): Promise<{ url: string }> => {
        const uploadPath = snapshot.storyType === "image" ? "photo" : "video";
        let activeToken = snapshot.authToken;

        const doFetch = async (tk: string) => {
          const formData = await buildFormData();
          return fetch(`${getApiBaseUrl()}/api/upload/${uploadPath}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${tk}`, Accept: "application/json" },
            body: formData,
          });
        };

        let resp = await doFetch(activeToken);

        // If the access token was revoked/expired, try a silent refresh once.
        if (resp.status === 401) {
          const refreshed = await tokenManager.refresh().catch(() => null);
          if (refreshed) {
            activeToken = refreshed;
            resp = await doFetch(activeToken);
          }
        }

        if (resp.status === 401) {
          const err: any = new Error("Session expired. Please log in again.");
          err.code = "AUTH_EXPIRED";
          throw err;
        }

        if (!resp.ok) {
          const errorText = await resp.text().catch(() => "");
          logger.error("Upload error response:", errorText);
          throw new Error(`Upload failed: ${resp.status} ${resp.statusText}`);
        }

        const data = await resp.json();
        if (!data.success) throw new Error(data.message || "Upload failed");

        // Persist the (possibly refreshed) token so the follow-up POST uses it.
        snapshot.authToken = activeToken;
        return { url: data.url };
      };

      try {
        let mediaUrl: string | null = null;

        if (
          (snapshot.storyType === "image" && snapshot.selectedImage) ||
          (snapshot.storyType === "video" && snapshot.selectedVideo)
        ) {
          const uploaded = await uploadWithAuth();
          mediaUrl = uploaded.url;
        }

        const storyData: Record<string, any> = {
          type: snapshot.storyType,
          content:
            snapshot.storyType === "text"
              ? snapshot.textContent
              : snapshot.storyType === "image"
              ? "Photo story"
              : "Video story",
          durationHours: snapshot.durationInt,
        };

        if (snapshot.storyType === "text") {
          storyData.textContent = snapshot.textContent;
          storyData.backgroundColor = snapshot.bgColor;
        }

        if (mediaUrl) {
          storyData.mediaUrl = mediaUrl;
        }

        // useApi.post() already auto-refreshes on 401, so no extra plumbing here.
        const response = await post<{ story: any }>("/stories", storyData, snapshot.authToken);

        if (response.success) {
          // Marker that other screens (e.g. Chats) poll to refresh stories.
          AsyncStorage.setItem("@story_posted", Date.now().toString()).catch(() => {});
        } else if ((response as any).error === "TOKEN_EXPIRED") {
          const err: any = new Error("Session expired. Please log in again.");
          err.code = "AUTH_EXPIRED";
          throw err;
        } else {
          throw new Error(response.message || "Failed to create story");
        }
      } catch (error: any) {
        logger.error("Story upload error:", error);
        try {
          if (error?.code === "AUTH_EXPIRED") {
            Alert.alert(
              "Session expired",
              "You've been signed out. Please log in again to post your story.",
            );
          } else {
            Alert.alert("Story upload failed", "We couldn't post your story. Please try again.");
          }
        } catch {}
      }
    })();
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.background}
      />

      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="close" size={28} color={theme.text} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: theme.text }]}>
          Create Story
        </ThemedText>
        <Pressable
          onPress={uploadStory}
          disabled={isUploading}
          style={[styles.postBtn, { backgroundColor: theme.primary }]}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <ThemedText style={styles.postBtnText}>Post</ThemedText>
          )}
        </Pressable>
      </View>

      <View style={styles.tabContainer}>
        <Pressable
          style={[
            styles.tab,
            storyType === "image" && { backgroundColor: theme.primary },
          ]}
          onPress={() => setStoryType("image")}
        >
          <Ionicons
            name="image"
            size={20}
            color={storyType === "image" ? "#FFF" : theme.textSecondary}
          />
          <ThemedText
            style={[
              styles.tabText,
              { color: storyType === "image" ? "#FFF" : theme.textSecondary },
            ]}
          >
            Photo
          </ThemedText>
        </Pressable>
        <Pressable
          style={[
            styles.tab,
            storyType === "video" && { backgroundColor: theme.primary },
          ]}
          onPress={() => setStoryType("video")}
        >
          <Ionicons
            name="videocam"
            size={20}
            color={storyType === "video" ? "#FFF" : theme.textSecondary}
          />
          <ThemedText
            style={[
              styles.tabText,
              { color: storyType === "video" ? "#FFF" : theme.textSecondary },
            ]}
          >
            Video
          </ThemedText>
        </Pressable>
        <Pressable
          style={[
            styles.tab,
            storyType === "text" && { backgroundColor: theme.primary },
          ]}
          onPress={() => setStoryType("text")}
        >
          <Ionicons
            name="text"
            size={20}
            color={storyType === "text" ? "#FFF" : theme.textSecondary}
          />
          <ThemedText
            style={[
              styles.tabText,
              { color: storyType === "text" ? "#FFF" : theme.textSecondary },
            ]}
          >
            Text
          </ThemedText>
        </Pressable>
      </View>

      {storyType === "image" ? (
        <View style={styles.imageSection}>
          {selectedImage ? (
            <View style={styles.previewContainer}>
              <Image
                source={{ uri: selectedImage }}
                style={[styles.previewImage, { borderRadius: 0 }]}
                contentFit="contain"
              />
              <Pressable
                style={styles.changeImageBtn}
                onPress={() => setSelectedImage(null)}
              >
                <Ionicons name="close-circle" size={32} color="#FFF" />
              </Pressable>
            </View>
          ) : (
            <View style={styles.imagePickerContainer}>
              <Pressable
                style={[styles.imagePickerBtn, { backgroundColor: theme.surface }]}
                onPress={() => pickMedia('image')}
              >
                <Ionicons name="images" size={48} color={theme.primary} />
                <ThemedText
                  style={[styles.imagePickerText, { color: theme.text }]}
                >
                  Choose from Gallery
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.imagePickerBtn, { backgroundColor: theme.surface }]}
                onPress={takePhoto}
              >
                <Ionicons name="camera" size={48} color={theme.primary} />
                <ThemedText
                  style={[styles.imagePickerText, { color: theme.text }]}
                >
                  Take a Photo
                </ThemedText>
              </Pressable>
            </View>
          )}
        </View>
      ) : storyType === "video" ? (
        <View style={styles.imageSection}>
          {selectedVideo ? (
            <View style={styles.previewContainer}>
              <View style={[styles.previewImage, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="videocam" size={64} color="#FFF" />
                <ThemedText style={{ color: '#FFF', marginTop: 10 }}>Video Selected</ThemedText>
              </View>
              <Pressable
                style={styles.changeImageBtn}
                onPress={() => setSelectedVideo(null)}
              >
                <Ionicons name="close-circle" size={32} color="#FFF" />
              </Pressable>
            </View>
          ) : (
            <View style={styles.imagePickerContainer}>
              <Pressable
                style={[styles.imagePickerBtn, { backgroundColor: theme.surface }]}
                onPress={() => pickMedia('video')}
              >
                <Ionicons name="videocam" size={48} color={theme.primary} />
                <ThemedText
                  style={[styles.imagePickerText, { color: theme.text }]}
                >
                  Choose Video from Gallery
                </ThemedText>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.textSection}>
          <LinearGradient
            colors={BACKGROUND_COLORS[selectedBgIndex] as [string, string]}
            style={styles.textPreview}
          >
            <TextInput
              style={styles.storyTextInput}
              placeholder="Type your story..."
              placeholderTextColor="rgba(255,255,255,0.7)"
              value={textContent}
              onChangeText={setTextContent}
              multiline
              maxLength={200}
              textAlign="center"
            />
          </LinearGradient>

          <View style={styles.durationSection}>
            <ThemedText style={[styles.bgLabel, { color: theme.text }]}>Story Duration (Hours)</ThemedText>
            <View style={styles.durationOptions}>
              {[24, 48, 72, 168].map((h) => (
                <Pressable
                  key={h}
                  style={[
                    styles.durationOption,
                    duration === h && { backgroundColor: theme.primary, borderColor: theme.primary }
                  ]}
                  onPress={() => setDuration(h)}
                >
                  <ThemedText style={[styles.durationText, { color: duration === h ? '#FFF' : theme.textSecondary }]}>
                    {h === 168 ? '1 Week' : `${h}h`}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          <ThemedText style={[styles.bgLabel, { color: theme.text }]}>
            Background Color
          </ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bgColorContainer}
          >
            {BACKGROUND_COLORS.map((colors, index) => (
              <Pressable
                key={index}
                onPress={() => setSelectedBgIndex(index)}
                style={[
                  styles.bgColorBtn,
                  selectedBgIndex === index && styles.bgColorBtnSelected,
                ]}
              >
                <LinearGradient
                  colors={colors as [string, string]}
                  style={styles.bgColorGradient}
                />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Feather name="clock" size={16} color={theme.textSecondary} />
        <ThemedText style={[styles.footerText, { color: theme.textSecondary }]}>
          {`Live for ${duration} hours`}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backBtn: { padding: Spacing.xs },
  headerTitle: { ...Typography.h3, fontWeight: "600" },
  postBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  postBtnText: { color: "#FFF", fontWeight: "600" },
  tabContainer: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  tabText: { fontWeight: "500" },
  imageSection: { flex: 1, paddingHorizontal: Spacing.lg },
  previewContainer: { flex: 1, borderRadius: BorderRadius.xl, overflow: "hidden" },
  previewImage: { width: "100%", height: "100%" },
  changeImageBtn: { position: "absolute", top: Spacing.md, right: Spacing.md },
  imagePickerContainer: {
    flex: 1,
    justifyContent: "center",
    gap: Spacing.lg,
  },
  imagePickerBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
    borderRadius: BorderRadius.xl,
    gap: Spacing.sm,
  },
  imagePickerText: { ...Typography.body, fontWeight: "500" },
  textSection: { flex: 1, paddingHorizontal: Spacing.lg },
  textPreview: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  durationSection: {
    marginTop: Spacing.lg,
  },
  durationOptions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  durationOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.2)',
  },
  durationText: {
    fontSize: 12,
    fontWeight: '600',
  },
  storyTextInput: {
    ...Typography.h2,
    color: "#FFF",
    textAlign: "center",
    width: "100%",
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  bgLabel: { ...Typography.body, fontWeight: "500", marginTop: Spacing.lg, marginBottom: Spacing.sm },
  bgColorContainer: { gap: Spacing.sm, paddingVertical: Spacing.sm },
  bgColorBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    padding: 2,
    borderWidth: 2,
    borderColor: "transparent",
  },
  bgColorBtnSelected: { borderColor: "#FFF", borderWidth: 3 },
  bgColorGradient: { flex: 1, borderRadius: 20 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingTop: Spacing.md,
  },
  extendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.2)',
  },
  extendBtnText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  footerText: { ...Typography.caption },
});
