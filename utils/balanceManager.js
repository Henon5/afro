const User = require('../models/User');
const Bot = require('../models/Bot');
const { executeWithRetry } = require('../config/db');

/**
 * Batch Balance Update Utility
 * Reduces MongoDB Atlas API calls by batching multiple balance updates
 * into single bulkWrite operations
 */

/**
 * Batch update user balances using bulkWrite (single DB call)
 * @param {Array} updates - Array of { userId, amount } objects
 * @returns {Object} Bulk write result
 */
async function batchUpdateUserBalances(updates) {
  if (!updates || updates.length === 0) {
    return { modifiedCount: 0 };
  }

  console.log(`📦 [BATCH] Processing ${updates.length} user balance updates...`);

  const operations = updates.map(update => ({
    updateOne: {
      filter: { _id: update.userId },
      update: { $inc: { balance: update.amount } },
      upsert: false
    }
  }));

  try {
    const result = await executeWithRetry(
      () => User.bulkWrite(operations, { ordered: false }),
      'Batch User Balance Update',
      3
    );

    console.log(`✅ [BATCH] User balances updated: ${result.modifiedCount || 0} successful`);
    return result;
  } catch (error) {
    console.error('❌ [BATCH] Failed to update user balances:', error.message);
    throw error;
  }
}

/**
 * Batch update bot balances using bulkWrite (single DB call)
 * @param {Array} updates - Array of { botId, amount, isWin } objects
 * @returns {Object} Bulk write result
 */
async function batchUpdateBotBalances(updates) {
  if (!updates || updates.length === 0) {
    return { modifiedCount: 0 };
  }

  console.log(`🤖 [BATCH] Processing ${updates.length} bot balance updates...`);

  const operations = updates.map(update => ({
    updateOne: {
      filter: { _id: update.botId },
      update: { 
        $inc: { 
          balance: update.amount,
          totalWinnings: update.isWin ? update.amount : 0,
          totalWins: update.isWin ? 1 : 0,
          gamesPlayed: 1
        }
      },
      upsert: false
    }
  }));

  try {
    const result = await executeWithRetry(
      () => Bot.bulkWrite(operations, { ordered: false }),
      'Batch Bot Balance Update',
      3
    );

    console.log(`✅ [BATCH] Bot balances updated: ${result.modifiedCount || 0} successful`);
    return result;
  } catch (error) {
    console.error('❌ [BATCH] Failed to update bot balances:', error.message);
    throw error;
  }
}

/**
 * Atomic single user balance update with retry logic
 * Use this for critical individual updates (like prize awards)
 * @param {string} userId - User ID
 * @param {number} amount - Amount to add (can be negative)
 * @param {Object} additionalFields - Additional fields to update
 * @returns {Object} Updated user document
 */
async function updateUserBalance(userId, amount, additionalFields = {}) {
  console.log(`💰 [BALANCE] Updating user ${userId} balance by ${amount} ETB`);
  console.log(`📝 [BALANCE] Additional fields:`, additionalFields);

  const updateData = {
    $inc: {
      balance: amount,
      ...(additionalFields.totalWins && { totalWins: additionalFields.totalWins }),
      ...(additionalFields.totalWinnings && { totalWinnings: additionalFields.totalWinnings }),
      ...(additionalFields.gamesPlayed && { gamesPlayed: additionalFields.gamesPlayed })
    }
  };

  try {
    // Get user before update for logging
    const userBefore = await User.findById(userId).select('balance firstName username');
    console.log(`📊 [BALANCE] User ${userId} balance BEFORE: ${userBefore?.balance || 0} ETB`);

    const result = await executeWithRetry(
      () => User.findOneAndUpdate(
        { _id: userId },
        updateData,
        { new: true, select: 'balance firstName username telegramId' }
      ),
      'User Balance Update',
      3
    );

    if (!result) {
      console.error(`❌ [BALANCE] User ${userId} not found`);
      throw new Error('User not found');
    }

    console.log(`📊 [BALANCE] User ${userId} balance AFTER: ${result.balance} ETB`);
    console.log(`✅ [BALANCE] User ${userId} (${result.firstName || result.username}) new balance: ${result.balance} ETB (+${amount})`);
    return result;
  } catch (error) {
    console.error(`❌ [BALANCE] Failed to update user ${userId}:`, error.message);
    console.error(`❌ [BALANCE] Error stack:`, error.stack);
    throw error;
  }
}

/**
 * Atomic single bot balance update with retry logic
 * @param {string} botId - Bot ID
 * @param {number} amount - Amount to add
 * @param {boolean} isWin - Whether this is a win payout
 * @returns {Object} Updated bot document
 */
async function updateBotBalance(botId, amount, isWin = false) {
  console.log(`🤖 [BALANCE] Updating bot ${botId} balance by ${amount} ETB`);

  try {
    const result = await executeWithRetry(
      () => Bot.findOneAndUpdate(
        { _id: botId },
        {
          $inc: {
            balance: amount,
            ...(isWin ? { totalWins: 1, totalWinnings: amount } : {}),
            gamesPlayed: 1
          }
        },
        { new: true, select: 'balance name telegramId' }
      ),
      'Bot Balance Update',
      3
    );

    if (!result) {
      console.error(`❌ [BALANCE] Bot ${botId} not found`);
      throw new Error('Bot not found');
    }

    console.log(`✅ [BALANCE] Bot ${result.name} new balance: ${result.balance} ETB`);
    return result;
  } catch (error) {
    console.error(`❌ [BALANCE] Failed to update bot ${botId}:`, error.message);
    throw error;
  }
}

/**
 * Check and resume failed Atlas Triggers
 * This helps detect when triggers need manual intervention
 * @returns {Object} Trigger status information
 */
async function checkAtlasTriggers() {
  console.log('🔍 [TRIGGER] Checking Atlas Trigger status...');

  try {
    // Note: Direct trigger management requires Atlas Admin API
    // This function logs guidance for manual checks
    const triggerChecklist = {
      steps: [
        '1. Log in to MongoDB Atlas UI',
        '2. Navigate to App Services > Triggers',
        '3. Look for triggers with "Failed" or "Paused" status',
        '4. Click on failed triggers and review error logs',
        '5. Use "Resume" button to restart failed triggers',
        '6. Check "Logs" tab for detailed error messages'
      ],
      commonIssues: [
        'Rate limit exceeded - Wait 1 minute and resume',
        'Function timeout - Increase timeout limit in trigger settings',
        'Permission errors - Verify database access roles',
        'Syntax errors - Review function code for errors'
      ],
      preventionTips: [
        'Implement exponential backoff in trigger functions',
        'Add try-catch blocks with proper error handling',
        'Use batch operations instead of individual updates',
        'Monitor trigger execution metrics regularly'
      ]
    };

    console.log('📋 [TRIGGER] Atlas Trigger Management Guide:');
    triggerChecklist.steps.forEach(step => console.log(`   ${step}`));
    
    console.log('\n⚠️ [TRIGGER] Common Issues:');
    triggerChecklist.commonIssues.forEach(issue => console.log(`   - ${issue}`));
    
    console.log('\n💡 [TRIGGER] Prevention Tips:');
    triggerChecklist.preventionTips.forEach(tip => console.log(`   - ${tip}`));

    return {
      status: 'manual_check_required',
      message: 'Atlas Triggers must be checked manually in the Atlas UI',
      checklist: triggerChecklist
    };
  } catch (error) {
    console.error('❌ [TRIGGER] Error checking triggers:', error.message);
    return {
      status: 'error',
      message: error.message
    };
  }
}

module.exports = {
  batchUpdateUserBalances,
  batchUpdateBotBalances,
  updateUserBalance,
  updateBotBalance,
  checkAtlasTriggers
};
