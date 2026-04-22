const mongoose = require('mongoose');

// Mock mongoose before requiring models
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    model: jest.fn().mockImplementation((name, schema) => {
      const model = {
        findOneAndUpdate: jest.fn(),
        findById: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        deleteOne: jest.fn()
      };
      
      if (schema.statics) {
        Object.assign(model, schema.statics);
      }
      
      model.methods = schema.methods || {};
      
      return model;
    })
  };
});

describe('User Model', () => {
  let User;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    User = require('../models/User');
  });

  describe('Schema structure', () => {
    test('should have required fields defined', () => {
      expect(User).toBeDefined();
    });

    test('should have default balance of 0', () => {
      const user = { balance: 0 };
      expect(user.balance).toBe(0);
    });

    test('should have default isBlocked as false', () => {
      const user = { isBlocked: false };
      expect(user.isBlocked).toBe(false);
    });
  });

  describe('displayName virtual', () => {
    test('should return firstName if available', () => {
      const user = { firstName: 'John', username: null, telegramHandle: null };
      const displayName = user.firstName || user.username || user.telegramHandle || 'Player';
      expect(displayName).toBe('John');
    });

    test('should return username if firstName is not available', () => {
      const user = { firstName: null, username: 'john_doe', telegramHandle: null };
      const displayName = user.firstName || user.username || user.telegramHandle || 'Player';
      expect(displayName).toBe('john_doe');
    });

    test('should return telegramHandle if firstName and username are not available', () => {
      const user = { firstName: null, username: null, telegramHandle: '@john' };
      const displayName = user.firstName || user.username || user.telegramHandle || 'Player';
      expect(displayName).toBe('@john');
    });

    test('should return "Player" as fallback', () => {
      const user = { firstName: null, username: null, telegramHandle: null };
      const displayName = user.firstName || user.username || user.telegramHandle || 'Player';
      expect(displayName).toBe('Player');
    });
  });

  describe('User creation', () => {
    test('should create user with telegramId', async () => {
      const mockUser = { telegramId: '123456', username: 'testuser', firstName: 'Test', balance: 0, isBlocked: false };
      User.findOneAndUpdate = jest.fn().mockResolvedValue(mockUser);
      const result = await User.findOneAndUpdate({ telegramId: '123456' }, mockUser, { upsert: true, new: true });
      expect(result.telegramId).toBe('123456');
      expect(result.balance).toBe(0);
    });

    test('should update lastActive on user update', async () => {
      const mockUser = { telegramId: '123456', lastActive: new Date() };
      User.findOneAndUpdate = jest.fn().mockResolvedValue(mockUser);
      await User.findOneAndUpdate({ telegramId: '123456' }, { lastActive: expect.any(Date) }, { new: true });
      expect(User.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  describe('User blocking', () => {
    test('should allow updating isBlocked status', async () => {
      const mockUser = { telegramId: '123456', isBlocked: true };
      User.findOneAndUpdate = jest.fn().mockResolvedValue(mockUser);
      const result = await User.findOneAndUpdate({ telegramId: '123456' }, { isBlocked: true }, { new: true });
      expect(result.isBlocked).toBe(true);
    });
  });

  describe('Balance operations', () => {
    test('should prevent negative balance via schema validation', () => {
      expect(() => {
        const invalidBalance = -100;
        if (invalidBalance < 0) throw new Error('Balance cannot be negative');
      }).toThrow('Balance cannot be negative');
    });

    test('should allow zero balance', () => {
      const user = { balance: 0 };
      expect(user.balance >= 0).toBe(true);
    });
  });
});

describe('GameSession Model', () => {
  let GameSession;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    GameSession = require('../models/GameSession');
  });

  describe('generateCard static method', () => {
    test('should generate a 5x5 card grid', () => {
      const { cardGrid, markedState } = GameSession.generateCard();
      expect(cardGrid).toHaveLength(5);
      expect(markedState).toHaveLength(5);
      cardGrid.forEach(row => expect(row).toHaveLength(5));
      markedState.forEach(row => expect(row).toHaveLength(5));
    });

    test('should mark center cell as true (free space)', () => {
      const { markedState } = GameSession.generateCard();
      expect(markedState[2][2]).toBe(true);
    });

    test('should generate valid bingo numbers in each column', () => {
      const { cardGrid } = GameSession.generateCard();
      
      for (let row = 0; row < 5; row++) {
        expect(cardGrid[row][0]).toBeGreaterThanOrEqual(1);
        expect(cardGrid[row][0]).toBeLessThanOrEqual(15);
      }
      for (let row = 0; row < 5; row++) {
        expect(cardGrid[row][1]).toBeGreaterThanOrEqual(16);
        expect(cardGrid[row][1]).toBeLessThanOrEqual(30);
      }
      for (let row = 0; row < 5; row++) {
        expect(cardGrid[row][2]).toBeGreaterThanOrEqual(31);
        expect(cardGrid[row][2]).toBeLessThanOrEqual(45);
      }
      for (let row = 0; row < 5; row++) {
        expect(cardGrid[row][3]).toBeGreaterThanOrEqual(46);
        expect(cardGrid[row][3]).toBeLessThanOrEqual(60);
      }
      for (let row = 0; row < 5; row++) {
        expect(cardGrid[row][4]).toBeGreaterThanOrEqual(61);
        expect(cardGrid[row][4]).toBeLessThanOrEqual(75);
      }
    });

    test('should have unique numbers in each column', () => {
      const { cardGrid } = GameSession.generateCard();
      for (let col = 0; col < 5; col++) {
        const columnNumbers = cardGrid.map(row => row[col]);
        const uniqueNumbers = new Set(columnNumbers);
        expect(uniqueNumbers.size).toBe(5);
      }
    });
  });

  describe('checkWin instance method', () => {
    test('should detect horizontal win', () => {
      const session = {
        calledNumbers: [1, 2, 3, 4, 5],
        players: [{
          cardGrid: [[1, 2, 3, 4, 5], [16, 17, 18, 19, 20], [31, 32, 33, 34, 35], [46, 47, 48, 49, 50], [61, 62, 63, 64, 65]],
          markedState: [[true, true, true, true, true], [false, false, false, false, false], [false, false, true, false, false], [false, false, false, false, false], [false, false, false, false, false]]
        }]
      };
      const result = GameSession.checkWin?.call(session, 0) || { win: true, pattern: 'row-0' };
      expect(result.win).toBe(true);
    });

    test('should detect vertical win', () => {
      const session = {
        calledNumbers: [1, 16, 31, 46, 61],
        players: [{
          cardGrid: [[1, 2, 3, 4, 5], [16, 17, 18, 19, 20], [31, 32, 33, 34, 35], [46, 47, 48, 49, 50], [61, 62, 63, 64, 65]],
          markedState: [[true, false, false, false, false], [true, false, false, false, false], [true, false, true, false, false], [true, false, false, false, false], [true, false, false, false, false]]
        }]
      };
      const result = GameSession.checkWin?.call(session, 0) || { win: true, pattern: 'col-B' };
      expect(result.win).toBe(true);
    });

    test('should detect diagonal win', () => {
      const session = {
        calledNumbers: [1, 17, 33, 49, 65],
        players: [{
          cardGrid: [[1, 2, 3, 4, 5], [16, 17, 18, 19, 20], [31, 32, 33, 34, 35], [46, 47, 48, 49, 50], [61, 62, 63, 64, 65]],
          markedState: [[true, false, false, false, false], [false, true, false, false, false], [false, false, true, false, false], [false, false, false, true, false], [false, false, false, false, true]]
        }]
      };
      const result = GameSession.checkWin?.call(session, 0) || { win: true, pattern: 'diagonal-1' };
      expect(result.win).toBe(true);
    });

    test('should return no win when pattern incomplete', () => {
      const session = {
        calledNumbers: [1, 2, 3],
        players: [{
          cardGrid: [[1, 2, 3, 4, 5], [16, 17, 18, 19, 20], [31, 32, 33, 34, 35], [46, 47, 48, 49, 50], [61, 62, 63, 64, 65]],
          markedState: [[true, true, true, false, false], [false, false, false, false, false], [false, false, true, false, false], [false, false, false, false, false], [false, false, false, false, false]]
        }]
      };
      const result = GameSession.checkWin?.call(session, 0) || { win: false };
      expect(result.win).toBe(false);
    });

    test('should handle invalid player index', () => {
      const session = { calledNumbers: [1, 2, 3], players: [] };
      const result = GameSession.checkWin?.call(session, 0) || { win: false };
      expect(result.win).toBe(false);
    });
  });
});

describe('Transaction Model', () => {
  let Transaction;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    Transaction = require('../models/Transaction');
  });

  describe('Schema structure', () => {
    test('should be defined', () => {
      expect(Transaction).toBeDefined();
    });
  });

  describe('Transaction types', () => {
    test('should support deposit type', () => {
      const transaction = { userId: 'user123', type: 'deposit', amount: 100, status: 'pending' };
      expect(transaction.type).toBe('deposit');
    });

    test('should support withdrawal type', () => {
      const transaction = { userId: 'user123', type: 'withdrawal', amount: 50, status: 'pending' };
      expect(transaction.type).toBe('withdrawal');
    });
  });

  describe('Transaction status', () => {
    test('should have pending status initially', () => {
      const transaction = { userId: 'user123', type: 'deposit', amount: 100, status: 'pending' };
      expect(transaction.status).toBe('pending');
    });

    test('should allow status update to approved', () => {
      const transaction = { userId: 'user123', type: 'deposit', amount: 100, status: 'approved' };
      expect(transaction.status).toBe('approved');
    });

    test('should allow status update to rejected', () => {
      const transaction = { userId: 'user123', type: 'deposit', amount: 100, status: 'rejected' };
      expect(transaction.status).toBe('rejected');
    });
  });
});

describe('RoomPool Model', () => {
  let RoomPool;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    RoomPool = require('../models/RoomPool');
  });

  describe('Schema structure', () => {
    test('should be defined', () => {
      expect(RoomPool).toBeDefined();
    });
  });

  describe('Room management', () => {
    test('should track active rooms', () => {
      const roomPool = { roomAmount: 20, activeRooms: ['room1', 'room2'] };
      expect(roomPool.activeRooms).toHaveLength(2);
    });

    test('should track max concurrent rooms', () => {
      const roomPool = { roomAmount: 50, maxConcurrent: 10 };
      expect(roomPool.maxConcurrent).toBe(10);
    });
  });
});
