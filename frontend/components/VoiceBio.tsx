import { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Audio } from "../utils/expoAvCompat";
import { Ionicons, Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { formatDuration } from "@/utils/formatters";

interface Props {
  voiceBioUrl?: string | null;
  duration?: number;
  isOwn?: boolean;
  hideHeader?: boolean;
  onRecord?: (uri: string, duration: number) => Promise<void>;
  onDelete?: () => Promise<void>;
  onReport?: () => void;
}

const BAR_COUNT = 28;


export default function VoiceBio({ voiceBioUrl, duration = 0, isOwn = false, hideHeader = false, onRecord, onDelete, onReport }: Props) {
  const { theme } = useTheme();
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [playPos, setPlayPos] = useState(0);
  const [loading, setLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const recordRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveAnim = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.2))
  ).current;
  const waveLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    return () => {
      cleanupSound();
      cleanupRecording();
    };
  }, []);

  const cleanupSound = async () => {
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); } catch {}
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
  };

  const cleanupRecording = async () => {
    if (recordRef.current) {
      try { await recordRef.current.stopAndUnloadAsync(); } catch {}
      recordRef.current = null;
    }
  };

  const startWaveAnimation = () => {
    const anims = waveAnim.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 40),
          Animated.timing(a, { toValue: 0.9, duration: 300, useNativeDriver: false }),
          Animated.timing(a, { toValue: 0.2, duration: 300, useNativeDriver: false }),
        ])
      )
    );
    waveLoopRef.current = Animated.parallel(anims);
    waveLoopRef.current.start();
  };

  const stopWaveAnimation = () => {
    if (waveLoopRef.current) {
      waveLoopRef.current.stop();
      waveLoopRef.current = null;
    }
    waveAnim.forEach(a => a.setValue(0.2));
  };

  const handlePlay = async () => {
    if (!voiceBioUrl) return;
    if (playing) {
      await cleanupSound();
      setPlaying(false);
      setPlayPos(0);
      if (timerRef.current) clearInterval(timerRef.current);
      stopWaveAnimation();
      return;
    }
    try {
      setLoading(true);
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
      const { sound } = await Audio.Sound.createAsync(
        { uri: voiceBioUrl },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setPlaying(true);
      setPlayPos(0);
      startWaveAnimation();
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded) {
          setPlayPos(Math.floor((status.positionMillis || 0) / 1000));
          if (status.didJustFinish) {
            setPlaying(false);
            setPlayPos(0);
            stopWaveAnimation();
          }
        }
      });
    } catch (e) {
      Alert.alert("Playback error", "Could not play voice bio");
    } finally {
      setLoading(false);
    }
  };

  const handleStartRecord = async () => {
    if (!isOwn || !onRecord) return;
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) {
      Alert.alert("Permission needed", "Microphone permission is required to record your voice bio.");
      return;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordRef.current = rec;
      setRecording(true);
      setElapsed(0);
      startWaveAnimation();
      timerRef.current = setInterval(() => {
        setElapsed(e => {
          if (e >= 30) {
            handleStopRecord();
            return e;
          }
          return e + 1;
        });
      }, 1000);
    } catch (e) {
      Alert.alert("Recording error", "Could not start recording");
    }
  };

  const handleStopRecord = async () => {
    if (!recordRef.current || !onRecord) return;
    if (timerRef.current) clearInterval(timerRef.current);
    stopWaveAnimation();
    setRecording(false);
    try {
      const rec = recordRef.current;
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordRef.current = null;
      if (!uri) return;
      setLoading(true);
      await onRecord(uri, elapsed);
    } catch (e) {
      Alert.alert("Error", "Could not save voice bio");
    } finally {
      setLoading(false);
      setElapsed(0);
    }
  };

  const handleDelete = () => {
    Alert.alert("Remove Voice Bio", "Are you sure you want to remove your voice bio?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          if (onDelete) {
            setLoading(true);
            await onDelete();
            setLoading(false);
          }
        },
      },
    ]);
  };

  const hasVoiceBio = !!voiceBioUrl;
  const displayDuration = playing ? playPos : duration;
  const accentColor = recording ? "#FF3B30" : theme.primary;

  return (
    <View style={hideHeader ? styles.compactContainer : [styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {!hideHeader && (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.iconWrap, { backgroundColor: accentColor + "18" }]}>
              <Ionicons name="mic" size={16} color={accentColor} />
            </View>
            <ThemedText style={[styles.title, { color: theme.text }]}>Voice Bio</ThemedText>
            {recording && (
              <View style={[styles.liveBadge, { backgroundColor: "#FF3B30" }]}>
                <ThemedText style={styles.liveText}>REC</ThemedText>
              </View>
            )}
          </View>
          {isOwn && hasVoiceBio && !recording && (
            <Pressable onPress={handleDelete} hitSlop={8}>
              <Feather name="trash-2" size={16} color={theme.textSecondary} />
            </Pressable>
          )}
          {!isOwn && hasVoiceBio && !recording && onReport && (
            <Pressable onPress={onReport} hitSlop={8}>
              <Feather name="flag" size={15} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      )}
      {hideHeader && recording && (
        <View style={[styles.liveBadge, { backgroundColor: "#FF3B30", alignSelf: "flex-start" }]}>
          <ThemedText style={styles.liveText}>● REC</ThemedText>
        </View>
      )}

      <View style={styles.waveRow}>
        <Pressable
          style={[styles.playBtn, { backgroundColor: accentColor }]}
          onPress={recording ? handleStopRecord : (hasVoiceBio ? handlePlay : (isOwn ? handleStartRecord : undefined))}
          disabled={loading || (!hasVoiceBio && !isOwn)}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : recording ? (
            <Ionicons name="stop" size={20} color="#fff" />
          ) : playing ? (
            <Ionicons name="pause" size={20} color="#fff" />
          ) : hasVoiceBio ? (
            <Ionicons name="play" size={20} color="#fff" />
          ) : (
            <Ionicons name="mic" size={20} color="#fff" />
          )}
        </Pressable>

        <View style={styles.barsWrap}>
          {waveAnim.map((a, i) => (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  backgroundColor: (playing || recording) ? accentColor : theme.border,
                  height: a.interpolate({ inputRange: [0, 1], outputRange: [4, 28] }),
                },
              ]}
            />
          ))}
        </View>

        <ThemedText style={[styles.timer, { color: theme.textSecondary }]}>
          {recording ? `${formatDuration(elapsed)} / 0:30` : formatDuration(displayDuration)}
        </ThemedText>
      </View>

      {!hasVoiceBio && isOwn && !recording && (
        <Pressable
          style={[styles.recordCta, { borderColor: accentColor + "40", backgroundColor: accentColor + "08" }]}
          onPress={handleStartRecord}
        >
          <Ionicons name="mic-circle-outline" size={18} color={accentColor} />
          <ThemedText style={[styles.recordCtaText, { color: accentColor }]}>
            Tap to record a 30-second voice intro
          </ThemedText>
        </Pressable>
      )}

      {isOwn && hasVoiceBio && !recording && (
        <Pressable
          style={[styles.reRecordBtn, { borderColor: theme.border }]}
          onPress={handleStartRecord}
        >
          <Ionicons name="mic-outline" size={14} color={theme.textSecondary} />
          <ThemedText style={[styles.reRecordText, { color: theme.textSecondary }]}>
            Re-record
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  compactContainer: {
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
  },
  liveBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
  },
  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  barsWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 36,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    minHeight: 4,
  },
  timer: {
    fontSize: 12,
    fontWeight: "600",
    minWidth: 48,
    textAlign: "right",
  },
  recordCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    borderStyle: "dashed",
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  recordCtaText: {
    fontSize: 13,
    fontWeight: "500",
  },
  reRecordBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
  },
  reRecordText: {
    fontSize: 12,
  },
});
