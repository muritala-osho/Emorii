import React from 'react';
import {
  Modal,
  View,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';

type Props = {
  visible: boolean;
  theme: any;
  isDark: boolean;
  editText: string;
  submittingEdit: boolean;
  onChangeText: (text: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export default function EditMessageModal({
  visible,
  theme,
  isDark,
  editText,
  submittingEdit,
  onChangeText,
  onClose,
  onSubmit,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          {/* Plain View with onStartShouldSetResponder stops touches from bubbling
              to the outer Pressable, so the modal stays open and the TextInput
              keeps focus on every keystroke (fixes the one-letter-at-a-time bug). */}
          <View
            style={[styles.translateModal, { backgroundColor: theme.background }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.translateHeader}>
              <ThemedText style={[styles.translateTitle, { color: theme.text }]}>
                Edit Message
              </ThemedText>
              <Pressable onPress={onClose}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <TextInput
              style={[
                styles.translateLangInput,
                {
                  color: theme.text,
                  backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5',
                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  minHeight: 80,
                  textAlignVertical: 'top',
                  paddingTop: 12,
                },
              ]}
              value={editText}
              onChangeText={onChangeText}
              multiline
              autoFocus
              placeholderTextColor={theme.textSecondary}
              placeholder="Edit your message..."
            />
            <ThemedText
              style={[
                styles.translatePickLabel,
                { color: theme.textSecondary, fontSize: 11, marginTop: 4 },
              ]}
            >
              Messages can only be edited within 15 minutes of sending
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable
                style={[styles.cancelButton, { flex: 1, borderColor: theme.border }]}
                onPress={onClose}
              >
                <ThemedText style={[styles.cancelButtonText, { color: theme.text }]}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.translateButton,
                  {
                    flex: 1,
                    backgroundColor: editText.trim() ? theme.primary : theme.primary + '55',
                    marginTop: 0,
                  },
                ]}
                onPress={onSubmit}
                disabled={!editText.trim() || submittingEdit}
              >
                {submittingEdit ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Feather name="check" size={18} color="#FFF" />
                    <ThemedText style={styles.translateButtonText}>Save</ThemedText>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  translateModal: { margin: 20, borderRadius: 20, padding: 24, maxHeight: '80%' },
  translateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  translateTitle: { fontSize: 20, fontWeight: '700' },
  translateLangInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    marginBottom: 16,
  },
  translatePickLabel: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  translateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  translateButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: { fontSize: 16, fontWeight: '600' },
});
