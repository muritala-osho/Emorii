import React from 'react';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from '../../utils/expoAvCompat';
import { ThemedText } from '@/components/ThemedText';

type Props = {
  videoUri: string | null;
  viewOnceActive: boolean;
  viewOnceCountdown: number;
  onClose: () => void;
  onSave: (uri: string) => void;
};

export default function VideoViewerModal({
  videoUri,
  viewOnceActive,
  viewOnceCountdown,
  onClose,
  onSave,
}: Props) {
  return (
    <Modal
      visible={!!videoUri}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.imageViewerOverlay}>
        <Pressable style={styles.imageViewerClose} onPress={onClose}>
          <Feather name="x" size={28} color="#FFF" />
        </Pressable>
        {viewOnceActive ? (
          <View style={styles.imageViewerActions}>
            <View
              style={[
                styles.imageViewerActionBtn,
                { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
              ]}
            >
              <Ionicons name="eye-outline" size={18} color="#FF6B6B" />
              <ThemedText style={{ color: '#FF6B6B', fontSize: 13, fontWeight: '700' }}>
                View Once · Closes in {viewOnceCountdown}s
              </ThemedText>
            </View>
          </View>
        ) : (
          <View style={styles.imageViewerActions}>
            <Pressable
              style={styles.imageViewerActionBtn}
              onPress={() => videoUri && onSave(videoUri)}
            >
              <Ionicons name="download-outline" size={24} color="#FFF" />
            </Pressable>
          </View>
        )}
        {videoUri && (
          <Video
            source={{ uri: videoUri }}
            style={{ width: '100%', height: '80%' }}
            useNativeControls={!viewOnceActive}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping={false}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  imageViewerActions: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    flexDirection: 'row',
    gap: 16,
  },
  imageViewerActionBtn: { padding: 8 },
});
