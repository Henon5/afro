const { validate } = require('../middleware/validate');

describe('validate middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  describe('joinRoom validation', () => {
    const validator = validate('joinRoom');

    test('should pass with valid roomAmount (20)', () => {
      req.body = { roomAmount: 20 };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should pass with valid roomAmount (50)', () => {
      req.body = { roomAmount: 50 };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should pass with valid roomAmount (100)', () => {
      req.body = { roomAmount: 100 };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should fail with invalid roomAmount', () => {
      req.body = { roomAmount: 30 };
      validator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('should fail with missing roomAmount', () => {
      req.body = {};
      validator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('deposit validation', () => {
    const validator = validate('deposit');

    test('should pass with valid amount (minimum 20)', () => {
      req.body = { amount: 20 };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should pass with valid amount and optional paymentMethod', () => {
      req.body = { amount: 100, paymentMethod: 'card' };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.body.paymentMethod).toBe('card');
    });

    test('should fail with amount below minimum', () => {
      req.body = { amount: 19 };
      validator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
    });

    test('should fail with missing amount', () => {
      req.body = {};
      validator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('withdrawal validation', () => {
    const validator = validate('withdrawal');

    test('should pass with valid amount and phone', () => {
      req.body = { amount: 100, phone: '+1234567890' };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should pass with minimum amount (10)', () => {
      req.body = { amount: 10, phone: '+1234567890' };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should pass with maximum amount (5000)', () => {
      req.body = { amount: 5000, phone: '+1234567890' };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should fail with amount below minimum', () => {
      req.body = { amount: 9, phone: '+1234567890' };
      validator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should fail with amount above maximum', () => {
      req.body = { amount: 5001, phone: '+1234567890' };
      validator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should fail with missing phone', () => {
      req.body = { amount: 100 };
      validator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('updateProfile validation', () => {
    const validator = validate('updateProfile');

    test('should pass with valid name', () => {
      req.body = { name: 'John Doe' };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.body.name).toBe('John Doe');
    });

    test('should pass with valid phone', () => {
      req.body = { phone: '+1234567890' };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should pass with valid telegramHandle', () => {
      req.body = { telegramHandle: '@john' };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should pass with multiple fields', () => {
      req.body = { name: 'John', phone: '+1234567890', telegramHandle: '@john' };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should pass with empty body (all fields optional)', () => {
      req.body = {};
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('adminApproveTransaction validation', () => {
    const validator = validate('adminApproveTransaction');

    test('should pass with approve action', () => {
      req.body = { transactionId: 'tx123', action: 'approve' };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should pass with reject action and reason', () => {
      req.body = { transactionId: 'tx123', action: 'reject', reason: 'Invalid details' };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should fail with reject action but no reason', () => {
      req.body = { transactionId: 'tx123', action: 'reject' };
      validator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should fail with invalid action', () => {
      req.body = { transactionId: 'tx123', action: 'pending' };
      validator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should fail with missing transactionId', () => {
      req.body = { action: 'approve' };
      validator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('adminAddFunds validation', () => {
    const validator = validate('adminAddFunds');

    test('should pass with valid userPhone and amount', () => {
      req.body = { userPhone: '+1234567890', amount: 100 };
      validator(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should fail with negative amount', () => {
      req.body = { userPhone: '+1234567890', amount: -50 };
      validator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should fail with missing userPhone', () => {
      req.body = { amount: 100 };
      validator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should fail with missing amount', () => {
      req.body = { userPhone: '+1234567890' };
      validator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
