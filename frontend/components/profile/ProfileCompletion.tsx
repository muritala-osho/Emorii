import logger from '@/utils/logger';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useApi } from '../../hooks/useApi';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

interface CompletionStatus {
  completionPercentage: number;
  tier: string;
  tierMessage: string;
  totalFields: number;
  completedCount: number;
  missingCount: number;
  missingFields: Array<{ field: string; label: string; weight: number; required: boolean }>;
  suggestions: Array<{ field: string; label: string; message: string; priority: number }>;
  nextMilestone: number;
  pointsToNextMilestone: number;
}

interface ProfilePrompt {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  placeholder?: string;
  tips?: string[];
  suggestedInterests?: string[];
  options?: Array<{ value: string; label: string }>;
  priority: number;
}

interface ProfileCompletionProps {
  onPromptPress?: (prompt: ProfilePrompt) => void;
  compact?: boolean;
}

const getTierIcon = (tier: string): string => {
  switch (tier) {
    case 'superstar': return 'star';
    case 'standout': return 'trending-up';
    case 'rising': return 'arrow-up';
    default: return 'person-outline';
  }
};

const getTierColor = (tier: string, theme: any): string => {
  switch (tier) {
    case 'superstar': return '#FFD700';
    case 'standout': return theme.primary;
    case 'rising': return '#4CAF50';
    default: return theme.textSecondary;
  }
};

export const ProfileCompletionCard: React.FC<ProfileCompletionProps> = ({
  onPromptPress,
  compact = false,
}) => {
  const { theme } = useTheme();
  const api = useApi();
  const [status, setStatus] = useState<CompletionStatus | null>(null);
  const [prompts, setPrompts] = useState<ProfilePrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressAnim] = useState(new Animated.Value(0));

  // Keep a ref to the latest api so the effect below can safely use [] deps.
  // The useApi() hook has internal useState(loading/error) which causes a new
  // object identity on every render — putting `api` in fetchData's dep list
  // creates an infinite loop: fetch → loading state changes → new api object
  // → fetchData recreates → useEffect fires → fetch again → repeat.
  const apiRef = useRef(api);
  useEffect(() => { apiRef.current = api; }, [api]);

  const progressAnimRef = useRef(progressAnim);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, promptsRes] = await Promise.all([
        apiRef.current.get('/profile-completion/status'),
        apiRef.current.get('/profile-completion/prompts'),
      ]);

      if (statusRes.success) {
        setStatus(statusRes.data as any);
        Animated.timing(progressAnimRef.current, {
          toValue: (statusRes.data as any).completionPercentage / 100,
          duration: 1000,
          useNativeDriver: false,
        }).start();
      }

      if (promptsRes.success) {
        setPrompts((promptsRes.data as any).prompts);
      }
    } catch (error) {
      logger.error('Failed to fetch profile completion:', error);
    } finally {
      setLoading(false);
    }
  // Empty deps — fetch once on mount. All values accessed through stable refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePromptPress = (prompt: ProfilePrompt) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPromptPress?.(prompt);
  };

  if (loading || !status) {
    return null;
  }

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactCard, { backgroundColor: theme.card }]}
        onPress={() => prompts[0] && handlePromptPress(prompts[0])}
        activeOpacity={0.8}
      >
        <View style={styles.compactProgress}>
          <View style={[styles.compactProgressBg, { backgroundColor: theme.border }]}>
            <Animated.View
              style={[
                styles.compactProgressFill,
                {
                  backgroundColor: getTierColor(status.tier, theme),
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={[styles.compactPercentage, { color: theme.text }]}>
            {status.completionPercentage}%
          </Text>
        </View>
        {status.suggestions[0] && (
          <Text style={[styles.compactSuggestion, { color: theme.textSecondary }]} numberOfLines={1}>
            {status.suggestions[0].message}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.header}>
        <View style={styles.tierBadge}>
          <Ionicons
            name={getTierIcon(status.tier) as any}
            size={24}
            color={getTierColor(status.tier, theme)}
          />
          <Text style={[styles.tierText, { color: getTierColor(status.tier, theme) }]}>
            {status.tier.charAt(0).toUpperCase() + status.tier.slice(1)}
          </Text>
        </View>
        <Text style={[styles.percentage, { color: theme.text }]}>
          {status.completionPercentage}%
        </Text>
      </View>

      <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              backgroundColor: getTierColor(status.tier, theme),
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
        {status.nextMilestone < 100 && (
          <View
            style={[
              styles.milestone,
              { left: `${status.nextMilestone}%`, backgroundColor: theme.text },
            ]}
          />
        )}
      </View>

      <Text style={[styles.tierMessage, { color: theme.textSecondary }]}>
        {status.tierMessage}
      </Text>

      {prompts.length > 0 && (
        <View style={styles.promptsSection}>
          <Text style={[styles.promptsTitle, { color: theme.text }]}>
            Complete Your Profile
          </Text>
          {prompts.slice(0, 3).map((prompt) => (
            <TouchableOpacity
              key={prompt.id}
              style={[styles.promptItem, { backgroundColor: theme.background }]}
              onPress={() => handlePromptPress(prompt)}
              activeOpacity={0.7}
            >
              <View style={styles.promptContent}>
                <Text style={[styles.promptTitle, { color: theme.text }]}>
                  {prompt.title}
                </Text>
                <Text style={[styles.promptSubtitle, { color: theme.textSecondary }]}>
                  {prompt.subtitle}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {status.pointsToNextMilestone > 0 && (
        <View style={[styles.milestoneInfo, { backgroundColor: theme.primary + '20' }]}>
          <Ionicons name="trophy-outline" size={18} color={theme.primary} />
          <Text style={[styles.milestoneText, { color: theme.primary }]}>
            {status.pointsToNextMilestone}% more to reach {status.nextMilestone}% completion!
          </Text>
        </View>
      )}
    </View>
  );
};

export const ProfileCompletionBanner: React.FC<ProfileCompletionProps> = ({
  onPromptPress,
}) => {
  const { theme } = useTheme();
  const api = useApi();
  const [status, setStatus] = useState<CompletionStatus | null>(null);
  const [visible, setVisible] = useState(true);

  // Hold the latest api in a ref so the effect can run ONCE on mount.
  // Putting `api` in the dep list caused a fetch-loop (see notes on the Card
  // above): useApi() returns a new object on every render because it owns
  // internal loading/error state. Each fetch flipped that state and produced
  // a fresh api object, which re-fired this effect — resulting in dozens of
  // duplicate /profile-completion/status calls per second in production.
  const apiRef = useRef(api);
  useEffect(() => { apiRef.current = api; }, [api]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await apiRef.current.get('/profile-completion/status');
        if (res.success) {
          setStatus(res.data as any);
          if ((res.data as any).completionPercentage >= 90) {
            setVisible(false);
          }
        }
      } catch (error) {
        setVisible(false);
      }
    };
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible || !status || status.completionPercentage >= 90) {
    return null;
  }

  const suggestion = status.suggestions[0];

  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: theme.primary }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPromptPress?.({
          id: suggestion?.field || 'profile',
          type: 'general',
          title: 'Complete Your Profile',
          subtitle: suggestion?.message || 'Finish setting up your profile',
          priority: 1,
        });
      }}
      activeOpacity={0.9}
    >
      <View style={styles.bannerContent}>
        <Ionicons name="sparkles" size={20} color="#FFF" />
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle}>
            Your profile is {status.completionPercentage}% complete
          </Text>
          {suggestion && (
            <Text style={styles.bannerSubtitle} numberOfLines={1}>
              {suggestion.message}
            </Text>
          )}
        </View>
      </View>
      <TouchableOpacity onPress={() => setVisible(false)} style={styles.bannerClose}>
        <Ionicons name="close" size={18} color="#FFF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierText: {
    fontSize: 16,
    fontWeight: '600',
  },
  percentage: {
    fontSize: 28,
    fontWeight: '700',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  milestone: {
    position: 'absolute',
    width: 2,
    height: '100%',
    opacity: 0.5,
  },
  tierMessage: {
    fontSize: 14,
    marginBottom: 16,
  },
  promptsSection: {
    marginTop: 8,
  },
  promptsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  promptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  promptContent: {
    flex: 1,
  },
  promptTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  promptSubtitle: {
    fontSize: 13,
  },
  milestoneInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  milestoneText: {
    fontSize: 13,
    fontWeight: '500',
  },
  compactCard: {
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  compactProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  compactProgressBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  compactProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  compactPercentage: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
  compactSuggestion: {
    fontSize: 12,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
  },
  bannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  bannerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  bannerClose: {
    padding: 4,
  },
});

export default ProfileCompletionCard;
