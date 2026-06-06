
const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { protect } = require('../middleware/auth');
const CallHistory = require('../models/CallHistory');
const Match = require('../models/Match');
const Message = require('../models/Message');

const createCallMessage = async (callerId, receiverId, callType, callStatus, duration = 0, io) => {
  try {
    const match = await Match.findOne({
      users: { $all: [callerId, receiverId] },
      status: 'active'
    });
    
    if (!match) return null;
    
    const callTypeLabel = callType === 'video' ? 'Video' : 'Voice';
    let content = '';
    
    if (callStatus === 'missed') {
      content = `📞 Missed ${callTypeLabel} call`;
    } else if (callStatus === 'rejected' || callStatus === 'declined') {
      content = `📞 ${callTypeLabel} call declined`;
    } else if (callStatus === 'completed') {
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      content = `📞 ${callTypeLabel} call - ${durationStr}`;
    } else {
      content = `📞 ${callTypeLabel} call ended`;
    }
    
    const message = await Message.create({
      matchId: match._id,
      sender: callerId,
      receiver: receiverId,
      type: 'call',
      content,
      callType: callType,
      callStatus: callStatus,
      callDuration: duration,
      status: 'delivered',
      deliveredAt: new Date()
    });
    
    await message.populate('sender', 'name photos');
    
    if (io) {
      io.to(match._id.toString()).emit('message:new', message);
    }
    
    return message;
  } catch (error) {
    logger.error('Create call message error:', error);
    return null;
  }
};

router.post('/initiate', protect, async (req, res) => {
  try {
    const { receiverId, type } = req.body; // type: 'video' or 'audio'

    const callHistory = await CallHistory.create({
      caller: req.user._id,
      receiver: receiverId,
      type,
      status: 'ongoing',
      startedAt: new Date()
    });

    res.status(201).json({ success: true, callHistory });
  } catch (error) {
    logger.error('Initiate call error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/decline', protect, async (req, res) => {
  try {
    const { callerId, type } = req.body;

    if (!callerId) {
      return res.status(400).json({ success: false, message: 'callerId is required' });
    }

    const callHistory = await CallHistory.create({
      caller: callerId,
      receiver: req.user._id,
      type,
      status: 'rejected'
    });

    const io = req.app.get('io');

    // Save the call record as a chat message
    await createCallMessage(callerId, req.user._id, type, 'declined', 0, io);

    // Notify the caller's socket so their VoiceCallScreen dismisses immediately.
    // This is the critical path for killed-app declines: the receiver's app never
    // opened (decline was handled entirely in the Notifee background handler), so
    // no socket event was emitted. The REST call is the only channel available.
    if (io) {
      io.to(callerId).emit('call:declined', { declinedBy: req.user._id });
      logger.log(`[CallDecline] Emitted call:declined to caller ${callerId} from ${req.user._id}`);
    }

    // Clear the Redis busy flags for both parties so neither user is stuck as
    // "busy" for the remainder of the 5-minute TTL.
    try {
      const redis = require('../utils/redis');
      await Promise.all([
        redis.del(`busy:${req.user._id}`),
        redis.del(`busy:${callerId}`),
      ]);
    } catch (redisErr) {
      logger.warn('[CallDecline] Failed to clear Redis busy flags (non-fatal):', redisErr?.message);
    }

    res.status(201).json({ success: true, callHistory });
  } catch (error) {
    logger.error('Decline call error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/missed', protect, async (req, res) => {
  try {
    const { callerId, type } = req.body;

    const callHistory = await CallHistory.create({
      caller: callerId,
      receiver: req.user._id,
      type,
      status: 'missed'
    });

    const io = req.app.get('io');
    await createCallMessage(callerId, req.user._id, type, 'missed', 0, io);

    res.status(201).json({ success: true, callHistory });
  } catch (error) {
    logger.error('Missed call error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:callId/end', protect, async (req, res) => {
  try {
    const { duration, status } = req.body;

    const call = await CallHistory.findById(req.params.callId);
    if (!call) {
      return res.status(404).json({ success: false, message: 'Call not found' });
    }

    call.duration = duration;
    call.status = status || 'completed';
    call.endedAt = Date.now();
    await call.save();

    const io = req.app.get('io');
    await createCallMessage(call.caller, call.receiver, call.type, call.status, duration, io);

    res.json({ success: true, call });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/quality', protect, async (req, res) => {
  try {
    const { rating, callType, peerId, duration } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'rating must be 1-5' });
    }

    const mongoose = require('mongoose');
    const peerObjectId = mongoose.isValidObjectId(peerId) ? new mongoose.Types.ObjectId(peerId) : null;

    if (peerObjectId) {
      const recent = await CallHistory.findOne({
        $or: [
          { caller: req.user._id, receiver: peerObjectId },
          { caller: peerObjectId, receiver: req.user._id },
        ],
        status: { $in: ['completed', 'ongoing'] },
      }).sort({ createdAt: -1 });

      if (recent && !recent.qualityRating) {
        recent.qualityRating = rating;
        await recent.save();
      }
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Call quality rating error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/history', protect, async (req, res) => {
  try {
    const calls = await CallHistory.find({
      $or: [
        { caller: req.user._id },
        { receiver: req.user._id }
      ]
    })
    .populate('caller', 'name photos')
    .populate('receiver', 'name photos')
    .sort({ createdAt: -1 })
    .limit(50);

    res.json({ success: true, calls });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
