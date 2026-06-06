import { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Linking } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

interface SafetyTip {
  title: string;
  description: string;
  icon: string;
}

const safetyTips: SafetyTip[] = [
  {
    title: 'Meet in Public',
    description: 'For first dates, always choose a public place like a coffee shop or restaurant. Avoid private locations.',
    icon: 'location',
  },
  {
    title: 'Tell Someone',
    description: 'Share your date plans with a trusted friend or family member, including where you are going and when.',
    icon: 'people',
  },
  {
    title: 'Stay Sober',
    description: 'Keep your alcohol consumption to a minimum on first dates to stay alert and in control.',
    icon: 'wine-outline',
  },
  {
    title: 'Use Your Own Transportation',
    description: 'Drive yourself or use a rideshare app so you can leave whenever you want.',
    icon: 'car',
  },
  {
    title: 'Video Chat First',
    description: 'Before meeting in person, have a video call to verify the person matches their profile.',
    icon: 'videocam',
  },
  {
    title: 'Trust Your Instincts',
    description: 'If something feels off, it probably is. Do not hesitate to end the date and leave.',
    icon: 'alert-circle',
  },
  {
    title: 'Protect Personal Information',
    description: 'Do not share your home address, workplace, or financial information early on.',
    icon: 'lock-closed',
  },
  {
    title: 'Check Their Profile',
    description: 'Look for verified profiles and check if their photos seem authentic before meeting.',
    icon: 'checkmark-circle',
  },
];

export default function SafetyCenterScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [expandedTip, setExpandedTip] = useState<number | null>(null);

  const toggleTip = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedTip(expandedTip === index ? null : index);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Safety Center</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={['#4CAF50', '#2E7D32']}
            style={styles.iconGradient}
          >
            <Ionicons name="shield-checkmark-outline" size={48} color="#FFF" />
          </LinearGradient>
        </View>

        <ThemedText style={styles.title}>Your Safety Matters</ThemedText>
        <ThemedText style={[styles.description, { color: theme.textSecondary }]}>
          We are committed to keeping you safe. Find resources and practical dating safety tips here.
        </ThemedText>

        <View style={styles.tipsSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bulb" size={20} color={theme.primary} />
            <ThemedText style={styles.sectionTitle}>Dating Safety Tips</ThemedText>
          </View>
          
          {safetyTips.map((tip, index) => (
            <Pressable
              key={index}
              style={[styles.tipCard, { backgroundColor: theme.card || theme.surface }]}
              onPress={() => toggleTip(index)}
            >
              <View style={styles.tipHeader}>
                <View style={[styles.tipIcon, { backgroundColor: `${theme.primary}20` }]}>
                  <Ionicons name={tip.icon as any} size={20} color={theme.primary} />
                </View>
                <ThemedText style={styles.tipTitle}>{tip.title}</ThemedText>
                <Ionicons
                  name={expandedTip === index ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={theme.textSecondary}
                />
              </View>
              {expandedTip === index && (
                <ThemedText style={[styles.tipDescription, { color: theme.textSecondary }]}>
                  {tip.description}
                </ThemedText>
              )}
            </Pressable>
          ))}
        </View>

        <View style={styles.reportSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flag" size={20} color="#FF9800" />
            <ThemedText style={styles.sectionTitle}>Report & Block</ThemedText>
          </View>
          
          <View style={[styles.reportCard, { backgroundColor: theme.card || theme.surface }]}>
            <ThemedText style={styles.reportTitle}>Encountered inappropriate behavior?</ThemedText>
            <ThemedText style={[styles.reportDescription, { color: theme.textSecondary }]}>
              You can report users directly from their profile or from your chat. Reports are anonymous and our team reviews each case carefully.
            </ThemedText>
            
            <View style={styles.reportActions}>
              <View style={styles.reportAction}>
                <Ionicons name="flag-outline" size={24} color={theme.primary} />
                <ThemedText style={[styles.reportActionText, { color: theme.textSecondary }]}>
                  Report from profile or chat
                </ThemedText>
              </View>
              <View style={styles.reportAction}>
                <Ionicons name="ban-outline" size={24} color={theme.primary} />
                <ThemedText style={[styles.reportActionText, { color: theme.textSecondary }]}>
                  Block to prevent contact
                </ThemedText>
              </View>
              <View style={styles.reportAction}>
                <Ionicons name="eye-off-outline" size={24} color={theme.primary} />
                <ThemedText style={[styles.reportActionText, { color: theme.textSecondary }]}>
                  Hide your profile from them
                </ThemedText>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.resourcesSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="book" size={20} color={theme.primary} />
            <ThemedText style={styles.sectionTitle}>Additional Resources</ThemedText>
          </View>

          <Pressable
            style={[styles.resourceCard, { backgroundColor: theme.card || theme.surface }]}
            onPress={() => Linking.openURL('https://www.staysafeonline.org')}
          >
            <Ionicons name="globe-outline" size={24} color={theme.primary} />
            <View style={styles.resourceInfo}>
              <ThemedText style={styles.resourceTitle}>Online Safety Resources</ThemedText>
              <ThemedText style={[styles.resourceDescription, { color: theme.textSecondary }]}>
                Learn more about staying safe online
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <View style={[styles.disclaimer, { backgroundColor: 'rgba(158, 158, 158, 0.1)' }]}>
          <Ionicons name="information-circle" size={20} color={theme.textSecondary} />
          <ThemedText style={[styles.disclaimerText, { color: theme.textSecondary }]}>
            If a situation feels unsafe, trust your instincts, leave, and use the report and block tools above.
          </ThemedText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 40,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  tipsSection: {
    marginBottom: 32,
  },
  tipCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tipTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  tipDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
    paddingLeft: 48,
  },
  reportSection: {
    marginBottom: 32,
  },
  reportCard: {
    padding: 16,
    borderRadius: 12,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  reportDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  reportActions: {
    gap: 12,
  },
  reportAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reportActionText: {
    fontSize: 14,
    flex: 1,
  },
  resourcesSection: {
    marginBottom: 24,
  },
  resourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  resourceInfo: {
    flex: 1,
  },
  resourceTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  resourceDescription: {
    fontSize: 13,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
