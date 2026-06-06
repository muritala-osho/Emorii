import logger from '@/utils/logger';
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

interface QuizOption {
  text: string;
  value: number;
}

interface QuizQuestion {
  _id: string;
  question: string;
  category: string;
  options: QuizOption[];
  weight: number;
}

interface QuizResponse {
  questionId: string;
  selectedOption: QuizOption;
}

const categoryIcons: { [key: string]: string } = {
  lifestyle: 'leaf-outline',
  values: 'heart-outline',
  personality: 'person-outline',
  relationship: 'people-outline',
  future: 'rocket-outline',
};

const categoryColors: { [key: string]: string } = {
  lifestyle: '#4CAF50',
  values: '#E91E63',
  personality: '#9C27B0',
  relationship: '#FF9800',
  future: '#2196F3',
};

export default function CompatibilityQuizScreen({ navigation }: any) {
  const { theme } = useTheme();
  const api = useApi();
  const { token } = useAuth();
  
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<QuizResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slideAnim] = useState(new Animated.Value(0));
  const [progressAnim] = useState(new Animated.Value(0));
  const [quizResults, setQuizResults] = useState<{
    personalityType: string;
    categoryBreakdown: { category: string; score: number; label: string }[];
  } | null>(null);

  useEffect(() => {
    fetchQuestions();
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: questions.length > 0 ? (currentIndex + 1) / questions.length : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [currentIndex, questions.length]);

  const fetchQuestions = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get<{ success: boolean; questions: QuizQuestion[] }>('/quiz/questions', token);
      
      if (response.success && response.data?.questions && response.data.questions.length > 0) {
        setQuestions(response.data.questions);
      } else {
        await api.post('/quiz/seed', {}, token);
        const retry = await api.get<{ success: boolean; questions: QuizQuestion[] }>('/quiz/questions', token);
        if (retry.success && retry.data?.questions) {
          setQuestions(retry.data.questions);
        }
      }
    } catch (err) {
      logger.error('Failed to fetch quiz questions:', err);
      setError('Failed to load quiz. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = useCallback((option: QuizOption) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    const currentQuestion = questions[currentIndex];
    const newResponses = [...responses];
    const existingIndex = newResponses.findIndex(
      r => r.questionId === currentQuestion._id
    );
    
    if (existingIndex >= 0) {
      newResponses[existingIndex].selectedOption = option;
    } else {
      newResponses.push({
        questionId: currentQuestion._id,
        selectedOption: option,
      });
    }
    
    setResponses(newResponses);
    
    if (currentIndex < questions.length - 1) {
      Animated.sequence([
        Animated.timing(slideAnim, {
          toValue: -width,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentIndex(currentIndex + 1);
      });
    }
  }, [currentIndex, questions, responses, slideAnim]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const handleSubmit = async () => {
    if (responses.length < questions.length) {
      setError('Please answer all questions before submitting.');
      return;
    }

    if (!token) return;

    try {
      setSubmitting(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      const response = await api.post<{
        success: boolean;
        personalityType?: string;
        categoryBreakdown?: { category: string; score: number; label: string }[];
        message?: string;
      }>('/quiz/submit', { responses }, token);
      
      if (response.success && response.data) {
        setQuizResults({
          personalityType: response.data.personalityType || 'Balanced',
          categoryBreakdown: response.data.categoryBreakdown || []
        });
        setCompleted(true);
      } else {
        setError(response.message || 'Failed to submit quiz');
      }
    } catch (err) {
      logger.error('Failed to submit quiz:', err);
      setError('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading quiz...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (completed && quizResults) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={styles.resultsContainer}>
          <View style={[styles.completedIcon, { backgroundColor: theme.primary + '20' }]}>
            <Ionicons name="sparkles" size={60} color={theme.primary} />
          </View>
          <Text style={[styles.completedTitle, { color: theme.text }]}>
            Your Results!
          </Text>
          
          <View style={[styles.personalityCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.personalityLabel, { color: theme.textSecondary }]}>
              Your Personality Type
            </Text>
            <Text style={[styles.personalityType, { color: theme.primary }]}>
              {quizResults.personalityType}
            </Text>
          </View>

          <Text style={[styles.breakdownTitle, { color: theme.text }]}>
            Category Breakdown
          </Text>
          
          {quizResults.categoryBreakdown.map((item, index) => (
            <View key={index} style={[styles.categoryCard, { backgroundColor: theme.surface }]}>
              <View style={styles.categoryHeader}>
                <Ionicons
                  name={categoryIcons[item.category] as any || 'help-circle-outline'}
                  size={20}
                  color={categoryColors[item.category] || theme.primary}
                />
                <Text style={[styles.categoryName, { color: theme.text }]}>
                  {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                </Text>
              </View>
              <Text style={[styles.categoryLabel, { color: categoryColors[item.category] || theme.primary }]}>
                {item.label}
              </Text>
              <View style={[styles.scoreBar, { backgroundColor: theme.border }]}>
                <View 
                  style={[
                    styles.scoreBarFill, 
                    { 
                      backgroundColor: categoryColors[item.category] || theme.primary,
                      width: `${(item.score / 5) * 100}%`
                    }
                  ]} 
                />
              </View>
            </View>
          ))}

          <Text style={[styles.resultsHint, { color: theme.textSecondary }]}>
            Your compatibility with other users will be calculated based on these results.
          </Text>

          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: theme.primary }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.doneButtonText}>Back to Profile</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const currentQuestion = questions[currentIndex];
  const currentResponse = responses.find(r => r.questionId === currentQuestion?._id);
  const isLastQuestion = currentIndex === questions.length - 1;
  const categoryColor = categoryColors[currentQuestion?.category] || theme.primary;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: theme.primary,
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: theme.textSecondary }]}>
            {currentIndex + 1} of {questions.length}
          </Text>
        </View>
      </View>

      <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '20' }]}>
        <Ionicons
          name={categoryIcons[currentQuestion?.category] as any || 'help-circle-outline'}
          size={16}
          color={categoryColor}
        />
        <Text style={[styles.categoryText, { color: categoryColor }]}>
          {currentQuestion?.category?.charAt(0).toUpperCase() + currentQuestion?.category?.slice(1)}
        </Text>
      </View>

      <Animated.View
        style={[
          styles.questionContainer,
          { transform: [{ translateX: slideAnim }] },
        ]}
      >
        <Text style={[styles.question, { color: theme.text }]}>
          {currentQuestion?.question}
        </Text>
      </Animated.View>

      <ScrollView style={styles.optionsContainer} showsVerticalScrollIndicator={false}>
        {currentQuestion?.options.map((option, index) => {
          const isSelected = currentResponse?.selectedOption.value === option.value;
          
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.optionButton,
                {
                  backgroundColor: isSelected ? theme.primary + '15' : theme.surface,
                  borderColor: isSelected ? theme.primary : theme.border,
                },
              ]}
              onPress={() => handleSelectOption(option)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.optionRadio,
                  {
                    borderColor: isSelected ? theme.primary : theme.border,
                    backgroundColor: isSelected ? theme.primary : 'transparent',
                  },
                ]}
              >
                {isSelected && (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                )}
              </View>
              <Text
                style={[
                  styles.optionText,
                  {
                    color: isSelected ? theme.primary : theme.text,
                    fontWeight: isSelected ? '600' : '400',
                  },
                ]}
              >
                {option.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {error && (
        <View style={[styles.errorContainer, { backgroundColor: '#F4433620' }]}>
          <Text style={[styles.errorText, { color: '#F44336' }]}>{error}</Text>
        </View>
      )}

      <View style={styles.navigation}>
        <TouchableOpacity
          style={[
            styles.navButton,
            {
              backgroundColor: currentIndex > 0 ? theme.surface : theme.border,
              opacity: currentIndex > 0 ? 1 : 0.5,
            },
          ]}
          onPress={handlePrevious}
          disabled={currentIndex === 0}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
          <Text style={[styles.navButtonText, { color: theme.text }]}>Back</Text>
        </TouchableOpacity>

        {isLastQuestion && currentResponse ? (
          <TouchableOpacity
            style={[
              styles.submitButton,
              { backgroundColor: theme.primary, opacity: submitting ? 0.7 : 1 },
            ]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.submitButtonText}>Submit Quiz</Text>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.skipHint}>
            <Text style={[styles.skipHintText, { color: theme.textSecondary }]}>
              Select an answer to continue
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    padding: 8,
  },
  progressContainer: {
    flex: 1,
    marginLeft: 12,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginVertical: 16,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  questionContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  question: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
  },
  optionsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 12,
  },
  optionRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionText: {
    fontSize: 16,
    flex: 1,
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  skipHint: {
    flex: 1,
    alignItems: 'flex-end',
  },
  skipHintText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  completedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  completedIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  completedTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
  },
  completedSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  doneButton: {
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 24,
    marginTop: 20,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  resultsContainer: {
    alignItems: 'center',
    padding: 24,
    paddingBottom: 40,
  },
  personalityCard: {
    width: '100%',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginVertical: 20,
  },
  personalityLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  personalityType: {
    fontSize: 28,
    fontWeight: '700',
  },
  breakdownTitle: {
    fontSize: 20,
    fontWeight: '600',
    alignSelf: 'flex-start',
    marginBottom: 16,
    marginTop: 8,
  },
  categoryCard: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  scoreBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  resultsHint: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 20,
  },
});
