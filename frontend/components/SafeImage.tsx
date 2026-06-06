import React from 'react';
import { Image as ExpoImage, ImageProps as ExpoImageProps } from 'expo-image';
import { View } from 'react-native';

interface SafeImageProps extends Omit<ExpoImageProps, 'source'> {
  source?: any;
}

function normalizeImageSource(source: any): any {
  if (!source) return null;
  
  if (typeof source === 'number') return source;
  
  if (typeof source === 'string') {
    return { uri: source };
  }
  
  if (typeof source === 'object' && source.uri && typeof source.uri === 'string') {
    return source;
  }
  
  if (typeof source === 'object' && source.uri && typeof source.uri === 'object') {
    if (source.uri.url && typeof source.uri.url === 'string') {
      return { uri: source.uri.url };
    }
  }
  
  if (typeof source === 'object' && source.url && typeof source.url === 'string') {
    return { uri: source.url };
  }
  
  if (typeof source === 'object' && source.publicId && !source.uri && !source.url) {
    return null;
  }
  
  if (Array.isArray(source) && source.length > 0) {
    return normalizeImageSource(source[0]);
  }
  
  return null;
}

/**
 * SafeImage is a wrapper around expo-image that safely handles various source formats
 * and prevents "Cannot set prop 'source'" errors by normalizing image sources.
 */
export const SafeImage = React.forwardRef<any, SafeImageProps>(
  ({ source, ...props }, ref) => {
    const normalizedSource = normalizeImageSource(source);
    
    if (!normalizedSource) {
      return <View {...(props as any)} />;
    }
    
    return (
      <ExpoImage
        ref={ref}
        source={normalizedSource}
        style={[{ backgroundColor: 'transparent' }, props.style]}
        {...props}
      />
    );
  }
);

SafeImage.displayName = 'SafeImage';
