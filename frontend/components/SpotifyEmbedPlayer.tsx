import { useState, useRef, useEffect, useCallback } from "react";
import {
  Pressable,
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Animated,
  Linking,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "../utils/expoAvCompat";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function extractTrackId(spotifyUri?: string): string | null {
  if (!spotifyUri) return null;
  const m1 = spotifyUri.match(/spotify:track:([A-Za-z0-9]+)/);
  if (m1) return m1[1];
  const m2 = spotifyUri.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
  if (m2) return m2[1];
  return null;
}

async function fetchDeezerPreview(title: string, artist: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(`${artist} ${title}`);
    const res = await fetch(`https://api.deezer.com/search?q=${q}&limit=5`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tracks = data?.data || [];
    for (const t of tracks) {
      if (t.preview) return t.preview;
    }
    return null;
  } catch {
    return null;
  }
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

interface Props {
  spotifyUri?: string;
  previewUrl?: string;
  title?: string;
  artist?: string;
  albumArt?: string;
  size?: number;
  color?: string;
  activeColor?: string;
}

export default function SpotifyEmbedPlayer({
  spotifyUri,
  previewUrl,
  title,
  artist,
  albumArt,
  size = 22,
  color = "#1DB954",
  activeColor = "#1DB954",
}: Props) {
  const insets = useSafeAreaInsets();

  const [modalVisible, setModalVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);  // seconds
  const [duration, setDuration] = useState(30); // seconds

  const soundRef = useRef<Audio.Sound | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const trackId = extractTrackId(spotifyUri);
  const hasSource = !!trackId || !!previewUrl;

  useEffect(() => {
    if (!modalVisible && soundRef.current) {
      soundRef.current.stopAsync().catch(() => {});
      soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
      setIsPlaying(false);
      setPosition(0);
      progressAnim.setValue(0);
    }
  }, [modalVisible]);

  const updateProgress = useCallback((pos: number, dur: number) => {
    setPosition(pos);
    setDuration(dur);
    const pct = dur > 0 ? pos / dur : 0;
    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, []);

  const onPlaybackStatus = useCallback((status: any) => {
    if (!status.isLoaded) return;
    const pos = (status.positionMillis || 0) / 1000;
    const dur = (status.durationMillis || 30000) / 1000;
    updateProgress(pos, dur);
    if (status.isPlaying !== undefined) setIsPlaying(status.isPlaying);
    if (status.didJustFinish) {
      setIsPlaying(false);
      soundRef.current?.setPositionAsync(0).catch(() => {});
      updateProgress(0, dur);
    }
  }, [updateProgress]);

  const loadAndPlay = async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        playThroughEarpieceAndroid: false,
      });

      let audioUrl: string | null = previewUrl || null;

      if (!audioUrl && title) {
        audioUrl = await fetchDeezerPreview(title, artist || "");
      }

      if (!audioUrl) {
        setLoadError("No preview available for this song.");
        setIsLoading(false);
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true, progressUpdateIntervalMillis: 500 },
        onPlaybackStatus,
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch (e) {
      setLoadError("Could not load audio. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlayPause = async () => {
    if (!soundRef.current) {
      await loadAndPlay();
      return;
    }
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      await soundRef.current.playAsync();
    }
  };

  const openModal = () => {
    setLoadError(null);
    setModalVisible(true);
  };

  const closeModal = () => setModalVisible(false);

  if (!hasSource && !title) return null;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <>
      {/* ── Inline play button ── */}
      <Pressable onPress={openModal} hitSlop={12} style={styles.btn}>
        <Feather
          name={isPlaying && !modalVisible ? "pause-circle" : "play-circle"}
          size={size + 8}
          color={color}
        />
      </Pressable>

      {/* ── Player bottom sheet ── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={closeModal} />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 8, 24) }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Song info row */}
          <View style={styles.trackRow}>
            {albumArt ? (
              <Image source={{ uri: albumArt }} style={styles.albumArt} />
            ) : (
              <LinearGradient
                colors={["#1DB954", "#158f3f"]}
                style={styles.albumArt}
              >
                <Feather name="music" size={20} color="#fff" />
              </LinearGradient>
            )}

            <View style={styles.trackInfo}>
              <Text style={styles.trackTitle} numberOfLines={1}>
                {title || "Unknown Track"}
              </Text>
              {artist ? (
                <Text style={styles.trackArtist} numberOfLines={1}>{artist}</Text>
              ) : null}
            </View>

            <TouchableOpacity onPress={closeModal} hitSlop={10} style={styles.closeBtn}>
              <Feather name="x" size={22} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>

          {/* Error state */}
          {loadError ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={18} color="#f87171" />
              <Text style={styles.errorText}>{loadError}</Text>
            </View>
          ) : null}

          {/* Progress bar */}
          {!loadError && (
            <View style={styles.progressSection}>
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[styles.progressFill, { width: progressWidth }]}
                />
                <Animated.View
                  style={[styles.progressThumb, { left: progressWidth }]}
                />
              </View>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatSeconds(position)}</Text>
                <Text style={styles.timeText}>{formatSeconds(duration)}</Text>
              </View>
            </View>
          )}

          {/* Controls */}
          {!loadError && (
            <View style={styles.controls}>
              {/* Restart */}
              <TouchableOpacity
                onPress={() => {
                  soundRef.current?.setPositionAsync(0).catch(() => {});
                  updateProgress(0, duration);
                }}
                hitSlop={10}
                style={styles.sideBtn}
              >
                <Feather name="skip-back" size={22} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>

              {/* Play / Pause */}
              <TouchableOpacity
                onPress={togglePlayPause}
                style={styles.playBtn}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Feather
                    name={isPlaying ? "pause" : "play"}
                    size={26}
                    color="#000"
                    style={!isPlaying ? { marginLeft: 3 } : undefined}
                  />
                )}
              </TouchableOpacity>

              {/* Volume placeholder / branding space */}
              <View style={styles.sideBtn}>
                <Feather name="music" size={20} color="rgba(255,255,255,0.3)" />
              </View>
            </View>
          )}

          {/* Open in external music app */}
          <View style={styles.openInRow}>
            {trackId ? (
              <TouchableOpacity
                onPress={async () => {
                  // Try the native Spotify app first; fall back to the web player.
                  const appUrl = `spotify://track/${trackId}`;
                  const webUrl = `https://open.spotify.com/track/${trackId}`;
                  try {
                    const can = await Linking.canOpenURL(appUrl);
                    Linking.openURL(can ? appUrl : webUrl).catch(() => Linking.openURL(webUrl));
                  } catch {
                    Linking.openURL(webUrl).catch(() => {});
                  }
                }}
                style={[styles.openInBtn, styles.openInSpotify]}
                activeOpacity={0.85}
              >
                <Feather name="external-link" size={14} color="#fff" />
                <Text style={styles.openInTextLight}>Open in Spotify</Text>
              </TouchableOpacity>
            ) : null}
            {(title || trackId) ? (
              <TouchableOpacity
                onPress={async () => {
                  // Apple Music doesn't expose a direct lookup-by-Spotify-ID URL,
                  // so we deep-link into a search that lands on the matching song.
                  const q = encodeURIComponent(`${title || ""} ${artist || ""}`.trim());
                  const isiOS = Platform.OS === "ios";
                  const appUrl = isiOS
                    ? `music://music.apple.com/search?term=${q}`
                    : `https://music.apple.com/search?term=${q}`;
                  const webUrl = `https://music.apple.com/search?term=${q}`;
                  try {
                    const can = await Linking.canOpenURL(appUrl);
                    Linking.openURL(can ? appUrl : webUrl).catch(() => Linking.openURL(webUrl));
                  } catch {
                    Linking.openURL(webUrl).catch(() => {});
                  }
                }}
                style={[styles.openInBtn, styles.openInApple]}
                activeOpacity={0.85}
              >
                <Feather name="external-link" size={14} color="#fff" />
                <Text style={styles.openInTextLight}>Apple Music</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.previewLabel}>30-second preview</Text>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: "center", justifyContent: "center" },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },

  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#121212",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
  },

  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 20,
  },

  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },

  albumArt: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  trackInfo: {
    flex: 1,
    marginHorizontal: 12,
  },

  trackTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  trackArtist: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    marginTop: 3,
  },

  closeBtn: { padding: 4 },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(248,113,113,0.1)",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },

  errorText: {
    color: "#f87171",
    fontSize: 13,
    flex: 1,
  },

  progressSection: {
    marginBottom: 12,
  },

  progressTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    overflow: "visible",
    position: "relative",
  },

  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#1DB954",
    borderRadius: 2,
  },

  progressThumb: {
    position: "absolute",
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#fff",
    marginLeft: -7,
  },

  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },

  timeText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
  },

  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
    marginTop: 16,
    marginBottom: 20,
  },

  sideBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
  },

  previewLabel: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 11,
    textAlign: "center",
    marginBottom: 4,
  },

  openInRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 14,
    flexWrap: "wrap",
  },

  openInBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
  },

  openInSpotify: { backgroundColor: "#1DB954" },
  openInApple: { backgroundColor: "#FA243C" },
  openInTextLight: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
