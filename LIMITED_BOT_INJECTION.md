# Bot Functionality Implementation

## Overview
This document describes the complete bot play logic activation and limited injection controls implemented in the game system.

---

## Part 1: Limited Bot Injection Controls

### Implemented Constraints in `POST /join` Route

#### 1. Milestone Cap
- **Hard Limits**: `[8, 14, 20, 28]` players maximum
- **Behavior**: 
  - Calculates the next milestone based on current player count
  - If room reaches 28 players, ALL bot injection stops immediately
  - Automatically reduces bot injection to stay under the next milestone cap

```javascript
const MILESTONE_CAPS = [8, 14, 20, 28];
// Room at 28 players → No more bots injected
```

#### 2. Anti-Flood Protection
- **Mechanism**: `roomProcessingState` Map tracks processing per user/room combination
- **Key Format**: `${roomAmount}_${userId}`
- **Behavior**:
  - Prevents duplicate bot injection if user clicks 'Join' multiple times rapidly
  - Returns early with existing session data if already processing
  - Clears flag after completion

```javascript
const processingKey = `${roomAmount}_${req.user._id}`;
if (roomProcessingState.get(processingKey)) {
  // Return early - no duplicate injection
}
roomProcessingState.set(processingKey, true);
// ... process ...
roomProcessingState.delete(processingKey);
```

#### 3. Unique Participation
- **Bot Selection Criteria**:
  - `isActive: true` - Only active bots from database
  - Not already in current game session
  - Not already tracked in injection sheet
  - **Not in ANY other active game session** (prevents double-booking)
  - Has sufficient balance for entry fee

```javascript
const availableBots = await Bot.find({ 
  telegramId: { $nin: Array.from(allExcludedBotIds) },
  _id: { $nin: Array.from(botsInActiveGames) },
  isActive: true,
  balance: { $gte: roomAmount }
}).limit(botsNeeded);
```

#### 4. Resource Guard
- **Maximum**: 13 bots per single request
- **Purpose**: Prevents server timeout errors on low-resource machines
- **Automatic Capping**: Reduces injection count if plan exceeds limit

```javascript
const MAX_BOTS_PER_REQUEST = 13;
if (botsNeeded > MAX_BOTS_PER_REQUEST) {
  botsNeeded = MAX_BOTS_PER_REQUEST;
}
```

---

## Part 2: Bot Play Logic Activation

### Game Loop Integration

The bot play logic is now fully activated through the `processBotMoves()` function which is called automatically after every `callNumber()` execution.

### The Trigger: callNumber() → processBotMoves()

When the `POST /number/:sessionId` endpoint is called:

```javascript
// In routes/game.js line ~763
await processBotMoves(gameSession);
```

This triggers the following sequence for ALL bots in the game session:

### Step 1: Loop Through All Bot Players

```javascript
const botPlayers = gameSession.players.filter(p => p.isBot);
for (const botPlayer of botPlayers) {
  const bot = await Bot.findOne({ telegramId: botPlayer.user });
  // ...
}
```

### Step 2: Call simulateBotMove() For Each Bot

```javascript
// THE TRIGGER
const move = simulateBotMove(gameSession, bot);
```

The `simulateBotMove()` function (from `utils/botManager.js`):
- Finds all valid marks (called numbers that aren't marked yet)
- Applies bot difficulty strategy (easy/medium/hard)
- Returns the selected mark position `{row, col, num}`

### Step 3: Update Marked State (THE MARK)

```javascript
// THE MARK: Update marked state in game session
gameSession.players[botIndex].markedState[move.row][move.col] = true;
```

This updates the bot's card state in the database when the session is saved.

### Step 4: Win Check After Every Mark

```javascript
// THE WIN CHECK: Run checkBotWin() after every mark
const botWinResult = gameSession.checkWin(botIndex);
```

The `checkWin()` method checks for:
- Rows, columns, diagonals
- Four corners
- Full card (blackout)

### Step 5: Handle Bot Win Sequence

If a bot wins AND it's allowed (based on win pattern logic):

```javascript
if (botWinResult.win && shouldLetBotWin) {
  console.log(`🎉 Bot ${bot.name} WINS with pattern: ${botWinResult.pattern}!`);
  await handleBotWin(gameSession, bot, botIndex, botWinResult);
  return; // Exit after a bot wins
}
```

The `handleBotWin()` function:
- Awards prize pool to bot
- Sets game status to 'completed'
- Clears bot injection tracking
- Updates consecutive win counter

### Win Pattern Logic

To ensure fair gameplay:
- Bots can win **2 consecutive times** maximum
- After 2 bot wins, the next win MUST go to a human
- Counter resets after a human wins

```javascript
const shouldLetBotWin = consecutiveBotWins < 2;
```

---

## Bot Initialization Requirements

Each bot must have:

### 1. Balance (1000 birr)
```javascript
// Bots are created with initial balance
balance: 1000,
```

### 2. Bingo Card
Generated during bot initialization or on-demand:
```javascript
// 5x5 grid with numbers
cardGrid: [[...], [...], [...], [...], [...]],
markedState: [[false, false, ...], ...]
```

Center space (2,2) is automatically marked as free space.

---

## Console Logging

The system provides detailed emoji-based logs:

| Emoji | Meaning |
|-------|---------|
| 🤖 | Processing bot moves |
| ✅ | Bot marked a number |
| 🎉 | Bot won the game |
| ⏸️ | Bot win blocked for human turn |
| 💾 | Saved to database |
| ⚠️ | Warning (missing card, etc.) |
| 🛑 | Milestone cap reached |

---

## File Locations

| Component | File |
|-----------|------|
| Join Route with Limits | `/workspace/routes/game.js` (lines 309-463) |
| Bot Play Logic | `/workspace/routes/game.js` (lines 560-626) |
| Number Call Trigger | `/workspace/routes/game.js` (line 763) |
| Bot Move Simulation | `/workspace/utils/botManager.js` (lines 121-163) |
| Bot Win Check | `/workspace/utils/botManager.js` (lines 218-223) |
| Injection Control Plane | `/workspace/utils/botInjectionPlane.js` |

---

## Testing Checklist

- [ ] **Anti-Flood**: Rapidly click join - should only inject once
- [ ] **Milestone Cap**: Fill room to 28 players - no more bots
- [ ] **Resource Guard**: Scenario requiring >13 bots - caps at 13
- [ ] **Unique Participation**: Multiple games - bots not duplicated
- [ ] **Bot Plays**: Call number - bots mark cards automatically
- [ ] **Bot Wins**: Bot gets bingo - prize awarded correctly
- [ ] **Win Pattern**: After 2 bot wins - human wins next
- [ ] **Database Sync**: Bot marks persist in database

---

## Benefits

- **Stability**: Prevents server crashes from excessive bot creation
- **Fairness**: Bots don't dominate multiple games simultaneously
- **Performance**: Limits database queries and processing time
- **Control**: Predictable player counts based on milestone tiers
- **Automation**: Bots play automatically without manual triggers
- **Transparency**: Detailed logging for debugging and monitoring
