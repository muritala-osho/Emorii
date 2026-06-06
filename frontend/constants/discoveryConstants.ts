export const FALLBACK_COUNTRIES = [
  'Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Tanzania', 'Uganda',
  'Ethiopia', 'Cameroon', 'Senegal', 'Ivory Coast', 'Zimbabwe',
  'USA', 'UK', 'Canada', 'France', 'Germany', 'Brazil', 'India',
  'Australia', 'UAE', 'Japan', 'Netherlands', 'Italy', 'Spain',
];

export const PASSPORT_CITIES = [
  // Africa
  { name: 'Lagos', lat: 6.5244, lng: 3.3792, country: 'Nigeria' },
  { name: 'Abuja', lat: 9.0765, lng: 7.3986, country: 'Nigeria' },
  { name: 'Kano', lat: 12.0022, lng: 8.5920, country: 'Nigeria' },
  { name: 'Nairobi', lat: -1.2921, lng: 36.8219, country: 'Kenya' },
  { name: 'Mombasa', lat: -4.0435, lng: 39.6682, country: 'Kenya' },
  { name: 'Accra', lat: 5.6037, lng: -0.1870, country: 'Ghana' },
  { name: 'Johannesburg', lat: -26.2041, lng: 28.0473, country: 'South Africa' },
  { name: 'Cape Town', lat: -33.9249, lng: 18.4241, country: 'South Africa' },
  { name: 'Durban', lat: -29.8587, lng: 31.0218, country: 'South Africa' },
  { name: 'Addis Ababa', lat: 9.0320, lng: 38.7469, country: 'Ethiopia' },
  { name: 'Dar es Salaam', lat: -6.7924, lng: 39.2083, country: 'Tanzania' },
  { name: 'Kampala', lat: 0.3476, lng: 32.5825, country: 'Uganda' },
  { name: 'Dakar', lat: 14.7167, lng: -17.4677, country: 'Senegal' },
  { name: 'Abidjan', lat: 5.3600, lng: -4.0083, country: 'Ivory Coast' },
  { name: 'Douala', lat: 4.0511, lng: 9.7679, country: 'Cameroon' },
  { name: 'Yaoundé', lat: 3.8480, lng: 11.5021, country: 'Cameroon' },
  { name: 'Harare', lat: -17.8252, lng: 31.0335, country: 'Zimbabwe' },
  { name: 'Lusaka', lat: -15.3875, lng: 28.3228, country: 'Zambia' },
  { name: 'Kigali', lat: -1.9441, lng: 30.0619, country: 'Rwanda' },
  { name: 'Maputo', lat: -25.9692, lng: 32.5732, country: 'Mozambique' },
  { name: 'Luanda', lat: -8.8368, lng: 13.2343, country: 'Angola' },
  { name: 'Conakry', lat: 9.6412, lng: -13.5784, country: 'Guinea' },
  { name: 'Bamako', lat: 12.6392, lng: -8.0029, country: 'Mali' },
  { name: 'Lomé', lat: 6.1375, lng: 1.2123, country: 'Togo' },
  { name: 'Cotonou', lat: 6.3703, lng: 2.3912, country: 'Benin' },
  { name: 'Freetown', lat: 8.4657, lng: -13.2317, country: 'Sierra Leone' },
  { name: 'Monrovia', lat: 6.2907, lng: -10.7605, country: 'Liberia' },
  { name: 'Ouagadougou', lat: 12.3647, lng: -1.5339, country: 'Burkina Faso' },
  { name: 'Niamey', lat: 13.5137, lng: 2.1098, country: 'Niger' },
  { name: 'N\'Djamena', lat: 12.1048, lng: 15.0445, country: 'Chad' },
  { name: 'Libreville', lat: 0.3901, lng: 9.4544, country: 'Gabon' },
  { name: 'Malabo', lat: 3.7500, lng: 8.7833, country: 'Equatorial Guinea' },
  { name: 'Brazzaville', lat: -4.2634, lng: 15.2429, country: 'Congo' },
  { name: 'Kinshasa', lat: -4.3217, lng: 15.3219, country: 'DR Congo' },
  { name: 'Antananarivo', lat: -18.9137, lng: 47.5361, country: 'Madagascar' },
  { name: 'Port Louis', lat: -20.1609, lng: 57.4990, country: 'Mauritius' },
  { name: 'Gaborone', lat: -24.6282, lng: 25.9231, country: 'Botswana' },
  { name: 'Windhoek', lat: -22.5609, lng: 17.0658, country: 'Namibia' },
  { name: 'Cairo', lat: 30.0444, lng: 31.2357, country: 'Egypt' },
  { name: 'Alexandria', lat: 31.2001, lng: 29.9187, country: 'Egypt' },
  { name: 'Casablanca', lat: 33.5731, lng: -7.5898, country: 'Morocco' },
  { name: 'Tunis', lat: 36.8065, lng: 10.1815, country: 'Tunisia' },
  { name: 'Algiers', lat: 36.7372, lng: 3.0865, country: 'Algeria' },
  { name: 'Tripoli', lat: 32.8872, lng: 13.1913, country: 'Libya' },
  { name: 'Khartoum', lat: 15.5007, lng: 32.5599, country: 'Sudan' },
  // Europe
  { name: 'London', lat: 51.5074, lng: -0.1278, country: 'UK' },
  { name: 'Manchester', lat: 53.4808, lng: -2.2426, country: 'UK' },
  { name: 'Birmingham', lat: 52.4862, lng: -1.8904, country: 'UK' },
  { name: 'Paris', lat: 48.8566, lng: 2.3522, country: 'France' },
  { name: 'Lyon', lat: 45.7640, lng: 4.8357, country: 'France' },
  { name: 'Marseille', lat: 43.2965, lng: 5.3698, country: 'France' },
  { name: 'Berlin', lat: 52.5200, lng: 13.4050, country: 'Germany' },
  { name: 'Munich', lat: 48.1351, lng: 11.5820, country: 'Germany' },
  { name: 'Hamburg', lat: 53.5753, lng: 10.0153, country: 'Germany' },
  { name: 'Frankfurt', lat: 50.1109, lng: 8.6821, country: 'Germany' },
  { name: 'Amsterdam', lat: 52.3676, lng: 4.9041, country: 'Netherlands' },
  { name: 'Rotterdam', lat: 51.9244, lng: 4.4777, country: 'Netherlands' },
  { name: 'Madrid', lat: 40.4168, lng: -3.7038, country: 'Spain' },
  { name: 'Barcelona', lat: 41.3851, lng: 2.1734, country: 'Spain' },
  { name: 'Rome', lat: 41.9028, lng: 12.4964, country: 'Italy' },
  { name: 'Milan', lat: 45.4654, lng: 9.1859, country: 'Italy' },
  { name: 'Naples', lat: 40.8518, lng: 14.2681, country: 'Italy' },
  { name: 'Lisbon', lat: 38.7223, lng: -9.1393, country: 'Portugal' },
  { name: 'Brussels', lat: 50.8503, lng: 4.3517, country: 'Belgium' },
  { name: 'Vienna', lat: 48.2082, lng: 16.3738, country: 'Austria' },
  { name: 'Zurich', lat: 47.3769, lng: 8.5417, country: 'Switzerland' },
  { name: 'Geneva', lat: 46.2044, lng: 6.1432, country: 'Switzerland' },
  { name: 'Stockholm', lat: 59.3293, lng: 18.0686, country: 'Sweden' },
  { name: 'Oslo', lat: 59.9139, lng: 10.7522, country: 'Norway' },
  { name: 'Copenhagen', lat: 55.6761, lng: 12.5683, country: 'Denmark' },
  { name: 'Helsinki', lat: 60.1699, lng: 24.9384, country: 'Finland' },
  { name: 'Athens', lat: 37.9838, lng: 23.7275, country: 'Greece' },
  { name: 'Warsaw', lat: 52.2297, lng: 21.0122, country: 'Poland' },
  { name: 'Prague', lat: 50.0755, lng: 14.4378, country: 'Czech Republic' },
  { name: 'Budapest', lat: 47.4979, lng: 19.0402, country: 'Hungary' },
  { name: 'Bucharest', lat: 44.4268, lng: 26.1025, country: 'Romania' },
  { name: 'Kiev', lat: 50.4501, lng: 30.5234, country: 'Ukraine' },
  { name: 'Dublin', lat: 53.3498, lng: -6.2603, country: 'Ireland' },
  { name: 'Edinburgh', lat: 55.9533, lng: -3.1883, country: 'UK' },
  { name: 'Moscow', lat: 55.7558, lng: 37.6173, country: 'Russia' },
  { name: 'St. Petersburg', lat: 59.9311, lng: 30.3609, country: 'Russia' },
  // North America
  { name: 'New York', lat: 40.7128, lng: -74.0060, country: 'USA' },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, country: 'USA' },
  { name: 'Chicago', lat: 41.8781, lng: -87.6298, country: 'USA' },
  { name: 'Houston', lat: 29.7604, lng: -95.3698, country: 'USA' },
  { name: 'Atlanta', lat: 33.7490, lng: -84.3880, country: 'USA' },
  { name: 'Miami', lat: 25.7617, lng: -80.1918, country: 'USA' },
  { name: 'Dallas', lat: 32.7767, lng: -96.7970, country: 'USA' },
  { name: 'Washington DC', lat: 38.9072, lng: -77.0369, country: 'USA' },
  { name: 'Philadelphia', lat: 39.9526, lng: -75.1652, country: 'USA' },
  { name: 'Phoenix', lat: 33.4484, lng: -112.0740, country: 'USA' },
  { name: 'San Francisco', lat: 37.7749, lng: -122.4194, country: 'USA' },
  { name: 'Seattle', lat: 47.6062, lng: -122.3321, country: 'USA' },
  { name: 'Boston', lat: 42.3601, lng: -71.0589, country: 'USA' },
  { name: 'Toronto', lat: 43.6532, lng: -79.3832, country: 'Canada' },
  { name: 'Vancouver', lat: 49.2827, lng: -123.1207, country: 'Canada' },
  { name: 'Montreal', lat: 45.5017, lng: -73.5673, country: 'Canada' },
  { name: 'Calgary', lat: 51.0447, lng: -114.0719, country: 'Canada' },
  { name: 'Mexico City', lat: 19.4326, lng: -99.1332, country: 'Mexico' },
  { name: 'Guadalajara', lat: 20.6597, lng: -103.3496, country: 'Mexico' },
  { name: 'Kingston', lat: 17.9970, lng: -76.7936, country: 'Jamaica' },
  { name: 'Port of Spain', lat: 10.6549, lng: -61.5019, country: 'Trinidad' },
  { name: 'Havana', lat: 23.1136, lng: -82.3666, country: 'Cuba' },
  // South America
  { name: 'São Paulo', lat: -23.5505, lng: -46.6333, country: 'Brazil' },
  { name: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729, country: 'Brazil' },
  { name: 'Brasília', lat: -15.7942, lng: -47.8825, country: 'Brazil' },
  { name: 'Buenos Aires', lat: -34.6037, lng: -58.3816, country: 'Argentina' },
  { name: 'Santiago', lat: -33.4569, lng: -70.6483, country: 'Chile' },
  { name: 'Bogotá', lat: 4.7110, lng: -74.0721, country: 'Colombia' },
  { name: 'Lima', lat: -12.0464, lng: -77.0428, country: 'Peru' },
  { name: 'Caracas', lat: 10.4806, lng: -66.9036, country: 'Venezuela' },
  { name: 'Quito', lat: -0.1807, lng: -78.4678, country: 'Ecuador' },
  // Middle East
  { name: 'Dubai', lat: 25.2048, lng: 55.2708, country: 'UAE' },
  { name: 'Abu Dhabi', lat: 24.4539, lng: 54.3773, country: 'UAE' },
  { name: 'Riyadh', lat: 24.7136, lng: 46.6753, country: 'Saudi Arabia' },
  { name: 'Jeddah', lat: 21.4858, lng: 39.1925, country: 'Saudi Arabia' },
  { name: 'Doha', lat: 25.2854, lng: 51.5310, country: 'Qatar' },
  { name: 'Kuwait City', lat: 29.3759, lng: 47.9774, country: 'Kuwait' },
  { name: 'Muscat', lat: 23.5880, lng: 58.3829, country: 'Oman' },
  { name: 'Manama', lat: 26.2285, lng: 50.5860, country: 'Bahrain' },
  { name: 'Beirut', lat: 33.8938, lng: 35.5018, country: 'Lebanon' },
  { name: 'Amman', lat: 31.9454, lng: 35.9284, country: 'Jordan' },
  { name: 'Istanbul', lat: 41.0082, lng: 28.9784, country: 'Türkiye' },
  { name: 'Ankara', lat: 39.9334, lng: 32.8597, country: 'Türkiye' },
  { name: 'Tel Aviv', lat: 32.0853, lng: 34.7818, country: 'Israel' },
  // Asia
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, country: 'Japan' },
  { name: 'Osaka', lat: 34.6937, lng: 135.5023, country: 'Japan' },
  { name: 'Beijing', lat: 39.9042, lng: 116.4074, country: 'China' },
  { name: 'Shanghai', lat: 31.2304, lng: 121.4737, country: 'China' },
  { name: 'Guangzhou', lat: 23.1291, lng: 113.2644, country: 'China' },
  { name: 'Shenzhen', lat: 22.5431, lng: 114.0579, country: 'China' },
  { name: 'Hong Kong', lat: 22.3193, lng: 114.1694, country: 'Hong Kong' },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198, country: 'Singapore' },
  { name: 'Bangkok', lat: 13.7563, lng: 100.5018, country: 'Thailand' },
  { name: 'Kuala Lumpur', lat: 3.1390, lng: 101.6869, country: 'Malaysia' },
  { name: 'Jakarta', lat: -6.2088, lng: 106.8456, country: 'Indonesia' },
  { name: 'Bali', lat: -8.3405, lng: 115.0920, country: 'Indonesia' },
  { name: 'Manila', lat: 14.5995, lng: 120.9842, country: 'Philippines' },
  { name: 'Seoul', lat: 37.5665, lng: 126.9780, country: 'South Korea' },
  { name: 'Busan', lat: 35.1796, lng: 129.0756, country: 'South Korea' },
  { name: 'Mumbai', lat: 19.0760, lng: 72.8777, country: 'India' },
  { name: 'Delhi', lat: 28.6139, lng: 77.2090, country: 'India' },
  { name: 'Bengaluru', lat: 12.9716, lng: 77.5946, country: 'India' },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707, country: 'India' },
  { name: 'Hyderabad', lat: 17.3850, lng: 78.4867, country: 'India' },
  { name: 'Dhaka', lat: 23.8103, lng: 90.4125, country: 'Bangladesh' },
  { name: 'Colombo', lat: 6.9271, lng: 79.8612, country: 'Sri Lanka' },
  { name: 'Kathmandu', lat: 27.7172, lng: 85.3240, country: 'Nepal' },
  { name: 'Karachi', lat: 24.8607, lng: 67.0011, country: 'Pakistan' },
  { name: 'Lahore', lat: 31.5204, lng: 74.3587, country: 'Pakistan' },
  { name: 'Islamabad', lat: 33.6844, lng: 73.0479, country: 'Pakistan' },
  { name: 'Ho Chi Minh City', lat: 10.8231, lng: 106.6297, country: 'Vietnam' },
  { name: 'Hanoi', lat: 21.0285, lng: 105.8542, country: 'Vietnam' },
  { name: 'Phnom Penh', lat: 11.5564, lng: 104.9282, country: 'Cambodia' },
  { name: 'Yangon', lat: 16.8661, lng: 96.1951, country: 'Myanmar' },
  { name: 'Vientiane', lat: 17.9757, lng: 102.6331, country: 'Laos' },
  { name: 'Taipei', lat: 25.0330, lng: 121.5654, country: 'Taiwan' },
  { name: 'Ulaanbaatar', lat: 47.8864, lng: 106.9057, country: 'Mongolia' },
  // Oceania
  { name: 'Sydney', lat: -33.8688, lng: 151.2093, country: 'Australia' },
  { name: 'Melbourne', lat: -37.8136, lng: 144.9631, country: 'Australia' },
  { name: 'Brisbane', lat: -27.4698, lng: 153.0251, country: 'Australia' },
  { name: 'Perth', lat: -31.9505, lng: 115.8605, country: 'Australia' },
  { name: 'Auckland', lat: -36.8509, lng: 174.7645, country: 'New Zealand' },
];

export interface DiscoverUser {
  id: string;
  name: string;
  age: number | null;
  livingIn?: string;
  bio: string;
  photos: any[];
  interests: string[];
  online: boolean | null;
  distance: number | null;
  similarityScore?: number;
  sharedInterests?: string[];
  favoriteSong?: {
    title?: string;
    artist?: string;
    albumArt?: string;
    spotifyUri?: string;
    previewUrl?: string;
  };
  isBoosted?: boolean;
  gender?: string;
  verified?: boolean;
  location?: {
    city?: string;
    state?: string;
  };
  religion?: string;
  personalityType?: string;
  needsVerification?: boolean;
  premium?: { isActive: boolean };
}
