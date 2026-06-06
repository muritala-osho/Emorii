import React from 'react';
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';

type ReportReason = { id: string; label: string; icon: string };

type Props = {
  visible: boolean;
  theme: any;
  isDark: boolean;
  userName: string;
  isReportingMessage: boolean;
  reasons: ReportReason[];
  selectedReportReason: string | null;
  reportDetails: string;
  submittingReport: boolean;
  onClose: () => void;
  onSelectReason: (id: string) => void;
  onChangeDetails: (text: string) => void;
  onSubmit: () => void;
};

export default function ReportModal({
  visible,
  theme,
  isDark,
  userName,
  isReportingMessage,
  reasons,
  selectedReportReason,
  reportDetails,
  submittingReport,
  onClose,
  onSelectReason,
  onChangeDetails,
  onSubmit,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.reportModal, { backgroundColor: theme.background }]}>
          <View style={styles.reportHeader}>
            <ThemedText style={[styles.reportTitle, { color: theme.text }]}>
              {isReportingMessage ? 'Report Image' : `Report ${userName}`}
            </ThemedText>
            <Pressable onPress={onClose}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>

          <ThemedText style={[styles.reportSubtitle, { color: theme.textSecondary }]}>
            Why are you reporting this {isReportingMessage ? 'image' : 'user'}?
          </ThemedText>

          <ScrollView style={styles.reportReasons}>
            {reasons.map(reason => (
              <Pressable
                key={reason.id}
                style={[
                  styles.reportReasonItem,
                  selectedReportReason === reason.id && {
                    backgroundColor: theme.primary + '20',
                    borderColor: theme.primary,
                  },
                  {
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  },
                ]}
                onPress={() => onSelectReason(reason.id)}
              >
                <Feather
                  name={reason.icon as any}
                  size={20}
                  color={selectedReportReason === reason.id ? theme.primary : theme.text}
                />
                <ThemedText style={[styles.reportReasonText, { color: theme.text }]}>
                  {reason.label}
                </ThemedText>
                {selectedReportReason === reason.id && (
                  <Feather name="check-circle" size={20} color={theme.primary} />
                )}
              </Pressable>
            ))}
          </ScrollView>

          <TextInput
            style={[
              styles.reportInput,
              {
                color: theme.text,
                backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              },
            ]}
            placeholder="Add more details (optional)"
            placeholderTextColor={theme.textSecondary}
            value={reportDetails}
            onChangeText={onChangeDetails}
            multiline
            numberOfLines={3}
          />

          <Pressable
            style={[
              styles.submitReportButton,
              { backgroundColor: theme.primary, opacity: selectedReportReason ? 1 : 0.5 },
            ]}
            onPress={onSubmit}
            disabled={!selectedReportReason || submittingReport}
          >
            {submittingReport ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <ThemedText style={styles.submitReportText}>Submit Report</ThemedText>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reportModal: { margin: 20, borderRadius: 20, padding: 24, maxHeight: '80%' },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportTitle: { fontSize: 20, fontWeight: '700' },
  reportSubtitle: { fontSize: 14, marginBottom: 20 },
  reportReasons: { maxHeight: 280 },
  reportReasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  reportReasonText: { flex: 1, marginLeft: 12, fontSize: 15 },
  reportInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    marginTop: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitReportButton: {
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitReportText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
