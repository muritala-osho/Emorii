const Joi = require('joi');

/**
 * Returns an Express middleware that validates req.body against a Joi schema.
 * On failure it responds with 400 and the first human-readable error message.
 * On success it strips unknown keys and calls next().
 */
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: true,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message.replace(/['"]/g, ''),
    });
  }

  req.body = value;
  next();
};

module.exports = validate;
