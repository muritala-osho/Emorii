
import { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function normaliseLocations(raw: any[]): any[] {
  return raw.map((l: any) => ({
    ...l,
    _id: l._id ? String(l._id) : l.id ? String(l.id) : String(Date.now()),
  }));
}

export default function ManageLocationsScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { user, token, fetchUser } = useAuth();
  const { post, del } = useApi();
  const insets = useSafeAreaInsets();

  const [locations, setLocations]         = useState<any[]>([]);
  const [activeId, setActiveId]           = useState<string | null>(null);
  const [newLocation, setNewLocation]     = useState("");
  const [saving, setSaving]               = useState(false);
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [activatingId, setActivatingId]   = useState<string | null>(null);

  const isPremium = user?.premium?.isActive;

  // Keep locations + active id in sync with the user context
  useEffect(() => {
    if (user?.additionalLocations) {
      setLocations(normaliseLocations(user.additionalLocations as any[]));
    }
    const raw = (user as any)?.activeLocationId;
    setActiveId(raw ? String(raw) : null);
  }, [user?.additionalLocations, (user as any)?.activeLocationId]);

  // ---------- Activate / deactivate ----------

  const handleActivate = useCallback(async (locationId: string | null) => {
    // locationId = null  →  revert to GPS
    setActivatingId(locationId ?? '__gps__');

    // Optimistic
    setActiveId(locationId);

    try {
      const res = await post<{ success: boolean; activeLocationId?: string | null; message?: string }>(
        '/users/me/locations/active',
        { locationId },
        token ?? undefined,
      );

      if (res.success) {
        const serverActive = res.data?.activeLocationId ?? (res.data as any)?.activeLocationId ?? null;
        setActiveId(serverActive ? String(serverActive) : null);
        if (fetchUser) fetchUser().catch(() => {});
      } else {
        // Roll back optimistic change
        const raw = (user as any)?.activeLocationId;
        setActiveId(raw ? String(raw) : null);
        Alert.alert("Error", res.message || "Could not switch location");
      }
    } catch {
      const raw = (user as any)?.activeLocationId;
      setActiveId(raw ? String(raw) : null);
      Alert.alert("Error", "Could not switch location");
    } finally {
      setActivatingId(null);
    }
  }, [post, token, fetchUser, user]);

  // ---------- Add ----------

  const handleAddLocation = useCallback(async () => {
    if (!isPremium) {
      Alert.alert("Premium Feature", "Additional locations require Premium. Upgrade to unlock!");
      return;
    }
    const name = newLocation.trim();
    if (!name) {
      Alert.alert("Error", "Please enter a location name");
      return;
    }
    if (locations.length >= 3) {
      Alert.alert("Limit reached", "You can save a maximum of 3 additional locations.");
      return;
    }

    setSaving(true);
    const previous = locations;
    const tempId = `temp_${Date.now()}`;
    setLocations(prev => [...prev, { _id: tempId, name, optimistic: true }]);
    setNewLocation("");

    try {
      const res = await post<{ success: boolean; locations?: any[]; message?: string }>(
        '/users/me/locations',
        { name },
        token ?? undefined,
      );
      if (res.success && res.data) {
        const serverList: any[] = (res.data as any).locations ?? res.data?.locations ?? [];
        setLocations(normaliseLocations(serverList));
        if (fetchUser) fetchUser().catch(() => {});
      } else {
        setLocations(previous);
        setNewLocation(name);
        Alert.alert("Error", res.message || "Failed to add location");
      }
    } catch {
      setLocations(previous);
      setNewLocation(name);
      Alert.alert("Error", "An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }, [isPremium, newLocation, locations, post, token, fetchUser]);

  // ---------- Delete ----------

  const handleDeleteLocation = useCallback(async (id: string) => {
    setDeletingId(id);
    const previous = locations;
    const wasActive = activeId === id;
    setLocations(prev => prev.filter(l => String(l._id ?? l.id) !== id));
    if (wasActive) setActiveId(null);

    try {
      const res = await del<{ success: boolean; locations?: any[] }>(
        `/users/me/locations/${id}`,
        token ?? undefined,
      );
      if (res.success) {
        const serverList: any[] = (res.data as any)?.locations ?? res.data?.locations ?? [];
        setLocations(normaliseLocations(serverList));
        if (fetchUser) fetchUser().catch(() => {});
      } else {
        setLocations(previous);
        if (wasActive) setActiveId(id);
        Alert.alert("Error", "Failed to delete location");
      }
    } catch {
      setLocations(previous);
      if (wasActive) setActiveId(id);
      Alert.alert("Error", "Failed to delete location");
    } finally {
      setDeletingId(null);
    }
  }, [locations, activeId, del, token, fetchUser]);

  // ---------- Helpers ----------

  const gpsIsActive = !activeId;
  const activeLocation = locations.find(l => String(l._id) === activeId);

  // ---------- Render ----------

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Manage Locations</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={locations}
        keyExtractor={item => String(item._id ?? item.id ?? Math.random())}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            {/* GPS / Home location card */}
            <View style={[
              styles.gpsCard,
              { backgroundColor: theme.surface, borderColor: gpsIsActive ? theme.primary : theme.border },
              gpsIsActive && styles.activeCard,
            ]}>
              <View style={styles.gpsCardLeft}>
                <View style={[styles.iconCircle, { backgroundColor: gpsIsActive ? theme.primary + '20' : theme.border + '40' }]}>
                  <Ionicons name="navigate" size={20} color={gpsIsActive ? theme.primary : theme.textSecondary} />
                </View>
                <View style={styles.gpsCardText}>
                  <ThemedText style={styles.locationName}>GPS — {user?.livingIn || 'Current location'}</ThemedText>
                  <ThemedText style={[styles.locationSub, { color: theme.textSecondary }]}>
                    {gpsIsActive ? 'Discovery is using your real location' : 'Your default home location'}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.cardRight}>
                {gpsIsActive ? (
                  <View style={[styles.activeBadge, { backgroundColor: theme.primary }]}>
                    <ThemedText style={styles.activeBadgeText}>Active</ThemedText>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.useButton, { borderColor: theme.primary }]}
                    onPress={() => handleActivate(null)}
                    disabled={!!activatingId}
                  >
                    {activatingId === '__gps__' ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <ThemedText style={[styles.useButtonText, { color: theme.primary }]}>Use GPS</ThemedText>
                    )}
                  </Pressable>
                )}
              </View>
            </View>

            {/* Status banner when a saved location is active */}
            {activeLocation && (
              <View style={[styles.statusBanner, { backgroundColor: theme.primary + '15' }]}>
                <Ionicons name="information-circle-outline" size={18} color={theme.primary} />
                <ThemedText style={[styles.statusText, { color: theme.primary }]}>
                  Discovery is showing you people near <ThemedText style={styles.statusBold}>{activeLocation.city || activeLocation.name}</ThemedText>. People in your real location won't see your profile.
                </ThemedText>
              </View>
            )}

            {/* Add new location row */}
            <View style={styles.addSection}>
              <TextInput
                style={[styles.input, {
                  backgroundColor: theme.surface,
                  color: theme.text,
                  borderColor: theme.border,
                }]}
                placeholder={isPremium ? "Add location (e.g. London, NYC)" : "Upgrade to add locations"}
                placeholderTextColor={theme.textSecondary}
                value={newLocation}
                onChangeText={setNewLocation}
                editable={isPremium && !saving}
                returnKeyType="done"
                onSubmitEditing={handleAddLocation}
              />
              <Pressable
                style={[styles.addButton, { backgroundColor: isPremium && !saving ? theme.primary : theme.textSecondary }]}
                onPress={handleAddLocation}
                disabled={saving || !isPremium}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Feather name="plus" size={22} color="#FFF" />}
              </Pressable>
            </View>

            {!isPremium && (
              <View style={[styles.premiumNotice, { backgroundColor: theme.primary + '10' }]}>
                <Ionicons name="star" size={18} color={theme.primary} />
                <ThemedText style={[styles.premiumText, { color: theme.primary }]}>
                  Upgrade to Premium to save up to 3 extra locations and switch discovery origin instantly!
                </ThemedText>
              </View>
            )}

            {locations.length > 0 && (
              <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                SAVED LOCATIONS ({locations.length}/3)
              </ThemedText>
            )}
          </>
        }
        renderItem={({ item }) => {
          const itemId = String(item._id ?? item.id);
          const isActive   = activeId === itemId;
          const isDeleting  = deletingId === itemId;
          const isActivating = activatingId === itemId;

          return (
            <View style={[
              styles.locationCard,
              { backgroundColor: theme.surface, borderColor: isActive ? theme.primary : theme.border },
              isActive && styles.activeCard,
            ]}>
              {/* Left: icon + text */}
              <View style={styles.locationCardLeft}>
                <View style={[styles.iconCircle, { backgroundColor: isActive ? theme.primary + '20' : theme.border + '40' }]}>
                  <Ionicons name="location" size={18} color={isActive ? theme.primary : theme.textSecondary} />
                </View>
                <View style={styles.locationTextBlock}>
                  <ThemedText style={styles.locationName} numberOfLines={1}>{item.name}</ThemedText>
                  {(item.city || item.country) && (
                    <ThemedText style={[styles.locationSub, { color: theme.textSecondary }]} numberOfLines={1}>
                      {[item.city, item.country].filter(Boolean).join(', ')}
                    </ThemedText>
                  )}
                </View>
              </View>

              {/* Right: activate badge / button + delete */}
              <View style={styles.cardRight}>
                {isActive ? (
                  <View style={[styles.activeBadge, { backgroundColor: theme.primary }]}>
                    <MaterialIcons name="check-circle" size={13} color="#FFF" />
                    <ThemedText style={styles.activeBadgeText}>Active</ThemedText>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.useButton, { borderColor: theme.primary }]}
                    onPress={() => handleActivate(itemId)}
                    disabled={!!activatingId || !!deletingId}
                  >
                    {isActivating ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <ThemedText style={[styles.useButtonText, { color: theme.primary }]}>Use</ThemedText>
                    )}
                  </Pressable>
                )}

                <Pressable
                  onPress={() => handleDeleteLocation(itemId)}
                  disabled={isDeleting || !!activatingId}
                  style={styles.deleteButton}
                >
                  {isDeleting
                    ? <ActivityIndicator size="small" color="#FF3B30" />
                    : <Feather name="trash-2" size={18} color="#FF3B30" />}
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          isPremium ? (
            <View style={[styles.emptyBox, { borderColor: theme.border }]}>
              <Ionicons name="location-outline" size={36} color={theme.textSecondary} />
              <ThemedText style={[styles.emptyTitle, { color: theme.textSecondary }]}>No saved locations</ThemedText>
              <ThemedText style={[styles.emptyHint, { color: theme.textSecondary }]}>
                Type a city above and tap + to save it. Then tap "Use" on any card to make it your discovery origin.
              </ThemedText>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1 },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60 },
  headerTitle:      { fontSize: 18, fontWeight: '700' },
  backButton:       { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content:          { padding: 16, paddingBottom: 40 },

  // GPS card
  gpsCard:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 16, borderWidth: 1.5, marginBottom: 12 },
  activeCard:       { borderWidth: 1.5 },
  gpsCardLeft:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  gpsCardText:      { flex: 1 },
  iconCircle:       { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  // Status banner
  statusBanner:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, marginBottom: 16 },
  statusText:       { flex: 1, fontSize: 13, lineHeight: 18 },
  statusBold:       { fontWeight: '700' },

  // Add row
  addSection:       { flexDirection: 'row', gap: 10, marginBottom: 12 },
  input:            { flex: 1, height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 15, fontSize: 15 },
  addButton:        { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  // Premium notice
  premiumNotice:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, marginBottom: 16 },
  premiumText:      { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  // Section title
  sectionTitle:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },

  // Location card
  locationCard:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 16, borderWidth: 1.5, marginBottom: 10 },
  locationCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  locationTextBlock:{ flex: 1 },
  locationName:     { fontSize: 15, fontWeight: '600' },
  locationSub:      { fontSize: 12, marginTop: 1 },
  cardRight:        { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Active badge
  activeBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  activeBadgeText:  { fontSize: 12, fontWeight: '700', color: '#FFF' },

  // Use button
  useButton:        { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, minWidth: 56, alignItems: 'center' },
  useButtonText:    { fontSize: 13, fontWeight: '700' },

  // Delete button
  deleteButton:     { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  // Empty state
  emptyBox:         { alignItems: 'center', padding: 30, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', marginTop: 8 },
  emptyTitle:       { fontSize: 16, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  emptyHint:        { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
