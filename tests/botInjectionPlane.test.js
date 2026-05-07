const { getBotsForStreak, calculateStreak, getPrizeForStreakAndRoom, calculatePrizeForRoom } = require('../utils/botInjectionPlane');

describe('botInjectionPlane', () => {
  describe('getBotsForStreak', () => {
    test('should return 6 bots for streak 1', () => {
      expect(getBotsForStreak(1)).toBe(6);
    });

    test('should return 8 bots for streak 2', () => {
      expect(getBotsForStreak(2)).toBe(8);
    });

    test('should return 13 bots for streak 8', () => {
      expect(getBotsForStreak(8)).toBe(13);
    });

    test('should return 6 bots for streak > 8 (reset)', () => {
      expect(getBotsForStreak(9)).toBe(6);
      expect(getBotsForStreak(10)).toBe(6);
    });

    test('should return 6 bots for invalid streak < 1', () => {
      expect(getBotsForStreak(0)).toBe(6);
      expect(getBotsForStreak(-1)).toBe(6);
    });
  });

  describe('calculateStreak', () => {
    test('should return streak 1 for no previous game', () => {
      const result = calculateStreak(null, 0);
      expect(result.newStreak).toBe(1);
      expect(result.shouldReset).toBe(false);
    });

    test('should increment streak if within 10 minutes', () => {
      const lastGameTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const result = calculateStreak(lastGameTime, 2);
      expect(result.newStreak).toBe(3);
      expect(result.shouldReset).toBe(false);
    });

    test('should reset streak if more than 10 minutes passed', () => {
      const lastGameTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
      const result = calculateStreak(lastGameTime, 5);
      expect(result.newStreak).toBe(1);
      expect(result.shouldReset).toBe(true);
    });

    test('should reset streak if >= 8', () => {
      const lastGameTime = new Date(Date.now() - 5 * 60 * 1000);
      const result = calculateStreak(lastGameTime, 8);
      expect(result.newStreak).toBe(1);
      expect(result.shouldReset).toBe(true);
    });
  });

  describe('getPrizeForStreakAndRoom', () => {
    test('should calculate prize for 100 ETB room with streak 1', () => {
      const result = getPrizeForStreakAndRoom(100, 1);
      // 1 human + 6 bots = 7 players
      // 7 * 100 * 0.85 = 595
      expect(result.totalPlayers).toBe(7);
      expect(result.botsToInject).toBe(6);
      expect(result.prizePool).toBe(595);
    });

    test('should calculate prize for 50 ETB room with streak 2', () => {
      const result = getPrizeForStreakAndRoom(50, 2);
      // 1 human + 8 bots = 9 players
      // 9 * 50 * 0.85 = 382.5 -> 382
      expect(result.totalPlayers).toBe(9);
      expect(result.botsToInject).toBe(8);
      expect(result.prizePool).toBe(382);
    });

    test('should include house cut calculation', () => {
      const result = getPrizeForStreakAndRoom(100, 1);
      // Gross: 7 * 100 = 700
      // Prize: 595
      // House: 700 - 595 = 105 (15%)
      expect(result.grossPool).toBe(700);
      expect(result.houseCut).toBe(105);
    });
  });

  describe('calculatePrizeForRoom', () => {
    test('should calculate 85% of total entry fees', () => {
      expect(calculatePrizeForRoom(100, 10)).toBe(850); // 1000 * 0.85
      expect(calculatePrizeForRoom(50, 20)).toBe(850);  // 1000 * 0.85
      expect(calculatePrizeForRoom(20, 50)).toBe(850);  // 1000 * 0.85
    });

    test('should round down fractional prizes', () => {
      // 7 * 100 * 0.85 = 595 (exact)
      expect(calculatePrizeForRoom(100, 7)).toBe(595);
      // 9 * 50 * 0.85 = 382.5 -> 382
      expect(calculatePrizeForRoom(50, 9)).toBe(382);
    });
  });
});
