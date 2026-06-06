import logger from '@/utils/logger';
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { getApiBaseUrl } from '@/constants/config';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { formatLongDate } from '@/utils/formatters';

type AppealBannedScreenRouteProp = RouteProp<RootStackParamList, 'AppealBanned'>;

interface Props {
  navigation: any;
  route: AppealBannedScreenRouteProp;
}

export default function AppealBannedScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { appealToken, email, banReason, bannedAt, appeal } = route.params;
  
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [appealStatus, setAppealStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [daysUntilReapply, setDaysUntilReapply] = useState(0);

  useEffect(() => {
    if (appeal) {
      setAppealStatus(appeal.status === 'approved' ? 'none' : appeal.status as any);
      
      if (appeal.status === 'rejected' && appeal.lastAppealRejectedAt) {
        const ms = Date.now() - new Date(appeal.lastAppealRejectedAt).getTime();
        const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
        setDaysUntilReapply(Math.max(0, 30 - days));
      }
    }
  }, [appeal]);

  const handleSubmitAppeal = async () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please write your appeal message');
      return;
    }

    if (!appealToken) {
      Alert.alert(
        'No Appeal Token',
        'Please sign in again to get a fresh appeal link and try again.',
        [{ text: 'OK' }]
      );
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/appeal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          appealToken,
          message 
        }),
      });

      const data = await response.json();
      if (data.success) {
        Alert.alert(
          'Appeal Submitted', 
          'Your appeal has been submitted. Our team will review it and you will be notified of the decision.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        setMessage('');
        setAppealStatus('pending');
      } else {
        Alert.alert('Error', data.message || 'Failed to submit appeal');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to submit appeal. Please try again.');
      logger.error('Appeal error:', error);
    } finally {
      setLoading(false);
    }
  };


  const canSubmitAppeal = appealStatus === 'none' || appealStatus === 'approved' ||
    (appealStatus === 'rejected' && daysUntilReapply === 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={28} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Submit Appeal</Text>
            <View style={{ width: 28 }} />
          </View>

          <View style={styles.statusSection}>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    appealStatus === 'pending'
                      ? '#fbbf24'
                      : appealStatus === 'approved'
                      ? '#22c55e'
                      : appealStatus === 'rejected'
                      ? '#ef4444'
                      : '#6b7280',
                },
              ]}
            >
              <Ionicons
                name={
                  appealStatus === 'pending'
                    ? 'hourglass'
                    : appealStatus === 'approved'
                    ? 'checkmark-circle'
                    : appealStatus === 'rejected'
                    ? 'close-circle'
                    : 'alert-circle'
                }
                size={24}
                color="#fff"
              />
              <Text style={styles.statusText}>
                {appealStatus === 'none'
                  ? 'No Active Appeal'
                  : appealStatus === 'pending'
                  ? 'Appeal Pending Review'
                  : appealStatus === 'approved'
                  ? 'Appeal Approved'
                  : 'Appeal Rejected'}
              </Text>
            </View>
          </View>

          <View style={[styles.infoCard, { backgroundColor: theme.surface }]}>
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={20} color={theme.textSecondary} />
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Account</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>{email}</Text>
            </View>
            
            <View style={styles.divider} />
            
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Suspended On</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>{formatLongDate(bannedAt)}</Text>
            </View>
            
            <View style={styles.divider} />
            
            <View style={styles.infoRow}>
              <Ionicons name="alert-circle-outline" size={20} color={theme.textSecondary} />
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Reason</Text>
              <Text style={[styles.infoValue, { color: theme.text }]} numberOfLines={2}>
                {banReason || 'Violation of community guidelines'}
              </Text>
            </View>
          </View>

          {appealStatus === 'pending' && (
            <View style={[styles.pendingCard, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="time-outline" size={24} color="#d97706" />
              <Text style={styles.pendingText}>
                Your appeal is currently being reviewed. We will notify you once a decision has been made.
              </Text>
            </View>
          )}

          {appealStatus === 'rejected' && daysUntilReapply > 0 && (
            <View style={[styles.pendingCard, { backgroundColor: '#fee2e2' }]}>
              <Ionicons name="close-circle-outline" size={24} color="#dc2626" />
              <Text style={styles.pendingText}>
                Your previous appeal was rejected. You can submit a new appeal in {daysUntilReapply} days.
              </Text>
            </View>
          )}

          {canSubmitAppeal && (
            <View style={styles.formSection}>
              <Text style={[styles.formTitle, { color: theme.text }]}>
                Write Your Appeal
              </Text>
              <Text style={[styles.formSubtitle, { color: theme.textSecondary }]}>
                Explain why you believe your account should be reinstated. Be specific and honest.
              </Text>
              
              <TextInput
                style={[
                  styles.textArea,
                  { 
                    backgroundColor: theme.surface, 
                    color: theme.text,
                    borderColor: theme.border
                  },
                ]}
                placeholder="Write your appeal message here..."
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={8}
                maxLength={1000}
                value={message}
                onChangeText={setMessage}
                textAlignVertical="top"
              />
              
              <Text style={[styles.charCount, { color: theme.textSecondary }]}>
                {message.length}/1000 characters
              </Text>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  { backgroundColor: theme.primary },
                  loading && styles.disabledButton,
                ]}
                onPress={handleSubmitAppeal}
                disabled={loading || !message.trim()}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={20} color="#fff" />
                    <Text style={styles.submitButtonText}>Submit Appeal</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.tipsSection}>
            <Text style={[styles.tipsTitle, { color: theme.text }]}>
              Tips for a Successful Appeal
            </Text>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
              <Text style={[styles.tipText, { color: theme.textSecondary }]}>
                Be honest about what happened
              </Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
              <Text style={[styles.tipText, { color: theme.textSecondary }]}>
                Acknowledge any mistakes you made
              </Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
              <Text style={[styles.tipText, { color: theme.textSecondary }]}>
                Explain how you'll follow the guidelines
              </Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
              <Text style={[styles.tipText, { color: theme.textSecondary }]}>
                Be respectful and professional
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  statusSection: {
    alignItems: 'center',
    marginVertical: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoLabel: {
    fontSize: 14,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    marginVertical: 12,
  },
  pendingCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  pendingText: {
    flex: 1,
    fontSize: 14,
    color: '#92400e',
  },
  formSection: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 160,
  },
  charCount: {
    textAlign: 'right',
    marginTop: 8,
    fontSize: 12,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  tipsSection: {
    marginHorizontal: 16,
    marginTop: 32,
    marginBottom: 32,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  tipText: {
    fontSize: 14,
  },
});
