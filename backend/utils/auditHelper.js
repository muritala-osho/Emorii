const logger = require('../utils/logger');
const AuditLog = require('../models/AuditLog');

const logAudit = async ({
  action,
  category,
  severity = 'medium',
  adminId,
  adminName,
  adminEmail,
  targetUserId,
  targetUserName,
  targetUserEmail,
  details,
  metadata,
  ipAddress,
}) => {
  try {
    await AuditLog.create({
      action,
      category,
      severity,
      adminId,
      adminName,
      adminEmail,
      targetUserId,
      targetUserName,
      targetUserEmail,
      details,
      metadata,
      ipAddress,
    });
  } catch (err) {
    logger.error('[AuditHelper] Failed to write audit log:', err.message);
  }
};

module.exports = { logAudit };
