const { checkBingoWin, generateBingoNumber, getBingoLetter } = require('../utils/bingoLogic');

describe('bingoLogic', () => {
  describe('checkBingoWin', () => {
    test('should return true when a row is complete', () => {
      const grid = [
        [true, true, true, true, true],
        [false, false, false, false, false],
        [false, false, true, false, false],
        [false, false, false, false, false],
        [false, false, false, false, false]
      ];
      expect(checkBingoWin(grid)).toBe(true);
    });

    test('should return true when a column is complete', () => {
      const grid = [
        [true, false, false, false, false],
        [true, false, false, false, false],
        [true, false, false, false, false],
        [true, false, false, false, false],
        [true, false, false, false, false]
      ];
      expect(checkBingoWin(grid)).toBe(true);
    });

    test('should return true when first diagonal is complete', () => {
      const grid = [
        [true, false, false, false, false],
        [false, true, false, false, false],
        [false, false, true, false, false],
        [false, false, false, true, false],
        [false, false, false, false, true]
      ];
      expect(checkBingoWin(grid)).toBe(true);
    });

    test('should return true when second diagonal is complete', () => {
      const grid = [
        [false, false, false, false, true],
        [false, false, false, true, false],
        [false, false, true, false, false],
        [false, true, false, false, false],
        [true, false, false, false, false]
      ];
      expect(checkBingoWin(grid)).toBe(true);
    });

    test('should return false when no pattern is complete', () => {
      const grid = [
        [true, false, false, false, false],
        [false, true, false, false, false],
        [false, false, false, false, false],
        [false, false, false, true, false],
        [false, false, false, false, true]
      ];
      expect(checkBingoWin(grid)).toBe(false);
    });

    test('should handle center free space correctly', () => {
      const grid = [
        [false, false, false, false, false],
        [false, false, false, false, false],
        [false, false, true, false, false],
        [false, false, false, false, false],
        [false, false, false, false, false]
      ];
      expect(checkBingoWin(grid)).toBe(false);
    });
  });

  describe('generateBingoNumber', () => {
    test('should generate a number between 1 and 75', () => {
      const num = generateBingoNumber([]);
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(75);
    });

    test('should not generate numbers already called', () => {
      const calledNumbers = [1, 2, 3, 4, 5];
      const num = generateBingoNumber(calledNumbers);
      expect(calledNumbers).not.toContain(num);
    });

    test('should return null when all 75 numbers are called', () => {
      const allNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
      const result = generateBingoNumber(allNumbers);
      expect(result).toBeNull();
    });

    test('should generate different numbers on subsequent calls', () => {
      const calledNumbers = [];
      const num1 = generateBingoNumber(calledNumbers);
      calledNumbers.push(num1);
      const num2 = generateBingoNumber(calledNumbers);
      expect(num1).not.toBe(num2);
    });
  });

  describe('getBingoLetter', () => {
    test('should return B for numbers 1-15', () => {
      expect(getBingoLetter(1)).toBe('B');
      expect(getBingoLetter(15)).toBe('B');
    });

    test('should return I for numbers 16-30', () => {
      expect(getBingoLetter(16)).toBe('I');
      expect(getBingoLetter(30)).toBe('I');
    });

    test('should return N for numbers 31-45', () => {
      expect(getBingoLetter(31)).toBe('N');
      expect(getBingoLetter(45)).toBe('N');
    });

    test('should return G for numbers 46-60', () => {
      expect(getBingoLetter(46)).toBe('G');
      expect(getBingoLetter(60)).toBe('G');
    });

    test('should return O for numbers 61-75', () => {
      expect(getBingoLetter(61)).toBe('O');
      expect(getBingoLetter(75)).toBe('O');
    });
  });
});
