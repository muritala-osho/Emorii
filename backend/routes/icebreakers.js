const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const IceBreaker = require('../models/IceBreaker');
const User = require('../models/User');
const Message = require('../models/Message');
const logger = require('../utils/logger');

const isAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

const DEFAULT_ICEBREAKERS = [
  { category: 'general',   question: "What's something that made you smile today?", relatedInterests: [] },
  { category: 'general',   question: "If you could teleport anywhere right now, where would you go?", relatedInterests: ['travel'] },
  { category: 'general',   question: "Coffee, tea, or something stronger?", relatedInterests: [] },
  { category: 'general',   question: "What's the most underrated thing about your hometown?", relatedInterests: [] },
  { category: 'general',   question: "Are you more of a morning person or a night owl?", relatedInterests: [] },
  { category: 'general',   question: "What's your go-to feel-good movie?", relatedInterests: ['movies'] },
  { category: 'general',   question: "What's one thing on your bucket list this year?", relatedInterests: [] },
  { category: 'general',   question: "What's a small thing that always makes your day better?", relatedInterests: [] },
  { category: 'general',   question: "If you had a free Saturday, what would you do?", relatedInterests: [] },
  { category: 'general',   question: "What's something you've been meaning to learn?", relatedInterests: [] },

  { category: 'music',     question: "Who's been on repeat for you lately?", relatedInterests: ['music'] },
  { category: 'music',     question: "Burna Boy or Wizkid — and why?", relatedInterests: ['afrobeats', 'music', 'burna boy', 'wizkid'] },
  { category: 'music',     question: "Best concert you've ever been to?", relatedInterests: ['music', 'concerts'] },
  { category: 'music',     question: "Afrobeats, Amapiano, or Hip-Hop for the function?", relatedInterests: ['afrobeats', 'amapiano', 'hip hop', 'music'] },
  { category: 'music',     question: "What song instantly puts you in a good mood?", relatedInterests: ['music'] },
  { category: 'music',     question: "If your life had a theme song, what would it be?", relatedInterests: ['music'] },
  { category: 'music',     question: "Tems, Tiwa, or Ayra Starr?", relatedInterests: ['afrobeats', 'music', 'tems'] },
  { category: 'music',     question: "Karaoke night — what's your go-to song?", relatedInterests: ['music', 'karaoke'] },

  { category: 'movies',    question: "Last show you binged in one weekend?", relatedInterests: ['movies', 'tv', 'netflix'] },
  { category: 'movies',    question: "Marvel or DC — pick a side.", relatedInterests: ['movies', 'marvel'] },
  { category: 'movies',    question: "What's a movie you can quote line-for-line?", relatedInterests: ['movies'] },
  { category: 'movies',    question: "Nollywood, Hollywood, or Bollywood night?", relatedInterests: ['movies', 'nollywood'] },
  { category: 'movies',    question: "What's your comfort show when you can't sleep?", relatedInterests: ['movies', 'tv'] },

  { category: 'food',      question: "Settle it: best Jollof — Nigeria or Ghana?", relatedInterests: ['jollof', 'food', 'nigerian food', 'ghanaian food'] },
  { category: 'food',      question: "What's your signature dish to cook?", relatedInterests: ['food', 'cooking'] },
  { category: 'food',      question: "Sweet tooth or savory snack?", relatedInterests: ['food'] },
  { category: 'food',      question: "Best meal you've had in the last month?", relatedInterests: ['food'] },
  { category: 'food',      question: "Suya, kebabs, or grilled fish at the beach?", relatedInterests: ['food', 'suya', 'beach'] },
  { category: 'food',      question: "What's one dish from home you can never say no to?", relatedInterests: ['food'] },
  { category: 'food',      question: "Pineapple on pizza — yes or absolutely not?", relatedInterests: ['food', 'pizza'] },
  { category: 'food',      question: "Brunch, dinner date, or street food crawl?", relatedInterests: ['food', 'dating'] },

  { category: 'travel',    question: "What's the next country on your travel list?", relatedInterests: ['travel'] },
  { category: 'travel',    question: "Beach holiday or city adventure?", relatedInterests: ['travel', 'beach'] },
  { category: 'travel',    question: "What's the most beautiful place you've been to in Africa?", relatedInterests: ['travel', 'africa'] },
  { category: 'travel',    question: "Window seat or aisle?", relatedInterests: ['travel'] },
  { category: 'travel',    question: "Detty December — Lagos, Accra, or Cape Town?", relatedInterests: ['travel', 'lagos', 'accra', 'cape town'] },
  { category: 'travel',    question: "What's a trip that changed how you see things?", relatedInterests: ['travel'] },
  { category: 'travel',    question: "Solo trip or roll deep with friends?", relatedInterests: ['travel'] },

  { category: 'sports',    question: "Football fan? Who do you support?", relatedInterests: ['football', 'soccer', 'sports'] },
  { category: 'sports',    question: "Gym, run, or sport — what keeps you moving?", relatedInterests: ['fitness', 'gym', 'sports'] },
  { category: 'sports',    question: "AFCON or World Cup — bigger vibe?", relatedInterests: ['football', 'sports', 'afcon'] },
  { category: 'sports',    question: "Ever played a sport competitively?", relatedInterests: ['sports'] },
  { category: 'sports',    question: "Basketball, football, or something else?", relatedInterests: ['sports', 'basketball', 'football'] },

  { category: 'hobbies',   question: "What's something you do that makes time fly?", relatedInterests: [] },
  { category: 'hobbies',   question: "Reader, gamer, or outdoors type?", relatedInterests: ['reading', 'gaming', 'outdoors'] },
  { category: 'hobbies',   question: "What's a creative side of you most people don't see?", relatedInterests: ['art', 'music', 'writing'] },
  { category: 'hobbies',   question: "Last book or podcast you couldn't put down?", relatedInterests: ['reading', 'podcasts'] },
  { category: 'hobbies',   question: "Dancing — natural talent or 'please don't watch'?", relatedInterests: ['dancing'] },
  { category: 'hobbies',   question: "Photography, painting, writing — any of those your thing?", relatedInterests: ['art', 'photography', 'writing'] },

  { category: 'dating',    question: "What made you swipe on me? 😄", relatedInterests: [] },
  { category: 'dating',    question: "Three words to describe your ideal first date?", relatedInterests: ['dating'] },
  { category: 'dating',    question: "What's the most romantic thing someone's done for you?", relatedInterests: ['dating'] },
  { category: 'dating',    question: "Love language: words, time, gifts, touch, or acts?", relatedInterests: ['dating'] },
  { category: 'dating',    question: "What's your green flag in a partner?", relatedInterests: ['dating'] },
  { category: 'dating',    question: "Long walk, candlelit dinner, or wild adventure date?", relatedInterests: ['dating'] },

  { category: 'lifestyle', question: "Early bird workouts or late-night Netflix?", relatedInterests: ['fitness', 'netflix'] },
  { category: 'lifestyle', question: "Cat person, dog person, or 'plants only'?", relatedInterests: ['pets', 'dogs', 'cats'] },
  { category: 'lifestyle', question: "What's a daily ritual you'd never skip?", relatedInterests: [] },
  { category: 'lifestyle', question: "Faith, family, career — how do you stack them?", relatedInterests: ['faith', 'family'] },
  { category: 'lifestyle', question: "City life or the quiet countryside?", relatedInterests: [] },
  { category: 'lifestyle', question: "Morning prayer, gym, journal — what's your start-the-day move?", relatedInterests: ['fitness', 'faith'] },
];

const seedIfEmpty = async () => {
  const count = await IceBreaker.estimatedDocumentCount();
  if (count === 0) {
    try {
      await IceBreaker.insertMany(DEFAULT_ICEBREAKERS);
      logger.log(`[icebreakers] seeded ${DEFAULT_ICEBREAKERS.length} default questions`);
    } catch (e) {
      logger.error('[icebreakers] seed failed:', e.message);
    }
  }
};

const norm = (s) => String(s || '').trim().toLowerCase();

router.get('/suggest/:userId', protect, async (req, res) => {
  try {
    await seedIfEmpty();

    const otherUserId = req.params.userId;
    const limit = Math.min(parseInt(req.query.limit) || 5, 10);

    const otherUser = await User.findById(otherUserId).select('interests').lean();
    const theirInterests = (otherUser?.interests || []).map(norm).filter(Boolean);

    const myInterests = (req.user.interests || []).map(norm).filter(Boolean);
    const sharedInterests = theirInterests.filter((i) => myInterests.includes(i));

    const alreadySent = await Message.find({
      $or: [
        { sender: req.user._id, receiver: otherUserId },
        { sender: otherUserId, receiver: req.user._id },
      ],
      type: 'text',
    }).select('text').limit(200).lean();
    const sentTexts = new Set(alreadySent.map((m) => norm(m.text)));

    const all = await IceBreaker.find({ isActive: true }).lean();

    const scored = all.map((q) => {
      const tags = (q.relatedInterests || []).map(norm);
      let score = 0;
      for (const t of tags) {
        if (sharedInterests.includes(t)) score += 3;
        else if (theirInterests.includes(t)) score += 2;
        else if (myInterests.includes(t)) score += 1;
      }
      if (sentTexts.has(norm(q.question))) score = -1;
      return { q, score };
    });

    const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
    const generals = scored
      .filter((s) => s.score === 0 && q_isGeneral(s.q))
      .sort(() => Math.random() - 0.5);

    const picked = [];
    const seen = new Set();
    const push = (q) => {
      const key = norm(q.question);
      if (seen.has(key)) return;
      seen.add(key);
      picked.push(q);
    };
    for (const s of matched) { if (picked.length >= limit) break; push(s.q); }
    for (const s of generals) { if (picked.length >= limit) break; push(s.q); }
    if (picked.length < limit) {
      const rest = scored.filter((s) => s.score === 0 && !q_isGeneral(s.q)).sort(() => Math.random() - 0.5);
      for (const s of rest) { if (picked.length >= limit) break; push(s.q); }
    }

    res.json({
      success: true,
      suggestions: picked.map((q) => ({
        _id: q._id,
        category: q.category,
        question: q.question,
      })),
      meta: { sharedInterests, theirInterestsCount: theirInterests.length },
    });
  } catch (error) {
    logger.error('[icebreakers] suggest failed:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch suggestions' });
  }
});

function q_isGeneral(q) { return q.category === 'general'; }

router.get('/admin', protect, isAdmin, async (req, res) => {
  try {
    await seedIfEmpty();
    const items = await IceBreaker.find({}).sort({ category: 1, createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to load icebreakers' });
  }
});

router.post('/admin', protect, isAdmin, async (req, res) => {
  try {
    const { category, question, relatedInterests, isActive } = req.body;
    if (!category || !question) {
      return res.status(400).json({ success: false, message: 'category and question are required' });
    }
    const item = await IceBreaker.create({
      category,
      question: String(question).trim().slice(0, 300),
      relatedInterests: Array.isArray(relatedInterests) ? relatedInterests.map((s) => String(s).trim()).filter(Boolean) : [],
      isActive: isActive !== false,
    });
    res.json({ success: true, item });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.put('/admin/:id', protect, isAdmin, async (req, res) => {
  try {
    const update = {};
    ['category', 'question', 'isActive'].forEach((k) => {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    });
    if (req.body.relatedInterests !== undefined) {
      update.relatedInterests = Array.isArray(req.body.relatedInterests)
        ? req.body.relatedInterests.map((s) => String(s).trim()).filter(Boolean)
        : [];
    }
    if (typeof update.question === 'string') update.question = update.question.trim().slice(0, 300);
    const item = await IceBreaker.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, item });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.delete('/admin/:id', protect, isAdmin, async (req, res) => {
  try {
    const item = await IceBreaker.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

module.exports = router;
