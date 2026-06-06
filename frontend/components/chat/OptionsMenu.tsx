import React from 'react';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';

type Props = {
  visible: boolean;
  theme: any;
  isDark: boolean;
  screenshotProtection: boolean;
  onClose: () => void;
  onToggleProtection: () => void;
  onOpenTheme: () => void;
  onToggleColorMode: () => void;
  onOpenReport: () => void;
  onBlockUser: () => void;
};

export default function OptionsMenu({
  visible,
  theme,
  isDark,
  screenshotProtection,
  onClose,
  onToggleProtection,
  onOpenTheme,
  onToggleColorMode,
  onOpenReport,
  onBlockUser,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={[styles.optionsMenu, { backgroundColor: theme.background }]}>
          <ThemedText style={[styles.optionsTitle, { color: theme.text }]}>Options</ThemedText>

          <Pressable style={styles.optionItem} onPress={onToggleProtection}>
            <Feather
              name="shield"
              size={22}
              color={screenshotProtection ? '#4CAF50' : theme.text}
            />
            <ThemedText style={[styles.optionText, { color: theme.text }]}>
              {screenshotProtection
                ? 'Disable Screenshot Protection'
                : 'Enable Screenshot Protection'}
            </ThemedText>
            {screenshotProtection && (
              <Feather name="check-circle" size={18} color="#4CAF50" />
            )}
          </Pressable>

          <Pressable style={styles.optionItem} onPress={onOpenTheme}>
            <Feather name="image" size={22} color={theme.primary} />
            <ThemedText style={[styles.optionText, { color: theme.text }]}>Chat Theme</ThemedText>
          </Pressable>

          <Pressable style={styles.optionItem} onPress={onToggleColorMode}>
            <Feather name={isDark ? 'sun' : 'moon'} size={22} color={theme.text} />
            <ThemedText style={[styles.optionText, { color: theme.text }]}>
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </ThemedText>
          </Pressable>

          <Pressable style={styles.optionItem} onPress={onOpenReport}>
            <Feather name="flag" size={22} color="#FF9800" />
            <ThemedText style={[styles.optionText, { color: theme.text }]}>Report User</ThemedText>
          </Pressable>

          <Pressable style={styles.optionItem} onPress={onBlockUser}>
            <Feather name="slash" size={22} color="#F44336" />
            <ThemedText style={[styles.optionText, { color: '#F44336' }]}>Block User</ThemedText>
          </Pressable>

          <Pressable
            style={[styles.cancelButton, { borderColor: theme.textSecondary, marginTop: 16 }]}
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
