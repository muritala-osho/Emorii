import logger from '@/utils/logger';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import * as Haptics from 'expo-haptics';

interface Prompt {
  _id: string;
  category: string;
  question: string;
  placeholder?: string;
  isAnswered?: boolean;
}

interface PromptResponse {
  _id: string;
  promptId: {
    _id: string;
    question: string;
    category: string;
  };
  answer: string;
  isVisible: boolean;
  order: number;
}

interface ProfilePromptsProps {
  userId?: string;
  isOwnProfile?: boolean;
  onResponsesChange?: (count: number) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  personality: 'Personality',
  lifestyle: 'Lifestyle',
  dating: 'Dating',
  fun: 'Fun',
  deep: 'Deep',
};

const CATEGORY_ICONS: Record<string, string> = {
  personality: 'person',
  lifestyle: 'sunny',
  dating: 'heart',
  fun: 'happy',
  deep: 'bulb',
};

export default function ProfilePrompts({ userId, isOwnProfile = false, onResponsesChange }: ProfilePromptsProps) {
  const { theme } = useTheme();
  const { get, post, put, del } = useApi();
  const { token } = useAuth();
  
  const [responses, setResponses] = useState<PromptResponse[]>([]);
  const [availablePrompts, setAvailablePrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingResponse, setEditingResponse] = useState<PromptResponse | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchResponses = useCallback(async () => {
    if (!token) return;
    try {
      const endpoint = userId 
        ? `/prompts/user/${userId}`
        : '/prompts/my-responses';
      
      const result = await get<{ success: boolean; responses: PromptResponse[] }>(endpoint, token);
      
      if (result.success && result.data?.responses) {
        setResponses(result.data.responses);
        onResponsesChange?.(result.data.responses.length);
      }
    } catch (error) {
      logger.error('Fetch responses error:', error);
    }
  }, [userId, token, get, onResponsesChange]);

  const fetchAvailablePrompts = useCallback(async () => {
    if (!token) return;
    try {
      const result = await get<{ success: boolean; prompts: Prompt[] }>('/prompts/available', token);
      
      if (result.success && result.data?.prompts) {
        setAvailablePrompts(result.data.prompts);
      }
    } catch (error) {
      logger.error('Fetch prompts error:', error);
    }
  }, [token, get]);

  useEffect(() => {
    if (!token || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    
    const loadData = async () => {
      setLoading(true);
      await fetchResponses();
      if (isOwnProfile) {
        await fetchAvailablePrompts();
      }
      setLoading(false);
    };
    loadData();
  }, [token, isOwnProfile]);

  const handleAddPrompt = () => {
    setSelectedPrompt(null);
    setAnswer('');
    setEditingResponse(null);
    setModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleEditResponse = (response: PromptResponse) => {
    setEditingResponse(response);
    setAnswer(response.answer);
    setSelectedPrompt({
      _id: response.promptId._id,
      question: response.promptId.question,
      category: response.promptId.category,
    });
    setModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSelectPrompt = (prompt: Prompt) => {
    setSelectedPrompt(prompt);
    setAnswer('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveAnswer = async () => {
    if (!answer.trim() || !token) {
      Alert.alert('Error', 'Please enter an answer');
      return;
    }

    setSaving(true);
    try {
      if (editingResponse) {
        const result = await put<{ success: boolean }>(
          `/prompts/answer/${editingResponse._id}`,
          { answer: answer.trim() },
          token
        );
        if (result.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setModalVisible(false);
          hasFetchedRef.current = false;
          fetchResponses();
        }
      } else if (selectedPrompt) {
        const result = await post<{ success: boolean }>(
          '/prompts/answer',
          { promptId: selectedPrompt._id, answer: answer.trim() },
          token
        );
        if (result.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setModalVisible(false);
          hasFetchedRef.current = false;
          fetchResponses();
          fetchAvailablePrompts();
        }
      }
    } catch (error) {
      logger.error('Save answer error:', error);
      Alert.alert('Error', 'Failed to save answer');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteResponse = (response: PromptResponse) => {
    Alert.alert(
      'Delete Response',
      'Are you sure you want to remove this prompt from your profile?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              const result = await del<{ success: boolean }>(
                `/prompts/answer/${response._id}`,
                token
              );
              if (result.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                hasFetchedRef.current = false;
                fetchResponses();
                fetchAvailablePrompts();
              }
            } catch (error) {
              logger.error('Delete response error:', error);
              Alert.alert('Error', 'Failed to delete response');
            }
          },
        },
      ]
    );
  };

  const renderResponseCard = ({ item }: { item: PromptResponse }) => (
    <View style={[styles.responseCard, { backgroundColor: theme.card }]}>
      <View style={styles.responseHeader}>
        <View style={[styles.categoryBadge, { backgroundColor: theme.primary + '20' }]}>
          <Ionicons 
            name={CATEGORY_ICONS[item.promptId.category] as any || 'chatbubble'} 
            size={12} 
            color={theme.primary} 
          />
          <Text style={[styles.categoryText, { color: theme.primary }]}>
            {CATEGORY_LABELS[item.promptId.category] || item.promptId.category}
          </Text>
        </View>
        {isOwnProfile && (
          <View style={styles.responseActions}>
            <TouchableOpacity onPress={() => handleEditResponse(item)} style={styles.actionBtn}>
              <Ionicons name="pencil" size={16} color={theme.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteResponse(item)} style={styles.actionBtn}>
              <Ionicons name="trash-outline" size={16} color={theme.error} />
            </TouchableOpacity>
          </View>
        )}
      </View>
      <Text style={[styles.question, { color: theme.text }]}>
        {item.promptId.question}
      </Text>
      <Text style={[styles.answer, { color: theme.textSecondary }]}>
        {item.answer}
      </Text>
    </View>
  );

  const renderPromptOption = ({ item }: { item: Prompt }) => (
    <TouchableOpacity
      style={[
        styles.promptOption,
        { 
          backgroundColor: selectedPrompt?._id === item._id ? theme.primary + '20' : theme.card,
          borderColor: selectedPrompt?._id === item._id ? theme.primary : theme.border,
        },
      ]}
      onPress={() => handleSelectPrompt(item)}
      disabled={item.isAnswered}
    >
      <View style={[styles.promptCategoryBadge, { backgroundColor: theme.primary + '20' }]}>
        <Ionicons 
          name={CATEGORY_ICONS[item.category] as any || 'chatbubble'} 
          size={12} 
          color={theme.primary} 
        />
        <Text style={[styles.categoryText, { color: theme.primary }]}>
          {CATEGORY_LABELS[item.category] || item.category}
        </Text>
      </View>
      <Text style={[styles.promptQuestion, { color: item.isAnswered ? theme.textSecondary : theme.text }]}>
        {item.question}
      </Text>
      {item.isAnswered && (
        <Ionicons name="checkmark-circle" size={20} color={theme.success} style={styles.answeredIcon} />
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Profile Prompts</Text>
        {isOwnProfile && (
          <TouchableOpacity 
            style={[styles.addButton, { backgroundColor: theme.primary }]}
            onPress={handleAddPrompt}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {responses.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: theme.card }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={40} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {isOwnProfile 
              ? 'Add prompts to show your personality!'
              : 'No prompts answered yet'}
          </Text>
          {isOwnProfile && (
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: theme.primary }]}
              onPress={handleAddPrompt}
            >
              <Text style={styles.emptyButtonText}>Add Your First Prompt</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={responses}
          renderItem={renderResponseCard}
          keyExtractor={(item) => item._id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
          edges={['top', 'bottom']}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingResponse ? 'Edit Response' : 'Add Prompt'}
            </Text>
            <TouchableOpacity onPress={handleSaveAnswer} disabled={saving || !selectedPrompt || !answer.trim()}>
              {saving ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Text style={[
                  styles.saveText, 
                  { color: selectedPrompt && answer.trim() ? theme.primary : theme.textSecondary }
                ]}>
                  Save
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {!selectedPrompt && !editingResponse ? (
            <FlatList
              data={availablePrompts.filter(p => !p.isAnswered)}
              renderItem={renderPromptOption}
              keyExtractor={(item) => item._id}
              contentContainerStyle={styles.promptsList}
              ListEmptyComponent={
                <View style={styles.emptyPrompts}>
                  <Ionicons name="checkmark-done" size={48} color={theme.success} />
                  <Text style={[styles.emptyPromptsText, { color: theme.text }]}>
                    You've answered all prompts!
                  </Text>
                </View>
              }
            />
          ) : (
            <View style={styles.answerContainer}>
              <View style={[styles.selectedPromptCard, { backgroundColor: theme.card }]}>
                <Text style={[styles.selectedQuestion, { color: theme.text }]}>
                  {selectedPrompt?.question}
                </Text>
              </View>
              <TextInput
                style={[styles.answerInput, { 
                  backgroundColor: theme.card, 
                  color: theme.text,
                  borderColor: theme.border,
                }]}
                placeholder={selectedPrompt?.placeholder || 'Type your answer...'}
                placeholderTextColor={theme.textSecondary}
                value={answer}
                onChangeText={setAnswer}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />
              <Text style={[styles.charCount, { color: theme.textSecondary }]}>
                {answer.length}/500
              </Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  responseCard: {
    padding: 16,
    borderRadius: 12,
  },
  responseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  responseActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    padding: 4,
  },
  question: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  answer: {
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  cancelText: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
  },
  promptsList: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
  },
  promptOption: {
    minHeight: 88,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  promptCategoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    minHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  promptQuestion: {
    fontSize: 15,
    marginTop: 8,
    lineHeight: 21,
  },
  answeredIcon: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  emptyPrompts: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyPromptsText: {
    fontSize: 16,
    marginTop: 16,
    fontWeight: '500',
  },
  answerContainer: {
    padding: 16,
    flex: 1,
  },
  selectedPromptCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  selectedQuestion: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
  },
  answerInput: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 150,
    borderWidth: 1,
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    marginTop: 8,
  },
});
