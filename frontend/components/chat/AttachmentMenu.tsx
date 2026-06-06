import React from 'react';
import { Modal, View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';

type Props = {
  visible: boolean;
  theme: any;
  viewOnceMode: boolean;
  isSendingLocation: boolean;
  onClose: () => void;
  onToggleViewOnce: () => void;
  onTakePhoto: () => void;
  onPickImage: () => void;
  onPickVideo: () => void;
  onOpenLivePicker: () => void;
};

export default function AttachmentMenu({
  visible,
  theme,
  viewOnceMode,
  isSendingLocation,
  onClose,
  onToggleViewOnce,
  onTakePhoto,
  onPickImage,
  onPickVideo,
  onOpenLivePicker,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={[styles.attachmentMenu, { backgroundColor: theme.background }]}>
          <ThemedText style={[styles.attachmentTitle, { color: theme.text }]}>
            Send Attachment
          </ThemedText>

          <Pressable
            style={[
              styles.viewOnceToggleRow,
              viewOnceMode && { backgroundColor: '#FF6B6B12', borderColor: '#FF6B6B40' },
            ]}
            onPress={onToggleViewOnce}
          >
            <View style={styles.viewOnceToggleLeft}>
              <Ionicons
                name="eye-outline"
                size={18}
                color={viewOnceMode ? '#FF6B6B' : theme.textSecondary}
              />
              <View>
                <ThemedText
                  style={[
                    styles.viewOnceToggleTitle,
                    { color: viewOnceMode ? '#FF6B6B' : theme.text },
                  ]}
                >
                  View Once
                </ThemedText>
                <ThemedText
                  style={[styles.viewOnceToggleDesc, { color: theme.textSecondary }]}
                >
                  Photo/video disappears after being opened
                </ThemedText>
              </View>
            </View>
            <View
              style={[
                styles.viewOnceTogglePill,
                { backgroundColor: viewOnceMode ? '#FF6B6B' : theme.border },
              ]}
            >
              <ThemedText style={styles.viewOnceTogglePillText}>
                {viewOnceMode ? 'ON' : 'OFF'}
              </ThemedText>
            </View>
          </Pressable>

          <View style={styles.attachmentOptions}>
            <Pressable style={styles.attachmentOption} onPress={onTakePhoto}>
              <View style={[styles.attachmentIcon, { backgroundColor: '#FF6B6B20' }]}>
                <Feather name="camera" size={24} color="#FF6B6B" />
              </View>
              <ThemedText style={[styles.attachmentLabel, { color: theme.text }]}>
                Camera
              </ThemedText>
            </Pressable>
            <Pressable style={styles.attachmentOption} onPress={onPickImage}>
              <View style={[styles.attachmentIcon, { backgroundColor: '#4ECDC420' }]}>
                <Feather name="image" size={24} color="#4ECDC4" />
              </View>
              <ThemedText style={[styles.attachmentLabel, { color: theme.text }]}>
                Gallery
              </ThemedText>
            </Pressable>
            <Pressable style={styles.attachmentOption} onPress={onPickVideo}>
              <View style={[styles.attachmentIcon, { backgroundColor: '#9B59B620' }]}>
                <Feather name="video" size={24} color="#9B59B6" />
              </View>
              <ThemedText style={[styles.attachmentLabel, { color: theme.text }]}>
                Video
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.attachmentOption, isSendingLocation && { opacity: 0.5 }]}
              onPress={onOpenLivePicker}
              disabled={isSendingLocation}
            >
              <View style={[styles.attachmentIcon, { backgroundColor: '#45B7D120' }]}>
                {isSendingLocation ? (
                  <ActivityIndicator size="small" color="#45B7D1" />
                ) : (
                  <Feather name="map-pin" size={24} color="#45B7D1" />
                )}
              </View>
              <ThemedText style={[styles.attachmentLabel, { color: theme.text }]}>
                {isSendingLocation ? 'Getting…' : 'Location'}
              </ThemedText>
            </Pressable>
          </View>

          <Pressable
            style={[styles.cancelButton, { borderColor: theme.textSecondary }]}
            onPress={onClose}
          >
            <ThemedText style={[styles.cancelButtonText, { color: theme.text }]}>
              Cancel
            </ThemedText>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  attachmentMenu: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  attachmentTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  attachmentOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  attachmentOption: { alignItems: 'center' },
  attachmentIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  attachmentLabel: { fontSize: 14, fontWeight: '500' },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: { fontSize: 16, fontWeight: '600' },
  viewOnceToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 12,
  },
  viewOnceToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewOnceToggleTitle: { fontSize: 13, fontWeight: '700' },
  viewOnceToggleDesc: { fontSize: 11, marginTop: 1 },
  viewOnceTogglePill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  viewOnceTogglePillText: { fontSize: 10, fontWeight: '800', color: '#fff' },
});
