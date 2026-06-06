import { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
  Modal,
  StatusBar,
  SafeAreaView,
  Animated,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ScreenKeyboardAwareScrollView } from "@/components/ScreenKeyboardAwareScrollView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { Spacing, BorderRadius, Typography, Shadow } from "@/constants/theme";
import { Feather, Ionicons } from "@expo/vector-icons";
import { getApiBaseUrl } from "@/constants/config";
import * as Location from "expo-location";

const ActionSheetIOS = Platform.OS === "ios" ? require("react-native").ActionSheetIOS : null;
const { width } = Dimensions.get("window");

type ProfileSetupScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "ProfileSetup">;
interface ProfileSetupScreenProps {
  navigation: ProfileSetupScreenNavigationProp;
}

type PhotoPrivacy = "public" | "friends" | "private";
interface PhotoItem {
  url: string;
  publicId?: string;
  privacy: PhotoPrivacy;
}
type PhotoSlot = PhotoItem | null;

const PROFILE_SETUP_STORAGE_KEY = "emorii_profile_setup_draft";

const INTEREST_OPTIONS = [
  { id: "music", label: "Music", icon: "musical-notes" },
  { id: "travel", label: "Travel", icon: "airplane" },
  { id: "cooking", label: "Cooking", icon: "restaurant" },
  { id: "fitness", label: "Fitness", icon: "fitness" },
  { id: "art", label: "Art", icon: "color-palette" },
  { id: "gaming", label: "Gaming", icon: "game-controller" },
  { id: "movies", label: "Movies", icon: "film" },
  { id: "reading", label: "Reading", icon: "book" },
  { id: "photography", label: "Photography", icon: "camera" },
  { id: "dancing", label: "Dancing", icon: "footsteps" },
  { id: "coding", label: "Coding", icon: "code-slash" },
  { id: "sports", label: "Sports", icon: "basketball" },
  { id: "fashion", label: "Fashion", icon: "shirt" },
  { id: "nature", label: "Nature", icon: "leaf" },
  { id: "technology", label: "Technology", icon: "hardware-chip" },
  { id: "business", label: "Business", icon: "briefcase" },
  { id: "outdoors", label: "Outdoors", icon: "trail-sign" },
  { id: "socializing", label: "Socializing", icon: "people" },
  { id: "wellness", label: "Wellness", icon: "heart-half" },
  { id: "creativity", label: "Creativity", icon: "brush" },
  { id: "values", label: "Values", icon: "diamond" },
  { id: "food", label: "Food", icon: "fast-food" },
];

const INTERESTS_OPTIONS = INTEREST_OPTIONS.map((item) => ({ ...item, value: item.id, color: "#10B981" })
);

const ZODIAC_SIGNS = [
  { value: "aries", label: "♈ Aries" },
  { value: "taurus", label: "♉ Taurus" },
  { value: "gemini", label: "♊ Gemini" },
  { value: "cancer", label: "♋ Cancer" },
  { value: "leo", label: "♌ Leo" },
  { value: "virgo", label: "♍ Virgo" },
  { value: "libra", label: "♎ Libra" },
  { value: "scorpio", label: "♏ Scorpio" },
  { value: "sagittarius", label: "♐ Sagittarius" },
  { value: "capricorn", label: "♑ Capricorn" },
  { value: "aquarius", label: "♒ Aquarius" },
  { value: "pisces", label: "♓ Pisces" },
];


const PRIVACY_OPTIONS: { value: PhotoPrivacy; label: string; icon: string; description: string }[] = [
  { value: "public", label: "Public", icon: "globe", description: "Everyone can see" },
  { value: "friends", label: "Friends Only", icon: "users", description: "Only matches can see" },
  { value: "private", label: "Private", icon: "lock", description: "Only you can see" },
];

const LOOKING_FOR_OPTIONS = [
  { label: "💍 Relationship", value: "Relationship", desc: "Serious & long-term", color: "#FF6B6B" },
  { label: "👯 Friendship", value: "Friendship", desc: "Platonic connection", color: "#4ECDC4" },
  { label: "😊 Casual", value: "Casual", desc: "Keeping it light", color: "#FFE66D" },
  { label: "🤷 Not sure", value: "Not sure", desc: "Open to anything", color: "#A8E6CF" },
];

const STEP_META = [
  { icon: "camera", title: "Your Photos", subtitle: "Add at least 4 great photos", color: "#10B981", step: 1 },
  { icon: "user", title: "About You", subtitle: "Let's get to know you", color: "#059669", step: 2 },
  { icon: "heart", title: "Your Vibe", subtitle: "What are you into?", color: "#0D9488", step: 3 },
  { icon: "edit-3", title: "Your Story", subtitle: "Write something that shows your personality", color: "#10B981", step: 4 },
  { icon: "sliders", title: "Preferences", subtitle: "Who would you like to meet?", color: "#059669", step: 5 },
];

const RELIGION_OPTIONS = [
  { value: "christian", label: "Christian" },
  { value: "muslim", label: "Muslim" },
  { value: "traditional", label: "Traditional" },
  { value: "atheist", label: "Atheist" },
  { value: "agnostic", label: "Agnostic" },
  { value: "deist", label: "Deist" },
  { value: "spiritual", label: "Spiritual" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const ETHNICITY_OPTIONS = [
  { value: "african", label: "African" },
  { value: "african_american", label: "African American" },
  { value: "caribbean", label: "Caribbean" },
  { value: "mixed", label: "Mixed" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];


const SMALL_SLOT = (width - Spacing.xl * 2 - Spacing.sm * 2) / 3;
const BIG_SLOT_WIDTH = width - Spacing.xl * 2;
const BIG_SLOT_HEIGHT = BIG_SLOT_WIDTH * 1.1;

function InterestChip({
  item,
  selected,
  onPress,
}: {
  item: { label: string; value: string; icon?: string; color: string };
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, {
        toValue: selected ? 0.88 : 1.18,
        useNativeDriver: true,
        friction: 3,
        tension: 400,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 4,
        tension: 200,
      }),
    ]).start();
    onPress();
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.View
        style={[
          {
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 999,
            borderWidth: 1.5,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            transform: [{ scale }],
          },
          selected
            ? { backgroundColor: item.color, borderColor: item.color }
            : { backgroundColor: `${item.color}14`, borderColor: `${item.color}50` },
        ]}
      >
        {item.icon ? (
          <Ionicons name={item.icon as any} size={13} color={selected ? "#fff" : item.color} />
        ) : selected ? (
          <Feather name="check" size={11} color="#fff" />
        ) : null}
        <ThemedText
          style={{
            fontSize: 13,
            fontWeight: selected ? "700" : "500",
            color: selected ? "#fff" : item.color,
          }}
        >
          {item.label}
        </ThemedText>
      </Animated.View>
    </Pressable>
  );
}

export default function ProfileSetupScreen({ navigation }: ProfileSetupScreenProps) {
  const { theme } = useTheme();
  const { completeProfileSetup, token } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<number | null>(null);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [zodiacSign, setZodiacSign] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [education, setEducation] = useState("");
  const [livingIn, setLivingIn] = useState("");
  const [religion, setReligion] = useState("");
  const [ethnicity, setEthnicity] = useState("");
  const [personalityType, setPersonalityType] = useState("");
  const [smoking, setSmoking] = useState("");
  const [drinking, setDrinking] = useState("");
  const [hasKids, setHasKids] = useState<boolean | null>(null);
  const [hasPets, setHasPets] = useState<boolean | null>(null);
  const [bio, setBio] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PhotoSlot[]>([null, null, null, null, null, null]);
  const [minAge, setMinAge] = useState("18");
  const [maxAge, setMaxAge] = useState("50");
  const [maxDistance, setMaxDistance] = useState("50");
  const [preferredGenders, setPreferredGenders] = useState<string[]>([]);
  const [favoriteSongTitle, setFavoriteSongTitle] = useState("");
  const [favoriteSongArtist, setFavoriteSongArtist] = useState("");
  const [communicationStyle, setCommunicationStyle] = useState("");
  const [loveStyle, setLoveStyle] = useState("");

  const [zodiacModalVisible, setZodiacModalVisible] = useState(false);
  const [reorderSource, setReorderSource] = useState<number | null>(null);

  const [religionModalVisible, setReligionModalVisible] = useState(false);
  const [ethnicityModalVisible, setEthnicityModalVisible] = useState(false);
  const [photoPickerModalVisible, setPhotoPickerModalVisible] = useState(false);
  const [photoPickerSlotIndex, setPhotoPickerSlotIndex] = useState<number>(0);

  const progressAnim = useRef(new Animated.Value(1 / 5)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: step / 5,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [step]);

  useEffect(() => {
    const loadDraft = async () => {
      try {
        const draft = await AsyncStorage.getItem(PROFILE_SETUP_STORAGE_KEY);
        if (draft) {
          const data = JSON.parse(draft);
          setName(data.name || "");
          setAge(data.age || "");
          setGender(data.gender || "");
          setZodiacSign(data.zodiacSign || "");
          setJobTitle(data.jobTitle || "");
          setEducation(data.education || "");
          setLivingIn(data.livingIn || "");
          setReligion(data.religion || "");
          setEthnicity(data.ethnicity || "");
          setBio(data.bio || "");
          setLookingFor(data.lookingFor || "");
          setInterests(data.interests || []);
          setPhotos(data.photos || [null, null, null, null, null, null]);
          setMinAge(data.minAge || "18");
          setMaxAge(data.maxAge || "50");
          setMaxDistance(data.maxDistance || "50");
          setPreferredGenders(data.preferredGenders || []);
          setStep(data.step || 1);
        }
      } catch {}
    };
    loadDraft();
  }, []);

  useEffect(() => {
    const saveDraft = async () => {
      try {
        const data = {
          name, age, gender, zodiacSign, jobTitle, education, livingIn, religion, ethnicity,
          bio, lookingFor, interests, photos, minAge, maxAge, maxDistance, preferredGenders, step,
        };
        await AsyncStorage.setItem(PROFILE_SETUP_STORAGE_KEY, JSON.stringify(data));
      } catch {}
    };
    saveDraft();
  }, [name, age, gender, zodiacSign, jobTitle, education, livingIn, religion, ethnicity, bio, lookingFor, interests, photos, minAge, maxAge, maxDistance, preferredGenders, step]);

  const animateToStep = (newStep: number, direction: "forward" | "back") => {
    const startX = direction === "forward" ? 60 : -60;
    slideAnim.setValue(startX);
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.96);
    setStep(newStep);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, friction: 9, tension: 65, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 9, tension: 65, useNativeDriver: true }),
    ]).start();
  };

  const toggleInterest = (interest: string) => {
    if (interests.includes(interest)) {
      setInterests(interests.filter((i) => i !== interest));
    } else if (interests.length < 5) {
      Haptics.selectionAsync();
      setInterests([...interests, interest]);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      const photoCount = photos.filter((p) => p !== null).length;
      if (photoCount < 4) {
        Alert.alert("More Photos Needed", "Please add at least 4 photos to continue");
        return;
      }
    } else if (step === 2) {
      const trimmedName = name.trim();
      const trimmedAge = age.trim();
      if (!trimmedName || !trimmedAge || !gender || !jobTitle.trim() || !livingIn.trim() || !ethnicity) {
        Alert.alert("Required Fields", "Please fill in all required fields (Name, Age, Gender, Job Title, Living In, Ethnicity)");
        return;
      }
      if (!/^\d+$/.test(trimmedAge)) {
        Alert.alert("Invalid Age", "Age must be a number");
        return;
      }
      const ageNum = parseInt(trimmedAge, 10);
      if (isNaN(ageNum) || ageNum < 18 || ageNum > 99) {
        Alert.alert("Invalid Age", "Please enter a valid age (18–99)");
        return;
      }
      setName(trimmedName);
      setAge(trimmedAge);
    } else if (step === 3) {
      if (interests.length < 3) {
        Alert.alert("More Interests Needed", "Please select at least 3 interests");
        return;
      }
      if (!lookingFor) {
        Alert.alert("Looking For?", "Please select what you're looking for");
        return;
      }
    } else if (step === 4) {
      if (!bio.trim()) {
        Alert.alert("Bio Required", "Please add a short bio");
        return;
      }
      setBio(bio.trim());
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateToStep(step + 1, "forward");
  };

  const handleBack = () => {
    Haptics.selectionAsync();
    animateToStep(step - 1, "back");
  };

  const togglePreferredGender = (g: string) => {
    if (preferredGenders.includes(g)) {
      setPreferredGenders(preferredGenders.filter((pg) => pg !== g));
    } else {
      setPreferredGenders([...preferredGenders, g]);
    }
  };

  const uploadPhoto = async (uri: string): Promise<{ url: string; publicId: string } | null> => {
    try {
      const formData = new FormData();
      const filename = uri.split("/").pop() || "photo.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : "image/jpeg";
      formData.append("file", { uri, name: filename, type } as any);
      const response = await fetch(`${getApiBaseUrl()}/api/upload/photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        body: formData,
      });
      const data = await response.json();
      if (data.success && data.url) return { url: data.url, publicId: data.publicId };
      return null;
    } catch {
      return null;
    }
  };

  const pickImage = async (useCamera: boolean, slotIndex: number) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", `Please allow access to your ${useCamera ? "camera" : "photo library"}`);
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [4, 5], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [4, 5], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setUploadingPhoto(slotIndex);
      const uploaded = await uploadPhoto(result.assets[0].uri);
      setUploadingPhoto(null);
      if (uploaded) {
        setPhotos(prev => {
          const newPhotos = [...prev];
          const existingPhoto = newPhotos[slotIndex];
          newPhotos[slotIndex] = { ...uploaded, privacy: existingPhoto?.privacy || "public" };
          return newPhotos;
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Upload Failed", "Could not upload photo. Please try again.");
      }
    }
  };

  const showPhotoOptions = (slotIndex: number) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Cancel", "Take Photo", "Choose from Library"], cancelButtonIndex: 0 },
        (buttonIndex: number) => {
          if (buttonIndex === 1) pickImage(true, slotIndex);
          else if (buttonIndex === 2) pickImage(false, slotIndex);
        },
      );
    } else {
      setPhotoPickerSlotIndex(slotIndex);
      setPhotoPickerModalVisible(true);
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = [...photos];
    newPhotos[index] = null;
    const validPhotos = newPhotos.filter((p): p is PhotoItem => p !== null);
    const compacted: PhotoSlot[] = [null, null, null, null, null, null];
    validPhotos.forEach((photo, i) => { compacted[i] = photo; });
    setPhotos(compacted);
    if (reorderSource === index) setReorderSource(null);
  };

  const handlePhotoLongPress = (index: number) => {
    if (!photos[index]) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReorderSource(reorderSource === index ? null : index);
  };

  const handlePhotoTapInReorderMode = (index: number) => {
    if (reorderSource === null) return;
    if (reorderSource === index) {
      setReorderSource(null);
      return;
    }
    const newPhotos = [...photos];
    const temp = newPhotos[reorderSource];
    newPhotos[reorderSource] = newPhotos[index];
    newPhotos[index] = temp;
    setPhotos(newPhotos);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setReorderSource(null);
  };

  const openPrivacyModal = (index: number) => {
    setSelectedPhotoIndex(index);
    setPrivacyModalVisible(true);
  };

  const setPhotoPrivacy = (privacy: PhotoPrivacy) => {
    if (selectedPhotoIndex === null) return;
    const photo = photos[selectedPhotoIndex];
    if (!photo) return;
    const newPhotos = [...photos];
    newPhotos[selectedPhotoIndex] = { ...photo, privacy };
    setPhotos(newPhotos);
    setPrivacyModalVisible(false);
    setSelectedPhotoIndex(null);
  };

  const getPrivacyIcon = (privacy: PhotoPrivacy): string => {
    switch (privacy) {
      case "public": return "globe";
      case "friends": return "users";
      case "private": return "lock";
      default: return "globe";
    }
  };

  const handleComplete = async () => {
    if (preferredGenders.length === 0) {
      Alert.alert("Show Me", "Please select at least one preferred gender");
      return;
    }
    const minAgeNum = parseInt(minAge, 10);
    const maxAgeNum = parseInt(maxAge, 10);
    const maxDistanceNum = parseInt(maxDistance, 10);
    if (isNaN(minAgeNum) || minAgeNum < 18 || minAgeNum > 99) {
      Alert.alert("Invalid Age Range", "Minimum age must be between 18 and 99");
      return;
    }
    if (isNaN(maxAgeNum) || maxAgeNum < 18 || maxAgeNum > 99) {
      Alert.alert("Invalid Age Range", "Maximum age must be between 18 and 99");
      return;
    }
    if (minAgeNum > maxAgeNum) {
      Alert.alert("Invalid Age Range", "Minimum age cannot be greater than maximum age");
      return;
    }
    if (isNaN(maxDistanceNum) || maxDistanceNum < 1 || maxDistanceNum > 500) {
      Alert.alert("Invalid Distance", "Max distance must be between 1 and 500 km");
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const ageNum = parseInt(age.trim(), 10);
      const validPhotos = photos.filter((p): p is PhotoItem => p !== null);
      const formattedPhotos = validPhotos.map((photo, index) => ({
        url: photo.url,
        publicId: photo.publicId,
        privacy: photo.privacy,
        isPrimary: index === 0,
        order: index,
      }));
      const finalGender = gender.toLowerCase() === "other" ? "other" : gender.toLowerCase();
      const finalPreferredGenders = preferredGenders.length > 0
        ? preferredGenders.map((g) => g.toLowerCase())
        : [finalGender === "man" ? "female" : "male"];

      let locationData: any = undefined;
      const locationParts = livingIn.split(',').map(part => part.trim()).filter(Boolean);
      const locationName = locationParts.length > 1
        ? { city: locationParts.slice(0, -1).join(', '), country: locationParts[locationParts.length - 1] }
        : locationParts.length === 1
          ? { city: locationParts[0] }
          : {};
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const coords = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          locationData = { type: "Point", coordinates: [coords.coords.longitude, coords.coords.latitude], ...locationName };
        }
      } catch {}

      await completeProfileSetup({
        name: name.trim(),
        age: ageNum,
        gender: finalGender,
        zodiacSign: zodiacSign || undefined,
        jobTitle: jobTitle.trim() || undefined,
        school: education || undefined,
        livingIn: livingIn.trim() || undefined,
        religion: religion || undefined,
        ethnicity: ethnicity.trim() || undefined,
        lifestyle: {
          smoking: smoking || undefined,
          drinking: drinking || undefined,
          religion: religion || undefined,
          ethnicity: ethnicity.trim() || undefined,
          communicationStyle: communicationStyle || undefined,
          loveStyle: loveStyle || undefined,
          personalityType: personalityType.trim() || undefined,
          hasKids: hasKids !== null ? hasKids : undefined,
          hasPets: hasPets !== null ? hasPets : undefined,
        },
        bio: bio.trim(),
        interests,
        lookingFor: lookingFor.toLowerCase() || "friends",
        photos: formattedPhotos,
        favoriteSong: favoriteSongTitle.trim() ? { title: favoriteSongTitle.trim(), artist: favoriteSongArtist.trim() } : undefined,
        ...(locationData ? { location: locationData } : {}),
        preferences: {
          ageRange: { min: minAgeNum, max: maxAgeNum },
          maxDistance: maxDistanceNum,
          genders: finalPreferredGenders,
        },
      });
      await AsyncStorage.removeItem(PROFILE_SETUP_STORAGE_KEY);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const stepMeta = STEP_META[step - 1];
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const photoCount = photos.filter((p) => p !== null).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar barStyle="light-content" />

      {/* ── Gradient Header ── */}
      <LinearGradient
        colors={["#10B981", "#059669"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientHeader}
      >
        {/* Top row */}
        <View style={styles.stepCounterRow}>
          <View style={styles.stepBadge}>
            <ThemedText style={styles.stepBadgeText}>{step} / 5</ThemedText>
          </View>
          <View style={styles.stepIconBubble}>
            <Feather name={stepMeta.icon as any} size={15} color="#fff" />
          </View>
        </View>

        {/* Animated Progress Bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]}>
            <View style={styles.progressGlow} />
          </Animated.View>
        </View>

        {/* Step dots */}
        <View style={styles.stepDots}>
          {[1, 2, 3, 4, 5].map((s) => (
            <Animated.View
              key={s}
              style={[
                styles.stepDot,
                s === step && styles.stepDotActive,
                s < step && styles.stepDotDone,
              ]}
            >
              {s < step && <Feather name="check" size={7} color="#fff" />}
            </Animated.View>
          ))}
        </View>

        {/* Title & subtitle */}
        <ThemedText style={styles.headerTitle}>{stepMeta.title}</ThemedText>
        <ThemedText style={styles.headerSubtitle}>{stepMeta.subtitle}</ThemedText>
      </LinearGradient>

      {/* ── Scrollable Content ── */}
      <ScreenKeyboardAwareScrollView contentContainerStyle={{ paddingTop: 0 }}>
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateX: slideAnim }, { scale: scaleAnim }],
            },
          ]}
        >

          {/* ════════════════════════════════════════════
              STEP 1 — Photos
          ════════════════════════════════════════════ */}
          {step === 1 && (
            <View style={styles.form}>
              {/* Hero photo slot */}
              <View style={styles.heroPhotoContainer}>
                <Pressable
                  style={[
                    styles.heroPhotoSlot,
                    {
                      borderColor: reorderSource === 0 ? "#FFC629" : photos[0] ? theme.primary : theme.border,
                      backgroundColor: theme.surface,
                      borderWidth: reorderSource === 0 ? 3 : 2,
                      opacity: reorderSource === 0 ? 0.75 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (reorderSource !== null) {
                      handlePhotoTapInReorderMode(0);
                    } else {
                      showPhotoOptions(0);
                    }
                  }}
                  onLongPress={() => handlePhotoLongPress(0)}
                  delayLongPress={400}
                  disabled={uploadingPhoto === 0}
                >
                  {photos[0] ? (
                    <>
                      <Image source={{ uri: photos[0].url }} style={styles.heroPhotoImage} contentFit="cover" />
                      <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.55)"]}
                        style={styles.heroGradientOverlay}
                      />
                      <Pressable
                        style={[styles.heroRemoveBtn, { backgroundColor: theme.error }]}
                        onPress={() => removePhoto(0)}
                      >
                        <Feather name="x" size={13} color="#fff" />
                      </Pressable>
                      <View style={styles.heroBadge}>
                        <Feather name="star" size={11} color="#FFD700" />
                        <ThemedText style={styles.heroBadgeText}>Main Photo</ThemedText>
                      </View>
                      <Pressable
                        style={styles.heroPrivacyBtn}
                        onPress={() => openPrivacyModal(0)}
                      >
                        <Feather
                          name={getPrivacyIcon(photos[0].privacy) as any}
                          size={13}
                          color={photos[0].privacy === "private" ? "#FF6B6B" : photos[0].privacy === "friends" ? "#FFC629" : "#10B981"}
                        />
                      </Pressable>
                    </>
                  ) : (
                    <View style={styles.heroEmptyState}>
                      {uploadingPhoto === 0 ? (
                        <ActivityIndicator color={theme.primary} size="large" />
                      ) : (
                        <>
                          <LinearGradient
                            colors={["#10B981", "#059669"]}
                            style={styles.heroAddIcon}
                          >
                            <Feather name="camera" size={28} color="#fff" />
                          </LinearGradient>
                          <ThemedText style={[styles.heroEmptyTitle, { color: theme.text }]}>Add your best photo</ThemedText>
                          <ThemedText style={[styles.heroEmptySubtitle, { color: theme.textSecondary }]}>
                            This will be your main profile photo
                          </ThemedText>
                        </>
                      )}
                    </View>
                  )}
                </Pressable>
              </View>

              {/* Additional photos grid */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                <ThemedText style={[styles.sectionLabel, { color: theme.textSecondary, marginBottom: 0 }]}>
                  {reorderSource !== null ? "📍 Tap a slot to swap position" : "Add more photos"}
                </ThemedText>
                {reorderSource !== null && (
                  <Pressable onPress={() => setReorderSource(null)} hitSlop={8}>
                    <ThemedText style={{ fontSize: 12, color: theme.error, fontWeight: "600" }}>Cancel</ThemedText>
                  </Pressable>
                )}
              </View>
              <View style={styles.smallPhotoGrid}>
                {[1, 2, 3, 4, 5].map((slotIndex) => {
                  const photo = photos[slotIndex];
                  const isUploading = uploadingPhoto === slotIndex;
                  const isReorderSrc = reorderSource === slotIndex;
                  const isReorderTarget = reorderSource !== null && reorderSource !== slotIndex;
                  return (
                    <Pressable
                      key={slotIndex}
                      style={[
                        styles.smallPhotoSlot,
                        {
                          borderColor: isReorderSrc
                            ? theme.primary
                            : isReorderTarget && photo
                            ? "#FFC629"
                            : photo
                            ? theme.primary
                            : theme.border,
                          backgroundColor: theme.surface,
                          borderWidth: isReorderSrc ? 2.5 : 1.5,
                          opacity: isReorderSrc ? 0.7 : 1,
                        },
                      ]}
                      onPress={() => {
                        if (reorderSource !== null) {
                          handlePhotoTapInReorderMode(slotIndex);
                        } else {
                          showPhotoOptions(slotIndex);
                        }
                      }}
                      onLongPress={() => handlePhotoLongPress(slotIndex)}
                      delayLongPress={400}
                      disabled={isUploading}
                    >
                      {photo ? (
                        <>
                          <Image source={{ uri: photo.url }} style={styles.smallPhotoImage} contentFit="cover" />
                          {isReorderSrc ? (
                            <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 12 }]}>
                              <Feather name="move" size={18} color="#fff" />
                            </View>
                          ) : (
                            <>
                              {reorderSource === null && (
                                <Pressable
                                  style={[styles.smallRemoveBtn, { backgroundColor: theme.error }]}
                                  onPress={() => removePhoto(slotIndex)}
                                >
                                  <Feather name="x" size={9} color="#fff" />
                                </Pressable>
                              )}
                              {isReorderTarget && (
                                <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,198,41,0.25)", borderRadius: 12 }]}>
                                  <Feather name="corner-left-down" size={16} color="#FFC629" />
                                </View>
                              )}
                            </>
                          )}
                          {!isReorderSrc && reorderSource === null && (
                            <Pressable
                              style={styles.smallPrivacyBtn}
                              onPress={() => openPrivacyModal(slotIndex)}
                            >
                              <Feather
                                name={getPrivacyIcon(photo.privacy) as any}
                                size={10}
                                color={photo.privacy === "private" ? "#FF6B6B" : photo.privacy === "friends" ? "#FFC629" : "#10B981"}
                              />
                            </Pressable>
                          )}
                        </>
                      ) : isUploading ? (
                        <ActivityIndicator color={theme.primary} size="small" />
                      ) : (
                        <View style={[styles.smallAddIcon, { backgroundColor: reorderSource !== null ? `${theme.primary}08` : `${theme.primary}15` }]}>
                          <Feather name={reorderSource !== null ? "corner-left-down" : "plus"} size={18} color={reorderSource !== null ? "#FFC629" : theme.primary} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              {reorderSource === null && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 }}>
                  <Feather name="move" size={11} color={theme.textSecondary} />
                  <ThemedText style={{ fontSize: 11, color: theme.textSecondary }}>Long press any photo to reorder</ThemedText>
                </View>
              )}

              {/* Photo progress indicator */}
              <View style={[styles.photoProgressCard, {
                backgroundColor: photoCount >= 4 ? `${theme.primary}12` : theme.surface,
                borderColor: photoCount >= 4 ? theme.primary : theme.border,
              }]}>
                <View style={styles.photoProgressDots}>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <View
                      key={i}
                      style={[
                        styles.photoProgressDot,
                        { backgroundColor: i <= photoCount ? theme.primary : theme.border },
                      ]}
                    />
                  ))}
                </View>
                <ThemedText style={[styles.photoProgressText, { color: photoCount >= 4 ? theme.primary : theme.textSecondary }]}>
                  {photoCount >= 4
                    ? `${photoCount} photos added ✓ Ready to continue`
                    : `${photoCount}/4 photos — need ${4 - photoCount} more`}
                </ThemedText>
              </View>

              {/* Privacy legend */}
              <View style={styles.privacyLegend}>
                {[
                  { icon: "globe", color: theme.primary, label: "Public" },
                  { icon: "users", color: "#FFC629", label: "Friends" },
                  { icon: "lock", color: "#FF6B6B", label: "Private" },
                ].map((item) => (
                  <View key={item.label} style={styles.legendItem}>
                    <Feather name={item.icon as any} size={12} color={item.color} />
                    <ThemedText style={[styles.legendText, { color: theme.textSecondary }]}>{item.label}</ThemedText>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ════════════════════════════════════════════
              STEP 2 — Basic Info
          ════════════════════════════════════════════ */}
          {step === 2 && (
            <View style={styles.form}>
              {/* Name & Age row */}
              <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.cardSectionHeader}>
                  <View style={[styles.cardSectionIcon, { backgroundColor: "#10B98120" }]}>
                    <Feather name="user" size={14} color={theme.primary} />
                  </View>
                  <ThemedText style={[styles.cardSectionTitle, { color: theme.text }]}>Identity</ThemedText>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Full Name *</ThemedText>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    placeholder="Your name"
                    placeholderTextColor={theme.textSecondary}
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                <View style={styles.rowInputs}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Age *</ThemedText>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                      placeholder="18"
                      placeholderTextColor={theme.textSecondary}
                      value={age}
                      onChangeText={setAge}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Personality</ThemedText>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                      placeholder="INFJ, ENFP..."
                      placeholderTextColor={theme.textSecondary}
                      value={personalityType}
                      onChangeText={setPersonalityType}
                      maxLength={4}
                      autoCapitalize="characters"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Gender *</ThemedText>
                  <View style={styles.pillRow}>
                    {["Man", "Woman"].map((g) => (
                      <Pressable
                        key={g}
                        style={[
                          styles.pill,
                          { borderColor: theme.border, backgroundColor: theme.background },
                          gender.toLowerCase() === g.toLowerCase() && { backgroundColor: theme.primary, borderColor: theme.primary },
                        ]}
                        onPress={() => { Haptics.selectionAsync(); setGender(g); }}
                      >
                        <ThemedText style={[styles.pillText, { color: gender.toLowerCase() === g.toLowerCase() ? "#fff" : theme.text }]}>
                          {g}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              {/* Background card */}
              <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.cardSectionHeader}>
                  <View style={[styles.cardSectionIcon, { backgroundColor: "#4ECDC420" }]}>
                    <Feather name="map-pin" size={14} color="#4ECDC4" />
                  </View>
                  <ThemedText style={[styles.cardSectionTitle, { color: theme.text }]}>Background</ThemedText>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Ethnicity *</ThemedText>
                  <Pressable
                    style={[styles.dropdownButton, { backgroundColor: theme.background, borderColor: theme.border }]}
                    onPress={() => setEthnicityModalVisible(true)}
                  >
                    <ThemedText style={{ color: ethnicity ? theme.text : theme.textSecondary, fontSize: 15 }}>
                      {ethnicity ? ETHNICITY_OPTIONS.find((e) => e.value === ethnicity)?.label : "Select ethnicity"}
                    </ThemedText>
                    <Feather name="chevron-down" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Living In *</ThemedText>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    placeholder="City, Country"
                    placeholderTextColor={theme.textSecondary}
                    value={livingIn}
                    onChangeText={setLivingIn}
                    maxLength={100}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Religion</ThemedText>
                  <Pressable
                    style={[styles.dropdownButton, { backgroundColor: theme.background, borderColor: theme.border }]}
                    onPress={() => setReligionModalVisible(true)}
                  >
                    <ThemedText style={{ color: religion ? theme.text : theme.textSecondary, fontSize: 15 }}>
                      {religion ? RELIGION_OPTIONS.find((r) => r.value === religion)?.label : "Select religion"}
                    </ThemedText>
                    <Feather name="chevron-down" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Zodiac Sign</ThemedText>
                  <Pressable
                    style={[styles.dropdownButton, { backgroundColor: theme.background, borderColor: theme.border }]}
                    onPress={() => setZodiacModalVisible(true)}
                  >
                    <ThemedText style={{ color: zodiacSign ? theme.text : theme.textSecondary, fontSize: 15 }}>
                      {zodiacSign ? ZODIAC_SIGNS.find((z) => z.value === zodiacSign)?.label : "Select your sign"}
                    </ThemedText>
                    <Feather name="chevron-down" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>
              </View>

              {/* Career card */}
              <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.cardSectionHeader}>
                  <View style={[styles.cardSectionIcon, { backgroundColor: "#FFE66D30" }]}>
                    <Feather name="briefcase" size={14} color="#F0A500" />
                  </View>
                  <ThemedText style={[styles.cardSectionTitle, { color: theme.text }]}>Career</ThemedText>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Job Title *</ThemedText>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    placeholder="e.g. Software Engineer"
                    placeholderTextColor={theme.textSecondary}
                    value={jobTitle}
                    onChangeText={setJobTitle}
                    maxLength={100}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>School / University</ThemedText>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    placeholder="Your school or university"
                    placeholderTextColor={theme.textSecondary}
                    value={education}
                    onChangeText={setEducation}
                    maxLength={150}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Lifestyle card */}
              <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.cardSectionHeader}>
                  <View style={[styles.cardSectionIcon, { backgroundColor: "#DDA0DD30" }]}>
                    <Feather name="coffee" size={14} color="#DDA0DD" />
                  </View>
                  <ThemedText style={[styles.cardSectionTitle, { color: theme.text }]}>Lifestyle</ThemedText>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Smoking</ThemedText>
                  <View style={styles.pillRow}>
                    {["Never", "Socially", "Regularly"].map((s) => (
                      <Pressable
                        key={s}
                        style={[
                          styles.pill,
                          { borderColor: theme.border, backgroundColor: theme.background },
                          smoking === s.toLowerCase() && { backgroundColor: theme.primary, borderColor: theme.primary },
                        ]}
                        onPress={() => setSmoking(s.toLowerCase())}
                      >
                        <ThemedText style={[styles.pillText, { color: smoking === s.toLowerCase() ? "#fff" : theme.text }]}>{s}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Drinking</ThemedText>
                  <View style={styles.pillRow}>
                    {["Never", "Socially", "Regularly"].map((d) => (
                      <Pressable
                        key={d}
                        style={[
                          styles.pill,
                          { borderColor: theme.border, backgroundColor: theme.background },
                          drinking === d.toLowerCase() && { backgroundColor: theme.primary, borderColor: theme.primary },
                        ]}
                        onPress={() => setDrinking(d.toLowerCase())}
                      >
                        <ThemedText style={[styles.pillText, { color: drinking === d.toLowerCase() ? "#fff" : theme.text }]}>{d}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.binaryRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Have Kids?</ThemedText>
                    <View style={styles.pillRow}>
                      {[{ l: "Yes", v: true }, { l: "No", v: false }].map((item) => (
                        <Pressable
                          key={item.l}
                          style={[
                            styles.pill,
                            { flex: 1, borderColor: theme.border, backgroundColor: theme.background },
                            hasKids === item.v && { backgroundColor: theme.primary, borderColor: theme.primary },
                          ]}
                          onPress={() => setHasKids(item.v)}
                        >
                          <ThemedText style={[styles.pillText, { color: hasKids === item.v ? "#fff" : theme.text }]}>{item.l}</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Have Pets?</ThemedText>
                    <View style={styles.pillRow}>
                      {[{ l: "Yes", v: true }, { l: "No", v: false }].map((item) => (
                        <Pressable
                          key={item.l}
                          style={[
                            styles.pill,
                            { flex: 1, borderColor: theme.border, backgroundColor: theme.background },
                            hasPets === item.v && { backgroundColor: theme.primary, borderColor: theme.primary },
                          ]}
                          onPress={() => setHasPets(item.v)}
                        >
                          <ThemedText style={[styles.pillText, { color: hasPets === item.v ? "#fff" : theme.text }]}>{item.l}</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* ════════════════════════════════════════════
              STEP 3 — Interests & Looking For
          ════════════════════════════════════════════ */}
          {step === 3 && (
            <View style={styles.form}>
              {/* Selection counter badge */}
              <View style={styles.interestHeader}>
                <ThemedText style={[styles.interestTitle, { color: theme.text }]}>Pick your interests</ThemedText>
                <View style={[styles.selectionBadge, {
                  backgroundColor: interests.length >= 3 ? theme.primary : theme.surface,
                  borderColor: interests.length >= 3 ? theme.primary : theme.border,
                }]}>
                  <ThemedText style={[styles.selectionBadgeText, {
                    color: interests.length >= 3 ? "#fff" : theme.textSecondary,
                  }]}>
                    {interests.length} / 5
                  </ThemedText>
                </View>
              </View>

              <ThemedText style={[styles.interestSubtitle, { color: theme.textSecondary }]}>
                Select 3–5 things you love
              </ThemedText>

              <View style={styles.chipsWrap}>
                {INTERESTS_OPTIONS.map((item) => {
                  const selected = interests.includes(item.value);
                  return (
                    <InterestChip
                      key={item.value}
                      item={item}
                      selected={selected}
                      onPress={() => toggleInterest(item.value)}
                    />
                  );
                })}
              </View>

              {/* Looking For section */}
              <View style={styles.lookingForSection}>
                <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>Looking for</ThemedText>
                <ThemedText style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>What kind of connection?</ThemedText>

                <View style={styles.lookingForGrid}>
                  {LOOKING_FOR_OPTIONS.map((opt) => {
                    const selected = lookingFor === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        style={[
                          styles.lookingForCard,
                          {
                            borderColor: selected ? opt.color : theme.border,
                            backgroundColor: selected ? `${opt.color}18` : theme.surface,
                          },
                        ]}
                        onPress={() => { Haptics.selectionAsync(); setLookingFor(opt.value); }}
                      >
                        <ThemedText style={styles.lookingForEmoji}>{opt.label.split(" ")[0]}</ThemedText>
                        <ThemedText style={[styles.lookingForLabel, { color: selected ? opt.color : theme.text }]}>
                          {opt.label.split(" ").slice(1).join(" ")}
                        </ThemedText>
                        <ThemedText style={[styles.lookingForDesc, { color: theme.textSecondary }]}>{opt.desc}</ThemedText>
                        {selected && (
                          <View style={[styles.lookingForCheck, { backgroundColor: opt.color }]}>
                            <Feather name="check" size={9} color="#fff" />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {/* ════════════════════════════════════════════
              STEP 4 — Bio
          ════════════════════════════════════════════ */}
          {step === 4 && (
            <View style={styles.form}>
              {/* Bio prompt cards */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.promptsScroll}
                contentContainerStyle={styles.promptsScrollContent}
              >
                {[
                  { emoji: "🌍", text: "Share your culture" },
                  { emoji: "😂", text: "What makes you laugh?" },
                  { emoji: "🔥", text: "Your passion project" },
                  { emoji: "✨", text: "Something unique" },
                ].map((prompt) => (
                  <Pressable
                    key={prompt.text}
                    style={[styles.promptChip, { backgroundColor: `${theme.primary}12`, borderColor: `${theme.primary}30` }]}
                    onPress={() => setBio(bio ? bio + " " + prompt.text : prompt.text)}
                  >
                    <ThemedText style={styles.promptEmoji}>{prompt.emoji}</ThemedText>
                    <ThemedText style={[styles.promptText, { color: theme.primary }]}>{prompt.text}</ThemedText>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Bio text area */}
              <View style={[styles.bioCard, { backgroundColor: theme.surface, borderColor: bio.length > 0 ? theme.primary : theme.border }]}>
                <TextInput
                  style={[styles.bioInput, { color: theme.text }]}
                  placeholder="Tell people about yourself, your culture, your passions, and what makes you unique..."
                  placeholderTextColor={theme.textSecondary}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  maxLength={300}
                  textAlignVertical="top"
                />
                <View style={styles.bioFooter}>
                  <View style={[styles.bioMeter, { backgroundColor: theme.border }]}>
                    <View style={[
                      styles.bioMeterFill,
                      {
                        width: `${(bio.length / 300) * 100}%` as any,
                        backgroundColor: bio.length < 50 ? theme.error : bio.length < 150 ? "#FFC629" : theme.primary,
                      },
                    ]} />
                  </View>
                  <ThemedText style={[styles.charCount, { color: bio.length > 250 ? theme.primary : theme.textSecondary }]}>
                    {bio.length}/300
                  </ThemedText>
                </View>
              </View>

              {/* Tips */}
              <View style={[styles.bioTipsCard, { backgroundColor: `${theme.primary}08`, borderColor: `${theme.primary}20` }]}>
                <ThemedText style={[styles.bioTipsTitle, { color: theme.primary }]}>✨ Great bios mention...</ThemedText>
                {[
                  "Your cultural background & roots",
                  "Something that makes you laugh",
                  "A passion or side project",
                  "What you're looking for here",
                ].map((tip) => (
                  <View key={tip} style={styles.bioTipRow}>
                    <View style={[styles.bioTipDot, { backgroundColor: theme.primary }]} />
                    <ThemedText style={[styles.bioTipText, { color: theme.text }]}>{tip}</ThemedText>
                  </View>
                ))}
              </View>

              {/* Favorite Song (optional) */}
              <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.cardSectionHeader}>
                  <View style={[styles.cardSectionIcon, { backgroundColor: "#FF6B6B20" }]}>
                    <ThemedText style={{ fontSize: 13 }}>🎵</ThemedText>
                  </View>
                  <View>
                    <ThemedText style={[styles.cardSectionTitle, { color: theme.text }]}>Anthem</ThemedText>
                    <ThemedText style={[styles.cardSectionSubtitle, { color: theme.textSecondary }]}>Optional</ThemedText>
                  </View>
                </View>
                <View style={styles.rowInputs}>
                  <View style={[styles.inputGroup, { flex: 1.4 }]}>
                    <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Song Title</ThemedText>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                      placeholder="Song name"
                      placeholderTextColor={theme.textSecondary}
                      value={favoriteSongTitle}
                      onChangeText={setFavoriteSongTitle}
                      maxLength={100}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Artist</ThemedText>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                      placeholder="Artist"
                      placeholderTextColor={theme.textSecondary}
                      value={favoriteSongArtist}
                      onChangeText={setFavoriteSongArtist}
                      maxLength={100}
                    />
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* ════════════════════════════════════════════
              STEP 5 — Preferences
          ════════════════════════════════════════════ */}
          {step === 5 && (
            <View style={styles.form}>
              {/* Discovery Preferences */}
              <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.cardSectionHeader}>
                  <View style={[styles.cardSectionIcon, { backgroundColor: "#10B98120" }]}>
                    <Feather name="search" size={14} color={theme.primary} />
                  </View>
                  <ThemedText style={[styles.cardSectionTitle, { color: theme.text }]}>Discovery Settings</ThemedText>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Show Me</ThemedText>
                  <View style={styles.pillRow}>
                    {["Male", "Female"].map((g) => (
                      <Pressable
                        key={g}
                        style={[
                          styles.pill,
                          { borderColor: theme.border, backgroundColor: theme.background },
                          preferredGenders.includes(g) && { backgroundColor: theme.primary, borderColor: theme.primary },
                        ]}
                        onPress={() => { Haptics.selectionAsync(); togglePreferredGender(g); }}
                      >
                        <ThemedText style={[styles.pillText, { color: preferredGenders.includes(g) ? "#fff" : theme.text }]}>{g}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Age Range</ThemedText>
                  <View style={styles.ageRangeRow}>
                    <TextInput
                      style={[styles.ageInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                      placeholder="18"
                      placeholderTextColor={theme.textSecondary}
                      value={minAge}
                      onChangeText={setMinAge}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                    <View style={styles.ageRangeSepContainer}>
                      <ThemedText style={[styles.rangeSep, { color: theme.textSecondary }]}>—</ThemedText>
                    </View>
                    <TextInput
                      style={[styles.ageInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                      placeholder="50"
                      placeholderTextColor={theme.textSecondary}
                      value={maxAge}
                      onChangeText={setMaxAge}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Max Distance (km)</ThemedText>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    placeholder="50"
                    placeholderTextColor={theme.textSecondary}
                    value={maxDistance}
                    onChangeText={setMaxDistance}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>
              </View>

              {/* Completion celebration card */}
              <View style={[styles.celebrationCard, { backgroundColor: `${theme.primary}10`, borderColor: `${theme.primary}25` }]}>
                <ThemedText style={styles.celebrationEmoji}>🎉</ThemedText>
                <ThemedText style={[styles.celebrationTitle, { color: theme.text }]}>You're almost there!</ThemedText>
                <ThemedText style={[styles.celebrationDesc, { color: theme.textSecondary }]}>
                  Hit Complete Profile to start discovering amazing connections.
                </ThemedText>
                <View style={styles.completeChecklist}>
                  {[
                    { label: "Photos added", done: photoCount >= 4 },
                    { label: "Basic info filled", done: !!name && !!age && !!gender },
                    { label: "Interests selected", done: interests.length >= 3 },
                    { label: "Bio written", done: bio.length > 0 },
                  ].map((item) => (
                    <View key={item.label} style={styles.checklistRow}>
                      <View style={[styles.checklistDot, {
                        backgroundColor: item.done ? theme.primary : theme.border,
                      }]}>
                        {item.done && <Feather name="check" size={9} color="#fff" />}
                      </View>
                      <ThemedText style={[styles.checklistText, {
                        color: item.done ? theme.text : theme.textSecondary,
                        textDecorationLine: item.done ? "none" : "none",
                      }]}>
                        {item.label}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* ── Navigation Buttons ── */}
          <View style={styles.navRow}>
            {step > 1 && (
              <Pressable
                style={[styles.backBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
                onPress={handleBack}
              >
                <Feather name="arrow-left" size={18} color={theme.text} />
              </Pressable>
            )}
            <Pressable
              style={[styles.nextBtn, { flex: 1 }]}
              onPress={step < 5 ? handleNext : handleComplete}
              disabled={loading}
            >
              <LinearGradient
                colors={["#10B981", "#059669"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.nextBtnGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <ThemedText style={styles.nextBtnText}>
                      {step < 5 ? "Continue" : "Complete Profile"}
                    </ThemedText>
                    <Feather name={step < 5 ? "arrow-right" : "check"} size={18} color="#fff" style={{ marginLeft: 8 }} />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </Animated.View>
      </ScreenKeyboardAwareScrollView>

      {/* ── Privacy Modal ── */}
      <Modal visible={privacyModalVisible} transparent animationType="fade" onRequestClose={() => setPrivacyModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPrivacyModalVisible(false)}>
          <View style={[styles.sheetModal, { backgroundColor: theme.background }]}>
            <View style={styles.sheetHandle} />
            <ThemedText style={[styles.modalTitle, { color: theme.text }]}>Photo Privacy</ThemedText>
            <ThemedText style={[styles.modalSubtitle, { color: theme.textSecondary }]}>Who can see this photo?</ThemedText>
            {PRIVACY_OPTIONS.map((option) => {
              const isSelected = selectedPhotoIndex !== null && photos[selectedPhotoIndex]?.privacy === option.value;
              const iconColor = option.value === "private" ? "#FF6B6B" : option.value === "friends" ? "#FFC629" : theme.primary;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.privacyOption, { borderColor: isSelected ? theme.primary : theme.border, backgroundColor: isSelected ? `${theme.primary}10` : theme.surface }]}
                  onPress={() => setPhotoPrivacy(option.value)}
                >
                  <View style={[styles.privacyIconBox, { backgroundColor: `${iconColor}15` }]}>
                    <Feather name={option.icon as any} size={20} color={iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={[styles.privacyLabel, { color: theme.text }]}>{option.label}</ThemedText>
                    <ThemedText style={[styles.privacyDesc, { color: theme.textSecondary }]}>{option.description}</ThemedText>
                  </View>
                  {isSelected && <Feather name="check-circle" size={20} color={theme.primary} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* ── Zodiac Modal ── */}
      <Modal visible={zodiacModalVisible} transparent animationType="slide" onRequestClose={() => setZodiacModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.listModal, { backgroundColor: theme.background }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, { color: theme.text }]}>Zodiac Sign</ThemedText>
              <Pressable onPress={() => setZodiacModalVisible(false)} hitSlop={8}>
                <Feather name="x" size={22} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.zodiacGrid}>
                {ZODIAC_SIGNS.map((sign) => (
                  <Pressable
                    key={sign.value}
                    style={[
                      styles.zodiacChip,
                      { borderColor: zodiacSign === sign.value ? theme.primary : theme.border, backgroundColor: zodiacSign === sign.value ? theme.primary : theme.surface },
                    ]}
                    onPress={() => { setZodiacSign(sign.value); setZodiacModalVisible(false); }}
                  >
                    <ThemedText style={[styles.zodiacText, { color: zodiacSign === sign.value ? "#fff" : theme.text }]}>{sign.label}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>


      {/* ── Religion Modal ── */}
      <Modal visible={religionModalVisible} transparent animationType="slide" onRequestClose={() => setReligionModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.listModal, { backgroundColor: theme.background }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, { color: theme.text }]}>Religion</ThemedText>
              <Pressable onPress={() => setReligionModalVisible(false)} hitSlop={8}>
                <Feather name="x" size={22} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {RELIGION_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.listItem,
                    { borderColor: religion === option.value ? theme.primary : theme.border, backgroundColor: religion === option.value ? `${theme.primary}10` : theme.surface },
                  ]}
                  onPress={() => { setReligion(option.value); setReligionModalVisible(false); }}
                >
                  <ThemedText style={[styles.listItemText, { color: theme.text }]}>{option.label}</ThemedText>
                  {religion === option.value && <Feather name="check" size={18} color={theme.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={ethnicityModalVisible} transparent animationType="slide" onRequestClose={() => setEthnicityModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.listModal, { backgroundColor: theme.background }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, { color: theme.text }]}>Ethnicity</ThemedText>
              <Pressable onPress={() => setEthnicityModalVisible(false)} hitSlop={8}>
                <Feather name="x" size={22} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {ETHNICITY_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.listItem,
                    { borderColor: ethnicity === option.value ? theme.primary : theme.border, backgroundColor: ethnicity === option.value ? `${theme.primary}10` : theme.surface },
                  ]}
                  onPress={() => { setEthnicity(option.value); setEthnicityModalVisible(false); }}
                >
                  <ThemedText style={[styles.listItemText, { color: theme.text }]}>{option.label}</ThemedText>
                  {ethnicity === option.value && <Feather name="check" size={18} color={theme.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Photo Picker Modal (Android) ── */}
      <Modal visible={photoPickerModalVisible} transparent animationType="fade" onRequestClose={() => setPhotoPickerModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPhotoPickerModalVisible(false)}>
          <View style={[styles.sheetModal, { backgroundColor: theme.background }]}>
            <View style={styles.sheetHandle} />
            <ThemedText style={[styles.modalTitle, { color: theme.text }]}>Add Photo</ThemedText>
            <Pressable
              style={[styles.photoPickerRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => { setPhotoPickerModalVisible(false); pickImage(true, photoPickerSlotIndex); }}
            >
              <View style={[styles.photoPickerRowIcon, { backgroundColor: `${theme.primary}15` }]}>
                <Feather name="camera" size={22} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.photoPickerRowTitle, { color: theme.text }]}>Take Photo</ThemedText>
                <ThemedText style={[styles.photoPickerRowDesc, { color: theme.textSecondary }]}>Use your camera</ThemedText>
              </View>
              <Feather name="chevron-right" size={18} color={theme.textSecondary} />
            </Pressable>
            <Pressable
              style={[styles.photoPickerRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => { setPhotoPickerModalVisible(false); pickImage(false, photoPickerSlotIndex); }}
            >
              <View style={[styles.photoPickerRowIcon, { backgroundColor: "#00B2FF15" }]}>
                <Feather name="image" size={22} color="#00B2FF" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.photoPickerRowTitle, { color: theme.text }]}>Choose from Library</ThemedText>
                <ThemedText style={[styles.photoPickerRowDesc, { color: theme.textSecondary }]}>Select from your photos</ThemedText>
              </View>
              <Feather name="chevron-right" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  gradientHeader: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  stepCounterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  stepBadge: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },
  stepIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  progressGlow: {
    width: 8,
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: 3,
  },
  stepDots: {
    flexDirection: "row",
    gap: 6,
    marginBottom: Spacing.md,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    width: 28,
    backgroundColor: "#fff",
  },
  stepDotDone: {
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.5,
    marginBottom: 3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.82)",
    fontWeight: "500",
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  form: {
    gap: Spacing.lg,
  },

  heroPhotoContainer: {
    alignItems: "center",
  },
  heroPhotoSlot: {
    width: BIG_SLOT_WIDTH,
    height: BIG_SLOT_HEIGHT,
    borderRadius: BorderRadius.xxl,
    overflow: "hidden",
    borderWidth: 2,
    ...Shadow.medium,
  },
  heroPhotoImage: {
    width: "100%",
    height: "100%",
  },
  heroGradientOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  heroRemoveBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.small,
  },
  heroBadge: {
    position: "absolute",
    bottom: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  heroPrivacyBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEmptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  heroAddIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.medium,
  },
  heroEmptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  heroEmptySubtitle: {
    fontSize: 13,
    fontWeight: "400",
    textAlign: "center",
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  smallPhotoGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  smallPhotoSlot: {
    width: SMALL_SLOT,
    aspectRatio: 3 / 4,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  smallPhotoImage: {
    width: "100%",
    height: "100%",
  },
  smallRemoveBtn: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  smallPrivacyBtn: {
    position: "absolute",
    bottom: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  smallAddIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  photoProgressCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    padding: Spacing.md,
    gap: Spacing.sm,
    alignItems: "center",
  },
  photoProgressDots: {
    flexDirection: "row",
    gap: 5,
  },
  photoProgressDot: {
    width: 20,
    height: 6,
    borderRadius: 3,
  },
  photoProgressText: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  privacyLegend: {
    flexDirection: "row",
    gap: Spacing.xl,
    justifyContent: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendText: {
    fontSize: 12,
    fontWeight: "500",
  },

  infoCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    padding: Spacing.lg,
    gap: Spacing.lg,
    ...Shadow.small,
  },
  cardSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: -Spacing.xs,
  },
  cardSectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  cardSectionSubtitle: {
    fontSize: 11,
    fontWeight: "500",
  },

  inputGroup: {
    gap: 7,
  },
  rowInputs: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  binaryRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginLeft: 2,
  },
  input: {
    height: 52,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    fontSize: 15,
    fontWeight: "500",
    borderWidth: 1.5,
  },
  dropdownButton: {
    height: 52,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pillRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  pill: {
    flex: 1,
    height: 46,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: {
    fontSize: 14,
    fontWeight: "600",
  },

  interestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  interestTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  selectionBadge: {
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  selectionBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  interestSubtitle: {
    fontSize: 14,
    fontWeight: "400",
    marginTop: -Spacing.sm,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  lookingForSection: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: "400",
    marginTop: -4,
  },
  lookingForGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  lookingForCard: {
    width: (width - Spacing.xl * 2 - Spacing.sm) / 2,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    padding: Spacing.md,
    position: "relative",
    ...Shadow.small,
  },
  lookingForEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  lookingForLabel: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 3,
  },
  lookingForDesc: {
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 16,
  },
  lookingForCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  promptsScroll: {
    marginHorizontal: -Spacing.xl,
  },
  promptsScrollContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  promptChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  promptEmoji: {
    fontSize: 14,
  },
  promptText: {
    fontSize: 13,
    fontWeight: "600",
  },
  bioCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    padding: Spacing.lg,
    minHeight: 170,
    ...Shadow.small,
  },
  bioInput: {
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
    minHeight: 120,
  },
  bioFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  bioMeter: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    marginRight: Spacing.sm,
    overflow: "hidden",
  },
  bioMeterFill: {
    height: "100%",
    borderRadius: 2,
  },
  charCount: {
    fontSize: 12,
    fontWeight: "600",
  },
  bioTipsCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  bioTipsTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  bioTipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  bioTipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  bioTipText: {
    fontSize: 13,
    fontWeight: "400",
    flex: 1,
  },

  ageRangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  ageRangeSepContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
  },
  ageInput: {
    flex: 1,
    height: 52,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    fontWeight: "600",
    borderWidth: 1.5,
    textAlign: "center",
  },
  rangeSep: {
    fontSize: 16,
    fontWeight: "500",
  },

  celebrationCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  celebrationEmoji: {
    fontSize: 40,
  },
  celebrationTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  celebrationDesc: {
    fontSize: 14,
    fontWeight: "400",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  completeChecklist: {
    width: "100%",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  checklistDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checklistText: {
    fontSize: 14,
    fontWeight: "500",
  },

  navRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xxl,
  },
  backBtn: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  nextBtn: {
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  nextBtnGradient: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.2,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheetModal: {
    width: "100%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.12)",
    alignSelf: "center",
    marginBottom: Spacing.sm,
  },
  listModal: {
    width: "100%",
    maxHeight: "70%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: "400",
    marginTop: -Spacing.xs,
    marginBottom: Spacing.xs,
  },
  privacyOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
  },
  privacyIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  privacyLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  privacyDesc: {
    fontSize: 12,
    fontWeight: "400",
  },
  zodiacGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  zodiacChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
  zodiacText: {
    fontSize: 14,
    fontWeight: "500",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    marginBottom: Spacing.sm,
  },
  listItemText: {
    fontSize: 15,
    fontWeight: "500",
  },
  photoPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
  },
  photoPickerRowIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  photoPickerRowTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  photoPickerRowDesc: {
    fontSize: 12,
    fontWeight: "400",
  },
});
