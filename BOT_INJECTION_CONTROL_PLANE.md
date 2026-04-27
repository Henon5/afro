# 🎯 Bot Injection Control Plane

## Overview

This document describes the **Bot Injection Control Plane** - a deterministic system that controls exactly how many bots are injected into game rooms based on the number of human players. This ensures the prize pool calculation is always **atomic** and **predictable**.

## The Problem Solved

Previously, bot injection was random and unpredictable, causing:
- Prize pool calculations that didn't match player counts
- Inconsistent game room states
- Confusion about how many bots were actually in a game

## The Solution

A **control table** (`INJECTION_PLAN`) that defines exactly how many bots to inject for any given number of human players.

---

## 📊 Injection Control Table

| Human Players | Bots to Inject | Total Players | Room Strategy |
|---------------|----------------|---------------|---------------|
| 1 | 3 | 4 | Fill small room |
| 2 | 2 | 4 | Fill small room |
| 3 | 1 | 4 | Fill small room |
| 4 | 0 | 4 | Full room (no bots) |
| 5 | 3 | 8 | Fill medium room |
| 6 | 2 | 8 | Fill medium room |
| 7 | 1 | 8 | Fill medium room |
| 8 | 0 | 8 | Full room (no bots) |
| 9+ | 0 | 9+ | Manual override |

### Configuration

The injection plan is defined in `/utils/botInjectionPlane.js`:

```javascript
const INJECTION_PLAN = [
  { minHumans: 1, maxHumans: 1, botsToInject: 3, strategy: 'fill_small_room' },
  { minHumans: 2, maxHumans: 2, botsToInject: 2, strategy: 'fill_small_room' },
  { minHumans: 3, maxHumans: 3, botsToInject: 1, strategy: 'fill_small_room' },
  { minHumans: 4, maxHumans: 4, botsToInject: 0, strategy: 'no_bots_needed' },
  { minHumans: 5, maxHumans: 5, botsToInject: 3, strategy: 'fill_medium_room' },
  { minHumans: 6, maxHumans: 6, botsToInject: 2, strategy: 'fill_medium_room' },
  { minHumans: 7, maxHumans: 7, botsToInject: 1, strategy: 'fill_medium_room' },
  { minHumans: 8, maxHumans: 8, botsToInject: 0, strategy: 'no_bots_needed' },
  { minHumans: 9, maxHumans: 100, botsToInject: 0, strategy: 'manual_override' }
];
```

---

## 💰 Atomic Prize Calculation

The prize pool is now calculated using a **guaranteed formula**:

```
Prize Pool = (Human Count + Bot Count) × Entry Fee × 0.85
```

### Example Calculations

#### Example 1: 1 Human Player
- Humans: 1
- Bots Injected: 3 (from control table)
- Total Players: 4
- Entry Fee: 100 birr
- **Prize Pool**: 4 × 100 × 0.85 = **340 birr**
- House Commission: 4 × 100 × 0.15 = 60 birr

#### Example 2: 3 Human Players
- Humans: 3
- Bots Injected: 1 (from control table)
- Total Players: 4
- Entry Fee: 100 birr
- **Prize Pool**: 4 × 100 × 0.85 = **340 birr**
- House Commission: 4 × 100 × 0.15 = 60 birr

#### Example 3: 6 Human Players
- Humans: 6
- Bots Injected: 2 (from control table)
- Total Players: 8
- Entry Fee: 100 birr
- **Prize Pool**: 8 × 100 × 0.85 = **680 birr**
- House Commission: 8 × 100 × 0.15 = 120 birr

---

## 🔧 How It Works

### 1. Player Joins Room
When a human player joins a room:
```javascript
const currentHumanCount = gameSession.players.filter(p => !p.isBot).length;
const injectionPlan = getInjectionPlan(currentHumanCount);
const botsNeeded = injectionPlan.botsToInject;
```

### 2. Bot Injection
The system:
1. Checks the control table for how many bots to inject
2. Excludes already-tracked bots from selection
3. Selects available bots from database
4. Deducts entry fee from each bot's balance
5. Adds bots to the game session
6. **Tracks** each bot in the injection sheet

### 3. Prize Calculation
```javascript
const prizeCalculation = calculateAtomicPrize(humanCount, entryFee);
const calculatedPrizePool = prizeCalculation.netPrizePool;
// Result: (totalPlayers × entryFee) × 0.85
```

### 4. Game Completion Cleanup
When a game completes (bot win or human win):
```javascript
clearBotInjectionForRoom(roomAmount);
// Removes all tracked bots for this room from the injection sheet
```

---

## 📝 Bot Injection Tracking Sheet

The system maintains an in-memory tracking sheet:

```javascript
// Format: Map<roomId, Set<botId>>
const botInjectionSheet = new Map();
```

### Functions

| Function | Purpose |
|----------|---------|
| `trackBotInjection(roomId, botId)` | Add a bot to the tracking sheet |
| `getInjectedBotsInRoom(roomId)` | Get all bots in a room |
| `untrackBotInjection(roomId, botId)` | Remove a single bot |
| `clearBotInjectionForRoom(roomId)` | Clear all bots for a room |

### Why Track Bots?

Tracking prevents:
- **Double-counting**: Same bot injected multiple times
- **Memory leaks**: Stale bot data after game completion
- **Calculation errors**: Mismatch between displayed and actual player count

---

## 🚀 Usage

### For Developers

1. **Import the module**:
   ```javascript
   const { getInjectionPlan, calculateAtomicPrize } = require('../utils/botInjectionPlane');
   ```

2. **Get injection plan**:
   ```javascript
   const plan = getInjectionPlan(3); 
   // Returns: { botsToInject: 1, totalPlayers: 4, ruleApplied: 'fill_small_room' }
   ```

3. **Calculate prize**:
   ```javascript
   const prize = calculateAtomicPrize(3, 100);
   // Returns: { 
   //   humanCount: 3, 
   //   botsToInject: 1, 
   //   totalPlayers: 4, 
   //   netPrizePool: 340, 
   //   commission: 60 
   // }
   ```

### For Admins

To adjust bot injection rules:
1. Edit `/utils/botInjectionPlane.js`
2. Modify the `INJECTION_PLAN` array
3. Restart the server

---

## ✅ Verification Checklist

Before deploying, verify:

- [ ] All 50 bots have 1000 birr balance (run `node scripts/init_bots.js`)
- [ ] Prize pool matches formula: `(humans + bots) × fee × 0.85`
- [ ] Bot injection sheet clears after game completion
- [ ] No duplicate bots in same room
- [ ] Human player count + bot count = displayed player count

---

## 📈 Benefits

| Benefit | Description |
|---------|-------------|
| **Predictability** | Always know exactly how many bots will be injected |
| **Atomic Calculations** | Prize pool always matches player count |
| **Transparency** | Clear rules visible in code |
| **Debuggability** | Easy to trace injection decisions |
| **Configurability** | Change rules by editing one table |

---

## 🔮 Future Enhancements

Potential improvements:
- Dynamic adjustment based on time of day
- Different injection strategies per room tier
- Admin API to view/edit injection plan at runtime
- Analytics dashboard showing injection patterns

---

## See Also

- `BOT_INJECTION_IMPLEMENTATION.md` - Technical implementation details
- `scripts/init_bots.js` - Bot initialization script
- `routes/game.js` - Main game route with injection logic
