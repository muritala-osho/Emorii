import { Text, StyleSheet } from 'react-native';

interface PremiumBadgeProps {
  size?: 'small' | 'medium' | 'large';
  style?: any;
}

const FONT_SIZES = {
  small: 18,
  medium: 22,
  large: 28,
};

export function PremiumBadge({ size = 'medium', style }: PremiumBadgeProps) {
  return (
    <Text style={[styles.crown, { fontSize: FONT_SIZES[size] }, style]}>
      👑
    </Text>
  );
}

const styles = StyleSheet.create({
  crown: {
    color: '#FFD700',
    marginLeft: 6,
    lineHeight: undefined,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
