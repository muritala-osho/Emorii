const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');

const profileFields = [
  { field: 'name', label: 'Name', weight: 10, required: true },
  { field: 'bio', label: 'About Me', weight: 15, required: false },
  { field: 'photos', label: 'Photos', weight: 20, required: true, minCount: 1, recommendedCount: 3 },
  { field: 'interests', label: 'Interests', weight: 10, required: false, minCount: 3 },
  { field: 'jobTitle', label: 'Job Title', weight: 5, required: false },
  { field: 'education', label: 'Education', weight: 5, required: false },
  { field: 'livingIn', label: 'Location', weight: 5, required: false },
  { field: 'zodiacSign', label: 'Zodiac Sign', weight: 3, required: false },
  { field: 'lookingFor', label: 'Looking For', weight: 7, required: false },
  { field: 'lifestyle.smoking', label: 'Smoking Preference', weight: 3, required: false },
  { field: 'lifestyle.drinking', label: 'Drinking Preference', weight: 3, required: false },
  { field: 'lifestyle.hasKids', label: 'Has Kids', weight: 2, required: false },
  { field: 'lifestyle.wantsKids', label: 'Wants Kids', weight: 2, required: false },
  { field: 'favoriteSong.title', label: 'Favorite Song', weight: 5, required: false },
  { field: 'verified', label: 'Profile Verification', weight: 5, required: false, isBoolean: true }
];

const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => current?.[key], obj);
};

const isFieldComplete = (user, fieldConfig) => {
  const value = getNestedValue(user, fieldConfig.field);
  
  if (fieldConfig.isBoolean) {
    return value === true;
  }
  
  if (Array.isArray(value)) {
    const minCount = fieldConfig.minCount || 1;
    return value.length >= minCount;
  }
  
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  
  return value !== null && value !== undefined;
};

router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let totalWeight = 0;
    let completedWeight = 0;
    const missingFields = [];
    const completedFields = [];
    const suggestions = [];

    for (const fieldConfig of profileFields) {
      totalWeight += fieldConfig.weight;
      const complete = isFieldComplete(user, fieldConfig);
      
      if (complete) {
        completedWeight += fieldConfig.weight;
        completedFields.push({
          field: fieldConfig.field,
          label: fieldConfig.label
        });
      } else {
        missingFields.push({
          field: fieldConfig.field,
          label: fieldConfig.label,
          weight: fieldConfig.weight,
          required: fieldConfig.required
        });
      }
    }

    const completionPercentage = Math.round((completedWeight / totalWeight) * 100);

    if (missingFields.length > 0) {
      const sortedMissing = [...missingFields].sort((a, b) => b.weight - a.weight);
      
      for (const field of sortedMissing.slice(0, 3)) {
        let suggestion = '';
        switch (field.field) {
          case 'bio':
            suggestion = 'Tell others about yourself! A good bio increases matches by 40%.';
            break;
          case 'photos':
            suggestion = 'Add more photos to get 3x more matches!';
            break;
          case 'interests':
            suggestion = 'Add your interests to find people with similar hobbies.';
            break;
          case 'jobTitle':
            suggestion = 'Share what you do for work.';
            break;
          case 'education':
            suggestion = 'Add your education background.';
            break;
          case 'livingIn':
            suggestion = 'Let others know where you live.';
            break;
          case 'verified':
            suggestion = 'Get verified to build trust and get more matches!';
            break;
          case 'favoriteSong.title':
            suggestion = 'Share your favorite song to connect over music!';
            break;
          case 'lookingFor':
            suggestion = 'Tell others what type of connection you\'re seeking.';
            break;
          default:
            suggestion = `Complete your ${field.label.toLowerCase()} to improve your profile.`;
        }
        
        suggestions.push({
          field: field.field,
          label: field.label,
          message: suggestion,
          priority: field.weight
        });
      }
    }

    let tier = 'beginner';
    if (completionPercentage >= 90) {
      tier = 'superstar';
    } else if (completionPercentage >= 70) {
      tier = 'standout';
    } else if (completionPercentage >= 50) {
      tier = 'rising';
    }

    const tierBenefits = {
      beginner: 'Complete your profile to get more visibility!',
      rising: 'You\'re making progress! Keep going for better matches.',
      standout: 'Great profile! A few more details will make you shine.',
      superstar: 'Amazing profile! You\'re getting maximum visibility.'
    };

    res.json({
      success: true,
      data: {
        completionPercentage,
        tier,
        tierMessage: tierBenefits[tier],
        totalFields: profileFields.length,
        completedCount: completedFields.length,
        missingCount: missingFields.length,
        missingFields,
        completedFields,
        suggestions,
        nextMilestone: completionPercentage < 50 ? 50 : 
                       completionPercentage < 70 ? 70 :
                       completionPercentage < 90 ? 90 : 100,
        pointsToNextMilestone: completionPercentage < 50 ? 50 - completionPercentage :
                               completionPercentage < 70 ? 70 - completionPercentage :
                               completionPercentage < 90 ? 90 - completionPercentage : 0
      }
    });
  } catch (error) {
    logger.error('Profile completion status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/prompts', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const prompts = [];

    if (!user.bio || user.bio.trim().length < 50) {
      prompts.push({
        id: 'bio',
        type: 'text',
        title: 'Write Your Bio',
        subtitle: 'Tell others what makes you unique',
        placeholder: 'I\'m passionate about...',
        tips: [
          'Mention your hobbies and interests',
          'Share what you\'re looking for',
          'Add a fun fact about yourself'
        ],
        priority: 1
      });
    }

    if (!user.photos || user.photos.length < 3) {
      const currentCount = user.photos?.length || 0;
      prompts.push({
        id: 'photos',
        type: 'photo',
        title: `Add ${3 - currentCount} More Photo${3 - currentCount > 1 ? 's' : ''}`,
        subtitle: 'Profiles with 3+ photos get 3x more matches',
        tips: [
          'Use a clear face photo as your first',
          'Include full body and activity shots',
          'Smile! It makes you more approachable'
        ],
        priority: 2
      });
    }

    if (!user.interests || user.interests.length < 3) {
      prompts.push({
        id: 'interests',
        type: 'interests',
        title: 'Add Your Interests',
        subtitle: 'Help us find people with similar passions',
        suggestedInterests: [
          'Travel', 'Music', 'Fitness', 'Cooking', 'Reading',
          'Movies', 'Photography', 'Art', 'Gaming', 'Dancing',
          'Hiking', 'Yoga', 'Coffee', 'Wine', 'Fashion'
        ],
        priority: 3
      });
    }

    if (!user.verified && user.verificationStatus !== 'pending') {
      prompts.push({
        id: 'verification',
        type: 'verification',
        title: 'Get Verified',
        subtitle: 'Verified profiles get 30% more matches',
        description: 'Take a quick selfie to verify your identity',
        priority: 4
      });
    }

    if (!user.jobTitle) {
      prompts.push({
        id: 'jobTitle',
        type: 'text',
        title: 'What Do You Do?',
        subtitle: 'Share your profession',
        placeholder: 'Software Engineer at...',
        priority: 5
      });
    }

    if (!user.favoriteSong?.title) {
      prompts.push({
        id: 'favoriteSong',
        type: 'song',
        title: 'What\'s Your Anthem?',
        subtitle: 'Share the song that defines you',
        priority: 6
      });
    }

    if (!user.lookingFor) {
      prompts.push({
        id: 'lookingFor',
        type: 'select',
        title: 'What Are You Looking For?',
        subtitle: 'Help us match you with the right people',
        options: [
          { value: 'relationship', label: 'A Relationship' },
          { value: 'friendship', label: 'New Friends' },
          { value: 'casual', label: 'Something Casual' },
          { value: 'networking', label: 'Networking' }
        ],
        priority: 7
      });
    }

    prompts.sort((a, b) => a.priority - b.priority);

    res.json({
      success: true,
      data: {
        prompts: prompts.slice(0, 5),
        totalIncomplete: prompts.length
      }
    });
  } catch (error) {
    logger.error('Profile prompts error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
