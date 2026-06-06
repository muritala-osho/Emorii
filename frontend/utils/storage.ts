import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  USER: "user",
  USERS_DB: "users_db",
  MATCHES: "matches",
  CHATS: "chats",
  FRIEND_REQUESTS: "friend_requests",
  MESSAGES: "messages",
};

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  age: number;
  gender: string;
  bio: string;
  interests: string[];
  photos: string[];
  location: { lat: number; lng: number };
  lookingFor: string;
  preferences?: {
    ageRange?: { min: number; max: number };
    maxDistance?: number;
    genders?: string[];
  };
  createdAt: string;
  lastActive: string;
  online: boolean;
}

export interface Match {
  id: string;
  userId: string;
  matchedAt: string;
  lastMessage?: string;
  lastMessageAt?: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  recipientId: string;
  text: string;
  timestamp: string;
  read: boolean;
  delivered: boolean;
  type?: "text" | "image" | "file" | "voice";
  mediaUrl?: string;
}

export interface FriendRequest {
  id: string;
  from: string;
  to: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

// simpleHash was removed — it was a non-cryptographic djb2-style hash used to
// "protect" passwords stored in AsyncStorage. It offered no real brute-force
// resistance and was trivially reversible. createUser/authenticateUser (which
// used it) have also been removed; all authentication goes through the backend
// API (tokenManager.ts + the /api/auth/* routes) where passwords are bcrypt-hashed.

export const storage = {
  async getUsersDB(): Promise<Record<string, StoredUser>> {
    try {
      const data = await AsyncStorage.getItem(KEYS.USERS_DB);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error("Error getting users DB:", error);
      return {};
    }
  },

  async saveUsersDB(users: Record<string, StoredUser>): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.USERS_DB, JSON.stringify(users));
    } catch (error) {
      console.error("Error saving users DB:", error);
    }
  },

  async updateUser(userId: string, updates: Partial<StoredUser>): Promise<StoredUser> {
    const users = await this.getUsersDB();
    const user = users[userId];

    if (!user) {
      throw new Error("User not found");
    }

    const updatedUser = { ...user, ...updates };
    users[userId] = updatedUser;
    await this.saveUsersDB(users);

    return updatedUser;
  },

  async getCurrentUser(): Promise<StoredUser | null> {
    try {
      const data = await AsyncStorage.getItem(KEYS.USER);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Error getting current user:", error);
      return null;
    }
  },

  async setCurrentUser(user: StoredUser | null): Promise<void> {
    try {
      if (user) {
        await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
      } else {
        await AsyncStorage.removeItem(KEYS.USER);
      }
    } catch (error) {
      console.error("Error setting current user:", error);
    }
  },

  async getMatches(userId: string): Promise<Match[]> {
    try {
      const data = await AsyncStorage.getItem(`${KEYS.MATCHES}_${userId}`);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Error getting matches:", error);
      return [];
    }
  },

  async saveMatches(userId: string, matches: Match[]): Promise<void> {
    try {
      await AsyncStorage.setItem(`${KEYS.MATCHES}_${userId}`, JSON.stringify(matches));
    } catch (error) {
      console.error("Error saving matches:", error);
    }
  },

  async addMatch(userId: string, matchedUserId: string): Promise<Match> {
    const matches = await this.getMatches(userId);
    const newMatch: Match = {
      id: `match-${Date.now()}`,
      userId: matchedUserId,
      matchedAt: new Date().toISOString(),
    };
    matches.push(newMatch);
    await this.saveMatches(userId, matches);
    return newMatch;
  },

  async getMessages(chatId: string): Promise<ChatMessage[]> {
    try {
      const data = await AsyncStorage.getItem(`${KEYS.MESSAGES}_${chatId}`);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Error getting messages:", error);
      return [];
    }
  },

  async saveMessages(chatId: string, messages: ChatMessage[]): Promise<void> {
    try {
      await AsyncStorage.setItem(`${KEYS.MESSAGES}_${chatId}`, JSON.stringify(messages));
    } catch (error) {
      console.error("Error saving messages:", error);
    }
  },

  async sendMessage(
    senderId: string,
    recipientId: string,
    text: string,
    type: "text" | "image" | "file" | "voice" = "text",
    mediaUrl?: string
  ): Promise<ChatMessage> {
    const chatId = [senderId, recipientId].sort().join("_");
    const messages = await this.getMessages(chatId);
    
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      chatId,
      senderId,
      recipientId,
      text,
      type,
      mediaUrl,
      timestamp: new Date().toISOString(),
      delivered: true,
      read: false,
    };

    messages.push(newMessage);
    await this.saveMessages(chatId, messages);
    
    const senderMatches = await this.getMatches(senderId);
    const matchIndex = senderMatches.findIndex((m) => m.userId === recipientId);
    if (matchIndex !== -1) {
      senderMatches[matchIndex].lastMessage = text;
      senderMatches[matchIndex].lastMessageAt = newMessage.timestamp;
      await this.saveMatches(senderId, senderMatches);
    }

    return newMessage;
  },

  async getFriendRequests(userId: string): Promise<FriendRequest[]> {
    try {
      const data = await AsyncStorage.getItem(`${KEYS.FRIEND_REQUESTS}_${userId}`);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Error getting friend requests:", error);
      return [];
    }
  },

  async saveFriendRequests(userId: string, requests: FriendRequest[]): Promise<void> {
    try {
      await AsyncStorage.setItem(`${KEYS.FRIEND_REQUESTS}_${userId}`, JSON.stringify(requests));
    } catch (error) {
      console.error("Error saving friend requests:", error);
    }
  },

  async markMessagesAsRead(chatId: string, userId: string): Promise<void> {
    const messages = await this.getMessages(chatId);
    let updated = false;
    
    messages.forEach(msg => {
      if (msg.recipientId === userId && !msg.read) {
        msg.read = true;
        updated = true;
      }
    });
    
    if (updated) {
      await this.saveMessages(chatId, messages);
    }
  },

  async sendFriendRequest(fromUserId: string, toUserId: string): Promise<FriendRequest> {
    const toUserRequests = await this.getFriendRequests(toUserId);
    
    const newRequest: FriendRequest = {
      id: `req-${Date.now()}`,
      from: fromUserId,
      to: toUserId,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    toUserRequests.push(newRequest);
    await this.saveFriendRequests(toUserId, toUserRequests);
    
    return newRequest;
  },

  async updateFriendRequest(
    userId: string,
    requestId: string,
    status: "accepted" | "rejected"
  ): Promise<void> {
    const requests = await this.getFriendRequests(userId);
    const request = requests.find((r) => r.id === requestId);
    
    if (request) {
      request.status = status;
      await this.saveFriendRequests(userId, requests);

      if (status === "accepted") {
        await this.addMatch(userId, request.from);
        await this.addMatch(request.from, userId);
      }
    }
  },

  async getAllUsers(): Promise<StoredUser[]> {
    const users = await this.getUsersDB();
    return Object.values(users);
  },

  async getUser(userId: string): Promise<StoredUser | null> {
    try {
      const users = await this.getUsersDB();
      return users[userId] || null;
    } catch (error) {
      console.error("Error getting user:", error);
      return null;
    }
  },

  async clearAllData(): Promise<void> {
    // M-8: Only remove keys owned by this storage layer, not ALL AsyncStorage
    // keys (which would nuke data stored by React Navigation, analytics libs, etc.).
    // Dynamic keys share a prefix with their base KEYS constant value.
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const ourKeys = allKeys.filter(k =>
        Object.values(KEYS).some(prefix => k === prefix || k.startsWith(prefix + '_'))
      );
      if (ourKeys.length > 0) {
        await AsyncStorage.multiRemove(ourKeys);
      }
    } catch (error) {
      console.error("Error clearing data:", error);
    }
  },
};
