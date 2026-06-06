import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Animated, Pressable, Dimensions, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useMaintenance } from '@/contexts/MaintenanceContext';
import { BlurView } from 'expo-blur';

const { width: SW } = Dimensions.get('window');
const RETRY_DELAY_MS = 15_000;

export default function MaintenanceOverlay() {
  const { isMaintenance, checkHealth } = useMaintenance();

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const spinAnim  = useRef(new Animated.Value(0)).current;

  const [checking, setChecking]   = useState(false);
  const [countdown, setCountdown] = useState(RETRY_DELAY_MS / 1000);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isMaintenance) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 130 }),
      ]).start();
      startCountdown();
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      clearCountdown();
    }
    return () => clearCountdown();
  }, [isMaintenance]);

  useEffect(() => {
    if (!isMaintenance) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 1200, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [isMaintenance]);

  const startCountdown = () => {
    clearCountdown();
    setCountdown(RETRY_DELAY_MS / 1000);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { retry(); return RETRY_DELAY_MS / 1000; }
        return prev - 1;
      });
    }, 1000);
  };

  const clearCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
  };

  const retry = async () => {
    if (checking) return;
    setChecking(true);
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 800, useNativeDriver: true })
    ).start();
    await checkHealth();
    setChecking(false);
    spinAnim.stopAnimation();
    spinAnim.setValue(0);
    startCountdown();
  };

  if (!isMaintenance) return null;

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} pointerEvents="box-none">
      <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />

      <Animated.View style={[styles.card, { transform: [{ translateY: slideAnim }] }]}>
        <LinearGradient
          colors={['#052e16', '#064e3b', '#052e16']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.cardGrad}
        >
          {/* Glow blobs */}
          <View style={[styles.blob, styles.blobTL]} />
          <View style={[styles.blob, styles.blobBR]} />

          {/* Icon */}
          <Animated.View style={[styles.iconWrap, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.iconRing} />
            <View style={styles.iconInner}>
              <Ionicons name="construct" size={40} color="#10B981" />
            </View>
          </Animated.View>

          {/* Text */}
          <ThemedText style={styles.title}>Under Maintenance</ThemedText>
          <ThemedText style={styles.subtitle}>
            Emorii is temporarily offline for scheduled maintenance.{'\n'}
            We'll be back shortly — thank you for your patience.
          </ThemedText>

          {/* Status pill */}
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <ThemedText style={styles.statusText}>Maintenance in progress</ThemedText>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Retry button */}
          <Pressable
            style={[styles.retryBtn, checking && { opacity: 0.65 }]}
            onPress={retry}
            disabled={checking}
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.retryBtnInner}
            >
              <Animated.View style={{ transform: [{ rotate: checking ? spin : '0deg' }] }}>
                <Ionicons name="refresh" size={18} color="#FFF" />
              </Animated.View>
              <ThemedText style={styles.retryBtnText}>
                {checking ? 'Checking…' : 'Try Again'}
              </ThemedText>
            </LinearGradient>
          </Pressable>

          {!checking && (
            <ThemedText style={styles.countdown}>Auto-retrying in {countdown}s</ThemedText>
          )}
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: SW - 40,
    maxWidth: 360,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.55,
    shadowRadius: 40,
    elevation: 30,
  },
  cardGrad: {
    padding: 32,
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90, opacity: 0.5,
  },
  blobTL: { top: -70, left: -70, backgroundColor: '#10B98140' },
  blobBR: { bottom: -70, right: -70, backgroundColor: '#05966930' },

  iconWrap:  { alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  iconRing: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.30)',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  iconInner: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(16,185,129,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)',
  },

  title: {
    fontSize: 22, fontWeight: '900', color: '#F0FDF4',
    textAlign: 'center', letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14, color: 'rgba(187,247,208,0.75)',
    textAlign: 'center', lineHeight: 21, maxWidth: 280,
  },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderColor: 'rgba(16,185,129,0.35)',
    marginTop: 2,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  statusText: { fontSize: 12, fontWeight: '700', color: '#6EE7B7' },

  divider: {
    width: '100%', height: 1,
    backgroundColor: 'rgba(16,185,129,0.15)', marginVertical: 4,
  },

  retryBtn:      { width: '100%', borderRadius: 16, overflow: 'hidden' },
  retryBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 15,
  },
  retryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },

  countdown: {
    fontSize: 11, color: 'rgba(167,243,208,0.45)', fontWeight: '600',
  },
});
