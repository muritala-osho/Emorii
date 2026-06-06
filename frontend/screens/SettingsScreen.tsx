import logger from '@/utils/logger';
import React, { useState, useCallback, useEffect, useRef } from "react";
import { 
  View, 
  StyleSheet, 
  Switch, 
  Modal, 
  ScrollView,
  Dimensions,
  Linking,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  Keyboard
} from "react-native";
import { useThemedAlert } from "@/components/ThemedAlert";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { useTheme, ThemeMode } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApiBaseUrl } from "@/constants/config";

type SettingsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "Settings">;

interface SettingsScreenProps {
  navigation: SettingsScreenNavigationProp;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { theme, themeMode, setThemeMode } = useTheme();
  const { currentLanguage, setLanguage } = useLanguage();
  const { user, token, logout, fetchUser } = useAuth();
  const { put, del, get } = useApi();
  const insets = useSafeAreaInsets();
  const { showAlert, AlertComponent } = useThemedAlert();

  const [notificationsEnabled, setNotificationsEnabled] = useState((user as any)?.settings?.pushNotifications ?? true);
  const [incognitoMode, setIncognitoMode] = useState((user as any)?.privacySettings?.incognitoMode ?? false);
  const [hideAge, setHideAge] = useState((user as any)?.privacySettings?.hideAge ?? false);
  const [hideOnlineStatus, setHideOnlineStatus] = useState(((user as any)?.privacySettings?.showOnlineStatus ?? true) === false);
  const [autoUpdateLocation, setAutoUpdateLocation] = useState((user as any)?.autoUpdateProfileLocation ?? false);
  const [autoTranslate, setAutoTranslate] = useState((user as any)?.preferences?.autoTranslate ?? false);
  const autoTranslateUserActed = useRef(false);
  
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  const themeOptions: { value: ThemeMode; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'System', icon: 'monitor' },
  ];

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [contactMessage, setContactMessage] = useState("");
  const [challengeQuestion, setChallengeQuestion] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeAnswer, setChallengeAnswer] = useState("");
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);

  const fetchSupportChallenge = useCallback(async () => {
    if (token) return;
    setChallengeLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/support/challenge`);
      const data = await response.json();
      if (data.success) {
        setChallengeQuestion(data.question);
        setChallengeToken(data.challengeToken);
        setChallengeAnswer("");
      }
    } catch {
      setChallengeQuestion("");
      setChallengeToken("");
    } finally {
      setChallengeLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    get<{ success: boolean; autoTranslate: boolean; preferredLanguage: string }>(
      '/users/me/translation-settings', token
    ).then(res => {
      // Only apply the server value if the user hasn't already tapped the
      // toggle. Without this guard, a slow network response races the user's
      // tap and overwrites their choice back to the old server value.
      if (res.success && res.data && !autoTranslateUserActed.current) {
        setAutoTranslate(res.data.autoTranslate);
      }
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (contactModalVisible && !token) {
      fetchSupportChallenge();
    }
  }, [contactModalVisible, token, fetchSupportChallenge]);

  const handleToggle = async (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    if (!token) return;
    try {
      if (key === 'autoTranslate') {
        autoTranslateUserActed.current = true;
        const response = await put('/users/me', { preferences: { autoTranslate: value } }, token);
        if (response.success) {
          if (fetchUser) await fetchUser();
        } else {
          setter(!value);
        }
        return;
      }

      if (key === 'notificationsEnabled') {
        const response = await put('/account/settings', { pushNotifications: value }, token);
        if (response.success) {
          if (fetchUser) await fetchUser();
        } else {
          setter(!value);
        }
        return;
      }

      if (key === 'autoUpdateProfileLocation') {
        const response = await put('/users/me', { autoUpdateProfileLocation: value }, token);
        if (response.success) {
          if (fetchUser) await fetchUser();
          if (value) {
            try {
              const { pushLiveLocation } = await import('@/utils/liveLocation');
              pushLiveLocation(token, { force: true }).catch(() => {});
            } catch {}
          }
        } else {
          setter(!value);
        }
        return;
      }

      const response = await put('/users/me', { 
        privacySettings: {
          ...user?.privacySettings,
          [key]: value 
        }
      }, token);
      
      if (response.success) {
        if (fetchUser) await fetchUser();
      } else {
        setter(!value);
      }
    } catch (error) {
      logger.error(`Failed to update ${key}:`, error);
      setter(!value);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Error", "Please fill in all password fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }

    try {
      const res = await put('/account/change-password', { 
        currentPassword, 
        newPassword 
      }, token || "");
      
      if (res.success) {
        Alert.alert("Success", "Password changed successfully");
        setPasswordModalVisible(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        Alert.alert('Error', res.message || 'Failed to change password');
      }
    } catch (e) {
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      Alert.alert("Error", "Please enter your password to confirm");
      return;
    }

    try {
      const res = await del('/account/delete', token || "", { password: deletePassword });
      if (res.success) {
        setDeleteModalVisible(false);
        logout();
      } else {
        Alert.alert('Error', res.message || 'Failed to delete account');
      }
    } catch (e) {
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const handleLogout = () => {
    showAlert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout }
    ], 'log-out');
  };

  const SettingItem = ({ 
    icon, 
    label, 
    value, 
    onPress, 
    rightElement,
    showChevron = true,
    destructive = false
  }: { 
    icon: string; 
    label: string; 
    value?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    showChevron?: boolean;
    destructive?: boolean;
  }) => (
    <Pressable 
      style={[styles.settingItem, { borderBottomColor: theme.border }]}
      onPress={onPress}
      disabled={!onPress || !!rightElement}
    >
      <View style={[styles.iconContainer, { backgroundColor: destructive ? 'rgba(255, 59, 48, 0.1)' : theme.primary + '15' }]}>
        <Feather name={icon as any} size={20} color={destructive ? '#FF3B30' : theme.primary} />
      </View>
      <View style={styles.settingTextBlock}>
        <ThemedText
          style={[styles.settingLabel, { color: destructive ? '#FF3B30' : theme.text }]}
          numberOfLines={2}
        >
          {label}
        </ThemedText>
        {value && (
          <ThemedText
            style={[styles.settingValue, { color: theme.textSecondary }]}
            numberOfLines={2}
          >
            {value}
          </ThemedText>
        )}
      </View>
      {rightElement}
      {showChevron && onPress && !rightElement && (
        <Feather name="chevron-right" size={20} color={theme.textSecondary} />
      )}
    </Pressable>
  );

  const SectionHeader = ({ title }: { title: string }) => (
    <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
      {title.toUpperCase()}
    </ThemedText>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16), borderBottomColor: theme.border }]}>
        <Pressable 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="chevron-left" size={28} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Settings</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
      >
        <SectionHeader title="Discovery" />
        <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
          <SettingItem 
            icon="map-pin" 
            label="Location" 
            value={user?.livingIn || 'Set Location'} 
            onPress={() => navigation.navigate('ManageLocations' as any)} 
          />
          <SettingItem 
            icon="sliders" 
            label="Discovery Filters" 
            onPress={() => navigation.navigate('Filters')} 
          />
          <SettingItem 
            icon="zap" 
            label="Boost Profile" 
            onPress={() => navigation.navigate('BoostCenter' as any)} 
          />
        </View>

        <SectionHeader title="Account & Subscription" />
        <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
          <SettingItem 
            icon="star" 
            label="Premium Subscription" 
            value={user?.premium?.isActive ? 'Active' : ''} 
            onPress={() => navigation.navigate('Premium' as any)} 
          />
          <SettingItem 
            icon="check-circle" 
            label="Video Verification" 
            value={
              (user as any)?.verified ? 'Verified'
              : (user as any)?.verificationStatus === 'pending' ? 'Under Review'
              : (user as any)?.verificationStatus === 'rejected' ? 'Try Again'
              : ''
            }
            onPress={() => navigation.navigate('Verification' as any)} 
          />
          <SettingItem 
            icon="camera" 
            label="Change Profile Photo" 
            onPress={() => navigation.navigate('ChangeProfilePicture' as any)} 
          />
          <SettingItem 
            icon="key" 
            label="Change Password" 
            onPress={() => setPasswordModalVisible(true)} 
          />
        </View>

        <SectionHeader title="Privacy & Security" />
        <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
          <SettingItem 
            icon="bell" 
            label="Notification Settings" 
            onPress={() => navigation.navigate('NotificationSettings' as any)} 
          />
          <SettingItem 
            icon="shield" 
            label="Safety Center" 
            onPress={() => navigation.navigate('SafetyCenter')} 
          />
          <SettingItem 
            icon="eye-off" 
            label="Incognito Mode" 
            showChevron={false}
            rightElement={
              <Switch 
                value={incognitoMode} 
                onValueChange={(v) => {
                  if (v && !user?.premium?.isActive) {
                    showAlert(
                      'Premium Feature',
                      'Incognito mode is available for Premium members. Upgrade to browse privately.',
                      [
                        { text: 'Upgrade Now', onPress: () => navigation.navigate('Premium' as any) },
                        { text: 'Maybe Later', style: 'cancel' }
                      ],
                      'star'
                    );
                    return;
                  }
                  handleToggle('incognitoMode', v, setIncognitoMode);
                }}
                trackColor={{ false: theme.border, true: theme.primary }}
              />
            }
          />
          <SettingItem 
            icon="calendar" 
            label="Hide Age" 
            showChevron={false}
            rightElement={
              <Switch 
                value={hideAge} 
                onValueChange={(v) => handleToggle('hideAge', v, setHideAge)}
                trackColor={{ false: theme.border, true: theme.primary }}
              />
            }
          />
          <SettingItem 
            icon="wifi-off" 
            label="Hide Online Status" 
            value={hideOnlineStatus ? "Others won't see when you're online" : 'Others can see your online status'}
            showChevron={false}
            rightElement={
              <Switch 
                value={hideOnlineStatus} 
                onValueChange={(v) => handleToggle('showOnlineStatus', !v, (next) => setHideOnlineStatus(!next))}
                trackColor={{ false: theme.border, true: theme.primary }}
              />
            }
          />
          <SettingItem 
            icon="map-pin" 
            label="Auto-update Profile Location" 
            value={autoUpdateLocation ? 'On — follows your travels' : 'Off — you set it manually'}
            showChevron={false}
            rightElement={
              <Switch 
                value={autoUpdateLocation} 
                onValueChange={(v) => {
                  if (v) {
                    showAlert(
                      'Auto-update Location',
                      'Your profile location (e.g. "Lagos, Nigeria") will automatically follow your travels. Turn this off anytime to set it yourself.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Turn On', onPress: () => handleToggle('autoUpdateProfileLocation', true, setAutoUpdateLocation) }
                      ],
                      'map-pin'
                    );
                  } else {
                    handleToggle('autoUpdateProfileLocation', false, setAutoUpdateLocation);
                  }
                }}
                trackColor={{ false: theme.border, true: theme.primary }}
              />
            }
          />
          <SettingItem 
            icon="monitor" 
            label="Active Sessions" 
            onPress={() => navigation.navigate('DeviceManagement' as any)} 
          />
          <SettingItem 
            icon="slash" 
            label="Blocked Users" 
            onPress={() => navigation.navigate('BlockedUsers')} 
          />
        </View>

        <SectionHeader title="App Settings" />
        <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
          <SettingItem 
            icon="moon" 
            label="Theme" 
            value={themeOptions.find(t => t.value === themeMode)?.label} 
            onPress={() => setThemeModalVisible(true)} 
          />
          <SettingItem 
            icon="sliders" 
            label="Customize Interface" 
            onPress={() => navigation.navigate('CustomizeInterface')} 
          />
          <SettingItem 
            icon="globe" 
            label="Language" 
            value={currentLanguage?.nativeName} 
            onPress={() => setLanguageModalVisible(true)} 
          />
          <SettingItem
            icon="message-circle"
            label="Auto-translate messages"
            showChevron={false}
            rightElement={
              <Switch
                value={autoTranslate}
                onValueChange={(v) => handleToggle('autoTranslate', v, setAutoTranslate)}
                trackColor={{ false: theme.border, true: theme.primary }}
              />
            }
          />
          <SettingItem 
            icon="bell" 
            label="Notifications" 
            showChevron={false}
            rightElement={
              <Switch 
                value={notificationsEnabled} 
                onValueChange={(v) => handleToggle('notificationsEnabled', v, setNotificationsEnabled)}
                trackColor={{ false: theme.border, true: theme.primary }}
              />
            }
          />
        </View>

        <SectionHeader title="Support & Legal" />
        <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
          <SettingItem 
            icon="mail" 
            label="Support Center" 
            onPress={() => navigation.navigate('SupportMessages' as any)} 
          />
          <SettingItem 
            icon="message-square" 
            label="Contact Us" 
            onPress={() => setContactModalVisible(true)} 
          />
          <SettingItem 
            icon="phone" 
            label="Help & Support" 
            onPress={() => Linking.openURL('mailto:support@emorii.app')} 
          />
          <SettingItem 
            icon="share-2" 
            label="Follow Us" 
            onPress={() => navigation.navigate('SocialMedia' as any)} 
          />
          <SettingItem 
            icon="file-text" 
            label="Privacy Policy" 
            onPress={() => Linking.openURL('https://emorii.com/privacy')} 
          />
          <SettingItem 
            icon="info" 
            label="Terms of Service" 
            onPress={() => Linking.openURL('https://emorii.com/terms')} 
          />
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.surface, marginTop: 20 }]}>
          <SettingItem 
            icon="log-out" 
            label="Logout" 
            onPress={handleLogout} 
            showChevron={false}
            destructive
          />
          <SettingItem 
            icon="trash-2" 
            label="Delete Account" 
            onPress={() => setDeleteModalVisible(true)} 
            showChevron={false}
            destructive
          />
        </View>
        
        <View style={styles.footer}>
          <ThemedText style={styles.version}>Emorii v1.0.0</ThemedText>
        </View>
      </ScrollView>

      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setDeleteModalVisible(false)}>
          <View style={[styles.modalBody, { backgroundColor: theme.surface }]}>
            <ThemedText style={styles.modalTitle}>Confirm Deletion</ThemedText>
            <ThemedText style={{ color: theme.textSecondary, marginBottom: 15, textAlign: 'center' }}>
              Please enter your password to permanently delete your account.
            </ThemedText>
            <TextInput
              style={{ 
                height: 50, 
                backgroundColor: theme.background, 
                color: theme.text, 
                borderRadius: 12, 
                paddingHorizontal: 15,
                borderWidth: 1,
                borderColor: theme.border,
                marginBottom: 20
              }}
              placeholder="Your Password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              value={deletePassword}
              onChangeText={setDeletePassword}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable 
                style={{ flex: 1, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.border }}
                onPress={() => setDeleteModalVisible(false)}
              >
                <ThemedText style={{ fontWeight: '600' }}>Cancel</ThemedText>
              </Pressable>
              <Pressable 
                style={{ flex: 1, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF3B30' }}
                onPress={handleDeleteAccount}
              >
                <ThemedText style={{ color: '#FFF', fontWeight: '600' }}>Delete</ThemedText>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={passwordModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setPasswordModalVisible(false)}>
          <View style={[styles.modalBody, { backgroundColor: theme.surface }]}>
            <ThemedText style={styles.modalTitle}>Change Password</ThemedText>
            
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, borderWidth: 1 }]}
              placeholder="Current Password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, borderWidth: 1 }]}
              placeholder="New Password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, borderWidth: 1 }]}
              placeholder="Confirm New Password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <Pressable 
                style={{ flex: 1, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.border }}
                onPress={() => setPasswordModalVisible(false)}
              >
                <ThemedText style={{ fontWeight: '600' }}>Cancel</ThemedText>
              </Pressable>
              <Pressable 
                style={{ flex: 1, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary }}
                onPress={handleChangePassword}
              >
                <ThemedText style={{ color: '#FFF', fontWeight: '600' }}>Update</ThemedText>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={themeModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setThemeModalVisible(false)}>
          <View style={[styles.modalBody, { backgroundColor: theme.surface }]}>
            <ThemedText style={styles.modalTitle}>Choose Theme</ThemedText>
            {themeOptions.map(opt => (
              <Pressable 
                key={opt.value} 
                onPress={() => { setThemeMode(opt.value); setThemeModalVisible(false); }} 
                style={styles.optionItem}
              >
                <Feather name={opt.icon as any} size={20} color={theme.text} style={{ marginRight: 15 }} />
                <ThemedText style={styles.optionLabel}>{opt.label}</ThemedText>
                {themeMode === opt.value && <Feather name="check" size={20} color={theme.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={languageModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setLanguageModalVisible(false)}>
          <View style={[styles.modalBody, { backgroundColor: theme.surface, maxHeight: '80%' }]}>
            <ThemedText style={styles.modalTitle}>Choose Language</ThemedText>
            <ScrollView showsVerticalScrollIndicator={false}>
              {(useLanguage() as any).languages.map((lang: any) => (
                <Pressable 
                  key={lang.code} 
                  onPress={async () => {
                    setLanguage(lang.code);
                    setLanguageModalVisible(false);
                    if (token) {
                      await put('/users/me', { preferences: { language: lang.code } }, token);
                      if (fetchUser) await fetchUser();
                    }
                  }} 
                  style={styles.optionItem}
                >
                  <ThemedText style={{ fontSize: 20, marginRight: 15 }}>{lang.flag}</ThemedText>
                  <ThemedText style={styles.optionLabel}>{lang.nativeName}</ThemedText>
                  {currentLanguage?.code === lang.code && <Feather name="check" size={20} color={theme.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={contactModalVisible} transparent animationType="slide" onRequestClose={() => setContactModalVisible(false)}>
        <KeyboardAvoidingView
          behavior="padding"
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setContactModalVisible(false)} />
          <View style={[styles.contactSheet, { backgroundColor: theme.surface }]}>
            <View style={styles.contactSheetHandle} />
            <View style={styles.contactSheetHeader}>
              <Feather name="message-circle" size={22} color={theme.primary} />
              <ThemedText style={[styles.modalTitle, { marginBottom: 0 }]}>Contact Support</ThemedText>
              <Pressable onPress={() => setContactModalVisible(false)} hitSlop={8}>
                <Feather name="x" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ThemedText style={{ color: theme.textSecondary, marginBottom: 14, fontSize: 14 }}>
              How can we help you today? We'll get back to you soon.
            </ThemedText>
            <TextInput
              style={{
                minHeight: 110,
                maxHeight: 180,
                backgroundColor: theme.background,
                color: theme.text,
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingTop: 14,
                paddingBottom: 14,
                borderWidth: 1.5,
                borderColor: contactMessage.length > 0 ? theme.primary : theme.border,
                marginBottom: 16,
                textAlignVertical: 'top',
                fontSize: 15,
                lineHeight: 22,
              }}
              placeholder="Describe your issue or question..."
              placeholderTextColor={theme.textSecondary}
              multiline
              value={contactMessage}
              onChangeText={setContactMessage}
            />
            {!token && (
              <View style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <ThemedText style={{ color: theme.text, fontWeight: '700', marginBottom: 10 }}>
                  {challengeLoading ? 'Loading security challenge...' : challengeQuestion || 'Security challenge unavailable'}
                </ThemedText>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput
                    style={{
                      flex: 1,
                      height: 46,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: theme.border,
                      paddingHorizontal: 14,
                      color: theme.text,
                      backgroundColor: theme.surface,
                    }}
                    placeholder="Answer"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="number-pad"
                    value={challengeAnswer}
                    onChangeText={setChallengeAnswer}
                  />
                  <Pressable
                    onPress={fetchSupportChallenge}
                    style={{ width: 46, height: 46, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Feather name="refresh-cw" size={16} color={theme.primary} />
                  </Pressable>
                </View>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                style={{ flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}
                onPress={() => setContactModalVisible(false)}
              >
                <ThemedText style={{ fontWeight: '600', color: theme.text }}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={{ flex: 2, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: (contactMessage.trim() && !contactSubmitting) ? theme.primary : theme.border, flexDirection: 'row', gap: 8 }}
                disabled={contactSubmitting || !contactMessage.trim()}
                onPress={async () => {
                  if (!contactMessage.trim()) return;
                  if (!token && (!challengeToken || !challengeAnswer.trim())) {
                    Alert.alert("Security Check", "Please answer the security challenge before sending your message.");
                    return;
                  }
                  Keyboard.dismiss();
                  setContactSubmitting(true);
                  try {
                    const response = await fetch(`${getApiBaseUrl()}/api/support/contact`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                      },
                      body: JSON.stringify({
                        name: user?.name || 'User',
                        email: user?.email || '',
                        message: contactMessage.trim(),
                        userId: user?.id,
                        ...(!token ? {
                          challengeToken,
                          challengeAnswer: challengeAnswer.trim()
                        } : {})
                      })
                    });
                    const data = await response.json();
                    if (data.success) {
                      Alert.alert("Message Sent", "We'll get back to you as soon as possible!");
                      setContactMessage("");
                      setChallengeAnswer("");
                      setContactModalVisible(false);
                    } else {
                      Alert.alert("Error", data.message || "Failed to send message");
                      if (data.requiresChallenge) fetchSupportChallenge();
                    }
                  } catch (e) {
                    Alert.alert("Error", "Network error. Please try again.");
                  } finally {
                    setContactSubmitting(false);
                  }
                }}
              >
                {contactSubmitting
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <>
                      <Feather name="send" size={16} color="#FFF" />
                      <ThemedText style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>Send Message</ThemedText>
                    </>
                }
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <AlertComponent />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 16, paddingLeft: 8 },
  sectionCard: { borderRadius: 16, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  settingItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  iconContainer: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  settingTextBlock: { flex: 1, marginRight: 8, minWidth: 0 },
  settingLabel: { fontSize: 16, fontWeight: '500' },
  settingValue: { fontSize: 13, marginTop: 2 },
  footer: { marginTop: 32, alignItems: 'center' },
  version: { fontSize: 12, opacity: 0.5 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalBody: { width: '80%', padding: 20, borderRadius: 20 },
  modalInput: { 
    height: 50, 
    borderRadius: 12, 
    paddingHorizontal: 15,
    marginBottom: 12,
    fontSize: 14
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  optionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  optionLabel: { flex: 1, fontSize: 16 },
  contactSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
  },
  contactSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.3)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  contactSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
});
