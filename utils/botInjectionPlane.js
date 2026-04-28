/**
 * Bot Injection Control Plane
 * 
 * This module controls exactly how many bots are injected based on human player count.
 * It ensures the Prize Pool calculation is always atomic:
 * Prize = (HumanCount + BotCount) * EntryFee * 0.85
 * 
 * CONFIGURATION:
 * Master Milestone & Escalation Sheet - "In a Row" Play
 * Streak-based bot injection with prize calculation for all room types
 */

// STREAK_MAP: Maps streak (1-8) to bots to inject based on Master Sheet
const STREAK_MAP = {
  1: 6,   // Row 1: +6 bots → 7 total players
  2: 8,   // Row 2: +8 bots → 9 total players
  3: 7,   // Row 3: +7 bots → 8 total players
  4: 9,   // Row 4: +9 bots → 10 total players
  5: 10,  // Row 5: +10 bots → 11 total players
  6: 12,  // Row 6: +12 bots → 13 total players
  7: 9,   // Row 7: +9 bots → 10 total players
  8: 13   // Row 8: +13 bots → 14 total players
};

// Room amounts supported by the escalation system
const SUPPORTED_ROOMS = [100, 50, 20, 10, 5];

// Streak reset threshold: 10 minutes in milliseconds
const STREAK_RESET_THRESHOLD = 10 * 60 * 1000;

/**
 * Get the number of bots to inject based on user's current streak
 * @param {number} streak - User's current game streak (1-8, resets if >8)
 * @returns {number} - Number of bots to inject
 */
function getBotsForStreak(streak) {
  // Reset to Row 1 if streak exceeds 8
  const effectiveStreak = streak > 8 || streak < 1 ? 1 : streak;
  return STREAK_MAP[effectiveStreak] || STREAK_MAP[1];
}

/**
 * Calculate the total prize pool based on room amount and total players
 * Formula: Math.floor((RoomAmount * TotalPlayers) * 0.85)
 * House keeps 15%, player sees clean rounded number
 * @param {number} roomAmount - Entry fee (100, 50, 20, 10, or 5 ETB)
 * @param {number} totalPlayers - Total players (1 human + injected bots)
 * @returns {number} - Prize pool amount
 */
function calculatePrizeForRoom(roomAmount, totalPlayers) {
  return Math.floor((roomAmount * totalPlayers) * 0.85);
}

/**
 * Get the prize pool for a specific room and streak combination
 * Based on Master Milestone Sheet values
 * @param {number} roomAmount - Entry fee
 * @param {number} streak - Current streak (1-8)
 * @returns {Object} - { botsToInject, totalPlayers, prizePool, houseCut, grossPool }
 */
function getPrizeForStreakAndRoom(roomAmount, streak) {
  const botsToInject = getBotsForStreak(streak);
  const totalPlayers = 1 + botsToInject; // 1 human + bots
  const grossPool = roomAmount * totalPlayers;
  const prizePool = calculatePrizeForRoom(roomAmount, totalPlayers);
  const houseCut = grossPool - prizePool; // 15% house edge
  
  return {
    streak,
    roomAmount,
    botsToInject,
    totalPlayers,
    grossPool,
    prizePool,
    houseCut,
    calculation: `${totalPlayers} players × ${roomAmount}birr × 0.85`
  };
}

/**
 * Calculate user's current streak based on last game time
 * If within 10 minutes of last game, increment streak
 * If more than 10 minutes passed, reset to 1
 * @param {Date} lastGameTime - User's last game time
 * @param {number} currentStreak - User's current streak count
 * @returns {Object} - { newStreak, shouldReset }
 */
function calculateStreak(lastGameTime, currentStreak) {
  const now = new Date();
  
  // If no previous game time, start at streak 1
  if (!lastGameTime) {
    return { newStreak: 1, shouldReset: false };
  }
  
  const timeDiff = now.getTime() - lastGameTime.getTime();
  
  // If more than 10 minutes passed, reset streak to 1
  if (timeDiff > STREAK_RESET_THRESHOLD) {
    return { newStreak: 1, shouldReset: true };
  }
  
  // If streak exceeds 8, reset to 1
  if (currentStreak >= 8) {
    return { newStreak: 1, shouldReset: true };
  }
  
  // Otherwise, increment streak
  return { newStreak: currentStreak + 1, shouldReset: false };
}

/**
 * Legacy function for backward compatibility - uses streak-based injection
 * @param {number} humanCount - Number of human players (assumes 1 for streak system)
 * @returns {Object} - { botsToInject, totalPlayers, ruleApplied, details }
 */
function getInjectionPlan(humanCount) {
  // For streak-based system, we assume 1 human player per game
  // The actual streak is passed via user context in joinRoom
  const defaultStreak = 1;
  const botsToInject = getBotsForStreak(defaultStreak);
  
  return {
    botsToInject,
    totalPlayers: humanCount + botsToInject,
    ruleApplied: 'streak_based_injection',
    details: `Humans: ${humanCount}, Bots: ${botsToInject} (streak ${defaultStreak}), Total: ${humanCount + botsToInject}`
  };
}

/**
 * Legacy function for backward compatibility - calculates prize using streak system
 * @param {number} humanCount - Number of human players
 * @param {number} entryFee - Room entry fee
 * @returns {Object} - Prize calculation details
 */
function calculateAtomicPrize(humanCount, entryFee) {
  // Default to streak 1 for legacy calls
  const result = getPrizeForStreakAndRoom(entryFee, 1);
  
  return {
    humanCount,
    botsToInject: result.botsToInject,
    totalPlayers: result.totalPlayers,
    entryFee,
    grossPool: result.grossPool,
    netPrizePool: result.prizePool,
    commission: result.houseCut,
    calculationLogic: result.calculation,
    ruleApplied: 'streak_based_injection'
  };
}

module.exports = {
  getInjectionPlan,
  calculateAtomicPrize,
  getBotsForStreak,
  calculateStreak,
  getPrizeForStreakAndRoom,
  calculatePrizeForRoom,
  STREAK_MAP,
  SUPPORTED_ROOMS,
  STREAK_RESET_THRESHOLD
};
