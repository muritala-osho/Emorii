const express = require("express");
const logger = require('../utils/logger');
const router = express.Router();
const { protect } = require("../middleware/auth");
const { matchParticipant } = require("../middleware/rls");
const Message = require("../models/Message");
const Match = require("../models/Match");
const User = require("../models/User");
const redis = require("../utils/redis");
const validate = require("../middleware/validate");
const schemas = require("../validators/schemas");

// POST /chat/direct/initiate — premium users can open a conversation with
// someone they have not matched with yet. Finds an existing match between the
// two users (any status) or creates a new one, then returns the matchId so
// the client can navigate to the normal ChatDetail screen.
router.post("/direct/initiate", protect, async (req, res) => {
  try {
    const { recipientId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ success: false, message: "recipientId is required" });
    }

    if (!req.user.premium?.isActive) {
      return res.status(403).json({
        success: false,
        message: "Direct messaging without a match is a Premium feature. Upgrade to message anyone!",
      });
    }

    const mongoose = require("mongoose");
    const recipientObjId = new mongoose.Types.ObjectId(recipientId);
    const myObjId = req.user._id;

    const recipient = await User.findById(recipientObjId).select("name _id blockedUsers").lean();
    if (!recipient) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Refuse if either party has blocked the other
    const me = await User.findById(myObjId).select("blockedUsers").lean();
    const iBlocked = (me?.blockedUsers || []).map(String).includes(String(recipientObjId));
    const theyBlocked = (recipient.blockedUsers || []).map(String).includes(String(myObjId));
    if (iBlocked || theyBlocked) {
      return res.status(403).json({ success: false, message: "Unable to message this user" });
    }

    // Find any existing match (including unmatched) between the two users
    let match = await Match.findOne({
      users: { $all: [myObjId, recipientObjId] },
      status: { $in: ["active", "unmatched"] },
    });

    if (!match) {
      // Create a new direct match — expires in 7 days to give both parties time to respond
      match = await Match.create({
        users: [myObjId, recipientObjId],
        matchedAt: new Date(),
        status: "active",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        hasFirstMessage: false,
      });
    }

    // Invalidate conversation cache for both users
    await redis.del(`conversations:${String(myObjId)}`);
    await redis.del(`conversations:${String(recipientObjId)}`);

    return res.status(200).json({ success: true, matchId: match._id });
  } catch (err) {
    logger.error("Direct initiate error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/conversations", protect, async (req, res) => {
  try {
    const { search, page = 1, limit = 500 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 1000);
    const userId = req.user._id.toString();

    const cacheKey = `conversations:${userId}`;
    if (!search && pageNum === 1) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({ success: true, conversations: cached, fromCache: true });
      }
    }

    const currentUser = await User.findById(req.user._id)
      .select("blockedUsers")
      .lean();
    const blockedUserIds = (currentUser?.blockedUsers || []).map((id) =>
      id.toString(),
    );

    const matches = await Match.find({ users: req.user._id, status: { $in: ['active', 'unmatched'] } })
      .populate(
        "users",
        "name photos onlineStatus lastActive blockedUsers verified privacySettings",
      )
      .sort({ lastMessageAt: -1, updatedAt: -1, matchedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    if (!matches.length) {
      return res.json({ success: true, conversations: [] });
    }

    const matchIds = matches.map((m) => m._id);

    const lastMessagesAgg = await Message.aggregate([
      {
        $match: {
          matchId: { $in: matchIds },
          deletedFor: { $ne: req.user._id },
        },
      },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$matchId", lastMessage: { $first: "$$ROOT" } } },
    ]);
    const lastMessagesMap = new Map(
      lastMessagesAgg.map((m) => [m._id.toString(), m.lastMessage]),
    );

    const unreadCountsAgg = await Message.aggregate([
      {
        $match: {
          matchId: { $in: matchIds },
          receiver: req.user._id,
          seen: false,
          deletedFor: { $ne: req.user._id },
        },
      },
      { $group: { _id: "$matchId", count: { $sum: 1 } } },
    ]);
    const unreadCountsMap = new Map(
      unreadCountsAgg.map((m) => [m._id.toString(), m.count]),
    );

    const onlineUsers = req.app.get("onlineUsers");
    const currentUserId = req.user._id.toString();
    const conversations = matches.map((match) => {
      const otherUser = match.users.find(
        (u) => u._id.toString() !== currentUserId,
      );
      if (!otherUser) return null;

      if (blockedUserIds.includes(otherUser._id.toString())) return null;
      const otherUserBlockedMe = (otherUser.blockedUsers || []).some(
        (id) => id.toString() === req.user._id.toString(),
      );
      if (otherUserBlockedMe) return null;

      if (
        search &&
        !otherUser.name.toLowerCase().includes(search.toLowerCase())
      )
        return null;

      const matchIdStr = match._id.toString();
      const lastMessage = lastMessagesMap.get(matchIdStr);
      const unreadCount = unreadCountsMap.get(matchIdStr) || 0;

      // Honor "hide online status" privacy: never reveal real-time presence
      // for the other user when they have the setting disabled.
      const otherShowsOnline =
        !otherUser.privacySettings ||
        otherUser.privacySettings.showOnlineStatus !== false;
      const computedOnline = otherShowsOnline
        ? (onlineUsers && onlineUsers.has(otherUser._id.toString())) ||
          otherUser.onlineStatus === "online"
        : false;

      return {
        id: match._id,
        matchId: match._id,
        user: {
          id: otherUser._id,
          name: otherUser.name,
          photo: otherUser.photos?.[0]?.url || otherUser.photos?.[0],
          online: computedOnline,
          verified: otherUser.verified || false,
        },
        lastMessage: lastMessage?.content || "",
        lastMessageType: lastMessage?.type || "text",
        timestamp: lastMessage?.createdAt || match.lastMessageAt || match.matchedAt || match.createdAt,
        unreadCount,
        isNew: !lastMessage,
      };
    });

    const seenUserIds = new Set();
    const filteredConversations = conversations
      .filter((c) => c !== null)
      .filter((c) => {
        const uid = c.user.id.toString();
        if (seenUserIds.has(uid)) return false;
        seenUserIds.add(uid);
        return true;
      });

    if (!search && pageNum === 1) {
      await redis.set(cacheKey, filteredConversations, 30);
    }

    res.json({ success: true, conversations: filteredConversations });
  } catch (error) {
    logger.error("Get conversations error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/mark-all-read", protect, async (req, res) => {
  try {
    await Message.updateMany(
      { receiver: req.user._id, seen: false },
      { seen: true, seenAt: Date.now(), status: "seen" },
    );
    res.json({ success: true, message: "All messages marked as read" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/delete-all", protect, async (req, res) => {
  try {
    await Message.updateMany(
      { $or: [{ sender: req.user._id }, { receiver: req.user._id }] },
      { $addToSet: { deletedFor: req.user._id } },
    );
    res.json({ success: true, message: "All chats deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/unread-count", protect, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiver: req.user._id,
      seen: false,
      deletedFor: { $ne: req.user._id },
    });
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/:matchId", protect, async (req, res) => {
  try {
    const { matchId } = req.params;
    const { limit = 1000, skip = 0 } = req.query;
    const pageSize = Math.min(parseInt(limit) || 1000, 2000);
    const skipAmount = Math.max(0, parseInt(skip) || 0);

    const match = await Match.findById(matchId);
    if (!match || !match.users.includes(req.user._id)) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    const messages = await Message.find({
      matchId,
      deletedFor: { $ne: req.user._id },
    })
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .skip(skipAmount)
      .lean()
      .populate("sender", "name photos");

    const total = await Message.countDocuments({
      matchId,
      deletedFor: { $ne: req.user._id },
    });

    // ── View-once sanitization ──────────────────────────────────────────────
    // Strip imageUrl / videoUrl from any view-once message the requesting user
    // has already opened. This closes the network-sniff gap: even if someone
    // intercepts the response they cannot recover the media URL after viewing.
    const requesterId = req.user._id.toString();
    const sanitized = messages.reverse().map(msg => {
      if (!msg.viewOnce) return msg;
      const senderId = msg.sender?._id?.toString() ?? msg.sender?.toString() ?? '';
      // Sender sees their own placeholder in the UI; strip URL for them too
      // so the raw API never leaks it.
      const alreadyOpened = senderId === requesterId ||
        (msg.viewOnceOpenedBy || []).some(id => id.toString() === requesterId);
      if (alreadyOpened) {
        const { imageUrl, videoUrl, ...rest } = msg;
        return rest;
      }
      return msg;
    });
    // ────────────────────────────────────────────────────────────────────────

    res.json({
      success: true,
      messages: sanitized,
      pagination: {
        total,
        limit: pageSize,
        skip: skipAmount,
        hasMore: skipAmount + pageSize < total,
      },
    });
  } catch (error) {
    logger.error("Get messages error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/:matchId", protect, validate(schemas.chat.sendMessage), async (req, res) => {
  try {
    const { matchId } = req.params;
    const {
      content,
      type = "text",
      imageUrl,
      videoUrl,
      audioUrl,
      audioDuration,
      fileUrl,
      fileName,
      fileSize,
      fileType,
      callStatus,
      callType,
    } = req.body;

    if (matchId === "direct") {
      if (!req.user.premium?.isActive) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "Direct messaging without a match is a Premium feature. Upgrade now!",
          });
      }
    }

    const match = await Match.findById(matchId);
    if (!match || !match.users.includes(req.user._id)) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    if (!match.hasFirstMessage && match.expiresAt && new Date(match.expiresAt) < new Date()) {
      return res.status(403).json({ success: false, message: "This match has expired. You can no longer send messages." });
    }

    const receiver = match.users.find((id) => !id.equals(req.user._id));

    if (type === "call") {
      const messageData = {
        matchId,
        sender: req.user._id,
        receiver,
        type: "system",
        content: `${callStatus === "missed" ? "Missed" : "Ended"} ${callType || "voice"} call`,
        status: "delivered",
        deliveredAt: new Date(),
        metadata: { callStatus, callType },
      };
      const message = await Message.create(messageData);
      await message.populate("sender", "name photos");
      await Match.findByIdAndUpdate(matchId, { lastMessageAt: new Date() });
      await redis.del(`conversations:${req.user._id.toString()}`);
      await redis.del(`conversations:${receiver.toString()}`);
      const io = req.app.get("io");
      if (io) {
        const msgJson = message.toJSON ? message.toJSON() : message;
        const msgPayload = { message: msgJson, matchId: matchId.toString() };
        io.to(matchId.toString()).emit("chat:new-message", msgPayload);
      }
      return res.status(201).json({ success: true, message });
    }

    const currentUser = await User.findById(req.user._id).select(
      "blockedUsers",
    );
    const receiverUser = await User.findById(receiver).select("blockedUsers");
    if (
      currentUser?.blockedUsers?.includes(receiver.toString()) ||
      receiverUser?.blockedUsers?.includes(req.user._id.toString())
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Cannot send message to this user" });
    }

    const { replyTo, viewOnce } = req.body;

    if (type === "audio") {
      const freeLimit = 30;
      const duration = Number(audioDuration || 0);
      if (!req.user.premium?.isActive && duration > freeLimit) {
        return res
          .status(403)
          .json({
            success: false,
            message: "Voice notes longer than 30s require Premium",
          });
      }
    }

    const messageData = {
      matchId,
      sender: req.user._id,
      receiver,
      type,
      status: "sent",
      deliveredAt: new Date(),
    };

    if (type === "text") messageData.content = content;
    else if (type === "image") {
      messageData.imageUrl = imageUrl;
      messageData.content = viewOnce ? "📷 View Once Photo" : "📷 Photo";
      if (viewOnce) messageData.viewOnce = true;
    } else if (type === "video") {
      messageData.videoUrl = videoUrl;
      messageData.content = viewOnce ? "🎥 View Once Video" : "🎥 Video";
      if (viewOnce) messageData.viewOnce = true;
    } else if (type === "audio") {
      messageData.audioUrl = audioUrl;
      messageData.audioDuration = audioDuration || 0;
      messageData.content = "🎤 Voice message";
    } else if (type === "file") {
      messageData.fileUrl = fileUrl;
      messageData.fileName = fileName;
      messageData.fileSize = fileSize;
      messageData.fileType = fileType;
      messageData.content = `📎 ${fileName || "File"}`;
    }

    if (replyTo) {
      messageData.replyTo = {
        messageId: replyTo.messageId,
        content: replyTo.content,
        type: replyTo.type,
        senderName: replyTo.senderName,
      };
    }

    const message = await Message.create(messageData);
    await message.populate("sender", "name photos");

    const wasFirstMessage = !match.hasFirstMessage;
    await Match.findByIdAndUpdate(matchId, {
      $set: { lastMessageAt: new Date(), hasFirstMessage: true }
    });

    await redis.del(`conversations:${req.user._id.toString()}`);
    await redis.del(`conversations:${receiver.toString()}`);

    const io = req.app.get("io");
    if (io) {
      const msgJson = message.toJSON ? message.toJSON() : message;
      const msgPayload = { message: msgJson, matchId: matchId.toString() };
      io.to(matchId.toString()).emit("chat:new-message", msgPayload);
      io.to(receiver.toString()).emit("chat:new-message", msgPayload);

      if (wasFirstMessage) {
        const firstMsgPayload = { matchId: matchId.toString() };
        io.to(req.user._id.toString()).emit("match:first-message", firstMsgPayload);
        io.to(receiver.toString()).emit("match:first-message", firstMsgPayload);
      }
      // Tick progression: `sent` (✓) → `delivered` (✓✓) → `seen` (colored ✓✓).
      //
      // We only emit `chat:message-delivered` when the recipient is **actually
      // reachable** (has a live socket connection). If the recipient is
      // offline, the message stays in `sent` state on the sender's screen
      // (single tick). When the recipient reconnects, the connect handler in
      // `server.js` flushes any pending `sent` messages addressed to them,
      // marks them `delivered` in the DB, and emits `chat:message-delivered`
      // to each unique sender at that moment.
      //
      // This matches the user's expectation: "double tick = it reached the
      // other person's device", not just "the server saved it".
      const onlineUsersMap = req.app.get("onlineUsers");
      const recipientIsOnline =
        onlineUsersMap && onlineUsersMap.has(receiver.toString());

      if (recipientIsOnline) {
        try {
          await Message.findByIdAndUpdate(message._id, {
            $set: { status: "delivered", deliveredAt: new Date() },
          });
        } catch (e) {
          // Best effort — the live event below is what drives the UI tick.
        }

        const deliveredPayload = {
          messageId: message._id,
          chatId: matchId,
          matchId: matchId.toString(),
          status: "delivered",
        };
        io.to(req.user._id.toString()).emit("chat:message-delivered", deliveredPayload);
        io.to(matchId.toString()).emit("chat:message-delivered", deliveredPayload);
      }
    }

    const onlineUsers = req.app.get("onlineUsers");
    const backgroundedUsers = req.app.get("backgroundedUsers");
    const isReceiverOnline =
      onlineUsers && onlineUsers.has(receiver.toString());
    const isReceiverBackgrounded =
      backgroundedUsers && backgroundedUsers.has(receiver.toString());
    if (!isReceiverOnline || isReceiverBackgrounded) {
      try {
        const { sendSmartNotification } = require("../utils/pushNotifications");
        const rcvUser = await User.findById(receiver).select(
          "pushToken fcmToken pushNotificationsEnabled muteSettings notificationPreferences",
        );
        const senderName = req.user.name || "Someone";
        let notifBody = content || "";
        if (type === "image") notifBody = "📷 Sent a photo";
        else if (type === "video") notifBody = "🎥 Sent a video";
        else if (type === "audio") notifBody = "🎵 Sent a voice message";
        else if (type === "location") notifBody = "📍 Shared a location";
        else if (notifBody.length > 100)
          notifBody = notifBody.substring(0, 97) + "...";

        const totalUnread = await Message.countDocuments({ receiver, seen: false });

        const firstPhoto = req.user.photos?.[0];
        const senderPhoto =
          (typeof firstPhoto === "string" ? firstPhoto : firstPhoto?.url || firstPhoto?.uri) ||
          req.user.profilePicture ||
          "";

        try {
          await sendSmartNotification(
            rcvUser,
            {
              title: senderName,
              body: notifBody,
              badge: totalUnread,
              data: {
                type: "message",
                screen: "ChatDetail",
                matchId: matchId.toString(),
                senderId: req.user._id.toString(),
                senderName,
                senderPhoto,
              },
              ...(senderPhoto && senderPhoto.startsWith('https://')
                ? { richContent: { image: senderPhoto }, mutableContent: true }
                : {}),
            },
            "message",
            req.user._id.toString(),
          );
        } catch (expoErr) {
          logger.error("[Chat] Expo push notification failed:", expoErr?.message || expoErr);
        }

        // Send a high-priority FCM DATA message alongside the Expo push.
        // This is what actually wakes a KILLED Android app so the Firebase
        // background handler fires and Notifee renders the MessagingStyle
        // notification. The Expo notification message alone cannot wake a
        // killed app on strict OEM devices (Samsung, Xiaomi, Huawei) that
        // aggressively terminate background processes — only a data-only
        // FCM message with priority:'high' bypasses Android's Doze/standby
        // long enough to deliver the notification.
        if (rcvUser?.fcmToken) {
          try {
            const { sendMessageDataMessage } = require('../utils/fcmPush');
            await sendMessageDataMessage(rcvUser.fcmToken, {
              matchId:     matchId.toString(),
              messageId:   message._id.toString(),
              senderId:    req.user._id.toString(),
              senderName,
              senderPhoto: senderPhoto.startsWith('https://') ? senderPhoto : '',
              body:        notifBody,
              badge:       totalUnread,
              userId:      receiver.toString(),
            });
          } catch (fcmErr) {
            logger.warn('[Chat] FCM data message failed (non-fatal):', fcmErr?.message || fcmErr);
          }
        }
      } catch (err) {
        logger.error("Failed to send message push notification:", err);
      }
    }

    res.status(201).json({ success: true, message });
  } catch (error) {
    logger.error("Send message error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/:matchId/read", protect, async (req, res) => {
  try {
    const { matchId } = req.params;

    const match = await Match.findById(matchId);
    if (!match || !match.users.includes(req.user._id)) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    const result = await Message.updateMany(
      { matchId, receiver: req.user._id, seen: false },
      { seen: true, seenAt: Date.now(), status: "seen" },
    );

    const io = req.app.get("io");
    if (io) {
      const otherUserId = match.users.find((id) => !id.equals(req.user._id));

      const payload = {
        chatId: matchId,
        matchId: matchId,
        userId: req.user._id.toString(),
        readAt: new Date().toISOString(),
      };

      io.to(matchId.toString()).emit("chat:message-read", payload);

      if (otherUserId) {
        io.to(otherUserId.toString()).emit("chat:message-read", payload);
      }
    }

    res.json({ success: true, readCount: result.modifiedCount });
  } catch (error) {
    logger.error("Mark read error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/message/:messageId/seen", protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message)
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });
    if (!message.receiver.equals(req.user._id))
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });

    message.seen = true;
    message.seenAt = Date.now();
    message.status = "seen";
    await message.save();

    const io = req.app.get("io");
    if (io) {
      const payload = {
        chatId: message.matchId,
        matchId: message.matchId,
        userId: req.user._id.toString(),
        readAt: new Date().toISOString(),
      };
      io.to(message.matchId.toString()).emit("chat:message-read", payload);
      io.to(message.sender.toString()).emit("chat:message-read", payload);
    }

    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/message/:messageId", protect, async (req, res) => {
  try {
    const { deleteForEveryone } = req.query;
    const message = await Message.findById(req.params.messageId);
    if (!message)
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });

    if (deleteForEveryone === "true") {
      if (!message.sender.equals(req.user._id)) {
        return res
          .status(403)
          .json({
            success: false,
            message: "Only sender can delete for everyone",
          });
      }
      const sender = await User.findById(message.sender).select("premium");
      if (!sender?.premium?.isActive) {
        return res
          .status(403)
          .json({
            success: false,
            message: "Deleting for everyone is a Premium feature",
          });
      }
      const fifteenMinutes = 15 * 60 * 1000;
      if (Date.now() - message.createdAt > fifteenMinutes) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Can only delete for everyone within 15 minutes",
          });
      }
      message.content = "This message was deleted";
      message.type = "system";
      message.deletedForEveryone = true;
      await message.save();
      const io = req.app.get("io");
      if (io) {
        io.to(message.matchId.toString()).emit("chat:message-deleted", {
          messageId: message._id,
          matchId: message.matchId,
        });
      }
      return res.json({
        success: true,
        message: "Message deleted for everyone",
      });
    }

    if (
      !message.sender.equals(req.user._id) &&
      !message.receiver.equals(req.user._id)
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }
    if (!message.deletedFor.includes(req.user._id)) {
      message.deletedFor.push(req.user._id);
      await message.save();
    }
    res.json({ success: true, message: "Message deleted" });
  } catch (error) {
    logger.error("Delete message error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.patch("/message/:messageId", protect, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: "Content is required" });
    }
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: "Message not found" });
    if (!message.sender.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "Only the sender can edit a message" });
    }
    if (message.type !== "text") {
      return res.status(400).json({ success: false, message: "Only text messages can be edited" });
    }
    const fifteenMinutes = 15 * 60 * 1000;
    if (Date.now() - new Date(message.createdAt).getTime() > fifteenMinutes) {
      return res.status(400).json({ success: false, message: "Messages can only be edited within 15 minutes of sending" });
    }
    message.content = content.trim();
    message.edited = true;
    message.editedAt = new Date();
    await message.save();
    const io = req.app.get("io");
    if (io) {
      io.to(message.matchId.toString()).emit("chat:message-edited", {
        messageId: message._id,
        matchId: message.matchId,
        content: message.content,
        edited: true,
        editedAt: message.editedAt,
      });
    }
    return res.json({ success: true, message: "Message updated", data: message });
  } catch (error) {
    logger.error("Edit message error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/:matchId/message", protect, validate(schemas.chat.sendMessage), async (req, res) => {
  try {
    // Auto-pause enforcement: block messages from users flagged for risky behavior.
    const mp = req.user.messagingPaused;
    if (mp?.isPaused && mp.until && new Date(mp.until) > new Date()) {
      return res.status(403).json({
        success: false,
        code: 'MESSAGING_PAUSED',
        message: mp.reason || 'Your messaging has been paused while our team reviews your recent activity.',
        pausedUntil: mp.until,
      });
    } else if (mp?.isPaused && mp.until && new Date(mp.until) <= new Date()) {
      // Auto-lift expired pause
      req.user.messagingPaused = { isPaused: false, until: null, reason: null, autoTriggeredAt: null, bypassCount: 0 };
      await req.user.save();
    }

    const { matchId } = req.params;
    const {
      content,
      type = "text",
      imageUrl,
      videoUrl,
      audioUrl,
      audioDuration,
      latitude,
      longitude,
      address,
      replyTo,
      viewOnce,
      liveDurationMin,
      localId,
    } = req.body;

    const match = await Match.findById(matchId);
    if (!match || !match.users.includes(req.user._id)) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    const receiver = match.users.find((id) => !id.equals(req.user._id));

    const messageData = {
      matchId,
      sender: req.user._id,
      receiver,
      type,
      status: "sent",
      deliveredAt: new Date(),
    };

    if (type === "text") {
      messageData.content = content;
    } else if (type === "image" && imageUrl) {
      messageData.imageUrl = imageUrl;
      messageData.content = viewOnce ? "📷 View Once Photo" : (content || "📷 Photo");
      if (viewOnce) messageData.viewOnce = true;
    } else if (type === "video" && videoUrl) {
      messageData.videoUrl = videoUrl;
      messageData.content = viewOnce ? "🎥 View Once Video" : (content || "🎥 Video");
      if (viewOnce) messageData.viewOnce = true;
    } else if (type === "audio" && audioUrl) {
      messageData.audioUrl = audioUrl;
      messageData.audioDuration = audioDuration || 0;
      messageData.content = content || "🎤 Voice message";
    } else if (type === "location") {
      messageData.latitude = latitude;
      messageData.longitude = longitude;
      messageData.address = address;
      messageData.content = content;
      // Live location: cap duration at 8 hours, only allowed values 15/60/480 min
      if (liveDurationMin && [15, 60, 480].includes(Number(liveDurationMin))) {
        messageData.liveExpiresAt = new Date(Date.now() + Number(liveDurationMin) * 60 * 1000);
        messageData.lastLocationUpdate = new Date();
      }
    } else {
      messageData.content = content;
    }

    if (replyTo) {
      messageData.replyTo = {
        messageId: replyTo.messageId,
        content: replyTo.content,
        type: replyTo.type,
        senderName: replyTo.senderName,
      };
    }

    const message = await Message.create(messageData);
    await message.populate("sender", "name photos");

    // Non-blocking server-side translation.
    // Runs concurrently — result is pushed to the receiver via the
    // message:translated socket event after the message is delivered.
    if (type === 'text' && content && content.trim()) {
      (async () => {
        try {
          const translateMessage = require('../utils/translateMessage');
          const rcvUser = await User.findById(receiver)
            .select('preferences.language preferences.autoTranslate')
            .lean();
          const targetLang = rcvUser?.preferences?.language || 'en';
          if (rcvUser?.preferences?.autoTranslate !== true) return;

          const result = await translateMessage(content.trim(), targetLang);
          if (!result) return;
          // Skip if detected language matches the target (no translation needed)
          if (result.detectedLanguage && result.detectedLanguage !== 'und' && result.detectedLanguage === targetLang) return;

          await Message.findByIdAndUpdate(message._id, {
            originalText: content,
            translatedText: result.translatedText,
            detectedLanguage: result.detectedLanguage,
            targetLanguage: targetLang,
            translationStatus: 'done',
          });

          const ioInstance = req.app.get('io');
          if (ioInstance) {
            ioInstance.to(receiver.toString()).emit('message:translated', {
              messageId: message._id.toString(),
              matchId: matchId.toString(),
              translatedText: result.translatedText,
              detectedLanguage: result.detectedLanguage,
              targetLanguage: targetLang,
            });
          }
        } catch (txErr) {
          logger.error('[Translation] Server-side translation failed:', txErr.message);
        }
      })();
    }

    const io = req.app.get("io");
    if (io) {
      const msgJson = message.toJSON ? message.toJSON() : message;
      const msgPayload = { message: msgJson, matchId: matchId.toString() };
      io.to(matchId.toString()).emit("chat:new-message", msgPayload);
      io.to(receiver.toString()).emit("chat:new-message", msgPayload);
      // Tick progression: `sent` (✓) → `delivered` (✓✓) → `seen` (colored ✓✓).
      //
      // We only emit `chat:message-delivered` when the recipient is **actually
      // reachable** (has a live socket connection). If the recipient is
      // offline, the message stays in `sent` state on the sender's screen
      // (single tick). When the recipient reconnects, the connect handler in
      // `server.js` flushes any pending `sent` messages addressed to them,
      // marks them `delivered` in the DB, and emits `chat:message-delivered`
      // to each unique sender at that moment.
      //
      // This matches the user's expectation: "double tick = it reached the
      // other person's device", not just "the server saved it".
      const onlineUsersMap = req.app.get("onlineUsers");
      const recipientIsOnline =
        onlineUsersMap && onlineUsersMap.has(receiver.toString());

      if (recipientIsOnline) {
        try {
          await Message.findByIdAndUpdate(message._id, {
            $set: { status: "delivered", deliveredAt: new Date() },
          });
        } catch (e) {
          // Best effort — the live event below is what drives the UI tick.
        }

        const deliveredPayload = {
          messageId: message._id,
          chatId: matchId,
          matchId: matchId.toString(),
          status: "delivered",
        };
        io.to(req.user._id.toString()).emit("chat:message-delivered", deliveredPayload);
        io.to(matchId.toString()).emit("chat:message-delivered", deliveredPayload);
      }
    }

    const onlineUsers = req.app.get("onlineUsers");
    const backgroundedUsers = req.app.get("backgroundedUsers");
    const isReceiverOnline =
      onlineUsers && onlineUsers.has(receiver.toString());
    const isReceiverBackgrounded =
      backgroundedUsers && backgroundedUsers.has(receiver.toString());
    if (!isReceiverOnline || isReceiverBackgrounded) {
      try {
        const { sendSmartNotification } = require("../utils/pushNotifications");
        const rcvUser = await User.findById(receiver).select(
          "pushToken fcmToken pushNotificationsEnabled muteSettings notificationPreferences",
        );
        const senderName = req.user.name || "Someone";
        let notifBody = content || "";
        if (type === "image") notifBody = "📷 Sent a photo";
        else if (type === "video") notifBody = "🎥 Sent a video";
        else if (type === "audio") notifBody = "🎵 Sent a voice message";
        else if (type === "location") notifBody = "📍 Shared a location";
        else if (notifBody.length > 100)
          notifBody = notifBody.substring(0, 97) + "...";

        const totalUnread = await Message.countDocuments({ receiver, seen: false });

        const firstPhoto = req.user.photos?.[0];
        const senderPhoto =
          (typeof firstPhoto === "string" ? firstPhoto : firstPhoto?.url) ||
          req.user.profilePicture ||
          "";

        try {
          await sendSmartNotification(
            rcvUser,
            {
              title: senderName,
              body: notifBody,
              badge: totalUnread,
              data: {
                type: "message",
                screen: "ChatDetail",
                matchId: matchId.toString(),
                senderId: req.user._id.toString(),
                senderName,
                senderPhoto,
              },
              ...(senderPhoto && senderPhoto.startsWith('https://')
                ? { richContent: { image: senderPhoto }, mutableContent: true }
                : {}),
            },
            "message",
            req.user._id.toString(),
          );
        } catch (expoErr) {
          logger.error("[Chat] Expo push notification failed:", expoErr?.message || expoErr);
        }

        if (rcvUser?.fcmToken) {
          try {
            const { sendMessageDataMessage } = require('../utils/fcmPush');
            await sendMessageDataMessage(rcvUser.fcmToken, {
              matchId:     matchId.toString(),
              messageId:   message._id.toString(),
              senderId:    req.user._id.toString(),
              senderName,
              senderPhoto: senderPhoto.startsWith('https://') ? senderPhoto : '',
              body:        notifBody,
              badge:       totalUnread,
              userId:      receiver.toString(),
            });
          } catch (fcmErr) {
            logger.warn('[Chat] FCM data message failed (non-fatal):', fcmErr?.message || fcmErr);
          }
        }
      } catch (err) {
        logger.error("Failed to send message push notification:", err);
      }
    }

    const responseMsg = message.toJSON ? message.toJSON() : { ...message._doc };
    if (localId) responseMsg.localId = localId;

    res.status(201).json({ success: true, message: responseMsg });
  } catch (error) {
    logger.error("Send message error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/:matchId/location", protect, async (req, res) => {
  try {
    const { matchId } = req.params;
    const { latitude, longitude, address } = req.body;

    if (!latitude || !longitude) {
      return res
        .status(400)
        .json({ success: false, message: "Location coordinates required" });
    }

    const match = await Match.findById(matchId);
    if (!match || !match.users.includes(req.user._id)) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    const receiver = match.users.find((id) => !id.equals(req.user._id));

    const message = await Message.create({
      matchId,
      sender: req.user._id,
      receiver,
      type: "text",
      content: `📍 Location: ${address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}`,
      status: "sent",
      deliveredAt: new Date(),
    });

    await message.populate("sender", "name photos");

    const io = req.app.get("io");
    if (io) {
      const msgJson = message.toJSON ? message.toJSON() : message;
      const msgPayload = { message: msgJson, matchId: matchId.toString() };
      io.to(matchId.toString()).emit("chat:new-message", msgPayload);
      io.to(receiver.toString()).emit("chat:new-message", msgPayload);
    }

    res.status(201).json({ success: true, message });
  } catch (error) {
    logger.error("Send location error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/:matchId", protect, async (req, res) => {
  try {
    const { matchId } = req.params;

    const match = await Match.findById(matchId);
    if (!match)
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });

    const isUserInMatch = match.users.some((userId) =>
      userId.equals(req.user._id),
    );
    if (!isUserInMatch)
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });

    await Message.updateMany(
      { matchId },
      { $addToSet: { deletedFor: req.user._id } },
    );

    res.json({ success: true, message: "Chat deleted" });
  } catch (error) {
    logger.error("Delete chat error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post('/:matchId/messages/:messageId/react', protect, matchParticipant, async (req, res) => {
  try {
    const { emoji } = req.body;
    const { matchId, messageId } = req.params;
    const userId = req.user._id;

    if (!emoji) return res.status(400).json({ success: false, message: 'Emoji required' });

    const Message = require('../models/Message');
    const message = await Message.findOne({ _id: messageId, matchId });
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    const existingIdx = message.reactions.findIndex(r => r.user.toString() === userId.toString());
    if (existingIdx !== -1) {
      if (message.reactions[existingIdx].emoji === emoji) {
        message.reactions.splice(existingIdx, 1);
      } else {
        message.reactions[existingIdx].emoji = emoji;
      }
    } else {
      message.reactions.push({ user: userId, emoji });
    }

    await message.save();

    const io = req.app.get('io');
    if (io) {
      io.to(matchId).emit('message:reaction', {
        messageId,
        reactions: message.reactions
      });
    }

    res.json({ success: true, reactions: message.reactions });
  } catch (error) {
    logger.error('React to message error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:matchId/messages/:messageId/reactions', protect, matchParticipant, async (req, res) => {
  try {
    const { matchId, messageId } = req.params;
    const Message = require('../models/Message');
    const message = await Message.findOne({ _id: messageId, matchId }).populate('reactions.user', 'name');
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });
    res.json({ success: true, reactions: message.reactions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/messages/:messageId/view-once', protect, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    if (!message.viewOnce) {
      return res.status(400).json({ success: false, message: 'This is not a view-once message' });
    }

    if (message.sender.toString() === userId.toString()) {
      return res.json({ success: true, alreadyViewed: false });
    }

    const alreadyViewed = message.viewOnceOpenedBy.some(id => id.toString() === userId.toString());
    if (!alreadyViewed) {
      message.viewOnceOpenedBy.push(userId);
      await message.save();

      // Notify the sender in real-time so their UI flips to "opened" instantly
      // without waiting for the next message fetch.
      const io = req.app.get('io');
      if (io) {
        io.to(message.sender.toString()).emit('chat:view-once-opened', {
          messageId: message._id,
          matchId:   message.matchId,
          openedBy:  userId,
        });
      }
    }

    res.json({ success: true, alreadyViewed, openedAt: new Date() });
  } catch (error) {
    logger.error('View once error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* ─────────────────────────────────────────────────────────────────
   Live location: update coordinates of an active live-share message
───────────────────────────────────────────────────────────────── */
router.patch('/messages/:messageId/live-location', protect, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { latitude, longitude } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ success: false, message: 'latitude and longitude required' });
    }
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });
    if (!message.sender.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (message.type !== 'location' || !message.liveExpiresAt) {
      return res.status(400).json({ success: false, message: 'Not a live-location message' });
    }
    if (new Date(message.liveExpiresAt) < new Date()) {
      return res.status(410).json({ success: false, message: 'Live share has expired' });
    }

    message.latitude = latitude;
    message.longitude = longitude;
    message.lastLocationUpdate = new Date();
    await message.save();

    const io = req.app.get('io');
    if (io) {
      const payload = {
        messageId: message._id,
        matchId: message.matchId,
        latitude,
        longitude,
        lastLocationUpdate: message.lastLocationUpdate,
        liveExpiresAt: message.liveExpiresAt,
      };
      io.to(message.matchId.toString()).emit('chat:live-location-update', payload);
      io.to(message.receiver.toString()).emit('chat:live-location-update', payload);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Live location update error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* ─────────────────────────────────────────────────────────────────
   Live location: stop an active share immediately
───────────────────────────────────────────────────────────────── */
router.post('/messages/:messageId/stop-live-location', protect, async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });
    if (!message.sender.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!message.liveExpiresAt) {
      return res.json({ success: true });
    }

    message.liveExpiresAt = new Date();
    await message.save();

    const io = req.app.get('io');
    if (io) {
      const payload = {
        messageId: message._id,
        matchId: message.matchId,
        liveExpiresAt: message.liveExpiresAt,
        stopped: true,
      };
      io.to(message.matchId.toString()).emit('chat:live-location-update', payload);
      io.to(message.receiver.toString()).emit('chat:live-location-update', payload);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Stop live location error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/chat/inline-reply
 *
 * Called by the Android notifee background event handler when the user taps
 * the "Reply" action on a MessagingStyle notification and types a reply in the
 * notification shade. Creates the message and emits it via socket just like a
 * normal send, without requiring the app to be in the foreground.
 *
 * Body: { matchId, text }
 */
router.post('/inline-reply', protect, async (req, res) => {
  const { matchId, text } = req.body;
  const senderId = req.user._id;

  if (!matchId || !text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ success: false, message: 'matchId and text are required' });
  }

  try {
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

    const participants = match.users.map(u => u.toString());
    if (!participants.includes(senderId.toString())) {
      return res.status(403).json({ success: false, message: 'Not a participant' });
    }

    const receiver = participants.find(u => u !== senderId.toString());

    const message = await Message.create({
      matchId,
      sender: senderId,
      receiver,
      content: text.trim(),
      type: 'text',
      seen: false,
    });

    const io = req.app.get('io');
    if (io) {
      const populated = await Message.findById(message._id)
        .populate('sender', 'name photos profilePicture')
        .lean();
      io.to(matchId.toString()).emit('chat:message', populated);
    }

    res.status(201).json({ success: true, message });
  } catch (err) {
    logger.error('[chat/inline-reply] error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

