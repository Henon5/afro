/**
 * Bot Injection Control Plane
 * 
 * This module controls exactly how many bots are injected based on human player count.
 * It ensures the Prize Pool calculation is always atomic:
 * Prize = (HumanCount + BotCount) * EntryFee * 0.85
 * 
 * CONFIGURATION:
 * Adjust the `INJECTION_PLAN` below to control bot density.
 */

const INJECTION_PLAN = [
  // { minHumans, maxHumans, botsToInject, strategy }
  // If humans = 1, inject 3 bots (Total 4 players)
  { minHumans: 1, maxHumans: 1, botsToInject: 3, strategy: 'fill_small_room' },
  
  // If humans = 2, inject 2 bots (Total 4 players)
  { minHumans: 2, maxHumans: 2, botsToInject: 2, strategy: 'fill_small_room' },
  
  // If humans = 3, inject 1 bot (Total 4 players)
  { minHumans: 3, maxHumans: 3, botsToInject: 1, strategy: 'fill_small_room' },
  
  // If humans = 4, inject 0 bots (Total 4 players - Full Room)
  { minHumans: 4, maxHumans: 4, botsToInject: 0, strategy: 'no_bots_needed' },
  
  // If humans = 5, inject 3 bots (Total 8 players - Jump to next tier)
  { minHumans: 5, maxHumans: 5, botsToInject: 3, strategy: 'fill_medium_room' },
  
  // If humans = 6, inject 2 bots (Total 8 players)
  { minHumans: 6, maxHumans: 6, botsToInject: 2, strategy: 'fill_medium_room' },
  
  // If humans = 7, inject 1 bot (Total 8 players)
  { minHumans: 7, maxHumans: 7, botsToInject: 1, strategy: 'fill_medium_room' },
  
  // If humans = 8, inject 0 bots (Total 8 players - Full Room)
  { minHumans: 8, maxHumans: 8, botsToInject: 0, strategy: 'no_bots_needed' },
  
  // Default fallback for larger rooms (e.g., 10 humans -> 10 bots for 20 total)
  { minHumans: 9, maxHumans: 100, botsToInject: 0, strategy: 'manual_override' } 
];

/**
 * Calculate the exact number of bots to inject for a given human count.
 * @param {number} humanCount - The number of real humans joining.
 * @returns {Object} - { botsToInject, totalPlayers, ruleApplied }
 */
function getInjectionPlan(humanCount) {
  const rule = INJECTION_PLAN.find(
    plan => humanCount >= plan.minHumans && humanCount <= plan.maxHumans
  );

  if (!rule) {
    // Fallback: No bots if no rule matches (safety)
    return {
      botsToInject: 0,
      totalPlayers: humanCount,
      ruleApplied: 'NO_RULE_FOUND',
      warning: 'Human count exceeds defined injection plan.'
    };
  }

  return {
    botsToInject: rule.botsToInject,
    totalPlayers: humanCount + rule.botsToInject,
    ruleApplied: rule.strategy,
    details: `Humans: ${humanCount}, Bots: ${rule.botsToInject}, Total: ${humanCount + rule.botsToInject}`
  };
}

/**
 * Calculate the guaranteed atomic prize pool.
 * @param {number} humanCount 
 * @param {number} entryFee 
 * @returns {Object} - { totalPlayers, botsNeeded, grossPool, netPrizePool, commission }
 */
function calculateAtomicPrize(humanCount, entryFee) {
  const plan = getInjectionPlan(humanCount);
  const grossPool = plan.totalPlayers * entryFee;
  const commissionRate = 0.15; // 15% house edge
  const netPrizePool = grossPool * (1 - commissionRate); // 85% to winner

  return {
    humanCount,
    botsToInject: plan.botsToInject,
    totalPlayers: plan.totalPlayers,
    entryFee,
    grossPool,
    netPrizePool,
    commission: grossPool * commissionRate,
    calculationLogic: `${plan.totalPlayers} players × ${entryFee}birr × 0.85`,
    ruleApplied: plan.ruleApplied
  };
}

module.exports = {
  getInjectionPlan,
  calculateAtomicPrize,
  INJECTION_PLAN // Export raw plan for debugging/admin endpoints if needed
};
