import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { VerificationBadge } from '@/components/VerificationBadge';

type Props = {
  theme: any;
  isDark: boolean;
  photoSource: any;
  userName: string;
  otherUserVerified: boolean;
  isOnline: boolean;
  isTyping: boolean;
  isOtherRecording: boolean;
  statusText: string;
  onBack: () => void;
  onProfilePress: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onOpenOptions: () => void;
};

export default function ChatHeader({
  theme,
  isDark,
  photoSource,
  userName,
  otherUserVerified,
  isOnline,
  isTyping,
  isOtherRecording,
  statusText,
  onBack,
  onProfilePress,
  onVoiceCall,
  onVideoCall,
  onOpenOptions,
}: Props) {
  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: isDark ? '#0D1117' : '#FFFFFF',
          borderBottomColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
          shadowColor: isDark ? '#000' : '#000',
        },
      ]}
    >
      <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
        <Ionicons name="chevron-back" size={26} color={theme.text} />
      </Pressable>

      <Pressable style={styles.headerProfile} onPress={onProfilePress}>
        <View style={styles.avatarContainer}>
          <View style={[
            styles.avatarRing,
            { borderColor: isOnline ? '#22C55E' : isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }
          ]}>
            <Image
              source={photoSource || require('../../assets/icon.png')}
              style={styles.headerAvatar}
              contentFit="cover"
            />
          </View>
          {isOnline && (
            <View style={styles.onlineIndicatorWrap}>
              <View style={styles.onlineIndicator} />
            </View>
          )}
        </View>
        <View style={styles.headerInfo}>
          <View style={styles.nameRow}>
            <ThemedText style={[styles.headerName, { color: theme.text }]} numberOfLines={1}>
              {userName}
            </ThemedText>
            {otherUserVerified && <View style={{ marginLeft: 5 }}><VerificationBadge size={14} /></View>}
          </View>
          <ThemedText
            style={[
              styles.headerStatus,
              {
                color: isOtherRecording
                  ? '#F44336'
                  : isTyping
                  ? theme.primary
                  : isOnline
                  ? '#22C55E'
                  : isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.35)',
                fontWeight: (isTyping || isOtherRecording) ? '500' : '400',
              },
            ]}
          >
            {statusText}
          </ThemedText>
        </View>
      </Pressable>

      <View style={styles.headerActions}>
        <Pressable
          onPress={onVoiceCall}
          style={[styles.headerActionButton, { backgroundColor: theme.primary + '16' }]}
          hitSlop={4}
        >
          <Feather name="phone" size={19} color={theme.primary} />
        </Pressable>
        <Pressable
          onPress={onVideoCall}
          style={[styles.headerActionButton, { backgroundColor: '#0EA5E9' + '16' }]}
          hitSlop={4}
        >
          <Feather name="video" size={19} color="#0EA5E9" />
        </Pressable>
        <Pressable onPress={onOpenOptions} style={styles.moreButton} hitSlop={4}>
          <Feather name="more-vertical" size={21} color={isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: { padding: 8, marginRight: 2 },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 2 },
  avatarContainer: { position: 'relative' },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  onlineIndicatorWrap: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22C55E',
    borderWidth: 2.5,
    borderColor: '#0D1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFF',
  },
  headerInfo: { marginLeft: 10, flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  headerName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  headerStatus: { fontSize: 12, marginTop: 2, letterSpacing: 0.1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 },
  headerActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
