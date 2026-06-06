import React from 'react';
import { Modal, View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';

type ThemeOption = { id: string; name: string; image: any };

type Props = {
  visible: boolean;
  theme: any;
  isDark: boolean;
  themes: ThemeOption[];
  currentChatTheme: string;
  onClose: () => void;
  onSelect: (themeId: string) => void;
};

export default function ChatThemeModal({
  visible,
  theme,
  isDark,
  themes,
  currentChatTheme,
  onClose,
  onSelect,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.themeModal, { backgroundColor: theme.background }]}>
          <View style={styles.themeHeader}>
            <ThemedText style={[styles.themeTitle, { color: theme.text }]}>Chat Theme</ThemedText>
            <Pressable onPress={onClose}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.themeGrid}>
            {themes.map(themeItem => (
              <Pressable
                key={themeItem.id}
                style={[
                  styles.themeItem,
                  currentChatTheme === themeItem.id && {
                    borderColor: theme.primary,
                    borderWidth: 3,
                  },
                ]}
                onPress={() => onSelect(themeItem.id)}
              >
                {themeItem.image ? (
                  <Image source={themeItem.image} style={styles.themePreview} contentFit="cover" />
                ) : (
                  <View
                    style={[
                      styles.themePreview,
                      {
                        backgroundColor: isDark ? '#1A1A1A' : '#E8E8E8',
                        justifyContent: 'center',
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <ThemedText style={{ color: theme.textSecondary }}>Default</ThemedText>
                  </View>
                )}
                <ThemedText
                  style={[styles.themeName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {themeItem.name}
                </ThemedText>
                {currentChatTheme === themeItem.id && (
                  <View style={[styles.themeCheck, { backgroundColor: theme.primary }]}>
                    <Feather name="check" size={12} color="#FFF" />
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
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
  themeModal: { margin: 20, borderRadius: 20, padding: 20, maxHeight: '80%' },
  themeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  themeTitle: { fontSize: 20, fontWeight: '700' },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  themeItem: {
    width: '31%',
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themePreview: {
    width: '100%',
    aspectRatio: 0.8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeName: { fontSize: 12, fontWeight: '500', textAlign: 'center', paddingVertical: 6 },
  themeCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
