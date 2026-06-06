import logger from '@/utils/logger';
import { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { getPhotoSource } from "@/utils/photos";
import * as Location from 'expo-location';
import { pushLiveLocation } from '@/utils/liveLocation';

type MapViewScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "MapView">;

interface MapViewScreenProps {
  navigation: MapViewScreenNavigationProp;
}

interface NearbyUser {
  id: string;
  _id?: string;
  name: string;
  age: number;
  photos?: any[];
  location?: { lat: number; lng: number };
  online?: boolean;
  distance?: number;
}

interface WeatherData {
  temperature: number;
  description: string;
  icon: string;
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;
  return Math.max(0, Number(distanceKm.toFixed(1)));
}

function getWeatherDescription(code: number): { description: string; icon: string } {
  const weatherCodes: { [key: number]: { description: string; icon: string } } = {
    0: { description: "Clear", icon: "weather-sunny" },
    1: { description: "Mainly clear", icon: "weather-sunny" },
    2: { description: "Partly cloudy", icon: "weather-partly-cloudy" },
    3: { description: "Overcast", icon: "weather-cloudy" },
    45: { description: "Foggy", icon: "weather-fog" },
    48: { description: "Rime fog", icon: "weather-fog" },
    51: { description: "Light drizzle", icon: "weather-rainy" },
    61: { description: "Slight rain", icon: "weather-rainy" },
    63: { description: "Moderate rain", icon: "weather-rainy" },
    71: { description: "Slight snow", icon: "weather-snowy" },
    80: { description: "Slight showers", icon: "weather-rainy" },
    95: { description: "Thunderstorm", icon: "weather-lightning" },
  };
  return weatherCodes[code] || { description: "Unknown", icon: "weather-cloudy" };
}

export default function MapViewScreen({ navigation }: MapViewScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { get } = useApi();
  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);

  useEffect(() => {
    initializeMap();
  }, []);

  const initializeMap = async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const lat = location.coords.latitude;
      const lng = location.coords.longitude;
      setCurrentLocation({ lat, lng });

      pushLiveLocation(token ?? undefined, { force: true }).catch(() => {});
      fetchWeather(lat, lng);
      await loadNearbyUsers(lat, lng);
    } catch (error) {
      logger.error("Error initializing map:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWeather = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`
      );
      const data = await response.json();
      
      if (data.current) {
        const weatherInfo = getWeatherDescription(data.current.weather_code);
        setWeather({
          temperature: Math.round(data.current.temperature_2m),
          description: weatherInfo.description,
          icon: weatherInfo.icon,
        });
      }
    } catch (error) {
      logger.error('Error fetching weather:', error);
    }
  };

  const loadNearbyUsers = async (lat: number, lng: number) => {
    if (!token) return;

    try {
      const response = await get<{ users: any[] }>(`/users/nearby?lat=${lat}&lng=${lng}&maxDistance=100`, token);
      
      if (response.success && response.data?.users) {
        const usersWithDistance = response.data.users
          .filter((u: any) => {
            if (u._id === user?.id) return false;
            const hasCoords = u.location?.coordinates?.length >= 2 &&
              !(u.location.coordinates[0] === 0 && u.location.coordinates[1] === 0);
            const hasLatLng = u.location?.lat && u.location?.lng;
            return hasCoords || hasLatLng;
          })
          .map((u: any) => {
            let userLat: number, userLng: number;
            if (u.location?.coordinates?.length >= 2 &&
                !(u.location.coordinates[0] === 0 && u.location.coordinates[1] === 0)) {
              userLng = u.location.coordinates[0];
              userLat = u.location.coordinates[1];
            } else {
              userLat = u.location.lat;
              userLng = u.location.lng;
            }
            return {
              id: u._id,
              name: u.name,
              age: u.age,
              photos: u.photos,
              location: { lat: userLat, lng: userLng },
              online: u.online,
              distance: u.distance != null ? u.distance : calculateDistance(lat, lng, userLat, userLng),
            };
          })
          .slice(0, 20);
        
        setUsers(usersWithDistance);
      }
    } catch (error) {
      logger.error("Error loading users:", error);
    }
  };

  const generateMapHtml = () => {
    if (!currentLocation) return '';

    const userMarkers = users.map(u => {
      const photo = u.photos?.[0] ? getPhotoSource(u.photos[0]) : null;
      const photoUrl = typeof photo === 'object' && photo?.uri ? photo.uri : '';
      const escapedName = (u.name || 'User')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;');
      
      return `
        var icon${u.id} = L.divIcon({
          className: '',
          html: '<div class="user-marker" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type:\\'select\\',id:\\'${u.id}\\'}))"><div class="marker-ring"></div>${photoUrl ? `<img src="${photoUrl}" class="marker-img" />` : '<div class="marker-placeholder"></div>'}<div class="marker-label">${escapedName}</div></div>',
          iconSize: [50, 60],
          iconAnchor: [25, 60]
        });
        L.marker([${u.location?.lat}, ${u.location?.lng}], {icon: icon${u.id}}).addTo(map);
      `;
    }).join('\n');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body, #map { width: 100%; height: 100%; background: #1a1a2e; }
          .user-marker {
            position: relative;
            cursor: pointer;
          }
          .marker-ring {
            position: absolute;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            border: 3px solid #FF6B6B;
            animation: pulse 2s infinite;
          }
          @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.5; }
            100% { transform: scale(1); opacity: 1; }
          }
          .marker-img {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: 3px solid #FF6B6B;
            object-fit: cover;
            position: absolute;
            top: 3px;
            left: 3px;
            background: #2a2a3e;
          }
          .marker-placeholder {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: 3px solid #FF6B6B;
            background: #3a3a4e;
            position: absolute;
            top: 3px;
            left: 3px;
          }
          .marker-label {
            position: absolute;
            top: 52px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 3px 8px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 600;
            white-space: nowrap;
          }
          .you-marker {
            width: 20px;
            height: 20px;
            background: #4CAF50;
            border-radius: 50%;
            border: 4px solid white;
            box-shadow: 0 0 20px rgba(76, 175, 80, 0.6);
          }
          .you-pulse {
            position: absolute;
            width: 60px;
            height: 60px;
            background: rgba(76, 175, 80, 0.3);
            border-radius: 50%;
            top: -20px;
            left: -20px;
            animation: youPulse 2s infinite;
          }
          @keyframes youPulse {
            0% { transform: scale(0.5); opacity: 1; }
            100% { transform: scale(1.5); opacity: 0; }
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: false,
            attributionControl: false
          }).setView([${currentLocation.lat}, ${currentLocation.lng}], 13);
          
          L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
          }).addTo(map);
          
          var youIcon = L.divIcon({
            className: '',
            html: '<div style="position:relative"><div class="you-pulse"></div><div class="you-marker"></div></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });
          L.marker([${currentLocation.lat}, ${currentLocation.lng}], {icon: youIcon}).addTo(map);
          
          ${userMarkers}
        </script>
      </body>
      </html>
    `;
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'select') {
        const selected = users.find(u => u.id === data.id);
        if (selected) setSelectedUser(selected);
      }
    } catch (e) {}
  };

  if (loading) {
    return (
      <ThemedView style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <ThemedText style={{ color: theme.text, marginTop: Spacing.md }}>
          Finding nearby people...
        </ThemedText>
      </ThemedView>
    );
  }

  if (!currentLocation) {
    return (
      <ThemedView style={[styles.container, styles.centerContent]}>
        <View style={styles.errorIconContainer}>
          <Feather name="map-pin" size={48} color="#FF6B6B" />
        </View>
        <ThemedText style={styles.errorTitle}>Location Required</ThemedText>
        <ThemedText style={styles.errorText}>
          Please enable location services to see nearby users on the map.
        </ThemedText>
        <Pressable
          style={styles.retryButton}
          onPress={initializeMap}
        >
          <ThemedText style={styles.retryButtonText}>Try Again</ThemedText>
        </Pressable>
        <Pressable style={styles.backButtonLarge} onPress={() => navigation.goBack()}>
          <ThemedText style={styles.backButtonLargeText}>Go Back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        source={{ html: generateMapHtml() }}
        style={styles.map}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleWebViewMessage}
      />

      <Pressable
        style={[styles.backButton, { top: insets.top + Spacing.md }]}
        onPress={() => navigation.goBack()}
      >
        <Feather name="arrow-left" size={24} color="#FFF" />
      </Pressable>

      <View style={[styles.headerCard, { top: insets.top + Spacing.md }]}>
        <ThemedText style={styles.headerTitle}>Nearby Users</ThemedText>
        <View style={styles.headerBadge}>
          <ThemedText style={styles.headerBadgeText}>{users.length} found</ThemedText>
        </View>
      </View>

      {weather && (
        <View style={[styles.weatherBadge, { top: insets.top + 70 }]}>
          <MaterialCommunityIcons name={weather.icon as any} size={18} color="#FFD93D" />
          <ThemedText style={styles.weatherText}>{weather.temperature}°C</ThemedText>
          <ThemedText style={styles.weatherDesc}>{weather.description}</ThemedText>
        </View>
      )}

      {selectedUser && (
        <View style={[styles.userCard, { bottom: insets.bottom + Spacing.lg }]}>
          <Pressable style={styles.closeCard} onPress={() => setSelectedUser(null)}>
            <Feather name="x" size={20} color="#888" />
          </Pressable>
          
          <View style={styles.cardContent}>
            {selectedUser.photos?.[0] ? (
              <Image
                source={getPhotoSource(selectedUser.photos[0])}
                style={styles.cardImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                <Feather name="user" size={32} color="#666" />
              </View>
            )}
            
            <View style={styles.cardInfo}>
              <ThemedText style={styles.cardName}>{selectedUser.name}, {selectedUser.age}</ThemedText>
              <View style={styles.cardDistanceRow}>
                <Feather name="navigation" size={12} color="#FF6B6B" />
                <ThemedText style={styles.cardDistance}>{selectedUser.distance} km away</ThemedText>
              </View>
            </View>
          </View>
          
          <View style={styles.cardButtons}>
            <Pressable
              style={styles.cardButtonPrimary}
              onPress={() => {
                setSelectedUser(null);
                navigation.navigate("UserDistanceMap", { otherUser: selectedUser });
              }}
            >
              <Feather name="map" size={18} color="#FFF" />
              <ThemedText style={styles.cardButtonText}>View Distance</ThemedText>
            </Pressable>
            <Pressable
              style={styles.cardButtonSecondary}
              onPress={() => {
                setSelectedUser(null);
                navigation.navigate("ProfileDetail", { userId: selectedUser.id });
              }}
            >
              <Feather name="user" size={18} color="#FFF" />
              <ThemedText style={styles.cardButtonText}>Profile</ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  map: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  errorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: Spacing.sm,
  },
  errorText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  retryButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  backButtonLarge: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  backButtonLargeText: {
    color: '#888',
    fontWeight: '600',
  },
  backButton: {
    position: "absolute",
    left: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCard: {
    position: 'absolute',
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    gap: 8,
  },
  headerTitle: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  headerBadge: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  headerBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  weatherBadge: {
    position: 'absolute',
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    gap: 6,
  },
  weatherText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  weatherDesc: {
    color: '#888',
    fontSize: 12,
  },
  userCard: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: Spacing.md,
  },
  closeCard: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  cardImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: Spacing.md,
  },
  cardImagePlaceholder: {
    backgroundColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  cardDistanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardDistance: {
    fontSize: 13,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  cardButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cardButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  cardButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3A3A3A',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  cardButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 13,
  },
});
