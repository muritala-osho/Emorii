import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { ThemedText } from '@/components/ThemedText';
import { ScreenScrollView } from '@/components/ScreenScrollView';

export default function AddPromptScreen({ navigation }: any) {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ThemedText style={[styles.action, { color: theme.textSecondary }]}>
            Cancel
          </ThemedText>
        </TouchableOpacity>

        <ThemedText style={styles.title}>Add Prompt</ThemedText>

        <TouchableOpacity onPress={() => {/* save logic */}}>
          <ThemedText style={[styles.action, styles.saveAction, { color: theme.primary }]}>
            Save
          </ThemedText>
        </TouchableOpacity>
      </View>

      <ScreenScrollView>
        {/* prompt category list goes here */}
      </ScreenScrollView>
    </SafeAreaView>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  action: {
    fontSize: 16,
    minWidth: 56,
  },
  saveAction: {
    fontWeight: '600',
    textAlign: 'right',
  },
});