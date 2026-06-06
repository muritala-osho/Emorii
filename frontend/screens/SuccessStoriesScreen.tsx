import logger from '@/utils/logger';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useLanguage';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { getPhotoSource } from '@/utils/photos';
import { getApiBaseUrl } from '@/constants/config';
import { formatMonthYear } from '@/utils/formatters';

const { width } = Dimensions.get('window');

interface SuccessStory {
  _id: string;
  title: string;
  story: string;
  howWeMet?: string;
  couple: Array<{
    _id: string;
    name: string;
    photos?: string[];
  }>;
  relationship: 'dating' | 'engaged' | 'married' | 'partners';
  matchDate?: string;
  milestoneDate?: string;
  photos?: string[];
  likeCount: number;
  viewCount: number;
  hasLiked?: boolean;
  featured?: boolean;
  isAnonymous?: boolean;
  isOwn?: boolean;
  isPending?: boolean;
  createdAt: string;
}

interface Stats {
  totalStories: number;
  totalMarried: number;
  totalEngaged: number;
  totalDating: number;
}

const RELATIONSHIP_COLORS: Record<string, string> = {
  dating: '#FF6B6B',
  engaged: '#9C27B0',
  married: '#4CAF50',
  partners: '#2196F3',
};

  const RELATIONSHIP_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
    partners: 'people',
  };

  const RELATIONSHIP_OPTIONS = [
    { id: 'partners', label: 'Love Stories', icon: 'people', color: '#2196F3' },
  ];

  const getPhotoUri = (photo: any): string | null => {
  if (!photo) return null;
  if (typeof photo === 'string') return photo;
  if (typeof photo === 'object' && photo.url) return photo.url;
  if (typeof photo === 'object' && photo.uri) return photo.uri;
  return null;
};

const DUMMY_SUCCESS_STORIES: SuccessStory[] = [
    {
      _id: 'dummy-1',
      title: 'A Modern Fairytale',
      story: 'We met on Emorii and instantly clicked over our shared love for West African cuisine and music. After months of late-night video calls, we finally met in person, and it felt like we had known each other forever.',
      howWeMet: 'Matched on Emorii',
      couple: [
        { _id: 'p1', name: 'Kofi', photos: [] },
        { _id: 'p2', name: 'Amara', photos: [] }
      ],
      relationship: 'partners',
      photos: [],
      likeCount: 154,
      viewCount: 1240,
      createdAt: '2025-01-01T10:00:00Z'
    },
    {
      _id: 'dummy-2',
      title: 'Our Journey Together',
      story: 'Emorii made it so easy to find someone who shares my values and cultural background. We are now happily married and owe it all to this amazing platform!',
      howWeMet: 'First date at a local coffee shop',
      couple: [
        { _id: 'p3', name: 'Tunde', photos: [] },
        { _id: 'p4', name: 'Zainab', photos: [] }
      ],
      relationship: 'partners',
      photos: [],
      likeCount: 289,
      viewCount: 3500,
      createdAt: '2025-01-02T10:00:00Z'
    },
    {
      _id: 'dummy-3',
      title: 'Love Across Borders',
      story: 'We were in different cities but Emorii brought us together. The distance was hard, but our connection was stronger. We just celebrated our first anniversary!',
      howWeMet: 'Matched while traveling',
      couple: [
        { _id: 'p5', name: 'Chidi', photos: [] },
        { _id: 'p6', name: 'Nia', photos: [] }
      ],
      relationship: 'partners',
      photos: [],
      likeCount: 420,
      viewCount: 5100,
      createdAt: '2025-01-03T10:00:00Z'
    },
    {
      _id: 'dummy-4',
      title: 'Soulmates Found',
      story: 'I never thought I would find my soulmate on an app, but here we are. We share the same passions and dreams. Thank you Emorii!',
      howWeMet: 'Matched through mutual interests',
      couple: [
        { _id: 'p7', name: 'Kwame', photos: [] },
        { _id: 'p8', name: 'Adwoa', photos: [] }
      ],
      relationship: 'partners',
      photos: [],
      likeCount: 560,
      viewCount: 8200,
      createdAt: '2025-01-04T10:00:00Z'
    },
    {
      _id: 'dummy-5',
      title: 'Perfect Harmony',
      story: 'Our love for music brought us together. We now spend our weekends attending concerts and exploring new sounds. Life is better with you.',
      howWeMet: 'Matched on a jazz night',
      couple: [
        { _id: 'p9', name: 'Olumide', photos: [] },
        { _id: 'p10', name: 'Folake', photos: [] }
      ],
      relationship: 'partners',
      photos: [],
      likeCount: 310,
      viewCount: 4300,
      createdAt: '2025-01-05T10:00:00Z'
    },
    {
      _id: 'dummy-6',
      title: 'A New Beginning',
      story: 'After moving to a new city, Emorii helped me find my best friend and partner. We are exploring the city together and building a life.',
      howWeMet: 'Matched after my big move',
      couple: [
        { _id: 'p11', name: 'Moussa', photos: [] },
        { _id: 'p12', name: 'Fatou', photos: [] }
      ],
      relationship: 'partners',
      photos: [],
      likeCount: 225,
      viewCount: 2900,
      createdAt: '2025-01-06T10:00:00Z'
    },
    {
      _id: 'dummy-7',
      title: 'Building a Legacy',
      story: 'We both wanted to find someone who values family and heritage as much as we do. We found that in each other on Emorii.',
      howWeMet: 'Matched during a cultural festival',
      couple: [
        { _id: 'p13', name: 'Babajide', photos: [] },
        { _id: 'p14', name: 'Eniola', photos: [] }
      ],
      relationship: 'partners',
      photos: [],
      likeCount: 680,
      viewCount: 9500,
      createdAt: '2025-01-07T10:00:00Z'
    },
    {
      _id: 'dummy-8',
      title: 'Shared Dreams',
      story: 'From our first message, we knew we had something special. We share the same career goals and support each other every step of the way.',
      howWeMet: 'Matched while studying for exams',
      couple: [
        { _id: 'p15', name: 'Tariq', photos: [] },
        { _id: 'p16', name: 'Layla', photos: [] }
      ],
      relationship: 'partners',
      photos: [],
      likeCount: 440,
      viewCount: 6200,
      createdAt: '2025-01-08T10:00:00Z'
    },
    {
      _id: 'dummy-9',
      title: 'Unexpected Love',
      story: 'I was just about to delete the app when I saw her profile. One "Hi" changed everything. Don\'t give up on love!',
      howWeMet: 'A last-minute match',
      couple: [
        { _id: 'p17', name: 'Emanuel', photos: [] },
        { _id: 'p18', name: 'Grace', photos: [] }
      ],
      relationship: 'partners',
      photos: [],
      likeCount: 395,
      viewCount: 4800,
      createdAt: '2025-01-09T10:00:00Z'
    },
    {
      _id: 'dummy-10',
      title: 'Better Together',
      story: 'We compliment each other in every way. Thank you Emorii for matching us and helping us find our forever.',
      howWeMet: 'Matched on a sunny afternoon',
      couple: [
        { _id: 'p19', name: 'Jide', photos: [] },
        { _id: 'p20', name: 'Zari', photos: [] }
      ],
      relationship: 'partners',
      photos: [],
      likeCount: 720,
      viewCount: 11000,
      createdAt: '2025-01-10T10:00:00Z'
    }
  ];

export default function SuccessStoriesScreen() {
  const { theme } = useTheme();
  const { get, post, del } = useApi();
  const { token } = useAuth();
  const { t } = useTranslation();
  
  const [stories, setStories] = useState<SuccessStory[]>(DUMMY_SUCCESS_STORIES);
  const [featuredStories, setFeaturedStories] = useState<SuccessStory[]>(DUMMY_SUCCESS_STORIES.filter(s => s.featured));
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'browse' | 'myStory'>('browse');

  const [myStory, setMyStory] = useState<SuccessStory | null>(null);
  const [loadingMyStory, setLoadingMyStory] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const [storyTitle, setStoryTitle] = useState('');
  const [storyText, setStoryText] = useState('');
  const [howWeMet, setHowWeMet] = useState('');
  const [relationship, setRelationship] = useState<SuccessStory['relationship']>('dating');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [storyPhotos, setStoryPhotos] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = selectedFilter ? `?relationship=${selectedFilter}` : '';
      const [storiesRes, featuredRes, statsRes] = await Promise.all([
        get<any>(`/success-stories${params}`, token || undefined),
        get<any>('/success-stories/featured', token || undefined),
        get<any>('/success-stories/stats', token || undefined),
      ]);

      let finalStories: SuccessStory[] = [];
      if (storiesRes && storiesRes.success && storiesRes.data && Array.isArray(storiesRes.data)) {
        finalStories = storiesRes.data;
      }

      if (finalStories.length === 0 && !selectedFilter) {
        finalStories = DUMMY_SUCCESS_STORIES;
      }
      setStories(finalStories);
      
      if (featuredRes && featuredRes.success && featuredRes.data && Array.isArray(featuredRes.data)) {
        setFeaturedStories(featuredRes.data);
      }
      if (statsRes && statsRes.success && statsRes.data) {
        setStats(statsRes.data as Stats);
      }
    } catch (error) {
      logger.error('Error fetching data:', error);
      setStories(DUMMY_SUCCESS_STORIES);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [get, selectedFilter, token]);

  const fetchMyStory = useCallback(async () => {
    if (!token) {
      setLoadingMyStory(false);
      return;
    }
    setLoadingMyStory(true);
    try {
      const response = await get<SuccessStory>('/success-stories/my-story', token);
      if (response && response.success && response.data) {
        setMyStory(response.data);
      } else {
        setMyStory(null);
      }
    } catch (error) {
      logger.error('Error fetching my story:', error);
      setMyStory(null);
    } finally {
      setLoadingMyStory(false);
    }
  }, [get, token]);

  const hasInitiallyLoaded = useRef(false);
  const prevFilterRef = useRef<string | null>(null);
  const prevTokenRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (!token) {
      hasInitiallyLoaded.current = false;
      prevTokenRef.current = null;
      return;
    }
    
    if (!hasInitiallyLoaded.current || prevTokenRef.current !== token) {
      hasInitiallyLoaded.current = true;
      prevTokenRef.current = token;
      prevFilterRef.current = selectedFilter;
      setLoading(true);
      fetchData();
      return;
    }
    
    if (prevFilterRef.current !== selectedFilter) {
      prevFilterRef.current = selectedFilter;
      setLoading(true);
      fetchData();
    }
  }, [token, selectedFilter]);

  useEffect(() => {
    if (activeTab === 'myStory') {
      fetchMyStory();
    }
  }, [activeTab, fetchMyStory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (activeTab === 'myStory') {
      fetchMyStory().finally(() => setRefreshing(false));
    } else {
      fetchData();
    }
  }, [activeTab, fetchData, fetchMyStory]);

  const handleLike = async (storyId: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const response = await post<{ liked: boolean; likeCount: number }>(`/success-stories/${storyId}/like`, {}, token || undefined);
      if (response.success && response.data) {
        const data = response.data as { liked: boolean; likeCount: number };
        setStories((prev) =>
          prev.map((story) =>
            story._id === storyId
              ? {
                  ...story,
                  hasLiked: data.liked,
                  likeCount: data.likeCount,
                }
              : story
          )
        );
      }
    } catch (error) {
      logger.error('Error liking story:', error);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    Alert.alert(
      t('deleteStory') || 'Delete Story',
      t('deleteStoryConfirm') || 'Are you sure you want to delete your love story? This action cannot be undone.',
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('delete') || 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const response = await del(`/success-stories/${storyId}`, token || undefined);
              if (response.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setStories((prev) => prev.filter((story) => story._id !== storyId));
                setMyStory(null);
                Alert.alert(t('success') || 'Success', t('storyDeleted') || 'Your story has been deleted');
              } else {
                Alert.alert(t('error') || 'Error', response.message || t('failedToDeleteStory') || 'Failed to delete story');
              }
            } catch (error) {
              logger.error('Error deleting story:', error);
              Alert.alert(t('error') || 'Error', t('failedToDeleteStory') || 'Failed to delete story');
            }
          },
        },
      ]
    );
  };

  const handleReportStory = (item: SuccessStory) => {
    Alert.alert(
      'Report Story',
      'Is this story inappropriate or misleading?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            try {
              const reportedUserId = item.couple?.[0]?._id;
              if (!reportedUserId || !token) return;
              await post('/reports', {
                reportedUserId,
                reason: 'inappropriate',
                contentType: 'success_story',
                contentId: item._id,
                contentPreview: item.title,
                description: 'Success story report',
              }, token);
              Alert.alert('Reported', 'Thank you. We will review this story.');
            } catch {
              Alert.alert('Error', 'Could not submit report. Please try again.');
            }
          },
        },
      ]
    );
  };


  const pickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      setStoryPhotos(result.assets.map(a => a.uri));
    }
  };

  const resetForm = () => {
    setStoryTitle('');
    setStoryText('');
    setHowWeMet('');
    setRelationship('dating');
    setIsAnonymous(false);
    setStoryPhotos([]);
  };

  const handleShareStory = async () => {
    if (!storyTitle.trim()) {
      Alert.alert(t('missingInfo'), t('pleaseEnterStoryTitle'));
      return;
    }
    if (!storyText.trim()) {
      Alert.alert(t('missingInfo'), t('pleaseShareYourLoveStory'));
      return;
    }

    setCreating(true);
    try {
      let uploadedPhotoUrls: string[] = [];
      let uploadFailed = false;
      
      if (storyPhotos.length > 0) {
        for (const photoUri of storyPhotos) {
          try {
            if (photoUri.startsWith('http://') || photoUri.startsWith('https://')) {
              uploadedPhotoUrls.push(photoUri);
              continue;
            }
            
            const formData = new FormData();
            if (Platform.OS === 'web') {
              const imageResponse = await fetch(photoUri);
              const blob = await imageResponse.blob();
              formData.append('photo', blob, `story_${Date.now()}.jpg`);
            } else {
              formData.append('photo', {
                uri: photoUri,
                type: 'image/jpeg',
                name: `story_${Date.now()}.jpg`,
              } as any);
            }

            const uploadResponse = await fetch(`${getApiBaseUrl()}/api/upload/photo`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            });

            const uploadData = await uploadResponse.json();
            if (uploadData.success && uploadData.url) {
              uploadedPhotoUrls.push(uploadData.url);
            } else {
              uploadFailed = true;
            }
          } catch (uploadError) {
            logger.error('Photo upload error:', uploadError);
            uploadFailed = true;
          }
        }
        
        if (uploadFailed && uploadedPhotoUrls.length < storyPhotos.length) {
          Alert.alert(
            t('warning') || 'Warning',
            t('somePhotosFailed') || 'Some photos failed to upload. Continue with uploaded photos?',
            [
              { text: t('cancel') || 'Cancel', style: 'cancel', onPress: () => { setCreating(false); } },
              { text: t('continue') || 'Continue', onPress: () => {} }
            ]
          );
          if (uploadedPhotoUrls.length === 0) {
            setCreating(false);
            return;
          }
        }
      }

      const storyData = {
        title: storyTitle.trim(),
        story: storyText.trim(),
        howWeMet: howWeMet.trim() || undefined,
        relationship,
        isAnonymous,
        photos: uploadedPhotoUrls,
      };

      const response = await post('/success-stories', storyData, token || undefined);
      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowCreateModal(false);
        resetForm();
        fetchData();
        Alert.alert(t('thankYou'), t('storyShared'));
      } else {
        Alert.alert(t('error'), response.message || t('failedToShareStory'));
      }
    } catch (error) {
      logger.error('Error sharing story:', error);
      Alert.alert(t('error'), t('failedToShareStory'));
    } finally {
      setCreating(false);
    }
  };
  const renderStats = () => {
    if (!stats) return null;
    return (
      <View style={[styles.statsContainer, { backgroundColor: theme.surface }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: theme.primary }]}>{stats.totalStories}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('totalStories')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: RELATIONSHIP_COLORS.married }]}>{stats.totalMarried}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('married')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: RELATIONSHIP_COLORS.engaged }]}>{stats.totalEngaged}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('engaged')}</Text>
        </View>
      </View>
    );
  };

  const renderFeaturedStory = ({ item }: { item: SuccessStory }) => (
    <TouchableOpacity
      style={[styles.featuredCard, { backgroundColor: theme.primary }]}
      activeOpacity={0.9}
    >
      <View style={styles.featuredBadge}>
        <Ionicons name="star" size={14} color="#fff" />
        <Text style={styles.featuredBadgeText}>{t('featured')}</Text>
      </View>
      <View style={styles.featuredContent}>
        <View style={styles.couplePhotos}>
          {item.couple.slice(0, 2).map((person, index) => (
            <View key={person._id || index} style={[styles.featuredPhoto, { marginLeft: index > 0 ? -15 : 0 }]}>
              {person.photos?.[0] ? (
                <Image source={{ uri: person.photos[0] }} style={styles.featuredPhotoImage} />
              ) : (
                <View style={styles.featuredPhotoPlaceholder}>
                  <Ionicons name="person" size={24} color="#fff" />
                </View>
              )}
            </View>
          ))}
        </View>
        <Text style={styles.featuredTitle}>{item.title}</Text>
        <Text style={styles.featuredStory} numberOfLines={2}>{item.story}</Text>
        <View style={styles.featuredMeta}>
          <Ionicons name="heart" size={16} color="#fff" />
          <Text style={styles.featuredMetaText}>{item.likeCount} {t('likes')}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderFilters = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterContainer}
    >
      <TouchableOpacity
        style={[
          styles.filterChip,
          {
            backgroundColor: selectedFilter === null ? theme.primary : theme.surface,
            borderColor: selectedFilter === null ? theme.primary : theme.border,
          },
        ]}
        onPress={() => setSelectedFilter(null)}
      >
        <Text
          style={[
            styles.filterChipText,
            { color: selectedFilter === null ? '#fff' : theme.textSecondary },
          ]}
        >
          {t('all')}
        </Text>
      </TouchableOpacity>
      {RELATIONSHIP_OPTIONS.map((option) => (
        <TouchableOpacity
          key={option.id}
          style={[
            styles.filterChip,
            {
              backgroundColor: selectedFilter === option.id ? option.color : theme.surface,
              borderColor: selectedFilter === option.id ? option.color : theme.border,
            },
          ]}
          onPress={() => setSelectedFilter(option.id)}
        >
          <Ionicons
            name={option.icon as any}
            size={16}
            color={selectedFilter === option.id ? '#fff' : option.color}
            style={styles.filterIcon}
          />
          <Text
            style={[
              styles.filterChipText,
              { color: selectedFilter === option.id ? '#fff' : theme.textSecondary },
            ]}
          >
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderStoryCard = ({ item }: { item: SuccessStory }) => {
    const color = RELATIONSHIP_COLORS[item.relationship] || theme.primary;
    
    return (
      <TouchableOpacity
        style={[styles.storyCard, { backgroundColor: theme.surface }]}
        activeOpacity={0.9}
      >
        <View style={styles.storyHeader}>
          <View style={styles.coupleInfo}>
            <View style={styles.smallCouplePhotos}>
              {item.couple.slice(0, 2).map((person, index) => (
                <View
                  key={person._id || index}
                  style={[
                    styles.smallPhoto,
                    { marginLeft: index > 0 ? -12 : 0, borderColor: theme.surface },
                  ]}
                >
                  {person.photos?.[0] && getPhotoSource(person.photos[0]) ? (
                    <Image source={getPhotoSource(person.photos[0]) as any} style={styles.smallPhotoImage} />
                  ) : (
                    <View style={[styles.smallPhotoPlaceholder, { backgroundColor: theme.border }]}>
                      <Ionicons name="person" size={14} color={theme.textSecondary} />
                    </View>
                  )}
                </View>
              ))}
            </View>
            <View style={styles.coupleNames}>
              <Text style={[styles.coupleNameText, { color: theme.text }]}>
                {item.isAnonymous ? t('anonymousCouple') : item.couple.map((p) => p.name).join(' & ')}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.storyTitle, { color: theme.text }]}>{item.title}</Text>
        <Text style={[styles.storyText, { color: theme.textSecondary }]}>
          {item.story}
        </Text>

        {item.photos && item.photos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.storyPhotos}
          >
            {item.photos.slice(0, 3).map((photo, index) => {
              const photoUri = getPhotoUri(photo);
              return photoUri ? (
                <Image key={index} source={{ uri: photoUri }} style={styles.storyPhoto} />
              ) : null;
            })}
          </ScrollView>
        )}

        <View style={styles.storyFooter}>
          <TouchableOpacity
            style={styles.likeButton}
            onPress={() => handleLike(item._id)}
          >
            <Ionicons
              name={item.hasLiked ? 'heart' : 'heart-outline'}
              size={20}
              color={item.hasLiked ? '#FF6B6B' : theme.textSecondary}
            />
            <Text
              style={[
                styles.likeCount,
                { color: item.hasLiked ? '#FF6B6B' : theme.textSecondary },
              ]}
            >
              {item.likeCount}
            </Text>
          </TouchableOpacity>
          
          <View style={styles.viewCount}>
            <Ionicons name="eye-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.viewCountText, { color: theme.textSecondary }]}>
              {item.viewCount} {t('views')}
            </Text>
          </View>

          {item.isOwn && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteStory(item._id)}
            >
              <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
            </TouchableOpacity>
          )}
          {!item.isOwn && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleReportStory(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="flag-outline" size={17} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="heart-circle-outline" size={64} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('noStoriesYet')}</Text>
    </View>
  );

  const renderHeader = () => (
    <>
      {renderStats()}
      
      {featuredStories.length > 0 && (
        <View style={styles.featuredSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('featuredStories')}</Text>
          <FlatList
            horizontal
            data={featuredStories}
            renderItem={renderFeaturedStory}
            keyExtractor={(item) => item._id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featuredList}
          />
        </View>
      )}
      
      <Text style={[styles.sectionTitle, { color: theme.text, marginHorizontal: 16 }]}>
        {t('allStories')}
      </Text>
      {renderFilters()}
    </>
  );




  const renderTabToggle = () => (
    <View style={[styles.tabContainer, { backgroundColor: theme.surface }]}>
      <TouchableOpacity
        style={[
          styles.tab,
          activeTab === 'browse' && { backgroundColor: theme.primary },
        ]}
        onPress={() => setActiveTab('browse')}
      >
        <Ionicons
          name="heart-outline"
          size={18}
          color={activeTab === 'browse' ? '#fff' : theme.textSecondary}
        />
        <Text
          style={[
            styles.tabText,
            { color: activeTab === 'browse' ? '#fff' : theme.textSecondary },
          ]}
        >
          {t('allStories')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.tab,
          activeTab === 'myStory' && { backgroundColor: theme.primary },
        ]}
        onPress={() => setActiveTab('myStory')}
      >
        <Ionicons
          name="person-outline"
          size={18}
          color={activeTab === 'myStory' ? '#fff' : theme.textSecondary}
        />
        <Text
          style={[
            styles.tabText,
            { color: activeTab === 'myStory' ? '#fff' : theme.textSecondary },
          ]}
        >
          {t('myStory')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderMyStorySection = () => {
    if (loadingMyStory) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      );
    }

    if (!myStory) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-circle-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('noStorySharedYet')}</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            {t('shareYourStory')}
          </Text>
          <TouchableOpacity
            style={[styles.shareButton, { backgroundColor: theme.primary }]}
            onPress={() => setShowCreateModal(true)}
          >
            <Text style={styles.shareButtonText}>{t('shareStory')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const color = RELATIONSHIP_COLORS[myStory.relationship] || theme.primary;

    return (
      <ScrollView
        style={styles.myStoryScroll}
        contentContainerStyle={styles.myStoryContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        <View style={[styles.myStoryCard, { backgroundColor: theme.surface }]}>
          <View style={styles.myStoryHeader}>
            <View style={[styles.relationshipBadge, { backgroundColor: `${color}20` }]}>
              <Ionicons name={RELATIONSHIP_ICONS[myStory.relationship]} size={14} color={color} />
              <Text style={[styles.relationshipBadgeText, { color }]}>
                {myStory.relationship.charAt(0).toUpperCase() + myStory.relationship.slice(1)}
              </Text>
            </View>
            <Text style={[styles.myStoryDate, { color: theme.textSecondary }]}>
              {t('shared')} {formatMonthYear(myStory.createdAt)}
            </Text>
          </View>

          <Text style={[styles.myStoryTitle, { color: theme.text }]}>{myStory.title}</Text>
          <Text style={[styles.myStoryText, { color: theme.textSecondary }]}>{myStory.story}</Text>

          {myStory.howWeMet && (
            <View style={[styles.howWeMetSection, { backgroundColor: theme.primary + '10' }]}>
              <Text style={[styles.howWeMetLabel, { color: theme.primary }]}>{t('howWeMet')}</Text>
              <Text style={[styles.howWeMetText, { color: theme.text }]}>{myStory.howWeMet}</Text>
            </View>
          )}

          {myStory.photos && myStory.photos.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.myStoryPhotos}
            >
              {myStory.photos.map((photo, index) => {
                const photoUri = getPhotoUri(photo);
                return photoUri ? (
                  <Image key={index} source={{ uri: photoUri }} style={styles.myStoryPhoto} />
                ) : null;
              })}
            </ScrollView>
          )}

          <View style={styles.myStoryStats}>
            <View style={styles.statRow}>
              <Ionicons name="heart" size={18} color="#FF6B6B" />
              <Text style={[styles.statText, { color: theme.text }]}>{myStory.likeCount} {t('likes')}</Text>
            </View>
            <View style={styles.statRow}>
              <Ionicons name="eye" size={18} color={theme.textSecondary} />
              <Text style={[styles.statText, { color: theme.text }]}>{myStory.viewCount} {t('views')}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.deleteStoryButton, { borderColor: '#FF6B6B' }]}
            onPress={() => handleDeleteStory(myStory._id)}
          >
            <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
            <Text style={styles.deleteStoryButtonText}>{t('deleteStory') || 'Delete Story'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  const renderCreateModal = () => (
    <Modal
      visible={showCreateModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowCreateModal(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modalContainer, { backgroundColor: theme.background }]}
      >
        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => setShowCreateModal(false)}>
            <Text style={[styles.modalCancel, { color: theme.textSecondary }]}>{t('cancel')}</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: theme.text }]}>{t('shareYourStory')}</Text>
          <TouchableOpacity onPress={handleShareStory} disabled={creating}>
            {creating ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={[styles.modalSave, { color: theme.primary }]}>{t('share')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.inspirationCard, { backgroundColor: theme.primary + '10' }]}>
            <Ionicons name="heart" size={24} color={theme.primary} />
            <Text style={[styles.inspirationText, { color: theme.text }]}>
              {t('shareInspiration')}
            </Text>
          </View>

          <Text style={[styles.inputLabel, { color: theme.text }]}>{t('storyTitleLabel')} *</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
            placeholder={t('storyTitlePlaceholder')}
            placeholderTextColor={theme.textSecondary}
            value={storyTitle}
            onChangeText={setStoryTitle}
          />

          <Text style={[styles.inputLabel, { color: theme.text }]}>{t('yourLoveStoryLabel')} *</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
            placeholder={t('tellYourJourney')}
            placeholderTextColor={theme.textSecondary}
            value={storyText}
            onChangeText={setStoryText}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          <Text style={[styles.inputLabel, { color: theme.text }]}>{t('howDidYouMeet')}</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border, height: 80 }]}
            placeholder={t('shareFirstMoment')}
            placeholderTextColor={theme.textSecondary}
            value={howWeMet}
            onChangeText={setHowWeMet}
            multiline
            textAlignVertical="top"
          />

          <Text style={[styles.inputLabel, { color: theme.text }]}>{t('relationshipStatus')}</Text>
          <View style={styles.relationshipPicker}>
            {RELATIONSHIP_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.relationshipOption,
                  {
                    backgroundColor: relationship === option.id ? option.color : theme.surface,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setRelationship(option.id as any)}
              >
                <Ionicons
                  name={option.icon as any}
                  size={18}
                  color={relationship === option.id ? '#fff' : option.color}
                />
                <Text
                  style={[
                    styles.relationshipOptionText,
                    { color: relationship === option.id ? '#fff' : theme.text },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.inputLabel, { color: theme.text }]}>{t('addPhotos')}</Text>
          <TouchableOpacity
            style={[styles.photoUpload, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={pickPhotos}
          >
            {storyPhotos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {storyPhotos.map((photo, index) => (
                  photo ? (
                    <Image key={index} source={{ uri: photo }} style={styles.uploadedPhoto} />
                  ) : null
                ))}
                <View style={[styles.addMorePhotos, { backgroundColor: theme.border }]}>
                  <Ionicons name="add" size={24} color={theme.textSecondary} />
                </View>
              </ScrollView>
            ) : (
              <View style={styles.photoUploadPlaceholder}>
                <Ionicons name="images-outline" size={36} color={theme.textSecondary} />
                <Text style={[styles.photoUploadText, { color: theme.textSecondary }]}>
                  {t('addUpTo5Photos')}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.anonymousToggle}>
            <View>
              <Text style={[styles.inputLabel, { color: theme.text, marginBottom: 0, marginTop: 0 }]}>
                {t('shareAnonymously')}
              </Text>
              <Text style={[styles.anonymousHint, { color: theme.textSecondary }]}>
                {t('anonymousDescription')}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                { backgroundColor: isAnonymous ? theme.primary : theme.surface, borderColor: theme.border },
              ]}
              onPress={() => setIsAnonymous(!isAnonymous)}
            >
              <Text style={{ color: isAnonymous ? '#fff' : theme.text }}>
                {isAnonymous ? t('yes') : t('no')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderContent = () => {
    if (loading && !refreshing) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      );
    }

    return (
      <FlatList
        data={stories}
        renderItem={renderStoryCard}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={selectedFilter ? renderFilters : renderHeader}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      />
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('loveStories')}</Text>
      </View>

      <View style={styles.tabContentContainer}>
        {renderContent()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContentContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 16,
    borderRadius: 16,
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: '100%',
  },
  featuredSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    marginLeft: 16,
  },
  featuredList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  featuredCard: {
    width: width * 0.75,
    borderRadius: 20,
    padding: 16,
    marginRight: 12,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 4,
  },
  featuredBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  featuredContent: {
    marginTop: 12,
  },
  couplePhotos: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  featuredPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  featuredPhotoImage: {
    width: '100%',
    height: '100%',
  },
  featuredPhotoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  featuredStory: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
  },
  featuredMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  featuredMetaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  filterScroll: {
    marginBottom: 12,
  },
  filterContainer: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterIcon: {
    marginRight: 6,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 16,
  },
  storyCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginBottom: 12,
  },
  pendingBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  storyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  coupleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  smallCouplePhotos: {
    flexDirection: 'row',
    marginRight: 12,
  },
  smallPhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    overflow: 'hidden',
  },
  smallPhotoImage: {
    width: '100%',
    height: '100%',
  },
  smallPhotoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coupleNames: {
    flex: 1,
  },
  coupleNameText: {
    fontSize: 15,
    fontWeight: '600',
  },
  matchDate: {
    fontSize: 12,
    marginTop: 2,
  },
  relationshipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  relationshipBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  storyTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  storyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  storyPhotos: {
    marginTop: 12,
    marginHorizontal: -4,
  },
  storyPhoto: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  storyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  likeCount: {
    fontSize: 14,
    fontWeight: '500',
  },
  viewCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewCountText: {
    fontSize: 13,
  },
  deleteButton: {
    padding: 8,
    marginLeft: 'auto',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  shareButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalCancel: {
    fontSize: 16,
  },
  modalSave: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  inspirationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 12,
    marginBottom: 16,
  },
  inspirationText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  textInput: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  textArea: {
    height: 120,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  relationshipPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  relationshipOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  relationshipOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  photoUpload: {
    height: 100,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoUploadPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoUploadText: {
    marginTop: 8,
    fontSize: 14,
  },
  uploadedPhoto: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  addMorePhotos: {
    width: 80,
    height: 80,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  anonymousToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  anonymousHint: {
    fontSize: 12,
    marginTop: 2,
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  myStoryScroll: {
    flex: 1,
  },
  myStoryContent: {
    padding: 16,
  },
  myStoryCard: {
    borderRadius: 16,
    padding: 20,
  },
  myStoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  myStoryDate: {
    fontSize: 12,
  },
  myStoryTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  myStoryText: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 16,
  },
  howWeMetSection: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  howWeMetLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  howWeMetText: {
    fontSize: 14,
    lineHeight: 22,
  },
  myStoryPhotos: {
    marginBottom: 16,
    marginHorizontal: -4,
  },
  myStoryPhoto: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  aboutSection: {
    padding: 20,
    margin: 16,
    borderRadius: 16,
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 20,
  },
  faqItem: {
    marginBottom: 15,
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  faqAnswer: {
    fontSize: 14,
  },
  myStoryStats: {
    flexDirection: 'row',
    gap: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 14,
    fontWeight: '500',
  },
  deleteStoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 12,
  },
  deleteStoryButtonText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
  },
});
