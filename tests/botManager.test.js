const { simulateBotMove, getBotReactionTime } = require('../utils/botManager');

// Mock Bot model
jest.mock('../models/Bot', () => ({
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  find: jest.fn()
}));

// Mock GameSession model
jest.mock('../models/GameSession', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));

describe('botManager', () => {
  describe('getBotReactionTime', () => {
    test('should return 2000ms reaction time', () => {
      expect(getBotReactionTime()).toBe(2000);
    });
  });

  describe('simulateBotMove', () => {
    let mockGameSession;
    let mockBot;

    beforeEach(() => {
      // Create a mock game session with called numbers and players
      mockGameSession = {
        players: [
          {
            user: 'bot_1000000000',
            name: 'Abebe',
            isBot: true,
            cardGrid: [
              [1, 16, 31, 46, 61],
              [2, 17, 32, 47, 62],
              [3, 18, 0, 48, 63], // Center is free space (0)
              [4, 19, 33, 49, 64],
              [5, 20, 34, 50, 65]
            ],
            markedState: [
              [false, false, false, false, false],
              [false, false, false, false, false],
              [false, false, true, false, false], // Center marked as free space
              [false, false, false, false, false],
              [false, false, false, false, false]
            ]
          }
        ],
        calledNumbers: [1, 16, 31]
      };

      mockBot = {
        name: 'Abebe',
        telegramId: 'bot_1000000000',
        difficulty: 'medium'
      };
    });

    test('should mark a number that has been called', () => {
      const move = simulateBotMove(mockGameSession, mockBot);
      
      expect(move).toBeDefined();
      expect(move.num).toBeOneOf([1, 16, 31]);
      expect(move.row).toBeGreaterThanOrEqual(0);
      expect(move.col).toBeGreaterThanOrEqual(0);
    });

    test('should return null if no called numbers match bot card', () => {
      mockGameSession.calledNumbers = [70, 71, 72]; // Numbers not on bot's card
      
      const move = simulateBotMove(mockGameSession, mockBot);
      
      expect(move).toBeNull();
    });

    test('should skip already marked numbers', () => {
      // Mark number 1
      mockGameSession.players[0].markedState[0][0] = true;
      mockGameSession.calledNumbers = [1, 16];
      
      const move = simulateBotMove(mockGameSession, mockBot);
      
      // Should mark 16, not 1 (already marked)
      expect(move).toBeDefined();
      expect(move.num).toBe(16);
    });

    test('should handle different difficulty levels', () => {
      // Easy difficulty - random selection
      mockBot.difficulty = 'easy';
      const easyMove = simulateBotMove(mockGameSession, mockBot);
      expect(easyMove).toBeDefined();

      // Hard difficulty - strategic selection
      mockBot.difficulty = 'hard';
      const hardMove = simulateBotMove(mockGameSession, mockBot);
      expect(hardMove).toBeDefined();
    });

    test('should skip free space (center)', () => {
      // Only center should be marked initially
      mockGameSession.calledNumbers = [];
      
      const move = simulateBotMove(mockGameSession, mockBot);
      
      expect(move).toBeNull(); // No valid marks when no numbers called
    });
  });
});

// Custom matcher for toBeOneOf
expect.extend({
  toBeOneOf(received, array) {
    const pass = array.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${array}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${array}`,
        pass: false,
      };
    }
  },
});
