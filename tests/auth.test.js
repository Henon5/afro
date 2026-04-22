const { auth, adminOnly, userOnly } = require('../middleware/auth');

// Mock User model at the top level before any requires
jest.mock('../models/User', () => ({
  findOneAndUpdate: jest.fn()
}));

describe('auth middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    
    // Clear environment variables before each test
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.ADMIN_MASTER_ID;
    delete process.env.ADMIN_SECURE_CODE;
    delete process.env.ADMIN_SECURITY_KEY;
    delete process.env.JWT_SECRET;
    
    jest.clearAllMocks();
  });

  describe('Telegram WebApp authentication', () => {
    test('should skip verification when TELEGRAM_BOT_TOKEN is not set', async () => {
      const User = require('../models/User');
      User.findOneAndUpdate.mockResolvedValue({ 
        _id: 'user123', 
        telegramId: '123', 
        firstName: 'Test',
        isBlocked: false 
      });
      
      req.headers['x-telegram-init-data'] = 'user=%7B%22id%22%3A123%7D&hash=test';
      
      await auth(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });

    test('should reject invalid Telegram initData', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test_token';
      req.headers['x-telegram-init-data'] = 'invalid_data';
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Telegram data' });
    });

    test('should upsert user on valid Telegram auth', async () => {
      const User = require('../models/User');
      const mockUser = { 
        _id: 'user123', 
        telegramId: '123', 
        firstName: 'Test',
        isBlocked: false 
      };
      
      User.findOneAndUpdate.mockResolvedValue(mockUser);
      
      req.headers['x-telegram-init-data'] = 'user=%7B%22id%22%3A123%2C%22first_name%22%3A%22Test%22%7D&hash=abc123def456';
      
      await auth(req, res, next);
      
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Admin authentication via credentials', () => {
    test('should authenticate admin with valid credentials', async () => {
      process.env.ADMIN_MASTER_ID = 'master123';
      process.env.ADMIN_SECURE_CODE = 'code456';
      process.env.ADMIN_SECURITY_KEY = 'key789';
      
      req.headers['x-admin-auth'] = JSON.stringify({
        masterId: 'master123',
        secureCode: 'code456',
        securityKey: 'key789'
      });
      
      await auth(req, res, next);
      
      expect(req.user).toEqual({
        _id: 'admin',
        isAdmin: true,
        displayName: 'MasterAdmin',
        role: 'admin'
      });
      expect(next).toHaveBeenCalled();
    });

    test('should reject invalid admin credentials', async () => {
      process.env.ADMIN_MASTER_ID = 'master123';
      req.headers['x-admin-auth'] = JSON.stringify({
        masterId: 'wrong_id',
        secureCode: 'code456',
        securityKey: 'key789'
      });
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid admin credentials' });
    });

    test('should handle malformed admin auth header', async () => {
      req.headers['x-admin-auth'] = 'invalid_json';
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid admin auth format' });
    });
  });

  describe('Admin authentication via token', () => {
    test('should authenticate with valid JWT admin token', async () => {
      process.env.JWT_SECRET = 'test_secret';
      const jwt = require('jsonwebtoken');
      const validToken = jwt.sign({ id: 'admin', isAdmin: true }, process.env.JWT_SECRET);
      
      req.headers['x-admin-token'] = validToken;
      
      await auth(req, res, next);
      
      expect(req.user).toEqual({
        _id: 'admin',
        isAdmin: true,
        displayName: 'MasterAdmin',
        role: 'admin'
      });
      expect(next).toHaveBeenCalled();
    });

    test('should authenticate with Bearer token format', async () => {
      process.env.JWT_SECRET = 'test_secret';
      const jwt = require('jsonwebtoken');
      const validToken = jwt.sign({ id: 'admin', isAdmin: true }, process.env.JWT_SECRET);
      
      req.headers['authorization'] = `Bearer ${validToken}`;
      
      await auth(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });

    test('should reject invalid JWT token', async () => {
      req.headers['x-admin-token'] = 'invalid_token_xyz';
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or malformed admin token' });
    });

    test('should reject token with insufficient length', async () => {
      req.headers['x-admin-token'] = 'short';
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token format' });
    });

    test('should reject non-admin JWT token', async () => {
      process.env.JWT_SECRET = 'test_secret';
      const jwt = require('jsonwebtoken');
      const userToken = jwt.sign({ id: 'user123', isAdmin: false }, process.env.JWT_SECRET);
      
      req.headers['x-admin-token'] = userToken;
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid admin token' });
    });
  });

  describe('No authentication', () => {
    test('should reject request with no authentication', async () => {
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });
  });

  describe('Blocked user handling', () => {
    test('should reject blocked non-admin user', async () => {
      const User = require('../models/User');
      const mockBlockedUser = {
        _id: 'user123',
        telegramId: '123',
        isBlocked: true,
        isAdmin: false
      };
      
      User.findOneAndUpdate.mockResolvedValue(mockBlockedUser);
      
      req.headers['x-telegram-init-data'] = 'user=%7B%22id%22%3A123%7D';
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Account is blocked' });
    });
  });
});

describe('adminOnly middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  test('should allow admin user', () => {
    req.user = { _id: 'admin', isAdmin: true };
    
    adminOnly(req, res, next);
    
    expect(next).toHaveBeenCalled();
  });

  test('should reject non-admin user', () => {
    req.user = { _id: 'user123', isAdmin: false };
    
    adminOnly(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
  });

  test('should reject unauthenticated request', () => {
    req.user = null;
    
    adminOnly(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
  });
});

describe('userOnly middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  test('should allow regular user', () => {
    req.user = { _id: 'user123', isAdmin: false };
    
    userOnly(req, res, next);
    
    expect(next).toHaveBeenCalled();
  });

  test('should reject admin user', () => {
    req.user = { _id: 'admin', isAdmin: true };
    
    userOnly(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Player access required' });
  });

  test('should reject unauthenticated request', () => {
    req.user = null;
    
    userOnly(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Player access required' });
  });
});
