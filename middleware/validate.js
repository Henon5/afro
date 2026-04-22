/**
 * Validation Middleware
 * Provides request validation using Joi schemas
 * @module middleware/validate
 */

const Joi = require('joi');

/**
 * Validation schemas for different endpoints
 */
const schemas = {
  joinRoom: Joi.object({
    roomAmount: Joi.number().valid(20, 50, 100).required()
      .messages({
        'any.required': 'roomAmount is required',
        'any.only': 'roomAmount must be 20, 50, or 100'
      })
  }),
  
  deposit: Joi.object({
    amount: Joi.number().min(20).required()
      .messages({
        'any.required': 'amount is required',
        'number.min': 'amount must be at least 20'
      }),
    paymentMethod: Joi.string().optional()
  }),
  
  withdrawal: Joi.object({
    amount: Joi.number().min(10).max(5000).required()
      .messages({
        'any.required': 'amount is required',
        'number.min': 'amount must be at least 10',
        'number.max': 'amount cannot exceed 5000'
      }),
    phone: Joi.string().required()
      .messages({
        'any.required': 'phone number is required'
      })
  }),
  
  updateProfile: Joi.object({
    name: Joi.string().optional(),
    phone: Joi.string().optional(),
    telegramHandle: Joi.string().optional()
  }),
  
  adminApproveTransaction: Joi.object({
    transactionId: Joi.string().required()
      .messages({
        'any.required': 'transactionId is required'
      }),
    action: Joi.string().valid('approve', 'reject').required()
      .messages({
        'any.required': 'action is required',
        'any.only': 'action must be approve or reject'
      }),
    reason: Joi.string().when('action', {
      is: 'reject',
      then: Joi.required().messages({ 'any.required': 'reason is required when rejecting' })
    })
  }),
  
  adminAddFunds: Joi.object({
    userPhone: Joi.string().required()
      .messages({
        'any.required': 'userPhone is required'
      }),
    amount: Joi.number().positive().required()
      .messages({
        'any.required': 'amount is required',
        'number.positive': 'amount must be positive'
      })
  })
};

/**
 * Validation middleware factory
 * @param {string} schemaName - Name of the schema to use
 * @returns {Function} Express middleware function
 */
exports.validate = (schemaName) => {
  return (req, res, next) => {
    const { error, value } = schemas[schemaName].validate(req.body, { 
      abortEarly: false, 
      stripUnknown: true 
    });
    
    if (error) {
      const errorMessages = error.details.map(detail => detail.message).join(', ');
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errorMessages 
      });
    }
    
    req.body = value;
    next();
  };
};
