import React from 'react';
import { Modal, View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';

const QUICK_REACTIONS = [
  '❤️','😂','😍','😮','😢','🔥','👍','💯','🥰','😭',
  '😤','🤣','💀','🥺','🤩','😎','🙌','👏','💪','🫶',
  '🎉','✨','💅','🤔','😏','🤯','💔','🤍','😇','🥳',
];

type Props = {
  visible: boolean;
  theme: any;
  isDark: boolean;
  selectedMessage: any | null;
  myId: string | null;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onTranslate: () => void;
  onEdit: () => void;
  onReportMessage: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
};

export default function MessageContextMenu({
  visible,
  theme,
  isDark,
  selectedMessage,
  myId,
  onClose,
  onReact,
  onReply,
  onTranslate,
  onEdit,
  onReportMessage,
  onDeleteForMe,
  onDeleteForEveryone,
}: Props) {
  const senderId = selectedMessage
    ? typeof selectedMessage.sender === 'string'
      ? selectedMessage.sender
      : selectedMessage.sender?._id
    : null;
  const isOwn = senderId && String(senderId) === String(myId);
  // Mirror backend rule: only the sender can edit their own text messages,
  // and only within 15 minutes of sending. Hiding the option after the
  // window expires avoids a confusing "Cannot edit" alert later.
  const FIFTEEN_MIN_MS = 15 * 60 * 1000;
  const withinEditWindow = selectedMessage?.createdAt
    ? Date.now() - new Date(selectedMessage.createdAt).getTime() <= FIFTEEN_MIN_MS
    : false;
  const canEdit =
    selectedMessage &&
    isOwn &&
    selectedMessage.type === 'text' &&
    !selectedMessage.deletedForEveryone &&
    withinEditWindow;
  const canReport =
    selectedMessage && !isOwn && !selectedMessage.deletedForEveryone;

  const previewText = selectedMessage
    ? selectedMessage.content ||
      selectedMessage.text ||
      (selectedMessage.type === 'image'
        ? '📷 Photo'
        : selectedMessage.type === 'video'
        ? '🎬 Video'
        : '🎤 Voice')
    : '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={[styles.messageMenuModal, { backgroundColor: theme.background }]}>
          {selectedMessage && (
            <View
              style={[
                styles.messageMenuPreview,
                { backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5' },
              ]}
            >
              <ThemedText
                style={[styles.messageMenuPreviewText, { color: theme.text }]}
                numberOfLines={2}
              >
                {previewText}
              </ThemedText>
            </View>
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickReactionBar}
            contentContainerStyle={{ paddingHorizontal: 8, alignItems: 'center' }}
            scrollEnabled
            onStartShouldSetResponder={() => true}
          >
            {QUICK_REACTIONS.map(emoji => (
              <Pressable
                key={emoji}
                style={styles.quickReactionBtn}
                onPress={() => onReact(emoji)}
              >
                <ThemedText style={styles.quickReactionEmoji}>{emoji}</ThemedText>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable style={styles.messageMenuItem} onPress={onReply}>
            <Feather name="corner-up-left" size={22} color={theme.primary} />
            <ThemedText style={[styles.messageMenuItemText, { color: theme.text }]}>
              Reply
            </ThemedText>
          </Pressable>
          <Pressable style={styles.messageMenuItem} onPress={onTranslate}>
            <MaterialCommunityIcons name="translate" size={22} color={theme.primary} />
            <ThemedText style={[styles.messageMenuItemText, { color: theme.text }]}>
              Translate
            </ThemedText>
          </Pressable>
          {canEdit && (
            <Pressable style={styles.messageMenuItem} onPress={onEdit}>
              <Feather name="edit-3" size={22} color={theme.primary} />
              <ThemedText style={[styles.messageMenuItemText, { color: theme.text }]}>
                Edit Message
              </ThemedText>
            </Pressable>
          )}
          {canReport && (
            <Pressable style={styles.messageMenuItem} onPress={onReportMessage}>
              <Feather name="flag" size={22} color="#F44336" />
              <ThemedText style={[styles.messageMenuItemText, { color: '#F44336' }]}>
                Report Message
              </ThemedText>
            </Pressable>
          )}
          <Pressable style={styles.messageMenuItem} onPress={onDeleteForMe}>
            <Feather name="trash-2" size={22} color="#FF9800" />
            <ThemedText style={[styles.messageMenuItemText, { color: theme.text }]}>
              Delete for Me
            </ThemedText>
          </Pressable>
          {isOwn && (
            <Pressable style={styles.messageMenuItem} onPress={onDeleteForEveryone}>
              <Feather name="trash" size={22} color="#F44336" />
              <ThemedText style={[styles.messageMenuItemText, { color: '#F44336' }]}>
                Delete for Everyone
              </ThemedText>
            </Pressable>
          )}
          <Pressable
            style={[styles.cancelButton, { borderColor: theme.textSecondary, marginTop: 12 }]}
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
  messageMenuModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  messageMenuPreview: { padding: 12, borderRadius: 12, marginBottom: 16 },
  messageMenuPreviewText: { fontSize: 14 },
  quickReactionBar: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
    marginBottom: 4,
  },
  quickReactionBtn: { padding: 6 },
  quickReactionEmoji: { fontSize: 26 },
  messageMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  messageMenuItemText: { fontSize: 16, marginLeft: 16, flex: 1 },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: { fontSize: 16, fontWeight: '600' },
});
