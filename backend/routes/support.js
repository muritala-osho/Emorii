/**
 * Centralized Support System — backend/routes/support.js
 *
 * ONE unified support backend shared by:
 *   • User app   (create tickets, view own, reply, read unread count)
 *   • Admin      (view all, reply, assign, change status)
 *   • Agent      (view assigned, reply)
 *
 * Mounted at:  /api/support
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { protect } = require('../middleware/auth');
const { isAdmin, isAdminOrAgent } = require('../middleware/supportAccess');
const { supportTicketLimiter } = require('../middleware/rateLimiter');
const redis = require('../utils/redis');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');
const { sendExpoPushNotification, sendSmartNotification } = require('../utils/pushNotifications');

const fallbackChallenges = new Map();
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

function cleanupFallbackChallenges() {
  const now = Date.now();
  for (const [token, entry] of fallbackChallenges.entries()) {
    if (!entry || entry.expiresAt <= now) fallbackChallenges.delete(token);
  }
}

function createChallengeToken(answer) {
  if (process.env.JWT_SECRET) {
    return jwt.sign({ answer }, process.env.JWT_SECRET, { expiresIn: '10m' });
  }

  cleanupFallbackChallenges();
  const token = `local_${crypto.randomBytes(24).toString('hex')}`;
  fallbackChallenges.set(token, {
    answer,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return token;
}

function verifyChallengeToken(token) {
  if (!token) throw new Error('missing');

  if (token.startsWith('local_')) {
    cleanupFallbackChallenges();
    const entry = fallbackChallenges.get(token);
    if (!entry) throw new Error('expired');
    fallbackChallenges.delete(token);
    return entry.answer;
  }

  if (!process.env.JWT_SECRET) throw new Error('missing_secret');
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  return decoded.answer;
}


/** Send new ticket notification to support@emorii.com via Resend (non-critical) */
async function emailAdmin(ticket) {
  try {
    const { sendNewTicketNotificationEmail } = require('../utils/emailService');
    await sendNewTicketNotificationEmail({
      userName:  ticket.userName  || 'Unknown',
      userEmail: ticket.userEmail || 'Unknown',
      category:  ticket.category  || 'general',
      subject:   ticket.subject   || 'Support Request',
      message:   ticket.messages?.[0]?.content || '',
      ticketId:  ticket._id,
    });
  } catch (err) {
    logger.error('[Support] New ticket email failed (non-critical):', err.message);
  }
}

/** Push notification to a specific user's device (non-critical) */
async function pushToUser(userId, title, body, data = {}) {
  if (!userId) return;
  try {
    const user = await User.findById(userId).select(
      'pushToken pushNotificationsEnabled muteSettings notificationPreferences'
    );
    if (user?.pushToken) {
      await sendSmartNotification(user, { title, body, data, channelId: 'support' }, 'support');
    }
  } catch (err) {
    logger.error('[Support] Push to user failed (non-critical):', err.message);
  }
}

/** Push notification to the assigned agent, or all admins if unassigned */
async function pushToStaff(ticket, title, body) {
  try {
    const query = ticket.assignedTo
      ? { _id: ticket.assignedTo }
      : { isAdmin: true };
    const staffList = await User.find(query).select('pushToken pushNotificationsEnabled');
    for (const staff of staffList) {
      if (staff?.pushToken && staff.pushNotificationsEnabled !== false) {
        await sendExpoPushNotification(staff.pushToken, {
          title,
          body,
          data: { screen: 'AdminSupport', ticketId: ticket._id.toString() },
          channelId: 'support',
        });
      }
    }
  } catch (err) {
    logger.error('[Support] Push to staff failed (non-critical):', err.message);
  }
}


/**
 * Built-in rule engine — keyword + category matching.
 * Returns the most specific reply it can find, or a warm generic fallback.
 */
function getRuleBasedBotReply(category, subject, message) {
  // Combine subject + message for broader keyword coverage
  const text = `${subject || ''} ${message || ''}`.toLowerCase();

  const has = (...words) => words.some(w => text.includes(w));

  /* ── BILLING ─────────────────────────────────────────────────── */
  if (category === 'billing') {
    if (has('refund', 'charge', 'overcharge', 'double charge', 'charged twice'))
      return "Hi there! We're sorry to hear about this billing issue. We've flagged your account for review and our billing team will look into the charge within 24 hours. Please don't worry — if an error occurred it will be corrected. A support agent will follow up with you directly.";

    if (has('cancel', 'cancellation', 'unsubscribe'))
      return "We've received your cancellation request. To cancel your subscription right now, go to Settings → Subscription → Cancel Plan inside the app. If you're having trouble with that, reply here and an agent will process it manually for you.";

    if (has('subscription', 'premium', 'upgrade', 'plan', 'gold', 'vip'))
      return "Thanks for reaching out about your subscription! You can view and manage your plan under Settings → Subscription in the app. If something isn't working as expected, our team will be happy to sort it out — a support agent will follow up within 24 hours.";

    if (has('payment', 'card', 'paypal', 'declined', 'failed payment'))
      return "Sorry to hear your payment didn't go through! Please check that your card details are up to date in Settings → Payment Methods. If the issue continues after updating, our team will investigate and get back to you within 24 hours.";

    return "Thank you for reaching out about a billing matter. We've logged your request and our finance team will review your account within 24 hours. A support agent will follow up with a resolution.";
  }

  /* ── ACCOUNT ─────────────────────────────────────────────────── */
  if (category === 'account') {
    if (has('login', 'log in', 'sign in', 'password', 'forgot', 'reset', "can't access", 'locked out'))
      return "Sorry to hear you're having trouble logging in! Please tap 'Forgot Password' on the login screen and follow the steps to reset it. Check your spam folder if you don't see the email. If that doesn't work, reply here and an agent will help you regain access.";

    if (has('delete', 'deactivate', 'close account', 'remove account'))
      return "We're sorry to see you go! To delete your account, go to Settings → Privacy → Delete Account in the app. Please note that deletion is permanent and cannot be undone. If you need help or want to discuss alternatives, a support agent is happy to assist.";

    if (has('ban', 'banned', 'suspend', 'suspended', 'disabled', 'restricted'))
      return "We're sorry your account is restricted. This usually happens when our system detects activity that may violate our community guidelines. Your case has been flagged for review and a support agent will reach out within 24 hours with more information.";

    if (has('verif', 'id check', 'selfie', 'photo check', 'face verif'))
      return "Thanks for submitting your verification request! Our team typically reviews submissions within 24–48 hours. If you've already submitted your documents, please sit tight — we'll notify you as soon as it's processed.";

    if (has('profile', 'photo', 'picture', 'bio', 'edit'))
      return "For profile changes, go to your profile page and tap Edit. If photos are being rejected or the edit isn't saving, please try clearing the app cache or reinstalling. If the problem continues, reply here and an agent will look into it.";

    if (has('match', 'like', 'swipe', 'connection'))
      return "Thanks for reaching out about your matches! Matches are based on your preferences and mutual interest. Make sure your profile is complete and visible in Settings → Privacy. If you think something is wrong with your matching, let us know and a technical agent will investigate.";

    return "Thank you for reaching out about your account. We've noted your request and our support team will look into this within 24 hours. An agent will follow up with you directly.";
  }

  /* ── TECHNICAL ───────────────────────────────────────────────── */
  if (category === 'technical') {
    if (has('crash', 'crashing', 'keeps closing', 'force close', 'freezing', 'frozen'))
      return "We're sorry the app is crashing for you! First, please try force-closing the app, then reopening it. Also check for any available updates in the App Store or Google Play. If it continues, try reinstalling the app (your account data is safely stored). If none of that helps, please let us know your device model and OS version and we'll dig deeper.";

    if (has('notification', 'push', 'alert', "not receiving", "no notification"))
      return "For missing notifications, please check: 1) Device Settings → Emorii → Notifications are ON, 2) In-app Settings → Notifications are enabled, 3) Your phone isn't in Do Not Disturb mode. If all that looks correct, try logging out and back in. Still having issues? Reply here and we'll investigate.";

    if (has('video', 'call', 'audio', 'sound', 'mic', 'camera', 'voice call'))
      return "For call issues, please ensure Emorii has permission to access your camera and microphone (device Settings → Emorii → Permissions). Also check your internet connection — calls work best on Wi-Fi or a strong mobile signal. If it still isn't working, an agent will follow up within 24 hours.";

    if (has('message', 'chat', "can't send", 'not sending', 'message failed'))
      return "Sorry your messages aren't going through! Please check your internet connection and try again. If the issue is with a specific person, they may have restricted their messages. For anything else, reply here and our technical team will investigate.";

    if (has('slow', 'loading', 'lag', 'lagging', 'takes long'))
      return "We're sorry the app feels slow! Try closing other background apps to free up memory, and make sure you're on a stable internet connection. Clearing the app cache in your device settings can also help. If it's still slow, please share your device type and we'll look into it further.";

    if (has('update', 'version', 'upgrade app'))
      return "Please make sure you have the latest version of Emorii installed — updates often contain important fixes. Visit the App Store or Google Play and tap Update if one is available. If you're already on the latest version and still experiencing issues, a technical agent will follow up.";

    return "Thank you for reporting this technical issue. Our engineering team has been notified. In the meantime, try restarting the app and checking for updates. We'll follow up within 24 hours if the problem persists.";
  }

  /* ── SAFETY ──────────────────────────────────────────────────── */
  if (category === 'safety') {
    if (has('harassment', 'harass', 'threaten', 'threat', 'abuse', 'abusive'))
      return "We take harassment and threats extremely seriously and we're sorry this happened to you. Your report has been escalated to our Trust & Safety team as a priority. We recommend blocking this user immediately (tap their profile → Block). We'll review and take action within 12 hours.";

    if (has('fake', 'scam', 'catfish', 'fraud', 'impersonat'))
      return "Thank you for reporting this — fake profiles and scams go against everything Emorii stands for. We've escalated this to our Trust & Safety team who will investigate the reported account within 24 hours. We'll update you on the outcome.";

    if (has('inappropriate', 'nude', 'explicit', 'content'))
      return "Thank you for flagging this content — it's exactly the kind of report that keeps our community safe. Our safety team will review the reported content as a priority. If you haven't already, please use the in-app Report button on the content itself so it gets reviewed immediately.";

    return "Thank you for bringing this safety concern to our attention — we take every report seriously. Your case has been escalated to our Trust & Safety team who will review it as a priority. We'll follow up within 12 hours. Your safety matters to us. 💚";
  }

  /* ── GENERIC FALLBACK ────────────────────────────────────────── */
  return "Hi there! Thanks for reaching out to Emorii Support 💚 We've received your message and a member of our team will review it and get back to you within 24 hours. If your issue is urgent, feel free to add more details here and we'll prioritise it.";
}

/**
 * Generate an automatic first reply for a new ticket using the built-in rule engine.
 */
async function generateBotReply(category, subject, message) {
  return getRuleBasedBotReply(category, subject, message);
}

/**
 * GET /api/support/challenge
 * Returns a simple math CAPTCHA question + a short-lived token containing the answer.
 * The client must solve the question and submit both the token and answer with their ticket.
 */
router.get('/challenge', (req, res) => {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  const ops = [
    { symbol: '+', answer: a + b },
    { symbol: '-', answer: a - b },
    { symbol: 'x', answer: a * b },
  ];
  const op = ops[Math.floor(Math.random() * ops.length)];
  const question = `What is ${a} ${op.symbol} ${b}?`;

  const challengeToken = createChallengeToken(op.answer);

  res.json({ success: true, question, challengeToken });
});

/**
 * POST /api/support/ticket
 * Create a new support ticket.
 * Works without auth (public contact form) or with auth (links to user account).
 * Requires a valid CAPTCHA challenge (challengeToken + challengeAnswer) for unauthenticated requests.
 */
router.post('/ticket', supportTicketLimiter, async (req, res) => {
  try {
    const { name, email, message, subject, category, challengeToken, challengeAnswer } = req.body;

    const authHeader = req.headers.authorization;
    const isAuthenticated = !!(authHeader && authHeader.startsWith('Bearer '));

    if (!isAuthenticated) {
      if (!challengeToken || challengeAnswer === undefined || challengeAnswer === '') {
        return res.status(400).json({
          success: false,
          message: 'Please complete the security challenge to submit a ticket.',
          requiresChallenge: true
        });
      }
      let expectedAnswer;
      try {
        expectedAnswer = verifyChallengeToken(challengeToken);
      } catch (_) {
        return res.status(400).json({
          success: false,
          message: 'Challenge expired. Please request a new one.',
          requiresChallenge: true
        });
      }
      if (parseInt(challengeAnswer, 10) !== expectedAnswer) {
        return res.status(400).json({
          success: false,
          message: 'Incorrect answer to the security challenge.',
          requiresChallenge: true
        });
      }
    }

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Name, email and message are required' });
    }

    // Per-email rate limit — max 3 tickets per hour regardless of IP or CAPTCHA.
    // Prevents spammers who rotate IPs or use CAPTCHA-solving services from
    // flooding support with fake tickets attributed to real email addresses.
    const emailKey = `support:ticket:${email.toLowerCase().trim()}`;
    const emailCount = parseInt((await redis.get(emailKey).catch(() => null)) || '0', 10);
    if (emailCount >= 3) {
      return res.status(429).json({
        success: false,
        message: 'Too many support tickets submitted from this email address. Please wait an hour before trying again.',
      });
    }
    await redis.set(emailKey, emailCount + 1, 3600).catch(() => {});

    let resolvedUserId = null;
    if (isAuthenticated) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        resolvedUserId = decoded.id;
      } catch (_) {}
    }

    const priorityMap = { billing: 'high', account: 'medium', technical: 'medium', safety: 'high', other: 'low' };
    const cat = category || 'other';

    const ticket = new SupportTicket({
      userId: resolvedUserId,
      userName: name,
      userEmail: email,
      subject: subject || 'Support Request',
      category: cat,
      priority: priorityMap[cat] || 'medium',
      status: 'open',
      unreadByAgent: 1,
      messages: [{
        role: 'user',
        content: message,
        senderName: name,
        senderId: resolvedUserId || undefined,
        timestamp: new Date(),
      }],
    });
    await ticket.save();

    await pushToStaff(ticket, '🎫 New Support Ticket', `${name}: ${subject || message.slice(0, 60)}`);
    await emailAdmin(ticket);

    // Fire-and-forget bot auto-reply (non-blocking, never crashes ticket creation)
    setImmediate(async () => {
      try {
        const botReply = await generateBotReply(cat, subject || 'Support Request', message);
        ticket.messages.push({
          role: 'agent',
          content: botReply,
          senderName: 'Emorii Support Bot',
          timestamp: new Date(),
        });
        ticket.status = 'pending';
        ticket.unreadByUser = 1;
        await ticket.save();
        await pushToUser(
          resolvedUserId,
          '💬 Support Reply',
          botReply.length > 80 ? botReply.slice(0, 80) + '…' : botReply,
          { screen: 'Support', ticketId: ticket._id.toString() }
        );
      } catch (botErr) {
        logger.error('[SupportBot] Auto-reply failed (non-critical):', botErr.message);
      }
    });

    res.json({ success: true, ticketId: ticket._id, message: "Ticket created. We'll reply within 24 hours." });
  } catch (error) {
    logger.error('[Support] Create ticket error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** Legacy alias — old clients POST to /contact, route to /ticket handler */
router.post('/contact', async (req, res, next) => {
  req.url = '/ticket';
  return router.handle(req, res, next);
});

/**
 * GET /api/support/user
 * Get the authenticated user's own tickets.
 */
router.get('/user', protect, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json({ success: true, tickets });
  } catch (error) {
    logger.error('[Support] Get user tickets error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/support/ticket/:id
 * Fetch a single ticket with all messages.
 * - User can only fetch their own ticket.
 * - Agent can only fetch their assigned tickets.
 * - Admin can fetch any ticket.
 * Clears the unread counter for the caller's role.
 */
router.get('/ticket/:id', protect, async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate('assignedTo', 'name email');
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const isStaff = req.user.isAdmin || req.user.isSupportAgent;

    if (!isStaff && String(ticket.userId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const unreadUpdate = isStaff ? { unreadByAgent: 0 } : { unreadByUser: 0 };
    await SupportTicket.findByIdAndUpdate(req.params.id, unreadUpdate);

    res.json({ success: true, ticket });
  } catch (error) {
    logger.error('[Support] Get ticket error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/support/unread
 * Total unread reply count for the authenticated user (drives badge in app).
 */
router.get('/unread', protect, async (req, res) => {
  try {
    const result = await SupportTicket.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: null, total: { $sum: '$unreadByUser' } } },
    ]);
    const count = result[0]?.total || 0;
    res.json({ success: true, count });
  } catch (error) {
    logger.error('[Support] Unread count error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


/**
 * POST /api/support/reply
 * Add a message to a ticket thread. Works for all three roles.
 * Body: { ticketId, content }
 */
router.post('/reply', protect, async (req, res) => {
  try {
    const { ticketId, content } = req.body;
    if (!ticketId || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'ticketId and content are required' });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    let senderRole;
    if (req.user.isAdmin) senderRole = 'admin';
    else if (req.user.isSupportAgent) senderRole = 'agent';
    else senderRole = 'user';

    if (senderRole === 'user' && String(ticket.userId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const isStaff = senderRole !== 'user';
    const displayName = req.user.name || (isStaff ? 'Emorii Support' : ticket.userName);

    ticket.messages.push({
      role: senderRole,
      content: content.trim(),
      senderName: displayName,
      senderId: req.user._id,
      adminName: isStaff ? displayName : undefined, // backward compat
      timestamp: new Date(),
    });

    if (isStaff) {
      if (ticket.status === 'open') ticket.status = 'in-progress';
      ticket.unreadByUser = (ticket.unreadByUser || 0) + 1;

      await pushToUser(ticket.userId, '💬 Support Reply', content.length > 80 ? content.slice(0, 80) + '…' : content, {
        screen: 'Support',
        ticketId: ticket._id.toString(),
      });

      if (ticket.userId) {
        try {
          const ticketUser = await User.findById(ticket.userId).select('email name');
          if (ticketUser?.email) {
            const { sendSupportReplyEmail } = require('../utils/emailService');
            await sendSupportReplyEmail(ticketUser.email, ticketUser.name, content.trim(), ticket.subject);
          }
        } catch (e) {
          logger.error('[Support] Reply email failed (non-critical):', e.message);
        }
      }
    } else {
      if (ticket.status === 'closed') ticket.status = 'open';
      ticket.unreadByAgent = (ticket.unreadByAgent || 0) + 1;
      await pushToStaff(ticket, '💬 User Reply', `${ticket.userName}: ${content.slice(0, 60)}`);
    }

    await ticket.save();
    res.json({ success: true, ticket });
  } catch (error) {
    logger.error('[Support] Reply error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


/**
 * GET /api/support/all
 * Admin and agents: all tickets with optional filters.
 */
router.get('/all', protect, isAdminOrAgent, async (req, res) => {
  try {
    const { status, category, priority, page = 1, limit = 50 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;

    const tickets = await SupportTicket.find(query)
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await SupportTicket.countDocuments(query);

    res.json({ success: true, tickets, total });
  } catch (error) {
    logger.error('[Support] Get all tickets error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PATCH /api/support/status
 * Update ticket status. Admin can update any; agent only their assigned tickets.
 * Body: { ticketId, status }
 */
router.patch('/status', protect, isAdminOrAgent, async (req, res) => {
  try {
    const { ticketId, status } = req.body;
    const allowedStatuses = ['open', 'pending', 'in-progress', 'closed'];
    if (!ticketId || !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'ticketId and a valid status are required' });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    if (req.user.isSupportAgent && !req.user.isAdmin) {
      if (!ticket.assignedTo || String(ticket.assignedTo) !== String(req.user._id)) {
        return res.status(403).json({ success: false, message: 'Not authorized to update this ticket' });
      }
    }

    ticket.status = status;
    if (status === 'closed') {
      ticket.resolvedAt = new Date();
      ticket.resolvedBy = req.user._id;
      await pushToUser(ticket.userId, '✅ Ticket Resolved', `Your ticket "${ticket.subject}" has been closed.`, {
        screen: 'Support',
        ticketId: ticket._id.toString(),
      });
    }
    await ticket.save();

    res.json({ success: true, ticket });
  } catch (error) {
    logger.error('[Support] Update status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PATCH /api/support/assign
 * Assign or un-assign a ticket to/from a support agent. Admin only.
 * Body: { ticketId, agentId }  — agentId = null to un-assign
 */
router.patch('/assign', protect, isAdmin, async (req, res) => {
  try {
    const { ticketId, agentId } = req.body;
    if (!ticketId) return res.status(400).json({ success: false, message: 'ticketId is required' });

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    if (agentId) {
      const agent = await User.findById(agentId).select('name isSupportAgent isAdmin');
      if (!agent || (!agent.isSupportAgent && !agent.isAdmin)) {
        return res.status(400).json({ success: false, message: 'Target user is not a support agent or admin' });
      }
      ticket.assignedTo = agentId;
      ticket.assignedAt = new Date();
      if (ticket.status === 'open') ticket.status = 'in-progress';
      await pushToUser(agentId, '🎫 Ticket Assigned', `"${ticket.subject}" has been assigned to you.`, {
        screen: 'AdminSupport',
        ticketId: ticket._id.toString(),
      });
    } else {
      ticket.assignedTo = null;
      ticket.assignedAt = null;
    }

    await ticket.save();
    const populated = await SupportTicket.findById(ticket._id).populate('assignedTo', 'name email');
    res.json({ success: true, ticket: populated });
  } catch (error) {
    logger.error('[Support] Assign error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/support/agents
 * List all staff users (admin + support agents) for the assignment dropdown.
 * Admin only.
 */
router.get('/agents', protect, isAdmin, async (req, res) => {
  try {
    const agents = await User.find({
      $or: [{ isSupportAgent: true }, { isAdmin: true }],
    }).select('name email isSupportAgent isAdmin');
    res.json({ success: true, agents });
  } catch (error) {
    logger.error('[Support] Get agents error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


router.get('/my-tickets', protect, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json({ success: true, tickets });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/my-messages', protect, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(20);
    const messages = tickets.flatMap(t =>
      t.messages.map(m => {
        const isFromAdmin = m.role === 'admin' || m.role === 'agent';
        return {
          id: m._id,
          ticketId: t._id,
          subject: t.subject,
          message: m.content,
          isFromAdmin,
          // Only populate adminName for staff messages — populating it for user
          // messages caused the chat UI to mis-render the user's own replies as
          // staff replies (left-aligned), since the bubble renderer treats any
          // message with a non-empty adminName as staff.
          adminName: isFromAdmin ? (m.senderName || m.adminName) : undefined,
          createdAt: m.timestamp,
        };
      })
    );
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
