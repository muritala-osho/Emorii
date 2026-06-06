import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface ActivityStatusProps {
  onlineStatus: 'online' | 'offline' | 'away' | null;
  lastActive?: Date | string | null;
  showDot?: boolean;
  size?: 'small' | 'medium' | 'large';
}

function getTimeAgo(date: Date | string): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return past.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ActivityStatus({ 
  onlineStatus, 
  lastActive, 
  showDot = true, 
  size = 'medium' 
}: ActivityStatusProps) {
  const { theme } = useTheme();

  if (onlineStatus === null) {
    return null;
  }

  const isOnline = onlineStatus === 'online';
  const isAway = onlineStatus === 'away';

  const dotSizes = {
    small: 6,
    medium: 8,
    large: 10,
  };

  const fontSizes = {
    small: 10,
    medium: 12,
    large: 14,
  };

  const dotSize = dotSizes[size];
  const fontSize = fontSizes[size];

  const getStatusColor = () => {
    if (isOnline) return '#22C55E';
    if (isAway) return '#F59E0B';
    return '#9CA3AF';
  };

  const getStatusText = () => {
    if (isOnline) return 'Online';
    if (isAway) return 'Away';
    if (lastActive) return `Active ${getTimeAgo(lastActive)}`;
    return 'Offline';
  };

  return (
    <View style={styles.container}>
      {showDot && (
        <View
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: getStatusColor(),
            },
          ]}
        />
      )}
      <Text
        style={[
          styles.text,
          {
            color: isOnline ? '#22C55E' : theme.textSecondary,
            fontSize,
          },
        ]}
      >
        {getStatusText()}
      </Text>
    </View>
  );
}

export function OnlineIndicator({ 
  isOnline, 
  size = 8 
}: { 
  isOnline: boolean; 
  size?: number;
}) {
  return (
    <View
      style={[
        styles.indicator,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: isOnline ? '#22C55E' : '#9CA3AF',
          borderWidth: size > 6 ? 2 : 1,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    marginRight: 2,
  },
  text: {
    fontWeight: '500',
  },
  indicator: {
    borderColor: '#fff',
  },
});

export default memo(ActivityStatus);
