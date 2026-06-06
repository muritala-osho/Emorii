import logger from '@/utils/logger';
/**
 * SupportMessagesScreen.tsx — User-facing support hub
 *
 * Behaviour:
 *  - Lists all user's tickets with unread reply badges
 *  - Lets users create new tickets (subject, category, message)
 *  - Opens a ticket as a messaging-style chat thread
 *  - Polls the open thread every 10 s for new staff replies
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { getApiBaseUrl } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { useUnread } from '@/contexts/UnreadContext';


interface TicketMessage {
  _id?: string;
  role: 'user' | 'admin' | 'agent';
  content: string;
  senderName?: string;
  senderId?: string;
  adminName?: string;
  timestamp: string;
}

interface Ticket {
  _id: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'pending' | 'in-progress' | 'closed';
  messages: TicketMessage[];
  unreadByUser: number;
  createdAt: string;
  updatedAt: string;
}

type Screen = 'list' | 'thread' | 'create';


const STATUS_COLOR: Record<string, string> = {
  open: '#10b981',
  pending: '#8b5cf6',
  'in-progress': '#f59e0b',
  closed: '#6b7280',
};

const PRIORITY_COLOR: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#6b7280',
};

const CATEGORY_LABELS: Record<string, string> = {
  billing: 'Billing',
  account: 'Account',
  technical: 'Technical',
  safety: 'Safety',
  other: 'Other',
};

const CATEGORIES = ['billing', 'account', 'technical', 'safety', 'other'];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}


export default function SupportMessagesScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { token, user } = useAuth();
  const { refreshNotifCount } = useUnread();

  const [screen, setScreen] = useState<Screen>('list');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('other');
  const [submitting, setSubmitting] = useState(false);

  const [replyText, setReplyText] = useState('');

  const scrollRef = useRef<ScrollView>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);


  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token]);

  /** Fetch the user's ticket list */
  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/support/user`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) setTickets(data.tickets || []);
    } catch (e) {
      logger.error('[Support] fetchTickets error:', e);
    } finally {
      setListLoading(false);
    }
  }, [authHeaders]);

  /** Fetch a single ticket's full message thread */
  const fetchThread = useCallback(async (ticketId: string, silent = false) => {
    if (!silent) setThreadLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/support/ticket/${ticketId}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedTicket(data.ticket);
        setTickets(prev => prev.map(t => t._id === ticketId ? { ...t, unreadByUser: 0 } : t));
      }
    } catch (e) {
      logger.error('[Support] fetchThread error:', e);
    } finally {
      setThreadLoading(false);
    }
  }, [authHeaders]);


  useEffect(() => {
    fetchTickets();
    refreshNotifCount();
  }, []);

  useEffect(() => {
    if (screen === 'thread' && selectedTicket) {
      pollingRef.current = setInterval(() => fetchThread(selectedTicket._id, true), 10000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [screen, selectedTicket?._id]);

  useEffect(() => {
    if (screen === 'thread') {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    }
  }, [selectedTicket?.messages?.length, screen]);


  const openTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setScreen('thread');
    await fetchThread(ticket._id);
    refreshNotifCount();
  };

  const handleCreateTicket = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Required fields', 'Please fill in subject and message.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/support/ticket`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: (user as any)?.name || 'User',
          email: (user as any)?.email || '',
          subject: subject.trim(),
          message: message.trim(),
          category,
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Ticket Created', "We'll get back to you within 24 hours!");
        setSubject('');
        setMessage('');
        setCategory('other');
        await fetchTickets();
        setScreen('list');
      } else {
        Alert.alert('Error', data.message || 'Failed to create ticket.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedTicket) return;
    const content = replyText.trim();
    const ticketId = selectedTicket._id;
    setReplyText('');

    const optimisticMsg: TicketMessage = {
      role: 'user',
      content,
      senderName: (user as any)?.name || 'You',
      senderId: (user as any)?._id || (user as any)?.id,
      timestamp: new Date().toISOString(),
    };
    setSelectedTicket(prev =>
      prev ? { ...prev, messages: [...(prev.messages || []), optimisticMsg] } : prev
    );

    // Fire-and-forget: the optimistic bubble already gives "sent" feedback,
    // so the user never waits on the network. We reconcile with the server
    // payload when it arrives, but only if the user is still viewing the
    // same ticket.
    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/support/reply`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ ticketId, content }),
        });
        const data = await res.json();
        if (data.success && data.ticket) {
          setSelectedTicket(prev => (prev && prev._id === ticketId ? data.ticket : prev));
        }
      } catch {
        Alert.alert('Error', 'Could not send reply. Please try again.');
      }
    })();
  };

  const totalUnread = tickets.reduce((sum, t) => sum + (t.unreadByUser || 0), 0);


  const renderList = () => (
    <View style={{ flex: 1 }}>
      <Pressable
        onPress={() => setScreen('create')}
        style={[styles.createButton, { backgroundColor: theme.primary }]}
      >
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <Text style={styles.createButtonText}>New Support Ticket</Text>
      </Pressable>

      {listLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : tickets.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No tickets yet</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Create a ticket to get help from our support team.
          </Text>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={t => t._id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openTicket(item)}
              style={[styles.ticketCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              {/* Unread badge */}
              {(item.unreadByUser || 0) > 0 && (
                <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
                  <Text style={styles.unreadBadgeText}>{item.unreadByUser}</Text>
                </View>
              )}

              <View style={styles.ticketCardRow}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[item.status] || '#6b7280' }]} />
                <Text style={[styles.ticketSubject, { color: theme.text }]} numberOfLines={1}>
                  {item.subject}
                </Text>
              </View>

              <View style={styles.ticketCardMeta}>
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                  {CATEGORY_LABELS[item.category] || item.category}
                </Text>
                <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLOR[item.priority] + '20' }]}>
                  <Text style={[styles.priorityText, { color: PRIORITY_COLOR[item.priority] }]}>
                    {item.priority}
                  </Text>
                </View>
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                  {timeAgo(item.updatedAt)}
                </Text>
              </View>

              <View style={styles.ticketCardFooter}>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[item.status] + '20' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                    {item.status}
                  </Text>
                </View>
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                  {(item.messages || []).length} message{(item.messages || []).length !== 1 ? 's' : ''}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );


  const renderCreate = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.createForm} keyboardShouldPersistTaps="handled">
        <Text style={[styles.formLabel, { color: theme.text }]}>Subject</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Brief description of your issue"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        />

        <Text style={[styles.formLabel, { color: theme.text }]}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {CATEGORIES.map(cat => (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat)}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: category === cat ? theme.primary : theme.surface,
                  borderColor: category === cat ? theme.primary : theme.border,
                },
              ]}
            >
              <Text style={[styles.categoryChipText, { color: category === cat ? '#fff' : theme.text }]}>
                {CATEGORY_LABELS[cat]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.formLabel, { color: theme.text }]}>Message</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Describe your issue in detail..."
          placeholderTextColor={theme.textSecondary}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          style={[
            styles.input,
            styles.messageInput,
            { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
          ]}
        />

        <Pressable
          onPress={handleCreateTicket}
          disabled={submitting || !subject.trim() || !message.trim()}
          style={[styles.submitButton, { backgroundColor: theme.primary, opacity: submitting ? 0.7 : 1 }]}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitButtonText}>Submit Ticket</Text>
          }
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );


  const renderThread = () => {
    if (threadLoading || !selectedTicket) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      );
    }

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Status/category info bar */}
        <View style={[styles.threadInfoBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[selectedTicket.status] || '#6b7280' }]} />
          <Text style={[styles.threadInfoText, { color: theme.textSecondary }]}>
            {selectedTicket.status} · {CATEGORY_LABELS[selectedTicket.category] || selectedTicket.category}
          </Text>
        </View>

        {/* Message bubbles */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {(selectedTicket.messages || []).map((msg: any, i) => {
            // Decide LEFT vs RIGHT robustly.
            //
            //  1. Primary, unambiguous check: if `senderId` is present and
            //     matches the current user, the message is mine → RIGHT.
            //     This is immune to any legacy `adminName` field that older
            //     versions of the backend used to populate even on user
            //     messages (which previously caused user replies to flip to
            //     the LEFT side, making it look like the admin had replied).
            //  2. Otherwise (e.g. optimistic messages with no senderId yet,
            //     or very old tickets without a senderId at all), fall back
            //     to role + adminName.
            const myId = (user as any)?._id || (user as any)?.id;
            const senderId = msg.senderId ? String(msg.senderId) : null;
            const isUser = senderId
              ? senderId === String(myId)
              : msg.role === 'user';
            const isStaff = !isUser;
            return (
              <View
                key={i}
                style={[
                  styles.messageBubble,
                  { alignSelf: isUser ? 'flex-end' : 'flex-start' },
                  isUser
                    ? [styles.bubbleUser, { backgroundColor: theme.primary }]
                    : [styles.bubbleStaff, { backgroundColor: theme.surface, borderColor: theme.border }],
                ]}
              >
                {/* Sender name for staff messages */}
                {!isUser && (
                  <Text style={[styles.senderLabel, { color: theme.primary }]}>
                    {msg.senderName || msg.adminName || (msg.role === 'agent' ? 'Support Agent' : 'Emorii Support')}
                  </Text>
                )}
                <Text style={[styles.messageText, { color: isUser ? '#fff' : theme.text }]}>
                  {msg.content}
                </Text>
                <Text style={[styles.messageTime, { color: isUser ? 'rgba(255,255,255,0.7)' : theme.textSecondary }]}>
                  {timeAgo(msg.timestamp)}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Reply bar / closed state */}
        {selectedTicket.status === 'closed' ? (
          <View style={[styles.closedBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="checkmark-circle" size={16} color="#10b981" />
            <Text style={[styles.closedText, { color: theme.textSecondary }]}>
              This ticket is closed.
            </Text>
          </View>
        ) : (
          <View style={[styles.replyBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Type a reply..."
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[styles.replyInput, { color: theme.text }]}
            />
            <Pressable
              onPress={handleSendReply}
              disabled={!replyText.trim()}
              style={[styles.sendButton, {
                backgroundColor: theme.primary,
                opacity: !replyText.trim() ? 0.5 : 1,
              }]}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    );
  };


  const getTitle = () => {
    if (screen === 'create') return 'New Ticket';
    if (screen === 'thread') return selectedTicket?.subject || 'Support';
    return `Support${totalUnread > 0 ? ` (${totalUnread})` : ''}`;
  };

  const handleBack = () => {
    if (screen === 'create' || screen === 'thread') {
      setScreen('list');
      if (screen === 'thread') fetchTickets(); // refresh list with updated unread counts
    } else {
      navigation.goBack();
    }
  };


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderColor: theme.border }]}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {getTitle()}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {screen === 'list' && renderList()}
      {screen === 'create' && renderCreate()}
      {screen === 'thread' && renderThread()}
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { width: 36 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: 16,
    paddingVertical: 14,
    borderRadius: 14,
  },
  createButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  emptyContainer: { alignItems: 'center', marginTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  ticketCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    position: 'relative',
  },
  ticketCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  ticketSubject: { flex: 1, fontSize: 15, fontWeight: '700' },
  ticketCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  ticketCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaText: { fontSize: 12, fontWeight: '500' },

  statusDot: { width: 8, height: 8, borderRadius: 4 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  priorityText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  unreadBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  createForm: { padding: 20 },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 4,
  },
  messageInput: { height: 140, paddingTop: 12 },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryChipText: { fontSize: 13, fontWeight: '600' },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  threadInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  threadInfoText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },

  messagesList: { padding: 16, paddingBottom: 24 },

  messageRow: { flexDirection: 'row', marginBottom: 12, width: '100%' },
  messageRowUser: { justifyContent: 'flex-end' },
  messageRowStaff: { justifyContent: 'flex-start' },

  messageBubble: { maxWidth: '78%', borderRadius: 18, padding: 12 },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleStaff: { borderWidth: 1, borderBottomLeftRadius: 4 },

  senderLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  messageText: { fontSize: 15, lineHeight: 22 },
  messageTime: { fontSize: 11, marginTop: 4, textAlign: 'right' },

  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
  },
  closedText: { fontSize: 14, fontWeight: '500' },

  replyBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
  },
  replyInput: {
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
