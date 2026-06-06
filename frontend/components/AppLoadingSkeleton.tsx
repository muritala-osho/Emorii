import { View, StyleSheet } from "react-native";
import { Skeleton } from "@/components/SkeletonLoader";
import { useTheme } from "@/hooks/useTheme";

export function AppLoadingSkeleton() {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <View style={styles.header}>
        <Skeleton width={140} height={22} borderRadius={12} />
        <Skeleton width={40} height={22} borderRadius={12} />
      </View>

      <View style={styles.content}>
        {Array.from({ length: 6 }).map((_, idx) => (
          <View key={idx} style={styles.item}>
            <Skeleton width={48} height={48} borderRadius={24} />
            <View style={styles.itemMeta}>
              <Skeleton width="55%" height={14} />
              <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.tabBar}>
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton key={idx} width={50} height={32} borderRadius={16} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  content: {
    flex: 1,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  itemMeta: {
    flex: 1,
    marginLeft: 12,
  },
  tabBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 30,
    paddingVertical: 12,
  },
});
