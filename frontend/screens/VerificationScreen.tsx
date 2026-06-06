import logger from '@/utils/logger';
import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, Platform, Dimensions } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Video, ResizeMode } from '../utils/expoAvCompat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Camera, CameraView } from 'expo-camera';
import { useAuth } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';
import { getApiBaseUrl } from '@/constants/config';
import { VerificationBadge } from '@/components/VerificationBadge';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type VerificationStatus = 'not_requested' | 'pending' | 'approved' | 'rejected';

interface VerificationState {
  verified: boolean;
  status: VerificationStatus;
  requestDate: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
}

const BENEFITS = [
  { icon: 'shield-checkmark', title: 'Trust Badge', desc: 'Blue tick on your profile', color: '#4CAF50' },
  { icon: 'trending-up', title: 'More Matches', desc: 'Appear higher in discovery', color: '#2196F3' },
  { icon: 'heart', title: 'Better Connections', desc: 'Quality over quantity', color: '#E91E63' },
  { icon: 'star', title: 'Stand Out', desc: 'Premium verified look', color: '#FF9800' },
];

const STEPS = [
  { num: 1, icon: 'videocam-outline', title: 'Record a video', desc: 'Front camera, good lighting' },
  { num: 2, icon: 'cloud-upload-outline', title: 'Submit for review', desc: 'Our team reviews within 24h' },
  { num: 3, icon: 'checkmark-circle-outline', title: 'Get your badge', desc: 'Verified tick appears on profile' },
];

export default function VerificationScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { token, fetchUser } = useAuth();
  const { get } = useApi();

  const [verificationState, setVerificationState] = useState<VerificationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [capturedVerificationVideo, setCapturedVerificationVideo] = useState<string | null>(null);
  const [verificationStep, setVerificationStep] = useState<'selfie' | 'review'>('selfie');
  const [recording, setRecording] = useState(false);
  const [recordingReadyToSubmit, setRecordingReadyToSubmit] = useState(false);
  const cameraRef = useRef<any>(null);
  const recordingPromiseRef = useRef<Promise<any> | null>(null);
  const submitDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (submitDelayRef.current) {
        clearTimeout(submitDelayRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchVerificationStatus();
  }, []);

  const fetchVerificationStatus = async () => {
    if (!token) return;
    try {
      const response = await get<any>('/verification/status', {}, token);
      const resData: any = response;
      if (resData && resData.success && resData.data) {
        setVerificationState(resData.data as any);
      }
    } catch (error) {
      logger.error('Failed to fetch verification status:', error);
    } finally {
      setLoading(false);
    }
  };

  const requestCameraPermission = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Use the mobile app', 'Video verification recording is available in the mobile app.');
      return;
    }

    const [{ status: cameraStatus }, { status: microphoneStatus }] = await Promise.all([
      Camera.requestCameraPermissionsAsync(),
      Camera.requestMicrophonePermissionsAsync(),
    ]);
    const granted = cameraStatus === 'granted' && microphoneStatus === 'granted';
    setHasPermission(granted);
    if (granted) {
      setShowCamera(true);
    } else {
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera and microphone access in your device settings to verify your profile.',
        [{ text: 'OK' }]
      );
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current || recording) return;
    if (typeof cameraRef.current.recordAsync !== 'function') {
      Alert.alert('Video unavailable', 'Video recording is not available on this device right now.');
      return;
    }

    try {
      setCapturedVerificationVideo(null);
      setRecording(true);
      setRecordingReadyToSubmit(false);
      if (submitDelayRef.current) clearTimeout(submitDelayRef.current);
      submitDelayRef.current = setTimeout(() => setRecordingReadyToSubmit(true), 5000);
      recordingPromiseRef.current = cameraRef.current.recordAsync({ maxDuration: 30 });
      const video = await recordingPromiseRef.current;
      if (video?.uri) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCapturedVerificationVideo(video.uri);
        setVerificationStep('review');
        setShowCamera(false);
      }
    } catch (error) {
      logger.error('Failed to record video:', error);
      Alert.alert('Error', 'Failed to record verification video. Please try again.');
    } finally {
      if (submitDelayRef.current) clearTimeout(submitDelayRef.current);
      setRecording(false);
      setRecordingReadyToSubmit(false);
      recordingPromiseRef.current = null;
    }
  };

  const stopRecording = () => {
    if (!cameraRef.current || !recording || !recordingReadyToSubmit) return;
    cameraRef.current.stopRecording();
  };

  const retakeVideo = () => {
    setCapturedVerificationVideo(null);
    setVerificationStep('selfie');
    setShowCamera(true);
  };

  const submitVerification = async () => {
    if (!capturedVerificationVideo || !token) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      const isQuickTime = capturedVerificationVideo.toLowerCase().endsWith('.mov');
      formData.append('video', {
        uri: capturedVerificationVideo,
        type: isQuickTime ? 'video/quicktime' : 'video/mp4',
        name: isQuickTime ? 'verification.mov' : 'verification.mp4',
      } as any);

      const response = await fetch(`${getApiBaseUrl()}/api/verification/upload-verification-video`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Accept': 'application/json',
        },
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setVerificationState(prev => ({
          ...prev,
          verified: false,
          status: 'pending',
          requestDate: new Date().toISOString(),
          approvedAt: null,
          rejectionReason: null,
        }));
        fetchUser().catch(error => logger.error('Failed to refresh user after verification upload:', error));
        Alert.alert(
          'Submitted!',
          'Your verification video has been sent to the admin review queue. Our team will compare it with your profile photos and award your verified badge within 24 hours.',
          [{ text: 'Got it', onPress: () => navigation.goBack() }]
        );
      } else {
        throw new Error(data.message || 'Verification failed');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to submit verification');
    } finally {
      setSubmitting(false);
    }
  };

  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" mode="video" />

        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'transparent']}
          style={[styles.cameraTopOverlay, { paddingTop: insets.top + 8 }]}
        >
          <View style={styles.cameraHeader}>
            <Pressable style={styles.cameraCloseBtn} onPress={() => setShowCamera(false)}>
              <Ionicons name="close" size={24} color="#FFF" />
            </Pressable>
            <ThemedText style={styles.cameraTitle}>Record Video</ThemedText>
            <View style={{ width: 44 }} />
          </View>

          <View style={styles.tipsList}>
            {['Face centered & visible', 'Good lighting', 'Blink and turn your head slowly'].map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <View style={styles.tipDot} />
                <ThemedText style={styles.tipText}>{tip}</ThemedText>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={styles.faceGuideWrapper}>
          <View style={styles.faceOval}>
            <View style={styles.faceOvalCornerTL} />
            <View style={styles.faceOvalCornerTR} />
            <View style={styles.faceOvalCornerBL} />
            <View style={styles.faceOvalCornerBR} />
          </View>
          <ThemedText style={styles.faceGuideLabel}>Fit your face inside</ThemedText>
        </View>

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={[styles.cameraBottomOverlay, { paddingBottom: insets.bottom + 24 }]}
        >
          {recording && (
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <ThemedText style={styles.recordingText}>Recording</ThemedText>
            </View>
          )}
          <Pressable
            style={[styles.captureBtn, recording && !recordingReadyToSubmit && { opacity: 0.55 }]}
            onPress={recording ? stopRecording : startRecording}
            disabled={recording && !recordingReadyToSubmit}
          >
            <View style={styles.captureBtnOuter}>
              <LinearGradient
                colors={recording ? ['#F44336', '#B71C1C'] : ['#4CAF50', '#2E7D32']}
                style={styles.captureBtnInner}
              >
                <Ionicons name={recording ? 'stop' : 'videocam'} size={28} color="#FFF" />
              </LinearGradient>
            </View>
          </Pressable>
          <ThemedText style={styles.captureBtnLabel}>
            {recording
              ? recordingReadyToSubmit ? 'Tap to review video' : 'Keep recording for at least 5 seconds'
              : 'Tap to start recording • Max 30 seconds'}
          </ThemedText>
        </LinearGradient>
      </View>
    );
  }

  if (verificationStep === 'review' && capturedVerificationVideo) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <LinearGradient
          colors={[theme.primary + '20', theme.primary + '08', 'transparent']}
          style={[styles.reviewHeader, { paddingTop: insets.top + 8 }]}
        >
          <Pressable style={styles.backBtn} onPress={() => navigation.canGoBack() ? navigation.goBack() : (navigation as any).navigate('MainTabs')}>
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText style={[styles.headerTitle, { color: theme.text }]}>Review Video</ThemedText>
          <View style={{ width: 40 }} />
        </LinearGradient>

        <ScrollView contentContainerStyle={styles.reviewContent}>
          <View style={styles.reviewPhotoWrapper}>
            <View style={[styles.reviewVideoWrapper, { borderColor: theme.primary + '80' }]}>
              <Video
                source={{ uri: capturedVerificationVideo }}
                style={styles.reviewVideo}
                resizeMode={ResizeMode.COVER}
                useNativeControls
                shouldPlay={false}
              />
            </View>
            <ThemedText style={[styles.reviewPhotoLabel, { color: theme.textSecondary }]}>
              Your verification video
            </ThemedText>
          </View>

          <View style={[styles.reviewInfoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.reviewInfoRow}>
              <View style={[styles.reviewInfoIcon, { backgroundColor: theme.primary + '20' }]}>
                <Ionicons name="eye-outline" size={20} color={theme.primary} />
              </View>
              <ThemedText style={[styles.reviewInfoText, { color: theme.textSecondary }]}>
                Our team will compare this video with your profile photos to confirm your identity. Only our moderators will see it.
              </ThemedText>
            </View>
          </View>

          <Pressable style={[styles.retakeBtn, { borderColor: theme.border }]} onPress={retakeVideo}>
            <Ionicons name="refresh-outline" size={18} color={theme.primary} />
            <ThemedText style={[styles.retakeBtnText, { color: theme.primary }]}>Record Again</ThemedText>
          </Pressable>
        </ScrollView>

        <View style={[styles.reviewFooter, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={submitVerification}
            disabled={submitting}
          >
            <LinearGradient
              colors={[theme.primary, (theme as any).secondary || theme.primary + 'CC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitBtnGradient}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={20} color="#FFF" />
                  <ThemedText style={styles.submitBtnText}>Submit Video</ThemedText>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={[theme.primary + '25', theme.primary + '08', 'transparent']}
        style={[styles.mainHeader, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.mainHeaderRow}>
          <Pressable style={styles.backBtn} onPress={() => navigation.canGoBack() ? navigation.goBack() : (navigation as any).navigate('MainTabs')}>
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText style={[styles.headerTitle, { color: theme.text }]}>Get Verified</ThemedText>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</ThemedText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.mainContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroSection}>
            <LinearGradient
              colors={[theme.primary + '25', theme.primary + '10']}
              style={styles.heroCard}
            >
              <LinearGradient
                colors={[theme.primary, (theme as any).secondary || theme.primary + 'CC']}
                style={styles.heroIconCircle}
              >
                <Ionicons name="shield-checkmark" size={36} color="#FFF" />
              </LinearGradient>
              <ThemedText style={[styles.heroTitle, { color: theme.text }]}>
                Verify Your Identity
              </ThemedText>
              <ThemedText style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
                A quick video is all it takes. Get your verified badge and stand out.
              </ThemedText>

              {verificationState?.verified && (
                <View style={[styles.statusPill, { backgroundColor: '#4CAF5025' }]}>
                  <VerificationBadge size={18} />
                  <ThemedText style={[styles.statusPillText, { color: '#4CAF50' }]}>You're Verified</ThemedText>
                </View>
              )}
              {verificationState?.status === 'pending' && (
                <View style={[styles.statusPill, { backgroundColor: '#FFC10720' }]}>
                  <Ionicons name="time" size={16} color="#FFC107" />
                  <ThemedText style={[styles.statusPillText, { color: '#FFC107' }]}>Pending Review</ThemedText>
                </View>
              )}
              {verificationState?.status === 'rejected' && (
                <View style={[styles.statusPill, { backgroundColor: '#F4433620' }]}>
                  <Ionicons name="close-circle" size={16} color="#F44336" />
                  <ThemedText style={[styles.statusPillText, { color: '#F44336' }]}>Not Approved</ThemedText>
                </View>
              )}
            </LinearGradient>
          </View>

          <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>Why get verified?</ThemedText>
          <View style={styles.benefitsGrid}>
            {BENEFITS.map((b, i) => (
              <View key={i} style={[styles.benefitCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.benefitIconCircle, { backgroundColor: b.color + '20' }]}>
                  <Ionicons name={b.icon as any} size={22} color={b.color} />
                </View>
                <ThemedText style={[styles.benefitTitle, { color: theme.text }]}>{b.title}</ThemedText>
                <ThemedText style={[styles.benefitDesc, { color: theme.textSecondary }]}>{b.desc}</ThemedText>
              </View>
            ))}
          </View>

          <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>How it works</ThemedText>
          <View style={[styles.stepsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {STEPS.map((step, i) => (
              <View key={i}>
                <View style={styles.stepRow}>
                  <View style={[styles.stepNumCircle, { backgroundColor: theme.primary }]}>
                    <ThemedText style={styles.stepNum}>{step.num}</ThemedText>
                  </View>
                  <View style={styles.stepInfo}>
                    <ThemedText style={[styles.stepTitle, { color: theme.text }]}>{step.title}</ThemedText>
                    <ThemedText style={[styles.stepDesc, { color: theme.textSecondary }]}>{step.desc}</ThemedText>
                  </View>
                  <Ionicons name={step.icon as any} size={22} color={theme.primary + '80'} />
                </View>
                {i < STEPS.length - 1 && (
                  <View style={[styles.stepLine, { backgroundColor: theme.border }]} />
                )}
              </View>
            ))}
          </View>

          {verificationState?.status === 'pending' && (
            <View style={[styles.alertCard, { backgroundColor: '#FFC10715', borderColor: '#FFC10740' }]}>
              <Ionicons name="time" size={24} color="#FFC107" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <ThemedText style={[styles.alertTitle, { color: '#FFC107' }]}>Under Review</ThemedText>
                <ThemedText style={[styles.alertDesc, { color: theme.textSecondary }]}>
                  We're reviewing your verification video. This usually takes up to 24 hours. You'll be able to discover and interact with other users as soon as you're approved.
                </ThemedText>
              </View>
            </View>
          )}

          {verificationState?.status === 'rejected' && (
            <View style={[styles.alertCard, { backgroundColor: '#F4433615', borderColor: '#F4433640' }]}>
              <Ionicons name="alert-circle" size={24} color="#F44336" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <ThemedText style={[styles.alertTitle, { color: '#F44336' }]}>Verification Failed</ThemedText>
                <ThemedText style={[styles.alertDesc, { color: theme.textSecondary }]}>
                  {verificationState.rejectionReason
                    ? verificationState.rejectionReason
                    : 'Your verification was not approved. Please record a new video in good lighting and try again.'}
                  {' '}Discovery and swiping will be unlocked once you pass verification.
                </ThemedText>
              </View>
            </View>
          )}

          {verificationState?.verified && (
            <View style={[styles.alertCard, { backgroundColor: '#4CAF5015', borderColor: '#4CAF5040' }]}>
              <Feather name="check-circle" size={24} color="#4CAF50" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <ThemedText style={[styles.alertTitle, { color: '#4CAF50' }]}>You're Verified!</ThemedText>
                <ThemedText style={[styles.alertDesc, { color: theme.textSecondary }]}>
                  Your verified badge is live on your profile. Head to Discover to start connecting!
                </ThemedText>
              </View>
            </View>
          )}

          {(!verificationState?.verified && verificationState?.status !== 'pending') && (
            <Pressable style={styles.startBtn} onPress={requestCameraPermission}>
              <LinearGradient
                colors={[theme.primary, (theme as any).secondary || theme.primary + 'CC']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.startBtnGradient}
              >
                <Ionicons name="videocam" size={22} color="#FFF" />
                <ThemedText style={styles.startBtnText}>Start Verification</ThemedText>
              </LinearGradient>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
  },

  mainHeader: {
    paddingBottom: 16,
  },
  mainHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },

  mainContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  heroSection: {
    marginBottom: 28,
  },
  heroCard: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
  },
  heroIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 4,
  },
  statusPillText: {
    fontSize: 14,
    fontWeight: '700',
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },

  benefitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
  },
  benefitCard: {
    width: (SCREEN_WIDTH - 52) / 2,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  benefitIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  benefitDesc: {
    fontSize: 12,
    lineHeight: 17,
  },

  stepsCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    marginBottom: 24,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 4,
  },
  stepNumCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  stepInfo: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  stepLine: {
    width: 2,
    height: 20,
    marginLeft: 17,
    marginVertical: 4,
  },

  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  alertDesc: {
    fontSize: 13,
    lineHeight: 19,
  },

  startBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
  },
  startBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  startBtnText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },

  reviewContent: {
    padding: 24,
    alignItems: 'center',
  },
  reviewPhotoWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  reviewPhotoRing: {
    padding: 4,
    borderRadius: 130,
    marginBottom: 10,
  },
  reviewPhoto: {
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  reviewVideoWrapper: {
    width: Math.min(SCREEN_WIDTH - 48, 360),
    height: Math.min((SCREEN_WIDTH - 48) * 1.2, 430),
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 3,
    backgroundColor: '#000',
    marginBottom: 10,
  },
  reviewVideo: {
    width: '100%',
    height: '100%',
  },
  reviewPhotoLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  reviewInfoCard: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  reviewInfoRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  reviewInfoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewInfoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
  },
  retakeBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  reviewFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  submitBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  submitBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },

  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraTopOverlay: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cameraCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  tipsList: {
    gap: 6,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  tipText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
  },
  faceGuideWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceOval: {
    width: 260,
    height: 340,
    borderRadius: 130,
    borderWidth: 2.5,
    borderColor: 'rgba(76,175,80,0.8)',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  faceOvalCornerTL: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#4CAF50',
    borderTopLeftRadius: 8,
  },
  faceOvalCornerTR: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#4CAF50',
    borderTopRightRadius: 8,
  },
  faceOvalCornerBL: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#4CAF50',
    borderBottomLeftRadius: 8,
  },
  faceOvalCornerBR: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#4CAF50',
    borderBottomRightRadius: 8,
  },
  faceGuideLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 16,
    fontWeight: '500',
  },
  cameraBottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 40,
  },
  captureBtn: {
    marginBottom: 10,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(244,67,54,0.22)',
    marginBottom: 14,
  },
  recordingDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#F44336',
  },
  recordingText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  captureBtnOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.8)',
    padding: 4,
  },
  captureBtnInner: {
    flex: 1,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
  },
});