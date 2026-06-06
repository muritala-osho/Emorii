import { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

function parseTime(str: string | undefined): Date {
  const d = new Date();
  if (!str) return d;
  const [h, m] = str.split(':').map(Number);
  d.setHours(isNaN(h) ? 22 : h, isNaN(m) ? 0 : m, 0, 0);
  return d;
}

function formatTime(str: string | undefined): string {
  if (!str) return '--:--';
  const [h, m] = str.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toTimeStr(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

interface SectionProps { title: string; }
function Section({ title }: SectionProps) {
  const { theme } = useTheme();
  return (
    <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
      {title}
    </ThemedText>
  );
}

interface RowProps {
  icon: string;
  iconColor?: string;
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  isLast?: boolean;
  disabled?: boolean;
}
function ToggleRow({ icon, iconColor, label, sublabel, value, onChange, isLast, disabled }: RowProps) {
  const { theme } = useTheme();
  return (
    <View style={[
      styles.row,
      !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
      disabled && { opacity: 0.4 },
    ]}>
      <View style={[styles.iconBubble, { backgroundColor: (iconColor || theme.primary) + '20' }]}>
        <Feather name={icon as any} size={16} color={iconColor || theme.primary} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <ThemedText style={[styles.label, { color: theme.text }]}>{label}</ThemedText>
        {sublabel ? (
          <ThemedText style={[styles.sublabel, { color: theme.textSecondary }]}>{sublabel}</ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={disabled ? undefined : onChange}
        trackColor={{ false: theme.border, true: theme.primary }}
        thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
      />
    </View>
  );
}

interface TimeRowProps {
  label: string;
  time: string;
  onPress: () => void;
  isLast?: boolean;
  disabled?: boolean;
}
function TimeRow({ label, time, onPress, isLast, disabled }: TimeRowProps) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      style={[
        styles.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
        disabled && { opacity: 0.4 },
      ]}
      activeOpacity={0.7}
    >
      <View style={{ flex: 1, marginLeft: 4 }}>
        <ThemedText style={[styles.label, { color: theme.text }]}>{label}</ThemedText>
      </View>
      <ThemedText style={{ color: theme.primary, fontWeight: '600', fontSize: 15 }}>
        {formatTime(time)}
      </ThemedText>
      <Feather name="chevron-right" size={16} color={theme.textSecondary} style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

export default function NotificationSettingsScreen() {
  const { theme } = useTheme();
  const { user, token, fetchUser } = useAuth();
  const { put, get } = useApi();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const prefs = (user as any)?.notificationPreferences || {};

  const [pushEnabled, setPushEnabled]   = useState<boolean>(user?.settings?.pushNotifications ?? true);
  const [emailEnabled, setEmailEnabled] = useState<boolean>((user as any)?.settings?.emailNotifications ?? true);

  const [msgEnabled,       setMsgEnabled]       = useState<boolean>(prefs.messagesEnabled   ?? true);
  const [matchEnabled,     setMatchEnabled]      = useState<boolean>(prefs.matchesEnabled    ?? true);
  const [likeEnabled,      setLikeEnabled]       = useState<boolean>(prefs.likesEnabled      ?? true);
  const [voiceEnabled,     setVoiceEnabled]      = useState<boolean>(prefs.voiceCallsEnabled ?? true);
  const [videoEnabled,     setVideoEnabled]      = useState<boolean>(prefs.videoCallsEnabled ?? true);

  const [soundEnabled,     setSoundEnabled]      = useState<boolean>(prefs.soundEnabled      ?? true);
  const [vibrationEnabled, setVibrationEnabled]  = useState<boolean>(prefs.vibrationEnabled  ?? true);

  const [quietEnabled,   setQuietEnabled]   = useState(false);
  const [quietStart,     setQuietStart]     = useState('22:00');
  const [quietEnd,       setQuietEnd]       = useState('08:00');
  const [allowCalls,     setAllowCalls]     = useState(false);
  const [dndLoading,     setDndLoading]     = useState(true);

  const [showPicker, setShowPicker]     = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end'>('start');
  const [pickerDate, setPickerDate]     = useState(new Date());

  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingDnd,   setSavingDnd]   = useState(false);

  useEffect(() => {
    if (!token) { setDndLoading(false); return; }
    get('/mute/dnd', token).then((res: any) => {
      const d = res?.data;
      if (d) {
        setQuietEnabled(d.enabled ?? false);
        setQuietStart(d.startTime || '22:00');
        setQuietEnd(d.endTime || '08:00');
        setAllowCalls(d.allowCalls ?? false);
      }
    }).catch(() => {}).finally(() => setDndLoading(false));
  }, []);

  const saveMaster = async (field: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    try {
      const res = await put('/account/settings', { [field]: value }, token || '');
      if (res.success) {
        if (field === 'pushNotifications') {
          await AsyncStorage.setItem('pushNotificationsEnabled', value ? 'true' : 'false');
        }
        if (fetchUser) fetchUser();
      } else {
        setter(!value);
      }
    } catch { setter(!value); }
  };

  const savePrefs = useCallback(async (overrides: Record<string, boolean>) => {
    if (!token) return;
    setSavingPrefs(true);
    try {
      await put('/mute/notification-preferences', overrides, token);
      try {
        const existing = await AsyncStorage.getItem('notificationPreferences');
        const current = existing ? JSON.parse(existing) : {};
        await AsyncStorage.setItem(
          'notificationPreferences',
          JSON.stringify({ ...current, ...overrides })
        );
      } catch {}
      if (fetchUser) fetchUser();
    } catch {}
    finally { setSavingPrefs(false); }
  }, [token]);

  const togglePref = (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    savePrefs({ [key]: value });
  };

  const saveDnd = async (overrides?: Partial<{ enabled: boolean; startTime: string; endTime: string; allowCalls: boolean }>) => {
    if (!token) return;
    const payload = {
      enabled:    overrides?.enabled    ?? quietEnabled,
      startTime:  overrides?.startTime  ?? quietStart,
      endTime:    overrides?.endTime    ?? quietEnd,
      allowCalls: overrides?.allowCalls ?? allowCalls,
    };
    if (payload.enabled && (!payload.startTime || !payload.endTime)) return;
    setSavingDnd(true);
    try {
      await put('/mute/dnd', payload, token);
    } catch {}
    finally { setSavingDnd(false); }
  };

  const handleQuietToggle = (v: boolean) => {
    setQuietEnabled(v);
    saveDnd({ enabled: v });
  };

  const handleAllowCallsToggle = (v: boolean) => {
    setAllowCalls(v);
    saveDnd({ allowCalls: v });
  };

  const openTimePicker = (target: 'start' | 'end') => {
    const current = target === 'start' ? quietStart : quietEnd;
    setPickerTarget(target);
    setPickerDate(parseTime(current));
    setShowPicker(true);
  };

  const onPickerChange = (_: any, selected?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (!selected) return;
    const str = toTimeStr(selected);
    if (pickerTarget === 'start') {
      setQuietStart(str);
      saveDnd({ startTime: str });
    } else {
      setQuietEnd(str);
      saveDnd({ endTime: str });
    }
    if (Platform.OS === 'ios') setPickerDate(selected);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16), borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
          <Feather name="chevron-left" size={28} color={theme.text} />
        </TouchableOpacity>
        <ThemedText style={[styles.headerTitle, { color: theme.text }]}>Notification Settings</ThemedText>
        <View style={{ width: 40 }}>
          {(savingPrefs || savingDnd) && <ActivityIndicator size="small" color={theme.primary} />}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Master Toggles ─────────────────────────────── */}
        <Section title="GENERAL" />
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <ToggleRow
            icon="bell"
            label="Push Notifications"
            sublabel="All in-app alerts and notifications"
            value={pushEnabled}
            onChange={(v) => saveMaster('pushNotifications', v, setPushEnabled)}
          />
          <ToggleRow
            icon="mail"
            label="Email Notifications"
            sublabel="Match updates, account alerts"
            value={emailEnabled}
            onChange={(v) => saveMaster('emailNotifications', v, setEmailEnabled)}
            isLast
          />
        </View>

        {/* ── Notification Types ─────────────────────────── */}
        <Section title="NOTIFY ME ABOUT" />
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <ToggleRow
            icon="message-circle"
            iconColor="#4A90D9"
            label="Messages"
            sublabel="New chat messages from your matches"
            value={msgEnabled}
            onChange={(v) => { setMsgEnabled(v); savePrefs({ messagesEnabled: v }); }}
            disabled={!pushEnabled}
          />
          <ToggleRow
            icon="heart"
            iconColor="#FF6B9D"
            label="New Matches"
            sublabel="When someone matches with you"
            value={matchEnabled}
            onChange={(v) => { setMatchEnabled(v); savePrefs({ matchesEnabled: v }); }}
            disabled={!pushEnabled}
          />
          <ToggleRow
            icon="star"
            iconColor="#F59E0B"
            label="Likes"
            sublabel="When someone likes your profile"
            value={likeEnabled}
            onChange={(v) => { setLikeEnabled(v); savePrefs({ likesEnabled: v }); }}
            disabled={!pushEnabled}
          />
          <ToggleRow
            icon="phone"
            iconColor="#10B981"
            label="Voice Calls"
            sublabel="Incoming voice calls"
            value={voiceEnabled}
            onChange={(v) => { setVoiceEnabled(v); savePrefs({ voiceCallsEnabled: v }); }}
            disabled={!pushEnabled}
          />
          <ToggleRow
            icon="video"
            iconColor="#8B5CF6"
            label="Video Calls"
            sublabel="Incoming video calls"
            value={videoEnabled}
            onChange={(v) => { setVideoEnabled(v); savePrefs({ videoCallsEnabled: v }); }}
            isLast
            disabled={!pushEnabled}
          />
        </View>

        {/* ── Sound & Vibration ─────────────────────────── */}
        <Section title="SOUND & VIBRATION" />
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <ToggleRow
            icon="volume-2"
            label="Sound"
            sublabel="Play sound for notifications"
            value={soundEnabled}
            onChange={(v) => { setSoundEnabled(v); savePrefs({ soundEnabled: v }); }}
            disabled={!pushEnabled}
          />
          <ToggleRow
            icon="smartphone"
            label="Vibration"
            sublabel="Vibrate for notifications"
            value={vibrationEnabled}
            onChange={(v) => { setVibrationEnabled(v); savePrefs({ vibrationEnabled: v }); }}
            isLast
            disabled={!pushEnabled}
          />
        </View>

        {/* ── Quiet Hours ───────────────────────────────── */}
        <Section title="QUIET HOURS" />
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          {dndLoading ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : (
            <>
              <ToggleRow
                icon="moon"
                iconColor="#6366F1"
                label="Do Not Disturb"
                sublabel="Silence notifications during set hours"
                value={quietEnabled}
                onChange={handleQuietToggle}
                disabled={!pushEnabled}
              />

              {quietEnabled && (
                <>
                  <TimeRow
                    label="Start Time"
                    time={quietStart}
                    onPress={() => openTimePicker('start')}
                    disabled={!pushEnabled}
                  />
                  <TimeRow
                    label="End Time"
                    time={quietEnd}
                    onPress={() => openTimePicker('end')}
                    disabled={!pushEnabled}
                  />
                  <ToggleRow
                    icon="phone-call"
                    iconColor="#10B981"
                    label="Allow Calls"
                    sublabel="Calls can still come through during quiet hours"
                    value={allowCalls}
                    onChange={handleAllowCallsToggle}
                    isLast
                    disabled={!pushEnabled}
                  />
                </>
              )}

              {!quietEnabled && (
                <View style={[styles.row, { opacity: 0.45 }]}>
                  <Feather name="info" size={14} color={theme.textSecondary} />
                  <ThemedText style={[styles.sublabel, { color: theme.textSecondary, marginLeft: 8, flex: 1 }]}>
                    Turn on Do Not Disturb to set quiet hours
                  </ThemedText>
                </View>
              )}
            </>
          )}
        </View>

        <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>
          Your phone's own Do Not Disturb setting always takes priority over these controls.
        </ThemedText>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Time Picker ──────────────────────────────────── */}
      {showPicker && Platform.OS === 'ios' && (
        <View style={[styles.iosPickerSheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.iosPickerHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <ThemedText style={{ color: theme.primary, fontWeight: '600', fontSize: 16 }}>Done</ThemedText>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={pickerDate}
            mode="time"
            display="spinner"
            onChange={onPickerChange}
            style={{ height: 180 }}
          />
        </View>
      )}

      {showPicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerDate}
          mode="time"
          display="default"
          onChange={onPickerChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },

  content: { padding: 16 },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 20,
    paddingLeft: 4,
  },

  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 60,
  },

  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  label: { fontSize: 15, fontWeight: '500' },
  sublabel: { fontSize: 12, marginTop: 1 },

  hint: {
    fontSize: 12,
    marginTop: 12,
    paddingHorizontal: 4,
    lineHeight: 18,
  },

  iosPickerSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
