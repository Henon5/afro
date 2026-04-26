const Joi = require('joi');

const schemas = {
  joinRoom: Joi.object({ roomAmount: Joi.number().valid(20, 50, 100).required() }),
  deposit: Joi.object({ amount: Joi.number().min(20).required(), paymentMethod: Joi.string().optional() }),
  withdrawal: Joi.object({ amount: Joi.number().min(10).max(5000).required(), phone: Joi.string().required() }),
  updateProfile: Joi.object({ 
    name: Joi.string().min(1).allow(null, '').optional(), 
    username: Joi.string().min(3).allow(null, '').optional(),
    phone: Joi.string().allow(null, '').optional(), 
    telegramHandle: Joi.string().allow(null, '').optional() 
  }),
  adminApproveTransaction: Joi.object({ transactionId: Joi.string().required(), action: Joi.string().valid('approve', 'reject').required(), reason: Joi.string().when('action', { is: 'reject', then: Joi.required() }) }),
  adminAddFunds: Joi.object({ userPhone: Joi.string().required(), amount: Joi.number().positive().required() })
};

exports.validate = (schemaName) => {
  return (req, res, next) => {
    const { error, value } = schemas[schemaName].validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ error: 'Validation failed', details: error.details.map(d => d.message).join(', ') });
    req.body = value;
    next();
  };
};
