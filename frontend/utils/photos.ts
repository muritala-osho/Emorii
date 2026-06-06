export const PHOTO_PLACEHOLDERS = {
  "placeholder-1": require("@/assets/images/placeholder-1.webp"),
  "placeholder-2": require("@/assets/images/placeholder-2.webp"),
  "placeholder-3": require("@/assets/images/placeholder-3.webp"),
  "placeholder-4": require("@/assets/images/placeholder-4.webp"),
  "placeholder-5": require("@/assets/images/placeholder-5.webp"),
  "placeholder-6": require("@/assets/images/placeholder-6.webp"),
  "placeholder-7": require("@/assets/images/placeholder-7.webp"),
  "placeholder-8": require("@/assets/images/placeholder-8.webp"),
};

export const PHOTO_PLACEHOLDER_ARRAY = [
  { id: "placeholder-1", source: require("@/assets/images/placeholder-1.webp") },
  { id: "placeholder-2", source: require("@/assets/images/placeholder-2.webp") },
  { id: "placeholder-3", source: require("@/assets/images/placeholder-3.webp") },
  { id: "placeholder-4", source: require("@/assets/images/placeholder-4.webp") },
  { id: "placeholder-5", source: require("@/assets/images/placeholder-5.webp") },
  { id: "placeholder-6", source: require("@/assets/images/placeholder-6.webp") },
  { id: "placeholder-7", source: require("@/assets/images/placeholder-7.webp") },
  { id: "placeholder-8", source: require("@/assets/images/placeholder-8.webp") },
];

interface PhotoObject {
  url?: string;
  publicId?: string;
  isPrimary?: boolean;
  privacy?: string;
  order?: number;
}

export function getPhotoSource(photo: string | PhotoObject | null | undefined): { uri: string } | number | null {
  if (!photo) return null;
  
  if (typeof photo === 'string') {
    if (photo.startsWith('http://') || photo.startsWith('https://')) {
      return { uri: photo };
    }
    return PHOTO_PLACEHOLDERS[photo as keyof typeof PHOTO_PLACEHOLDERS] || null;
  }
  
  if (typeof photo === 'object' && photo.url) {
    if (photo.url.startsWith('http://') || photo.url.startsWith('https://')) {
      return { uri: photo.url };
    }
    return PHOTO_PLACEHOLDERS[photo.url as keyof typeof PHOTO_PLACEHOLDERS] || null;
  }
  
  return null;
}
