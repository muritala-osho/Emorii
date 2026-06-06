/**
 * Support access middleware
 * Provides role-based guards for the centralized support system.
 * These sit on top of the existing `protect` middleware (JWT auth).
 */

const isAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

const isAgent = (req, res, next) => {
  if (!req.user || !req.user.isSupportAgent) {
    return res.status(403).json({ success: false, message: 'Support agent access required' });
  }
  next();
};

const isAdminOrAgent = (req, res, next) => {
  if (!req.user || (!req.user.isAdmin && !req.user.isSupportAgent)) {
    return res.status(403).json({ success: false, message: 'Staff access required' });
  }
  next();
};

module.exports = { isAdmin, isAgent, isAdminOrAgent };
