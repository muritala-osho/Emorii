import logger from '@/utils/logger';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useApi } from '../hooks/useApi';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

interface Couple {
  _id: string;
  name: string;
  photos: { url: string }[];
}

interface SuccessStory {
  _id: string;
  couple: Couple[];
  title: string;
  story: string;
  howWeMet?: string;
  relationship: string;
  matchDate?: string;
  milestoneDate?: string;
  photos: { url: string; caption?: string }[];
  likeCount: number;
  viewCount: number;
  hasLiked?: boolean;
  featured: boolean;
  isAnonymous: boolean;
  location?: { city?: string; country?: string };
}

interface Stats {
  totalStories: number;
  totalMarried: number;
  totalEngaged: number;
  totalDating: number;
  totalCouples: number;
}

const getRelationshipLabel = (relationship: string): string => {
  return 'Success Story';
};

const getRelationshipIcon = (relationship: string): string => {
  return 'heart';
};


interface StoryCardProps {
  story: SuccessStory;
  onPress: () => void;
  compact?: boolean;
}

export const StoryCard: React.FC<StoryCardProps> = ({ story, onPress, compact = false }) => {
  const { theme } = useTheme();

  const getCoupleImage = (index: number): string | null => {
    const person = story.couple[index];
    if (!person || story.isAnonymous) return null;
    return person.photos?.[0]?.url || null;
  };

  const getCoupleNames = (): string => {
    if (story.isAnonymous) return 'Anonymous Couple';
    if (story.couple.length === 2) {
      return `${story.couple[0].name} & ${story.couple[1].name}`;
    }
    return story.couple[0]?.name || 'Anonymous';
  };

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactCard, { backgroundColor: theme.card }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        activeOpacity={0.8}
      >
        <View style={styles.compactPhotos}>
          {getCoupleImage(0) ? (
            <Image source={{ uri: getCoupleImage(0)! }} style={styles.compactPhoto} />
          ) : (
            <View style={[styles.compactPhoto, styles.placeholder, { backgroundColor: theme.border }]}>
              <Ionicons name="person" size={20} color={theme.textSecondary} />
            </View>
          )}
          {getCoupleImage(1) ? (
            <Image source={{ uri: getCoupleImage(1)! }} style={[styles.compactPhoto, styles.secondPhoto]} />
          ) : (
            <View style={[styles.compactPhoto, styles.secondPhoto, styles.placeholder, { backgroundColor: theme.border }]}>
              <Ionicons name="person" size={20} color={theme.textSecondary} />
            </View>
          )}
        </View>
        <View style={styles.compactContent}>
          <Text style={[styles.compactNames, { color: theme.text }]} numberOfLines={1}>
            {getCoupleNames()}
          </Text>
          <Text style={[styles.compactRelationship, { color: theme.primary }]}>
            {getRelationshipLabel(story.relationship)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.storyCard, { backgroundColor: theme.card }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      activeOpacity={0.8}
    >
      {story.photos?.[0]?.url ? (
        <Image source={{ uri: story.photos[0].url }} style={styles.storyImage} />
      ) : (
        <View style={[styles.storyImage, styles.photoGrid]}>
          {[0, 1].map((index) => (
            getCoupleImage(index) ? (
              <Image
                key={index}
                source={{ uri: getCoupleImage(index)! }}
                style={styles.gridPhoto}
              />
            ) : (
              <View
                key={index}
                style={[styles.gridPhoto, styles.placeholder, { backgroundColor: theme.border }]}
              >
                <Ionicons name="person" size={32} color={theme.textSecondary} />
              </View>
            )
          ))}
        </View>
      )}

      {story.featured && (
        <View style={styles.featuredBadge}>
          <Ionicons name="star" size={12} color="#FFD700" />
          <Text style={styles.featuredText}>Featured</Text>
        </View>
      )}

      <View style={styles.storyContent}>
        <View style={styles.coupleNames}>
          <Text style={[styles.names, { color: theme.text }]}>{getCoupleNames()}</Text>
          <View style={[styles.relationshipBadge, { backgroundColor: theme.primary + '20' }]}>
            <Ionicons
              name={getRelationshipIcon(story.relationship) as any}
              size={12}
              color={theme.primary}
            />
            <Text style={[styles.relationshipText, { color: theme.primary }]}>
              {getRelationshipLabel(story.relationship)}
            </Text>
          </View>
        </View>

        <Text style={[styles.storyTitle, { color: theme.text }]} numberOfLines={2}>
          {story.title}
        </Text>

        <Text style={[styles.storyPreview, { color: theme.textSecondary }]} numberOfLines={3}>
          {story.story}
        </Text>

        <View style={styles.storyFooter}>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Ionicons
                name={story.hasLiked ? 'heart' : 'heart-outline'}
                size={16}
                color={story.hasLiked ? '#FF6B6B' : theme.textSecondary}
              />
              <Text style={[styles.statText, { color: theme.textSecondary }]}>
                {story.likeCount}
              </Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="eye-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.statText, { color: theme.textSecondary }]}>
                {story.viewCount}
              </Text>
            </View>
          </View>
          {story.location?.city && (
            <Text style={[styles.locationText, { color: theme.textSecondary }]}>
              {story.location.city}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

interface SuccessStoriesListProps {
  featured?: boolean;
  onStoryPress?: (story: SuccessStory) => void;
}

const DUMMY_STORIES: SuccessStory[] = [
  {
    _id: 'dummy-1',
    title: 'A Modern Fairytale',
    story: 'We met on Emorii and instantly clicked over our shared love for West African cuisine and music.',
    relationship: 'partners',
    couple: [
      { _id: 'p1', name: 'Kofi', photos: [{ url: 'https://images.unsplash.com/photo-1531384441138-2736e62e0919' }] },
      { _id: 'p2', name: 'Amara', photos: [{ url: 'https://images.unsplash.com/photo-1523824921871-d6f1a15151f1' }] }
    ],
    photos: [{ url: 'https://images.unsplash.com/photo-1516589174184-e6bc1923b7a0' }],
    likeCount: 154,
    viewCount: 1240,
    featured: true,
    isAnonymous: false,
  },
  {
    _id: 'dummy-2',
    title: 'Our Journey Together',
    story: 'Emorii made it so easy to find someone who shares my values and cultural background.',
    relationship: 'partners',
    couple: [
      { _id: 'p3', name: 'Tunde', photos: [{ url: 'https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f' }] },
      { _id: 'p4', name: 'Zainab', photos: [{ url: 'https://images.unsplash.com/photo-1509460913899-515f1df34fea' }] }
    ],
    photos: [{ url: 'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8' }],
    likeCount: 289,
    viewCount: 3500,
    featured: false,
    isAnonymous: false,
  }
];

export const SuccessStoriesList: React.FC<SuccessStoriesListProps> = ({
  featured = false,
  onStoryPress,
}) => {
  const { theme } = useTheme();
  const api = useApi();
  const [stories, setStories] = useState<SuccessStory[]>(featured ? DUMMY_STORIES.filter(s => s.featured) : DUMMY_STORIES);
  const [loading, setLoading] = useState(true);

  // Hold api in a ref so the fetch effect can run on `featured` changes only.
  // useApi() returns a new object on every render (it owns internal
  // loading/error state) — putting it in the dep list caused a fetch loop.
  const apiRef = useRef(api);
  useEffect(() => { apiRef.current = api; }, [api]);

  useEffect(() => {
    let cancelled = false;
    const fetchStories = async () => {
      try {
        const endpoint = featured ? '/success-stories/featured' : '/success-stories';
        const res = await apiRef.current.get<{ stories: SuccessStory[] }>(endpoint);
        if (cancelled) return;
        if (res.success && res.data?.stories && res.data.stories.length > 0) {
          setStories(res.data.stories);
        }
      } catch (error) {
        logger.error('Failed to fetch stories:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchStories();
    return () => { cancelled = true; };
  }, [featured]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  if (stories.length === 0) {
    return (
      <View style={[styles.emptyState, { backgroundColor: theme.card }]}>
        <Ionicons name="heart-outline" size={64} color={theme.textSecondary} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>No Stories Yet</Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
          Be the first to share your love story!
        </Text>
      </View>
    );
  }

  if (featured) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalList}
      >
        {stories.map((story) => (
          <View key={story._id} style={styles.featuredCardWrapper}>
            <StoryCard story={story} onPress={() => onStoryPress?.(story)} />
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <FlatList
      data={stories}
      keyExtractor={(item) => item._id}
      renderItem={({ item }) => (
        <StoryCard story={item} onPress={() => onStoryPress?.(item)} />
      )}
      contentContainerStyle={styles.listContainer}
    />
  );
};

interface StatsDisplayProps {
  compact?: boolean;
}

export const SuccessStoriesStats: React.FC<StatsDisplayProps> = ({ compact = false }) => {
  const { theme } = useTheme();
  const api = useApi();
  const [stats, setStats] = useState<Stats | null>(null);

  // Same loop-prevention pattern as the list above — read api through a ref
  // and fetch exactly once on mount.
  const apiRef = useRef(api);
  useEffect(() => { apiRef.current = api; }, [api]);

  useEffect(() => {
    let cancelled = false;
    const fetchStats = async () => {
      try {
        const res = await apiRef.current.get<{ stats: Stats }>('/success-stories/stats');
        if (cancelled) return;
        if (res.success && res.data?.stats) {
          setStats(res.data.stats);
        }
      } catch (error) {
        logger.error('Failed to fetch stats:', error);
      }
    };
    fetchStats();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!stats) return null;

  if (compact) {
    return (
      <View style={[styles.statsCompact, { backgroundColor: theme.primary + '10' }]}>
        <Ionicons name="heart" size={20} color={theme.primary} />
        <Text style={[styles.statsCompactText, { color: theme.primary }]}>
          {stats.totalStories}+ couples found love on Emorii
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.statsContainer, { backgroundColor: theme.card }]}>
      <Text style={[styles.statsTitle, { color: theme.text }]}>Love by the Numbers</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: theme.primary }]}>{stats.totalStories}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Stories</Text>
        </View>
      </View>
    </View>
  );
};

interface LikeButtonProps {
  storyId: string;
  initialLiked: boolean;
  initialCount: number;
}

export const LikeButton: React.FC<LikeButtonProps> = ({
  storyId,
  initialLiked,
  initialCount,
}) => {
  const { theme } = useTheme();
  const api = useApi();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  const handleLike = async () => {
    if (loading) return;
    
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const newLiked = !liked;
    setLiked(newLiked);
    setCount(prev => newLiked ? prev + 1 : prev - 1);

    try {
      await api.post(`/success-stories/${storyId}/like`, {});
    } catch (error) {
      setLiked(!newLiked);
      setCount(prev => newLiked ? prev - 1 : prev + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.likeButton, { backgroundColor: liked ? '#FF6B6B20' : theme.card }]}
      onPress={handleLike}
      disabled={loading}
    >
      <Ionicons
        name={liked ? 'heart' : 'heart-outline'}
        size={24}
        color={liked ? '#FF6B6B' : theme.textSecondary}
      />
      <Text style={[styles.likeCount, { color: liked ? '#FF6B6B' : theme.textSecondary }]}>
        {count}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  storyCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  storyImage: {
    width: '100%',
    height: 200,
  },
  photoGrid: {
    flexDirection: 'row',
  },
  gridPhoto: {
    flex: 1,
    height: 200,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  featuredText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '600',
  },
  storyContent: {
    padding: 16,
  },
  coupleNames: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  names: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  relationshipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  relationshipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  storyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  storyPreview: {
    fontSize: 14,
    lineHeight: 20,
  },
  storyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  stats: {
    flexDirection: 'row',
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 13,
  },
  locationText: {
    fontSize: 12,
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 8,
    width: 180,
  },
  compactPhotos: {
    flexDirection: 'row',
    marginRight: 12,
  },
  compactPhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  secondPhoto: {
    marginLeft: -12,
  },
  compactContent: {
    flex: 1,
  },
  compactNames: {
    fontSize: 13,
    fontWeight: '600',
  },
  compactRelationship: {
    fontSize: 11,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyState: {
    margin: 16,
    padding: 40,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  listContainer: {
    paddingVertical: 8,
  },
  horizontalList: {
    paddingHorizontal: 8,
  },
  featuredCardWrapper: {
    width: width - 64,
  },
  statsCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  statsCompactText: {
    fontSize: 13,
    fontWeight: '500',
  },
  statsContainer: {
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  likeCount: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SuccessStoriesList;
