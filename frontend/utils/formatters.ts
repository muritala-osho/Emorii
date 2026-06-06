/**
 * Shared date/time formatting utilities.
 * Import from here instead of duplicating these functions across screens.
 */

/**
 * "2:30 PM" — shows only the hour and minute of a date string.
 * Used in chat message timestamps.
 */
export function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Smart relative timestamp for chat list rows:
 *   - today      → "2:30 PM"
 *   - yesterday  → "Yesterday"
 *   - <7 days    → "Mon"
 *   - older      → "Jan 15"
 */
export function formatChatTimestamp(timestamp: string): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Relative age for story / activity timestamps:
 *   "Just now" / "3h ago" / "2d ago"
 */
export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const hours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Section-header label for chat date separators:
 *   "Today" / "Yesterday" / "Monday, Jan 15"
 */
export function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

/**
 * "January 15, 2024" — full date for appeal / profile screens.
 */
export function formatLongDate(dateString?: string): string {
  if (!dateString) return 'Unknown';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * "January 2024" — month + year for success stories.
 */
export function formatMonthYear(dateString?: string): string {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * "1:05" — audio/video duration from total seconds.
 * Used in VoiceBio and recording indicators.
 */
export function formatDuration(secs: number): string {
  const s = Math.floor(secs % 60);
  const m = Math.floor(secs / 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
