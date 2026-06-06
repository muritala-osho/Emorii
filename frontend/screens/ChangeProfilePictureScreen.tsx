import logger from '@/utils/logger';
import { useState } from "react";
import { View, StyleSheet, Pressable, Alert, ActivityIndicator, Dimensions, Platform, ScrollView, Modal } from "react-native";

const ActionSheetIOS = Platform.OS === 'ios' ? require('react-native').ActionSheetIOS : null;
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { getApiBaseUrl } from "@/constants/config";
import { getPhotoSource } from "@/utils/photos";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

type ChangeProfilePictureScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "ChangeProfilePicture">;

interface ChangeProfilePictureScreenProps {
  navigation: ChangeProfilePictureScreenNavigationProp;
}

const MAX_PHOTOS = 6;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.md * 2) / 3;

export default function ChangeProfilePictureScreen({ navigation }: ChangeProfilePictureScreenProps) {
  const { theme } = useTheme();
  const { user, token, updateProfile, fetchUser } = useAuth();
  const { del } = useApi();
  const insets = useSafeAreaInsets();
  const [uploading, setUploading] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const openPhotoViewer = (photoUrl: string) => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setViewingPhoto(photoUrl);
  };

  const photos = user?.photos || [];

  const uploadPhoto = async (uri: string): Promise<{ url: string; publicId: string } | null> => {
    try {
      const formData = new FormData();
      const filename = uri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';
      
      formData.append('file', {
        uri,
        name: filename,
        type,
      } as any);

      const response = await fetch(`${getApiBaseUrl()}/api/upload/photo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        body: formData,
      });

      const data = await response.json();
      
      if (data.success && data.url) {
        return { url: data.url, publicId: data.publicId };
      }
      return null;
    } catch (error) {
      logger.error('Upload error:', error);
      return null;
    }
  };

  const pickImage = async (useCamera: boolean, replaceIndex?: number) => {
    if (replaceIndex === undefined && photos.length >= MAX_PHOTOS) {
      Alert.alert("Maximum Photos Reached", `You can only upload up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission required", `Please allow access to your ${useCamera ? 'camera' : 'photo library'}`);
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 5],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 5],
          quality: 0.8,
        });

    if (!result.canceled && result.assets[0]) {
      setUploading(true);
      setUploadingIndex(replaceIndex !== undefined ? replaceIndex : photos.length);
      
      const uploaded = await uploadPhoto(result.assets[0].uri);
      
      if (uploaded) {
        const updatedPhotos = [...photos];
        
        if (replaceIndex !== undefined && replaceIndex < photos.length) {
          updatedPhotos[replaceIndex] = {
            url: uploaded.url,
            publicId: uploaded.publicId,
            isPrimary: replaceIndex === 0,
            privacy: 'public',
            order: replaceIndex,
          };
        } else {
          const newPhoto = {
            url: uploaded.url,
            publicId: uploaded.publicId,
            isPrimary: photos.length === 0,
            privacy: 'public' as const,
            order: photos.length,
          };
          updatedPhotos.push(newPhoto);
        }

        await updateProfile({ photos: updatedPhotos });
        Alert.alert("Success", "Photo uploaded successfully");
      } else {
        Alert.alert("Upload failed", "Could not upload photo. Please try again.");
      }
      setUploading(false);
      setUploadingIndex(null);
    }
  };

  const handleDeletePhoto = async (index: number) => {
    const photo = photos[index];
    if (!photo) return;

    if (photos.length <= 4) {
      Alert.alert("Cannot Delete", "You must keep at least 4 photos on your profile.");
      return;
    }

    Alert.alert(
      "Delete Photo",
      "Are you sure you want to delete this photo?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingIndex(index);
            try {
              await del(`/upload/photo?publicId=${encodeURIComponent(photo.publicId || photo._id || '')}`, token ?? undefined);
              await fetchUser();
            } catch (error) {
              logger.error('Delete photo error:', error);
              Alert.alert('Error', 'Failed to delete photo');
            }
            setDeletingIndex(null);
          },
        },
      ]
    );
  };

  const handleSetPrimary = async (index: number) => {
    if (index === 0) return;
    
    const updatedPhotos = [...photos];
    updatedPhotos.forEach((photo, i) => {
      photo.isPrimary = i === index;
    });
    
    const [selectedPhoto] = updatedPhotos.splice(index, 1);
    updatedPhotos.unshift(selectedPhoto);
    
    updatedPhotos.forEach((photo, i) => {
      photo.order = i;
      photo.isPrimary = i === 0;
    });

    await updateProfile({ photos: updatedPhotos });
    Alert.alert("Success", "Primary photo updated");
  };

  const showPhotoOptions = (index?: number) => {
    const isExistingPhoto = index !== undefined && index < photos.length;
    
    if (Platform.OS === 'ios') {
      const options = isExistingPhoto
        ? ['Cancel', 'Replace Photo', 'Set as Primary', 'Delete Photo']
        : ['Cancel', 'Take Photo', 'Choose from Library'];
      
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: isExistingPhoto ? 3 : undefined,
        },
        (buttonIndex: number) => {
          if (isExistingPhoto) {
            if (buttonIndex === 1) showAddPhotoOptions(index);
            else if (buttonIndex === 2) handleSetPrimary(index);
            else if (buttonIndex === 3) handleDeletePhoto(index);
          } else {
            if (buttonIndex === 1) pickImage(true, index);
            else if (buttonIndex === 2) pickImage(false, index);
          }
        }
      );
    } else {
      if (isExistingPhoto) {
        Alert.alert(
          "Photo Options",
          "What would you like to do?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Replace Photo", onPress: () => showAddPhotoOptions(index) },
            { text: "Set as Primary", onPress: () => handleSetPrimary(index) },
            { text: "Delete Photo", style: "destructive", onPress: () => handleDeletePhoto(index) },
          ]
        );
      } else {
        showAddPhotoOptions(index);
      }
    }
  };

  const showAddPhotoOptions = (index?: number) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex: number) => {
          if (buttonIndex === 1) pickImage(true, index);
          else if (buttonIndex === 2) pickImage(false, index);
        }
      );
    } else {
      Alert.alert(
        "Add Photo",
        "Choose an option",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Take Photo", onPress: () => pickImage(true, index) },
          { text: "Choose from Library", onPress: () => pickImage(false, index) },
        ]
      );
    }
  };

  const renderPhotoSlot = (index: number) => {
    const photo = photos[index];
    const isUploading = uploadingIndex === index;
    const isDeleting = deletingIndex === index;

    if (photo) {
      const source = getPhotoSource(photo);
      const photoUrl = typeof photo === 'string' ? photo : photo.url;
      const canDelete = photos.length > 4;
      return (
        <View key={index} style={[styles.photoSlot, { backgroundColor: theme.surface }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => showPhotoOptions(index)}
            onLongPress={() => photoUrl && openPhotoViewer(photoUrl)}
            delayLongPress={300}
            disabled={uploading || isDeleting}
          />
          <Image source={source} style={styles.photoImage} contentFit="cover" />
          {index === 0 && (
            <View style={[styles.primaryBadge, { backgroundColor: theme.primary }]}>
              <ThemedText style={[styles.primaryBadgeText, { color: theme.buttonText }]}>Main</ThemedText>
            </View>
          )}
          {(isUploading || isDeleting) && (
            <View style={styles.photoOverlay}>
              <ActivityIndicator color={theme.buttonText} />
            </View>
          )}
          {/* Visible delete button — red X when deletable, lock icon when at minimum */}
          <Pressable
            style={[
              styles.deleteBtn,
              { backgroundColor: canDelete ? '#EF4444' : 'rgba(100,100,100,0.7)' },
            ]}
            onPress={() => canDelete ? handleDeletePhoto(index) : Alert.alert('Minimum Photos', 'You must keep at least 4 photos.')}
            hitSlop={6}
          >
            <Feather name={canDelete ? 'x' : 'lock'} size={11} color="#fff" />
          </Pressable>
        </View>
      );
    }

    if (index < MAX_PHOTOS) {
      return (
        <Pressable
          key={index}
          style={[styles.photoSlot, styles.addPhotoSlot, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => showAddPhotoOptions(index)}
          disabled={uploading}
        >
          {isUploading ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <>
              <Feather name="plus" size={28} color={theme.primary} />
              <ThemedText style={[styles.addPhotoText, { color: theme.textSecondary }]}>Add</ThemedText>
            </>
          )}
        </Pressable>
      );
    }

    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Manage Photos</ThemedText>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
            Add up to {MAX_PHOTOS} photos. Your first photo is your main profile picture.
          </ThemedText>

          <View style={styles.photoGrid}>
            {Array.from({ length: Math.max(photos.length + 1, 3) }, (_, i) => i)
              .filter(i => i < MAX_PHOTOS)
              .map(renderPhotoSlot)}
          </View>

          <View style={styles.tipsSection}>
            <ThemedText style={[styles.tipsTitle, { color: theme.text }]}>
              Photo Tips
            </ThemedText>
            <View style={styles.tipsList}>
              <View style={styles.tipRow}>
                <Feather name="check-circle" size={16} color={theme.success} />
                <ThemedText style={[styles.tipText, { color: theme.textSecondary }]}>
                  Use clear, well-lit photos
                </ThemedText>
              </View>
              <View style={styles.tipRow}>
                <Feather name="check-circle" size={16} color={theme.success} />
                <ThemedText style={[styles.tipText, { color: theme.textSecondary }]}>
                  Show your face clearly in your main photo
                </ThemedText>
              </View>
              <View style={styles.tipRow}>
                <Feather name="check-circle" size={16} color={theme.success} />
                <ThemedText style={[styles.tipText, { color: theme.textSecondary }]}>
                  Include a mix of portraits and full-body shots
                </ThemedText>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Full-screen photo viewer with pinch-to-zoom */}
      <Modal
        visible={!!viewingPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingPhoto(null)}
      >
        <View style={styles.viewerBackdrop}>
          <Pressable style={styles.viewerClose} onPress={() => setViewingPhoto(null)}>
            <Feather name="x" size={24} color="#FFF" />
          </Pressable>
          <GestureDetector gesture={composedGesture}>
            <Animated.View style={[styles.viewerImageWrap, animatedImageStyle]}>
              {viewingPhoto && (
                <Image
                  source={{ uri: viewingPhoto }}
                  style={styles.viewerImage}
                  contentFit="contain"
                />
              )}
            </Animated.View>
          </GestureDetector>
          <ThemedText style={styles.viewerHint}>Pinch to zoom · Long press photo to open</ThemedText>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    height: 56,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  backButton: {
    padding: 8,
  },
  title: {
    ...Typography.h2,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.body,
    marginBottom: Spacing.xl,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  photoSlot: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE * 1.25,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  addPhotoSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  primaryBadge: {
    position: 'absolute',
    bottom: Spacing.xs,
    left: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  primaryBadgeText: {
    ...Typography.small,
    fontWeight: '600',
  },
  editBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    ...Typography.small,
    marginTop: Spacing.xs,
  },
  tipsSection: {
    marginTop: Spacing.lg,
  },
  tipsTitle: {
    ...Typography.subtitle,
    marginBottom: Spacing.md,
  },
  tipsList: {
    gap: Spacing.sm,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tipText: {
    ...Typography.body,
    flex: 1,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImageWrap: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.25,
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerHint: {
    position: 'absolute',
    bottom: 40,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textAlign: 'center',
  },
});
