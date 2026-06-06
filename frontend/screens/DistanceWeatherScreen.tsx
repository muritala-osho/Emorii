import logger from '@/utils/logger';
import { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Dimensions,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ScreenScrollView } from "@/components/ScreenScrollView";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Image } from "expo-image";
import { getPhotoSource } from "@/utils/photos";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

export default function DistanceWeatherScreen() {
  const { theme } = useTheme();
  const { token, user: currentUser } = useAuth();
  const { get } = useApi();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { userId, userName } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [weather, setWeather] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      const userResponse = await get<any>(`/users/${userId}`, token || "");
      
      if (userResponse.success && userResponse.data?.user) {
        setOtherUser(userResponse.data.user);
        
        let locationResult = null;
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ 
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 5000,
              distanceInterval: 10
            });
            locationResult = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          }
        } catch (locError) {
          logger.log("Location unavailable");
        }
        
        const otherLoc = userResponse.data.user.location?.coordinates;
        
        if (locationResult) {
          setMyLocation(locationResult);
          if (otherLoc && otherLoc.length === 2) {
            const dist = calculateDistance(
              locationResult.lat,
              locationResult.lng,
              otherLoc[1],
              otherLoc[0]
            );
            setDistance(dist);
          }
          
          const weatherLat = otherLoc?.[1] || locationResult.lat;
          const weatherLng = otherLoc?.[0] || locationResult.lng;
          fetchWeather(weatherLat, weatherLng);
        } else if (otherLoc && otherLoc.length === 2) {
          fetchWeather(otherLoc[1], otherLoc[0]);
        }
      }
    } catch (error) {
      logger.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;
    return Math.max(0, Number(distanceKm.toFixed(1)));
  };

  const fetchWeather = async (lat: number, lng: number) => {
    setWeatherLoading(true);
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`
      );
      const data = await response.json();
      setWeather(data);
    } catch (error) {
      logger.error("Weather fetch error:", error);
    } finally {
      setWeatherLoading(false);
    }
  };

  const getWeatherIcon = (code: number): keyof typeof Ionicons.glyphMap => {
    if (code === 0) return "sunny";
    if (code <= 3) return "partly-sunny";
    if (code <= 48) return "cloudy";
    if (code <= 67) return "rainy";
    if (code <= 77) return "snow";
    if (code <= 82) return "rainy";
    return "thunderstorm";
  };

  const getWeatherDescription = (code: number): string => {
    const descriptions: { [key: number]: string } = {
      0: "Clear sky",
      1: "Mainly clear",
      2: "Partly cloudy",
      3: "Overcast",
      45: "Foggy",
      48: "Depositing rime fog",
      51: "Light drizzle",
      53: "Moderate drizzle",
      55: "Dense drizzle",
      61: "Slight rain",
      63: "Moderate rain",
      65: "Heavy rain",
      71: "Slight snow",
      73: "Moderate snow",
      75: "Heavy snow",
      80: "Slight rain showers",
      81: "Moderate rain showers",
      82: "Violent rain showers",
      95: "Thunderstorm",
    };
    return descriptions[code] || "Unknown";
  };

  const getWeatherGradient = (code: number): [string, string] => {
    if (code === 0 || code === 1) return ['#FFB74D', '#FF9800'];
    if (code <= 3) return ['#90CAF9', '#42A5F5'];
    if (code <= 48) return ['#B0BEC5', '#78909C'];
    if (code <= 67) return ['#64B5F6', '#1976D2'];
    if (code <= 77) return ['#E0E0E0', '#9E9E9E'];
    return ['#7986CB', '#3F51B5'];
  };

  const hasValidLocation = otherUser?.location?.coordinates && 
    Array.isArray(otherUser.location.coordinates) && 
    otherUser.location.coordinates.length === 2 &&
    otherUser.location.coordinates[0] !== 0 &&
    otherUser.location.coordinates[1] !== 0;

  const userPhoto = otherUser?.photos?.[0] ? getPhotoSource(otherUser.photos[0]) : null;

  if (loading) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText style={{ marginTop: Spacing.md }}>Loading...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenScrollView>
        {/* Header with User Photo */}
        <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
          <LinearGradient
            colors={[theme.primary, theme.primary + '80', 'transparent']}
            style={styles.headerGradient}
          />
          
          <View style={styles.headerRow}>
            <Pressable 
              style={[styles.backButton, { backgroundColor: 'rgba(255,255,255,0.2)' }]} 
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="chevron-back" size={24} color="#FFF" />
            </Pressable>
            <ThemedText style={styles.headerTitle}>Distance & Weather</ThemedText>
            <View style={{ width: 40 }} />
          </View>
          
          {/* User Info */}
          <View style={styles.userInfo}>
            <View style={styles.userPhotoContainer}>
              {userPhoto ? (
                <Image source={userPhoto} style={styles.userPhoto} contentFit="cover" />
              ) : (
                <View style={[styles.userPhoto, styles.noPhoto]}>
                  <Ionicons name="person" size={40} color="#999" />
                </View>
              )}
            </View>
            <ThemedText style={styles.userName}>{userName || otherUser?.name || 'User'}</ThemedText>
            {otherUser?.location?.city && (
              <View style={styles.locationPill}>
                <Ionicons name="location" size={14} color="#FFF" />
                <ThemedText style={styles.locationPillText}>
                  {otherUser.location.city}{otherUser.location.country ? `, ${otherUser.location.country}` : ''}
                </ThemedText>
              </View>
            )}
          </View>
        </View>

        <View style={styles.content}>
          {/* Distance & Weather Cards Row */}
          <View style={styles.cardsRow}>
            {/* Distance Card */}
            <View style={[styles.miniCard, { backgroundColor: theme.surface }]}>
              <View style={[styles.miniIconCircle, { backgroundColor: theme.primary + '20' }]}>
                <MaterialCommunityIcons name="map-marker-distance" size={24} color={theme.primary} />
              </View>
              <ThemedText style={[styles.miniCardLabel, { color: theme.textSecondary }]}>Distance</ThemedText>
              {distance !== null ? (
                <View style={styles.valueRow}>
                  <ThemedText style={[styles.miniCardValue, { color: theme.primary }]}>
                    {distance < 1 ? Math.round(distance * 1000) : distance.toFixed(1)}
                  </ThemedText>
                  <ThemedText style={[styles.miniCardUnit, { color: theme.textSecondary }]}>
                    {distance < 1 ? 'm' : 'km'}
                  </ThemedText>
                </View>
              ) : (
                <ThemedText style={[styles.miniCardValue, { color: theme.textSecondary, fontSize: 14 }]}>
                  {!myLocation ? 'No permission' : 'Not shared'}
                </ThemedText>
              )}
            </View>

            {/* Temperature Card */}
            <View style={[styles.miniCard, { backgroundColor: theme.surface }]}>
              <View style={[styles.miniIconCircle, { backgroundColor: '#FFB800' + '20' }]}>
                <Ionicons 
                  name={weather?.current?.weather_code !== undefined ? getWeatherIcon(weather.current.weather_code) : "cloudy"} 
                  size={24} 
                  color="#FFB800" 
                />
              </View>
              <ThemedText style={[styles.miniCardLabel, { color: theme.textSecondary }]}>Temperature</ThemedText>
              {weatherLoading ? (
                <ActivityIndicator size="small" color="#FFB800" />
              ) : weather?.current ? (
                <View style={styles.valueRow}>
                  <ThemedText style={[styles.miniCardValue, { color: '#FFB800' }]}>
                    {Math.round(weather.current.temperature_2m)}
                  </ThemedText>
                  <ThemedText style={[styles.miniCardUnit, { color: theme.textSecondary }]}>°C</ThemedText>
                </View>
              ) : (
                <ThemedText style={[styles.miniCardValue, { color: theme.textSecondary, fontSize: 14 }]}>
                  Unavailable
                </ThemedText>
              )}
            </View>
          </View>

          {/* Weather Details Card */}
          {weather?.current && (
            <View style={[styles.weatherCard, { backgroundColor: theme.surface }]}>
              <LinearGradient
                colors={getWeatherGradient(weather.current.weather_code)}
                style={styles.weatherCardGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.weatherCardContent}>
                  <Ionicons 
                    name={getWeatherIcon(weather.current.weather_code)} 
                    size={60} 
                    color="#FFF" 
                  />
                  <View style={styles.weatherCardText}>
                    <ThemedText style={styles.weatherTemp}>
                      {Math.round(weather.current.temperature_2m)}°C
                    </ThemedText>
                    <ThemedText style={styles.weatherDesc}>
                      {getWeatherDescription(weather.current.weather_code)}
                    </ThemedText>
                  </View>
                </View>
              </LinearGradient>
              
              <View style={styles.weatherStats}>
                <View style={[styles.statItem, { backgroundColor: theme.background }]}>
                  <Ionicons name="water" size={20} color="#4FC3F7" />
                  <ThemedText style={styles.statValue}>{weather.current.relative_humidity_2m}%</ThemedText>
                  <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>Humidity</ThemedText>
                </View>
                <View style={[styles.statItem, { backgroundColor: theme.background }]}>
                  <Feather name="wind" size={20} color="#81C784" />
                  <ThemedText style={styles.statValue}>{Math.round(weather.current.wind_speed_10m)} km/h</ThemedText>
                  <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>Wind Speed</ThemedText>
                </View>
              </View>
            </View>
          )}

          {/* Map Button */}
          {hasValidLocation ? (
            <Pressable
              style={({ pressed }) => [
                styles.mapButton, 
                { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 }
              ]}
              onPress={() => navigation.navigate('UserDistanceMap', { otherUser })}
            >
              <View style={styles.mapButtonContent}>
                <View style={styles.mapButtonIcon}>
                  <Feather name="map" size={24} color="#FFF" />
                </View>
                <View style={styles.mapButtonText}>
                  <ThemedText style={styles.mapButtonTitle}>View on Map</ThemedText>
                  <ThemedText style={styles.mapButtonSubtitle}>See exact location</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#FFF" />
              </View>
            </Pressable>
          ) : (
            <View style={[styles.mapButton, { backgroundColor: theme.surface }]}>
              <View style={styles.mapButtonContent}>
                <View style={[styles.mapButtonIcon, { backgroundColor: theme.textSecondary + '20' }]}>
                  <Feather name="map-pin" size={24} color={theme.textSecondary} />
                </View>
                <View style={styles.mapButtonText}>
                  <ThemedText style={[styles.mapButtonTitle, { color: theme.textSecondary }]}>Map Unavailable</ThemedText>
                  <ThemedText style={[styles.mapButtonSubtitle, { color: theme.textSecondary }]}>Location not shared</ThemedText>
                </View>
              </View>
            </View>
          )}
        </View>
      </ScreenScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContainer: {
    position: 'relative',
    paddingBottom: Spacing.xl,
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  userInfo: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  userPhotoContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  userPhoto: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#FFF',
  },
  noPhoto: {
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
    marginTop: Spacing.md,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: 4,
    marginTop: Spacing.sm,
  },
  locationPillText: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '500',
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  miniCard: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  miniIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  miniCardLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  miniCardValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  miniCardUnit: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  weatherCard: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  weatherCardGradient: {
    padding: Spacing.xl,
  },
  weatherCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  weatherCardText: {
    flex: 1,
  },
  weatherTemp: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFF',
  },
  weatherDesc: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
    marginTop: 4,
  },
  weatherStats: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: 4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  mapButton: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  mapButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  mapButtonIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapButtonText: {
    flex: 1,
  },
  mapButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  mapButtonSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
});
