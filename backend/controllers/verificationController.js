const logger = require('../utils/logger');
const verificationService = require('../services/verificationService');

const revokeVerification = async (req, res) => {
  try {
    const { reason } = req.body;
    await verificationService.revokeVerification({
      userId: req.params.userId,
      reason,
      adminId: req.user._id,
    });

    res.json({
      success: true,
      message: 'Verification revoked successfully',
    });
  } catch (error) {
    logger.error('Revoke verification error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

module.exports = {
  revokeVerification,
};