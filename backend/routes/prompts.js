const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { ProfilePrompt, UserPromptResponse } = require('../models/ProfilePrompt');

router.get('/available', protect, async (req, res) => {
  try {
    let prompts = await ProfilePrompt.find({ isActive: true }).sort({ category: 1 });
    
    if (prompts.length === 0) {
      const defaultPrompts = [
        { category: 'personality', question: "I'm convinced that...", placeholder: "Share a strong belief" },
        { category: 'personality', question: "The way to win me over is...", placeholder: "What makes you fall for someone?" },
        { category: 'personality', question: "My love language is...", placeholder: "How do you show and receive love?" },
        { category: 'lifestyle', question: "A typical Sunday looks like...", placeholder: "Describe your ideal Sunday" },
        { category: 'lifestyle', question: "My most spontaneous moment was...", placeholder: "Tell us about an adventure" },
        { category: 'lifestyle', question: "I won't shut up about...", placeholder: "What's your passion?" },
        { category: 'dating', question: "Together, we could...", placeholder: "Dream date ideas" },
        { category: 'dating', question: "Dating me is like...", placeholder: "Give them a preview" },
        { category: 'dating', question: "I'm looking for someone who...", placeholder: "What do you want in a partner?" },
        { category: 'fun', question: "Two truths and a lie...", placeholder: "Can they guess which is which?" },
        { category: 'fun', question: "My most controversial opinion is...", placeholder: "Share something bold" },
        { category: 'fun', question: "The key to my heart is...", placeholder: "What melts your heart?" },
        { category: 'deep', question: "I feel most grateful for...", placeholder: "What are you thankful for?" },
        { category: 'deep', question: "Something that's non-negotiable for me is...", placeholder: "Share what matters most" },
        { category: 'deep', question: "My biggest life goal is...", placeholder: "What are you working toward?" }
      ];
      await ProfilePrompt.insertMany(defaultPrompts);
      prompts = await ProfilePrompt.find({ isActive: true }).sort({ category: 1 });
    }
    
    const userResponses = await UserPromptResponse.find({ userId: req.user._id });
    const answeredIds = userResponses.map(r => r.promptId.toString());
    
    const promptsWithStatus = prompts.map(prompt => ({
      _id: prompt._id,
      category: prompt.category,
      question: prompt.question,
      placeholder: prompt.placeholder,
      isAnswered: answeredIds.includes(prompt._id.toString())
    }));
    
    res.json({ success: true, prompts: promptsWithStatus });
  } catch (error) {
    logger.error('Get prompts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch prompts' });
  }
});

router.get('/my-responses', protect, async (req, res) => {
  try {
    const responses = await UserPromptResponse.find({ 
      userId: req.user._id,
      isVisible: true 
    })
    .populate('promptId', 'question category')
    .sort({ order: 1 });
    
    res.json({ success: true, responses });
  } catch (error) {
    logger.error('Get responses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch responses' });
  }
});

router.get('/user/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user._id.toString()) {
      const Match = require('../models/Match');
      const match = await Match.findOne({
        users: { $all: [req.user._id, userId] },
        status: 'active'
      });
      if (!match) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const responses = await UserPromptResponse.find({ 
      userId,
      isVisible: true 
    })
    .populate('promptId', 'question category')
    .sort({ order: 1 });
    
    res.json({ success: true, responses });
  } catch (error) {
    logger.error('Get user responses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch responses' });
  }
});

router.post('/answer', protect, async (req, res) => {
  try {
    const { promptId, answer } = req.body;
    
    if (!promptId || !answer) {
      return res.status(400).json({ success: false, message: 'Prompt ID and answer required' });
    }
    
    const prompt = await ProfilePrompt.findById(promptId);
    if (!prompt) {
      return res.status(404).json({ success: false, message: 'Prompt not found' });
    }
    
    const responseCount = await UserPromptResponse.countDocuments({ userId: req.user._id });
    
    const response = await UserPromptResponse.findOneAndUpdate(
      { userId: req.user._id, promptId },
      { 
        answer: answer.trim(),
        order: responseCount
      },
      { upsert: true, new: true }
    );
    
    await response.populate('promptId', 'question category');
    
    res.json({ success: true, response });
  } catch (error) {
    logger.error('Answer prompt error:', error);
    res.status(500).json({ success: false, message: 'Failed to save answer' });
  }
});

router.put('/answer/:responseId', protect, async (req, res) => {
  try {
    const { answer, isVisible } = req.body;
    
    const response = await UserPromptResponse.findOne({
      _id: req.params.responseId,
      userId: req.user._id
    });
    
    if (!response) {
      return res.status(404).json({ success: false, message: 'Response not found' });
    }
    
    if (answer !== undefined) response.answer = answer.trim();
    if (isVisible !== undefined) response.isVisible = isVisible;
    
    await response.save();
    await response.populate('promptId', 'question category');
    
    res.json({ success: true, response });
  } catch (error) {
    logger.error('Update response error:', error);
    res.status(500).json({ success: false, message: 'Failed to update response' });
  }
});

router.delete('/answer/:responseId', protect, async (req, res) => {
  try {
    const result = await UserPromptResponse.findOneAndDelete({
      _id: req.params.responseId,
      userId: req.user._id
    });
    
    if (!result) {
      return res.status(404).json({ success: false, message: 'Response not found' });
    }
    
    res.json({ success: true, message: 'Response deleted' });
  } catch (error) {
    logger.error('Delete response error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete response' });
  }
});

router.put('/reorder', protect, async (req, res) => {
  try {
    const { responseIds } = req.body;
    
    if (!Array.isArray(responseIds)) {
      return res.status(400).json({ success: false, message: 'Response IDs array required' });
    }
    
    const updates = responseIds.map((id, index) => 
      UserPromptResponse.findOneAndUpdate(
        { _id: id, userId: req.user._id },
        { order: index }
      )
    );
    
    await Promise.all(updates);
    
    res.json({ success: true, message: 'Order updated' });
  } catch (error) {
    logger.error('Reorder error:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder' });
  }
});

router.post('/seed', protect, async (req, res) => {
  try {
    const existingCount = await ProfilePrompt.countDocuments();
    if (existingCount > 0) {
      return res.json({ success: true, message: 'Prompts already seeded', count: existingCount });
    }
    
    const defaultPrompts = [
      { category: 'personality', question: "I'm convinced that...", placeholder: "Share a strong belief" },
      { category: 'personality', question: "The way to win me over is...", placeholder: "What makes you fall for someone?" },
      { category: 'personality', question: "My love language is...", placeholder: "How do you show and receive love?" },
      { category: 'lifestyle', question: "A typical Sunday looks like...", placeholder: "Describe your ideal Sunday" },
      { category: 'lifestyle', question: "My most spontaneous moment was...", placeholder: "Tell us about an adventure" },
      { category: 'lifestyle', question: "I won't shut up about...", placeholder: "What's your passion?" },
      { category: 'dating', question: "Together, we could...", placeholder: "Dream date ideas" },
      { category: 'dating', question: "Dating me is like...", placeholder: "Give them a preview" },
      { category: 'dating', question: "I'm looking for someone who...", placeholder: "What do you want in a partner?" },
      { category: 'fun', question: "Two truths and a lie...", placeholder: "Can they guess which is which?" },
      { category: 'fun', question: "My most controversial opinion is...", placeholder: "Share something bold" },
      { category: 'fun', question: "The key to my heart is...", placeholder: "What melts your heart?" },
      { category: 'deep', question: "I feel most grateful for...", placeholder: "What are you thankful for?" },
      { category: 'deep', question: "Something that's non-negotiable for me is...", placeholder: "Share what matters most" },
      { category: 'deep', question: "My biggest life goal is...", placeholder: "What are you working toward?" }
    ];
    
    await ProfilePrompt.insertMany(defaultPrompts);
    
    res.json({ success: true, message: 'Prompts seeded', count: defaultPrompts.length });
  } catch (error) {
    logger.error('Seed prompts error:', error);
    res.status(500).json({ success: false, message: 'Failed to seed prompts' });
  }
});

module.exports = router;
