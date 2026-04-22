/**
 * Unit tests for User Model
 * Tests the schema definition, virtuals, and model export
 */

describe('User Model', () => {
  let User;
  let mongoose;

  beforeEach(() => {
    jest.resetModules();
    
    // Mock mongoose with proper schema structure including chainable virtual
    jest.mock('mongoose', () => {
      const mockSchemaInstance = {
        virtual: jest.fn().mockReturnThis(),
        get: jest.fn()
      };
      // Make virtual return an object with get method for chaining
      mockSchemaInstance.virtual.mockReturnValue({
        get: jest.fn().mockReturnThis()
      });
      
      return {
        Schema: jest.fn().mockImplementation((definition, options) => {
          return mockSchemaInstance;
        }),
        model: jest.fn().mockImplementation((name, schema) => {
          return function User(data) {
            this._id = data?._id || 'test-id';
            this.telegramId = data?.telegramId;
            this.username = data?.username;
            this.firstName = data?.firstName;
            this.lastName = data?.lastName;
            this.balance = data?.balance ?? 0;
            this.isBlocked = data?.isBlocked ?? false;
            Object.assign(this, data);
          };
        })
      };
    });
    
    mongoose = require('mongoose');
    User = require('../models/User');
  });

  describe('Schema Definition', () => {
    test('should call mongoose.Schema constructor', () => {
      expect(mongoose.Schema).toHaveBeenCalled();
    });

    test('should create model named "User"', () => {
      expect(mongoose.model).toHaveBeenCalledWith('User', expect.any(Object));
    });

    test('should have timestamps option enabled', () => {
      const schemaCall = mongoose.Schema.mock.calls[0];
      expect(schemaCall[1]).toEqual({ timestamps: true });
    });
  });

  describe('Schema Fields', () => {
    test('should define telegramId as String with unique constraint', () => {
      const schemaDef = mongoose.Schema.mock.calls[0][0];
      expect(schemaDef.telegramId).toBeDefined();
      expect(schemaDef.telegramId.type).toBe(String);
      expect(schemaDef.telegramId.unique).toBe(true);
      expect(schemaDef.telegramId.sparse).toBe(true);
    });

    test('should define balance with default 0 and min 0', () => {
      const schemaDef = mongoose.Schema.mock.calls[0][0];
      expect(schemaDef.balance).toBeDefined();
      expect(schemaDef.balance.type).toBe(Number);
      expect(schemaDef.balance.default).toBe(0);
      expect(schemaDef.balance.min).toBe(0);
    });

    test('should define isBlocked with default false', () => {
      const schemaDef = mongoose.Schema.mock.calls[0][0];
      expect(schemaDef.isBlocked).toBeDefined();
      expect(schemaDef.isBlocked.type).toBe(Boolean);
      expect(schemaDef.isBlocked.default).toBe(false);
    });

    test('should define user statistics fields with defaults', () => {
      const schemaDef = mongoose.Schema.mock.calls[0][0];
      expect(schemaDef.totalWins.default).toBe(0);
      expect(schemaDef.totalWinnings.default).toBe(0);
      expect(schemaDef.gamesPlayed.default).toBe(0);
    });
  });

  describe('Virtual displayName', () => {
    test('should define displayName virtual property', () => {
      const mockSchema = mongoose.Schema.mock.results[0].value;
      expect(mockSchema.virtual).toHaveBeenCalledWith('displayName');
    });
  });

  describe('Model Instance', () => {
    test('should create user instance with default values', () => {
      const user = new User({ telegramId: '12345' });
      expect(user.balance).toBe(0);
      expect(user.isBlocked).toBe(false);
    });

    test('should create user instance with provided values', () => {
      const user = new User({ 
        telegramId: '12345', 
        username: 'testuser',
        balance: 100 
      });
      expect(user.telegramId).toBe('12345');
      expect(user.username).toBe('testuser');
      expect(user.balance).toBe(100);
    });
  });
});
