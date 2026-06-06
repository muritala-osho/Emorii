import logger from '@/utils/logger';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useApi } from '../hooks/useApi';
import * as Haptics from 'expo-haptics';

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

interface CompatibilityQuizProps {
  onComplete?: () => void;
  onClose?: () => void;
}

const { width } = Dimensions.get('window');

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

export const CompatibilityQuiz: React.FC<CompatibilityQuizProps> = ({
  onComplete,
  onClose,
}) => {
  const { theme } = useTheme();
  const colors = theme;
  const api = useApi();
  
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<QuizResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slideAnim] = useState(new Animated.Value(0));
  const [progressAnim] = useState(new Animated.Value(0));

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
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get('/api/quiz/questions');
      
      if (response.success && response.questions.length > 0) {
        setQuestions(response.questions);
      } else {
        await api.post('/api/quiz/seed', {});
        const retry = await api.get('/api/quiz/questions');
        if (retry.success) {
          setQuestions(retry.questions);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const handleSubmit = async () => {
    if (responses.length < questions.length) {
      setError('Please answer all questions before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      const response = await api.post('/api/quiz/submit', { responses });
      
      if (response.success) {
        setCompleted(true);
        setTimeout(() => {
          onComplete?.();
        }, 2000);
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

  const getCurrentResponse = () => {
    const currentQuestion = questions[currentIndex];
    return responses.find(r => r.questionId === currentQuestion?._id);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading quiz...
        </Text>
      </View>
    );
  }

  if (completed) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.completedContainer}>
          <View style={[styles.completedIcon, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="checkmark-circle" size={80} color={colors.primary} />
          </View>
          <Text style={[styles.completedTitle, { color: colors.text }]}>
            Quiz Complete!
          </Text>
          <Text style={[styles.completedSubtitle, { color: colors.textSecondary }]}>
            Your compatibility scores will now be calculated with other users who have also completed the quiz.
          </Text>
          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: colors.primary }]}
            onPress={onClose}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>
          No questions available. Please try again later.
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={fetchQuestions}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentQuestion = questions[currentIndex];
  const currentResponse = getCurrentResponse();
  const isLastQuestion = currentIndex === questions.length - 1;
  const categoryColor = categoryColors[currentQuestion.category] || colors.primary;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary,
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {currentIndex + 1} of {questions.length}
          </Text>
        </View>
      </View>

      {/* Category Badge */}
      <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '20' }]}>
        <Ionicons
          name={categoryIcons[currentQuestion.category] as any}
          size={16}
          color={categoryColor}
        />
        <Text style={[styles.categoryText, { color: categoryColor }]}>
          {currentQuestion.category.charAt(0).toUpperCase() + currentQuestion.category.slice(1)}
        </Text>
      </View>

      {/* Question */}
      <Animated.View
        style={[
          styles.questionContainer,
          { transform: [{ translateX: slideAnim }] },
        ]}
      >
        <Text style={[styles.question, { color: colors.text }]}>
          {currentQuestion.question}
        </Text>
      </Animated.View>

      {/* Options */}
      <ScrollView style={styles.optionsContainer} showsVerticalScrollIndicator={false}>
        {currentQuestion.options.map((option, index) => {
          const isSelected = currentResponse?.selectedOption.value === option.value;
          
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.optionButton,
                {
                  backgroundColor: isSelected ? colors.primary + '15' : colors.card,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
              onPress={() => handleSelectOption(option)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.optionRadio,
                  {
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary : 'transparent',
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
                    color: isSelected ? colors.primary : colors.text,
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

      {/* Error Message */}
      {error && (
        <View style={[styles.errorContainer, { backgroundColor: colors.error + '15' }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      )}

      {/* Navigation */}
      <View style={styles.navigation}>
        <TouchableOpacity
          style={[
            styles.navButton,
            {
              backgroundColor: currentIndex > 0 ? colors.card : colors.border,
              opacity: currentIndex > 0 ? 1 : 0.5,
            },
          ]}
          onPress={handlePrevious}
          disabled={currentIndex === 0}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
          <Text style={[styles.navButtonText, { color: colors.text }]}>Back</Text>
        </TouchableOpacity>

        {isLastQuestion && currentResponse ? (
          <TouchableOpacity
            style={[
              styles.submitButton,
              { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 },
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
            <Text style={[styles.skipHintText, { color: colors.textSecondary }]}>
              Select an answer to continue
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

interface CompatibilityScoreProps {
  userId: string;
  compact?: boolean;
}

export const CompatibilityScore: React.FC<CompatibilityScoreProps> = ({
  userId,
  compact = false,
}) => {
  const { theme } = useTheme();
  const colors = theme;
  const api = useApi();
  
  const [compatibility, setCompatibility] = useState<number | null>(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ [key: string]: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsQuiz, setNeedsQuiz] = useState(false);
  const [notAvailable, setNotAvailable] = useState(false);

  useEffect(() => {
    fetchCompatibility();
  }, [userId]);

  const fetchCompatibility = async () => {
    try {
      setLoading(true);
      const endpoint = userId.startsWith('/api') ? userId.replace('/api', '') : `/quiz/compatibility/${userId}`;
      const response = await api.get(endpoint);
      
      if (response.success) {
        if (response.compatibility !== null) {
          setCompatibility(response.compatibility);
          setCategoryBreakdown(response.categoryBreakdown);
        } else {
          setNotAvailable(true);
        }
      } else if (response.needsQuiz) {
        setNeedsQuiz(true);
      }
    } catch (err) {
      logger.error('Failed to fetch compatibility:', err);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#8BC34A';
    if (score >= 40) return '#FFC107';
    if (score >= 20) return '#FF9800';
    return '#F44336';
  };

  if (loading) {
    return (
      <View style={[styles.scoreContainer, compact && styles.scoreContainerCompact]}>
        <ActivityIndicator size="small" color={colors?.primary || '#FF6B6B'} />
      </View>
    );
  }

  if (needsQuiz) {
    return (
      <View style={[styles.scoreContainer, compact && styles.scoreContainerCompact, { backgroundColor: colors?.card || '#fff' }]}>
        <Ionicons name="help-circle-outline" size={compact ? 16 : 20} color={colors?.textSecondary || '#666'} />
        <Text style={[styles.scoreLabel, { color: colors?.textSecondary || '#666', fontSize: compact ? 10 : 12 }]}>
          Take quiz to see
        </Text>
      </View>
    );
  }

  if (notAvailable) {
    return (
      <View style={[styles.scoreContainer, compact && styles.scoreContainerCompact, { backgroundColor: colors?.card || '#fff' }]}>
        <Ionicons name="time-outline" size={compact ? 16 : 20} color={colors?.textSecondary || '#666'} />
        <Text style={[styles.scoreLabel, { color: colors?.textSecondary || '#666', fontSize: compact ? 10 : 12 }]}>
          Quiz pending
        </Text>
      </View>
    );
  }

  if (compatibility === null) return null;

  const scoreColor = getScoreColor(compatibility);

  if (compact) {
    return (
      <View style={[styles.scoreContainerCompact, { backgroundColor: scoreColor + '20' }]}>
        <Ionicons name="heart" size={12} color={scoreColor} />
        <Text style={[styles.scoreValueCompact, { color: scoreColor }]}>
          {compatibility}%
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.scoreCard, { backgroundColor: colors.card || colors.surface }]}>
      <View style={styles.scoreHeader}>
        <Ionicons name="heart-circle" size={24} color={scoreColor} />
        <Text style={[styles.scoreTitle, { color: colors.text }]}>
          Compatibility
        </Text>
        <View style={[styles.scoreBadge, { backgroundColor: scoreColor + '20' }]}>
          <Text style={[styles.scoreBadgeText, { color: scoreColor }]}>
            {compatibility >= 80 ? 'Great Match!' : compatibility >= 60 ? 'Good Match' : compatibility >= 40 ? 'Okay' : 'Low'}
          </Text>
        </View>
      </View>
      
      <View style={styles.scoreMain}>
        <Text style={[styles.scoreValue, { color: scoreColor }]}>
          {compatibility}%
        </Text>
        <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>
          match
        </Text>
      </View>

      {categoryBreakdown && Object.keys(categoryBreakdown).length > 0 && (
        <View style={styles.breakdownContainer}>
          {Object.entries(categoryBreakdown).map(([category, score]) => (
            <View key={category} style={styles.breakdownItem}>
              <View style={styles.breakdownHeader}>
                <Ionicons
                  name={categoryIcons[category] as any}
                  size={14}
                  color={categoryColors[category]}
                />
                <Text style={[styles.breakdownCategory, { color: colors.text }]}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </Text>
              </View>
              <View style={[styles.breakdownBar, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.breakdownFill,
                    {
                      backgroundColor: categoryColors[category],
                      width: `${score}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.breakdownScore, { color: colors.textSecondary }]}>
                {score}%
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
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
    marginBottom: 16,
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
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
  },
  scoreContainerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scoreValueCompact: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  scoreCard: {
    padding: 16,
    borderRadius: 12,
    marginVertical: 8,
  },
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  scoreTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  scoreMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 16,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '700',
  },
  scoreLabel: {
    fontSize: 14,
    marginLeft: 4,
  },
  breakdownContainer: {
    marginTop: 8,
  },
  breakdownItem: {
    marginBottom: 12,
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  breakdownCategory: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 6,
  },
  breakdownBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  breakdownFill: {
    height: '100%',
    borderRadius: 3,
  },
  breakdownScore: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'right',
  },
});

export default CompatibilityQuiz;
