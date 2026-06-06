import React from 'react';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';

const LIVE_OPTIONS = [
  { mins: 15, label: 'Live · 15 minutes' },
  { mins: 60, label: 'Live · 1 hour' },
  { mins: 480, label: 'Live · 8 hours' },
];

type Props = {
  visible: boolean;
  theme: any;
  onClose: () => void;
  onSendCurrent: () => void;
  onShareLive: (minutes: number) => void;
};

export default function LiveLocationPicker({
  visible,
  theme,
  onClose,
  onSendCurrent,
  onShareLive,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={[styles.optionsMenu, { backgroundColor: theme.background }]}>
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <ThemedText style={[styles.optionsTitle, { color: theme.text, marginBottom: 0 }]}>
              Share Location
            </ThemedText>
            <ThemedText
              style={{
                color: theme.textSecondary,
                fontSize: 12,
                textAlign: 'center',
                marginTop: 6,
                paddingHorizontal: 8,
              }}
            >
              Send your current spot, or share live for a set time.
            </ThemedText>
          </View>
          <Pressable style={styles.optionItem} onPress={onSendCurrent}>
            <Feather name="map-pin" size={22} color="#45B7D1" />
            <ThemedText style={[styles.optionText, { color: theme.text }]}>
              Send current location
            </ThemedText>
          </Pressable>
          <View
            style={{
              height: 1,
              backgroundColor: theme.textSecondary + '20',
              marginVertical: 6,
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              marginBottom: 4,
            }}
          >
            <View
              style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#dc2626' }}
            />
            <ThemedText
              style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}
            >
              LIVE — updates in real time
            </ThemedText>
          </View>
          {LIVE_OPTIONS.map(opt => (
            <Pressable
              key={opt.mins}
              style={styles.optionItem}
              onPress={() => onShareLive(opt.mins)}
            >
              <Feather name="radio" size={22} color="#dc2626" />
              <ThemedText style={[styles.optionText, { color: theme.text }]}>
                {opt.label}
              </ThemedText>
            </Pressable>
          ))}
          <Pressable
            style={[styles.cancelButton, { borderColor: theme.textSecondary, marginTop: 8 }]}
            onPress={onClose}
          >
            <ThemedText style={[styles.cancelButtonText, { color: theme.text }]}>Cancel</ThemedText>
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
  optionsMenu: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  optionsTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  optionText: { fontSize: 16, marginLeft: 16, flex: 1 },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: { fontSize: 16, fontWeight: '600' },
});
