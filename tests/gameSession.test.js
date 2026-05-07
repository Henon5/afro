/**
 * Unit tests for GameSession model
 * Tests card generation, win checking, and game state management
 */
const mongoose = require('mongoose');

// Mock MongoDB connection
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
});

const GameSession = require('../models/GameSession');

describe('GameSession Model', () => {
  describe('generateCard static method', () => {
    test('should generate a 5x5 card grid', () => {
      const { cardGrid, markedState } = GameSession.generateCard();
      
      expect(cardGrid).toHaveLength(5);
      expect(markedState).toHaveLength(5);
      
      cardGrid.forEach(row => {
        expect(row).toHaveLength(5);
      });
      
      markedState.forEach(row => {
        expect(row).toHaveLength(5);
      });
    });

    test('should have center free space marked as true', () => {
      const { markedState } = GameSession.generateCard();
      
      // Center is at position [2][2]
      expect(markedState[2][2]).toBe(true);
    });

    test('should have all other spaces initially unmarked', () => {
      const { markedState } = GameSession.generateCard();
      
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
          if (row === 2 && col === 2) continue; // Skip free space
          expect(markedState[row][col]).toBe(false);
        }
      }
    });

    test('should generate valid bingo numbers in correct ranges per column', () => {
      const { cardGrid } = GameSession.generateCard();
      
      // Column 0: B (1-15)
      cardGrid.forEach(row => {
        expect(row[0]).toBeGreaterThanOrEqual(1);
        expect(row[0]).toBeLessThanOrEqual(15);
      });
      
      // Column 1: I (16-30)
      cardGrid.forEach(row => {
        expect(row[1]).toBeGreaterThanOrEqual(16);
        expect(row[1]).toBeLessThanOrEqual(30);
      });
      
      // Column 2: N (31-45), skip center
      for (let row = 0; row < 5; row++) {
        if (row === 2) continue;
        expect(cardGrid[row][2]).toBeGreaterThanOrEqual(31);
        expect(cardGrid[row][2]).toBeLessThanOrEqual(45);
      }
      
      // Column 3: G (46-60)
      cardGrid.forEach(row => {
        expect(row[3]).toBeGreaterThanOrEqual(46);
        expect(row[3]).toBeLessThanOrEqual(60);
      });
      
      // Column 4: O (61-75)
      cardGrid.forEach(row => {
        expect(row[4]).toBeGreaterThanOrEqual(61);
        expect(row[4]).toBeLessThanOrEqual(75);
      });
    });

    test('should generate unique numbers within each column', () => {
      const { cardGrid } = GameSession.generateCard();
      
      for (let col = 0; col < 5; col++) {
        const columnNumbers = cardGrid.map(row => row[col]);
        const uniqueNumbers = new Set(columnNumbers);
        expect(uniqueNumbers.size).toBe(columnNumbers.length);
      }
    });
  });

  describe('checkWin instance method', () => {
    let mockSession;

    beforeEach(() => {
      mockSession = {
        calledNumbers: [],
        players: [],
        checkWin: GameSession.prototype.checkWin
      };
    });

    test('should detect horizontal win (row)', () => {
      mockSession.calledNumbers = [1, 2, 3, 4, 5];
      mockSession.players = [{
        cardGrid: [
          [1, 2, 3, 4, 5],
          [6, 7, 8, 9, 10],
          [11, 12, 0, 13, 14],
          [15, 16, 17, 18, 19],
          [20, 21, 22, 23, 24]
        ],
        markedState: [
          [true, true, true, true, true],
          [false, false, false, false, false],
          [false, false, true, false, false],
          [false, false, false, false, false],
          [false, false, false, false, false]
        ]
      }];

      const result = mockSession.checkWin(0);
      expect(result.win).toBe(true);
      expect(result.pattern).toBe('row-0');
    });

    test('should detect vertical win (column)', () => {
      mockSession.calledNumbers = [1, 6, 11, 15, 20];
      mockSession.players = [{
        cardGrid: [
          [1, 16, 31, 46, 61],
          [6, 17, 32, 47, 62],
          [11, 18, 0, 48, 63],
          [15, 19, 33, 49, 64],
          [20, 21, 34, 50, 65]
        ],
        markedState: [
          [true, false, false, false, false],
          [true, false, false, false, false],
          [true, false, true, false, false],
          [true, false, false, false, false],
          [true, false, false, false, false]
        ]
      }];

      const result = mockSession.checkWin(0);
      expect(result.win).toBe(true);
      expect(result.pattern).toBe('col-B');
    });

    test('should detect diagonal win (top-left to bottom-right)', () => {
      // Diagonal: positions [0][0], [1][1], [2][2], [3][3], [4][4]
      // Numbers: 1, 17, 0 (free), 49, 65
      mockSession.calledNumbers = [1, 17, 49, 65];
      mockSession.players = [{
        cardGrid: [
          [1, 16, 31, 46, 61],
          [6, 17, 32, 47, 62],
          [11, 18, 0, 48, 63],
          [15, 19, 33, 49, 64],
          [20, 21, 34, 50, 65]
        ],
        markedState: [
          [true, false, false, false, false],
          [false, true, false, false, false],
          [false, false, true, false, false],
          [false, false, false, true, false],
          [false, false, false, false, true]
        ]
      }];

      const result = mockSession.checkWin(0);
      expect(result.win).toBe(true);
      expect(result.pattern).toBe('diagonal-1');
    });

    test('should detect diagonal win (top-right to bottom-left)', () => {
      mockSession.calledNumbers = [61, 47, 48, 19, 20];
      mockSession.players = [{
        cardGrid: [
          [1, 16, 31, 46, 61],
          [6, 17, 32, 47, 62],
          [11, 18, 0, 48, 63],
          [15, 19, 33, 49, 64],
          [20, 21, 34, 50, 65]
        ],
        markedState: [
          [false, false, false, false, true],
          [false, false, false, true, false],
          [false, false, true, false, false],
          [false, true, false, false, false],
          [true, false, false, false, false]
        ]
      }];

      const result = mockSession.checkWin(0);
      expect(result.win).toBe(true);
      expect(result.pattern).toBe('diagonal-2');
    });

    test('should return false when no winning pattern exists', () => {
      mockSession.calledNumbers = [1, 17, 48];
      mockSession.players = [{
        cardGrid: [
          [1, 16, 31, 46, 61],
          [6, 17, 32, 47, 62],
          [11, 18, 0, 48, 63],
          [15, 19, 33, 49, 64],
          [20, 21, 34, 50, 65]
        ],
        markedState: [
          [true, false, false, false, false],
          [false, true, false, false, false],
          [false, false, true, false, false],
          [false, false, false, false, false],
          [false, false, false, false, false]
        ]
      }];

      const result = mockSession.checkWin(0);
      expect(result.win).toBe(false);
    });

    test('should handle invalid player index', () => {
      mockSession.calledNumbers = [1, 2, 3];
      mockSession.players = [];

      const result = mockSession.checkWin(0);
      expect(result.win).toBe(false);
    });

    test('should only count marked numbers that have been called', () => {
      // Player has marked numbers but they haven't been called yet
      mockSession.calledNumbers = [1]; // Only 1 has been called
      mockSession.players = [{
        cardGrid: [
          [1, 2, 3, 4, 5],
          [6, 7, 8, 9, 10],
          [11, 12, 0, 13, 14],
          [15, 16, 17, 18, 19],
          [20, 21, 22, 23, 24]
        ],
        markedState: [
          [true, true, true, true, true], // All marked but only 1 called
          [false, false, false, false, false],
          [false, false, true, false, false],
          [false, false, false, false, false],
          [false, false, false, false, false]
        ]
      }];

      const result = mockSession.checkWin(0);
      expect(result.win).toBe(false); // Should not win because only 1 was called
    });
  });
});
