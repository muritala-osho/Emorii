import logger from '@/utils/logger';
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { translations, LanguageCode, TranslationKeys } from "@/constants/translations";

export type { LanguageCode } from "@/constants/translations";

const LANGUAGE_STORAGE_KEY = "app_language_preference";
const LANGUAGE_SYNCED_KEY = "app_language_synced";

export interface Language {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
}

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇵🇹" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili", flag: "🇰🇪" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá", flag: "🇳🇬" },
  { code: "ig", name: "Igbo", nativeName: "Igbo", flag: "🇳🇬" },
  { code: "ha", name: "Hausa", nativeName: "Hausa", flag: "🇳🇬" },
  { code: "zu", name: "Zulu", nativeName: "isiZulu", flag: "🇿🇦" },
  { code: "xh", name: "Xhosa", nativeName: "isiXhosa", flag: "🇿🇦" },
  { code: "am", name: "Amharic", nativeName: "አማርኛ", flag: "🇪🇹" },
];

interface LanguageContextType {
  language: LanguageCode;
  currentLanguage: Language;
  setLanguage: (code: LanguageCode) => void;
  syncFromProfile: (profileLanguage: string | undefined, userId?: string) => void;
  clearSyncFlag: (userId?: string) => Promise<void>;
  resetLanguage: () => void;
  languages: Language[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>("en");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadLanguagePreference();
  }, []);

  const loadLanguagePreference = async () => {
    try {
      const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored && LANGUAGES.find(l => l.code === stored)) {
        setLanguageState(stored as LanguageCode);
      }
    } catch (error) {
      logger.error("Error loading language preference:", error);
    } finally {
      setIsLoaded(true);
    }
  };

  const setLanguage = async (code: LanguageCode) => {
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
      setLanguageState(code);
    } catch (error) {
      logger.error("Error saving language preference:", error);
    }
  };

  const syncFromProfile = useCallback(async (profileLanguage: string | undefined, userId?: string) => {
    if (!profileLanguage || !userId) return;
    
    try {
      const userSyncKey = `${LANGUAGE_SYNCED_KEY}_${userId}`;
      const alreadySynced = await AsyncStorage.getItem(userSyncKey);
      const storedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      
      if (alreadySynced === 'true' && storedLanguage === profileLanguage) return;
      
      const validLanguage = LANGUAGES.find(l => l.code === profileLanguage);
      if (validLanguage) {
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, profileLanguage);
        await AsyncStorage.setItem(userSyncKey, 'true');
        setLanguageState(profileLanguage as LanguageCode);
      }
    } catch (error) {
      logger.error("Error syncing language from profile:", error);
    }
  }, []);

  const clearSyncFlag = useCallback(async (userId?: string) => {
    try {
      if (userId) {
        await AsyncStorage.removeItem(`${LANGUAGE_SYNCED_KEY}_${userId}`);
      }
    } catch (error) {
      logger.error("Error clearing language sync flag:", error);
    }
  }, []);

  const resetLanguage = useCallback(() => {
    setLanguageState("en");
  }, []);

  const currentLanguageValue = useMemo(() => LANGUAGES.find(l => l.code === language) || LANGUAGES[0], [language]);

  return (
    <LanguageContext.Provider 
      value={{ 
        language, 
        currentLanguage: currentLanguageValue, 
        setLanguage,
        syncFromProfile,
        clearSyncFlag,
        resetLanguage,
        languages: LANGUAGES 
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    return {
      language: "en" as LanguageCode,
      currentLanguage: LANGUAGES[0],
      setLanguage: () => {},
      syncFromProfile: (_lang?: string, _userId?: string) => {},
      clearSyncFlag: async (_userId?: string) => {},
      resetLanguage: () => {},
      languages: LANGUAGES,
    };
  }
  return context;
}

type TranslationKey = keyof TranslationKeys;

export function useTranslation() {
  const { language } = useLanguage();
  
  const t = useCallback((key: TranslationKey): string => {
    const langTranslations = translations[language];
    if (langTranslations && langTranslations[key]) {
      return langTranslations[key];
    }
    return translations.en[key] || key;
  }, [language]);
  
  return { t, language };
}
