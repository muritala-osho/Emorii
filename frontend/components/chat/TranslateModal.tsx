import React from 'react';
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';

const QUICK_LANGS = [
  'English',
  'French',
  'Spanish',
  'Turkish',
  'Arabic',
  'Portuguese',
  'Swahili',
  'Yoruba',
  'Hausa',
  'Amharic',
  'Zulu',
  'Somali',
  'Igbo',
];

type Props = {
  visible: boolean;
  theme: any;
  isDark: boolean;
  selectedMessage: any | null;
  translateTargetLang: string;
  translatedText: string;
  translating: boolean;
  savedTranslateLang: string;
  onClose: () => void;
  onSetLang: (lang: string) => void;
  onTranslate: (lang: string) => void;
  onCopyTranslation: () => void;
  onClearTranslation: () => void;
};

export default function TranslateModal({
  visible,
  theme,
  isDark,
  selectedMessage,
  translateTargetLang,
  translatedText,
  translating,
  savedTranslateLang,
  onClose,
  onSetLang,
  onTranslate,
  onCopyTranslation,
  onClearTranslation,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
        >
          <View style={[styles.translateModal, { backgroundColor: theme.background }]}>
            <View style={styles.translateHeader}>
              <ThemedText style={[styles.translateTitle, { color: theme.text }]}>
                Translate Message
              </ThemedText>
              <Pressable onPress={onClose}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            {selectedMessage && (
              <View
                style={[
                  styles.translateOriginal,
                  { backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5' },
                ]}
              >
                <ThemedText
                  style={[styles.translateOriginalLabel, { color: theme.textSecondary }]}
                >
                  Original
                </ThemedText>
                <ThemedText
                  style={[styles.translateOriginalText, { color: theme.text }]}
                  numberOfLines={3}
                >
                  {selectedMessage.content || selectedMessage.text || ''}
                </ThemedText>
              </View>
            )}
            {translating ? (
              <View style={styles.translateLoading}>
                <ActivityIndicator size="large" color={theme.primary} />
                <ThemedText
                  style={[styles.translateLoadingText, { color: theme.textSecondary }]}
                >
                  Translating...
                </ThemedText>
              </View>
            ) : translatedText ? (
              <View
                style={[
                  styles.translateResult,
                  { backgroundColor: theme.primary + '15', borderColor: theme.primary },
                ]}
              >
                <ThemedText style={[styles.translateResultLabel, { color: theme.primary }]}>
                  Translation ({translateTargetLang})
                </ThemedText>
                <ThemedText style={[styles.translateResultText, { color: theme.text }]}>
                  {translatedText}
                </ThemedText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    style={[
                      styles.translateCopyBtn,
                      { backgroundColor: theme.primary, flex: 1 },
                    ]}
                    onPress={onCopyTranslation}
                  >
                    <Feather name="copy" size={16} color="#FFF" />
                    <ThemedText style={styles.translateCopyText}>Copy</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.translateCopyBtn,
                      { backgroundColor: isDark ? '#333' : '#E0E0E0', flex: 1 },
                    ]}
                    onPress={() => {
                      onClearTranslation();
                      onSetLang(savedTranslateLang);
                    }}
                  >
                    <MaterialCommunityIcons name="translate" size={16} color={theme.text} />
                    <ThemedText style={[styles.translateCopyText, { color: theme.text }]}>
                      Retranslate
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View>
                <ThemedText
                  style={[styles.translatePickLabel, { color: theme.textSecondary }]}
                >
                  Quick pick or type a language
                </ThemedText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  style={{ marginBottom: 10 }}
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                >
                  {QUICK_LANGS.map(lang => (
                    <Pressable
                      key={lang}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor:
                          translateTargetLang === lang
                            ? theme.primary
                            : isDark
                            ? 'rgba(255,255,255,0.15)'
                            : 'rgba(0,0,0,0.12)',
                        backgroundColor:
                          translateTargetLang === lang ? theme.primary + '22' : 'transparent',
                      }}
                      onPress={() => onSetLang(lang)}
                    >
                      <ThemedText
                        style={{
                          fontSize: 13,
                          color:
                            translateTargetLang === lang ? theme.primary : theme.textSecondary,
                        }}
                      >
                        {lang}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
                <TextInput
                  style={[
                    styles.translateLangInput,
                    {
                      color: theme.text,
                      backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5',
                      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    },
                  ]}
                  placeholder="Or type any language..."
                  placeholderTextColor={theme.textSecondary}
                  value={translateTargetLang}
                  onChangeText={onSetLang}
                />
                <Pressable
                  style={[
                    styles.translateButton,
                    {
                      backgroundColor: theme.primary,
                      opacity: translateTargetLang.trim() ? 1 : 0.5,
                    },
                  ]}
                  onPress={() =>
                    translateTargetLang.trim() && onTranslate(translateTargetLang.trim())
                  }
                  disabled={!translateTargetLang.trim()}
                >
                  <MaterialCommunityIcons name="translate" size={20} color="#FFF" />
                  <ThemedText style={styles.translateButtonText}>Translate</ThemedText>
                </Pressable>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
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
  translateModal: { margin: 20, borderRadius: 20, padding: 24, maxHeight: '80%' },
  translateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  translateTitle: { fontSize: 20, fontWeight: '700' },
  translateOriginal: { padding: 12, borderRadius: 12, marginBottom: 16 },
  translateOriginalLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  translateOriginalText: { fontSize: 14 },
  translateLoading: { alignItems: 'center', paddingVertical: 40 },
  translateLoadingText: { marginTop: 12, fontSize: 14 },
  translateResult: { padding: 16, borderRadius: 12, borderWidth: 1, gap: 12 },
  translateResultLabel: { fontSize: 12, fontWeight: '700' },
  translateResultText: { fontSize: 16, lineHeight: 22 },
  translateCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  translateCopyText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  translatePickLabel: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  translateLangInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    marginBottom: 16,
  },
  translateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  translateButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
