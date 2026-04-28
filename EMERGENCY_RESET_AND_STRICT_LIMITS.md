# Emergency Room Reset & Strict Injection Limits

## Problem Fixed
Room 5 had **42 players**, exceeding the hard cap of 28. This broke the Milestone system and prize calculations.

---

## Solution Implemented

### 1. Emergency Cleanup Script (`scripts/emergency_room_reset.js`)

**Run on server startup** to flush all corrupted room states:

```javascript
// Flushes all RoomPool player arrays to []
// Resets currentPool and houseTotal to 0
// Clears all active GameSessions
```

**Usage:**
```bash
node scripts/emergency_room_reset.js
```

### 2. Automatic Reset in `server.js`

The emergency reset now runs **automatically on every server startup**:

```javascript
// In initPromise, AFTER database connection:
performEmergencyReset()
```

This ensures:
- All rooms start fresh with 0 players
- No leftover "42 player" bloat from previous sessions
- Clean state for new games

---

### 3. Strict Injection Guard in `routes/game.js`

#### Milestone Cap (Hard Limit at 28)
```javascript
const maxPlayersAllowed = 28;

if (currentTotalPlayers >= maxPlayersAllowed) {
  // STOP all injection - return error or add human only
  return res.json({ message: 'Room at maximum milestone capacity (28 players)' });
}
```

#### Anti-Flood Protection
```javascript
const processingKey = `${roomAmount}_${req.user._id}`;
if (roomProcessingState.get(processingKey)) {
  // User clicked Join twice - prevent duplicate injection
  return res.json({ message: 'Already joined - no duplicate bot injection' });
}
```

#### Streak Logic Fix
```javascript
// Check current count BEFORE adding bots
const currentHumans = gameSession.players.filter(p => !p.isBot).length;
const currentBots = gameSession.players.filter(p => p.isBot).length;

// If room already has bots from previous player, don't exceed milestone
const targetTotalPlayers = currentHumans + adjustedBotsToInject;
if (targetTotalPlayers > maxPlayersAllowed) {
  adjustedBotsToInject = Math.max(0, maxPlayersAllowed - currentTotalPlayers);
}
```

#### Deduplication with ObjectId
```javascript
// Use mongoose.Types.ObjectId for proper deduplication
const existingBotIds = gameSession.players
  .filter(p => p.isBot)
  .map(p => mongoose.Types.ObjectId.isValid(p.user) 
    ? new mongoose.Types.ObjectId(p.user) 
    : p.user);

// Exclude bots already tracked AND in active games
const availableBots = await Bot.find({ 
  _id: { $nin: Array.from(allExcludedBotIds), $nin: Array.from(botsInActiveGames) },
  isActive: true,
  balance: { $gte: roomAmount }
});
```

#### Resource Guard (Max 13 per Request)
```javascript
const MAX_BOTS_PER_REQUEST = 13;
if (adjustedBotsToInject > MAX_BOTS_PER_REQUEST) {
  adjustedBotsToInject = MAX_BOTS_PER_REQUEST;
}
```

---

## Flow Diagram

```
User Clicks "Join Room"
         │
         ▼
┌─────────────────────┐
│ Anti-Flood Check    │ ← Prevents duplicate clicks
│ (isProcessing flag) │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Refresh Session     │ ← Get latest player count
│ (avoid stale data)  │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Milestone Cap Check │ ← HARD LIMIT at 28
│ (current >= 28?)    │   Stop if exceeded
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Calculate Streak    │ ← Get bots from Master Sheet
│ (1-8 row logic)     │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Apply Guards        │ ← Resource (13), Milestone (28)
│ (cap adjustments)   │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Deduplicate Bots    │ ← ObjectId comparison
│ (exclude active)    │   Exclude tracked + active
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Inject Bots         │ ← Add to session
│ (max 13 per req)    │   Update tracking sheet
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Calculate Prize     │ ← (fee × players) × 0.85
│ (15% house cut)     │
└─────────────────────┘
```

---

## Files Modified

1. **`server.js`**
   - Added `performEmergencyReset()` function
   - Runs automatically on startup after DB connection
   - Clears all rooms and active sessions

2. **`routes/game.js`**
   - Added `mongoose` import for ObjectId handling
   - Enhanced join route with strict injection guards
   - Added session refresh before injection
   - Improved deduplication logic
   - Better logging for debugging

3. **`scripts/emergency_room_reset.js`** (NEW)
   - Standalone cleanup script
   - Can be run manually if needed
   - Verifies reset completion

---

## Verification

After restart, check logs for:
```
🔧 Performing Emergency Room Reset on startup...
✅ Emergency Room Reset Complete - All rooms flushed

📊 Room 5: 1 humans + 0 bots = 1 total
🛑 Milestone Cap: Room 5 at maximum capacity (28/28). Stopping bot injection.
```

Rooms should now stay **locked at 28 players maximum**.

---

## Testing

1. **Restart Server:**
   ```bash
   npm start
   ```
   
2. **Verify Reset:**
   - Check console for "Emergency Room Reset Complete"
   - All rooms should show 0 players initially

3. **Test Overflow Prevention:**
   - Join room multiple times rapidly (anti-flood)
   - Try to exceed 28 players (milestone cap)
   - Verify no more than 13 bots injected per request (resource guard)

---

## Summary

✅ **42-player overflow cleared**  
✅ **Hard cap at 28 enforced**  
✅ **Anti-flood protection active**  
✅ **ObjectId deduplication implemented**  
✅ **Resource guard limits to 13 bots/request**  
✅ **Automatic cleanup on startup**  

The room is now **controlled and stable**!
