const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { QuizQuestion, UserQuizResponse } = require('../models/CompatibilityQuiz');

router.get('/questions', protect, async (req, res) => {
  try {
    const questions = await QuizQuestion.find({ isActive: true })
      .sort({ category: 1, createdAt: 1 });
    
    res.json({
      success: true,
      questions
    });
  } catch (error) {
    logger.error('Get quiz questions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch questions' });
  }
});

router.get('/responses', protect, async (req, res) => {
  try {
    const userResponse = await UserQuizResponse.findOne({ userId: req.user._id })
      .populate('responses.questionId');
    
    res.json({
      success: true,
      responses: userResponse?.responses || [],
      completedAt: userResponse?.completedAt || null,
      totalQuestions: userResponse?.totalQuestions || 0
    });
  } catch (error) {
    logger.error('Get quiz responses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch responses' });
  }
});

router.post('/submit', protect, async (req, res) => {
  try {
    const { responses } = req.body;
    
    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Responses are required' 
      });
    }

    const questionIds = responses.map(r => r.questionId);
    const validQuestions = await QuizQuestion.find({ 
      _id: { $in: questionIds },
      isActive: true 
    });
    
    if (validQuestions.length !== questionIds.length) {
      return res.status(400).json({ 
        success: false, 
        message: 'Some questions are invalid' 
      });
    }

    const formattedResponses = responses.map(r => ({
      questionId: r.questionId,
      selectedOption: {
        text: r.selectedOption.text,
        value: r.selectedOption.value
      },
      answeredAt: new Date()
    }));

    const userResponse = await UserQuizResponse.findOneAndUpdate(
      { userId: req.user._id },
      {
        userId: req.user._id,
        responses: formattedResponses,
        completedAt: new Date(),
        totalQuestions: formattedResponses.length
      },
      { upsert: true, new: true }
    );

    const categoryScores = {};
    const categoryTotals = {};
    
    for (const response of formattedResponses) {
      const question = validQuestions.find(q => q._id.toString() === response.questionId.toString());
      if (question) {
        if (!categoryScores[question.category]) {
          categoryScores[question.category] = 0;
          categoryTotals[question.category] = 0;
        }
        categoryScores[question.category] += response.selectedOption.value;
        categoryTotals[question.category] += 1;
      }
    }

    const profile = {};
    for (const cat of Object.keys(categoryScores)) {
      profile[cat] = Math.round(categoryScores[cat] / categoryTotals[cat]);
    }

    const avgScore = Object.values(categoryScores).reduce((a, b) => a + b, 0) / 
                     Object.values(categoryTotals).reduce((a, b) => a + b, 0);
    
    let personalityType = 'Balanced';
    if (avgScore <= 2) personalityType = 'Adventurer';
    else if (avgScore <= 2.5) personalityType = 'Social Butterfly';
    else if (avgScore <= 3.5) personalityType = 'Balanced';
    else if (avgScore <= 4) personalityType = 'Homebody';
    else personalityType = 'Independent';

    res.json({
      success: true,
      message: 'Quiz submitted successfully',
      completedAt: userResponse.completedAt,
      totalQuestions: userResponse.totalQuestions,
      profile,
      personalityType,
      categoryBreakdown: Object.keys(categoryScores).map(cat => ({
        category: cat,
        score: profile[cat],
        label: getCategoryLabel(cat, profile[cat])
      }))
    });
  } catch (error) {
    logger.error('Submit quiz error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit quiz' });
  }
});

function getCategoryLabel(category, score) {
  const labels = {
    lifestyle: ['Very Active', 'Active', 'Moderate', 'Relaxed', 'Very Relaxed'],
    values: ['Very Traditional', 'Traditional', 'Balanced', 'Progressive', 'Very Progressive'],
    personality: ['Very Extroverted', 'Extroverted', 'Ambivert', 'Introverted', 'Very Introverted'],
    relationship: ['Very Affectionate', 'Affectionate', 'Balanced', 'Independent', 'Very Independent'],
    future: ['Very Ambitious', 'Ambitious', 'Flexible', 'Content', 'Very Content']
  };
  const catLabels = labels[category] || ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
  return catLabels[Math.min(Math.max(0, score - 1), 4)];
}

router.get('/compatibility/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;

    const Match = require('../models/Match');
    const match = await Match.findOne({
      users: { $all: [req.user._id, userId] },
      status: 'active'
    });
    if (!match) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const [myResponses, theirResponses] = await Promise.all([
      UserQuizResponse.findOne({ userId: req.user._id }),
      UserQuizResponse.findOne({ userId })
    ]);

    if (!myResponses || !myResponses.completedAt) {
      return res.status(400).json({ 
        success: false, 
        message: 'You need to complete the quiz first',
        needsQuiz: true
      });
    }

    if (!theirResponses || !theirResponses.completedAt) {
      return res.json({ 
        success: true, 
        compatibility: null,
        message: 'This user has not completed the quiz yet'
      });
    }

    const myResponseMap = new Map();
    myResponses.responses.forEach(r => {
      myResponseMap.set(r.questionId.toString(), r.selectedOption.value);
    });

    let totalWeight = 0;
    let matchScore = 0;
    const questionWeights = new Map();
    
    const questionIds = theirResponses.responses.map(r => r.questionId);
    const questions = await QuizQuestion.find({ _id: { $in: questionIds } });
    questions.forEach(q => questionWeights.set(q._id.toString(), q.weight));

    for (const theirResponse of theirResponses.responses) {
      const qId = theirResponse.questionId.toString();
      const myValue = myResponseMap.get(qId);
      
      if (myValue !== undefined) {
        const weight = questionWeights.get(qId) || 1;
        totalWeight += weight;
        
        const theirValue = theirResponse.selectedOption.value;
        const diff = Math.abs(myValue - theirValue);
        const maxDiff = 4; // Values range 1-5, max diff is 4
        const similarity = ((maxDiff - diff) / maxDiff) * weight;
        matchScore += similarity;
      }
    }

    const compatibilityPercent = totalWeight > 0 
      ? Math.round((matchScore / totalWeight) * 100)
      : 0;

    const categoryScores = {};
    const categoryTotals = {};
    
    for (const q of questions) {
      const qId = q._id.toString();
      const myValue = myResponseMap.get(qId);
      const theirResponse = theirResponses.responses.find(
        r => r.questionId.toString() === qId
      );
      
      if (myValue !== undefined && theirResponse) {
        if (!categoryScores[q.category]) {
          categoryScores[q.category] = 0;
          categoryTotals[q.category] = 0;
        }
        
        const diff = Math.abs(myValue - theirResponse.selectedOption.value);
        const similarity = (4 - diff) / 4;
        categoryScores[q.category] += similarity;
        categoryTotals[q.category] += 1;
      }
    }

    const categoryBreakdown = {};
    for (const cat of Object.keys(categoryScores)) {
      categoryBreakdown[cat] = Math.round(
        (categoryScores[cat] / categoryTotals[cat]) * 100
      );
    }

    res.json({
      success: true,
      compatibility: compatibilityPercent,
      categoryBreakdown,
      questionsCompared: myResponseMap.size
    });
  } catch (error) {
    logger.error('Calculate compatibility error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate compatibility' });
  }
});

router.post('/seed', protect, async (req, res) => {
  try {
    const existingCount = await QuizQuestion.countDocuments();
    if (existingCount > 0) {
      return res.json({ 
        success: true, 
        message: 'Questions already exist',
        count: existingCount
      });
    }

    const defaultQuestions = [
      {
        question: "How do you prefer to spend your weekends?",
        category: "lifestyle",
        options: [
          { text: "Adventuring outdoors", value: 1 },
          { text: "Socializing with friends", value: 2 },
          { text: "Mix of both", value: 3 },
          { text: "Relaxing at home", value: 4 },
          { text: "Working on hobbies/projects", value: 5 }
        ],
        weight: 2
      },
      {
        question: "How important is physical fitness to you?",
        category: "lifestyle",
        options: [
          { text: "Very important - daily exercise", value: 1 },
          { text: "Important - regular exercise", value: 2 },
          { text: "Moderate - occasional exercise", value: 3 },
          { text: "Not very important", value: 4 },
          { text: "Not a priority", value: 5 }
        ],
        weight: 1
      },
      {
        question: "What's your ideal living environment?",
        category: "lifestyle",
        options: [
          { text: "Busy city center", value: 1 },
          { text: "Urban neighborhood", value: 2 },
          { text: "Suburbs", value: 3 },
          { text: "Small town", value: 4 },
          { text: "Rural/countryside", value: 5 }
        ],
        weight: 2
      },
      {
        question: "How important is religion/spirituality in your life?",
        category: "values",
        options: [
          { text: "Extremely important", value: 1 },
          { text: "Very important", value: 2 },
          { text: "Somewhat important", value: 3 },
          { text: "Not very important", value: 4 },
          { text: "Not important at all", value: 5 }
        ],
        weight: 3
      },
      {
        question: "How do you approach finances in a relationship?",
        category: "values",
        options: [
          { text: "Everything shared equally", value: 1 },
          { text: "Mostly shared with some separate", value: 2 },
          { text: "Split based on income", value: 3 },
          { text: "Mostly separate with some shared", value: 4 },
          { text: "Completely separate", value: 5 }
        ],
        weight: 2
      },
      {
        question: "What role does family play in your life decisions?",
        category: "values",
        options: [
          { text: "Central - family always comes first", value: 1 },
          { text: "Very important - major input", value: 2 },
          { text: "Important - balanced consideration", value: 3 },
          { text: "Somewhat - my decision mainly", value: 4 },
          { text: "Minimal - fully independent", value: 5 }
        ],
        weight: 2
      },
      {
        question: "In social situations, you typically:",
        category: "personality",
        options: [
          { text: "Lead conversations and energize others", value: 1 },
          { text: "Actively participate and engage", value: 2 },
          { text: "Adapt to the situation", value: 3 },
          { text: "Prefer small group conversations", value: 4 },
          { text: "Observe and listen mostly", value: 5 }
        ],
        weight: 1
      },
      {
        question: "How do you handle disagreements?",
        category: "personality",
        options: [
          { text: "Address immediately and directly", value: 1 },
          { text: "Discuss calmly when ready", value: 2 },
          { text: "Seek compromise quickly", value: 3 },
          { text: "Take time to process first", value: 4 },
          { text: "Avoid confrontation if possible", value: 5 }
        ],
        weight: 2
      },
      {
        question: "How do you express affection?",
        category: "personality",
        options: [
          { text: "Physical touch and closeness", value: 1 },
          { text: "Words of affirmation", value: 2 },
          { text: "Acts of service", value: 3 },
          { text: "Quality time together", value: 4 },
          { text: "Giving gifts and surprises", value: 5 }
        ],
        weight: 2
      },
      {
        question: "How much personal space do you need in a relationship?",
        category: "relationship",
        options: [
          { text: "Very little - together most of the time", value: 1 },
          { text: "Some - mostly together", value: 2 },
          { text: "Balanced - equal time together and apart", value: 3 },
          { text: "Quite a bit - regular alone time", value: 4 },
          { text: "A lot - independence is essential", value: 5 }
        ],
        weight: 2
      },
      {
        question: "What's your communication style in relationships?",
        category: "relationship",
        options: [
          { text: "Constant contact throughout the day", value: 1 },
          { text: "Frequent check-ins", value: 2 },
          { text: "Regular but not constant", value: 3 },
          { text: "When there's something to share", value: 4 },
          { text: "Minimal daily communication is fine", value: 5 }
        ],
        weight: 2
      },
      {
        question: "How do you feel about meeting each other's friends/family?",
        category: "relationship",
        options: [
          { text: "Essential early on", value: 1 },
          { text: "Important within first few months", value: 2 },
          { text: "When it feels natural", value: 3 },
          { text: "After relationship is established", value: 4 },
          { text: "Prefer to keep things separate longer", value: 5 }
        ],
        weight: 1
      },
      {
        question: "Do you want children?",
        category: "future",
        options: [
          { text: "Definitely yes", value: 1 },
          { text: "Probably yes", value: 2 },
          { text: "Open to it / unsure", value: 3 },
          { text: "Probably not", value: 4 },
          { text: "Definitely not", value: 5 }
        ],
        weight: 3
      },
      {
        question: "Where do you see yourself in 5 years?",
        category: "future",
        options: [
          { text: "Settled with family", value: 1 },
          { text: "Building a stable career and home", value: 2 },
          { text: "Growing and exploring opportunities", value: 3 },
          { text: "Focused on personal development", value: 4 },
          { text: "Traveling and experiencing the world", value: 5 }
        ],
        weight: 2
      },
      {
        question: "How important is career ambition in a partner?",
        category: "future",
        options: [
          { text: "Essential - driven career focus", value: 1 },
          { text: "Important - career-oriented", value: 2 },
          { text: "Balanced - work-life harmony", value: 3 },
          { text: "Less important - other priorities", value: 4 },
          { text: "Not important - flexible approach", value: 5 }
        ],
        weight: 1
      }
    ];

    await QuizQuestion.insertMany(defaultQuestions);

    res.json({
      success: true,
      message: 'Quiz questions seeded successfully',
      count: defaultQuestions.length
    });
  } catch (error) {
    logger.error('Seed quiz error:', error);
    res.status(500).json({ success: false, message: 'Failed to seed questions' });
  }
});

module.exports = router;
