# Bot Master Control Plane - Complete Implementation Plan

## Overview
This document outlines the complete master plan for bot functionality in the Bingo game system, ensuring all 50 bots can effectively compete with human players.

## Current Status Analysis

### ✅ What's Already Working
1. **50 Bots Initialized**: All 50 bots are created with unique names, Telegram IDs, and bingo cards
2. **Bot Injection System**: Bots are injected into rooms based on player streak (STREAK_MAP)
3. **Auto-Mark Logic**: Bots automatically mark numbers within 2 seconds of being called
4. **Win Detection**: Bots check for winning patterns after marking
5. **Payout System**: Winning bots receive prize money and game ends properly

### ❌ Critical Issues to Fix

## Issue #1: Bots Cannot Claim Wins Automatically
**Problem**: While bots detect wins, they rely on the `handleBotWin()` function which may not be properly triggered in all cases.

**Current Flow**:
```
callNumber() → processBotMoves() → checkWin() → handleBotWin()
```

**Required Fix**: Ensure bots have an automatic "claim button" equivalent that triggers immediately upon detecting a win pattern.

### Solution Implementation

#### File: `/workspace/utils/botManager.js`
The `processBotMoves()` function already calls `checkWin()` after each mark. However, we need to ensure:

1. **Immediate Win Check**: After every number call, ALL bots must check for wins
2. **Atomic Claim**: When a bot wins, immediately award prize and end game
3. **Prevent Race Conditions**: Only ONE winner (first to claim)

**Code Enhancement Needed**:
```javascript
// In processBotMoves(), after marking:
const botWinResult = freshSession.checkWin(botIndex);
if (botWinResult.win) {
  console.log(`🏆 BOT WINNER: ${bot.name} with pattern: ${botWinResult.pattern}!`);
  
  // IMMEDIATE CLAIM - No delay
  await handleBotWin(gameSession, bot, botIndex, botWinResult);
  
  return { winner: bot, botIndex, winResult: botWinResult };
}
```

✅ **Status**: Already implemented in lines 294-300 of botManager.js

**Verification Required**: Test that bots actually win games and receive payouts.

---

## Issue #2: Bots Run Out of Money and Can't Play
**Problem**: Bots pay entry fees to join rooms. If their balance drops below the entry fee, they cannot participate.

**Current State**:
- Bots start with 1000 ETB balance
- Entry fees: 5, 10, 20, 50, 100 ETB
- After ~10-200 games (depending on room), bots run out of money
- `getRandomBot()` filters bots with `balance: { $gte: 10 }`

**Required Fix**: Implement automatic balance refill when bots fall below threshold.

### Solution Implementation

#### New Function: `autoRefillBotBalances()`

**File**: `/workspace/utils/botManager.js`

```javascript
/**
 * Auto-refill bot balances when they fall below minimum threshold
 * Ensures bots can always participate in games
 * @param {number} minBalance - Minimum balance threshold (default: 500 ETB)
 * @param {number} refillAmount - Amount to add when below threshold (default: 1000 ETB)
 */
async function autoRefillBotBalances(minBalance = 500, refillAmount = 1000) {
  try {
    const lowBalanceBots = await Bot.find({ 
      isActive: true, 
      balance: { $lt: minBalance } 
    });
    
    if (lowBalanceBots.length === 0) {
      console.log('✅ All bots have sufficient balance');
      return { refilled: 0 };
    }
    
    console.log(`💰 Refilling ${lowBalanceBots.length} bots with low balance...`);
    
    const refillOps = lowBalanceBots.map(bot => ({
      updateOne: {
        filter: { _id: bot._id },
        update: { 
          $inc: { balance: refillAmount },
          lastRefill: new Date()
        }
      }
    }));
    
    const result = await Bot.bulkWrite(refillOps);
    
    console.log(`✅ Refilled ${result.modifiedCount} bots with ${refillAmount} ETB each`);
    
    return { 
      refilled: result.modifiedCount,
      totalAdded: result.modifiedCount * refillAmount
    };
  } catch (error) {
    console.error('❌ Error refilling bot balances:', error.message);
    throw error;
  }
}
```

#### Integration Points

**Option A: Refill on Every Game Join** (Recommended)
- Call `autoRefillBotBalances()` before injecting bots into a room
- Ensures bots always have money when needed

**Option B: Periodic Refill (Cron Job)**
- Run every 5-10 minutes to refill all low-balance bots
- Less frequent DB operations

**Option C: Refill When Bot Selection Fails**
- If `getRandomBot()` returns null due to low balance, trigger refill
- Reactive approach

#### Updated Bot Schema
Add tracking fields to Bot model:

```javascript
// In /workspace/models/Bot.js
lastRefill: { type: Date },
refillCount: { type: Number, default: 0 }
```

---

## Issue #3: Bots Need New Cards for Each Game
**Problem**: Currently, bots keep the same card across multiple games. This reduces randomness and makes bot behavior predictable.

**Current State**:
- Cards are generated once during bot initialization
- Same card used for every game the bot joins
- `cardGrid` and `markedState` persist in database

**Required Fix**: Generate fresh bingo cards every time a bot enters a new game room.

### Solution Implementation

#### Step 1: Clear Card Data Before Game Entry

**File**: `/workspace/routes/game.js` - In bot injection logic

When bots are added to a game session, regenerate their cards:

```javascript
// In the bot injection loop (around line 470-500)
for (let i = 0; i < selectedBots.length; i++) {
  const bot = selectedBots[i];
  
  // 🔄 GENERATE FRESH CARD FOR THIS GAME
  bot.generateCard();
  await bot.save();
  
  // Add bot to game session with NEW card
  gameSession.players.push({
    user: bot.telegramId.toString(),
    telegramId: bot.telegramId,
    name: bot.name,
    isBot: true,
    difficulty: bot.difficulty,
    cardGrid: bot.cardGrid,  // Fresh card
    markedState: bot.markedState  // Reset marks
  });
  
  trackBotInjection(amount, bot.telegramId);
}
```

#### Step 2: Reset Marked State on Game Entry

Ensure `markedState` is reset (only free space marked):

```javascript
// In Bot.generateCard() method (already done in models/Bot.js)
const marked = Array(5).fill(null).map(() => Array(5).fill(false));
marked[2][2] = true; // Free space always marked
this.markedState = marked;
```

#### Step 3: Clean Up Old Cards on Game Completion

When game ends, optionally clear card data to force regeneration:

```javascript
// In handleBotWin() or claim route
await Bot.updateMany(
  { telegramId: { $in: completedGameBots } },
  { 
    $set: { 
      cardGrid: [[0]],  // Clear card
      markedState: []   // Clear marks
    } 
  }
);
```

---

## Issue #4: Ensuring Fair Competition Between Bots and Humans
**Problem**: Bots must compete fairly with human players - not too easy, not impossible to beat.

**Current State**:
- Bots have 2-second reaction time (`BOT_REACTION_TIME_MS = 2000`)
- Three difficulty levels: easy, medium, hard
- Bots mark numbers strategically based on difficulty

**Required Enhancements**:

### 4.1: Balanced Reaction Times

**Current**: All bots react in exactly 2 seconds

**Improvement**: Vary reaction times by difficulty:

```javascript
const BOT_REACTION_TIMES = {
  easy: 3000 + Math.random() * 2000,    // 3-5 seconds (slow)
  medium: 2000 + Math.random() * 1000,  // 2-3 seconds (moderate)
  hard: 1000 + Math.random() * 1000     // 1-2 seconds (fast)
};

function getBotReactionTime(difficulty) {
  return BOT_REACTION_TIMES[difficulty] || BOT_REACTION_TIMES.medium;
}
```

### 4.2: Imperfect Bot Play (Human-Like Mistakes)

Bots should occasionally miss marks to simulate human error:

```javascript
// In simulateBotMove()
const accuracy = difficulty === 'easy' ? 0.85 : (difficulty === 'medium' ? 0.95 : 1.0);

if (Math.random() > accuracy) {
  // Bot misses this mark (simulates distraction)
  console.log(`😅 Bot ${bot.name} missed marking ${move.num}`);
  return null;
}
```

### 4.3: Win Rate Balancing

Track bot vs human win rates and adjust:

```javascript
// Add to Bot schema
winRate: { type: Number, default: 0 },

// After game completion, update stats
const totalGames = bot.gamesPlayed + 1;
const winRate = (bot.totalWins / totalGames) * 100;
await Bot.findByIdAndUpdate(bot._id, { winRate });
```

**Target Win Rates**:
- Easy bots: 10-20% win rate
- Medium bots: 20-35% win rate  
- Hard bots: 35-45% win rate
- Humans should win 40-60% overall

---

## Complete Implementation Checklist

### Phase 1: Auto-Refill System ⏳
- [ ] Add `autoRefillBotBalances()` function to botManager.js
- [ ] Add `lastRefill` and `refillCount` fields to Bot model
- [ ] Integrate refill call in bot injection logic (game.js join route)
- [ ] Set threshold: 500 ETB minimum, 1000 ETB refill
- [ ] Test: Run bots until low balance, verify auto-refill triggers

### Phase 2: Fresh Cards Per Game ⏳
- [ ] Modify bot injection loop to call `bot.generateCard()` before adding to session
- [ ] Ensure `markedState` is reset for each new game
- [ ] Add card regeneration logging for debugging
- [ ] Test: Verify each game shows different bot cards

### Phase 3: Enhanced Competition ⏳
- [ ] Implement variable reaction times by difficulty
- [ ] Add occasional missed marks for realism
- [ ] Track and display bot win rates
- [ ] Balance difficulty distribution (currently: 15 easy, 20 medium, 15 hard)

### Phase 4: Admin Controls ⏳
- [ ] Add admin endpoint to manually refill all bots
- [ ] Add admin endpoint to force card regeneration
- [ ] Add bot statistics dashboard (win rates, balances, games played)
- [ ] Add endpoint to view current bot cards (for debugging)

### Phase 5: Monitoring & Alerts ⏳
- [ ] Log bot balance warnings (< 200 ETB)
- [ ] Alert when no bots available for injection
- [ ] Track bot participation rates per room
- [ ] Monitor bot vs human win ratio

---

## Code Changes Required

### File 1: `/workspace/models/Bot.js`
**Add fields**:
```javascript
lastRefill: { type: Date },
refillCount: { type: Number, default: 0 },
winRate: { type: Number, default: 0 }
```

### File 2: `/workspace/utils/botManager.js`
**Add functions**:
```javascript
- autoRefillBotBalances(minBalance, refillAmount)
- getBotReactionTime(difficulty)
- regenerateBotCard(botId)
```

**Modify functions**:
```javascript
- simulateBotMove() - Add variable reaction times
- processBotMoves() - Ensure immediate win checks
```

### File 3: `/workspace/routes/game.js`
**Modify**:
- Bot injection loop - Call `generateCard()` for each bot
- Join route - Call `autoRefillBotBalances()` before injection
- Add admin endpoints for bot management

### File 4: `/workspace/utils/botInjectionPlane.js`
**No changes needed** - Injection logic is sound

---

## Testing Protocol

### Test 1: Auto-Refill
```bash
# Manually set bot balance to 100 ETB
db.bots.updateOne({ name: "Abebe" }, { $set: { balance: 100 } })

# Trigger game join
# Verify bot balance increases to 1100 ETB
```

### Test 2: Fresh Cards
```bash
# Note bot card before game
# Join game with bot
# Check bot has different card in new game
```

### Test 3: Bot Wins
```bash
# Start game with 1 human + 6 bots
# Call numbers until someone wins
# Verify bot can win and receive payout
```

### Test 4: Competition Balance
```bash
# Run 100 simulated games
# Track: Human wins vs Bot wins
# Target: 40-60% human win rate
```

---

## Expected Outcomes

After implementing this master plan:

1. ✅ **All 50 bots can always play** - Auto-refill ensures no balance issues
2. ✅ **Fresh cards every game** - Unpredictable bot behavior
3. ✅ **Fair competition** - Bots win sometimes, humans win sometimes
4. ✅ **Automatic claiming** - Bots instantly claim wins without manual intervention
5. ✅ **Sustainable ecosystem** - Bots cycle through games indefinitely

---

## Deployment Steps

1. **Backup Database**
   ```bash
   mongodump --uri="your_mongodb_uri" --out=./backup
   ```

2. **Apply Model Changes**
   - Update Bot.js schema
   - Run migration script to add new fields

3. **Deploy Code Updates**
   - Upload modified files
   - Restart server

4. **Initialize Bots**
   ```bash
   curl -X POST http://localhost:5000/api/game/bots/init \
     -H "Authorization: Bearer ADMIN_TOKEN"
   ```

5. **Monitor First Games**
   - Watch logs for bot activity
   - Verify auto-refill triggers
   - Confirm bot wins are processed correctly

---

## Maintenance

### Weekly Tasks
- Review bot win rates
- Check for any stuck games
- Verify auto-refill is working

### Monthly Tasks
- Rebalance difficulty if win rates drift
- Add new bot names for variety
- Review and optimize reaction times

---

## Conclusion

This master plan ensures all 50 bots are fully functional competitors in the Bingo game system. The three critical improvements (auto-refill, fresh cards, automatic claiming) will create a sustainable and engaging gameplay experience where bots and humans compete on equal footing.

**Priority Order**:
1. 🔴 HIGH: Auto-refill system (bots can't play without money)
2. 🔴 HIGH: Automatic win claiming (core functionality)
3. 🟡 MEDIUM: Fresh cards per game (improves experience)
4. 🟢 LOW: Enhanced competition features (polish)

Estimated implementation time: 4-6 hours
Testing time: 2-3 hours
