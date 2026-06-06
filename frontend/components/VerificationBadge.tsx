import { MaterialCommunityIcons } from '@expo/vector-icons';

interface VerificationBadgeProps {
  verified?: boolean;
  size?: number | 'small' | 'medium' | 'large';
}

const SIZE_MAP: Record<string, number> = {
  small: 14,
  medium: 18,
  large: 22,
};

export function VerificationBadge({
  verified = true,
  size = 14,
}: VerificationBadgeProps) {
  if (!verified) return null;

  const badgeSize = typeof size === 'number' ? size : (SIZE_MAP[size] ?? 14);

  return (
    <MaterialCommunityIcons
      name="check-decagram"
      size={badgeSize}
      color="#10B981"
      style={{ marginLeft: 4 }}
    />
  );
}
