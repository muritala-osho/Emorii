const logger = require('../utils/logger');

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const FriendRequest = require('../models/FriendRequest');
const Match = require('../models/Match');
const User = require('../models/User');

router.post('/request', protect, async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    logger.log('[MATCH] User', req.user._id, 'liking user', receiverId);

    if (receiverId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot send request to yourself' });
    }

    const existingRequest = await FriendRequest.findOne({
      sender: req.user._id,
      receiver: receiverId
    });

    if (existingRequest) {
      logger.log('[MATCH] Request already exists, status:', existingRequest.status);
      
      if (existingRequest.status === 'accepted') {
        let existingMatch = await Match.findOne({
          users: { $all: [req.user._id, receiverId] },
          status: 'active'
        });
        
        if (!existingMatch) {
          try {
            existingMatch = await Match.create({
              users: [req.user._id, receiverId],
              isSuperLike: false,
              status: 'active'
            });
            logger.log('[MATCH] Created missing match document:', existingMatch._id);
          } catch (createErr) {
            logger.error('[MATCH] Error creating match:', createErr);
          }
        }
        
        const matchedUser = await User.findById(receiverId).select('name photos age');
        logger.log('[MATCH] Already matched! Returning match info');
        return res.status(200).json({ 
          success: true, 
          isMatch: true,
          match: existingMatch,
          matchedUser,
          message: "You're already matched!"
        });
      }
      
      if (existingRequest.status === 'pending') {
        logger.log('[MATCH] Request still pending');
        return res.status(200).json({ success: true, isMatch: false, message: 'Request already sent, waiting for response' });
      }
      
      return res.status(400).json({ success: false, message: 'Match request already sent' });
    }

    const reverseRequest = await FriendRequest.findOne({
      sender: receiverId,
      receiver: req.user._id,
      status: 'pending'
    }).populate('sender', 'name photos age');

    if (reverseRequest) {
      logger.log('[MATCH] Mutual like detected! Creating match between', req.user._id, 'and', receiverId);
      reverseRequest.status = 'accepted';
      await reverseRequest.save();

      const userId1 = req.user._id.toString();
      const userId2 = receiverId.toString();

      const existingMatch = await Match.findOne({
        users: { $all: [req.user._id, receiverId] },
        status: 'active'
      });

      let match = existingMatch;
      if (!existingMatch) {
        try {
          match = await Match.create({
            users: [req.user._id, receiverId],
            isSuperLike: false,
            status: 'active'
          });
          logger.log('Match created successfully:', match._id, 'between', userId1, 'and', userId2);
        } catch (matchError) {
          logger.error('Error creating match:', matchError);
          return res.status(200).json({ 
            success: true, 
            isMatch: true,
            matchedUser: reverseRequest.sender,
            message: "It's a match!"
          });
        }
      }

      // Notify the user who liked FIRST via socket so their MatchPopup
      // appears in real-time without them needing to reload the app.
      try {
        const io = req.app.get('io');
        if (io) {
          const currentUserDoc = await User.findById(req.user._id).select('name photos');
          io.to(receiverId.toString()).emit('match:new', {
            matchId: match?._id?.toString(),
            matchedUser: {
              id: req.user._id.toString(),
              name: currentUserDoc?.name || 'Someone',
              photos: currentUserDoc?.photos || [],
            },
            isSuperLike: false,
          });
          logger.log('[MATCH] Emitted match:new to user', receiverId);
        }
      } catch (socketErr) {
        logger.error('[MATCH] Failed to emit match:new socket event:', socketErr);
      }

      return res.status(200).json({ 
        success: true, 
        isMatch: true,
        match,
        matchedUser: reverseRequest.sender,
        message: "It's a match!"
      });
    }

    const friendRequest = await FriendRequest.create({
      sender: req.user._id,
      receiver: receiverId,
      message
    });

    await friendRequest.populate('sender', 'name photos age');

    res.status(201).json({ success: true, friendRequest, isMatch: false });
  } catch (error) {
    logger.error('Send friend request error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/requests', protect, async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      receiver: req.user._id,
      status: 'pending'
    })
    .populate('sender', 'name photos age bio')
    .sort({ createdAt: -1 });

    res.json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/request/:requestId', protect, async (req, res) => {
  try {
    const { action } = req.body; // 'accept' or 'reject'
    
    const friendRequest = await FriendRequest.findById(req.params.requestId)
      .populate('sender', 'name photos age');

    if (!friendRequest) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (!friendRequest.receiver.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    friendRequest.status = action === 'accept' ? 'accepted' : 'rejected';
    await friendRequest.save();

    let match = null;
    if (action === 'accept') {
      const existingMatch = await Match.findOne({
        users: { $all: [friendRequest.sender._id, friendRequest.receiver] },
        status: 'active'
      });

      if (!existingMatch) {
        match = await Match.create({
          users: [friendRequest.sender._id, friendRequest.receiver],
          isSuperLike: false
        });
      } else {
        match = existingMatch;
      }
    }

    res.json({ 
      success: true, 
      friendRequest,
      match,
      isMatch: action === 'accept'
    });
  } catch (error) {
    logger.error('Accept/reject request error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/sent-requests', protect, async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      sender: req.user._id,
      status: 'pending'
    })
    .populate('receiver', 'name photos age bio')
    .sort({ createdAt: -1 });

    res.json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
