import logger from '@/utils/logger';
import { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  Alert,
  FlatList,
  ActivityIndicator,
  Switch,
  Platform,
  Image,
  Linking,
} from "react-native";
import { SafeImage } from "@/components/SafeImage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useThemedAlert } from "@/components/ThemedAlert";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ScreenKeyboardAwareScrollView } from "@/components/ScreenKeyboardAwareScrollView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import VoiceBio from "@/components/VoiceBio";
import { getApiBaseUrl } from "@/constants/config";
import * as WebBrowser from "expo-web-browser";

type EditProfileScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "EditProfile">;

interface EditProfileScreenProps {
  navigation: EditProfileScreenNavigationProp;
}

const EDIT_PROFILE_STORAGE_KEY = "emorii_edit_profile_draft";

const ZODIAC_OPTIONS = [
  { value: 'aries', label: 'Aries' },
  { value: 'taurus', label: 'Taurus' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'cancer', label: 'Cancer' },
  { value: 'leo', label: 'Leo' },
  { value: 'virgo', label: 'Virgo' },
  { value: 'libra', label: 'Libra' },
  { value: 'scorpio', label: 'Scorpio' },
  { value: 'sagittarius', label: 'Sagittarius' },
  { value: 'capricorn', label: 'Capricorn' },
  { value: 'aquarius', label: 'Aquarius' },
  { value: 'pisces', label: 'Pisces' },
];

const EDUCATION_OPTIONS = [
  { value: 'high_school', label: 'High School' },
  { value: 'some_college', label: 'Some College' },
  { value: 'bachelors', label: "Bachelor's Degree" },
  { value: 'masters', label: "Master's Degree" },
  { value: 'doctorate', label: 'Doctorate' },
  { value: 'trade_school', label: 'Trade School' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const LOOKING_FOR_OPTIONS = [
  { value: 'relationship', label: 'Relationship' },
  { value: 'friendship', label: 'Friendship' },
  { value: 'casual', label: 'Casual' },
  { value: 'networking', label: 'Networking' },
];

const SMOKING_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'socially', label: 'Socially' },
  { value: 'regularly', label: 'Regularly' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const DRINKING_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'socially', label: 'Socially' },
  { value: 'regularly', label: 'Regularly' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const WORKOUT_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'rarely', label: 'Rarely' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'often', label: 'Often' },
  { value: 'daily', label: 'Daily' },
];

const RELIGION_OPTIONS = [
  { value: 'christian', label: 'Christian' },
  { value: 'muslim', label: 'Muslim' },
  { value: 'traditional', label: 'Traditional' },
  { value: 'atheist', label: 'Atheist' },
  { value: 'agnostic', label: 'Agnostic' },
  { value: 'deist', label: 'Deist' },
  { value: 'spiritual', label: 'Spiritual' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const ETHNICITY_OPTIONS = [
  { value: 'african', label: 'African' },
  { value: 'african_american', label: 'African American' },
  { value: 'caribbean', label: 'Caribbean' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const PETS_OPTIONS = [
  { value: 'dog', label: 'Dog 🐕' },
  { value: 'cat', label: 'Cat 🐈' },
  { value: 'parrot', label: 'Parrot 🦜' },
  { value: 'fish', label: 'Fish 🐟' },
  { value: 'rabbit', label: 'Rabbit 🐇' },
  { value: 'other', label: 'Other' },
  { value: 'none', label: 'No pets' },
  { value: 'allergic', label: 'Allergic to pets' },
];

const RELATIONSHIP_STATUS_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'dating', label: 'Dating' },
  { value: 'married', label: 'Married' },
  { value: 'single_parent', label: 'Single Parent' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
];

const RELATIONSHIP_GOAL_OPTIONS = [
  { value: 'short_term', label: 'Short-term relationship' },
  { value: 'long_term', label: 'Long-term relationship' },
  { value: 'friendship', label: 'Friendship' },
  { value: 'networking', label: 'Networking' },
  { value: 'casual', label: 'Casual dating' },
  { value: 'marriage', label: 'Marriage' },
  { value: 'open_to_everything', label: 'Open to everything' },
  { value: 'not_sure_yet', label: 'Not sure yet' },
];

const COMMUNICATION_STYLE_OPTIONS = [
  { value: 'introverted', label: 'Introverted' },
  { value: 'extroverted', label: 'Extroverted' },
  { value: 'ambivert', label: 'Ambivert' },
  { value: 'big_talker', label: 'Big Talker' },
  { value: 'listener', label: 'Better Listener' },
  { value: 'texter', label: 'Prefer Texting' },
  { value: 'caller', label: 'Prefer Calling' },
];

const LOVE_STYLE_OPTIONS = [
  { value: 'romantic', label: 'Romantic' },
  { value: 'playful', label: 'Playful' },
  { value: 'practical', label: 'Practical' },
  { value: 'selfless', label: 'Selfless' },
  { value: 'physical', label: 'Physical Touch' },
  { value: 'acts_of_service', label: 'Acts of Service' },
  { value: 'words_of_affirmation', label: 'Words of Affirmation' },
  { value: 'quality_time', label: 'Quality Time' },
  { value: 'gift_giving', label: 'Gift Giving' },
];

const GENDER_OPTIONS = [
  { value: 'man', label: 'Man' },
  { value: 'woman', label: 'Woman' },
];

const HEIGHT_OPTIONS = Array.from({ length: 81 }, (_, i) => {
  const cm = 140 + i;
  const totalInches = Math.round(cm / 2.54);
  const ft = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { value: `${cm}`, label: `${cm} cm (${ft}'${inches}")` };
});

const INTEREST_OPTIONS = [
  { id: 'music', label: 'Music', icon: 'musical-notes' },
  { id: 'travel', label: 'Travel', icon: 'airplane' },
  { id: 'cooking', label: 'Cooking', icon: 'restaurant' },
  { id: 'fitness', label: 'Fitness', icon: 'fitness' },
  { id: 'art', label: 'Art', icon: 'color-palette' },
  { id: 'gaming', label: 'Gaming', icon: 'game-controller' },
  { id: 'movies', label: 'Movies', icon: 'film' },
  { id: 'reading', label: 'Reading', icon: 'book' },
  { id: 'photography', label: 'Photography', icon: 'camera' },
  { id: 'dancing', label: 'Dancing', icon: 'footsteps' },
  { id: 'coding', label: 'Coding', icon: 'code-slash' },
  { id: 'sports', label: 'Sports', icon: 'basketball' },
  { id: 'fashion', label: 'Fashion', icon: 'shirt' },
  { id: 'nature', label: 'Nature', icon: 'leaf' },
  { id: 'technology', label: 'Technology', icon: 'hardware-chip' },
  { id: 'business', label: 'Business', icon: 'briefcase' },
  { id: 'outdoors', label: 'Outdoors', icon: 'trail-sign' },
  { id: 'socializing', label: 'Socializing', icon: 'people' },
  { id: 'wellness', label: 'Wellness', icon: 'heart-half' },
  { id: 'creativity', label: 'Creativity', icon: 'brush' },
  { id: 'values', label: 'Values', icon: 'diamond' },
  { id: 'food', label: 'Food', icon: 'fast-food' },
];

const DIASPORA_GENERATION_OPTIONS = [
  { value: 'born_in_africa', label: '1st Generation (Born in Africa)' },
  { value: '1st_gen', label: '2nd Generation (Parents born in Africa)' },
  { value: '2nd_gen', label: '3rd Generation (Grandparents born in Africa)' },
  { value: '3rd_gen_plus', label: '4th Generation or beyond' },
  { value: 'not_applicable', label: 'Not Applicable' },
];

const InputField = ({ label, value, onChangeText, placeholder, multiline, icon, accent, editable = true }: any) => {
  const { theme, isDark } = useTheme();
  return (
    <View style={styles.fieldContainer}>
      <View style={styles.fieldLabelRow}>
        <ThemedText style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
        {value?.length > 0 && (
          <View style={[styles.fieldFilledDot, { backgroundColor: accent || theme.primary }]} />
        )}
      </View>
      <View style={[
        styles.inputRow,
        {
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F7F8FA',
          borderColor: value?.length > 0 ? (accent || theme.primary) + '40' : theme.border,
        },
      ]}>
        {icon && (
          <View style={[styles.selectIconWrap, { backgroundColor: value?.length > 0 ? (accent || theme.primary) + '15' : theme.border + '50' }]}>
            <Feather name={icon} size={15} color={value?.length > 0 ? (accent || theme.primary) : theme.textSecondary} />
          </View>
        )}
        <TextInput
          style={[styles.textInput, { color: theme.text }, multiline && styles.multilineInput, !editable && { opacity: 0.6 }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          multiline={multiline}
          editable={editable}
        />
      </View>
    </View>
  );
};

const SelectButton = ({ label, value, options, onPress, icon, accent }: any) => {
  const { theme, isDark } = useTheme();
  const displayLabel = options ? options.find((o: any) => o.value === value)?.label : value;
  const hasValue = !!value;
  return (
    <Pressable
      style={[
        styles.selectButton,
        {
          backgroundColor: hasValue
            ? (accent ? accent + '10' : theme.primary + '0D')
            : (isDark ? 'rgba(255,255,255,0.04)' : '#F7F8FA'),
          borderColor: hasValue ? (accent || theme.primary) + '40' : theme.border,
        },
      ]}
      onPress={onPress}
    >
      {icon && (
        <View style={[styles.selectIconWrap, { backgroundColor: hasValue ? (accent || theme.primary) + '15' : theme.border + '50' }]}>
          <Feather name={icon} size={15} color={hasValue ? (accent || theme.primary) : theme.textSecondary} />
        </View>
      )}
      <ThemedText style={[styles.selectButtonText, { color: hasValue ? theme.text : theme.textSecondary, fontWeight: hasValue ? '500' : '400' }]}>
        {displayLabel || label}
      </ThemedText>
      <Feather name="chevron-down" size={16} color={hasValue ? (accent || theme.primary) : theme.textSecondary} />
    </Pressable>
  );
};

const ToggleField = ({ label, description, value, onValueChange, icon, accent }: any) => {
  const { theme, isDark } = useTheme();
  return (
    <View style={[styles.toggleRow, { backgroundColor: 'transparent' }]}>
      <View style={styles.toggleLeft}>
        <View style={[styles.toggleIconWrap, { backgroundColor: (accent || theme.primary) + '15' }]}>
          <Feather name={icon} size={16} color={accent || theme.primary} />
        </View>
        <View style={styles.toggleTextGroup}>
          <ThemedText style={[styles.toggleLabel, { color: theme.text }]}>{label}</ThemedText>
          {description && (
            <ThemedText style={[styles.toggleDescription, { color: theme.textSecondary }]}>{description}</ThemedText>
          )}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.border, true: (accent || theme.primary) + '90' }}
        thumbColor={value ? (accent || theme.primary) : isDark ? '#888' : '#CCC'}
      />
    </View>
  );
};

const SectionHeader = ({ icon, label, color, description }: { icon: any; label: string; color: string; description?: string }) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.sectionHeader, { borderBottomColor: theme.border + '60' }]}>
      <LinearGradient
        colors={[color + '25', color + '10']}
        style={styles.sectionIconWrap}
      >
        <Feather name={icon} size={17} color={color} />
      </LinearGradient>
      <View style={styles.sectionHeaderText}>
        <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>{label}</ThemedText>
        {description && (
          <ThemedText style={[styles.sectionDescription, { color: theme.textSecondary }]}>{description}</ThemedText>
        )}
      </View>
    </View>
  );
};

const OptionModal = ({ visible, onClose, title, subtitle, options, selectedValue, onSelect }: any) => {
  const { theme, isDark } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.modalDragHandle, { backgroundColor: theme.border }]} />
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <View>
              <ThemedText style={[styles.modalTitle, { color: theme.text }]}>{title}</ThemedText>
              {subtitle && (
                <ThemedText style={[styles.modalSubtitle, { color: theme.textSecondary }]}>{subtitle}</ThemedText>
              )}
            </View>
            <Pressable onPress={onClose} style={[styles.modalCloseBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0F0F0' }]}>
              <Feather name="x" size={18} color={theme.text} />
            </Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(item: any) => item.value}
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item }: any) => {
              const isSelected = selectedValue === item.value;
              return (
                <Pressable
                  style={[
                    styles.optionItem,
                    { borderBottomColor: theme.border },
                    isSelected && { backgroundColor: theme.primary + '0C' },
                  ]}
                  onPress={() => { onSelect(item.value); onClose(); }}
                >
                  <ThemedText style={[styles.optionLabel, { color: isSelected ? theme.primary : theme.text, fontWeight: isSelected ? '700' : '400' }]}>
                    {item.label}
                  </ThemedText>
                  {isSelected && (
                    <View style={[styles.optionCheckCircle, { backgroundColor: theme.primary }]}>
                      <Feather name="check" size={12} color="#FFF" />
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
};

const MultiSelectModal = ({ visible, onClose, title, options, selectedValues, onSelect }: any) => {
  const { theme, isDark } = useTheme();
  const toggle = (value: string) => {
    const exclusive = ['none', 'allergic'];
    if (exclusive.includes(value)) {
      onSelect([value]);
      return;
    }
    const current: string[] = (selectedValues || []).filter((v: string) => !exclusive.includes(v));
    if (current.includes(value)) {
      onSelect(current.filter((v: string) => v !== value));
    } else {
      onSelect([...current, value]);
    }
  };
  const selected: string[] = selectedValues || [];
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.modalDragHandle, { backgroundColor: theme.border }]} />
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <View>
              <ThemedText style={[styles.modalTitle, { color: theme.text }]}>{title}</ThemedText>
              <ThemedText style={[styles.modalSubtitle, { color: theme.textSecondary }]}>Select all that apply</ThemedText>
            </View>
            <Pressable onPress={onClose} style={[styles.modalCloseBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0F0F0' }]}>
              <Feather name="x" size={18} color={theme.text} />
            </Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(item: any) => item.value}
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item }: any) => {
              const isSelected = selected.includes(item.value);
              return (
                <Pressable
                  style={[
                    styles.optionItem,
                    { borderBottomColor: theme.border },
                    isSelected && { backgroundColor: theme.primary + '0C' },
                  ]}
                  onPress={() => toggle(item.value)}
                >
                  <ThemedText style={[styles.optionLabel, { color: isSelected ? theme.primary : theme.text, fontWeight: isSelected ? '700' : '400' }]}>
                    {item.label}
                  </ThemedText>
                  {isSelected && (
                    <View style={[styles.optionCheckCircle, { backgroundColor: theme.primary }]}>
                      <Feather name="check" size={12} color="#FFF" />
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
};

const InterestModal = ({ visible, onClose, interests, toggleInterest, insetsBottom }: any) => {
  const { theme, isDark } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.modalDragHandle, { backgroundColor: theme.border }]} />
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <View>
              <ThemedText style={[styles.modalTitle, { color: theme.text }]}>Your Interests</ThemedText>
              <ThemedText style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                {interests.length} selected
              </ThemedText>
            </View>
            <Pressable onPress={onClose} style={[styles.modalCloseBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0F0F0' }]}>
              <Feather name="x" size={18} color={theme.text} />
            </Pressable>
          </View>
          <FlatList
            data={INTEREST_OPTIONS}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            renderItem={({ item }) => {
              const isSelected = interests.includes(item.id);
              return (
                <Pressable
                  style={[
                    styles.interestOptionItem,
                    {
                      borderColor: isSelected ? theme.primary : theme.border,
                      backgroundColor: isSelected ? theme.primary + '18' : isDark ? 'rgba(255,255,255,0.04)' : '#FAFAFA',
                    },
                  ]}
                  onPress={() => toggleInterest(item.id)}
                >
                  <View style={[styles.interestIconWrap, { backgroundColor: isSelected ? theme.primary + '25' : theme.border + '40' }]}>
                    <Ionicons name={item.icon as any} size={16} color={isSelected ? theme.primary : theme.textSecondary} />
                  </View>
                  <ThemedText style={[styles.interestOptionLabel, { color: isSelected ? theme.primary : theme.text, fontWeight: isSelected ? '700' : '500' }]}>
                    {item.label}
                  </ThemedText>
                  {isSelected && (
                    <View style={[styles.interestCheckBadge, { backgroundColor: theme.primary }]}>
                      <Feather name="check" size={10} color="#FFF" />
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
          <View style={[styles.modalFooter, { borderTopColor: theme.border, backgroundColor: theme.surface, paddingBottom: insetsBottom + 8 }]}>
            <Pressable style={[styles.doneButton, { backgroundColor: theme.primary }]} onPress={onClose}>
              <ThemedText style={styles.doneButtonText}>Done  ·  {interests.length} selected</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function EditProfileScreen({ navigation }: EditProfileScreenProps) {
  const { theme, isDark } = useTheme();
  const { user, updateProfile, fetchUser, token } = useAuth();
  const { del, put } = useApi();
  const [autoUpdateLocation, setAutoUpdateLocation] = useState((user as any)?.autoUpdateProfileLocation ?? false);
  const [autoUpdateSaving, setAutoUpdateSaving] = useState(false);

  const handleAutoUpdateLocationToggle = async (value: boolean) => {
    setAutoUpdateLocation(value);
    if (!token) return;
    setAutoUpdateSaving(true);
    try {
      const response = await put('/users/me', { autoUpdateProfileLocation: value }, token);
      if (response.success) {
        if (fetchUser) await fetchUser();
        if (value) {
          try {
            const { pushLiveLocation } = await import('@/utils/liveLocation');
            pushLiveLocation(token, { force: true })
              .then(() => { if (fetchUser) fetchUser(); })
              .catch(() => {});
          } catch {}
        }
      } else {
        setAutoUpdateLocation(!value);
      }
    } catch (e) {
      logger.error('Failed to toggle auto-update location:', e);
      setAutoUpdateLocation(!value);
    } finally {
      setAutoUpdateSaving(false);
    }
  };
  const { showAlert, AlertComponent } = useThemedAlert();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || "");
  const [livingIn, setLivingIn] = useState(user?.livingIn || "");
  const [zodiacSign, setZodiacSign] = useState(user?.zodiacSign || "");
  const [education, setEducation] = useState(user?.education || "");
  const [lookingFor, setLookingFor] = useState(user?.lookingFor || "relationship");
  const [songTitle, setSongTitle] = useState(user?.favoriteSong?.title || "");
  const [songArtist, setSongArtist] = useState(user?.favoriteSong?.artist || "");

  const [smoking, setSmoking] = useState(user?.lifestyle?.smoking || "");
  const [drinking, setDrinking] = useState(user?.lifestyle?.drinking || "");
  const [workout, setWorkout] = useState(user?.lifestyle?.workout || "");
  const [religion, setReligion] = useState(user?.lifestyle?.religion || "");
  const [ethnicity, setEthnicity] = useState(user?.lifestyle?.ethnicity || (user as any)?.ethnicity || "");
  const rawPets = user?.lifestyle?.pets;
  const [pets, setPets] = useState<string[]>(
    Array.isArray(rawPets)
      ? rawPets
      : (rawPets ? String(rawPets).split(',').map((p: string) => p.trim()).filter(Boolean) : [])
  );
  const [relationshipStatus, setRelationshipStatus] = useState(user?.lifestyle?.relationshipStatus || "");
  const [personalityType, setPersonalityType] = useState(user?.lifestyle?.personalityType || "");
  const [communicationStyle, setCommunicationStyle] = useState(user?.lifestyle?.communicationStyle || "");
  const [loveStyle, setLoveStyle] = useState(user?.lifestyle?.loveStyle || "");
  const [hasKids, setHasKids] = useState<boolean>(user?.lifestyle?.hasKids ?? false);
  const [wantsKids, setWantsKids] = useState<boolean>(user?.lifestyle?.wantsKids ?? false);
  const [relationshipGoal, setRelationshipGoal] = useState((user as any)?.relationshipGoal || "");
  const normalizeGender = (g?: string) => {
    if (!g) return "";
    const lower = g.toLowerCase();
    if (lower === "male") return "man";
    if (lower === "female") return "woman";
    return lower;
  };
  const [gender, setGender] = useState(normalizeGender(user?.gender));
  const [height, setHeight] = useState(user?.height?.toString() || "");
  const [interests, setInterests] = useState<string[]>(
    (user?.interests || []).map((i: string) => i.toLowerCase())
  );
  const [saving, setSaving] = useState(false);

  const [countryOfOrigin, setCountryOfOrigin] = useState((user as any)?.countryOfOrigin || "");
  const [tribe, setTribe] = useState((user as any)?.tribe || "");
  const [languagesSpoken, setLanguagesSpoken] = useState((user as any)?.languages?.join(", ") || "");
  const [diasporaGeneration, setDiasporaGeneration] = useState((user as any)?.diasporaGeneration || "");
  const [voiceBioUrl, setVoiceBioUrl] = useState((user as any)?.voiceBio?.url || "");
  const [voiceBioDuration, setVoiceBioDuration] = useState((user as any)?.voiceBio?.duration || 0);

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [interestsModalVisible, setInterestsModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'vibes' | 'roots' | 'more'>('profile');

  const [spotifyConnected, setSpotifyConnected] = useState((user as any)?.spotify?.connected || false);
  const [spotifyDisplayName, setSpotifyDisplayName] = useState((user as any)?.spotify?.displayName || "");
  const [connectingSpotify, setConnectingSpotify] = useState(false);
  const [spotifySearchQuery, setSpotifySearchQuery] = useState("");
  const [spotifySearchResults, setSpotifySearchResults] = useState<any[]>([]);
  const [spotifySearchVisible, setSpotifySearchVisible] = useState(false);
  const [searchingSpotify, setSearchingSpotify] = useState(false);
  const [songAlbumArt, setSongAlbumArt] = useState((user as any)?.favoriteSong?.albumArt || "");
  const [songSpotifyUri, setSongSpotifyUri] = useState((user as any)?.favoriteSong?.spotifyUri || "");
  const [songPreviewUrl, setSongPreviewUrl] = useState((user as any)?.favoriteSong?.previewUrl || "");

  useEffect(() => {
    const loadDraft = async () => {
      try {
        const draft = await AsyncStorage.getItem(EDIT_PROFILE_STORAGE_KEY);
        if (draft) {
          const d = JSON.parse(draft);
          if (d.name) setName(d.name);
          if (d.bio) setBio(d.bio);
          if (d.jobTitle) setJobTitle(d.jobTitle);
          if (d.livingIn) setLivingIn(d.livingIn);
          if (d.zodiacSign) setZodiacSign(d.zodiacSign);
          if (d.education) setEducation(d.education);
          if (d.lookingFor) setLookingFor(d.lookingFor);
          if (d.songTitle) setSongTitle(d.songTitle);
          if (d.songArtist) setSongArtist(d.songArtist);
          if (d.smoking) setSmoking(d.smoking);
          if (d.drinking) setDrinking(d.drinking);
          if (d.workout) setWorkout(d.workout);
          if (d.religion) setReligion(d.religion);
          if (d.ethnicity) setEthnicity(d.ethnicity);
          if (d.pets) setPets(Array.isArray(d.pets) ? d.pets : [d.pets]);
          if (d.relationshipStatus) setRelationshipStatus(d.relationshipStatus);
          if (d.personalityType) setPersonalityType(d.personalityType);
          if (d.communicationStyle) setCommunicationStyle(d.communicationStyle);
          if (d.loveStyle) setLoveStyle(d.loveStyle);
          if (d.hasKids != null) setHasKids(d.hasKids);
          if (d.wantsKids != null) setWantsKids(d.wantsKids);
          if (d.relationshipGoal) setRelationshipGoal(d.relationshipGoal);
          if (d.interests) setInterests(d.interests);
        }
      } catch (e) {
        logger.error("Failed to load edit profile draft:", e);
      }
    };
    loadDraft();
  }, []);

  const handleConnectSpotify = async () => {
    if (!token) return;
    setConnectingSpotify(true);
    try {
      const resp = await fetch(`${getApiBaseUrl()}/api/spotify/auth-url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!data.success || !data.authUrl) {
        Alert.alert("Spotify", data.message || "Could not connect to Spotify. Make sure Spotify integration is configured.");
        return;
      }

      // Attach the deep-link listener BEFORE opening the browser so we never
      // miss the emorii://spotify?success=true redirect even if it fires
      // while the Custom Tab is still animating closed.
      // deepLinkOutcome: null = no deep link received yet
      //                  true = success deep link received
      //                  false = error deep link received
      let deepLinkOutcome: boolean | null = null;
      const subscription = Linking.addEventListener('url', ({ url }) => {
        if (!url.includes('emorii://spotify')) return;
        subscription.remove();
        deepLinkOutcome = url.includes('success=true');
        logger.log('[Spotify] Deep link received:', url, '→ success:', deepLinkOutcome);
      });

      await WebBrowser.openBrowserAsync(data.authUrl);

      // Browser dismissed — clean up listener if it never fired (user closed
      // the browser manually on a device that doesn't support app-switching
      // via deep link, e.g. some Android OEMs).
      subscription.remove();

      // If the deep link explicitly signalled an error, bail out immediately.
      if (deepLinkOutcome === false) {
        Alert.alert("Spotify", "Spotify authorization was cancelled or failed. Please try again.");
        return;
      }

      // Poll /api/spotify/status.
      // • Deep link fired (deepLinkOutcome === true): the DB write is already
      //   complete — check once immediately, no delay needed.
      // • No deep link (deepLinkOutcome === null): user closed the browser
      //   manually before the redirect; retry up to 4 times with 1.5 s gaps
      //   to give the backend time to complete the OAuth callback.
      const maxAttempts = deepLinkOutcome === true ? 1 : 4;
      let statusData: any = { connected: false };
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          await new Promise<void>((r) => setTimeout(r, 1500));
        }
        try {
          const statusResp = await fetch(`${getApiBaseUrl()}/api/spotify/status`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          statusData = await statusResp.json();
          if (statusData.connected) break;
        } catch {
          // network blip — try again
        }
      }

      if (statusData.connected) {
        setSpotifyConnected(true);
        setSpotifyDisplayName(statusData.displayName || "");
        if (statusData.favoriteSong?.title) {
          setSongTitle(statusData.favoriteSong.title);
          setSongArtist(statusData.favoriteSong.artist || "");
          setSongAlbumArt(statusData.favoriteSong.albumArt || "");
          setSongSpotifyUri(statusData.favoriteSong.spotifyUri || "");
          setSongPreviewUrl(statusData.favoriteSong.previewUrl || "");
        }
        if (fetchUser) await fetchUser();
      } else {
        Alert.alert("Spotify", "Could not confirm Spotify connection. Please try again.");
      }
    } catch (err) {
      Alert.alert("Error", "Failed to connect Spotify. Please try again.");
    } finally {
      setConnectingSpotify(false);
    }
  };

  const handleDisconnectSpotify = () => {
    if (!token) return;
    Alert.alert("Disconnect Spotify", "Are you sure you want to disconnect your Spotify account?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${getApiBaseUrl()}/api/spotify/disconnect`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            setSpotifyConnected(false);
            setSpotifyDisplayName("");
            if (fetchUser) await fetchUser();
          } catch (err) {
            Alert.alert("Error", "Failed to disconnect Spotify.");
          }
        },
      },
    ]);
  };

  const handleSpotifySearch = async () => {
    if (!spotifySearchQuery.trim() || !token) return;
    setSearchingSpotify(true);
    try {
      const resp = await fetch(
        `${getApiBaseUrl()}/api/spotify/search?q=${encodeURIComponent(spotifySearchQuery.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await resp.json();
      if (data.success) {
        setSpotifySearchResults(data.tracks || []);
      } else {
        Alert.alert("Search Failed", data.message || "Could not search Spotify.");
      }
    } catch (err) {
      Alert.alert("Error", "Failed to search Spotify.");
    } finally {
      setSearchingSpotify(false);
    }
  };

  const handleSelectSpotifySong = async (track: any) => {
    if (!token) return;
    setSongTitle(track.title);
    setSongArtist(track.artist);
    setSongAlbumArt(track.albumArt || "");
    setSongSpotifyUri(track.spotifyUri || "");
    setSongPreviewUrl(track.previewUrl || "");
    setSpotifySearchVisible(false);
    setSpotifySearchQuery("");
    setSpotifySearchResults([]);
    try {
      await fetch(`${getApiBaseUrl()}/api/spotify/set-song`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: track.title,
          artist: track.artist,
          spotifyUri: track.spotifyUri,
          albumArt: track.albumArt,
          previewUrl: track.previewUrl,
        }),
      });
      if (fetchUser) await fetchUser();
    } catch (err) {
      logger.error("Failed to save Spotify song:", err);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showAlert("Error", "Name is required", [{ text: "OK", style: "default" }], "alert-circle");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        bio: bio.trim(),
        jobTitle: jobTitle.trim(),
        livingIn: livingIn.trim(),
        zodiacSign: zodiacSign || undefined,
        education: education || undefined,
        lookingFor: lookingFor as any,
        relationshipGoal: relationshipGoal || undefined,
        gender: gender || undefined,
        height: height ? parseInt(height) : undefined,
        favoriteSong: (songTitle.trim() || songArtist.trim()) ? {
          title: songTitle.trim(),
          artist: songArtist.trim(),
          ...(songAlbumArt ? { albumArt: songAlbumArt } : {}),
          ...(songSpotifyUri ? { spotifyUri: songSpotifyUri } : {}),
          ...(songPreviewUrl ? { previewUrl: songPreviewUrl } : {}),
        } : undefined,
        lifestyle: {
          smoking: smoking || undefined,
          drinking: drinking || undefined,
          workout: workout || undefined,
          religion: religion || undefined,
          ethnicity: ethnicity || undefined,
          pets: pets.length > 0 ? pets : undefined,
          relationshipStatus: relationshipStatus || undefined,
          personalityType: personalityType.trim() || undefined,
          communicationStyle: communicationStyle || undefined,
          loveStyle: loveStyle || undefined,
          hasKids,
          wantsKids,
        },
        interests,
        language: user?.language || 'en',
        countryOfOrigin: countryOfOrigin.trim() || undefined,
        tribe: tribe.trim() || undefined,
        languages: languagesSpoken.trim() ? languagesSpoken.split(",").map((l: string) => l.trim()).filter(Boolean) : undefined,
        diasporaGeneration: diasporaGeneration || undefined,
      } as any);

      await AsyncStorage.removeItem(EDIT_PROFILE_STORAGE_KEY);
      if (fetchUser) await fetchUser();
      Alert.alert("Success", "Profile updated successfully", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      showAlert("Error", error.message || "Failed to update profile", [{ text: "OK", style: "default" }], "alert-circle");
    } finally {
      setSaving(false);
    }
  };

  const toggleInterest = (id: string) => {
    setInterests(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleVoiceBioRecord = async (uri: string, duration: number) => {
    try {
      const formData = new FormData();
      formData.append('audio', { uri, name: 'voice_bio.m4a', type: 'audio/mp4' } as any);
      const res = await fetch(`${getApiBaseUrl()}/api/upload/voice-bio`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      let data: any;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text.startsWith('<') ? 'Server error. Please try again.' : text || 'Upload failed');
      }

      if (!res.ok) throw new Error(data?.message || 'Upload failed');
      setVoiceBioUrl(data.url);
      setVoiceBioDuration(duration);
      if (fetchUser) await fetchUser();
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to upload voice bio', [{ text: 'OK', style: 'default' }], 'alert-circle');
    }
  };

  const handleVoiceBioDelete = async () => {
    try {
      await del('/upload/voice-bio', token ?? undefined);
      setVoiceBioUrl('');
      setVoiceBioDuration(0);
      if (fetchUser) await fetchUser();
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to delete voice bio', [{ text: 'OK', style: 'default' }], 'alert-circle');
    }
  };

  const filledFields = [
    name, bio, jobTitle, livingIn, zodiacSign, education, lookingFor,
    songTitle, smoking, drinking, workout, religion, ethnicity, pets,
    relationshipStatus, communicationStyle, loveStyle, gender, height,
    personalityType, countryOfOrigin, tribe,
  ].filter(Boolean).length + (interests.length > 0 ? 1 : 0);
  const totalFields = 23;
  const completionPct = Math.round((filledFields / totalFields) * 100);

  const handleDiasporaSelect = async (value: string) => {
    setDiasporaGeneration(value);
    try {
      await updateProfile({ diasporaGeneration: value } as any);
      if (fetchUser) await fetchUser();
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to save diaspora selection', [{ text: 'OK', style: 'default' }], 'alert-circle');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* HEADER */}
      <LinearGradient
        colors={isDark
          ? [theme.primary + '28', theme.primary + '08', 'transparent']
          : [theme.primary + '1A', theme.primary + '05', 'transparent']}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => navigation.goBack()} style={[styles.headerBack, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: theme.text }]}>Edit Profile</ThemedText>
        <Pressable onPress={handleSave} disabled={saving} style={[styles.headerSaveBtn, { backgroundColor: theme.primary, opacity: saving ? 0.7 : 1 }]}>
          {saving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Feather name="check" size={15} color="#FFF" />
              <ThemedText style={styles.headerSaveBtnText}>Save</ThemedText>
            </>
          )}
        </Pressable>
      </LinearGradient>

      {/* HERO */}
      <Pressable onPress={() => navigation.navigate('ChangeProfilePicture')} style={[styles.hero, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={styles.heroLeft}>
          <View style={[styles.heroRing, { borderColor: theme.primary + '60' }]}>
            {user?.photos?.[0] ? (
              <SafeImage source={typeof user.photos[0] === 'string' ? user.photos[0] : user.photos[0].url} style={styles.heroPhoto} />
            ) : (
              <View style={[styles.heroPhotoEmpty, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="camera" size={28} color={theme.primary} />
              </View>
            )}
            <View style={[styles.heroRingBadge, { backgroundColor: theme.primary, borderColor: theme.surface }]}>
              <Feather name="camera" size={11} color="#FFF" />
            </View>
          </View>
        </View>
        <View style={styles.heroInfo}>
          <ThemedText style={[styles.heroName, { color: theme.text }]} numberOfLines={1}>{name || 'Your Name'}</ThemedText>
          <ThemedText style={[styles.heroSub, { color: theme.textSecondary }]}>Tap to manage photos · {user?.photos?.length || 0}/6</ThemedText>
          <View style={styles.heroBarRow}>
            <View style={[styles.heroBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E8E8E8' }]}>
              <View style={[styles.heroBarFill, { width: (completionPct + '%') as any, backgroundColor: completionPct >= 80 ? '#10B981' : theme.primary }]} />
            </View>
            <ThemedText style={[styles.heroBarLabel, { color: completionPct >= 80 ? '#10B981' : theme.primary }]}>{completionPct}%</ThemedText>
          </View>
        </View>
      </Pressable>

      {/* TAB BAR */}
      <View style={[styles.tabBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {([
          { key: 'profile' as const, label: 'Profile', icon: 'user' as const },
          { key: 'vibes' as const, label: 'Vibes', icon: 'zap' as const },
          { key: 'roots' as const, label: 'Roots', icon: 'globe' as const },
          { key: 'more' as const, label: 'More', icon: 'grid' as const },
        ]).map(tab => (
          <Pressable
            key={tab.key}
            style={[styles.tabItem, activeTab === tab.key && { borderBottomColor: theme.primary, borderBottomWidth: 2.5 }]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Feather name={tab.icon} size={14} color={activeTab === tab.key ? theme.primary : theme.textSecondary} />
            <ThemedText style={[styles.tabLabel, { color: activeTab === tab.key ? theme.primary : theme.textSecondary, fontWeight: activeTab === tab.key ? '700' : '500' }]}>
              {tab.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* CONTENT */}
      <ScreenKeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.cardHeader, { borderBottomColor: theme.border + '60' }]}>
                <LinearGradient colors={[theme.primary + '28', theme.primary + '10']} style={styles.cardIconWrap}>
                  <Feather name="user" size={16} color={theme.primary} />
                </LinearGradient>
                <View>
                  <ThemedText style={[styles.cardTitle, { color: theme.text }]}>Basic Info</ThemedText>
                  <ThemedText style={[styles.cardSub, { color: theme.textSecondary }]}>How others see you</ThemedText>
                </View>
              </View>
              <View style={styles.cardBody}>
                <InputField label="Full Name *" value={name} onChangeText={setName} placeholder="Your name" icon="user" />
                <InputField label="Bio" value={bio} onChangeText={setBio} placeholder="Tell others about yourself..." multiline icon="edit-3" />
                <View style={styles.row2}>
                  <View style={styles.half}>
                    <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Gender</ThemedText>
                    <SelectButton label="Gender" value={gender} options={GENDER_OPTIONS} onPress={() => setActiveModal('gender')} icon="users" />
                  </View>
                  <View style={styles.half}>
                    <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Height</ThemedText>
                    <SelectButton label="Height" value={height} options={HEIGHT_OPTIONS} onPress={() => setActiveModal('height')} icon="trending-up" />
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.cardHeader, { borderBottomColor: theme.border + '60' }]}>
                <LinearGradient colors={['#FF6B9D28', '#FF6B9D10']} style={styles.cardIconWrap}>
                  <Feather name="heart" size={16} color="#FF6B9D" />
                </LinearGradient>
                <View>
                  <ThemedText style={[styles.cardTitle, { color: theme.text }]}>Interests</ThemedText>
                  <ThemedText style={[styles.cardSub, { color: theme.textSecondary }]}>What makes you, you</ThemedText>
                </View>
              </View>
              <View style={styles.cardBody}>
                <Pressable
                  style={[styles.triggerRow, { borderColor: interests.length > 0 ? '#FF6B9D40' : theme.border, backgroundColor: interests.length > 0 ? '#FF6B9D08' : (isDark ? 'rgba(255,255,255,0.04)' : '#F8F8F8') }]}
                  onPress={() => setInterestsModalVisible(true)}
                >
                  <View style={[styles.triggerIcon, { backgroundColor: interests.length > 0 ? '#FF6B9D20' : theme.border + '50' }]}>
                    <Feather name="plus-circle" size={15} color={interests.length > 0 ? '#FF6B9D' : theme.textSecondary} />
                  </View>
                  <ThemedText style={[styles.triggerText, { color: interests.length > 0 ? theme.text : theme.textSecondary }]}>
                    {interests.length > 0 ? interests.length + ' interests selected' : 'Choose your interests'}
                  </ThemedText>
                  <Feather name="chevron-right" size={16} color={interests.length > 0 ? '#FF6B9D' : theme.textSecondary} />
                </Pressable>
                {interests.length > 0 && (
                  <View style={styles.chipsWrap}>
                    {interests.map((id: string) => {
                      const opt = INTEREST_OPTIONS.find(o => o.id === id);
                      return (
                        <View key={id} style={[styles.chip, { backgroundColor: '#FF6B9D12', borderColor: '#FF6B9D30' }]}>
                          {opt && <Ionicons name={opt.icon as any} size={11} color="#FF6B9D" />}
                          <ThemedText style={[styles.chipText, { color: theme.text }]}>{opt?.label || id}</ThemedText>
                          <Pressable onPress={() => toggleInterest(id)} hitSlop={8}>
                            <Feather name="x" size={10} color={theme.textSecondary} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.cardHeader, { borderBottomColor: theme.border + '60' }]}>
                <LinearGradient colors={['#8B5CF628', '#8B5CF610']} style={styles.cardIconWrap}>
                  <Feather name="target" size={16} color="#8B5CF6" />
                </LinearGradient>
                <View>
                  <ThemedText style={[styles.cardTitle, { color: theme.text }]}>Dating Preferences</ThemedText>
                  <ThemedText style={[styles.cardSub, { color: theme.textSecondary }]}>What you're looking for</ThemedText>
                </View>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.fieldWrap}>
                  <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Looking For</ThemedText>
                  <SelectButton label="What are you seeking?" value={lookingFor} options={LOOKING_FOR_OPTIONS} onPress={() => setActiveModal('lookingFor')} icon="search" accent="#8B5CF6" />
                </View>
                <View style={styles.fieldWrap}>
                  <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Relationship Goal</ThemedText>
                  <SelectButton label="Your goal" value={relationshipGoal} options={RELATIONSHIP_GOAL_OPTIONS} onPress={() => setActiveModal('relationshipGoal')} icon="heart" accent="#8B5CF6" />
                </View>
                <View style={styles.fieldWrap}>
                  <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Relationship Status</ThemedText>
                  <SelectButton label="Current status" value={relationshipStatus} options={RELATIONSHIP_STATUS_OPTIONS} onPress={() => setActiveModal('relationshipStatus')} icon="info" accent="#8B5CF6" />
                </View>
              </View>
            </View>
          </>
        )}

        {/* VIBES TAB */}
        {activeTab === 'vibes' && (
          <>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.cardHeader, { borderBottomColor: theme.border + '60' }]}>
                <LinearGradient colors={['#F59E0B28', '#F59E0B10']} style={styles.cardIconWrap}>
                  <Feather name="zap" size={16} color="#F59E0B" />
                </LinearGradient>
                <View>
                  <ThemedText style={[styles.cardTitle, { color: theme.text }]}>Personality</ThemedText>
                  <ThemedText style={[styles.cardSub, { color: theme.textSecondary }]}>Your inner world</ThemedText>
                </View>
              </View>
              <View style={styles.cardBody}>
                <InputField label="Personality Type" value={personalityType} onChangeText={setPersonalityType} placeholder="e.g. ENFP, Creative, Empath..." icon="star" accent="#F59E0B" />
                <View style={styles.fieldWrap}>
                  <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Communication Style</ThemedText>
                  <SelectButton label="How you communicate" value={communicationStyle} options={COMMUNICATION_STYLE_OPTIONS} onPress={() => setActiveModal('communicationStyle')} icon="message-circle" accent="#F59E0B" />
                </View>
                <View style={styles.fieldWrap}>
                  <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Love Language</ThemedText>
                  <SelectButton label="How you express love" value={loveStyle} options={LOVE_STYLE_OPTIONS} onPress={() => setActiveModal('loveStyle')} icon="heart" accent="#F59E0B" />
                </View>
                <View style={styles.fieldWrap}>
                  <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Zodiac Sign</ThemedText>
                  <SelectButton label="Your star sign" value={zodiacSign} options={ZODIAC_OPTIONS} onPress={() => setActiveModal('zodiac')} icon="star" accent="#F59E0B" />
                </View>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.cardHeader, { borderBottomColor: theme.border + '60' }]}>
                <LinearGradient colors={['#10B98128', '#10B98110']} style={styles.cardIconWrap}>
                  <Feather name="coffee" size={16} color="#10B981" />
                </LinearGradient>
                <View>
                  <ThemedText style={[styles.cardTitle, { color: theme.text }]}>Lifestyle</ThemedText>
                  <ThemedText style={[styles.cardSub, { color: theme.textSecondary }]}>Your day-to-day life</ThemedText>
                </View>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.row2}>
                  <View style={styles.half}>
                    <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Smoking</ThemedText>
                    <SelectButton label="Habits" value={smoking} options={SMOKING_OPTIONS} onPress={() => setActiveModal('smoking')} icon="wind" accent="#10B981" />
                  </View>
                  <View style={styles.half}>
                    <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Drinking</ThemedText>
                    <SelectButton label="Habits" value={drinking} options={DRINKING_OPTIONS} onPress={() => setActiveModal('drinking')} icon="coffee" accent="#10B981" />
                  </View>
                </View>
                <View style={styles.row2}>
                  <View style={styles.half}>
                    <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Workout</ThemedText>
                    <SelectButton label="Frequency" value={workout} options={WORKOUT_OPTIONS} onPress={() => setActiveModal('workout')} icon="activity" accent="#10B981" />
                  </View>
                  <View style={styles.half}>
                    <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Pets</ThemedText>
                    <SelectButton
                      label="Pets?"
                      value={pets.length > 0 ? pets.map((v: string) => PETS_OPTIONS.find((o: any) => o.value === v)?.label || v).join(', ') : ''}
                      options={PETS_OPTIONS}
                      onPress={() => setActiveModal('pets')}
                      icon="heart"
                      accent="#10B981"
                    />
                  </View>
                </View>
                <View style={[styles.toggleCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F7F8FA', borderColor: theme.border }]}>
                  <ToggleField label="Has Kids" description="I currently have children" value={hasKids} onValueChange={setHasKids} icon="users" accent="#10B981" />
                  <View style={[styles.toggleDivider, { backgroundColor: theme.border }]} />
                  <ToggleField label="Wants Kids" description="Open to having children" value={wantsKids} onValueChange={setWantsKids} icon="smile" accent="#10B981" />
                </View>
              </View>
            </View>
          </>
        )}

        {/* ROOTS TAB */}
        {activeTab === 'roots' && (
          <>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.cardHeader, { borderBottomColor: theme.border + '60' }]}>
                <LinearGradient colors={['#0EA5E928', '#0EA5E910']} style={styles.cardIconWrap}>
                  <Feather name="globe" size={16} color="#0EA5E9" />
                </LinearGradient>
                <View>
                  <ThemedText style={[styles.cardTitle, { color: theme.text }]}>Background</ThemedText>
                  <ThemedText style={[styles.cardSub, { color: theme.textSecondary }]}>Beliefs & education</ThemedText>
                </View>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.fieldWrap}>
                  <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Ethnicity</ThemedText>
                  <SelectButton label="Your ethnicity" value={ethnicity} options={ETHNICITY_OPTIONS} onPress={() => setActiveModal('ethnicity')} icon="globe" accent="#0EA5E9" />
                </View>
                <View style={styles.fieldWrap}>
                  <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Religion</ThemedText>
                  <SelectButton label="Your beliefs" value={religion} options={RELIGION_OPTIONS} onPress={() => setActiveModal('religion')} icon="sun" accent="#0EA5E9" />
                </View>
                <View style={styles.fieldWrap}>
                  <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Education</ThemedText>
                  <SelectButton label="Education level" value={education} options={EDUCATION_OPTIONS} onPress={() => setActiveModal('education')} icon="book" accent="#0EA5E9" />
                </View>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.cardHeader, { borderBottomColor: theme.border + '60' }]}>
                <LinearGradient colors={['#F9731628', '#F9731610']} style={styles.cardIconWrap}>
                  <Feather name="map-pin" size={16} color="#F97316" />
                </LinearGradient>
                <View>
                  <ThemedText style={[styles.cardTitle, { color: theme.text }]}>Cultural Identity</ThemedText>
                  <ThemedText style={[styles.cardSub, { color: theme.textSecondary }]}>Your African roots</ThemedText>
                </View>
              </View>
              <View style={styles.cardBody}>
                <InputField label="Country of Origin" value={countryOfOrigin} onChangeText={setCountryOfOrigin} placeholder="e.g. Nigeria, Ghana, Kenya..." icon="map-pin" accent="#F97316" />
                <InputField label="Tribe / Ethnic Group" value={tribe} onChangeText={setTribe} placeholder="e.g. Yoruba, Ashanti, Kikuyu..." icon="users" accent="#F97316" />
                <InputField label="African Languages Spoken" value={languagesSpoken} onChangeText={setLanguagesSpoken} placeholder="Comma-separated, e.g. Yoruba, Twi" icon="message-square" accent="#F97316" />
                <View style={styles.fieldWrap}>
                  <ThemedText style={[styles.miniLabel, { color: theme.textSecondary }]}>Diaspora Generation</ThemedText>
                  <SelectButton label="Which generation?" value={diasporaGeneration} options={DIASPORA_GENERATION_OPTIONS} onPress={() => setActiveModal('diasporaGeneration')} icon="git-branch" accent="#F97316" />
                </View>
                <Pressable
                  onPress={() => navigation.navigate('CompatibilityQuiz')}
                  style={({ pressed }) => [styles.quizCta, { opacity: pressed ? 0.85 : 1 }]}
                >
                  <LinearGradient colors={['#F97316', '#FB923C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.quizCtaGradient}>
                    <Ionicons name="heart-circle" size={22} color="#FFF" />
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.quizCtaTitle}>Take Cultural Compatibility Quiz</ThemedText>
                      <ThemedText style={styles.quizCtaSub}>Boost your cultural match score</ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </>
        )}

        {/* MORE TAB */}
        {activeTab === 'more' && (
          <>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.cardHeader, { borderBottomColor: theme.border + '60' }]}>
                <LinearGradient colors={['#EF444428', '#EF444410']} style={styles.cardIconWrap}>
                  <Feather name="briefcase" size={16} color="#EF4444" />
                </LinearGradient>
                <View>
                  <ThemedText style={[styles.cardTitle, { color: theme.text }]}>Work & Location</ThemedText>
                  <ThemedText style={[styles.cardSub, { color: theme.textSecondary }]}>Where you are and what you do</ThemedText>
                </View>
              </View>
              <View style={styles.cardBody}>
                <InputField label="Job Title" value={jobTitle} onChangeText={setJobTitle} placeholder="What you do" icon="briefcase" accent="#EF4444" />
                <InputField
                  label="City / Location"
                  value={livingIn}
                  onChangeText={setLivingIn}
                  placeholder="City, Country"
                  icon="map-pin"
                  accent="#EF4444"
                  editable={!autoUpdateLocation}
                />
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.background,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  marginTop: 10,
                  gap: 12,
                }}>
                  <View style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: '#EF444418',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Feather name="navigation" size={16} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
                      Auto-update as I travel
                    </ThemedText>
                    <ThemedText style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {autoUpdateLocation
                        ? 'Your city updates automatically (e.g., Lagos → Cape Town)'
                        : 'Keep this off to set your city yourself'}
                    </ThemedText>
                  </View>
                  <Switch
                    value={autoUpdateLocation}
                    disabled={autoUpdateSaving}
                    onValueChange={(v) => {
                      if (v) {
                        showAlert(
                          'Auto-update Location',
                          'Your profile city will follow your travels using your phone\u2019s location. You can turn it off anytime to control it yourself.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Turn On', onPress: () => handleAutoUpdateLocationToggle(true) },
                          ],
                          'map-pin'
                        );
                      } else {
                        handleAutoUpdateLocationToggle(false);
                      }
                    }}
                    trackColor={{ false: theme.border, true: '#EF4444' }}
                  />
                </View>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.cardHeader, { borderBottomColor: theme.border + '60' }]}>
                <LinearGradient colors={['#1DB95428', '#1DB95410']} style={styles.cardIconWrap}>
                  <Feather name="music" size={16} color="#1DB954" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.cardTitle, { color: theme.text }]}>Soundtrack</ThemedText>
                  <ThemedText style={[styles.cardSub, { color: theme.textSecondary }]}>Your current anthem</ThemedText>
                </View>
                {spotifyConnected && (
                  <View style={[styles.spotifyBadge, { backgroundColor: '#1DB95420' }]}>
                    <ThemedText style={{ color: '#1DB954', fontSize: 11, fontWeight: '600' }}>● Spotify</ThemedText>
                  </View>
                )}
              </View>
              <View style={styles.cardBody}>
                {!spotifyConnected ? (
                  <Pressable
                    style={[styles.spotifyConnectBtn, { backgroundColor: '#1DB954', opacity: connectingSpotify ? 0.7 : 1 }]}
                    onPress={handleConnectSpotify}
                    disabled={connectingSpotify}
                  >
                    {connectingSpotify ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <Feather name="music" size={18} color="#FFF" />
                        <ThemedText style={styles.spotifyConnectText}>Connect with Spotify</ThemedText>
                      </>
                    )}
                  </Pressable>
                ) : (
                  <View style={styles.spotifyConnectedRow}>
                    <View style={[styles.spotifyAvatarWrap, { backgroundColor: '#1DB95420' }]}>
                      <Feather name="music" size={18} color="#1DB954" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={[styles.spotifyConnectedName, { color: theme.text }]}>{spotifyDisplayName || "Spotify"}</ThemedText>
                      <ThemedText style={[styles.spotifyConnectedSub, { color: '#1DB954' }]}>Connected</ThemedText>
                    </View>
                    <Pressable onPress={handleDisconnectSpotify} style={[styles.spotifyDisconnectBtn, { borderColor: theme.border }]}>
                      <ThemedText style={{ color: theme.textSecondary, fontSize: 12 }}>Disconnect</ThemedText>
                    </Pressable>
                  </View>
                )}

                <View style={[styles.songCard, { backgroundColor: isDark ? 'rgba(29,185,84,0.06)' : '#1DB9540A', borderColor: '#1DB95425', marginTop: 12 }]}>
                  {songAlbumArt ? (
                    <Image source={{ uri: songAlbumArt }} style={styles.songAlbumArt} />
                  ) : (
                    <LinearGradient colors={['#1DB954', '#158f3f']} style={styles.songIconBox}>
                      <Feather name="music" size={20} color="#FFF" />
                    </LinearGradient>
                  )}
                  <View style={{ flex: 1 }}>
                    {spotifyConnected ? (
                      <Pressable onPress={() => setSpotifySearchVisible(true)} style={styles.spotifyPickSong}>
                        <ThemedText style={[styles.songTitleInput, { color: songTitle ? theme.text : theme.textSecondary, paddingVertical: 6 }]} numberOfLines={1}>
                          {songTitle || "Tap to search songs on Spotify"}
                        </ThemedText>
                        {songArtist ? (
                          <ThemedText style={[styles.songArtistInput, { color: theme.textSecondary }]} numberOfLines={1}>{songArtist}</ThemedText>
                        ) : null}
                      </Pressable>
                    ) : (
                      <>
                        <TextInput
                          style={[styles.songTitleInput, { color: theme.text, borderBottomColor: theme.border }]}
                          value={songTitle}
                          onChangeText={setSongTitle}
                          placeholder="Song title"
                          placeholderTextColor={theme.textSecondary}
                        />
                        <TextInput
                          style={[styles.songArtistInput, { color: theme.textSecondary }]}
                          value={songArtist}
                          onChangeText={setSongArtist}
                          placeholder="Artist name"
                          placeholderTextColor={theme.textSecondary + '90'}
                        />
                      </>
                    )}
                  </View>
                </View>
              </View>
            </View>

            <Modal
              visible={spotifySearchVisible}
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={() => setSpotifySearchVisible(false)}
            >
              <View style={[styles.spotifyModal, { backgroundColor: theme.background }]}>
                <View style={[styles.spotifyModalHeader, { borderBottomColor: theme.border }]}>
                  <Pressable onPress={() => setSpotifySearchVisible(false)} style={{ padding: 8 }}>
                    <Ionicons name="close" size={24} color={theme.text} />
                  </Pressable>
                  <ThemedText style={[styles.spotifyModalTitle, { color: theme.text }]}>Search Songs</ThemedText>
                  <View style={{ width: 40 }} />
                </View>
                <View style={[styles.spotifySearchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Feather name="search" size={18} color={theme.textSecondary} />
                  <TextInput
                    style={[styles.spotifySearchInput, { color: theme.text }]}
                    value={spotifySearchQuery}
                    onChangeText={setSpotifySearchQuery}
                    placeholder="Search songs, artists..."
                    placeholderTextColor={theme.textSecondary}
                    returnKeyType="search"
                    onSubmitEditing={handleSpotifySearch}
                    autoFocus
                  />
                  {searchingSpotify ? (
                    <ActivityIndicator size="small" color="#1DB954" />
                  ) : (
                    <Pressable onPress={handleSpotifySearch} style={[styles.spotifySearchGo, { backgroundColor: '#1DB954' }]}>
                      <ThemedText style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>Go</ThemedText>
                    </Pressable>
                  )}
                </View>
                <FlatList
                  data={spotifySearchResults}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
                  ListEmptyComponent={
                    <View style={{ alignItems: 'center', paddingTop: 60 }}>
                      <Feather name="music" size={40} color={theme.textSecondary} style={{ opacity: 0.4 }} />
                      <ThemedText style={{ color: theme.textSecondary, marginTop: 12 }}>Search for a song above</ThemedText>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <Pressable
                      style={[styles.spotifyTrackRow, { borderBottomColor: theme.border }]}
                      onPress={() => handleSelectSpotifySong(item)}
                    >
                      {item.albumArt ? (
                        <Image source={{ uri: item.albumArt }} style={styles.spotifyTrackArt} />
                      ) : (
                        <View style={[styles.spotifyTrackArt, { backgroundColor: '#1DB95420', alignItems: 'center', justifyContent: 'center' }]}>
                          <Feather name="music" size={16} color="#1DB954" />
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <ThemedText style={[styles.spotifyTrackTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</ThemedText>
                        <ThemedText style={[styles.spotifyTrackArtist, { color: theme.textSecondary }]} numberOfLines={1}>{item.artist}</ThemedText>
                      </View>
                      {songTitle === item.title && songArtist === item.artist && (
                        <Ionicons name="checkmark-circle" size={20} color="#1DB954" />
                      )}
                    </Pressable>
                  )}
                />
              </View>
            </Modal>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.cardHeader, { borderBottomColor: theme.border + '60' }]}>
                <LinearGradient colors={['#EC489928', '#EC489910']} style={styles.cardIconWrap}>
                  <Feather name="mic" size={16} color="#EC4899" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.cardTitle, { color: theme.text }]}>Voice Bio</ThemedText>
                  <ThemedText style={[styles.cardSub, { color: theme.textSecondary }]}>Record a 30-second intro</ThemedText>
                </View>
                {voiceBioUrl ? (
                  <Pressable onPress={handleVoiceBioDelete} hitSlop={8} style={{ padding: 4 }}>
                    <Feather name="trash-2" size={16} color={theme.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.cardBody}>
                <VoiceBio voiceBioUrl={voiceBioUrl} duration={voiceBioDuration} isOwn={true} hideHeader={true} onRecord={handleVoiceBioRecord} onDelete={handleVoiceBioDelete} />
              </View>
            </View>

            <Pressable
              style={[styles.bottomSave, { backgroundColor: theme.primary, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Feather name="check-circle" size={20} color="#FFF" />
                  <ThemedText style={styles.bottomSaveText}>Save Profile</ThemedText>
                </>
              )}
            </Pressable>
          </>
        )}
      </ScreenKeyboardAwareScrollView>

      {/* MODALS */}
      <OptionModal visible={activeModal === 'gender'} onClose={() => setActiveModal(null)} title="Gender" options={GENDER_OPTIONS} selectedValue={gender} onSelect={setGender} />
      <OptionModal visible={activeModal === 'height'} onClose={() => setActiveModal(null)} title="Height" options={HEIGHT_OPTIONS} selectedValue={height} onSelect={setHeight} />
      <OptionModal visible={activeModal === 'lookingFor'} onClose={() => setActiveModal(null)} title="Looking For" subtitle="What are you here for?" options={LOOKING_FOR_OPTIONS} selectedValue={lookingFor} onSelect={setLookingFor} />
      <OptionModal visible={activeModal === 'relationshipGoal'} onClose={() => setActiveModal(null)} title="Relationship Goal" subtitle="Your vision for the future" options={RELATIONSHIP_GOAL_OPTIONS} selectedValue={relationshipGoal} onSelect={setRelationshipGoal} />
      <OptionModal visible={activeModal === 'relationshipStatus'} onClose={() => setActiveModal(null)} title="Relationship Status" options={RELATIONSHIP_STATUS_OPTIONS} selectedValue={relationshipStatus} onSelect={setRelationshipStatus} />
      <OptionModal visible={activeModal === 'smoking'} onClose={() => setActiveModal(null)} title="Smoking" options={SMOKING_OPTIONS} selectedValue={smoking} onSelect={setSmoking} />
      <OptionModal visible={activeModal === 'drinking'} onClose={() => setActiveModal(null)} title="Drinking" options={DRINKING_OPTIONS} selectedValue={drinking} onSelect={setDrinking} />
      <OptionModal visible={activeModal === 'workout'} onClose={() => setActiveModal(null)} title="Workout" options={WORKOUT_OPTIONS} selectedValue={workout} onSelect={setWorkout} />
      <OptionModal visible={activeModal === 'religion'} onClose={() => setActiveModal(null)} title="Religion" options={RELIGION_OPTIONS} selectedValue={religion} onSelect={setReligion} />
      <OptionModal visible={activeModal === 'zodiac'} onClose={() => setActiveModal(null)} title="Zodiac Sign" options={ZODIAC_OPTIONS} selectedValue={zodiacSign} onSelect={setZodiacSign} />
      <OptionModal visible={activeModal === 'education'} onClose={() => setActiveModal(null)} title="Education" options={EDUCATION_OPTIONS} selectedValue={education} onSelect={setEducation} />
      <OptionModal visible={activeModal === 'ethnicity'} onClose={() => setActiveModal(null)} title="Ethnicity" options={ETHNICITY_OPTIONS} selectedValue={ethnicity} onSelect={setEthnicity} />
      <MultiSelectModal visible={activeModal === 'pets'} onClose={() => setActiveModal(null)} title="Pets" options={PETS_OPTIONS} selectedValues={pets} onSelect={setPets} />
      <OptionModal visible={activeModal === 'communicationStyle'} onClose={() => setActiveModal(null)} title="Communication Style" options={COMMUNICATION_STYLE_OPTIONS} selectedValue={communicationStyle} onSelect={setCommunicationStyle} />
      <OptionModal visible={activeModal === 'loveStyle'} onClose={() => setActiveModal(null)} title="Love Language" subtitle="How do you give and receive love?" options={LOVE_STYLE_OPTIONS} selectedValue={loveStyle} onSelect={setLoveStyle} />
      <OptionModal visible={activeModal === 'diasporaGeneration'} onClose={() => setActiveModal(null)} title="Diaspora Generation" subtitle="Which generation of the African diaspora are you?" options={DIASPORA_GENERATION_OPTIONS} selectedValue={diasporaGeneration} onSelect={handleDiasporaSelect} />
      <InterestModal visible={interestsModalVisible} onClose={() => setInterestsModalVisible(false)} interests={interests} toggleInterest={toggleInterest} insetsBottom={insets.bottom} />
      <AlertComponent />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  headerBack: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', letterSpacing: 0.1 },
  headerSaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, minWidth: 70, justifyContent: 'center' },
  headerSaveBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },

  hero: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 14 },
  heroLeft: {},
  heroRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 2.5, overflow: 'visible' as const, position: 'relative' },
  heroPhoto: { width: 72, height: 72, borderRadius: 36 },
  heroPhotoEmpty: { width: 72, height: 72, borderRadius: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
  heroRingBadge: { position: 'absolute' as const, bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2 },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  heroSub: { fontSize: 12, marginBottom: 8 },
  heroBarRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  heroBarTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' as const },
  heroBarFill: { height: '100%' as any, borderRadius: 3 },
  heroBarLabel: { fontSize: 12, fontWeight: '700', minWidth: 32 },

  tabBar: { flexDirection: 'row' as const, borderBottomWidth: 1, paddingHorizontal: 4 },
  tabItem: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 5, paddingVertical: 11, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabLabel: { fontSize: 12, letterSpacing: 0.1 },

  scrollContent: { paddingHorizontal: 14, paddingTop: 16, gap: 14 },

  card: { borderRadius: 18, overflow: 'hidden' as const, borderWidth: 1 },
  cardHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, gap: 12 },
  cardIconWrap: { width: 36, height: 36, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 1 },
  cardBody: { padding: 14, gap: 12 },

  fieldWrap: { gap: 6 },
  miniLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  row2: { flexDirection: 'row' as const, gap: 10 },
  half: { flex: 1, gap: 6 },

  fieldContainer: {},
  fieldLabelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 7, gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  fieldFilledDot: { width: 5, height: 5, borderRadius: 3 },
  inputRow: { flexDirection: 'row' as const, alignItems: 'center' as const, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, minHeight: 50, gap: 10 },
  textInput: { flex: 1, fontSize: 15, paddingVertical: 12 },
  multilineInput: { minHeight: 90, textAlignVertical: 'top' as const },

  selectButton: { height: 50, borderRadius: 12, borderWidth: 1, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 12, gap: 10 },
  selectIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },

  sectionHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  sectionIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700' as const },
  sectionDescription: { fontSize: 12, marginTop: 2 },
  selectButtonText: { fontSize: 14, flex: 1 },

  triggerRow: { height: 50, borderRadius: 12, borderWidth: 1, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 12, gap: 10 },
  triggerIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },
  triggerText: { flex: 1, fontSize: 14 },
  chipsWrap: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 7 },
  chip: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, gap: 5 },
  chipText: { fontSize: 12, fontWeight: '500' },

  toggleCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' as const },
  toggleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: 'transparent' },
  toggleLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, flex: 1, gap: 12 },
  toggleIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  toggleTextGroup: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  toggleDescription: { fontSize: 12, marginTop: 1 },
  toggleDivider: { height: 1, marginHorizontal: 14 },

  songCard: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  songIconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const },
  songAlbumArt: { width: 48, height: 48, borderRadius: 14 },
  songTitleInput: { fontSize: 15, fontWeight: '600', paddingVertical: 6, borderBottomWidth: 1, marginBottom: 4 },
  songArtistInput: { fontSize: 13, paddingVertical: 4 },

  spotifyConnectBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, paddingVertical: 13, borderRadius: 12 },
  spotifyConnectText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  spotifyConnectedRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  spotifyAvatarWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const },
  spotifyConnectedName: { fontSize: 14, fontWeight: '600' },
  spotifyConnectedSub: { fontSize: 12 },
  spotifyDisconnectBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  spotifyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  spotifyPickSong: { flex: 1 },
  spotifyModal: { flex: 1 },
  spotifyModalHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  spotifyModalTitle: { fontSize: 17, fontWeight: '700' },
  spotifySearchBar: { flexDirection: 'row' as const, alignItems: 'center' as const, margin: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, gap: 10 },
  spotifySearchInput: { flex: 1, fontSize: 15, paddingVertical: 2 },
  spotifySearchGo: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  spotifyTrackRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 12, borderBottomWidth: 0.5 },
  spotifyTrackArt: { width: 50, height: 50, borderRadius: 8 },
  spotifyTrackTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  spotifyTrackArtist: { fontSize: 12 },

  quizCta: { borderRadius: 14, overflow: 'hidden' as const, marginTop: 4 },
  quizCtaGradient: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  quizCtaTitle: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  quizCtaSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },

  bottomSave: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, height: 54, borderRadius: 27, marginTop: 4 },
  bottomSaveText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' as const },
  modalSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '82%' as any },
  modalDragHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' as const, marginTop: 10, marginBottom: 2 },
  modalHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalSubtitle: { fontSize: 12, marginTop: 2 },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center' as const, justifyContent: 'center' as const },
  modalFooter: { padding: 16, borderTopWidth: 1 },
  doneButton: { height: 50, borderRadius: 25, alignItems: 'center' as const, justifyContent: 'center' as const },
  doneButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  interestOptionItem: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, margin: 5, padding: 12, borderRadius: 12, borderWidth: 1.5, gap: 8, position: 'relative' as const },
  interestIconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },
  interestOptionLabel: { flex: 1, fontSize: 13 },
  interestCheckBadge: { position: 'absolute' as const, top: 6, right: 6, width: 16, height: 16, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },

  optionItem: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1 },
  optionLabel: { fontSize: 16 },
  optionCheckCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const },
});
