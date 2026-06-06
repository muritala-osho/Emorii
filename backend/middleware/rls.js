const Match = require('../models/Match');
const Message = require('../models/Message');

/**
 * Row-Level Security (RLS) middleware for MongoDB.
 *
 * MongoDB has no native RLS, so these middleware functions enforce data
 * ownership and access rules at the application layer, consistent with
 * how PostgreSQL RLS policies work at the database layer.
 *
 * Usage: add as middleware between `protect` and the route handler.
 * Example: router.post('/:matchId', protect, matchParticipant, handler)
 */

/**
 * Ensures the authenticated user is a participant in the match/conversation.
 * Attaches `req.match` for use in subsequent handlers (avoids a second DB query).
 * Applied to: any route that accesses /:matchId chat data.
 */
const matchParticipant = async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.matchId);
    if (!match) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }
    const isParticipant = match.users.some(u => u.equals(req.user._id));
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'You are not a participant in this conversation.' });
    }
    req.match = match;
    next();
  } catch (err) {
    console.error('RLS matchParticipant error:', err.message);
    return res.status(500).json({ success: false, message: 'Access check failed.' });
  }
};

/**
 * Ensures the authenticated user is either the sender or receiver of the
 * message specified by req.params.messageId.
 * Attaches `req.message` for use in subsequent handlers.
 * Applied to: routes that read or mutate a specific message.
 */
const messageSenderOrReceiver = async (req, res, next) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found.' });
    }
    const uid = req.user._id;
    const hasAccess = message.sender.equals(uid) || message.receiver.equals(uid);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'You do not have access to this message.' });
    }
    req.message = message;
    next();
  } catch (err) {
    console.error('RLS messageSenderOrReceiver error:', err.message);
    return res.status(500).json({ success: false, message: 'Access check failed.' });
  }
};

/**
 * Ensures the authenticated user is modifying only their own user resource.
 * Use on routes where :userId or :id param should match the authenticated user.
 * Applied to: routes like PUT /users/:id that should be self-only.
 */
const ownUser = (req, res, next) => {
  const targetId = req.params.userId || req.params.id;
  if (targetId && targetId !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'You can only modify your own data.' });
  }
  next();
};

/**
 * Blocks access for users who are currently banned.
 * The `protect` middleware already covers this, but this can be added
 * as an additional explicit gate on sensitive mutation routes.
 */
const notBanned = (req, res, next) => {
  if (req.user.banned) {
    return res.status(403).json({ success: false, message: 'Your account has been banned.' });
  }
  next();
};

/**
 * Ensures the authenticated user has an active premium subscription.
 * Centralises the premium gate so individual route handlers stay clean.
 * Applied to: any route that should only be accessible to premium users.
 */
const requirePremium = (req, res, next) => {
  if (!req.user.premium?.isActive) {
    return res.status(403).json({
      success: false,
      message: 'This feature requires a Premium subscription.',
      requiresPremium: true,
    });
  }
  next();
};

module.exports = { matchParticipant, messageSenderOrReceiver, ownUser, notBanned, requirePremium };
