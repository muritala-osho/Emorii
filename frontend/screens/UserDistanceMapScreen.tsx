import logger from '@/utils/logger';
import { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, Dimensions, ActivityIndicator, ScrollView } from "react-native";
import { Image } from "expo-image";
import { WebView } from "react-native-webview";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { getPhotoSource } from "@/utils/photos";
import { getApiBaseUrl } from "@/constants/config";
import * as Location from 'expo-location';

const { width, height } = Dimensions.get("window");

type UserDistanceMapScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "UserDistanceMap">;
type UserDistanceMapScreenRouteProp = RouteProp<RootStackParamList, "UserDistanceMap">;

interface UserDistanceMapScreenProps {
  navigation: UserDistanceMapScreenNavigationProp;
  route: UserDistanceMapScreenRouteProp;
}

interface WeatherData {
  temperature: number;
  weatherCode: number;
  humidity: number;
  windSpeed: number;
  description: string;
  icon: string;
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function getWeatherDescription(code: number): { description: string; icon: string } {
  const weatherCodes: { [key: number]: { description: string; icon: string } } = {
    0: { description: "Clear sky", icon: "weather-sunny" },
    1: { description: "Mainly clear", icon: "weather-sunny" },
    2: { description: "Partly cloudy", icon: "weather-partly-cloudy" },
    3: { description: "Overcast", icon: "weather-cloudy" },
    45: { description: "Foggy", icon: "weather-fog" },
    48: { description: "Rime fog", icon: "weather-fog" },
    51: { description: "Light drizzle", icon: "weather-rainy" },
    53: { description: "Moderate drizzle", icon: "weather-rainy" },
    55: { description: "Dense drizzle", icon: "weather-pouring" },
    61: { description: "Slight rain", icon: "weather-rainy" },
    63: { description: "Moderate rain", icon: "weather-rainy" },
    65: { description: "Heavy rain", icon: "weather-pouring" },
    71: { description: "Slight snow", icon: "weather-snowy" },
    73: { description: "Moderate snow", icon: "weather-snowy" },
    75: { description: "Heavy snow", icon: "weather-snowy-heavy" },
    77: { description: "Snow grains", icon: "weather-snowy" },
    80: { description: "Slight showers", icon: "weather-rainy" },
    81: { description: "Moderate showers", icon: "weather-rainy" },
    82: { description: "Violent showers", icon: "weather-pouring" },
    85: { description: "Slight snow showers", icon: "weather-snowy" },
    86: { description: "Heavy snow showers", icon: "weather-snowy-heavy" },
    95: { description: "Thunderstorm", icon: "weather-lightning" },
    96: { description: "Thunderstorm with hail", icon: "weather-lightning-rainy" },
    99: { description: "Thunderstorm with heavy hail", icon: "weather-lightning-rainy" },
  };
  return weatherCodes[code] || { description: "Unknown", icon: "weather-cloudy" };
}

export default function UserDistanceMapScreen({ navigation, route }: UserDistanceMapScreenProps) {
  const { otherUser } = route.params;
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  
  const [currentUserLocation, setCurrentUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  useEffect(() => {
    fetchCurrentLocation();
  }, []);

  const isValidLocation = (lat?: number, lng?: number): boolean => {
    if (lat === undefined || lng === undefined) return false;
    if (!isFinite(lat) || !isFinite(lng)) return false;
    if (lat === 0 && lng === 0) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    return true;
  };

  const fetchWeather = async (lat: number, lng: number) => {
    setWeatherLoading(true);
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
      );
      const data = await response.json();
      
      if (data.current) {
        const weatherInfo = getWeatherDescription(data.current.weather_code);
        setWeather({
          temperature: Math.round(data.current.temperature_2m),
          weatherCode: data.current.weather_code,
          humidity: data.current.relative_humidity_2m,
          windSpeed: Math.round(data.current.wind_speed_10m),
          description: weatherInfo.description,
          icon: weatherInfo.icon,
        });
      }
    } catch (error) {
      logger.error('Error fetching weather:', error);
    } finally {
      setWeatherLoading(false);
    }
  };

  const fetchCurrentLocation = async () => {
    setLoading(true);
    setLocationError(null);
    
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission not granted. Please enable location services.');
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      const freshLat = location.coords.latitude;
      const freshLng = location.coords.longitude;
      
      if (!isValidLocation(freshLat, freshLng)) {
        setLocationError('Could not get accurate location');
        setLoading(false);
        return;
      }
      
      setCurrentUserLocation({
        lat: freshLat,
        lng: freshLng,
      });

      const otherLoc = (() => {
        const loc = otherUser?.location;
        if (!loc) return null;
        if (loc.lat && loc.lng) return { lat: loc.lat, lng: loc.lng };
        if (loc.coordinates && Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
          return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
        }
        return null;
      })();
      if (otherLoc && isValidLocation(otherLoc.lat, otherLoc.lng)) {
        fetchWeather(otherLoc.lat, otherLoc.lng);
      }
      
      if (token) {
        try {
          await fetch(`${getApiBaseUrl()}/api/users/me`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              location: {
                type: 'Point',
                coordinates: [freshLng, freshLat],
                lat: freshLat,
                lng: freshLng,
              }
            }),
          });
        } catch (updateError) {
          logger.log('Could not update location on server:', updateError);
        }
      }
    } catch (error) {
      logger.error('Error getting location:', error);
      setLocationError('Could not get your current location. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const userLat = currentUserLocation?.lat ?? 0;
  const userLng = currentUserLocation?.lng ?? 0;
  
  const getOtherLocation = () => {
    const loc = otherUser?.location;
    if (!loc) return { lat: 0, lng: 0 };
    if (loc.lat && loc.lng) return { lat: loc.lat, lng: loc.lng };
    if (loc.coordinates && Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
      return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
    }
    return { lat: 0, lng: 0 };
  };
  
  const otherLocation = getOtherLocation();
  const otherLat = otherLocation.lat;
  const otherLng = otherLocation.lng;

  const hasValidLocations = 
    currentUserLocation !== null &&
    isValidLocation(currentUserLocation?.lat, currentUserLocation?.lng) &&
    isValidLocation(otherLat, otherLng);

  const distance = hasValidLocations 
    ? calculateDistance(userLat, userLng, otherLat, otherLng)
    : 0;

  const midLat = (userLat + otherLat) / 2;
  const midLng = (userLng + otherLng) / 2;

  const otherUserPhotoSource = otherUser?.photos?.[0] ? getPhotoSource(otherUser.photos[0]) : null;
  const otherUserPhoto = otherUserPhotoSource && typeof otherUserPhotoSource === 'object' && 'uri' in otherUserPhotoSource ? otherUserPhotoSource.uri : null;

  const escapedName = (otherUser?.name || 'User')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');

  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body, #map { width: 100%; height: 100%; background: #1a1a2e; }
        .custom-marker {
          background: #FF6B6B;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .you-marker {
          background: #4CAF50;
        }
        .marker-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .marker-label {
          position: absolute;
          top: -25px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.8);
          color: white;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
          z-index: 1000;
        }
        .distance-badge {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #FF6B6B, #FF8E53);
          color: white;
          padding: 8px 20px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 700;
          box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4);
          z-index: 1000;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <div class="distance-badge">${distance} km away</div>
      <script>
        var map = L.map('map', {
          zoomControl: false,
          attributionControl: false
        }).setView([${midLat || 0}, ${midLng || 0}], 12);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19
        }).addTo(map);
        
        ${hasValidLocations ? `
          var youIcon = L.divIcon({
            className: '',
            html: '<div style="position:relative"><div class="marker-label">You</div><div class="custom-marker you-marker" style="width:36px;height:36px;"></div></div>',
            iconSize: [36, 36],
            iconAnchor: [18, 18]
          });
          
          var otherIcon = L.divIcon({
            className: '',
            html: '<div style="position:relative"><div class="marker-label">${escapedName}</div><div class="custom-marker" style="width:44px;height:44px;">${otherUserPhoto ? `<img src="${otherUserPhoto}" class="marker-image" />` : ''}</div></div>',
            iconSize: [44, 44],
            iconAnchor: [22, 22]
          });
          
          L.marker([${userLat}, ${userLng}], {icon: youIcon}).addTo(map);
          L.marker([${otherLat}, ${otherLng}], {icon: otherIcon}).addTo(map);
          
          var latlngs = [
            [${userLat}, ${userLng}],
            [${otherLat}, ${otherLng}]
          ];
          L.polyline(latlngs, {
            color: '#FF6B6B',
            weight: 4,
            dashArray: '10, 10',
            opacity: 0.8
          }).addTo(map);
          
          map.fitBounds(latlngs, { padding: [80, 80] });
        ` : ''}
      </script>
    </body>
    </html>
  `;

  if (loading) {
    return (
      <ThemedView style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <ThemedText style={{ color: theme.text, marginTop: Spacing.md }}>Getting location...</ThemedText>
      </ThemedView>
    );
  }

  if (!user || !otherUser || locationError || !hasValidLocations) {
    return (
      <ThemedView style={[styles.container, styles.centerContent]}>
        <View style={styles.errorIconContainer}>
          <Feather name="map" size={48} color="#FF6B6B" />
        </View>
        <ThemedText style={{ color: theme.text, fontSize: 18, fontWeight: '600', marginTop: Spacing.md }}>
          {locationError || 'Location Unavailable'}
        </ThemedText>
        <ThemedText style={{ color: '#888', marginTop: Spacing.sm, textAlign: 'center', paddingHorizontal: Spacing.xl }}>
          {!hasValidLocations && !locationError 
            ? "This user hasn't shared their location yet" 
            : "Please enable location services to view distance"}
        </ThemedText>
        <Pressable
          style={[styles.backButtonLarge, { backgroundColor: theme.primary, marginTop: Spacing.xl }]}
          onPress={() => navigation.goBack()}
        >
          <ThemedText style={{ color: theme.buttonText }}>Go Back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.mapContainer}>
        <WebView
          source={{ html: mapHtml }}
          style={styles.map}
          scrollEnabled={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
        />
      </View>

      <Pressable
        style={[styles.backButton, { top: insets.top + Spacing.md }]}
        onPress={() => navigation.goBack()}
      >
        <Feather name="arrow-left" size={24} color="#FFF" />
      </Pressable>

      <View style={[styles.bottomCard, { paddingBottom: insets.bottom + Spacing.md }]}>
        <View style={styles.cardHandle} />
        
        <View style={styles.userInfoRow}>
          <View style={styles.userPhotoContainer}>
            {otherUserPhoto ? (
              <Image
                source={{ uri: otherUserPhoto }}
                style={styles.userPhoto}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.userPhoto, styles.noPhoto]}>
                <Feather name="user" size={24} color="#666" />
              </View>
            )}
            {otherUser.online && <View style={styles.onlineDot} />}
          </View>
          <View style={styles.userDetails}>
            <ThemedText style={styles.userName}>{otherUser.name}, {otherUser.age}</ThemedText>
            <View style={styles.distanceBadge}>
              <Feather name="navigation" size={12} color="#FF6B6B" />
              <ThemedText style={styles.distanceText}>{distance} km away</ThemedText>
            </View>
          </View>
        </View>

        {weather && (
          <View style={styles.weatherCard}>
            <View style={styles.weatherMain}>
              <MaterialCommunityIcons name={weather.icon as any} size={40} color="#FFD93D" />
              <View style={styles.weatherTempContainer}>
                <ThemedText style={styles.weatherTemp}>{weather.temperature}°C</ThemedText>
                <ThemedText style={styles.weatherDesc}>{weather.description}</ThemedText>
              </View>
            </View>
            <View style={styles.weatherDetails}>
              <View style={styles.weatherDetailItem}>
                <Feather name="droplet" size={14} color="#64B5F6" />
                <ThemedText style={styles.weatherDetailText}>{weather.humidity}%</ThemedText>
              </View>
              <View style={styles.weatherDetailItem}>
                <Feather name="wind" size={14} color="#81C784" />
                <ThemedText style={styles.weatherDetailText}>{weather.windSpeed} km/h</ThemedText>
              </View>
            </View>
          </View>
        )}

        {weatherLoading && (
          <View style={styles.weatherCard}>
            <ActivityIndicator size="small" color="#FF6B6B" />
            <ThemedText style={{ color: '#888', marginLeft: Spacing.sm }}>Loading weather...</ThemedText>
          </View>
        )}

        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.actionButton, { backgroundColor: '#FF6B6B' }]}
            onPress={() => navigation.navigate("ChatDetail", { userId: otherUser.id, userName: otherUser.name })}
          >
            <Feather name="message-circle" size={20} color="#FFF" />
            <ThemedText style={styles.actionButtonText}>Message</ThemedText>
          </Pressable>
          
          <Pressable
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={() => {
              navigation.goBack();
              navigation.navigate("ProfileDetail", { userId: otherUser.id });
            }}
          >
            <Feather name="user" size={20} color="#FFF" />
            <ThemedText style={styles.actionButtonText}>Profile</ThemedText>
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  mapContainer: {
    flex: 1,
    overflow: "hidden",
  },
  map: {
    flex: 1,
    backgroundColor: "#1a1a2e",
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
  backButtonLarge: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  errorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1E1E1E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  cardHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#444",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  userInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  userPhotoContainer: {
    position: "relative",
    marginRight: Spacing.md,
  },
  userPhoto: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  noPhoto: {
    backgroundColor: "#3A3A3A",
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#4CAF50",
    borderWidth: 2,
    borderColor: "#1E1E1E",
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
    marginBottom: 4,
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  distanceText: {
    fontSize: 13,
    color: "#FF6B6B",
    fontWeight: "600",
  },
  weatherCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#2A2A2A",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  weatherMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  weatherTempContainer: {
    marginLeft: Spacing.xs,
  },
  weatherTemp: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFF",
  },
  weatherDesc: {
    fontSize: 12,
    color: "#888",
  },
  weatherDetails: {
    alignItems: "flex-end",
    gap: 4,
  },
  weatherDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  weatherDetailText: {
    fontSize: 12,
    color: "#AAA",
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  secondaryButton: {
    backgroundColor: "#3A3A3A",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFF",
  },
});
