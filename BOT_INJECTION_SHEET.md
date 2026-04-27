# Bot Injection Control Sheet

## Overview
This document tracks bot injection into game rooms to ensure atomic prize calculations. The prize pool must always equal `(entryFee × totalPlayers) × 0.85` where `totalPlayers = humans + injected bots`.

## Milestone System

### Master Milestones
Bots are injected to reach the next milestone when human players join:
- **Milestone 1**: 8 players
- **Milestone 2**: 14 players
- **Milestone 3**: 20 players
- **Milestone 4**: 28 players

### Prize Calculation Formula
```
Prize Pool = (Entry Fee × Total Players) × 0.85
House Cut  = (Entry Fee × Total Players) × 0.15
```

## Bot Injection Tracking

### How It Works

1. **Bot Injection Sheet** - An in-memory Map tracks which bots are injected into which rooms:
   ```javascript
   botInjectionSheet = new Map(); // Key: roomAmount, Value: Set of bot telegramIds
   ```

2. **When a Human Joins**:
   - Calculate current human count
   - Find next milestone target
   - Determine bots needed: `botsNeeded = milestone - humanCount`
   - Select available bots (excluding already tracked bots)
   - Deduct entry fee from each bot's balance
   - Add bots to game session
   - **Track bots in the injection sheet**

3. **When Game Completes** (win or loss):
   - Clear all bot injections for that room from the tracking sheet
   - Reset room pool

### Room Amounts and Expected Behavior

| Room Amount | Min Players | Max Players | House Cut % |
|-------------|-------------|-------------|-------------|
| 10 birr     | 8           | 28          | 15%         |
| 50 birr     | 8           | 28          | 15%         |
| 100 birr    | 8           | 28          | 15%         |
| 500 birr    | 8           | 28          | 15%         |

### Example Scenarios

#### Scenario 1: First Human Joins (Room: 10 birr)
- Human count: 1
- Next milestone: 8
- Bots injected: 7
- Total players: 8
- Prize pool: (10 × 8) × 0.85 = **68 birr**
- House cut: 80 - 68 = **12 birr**

#### Scenario 2: Second Human Joins Existing Game
- Human count: 2
- Tracked bots: 7 (from previous injection)
- Total players shown: 2 + 7 = 9
- Next milestone: 14
- Additional bots needed: 14 - 9 = 5 (but we already have 7 tracked)
- Since 9 > 8 (current milestone), no new bots needed
- Prize pool: (10 × 9) × 0.85 = **76.5 → 76 birr** (rounded down)

#### Scenario 3: Nine Humans Join (Room: 50 birr)
- Human count: 9
- Next milestone: 14
- Bots injected: 5
- Total players: 14
- Prize pool: (50 × 14) × 0.85 = **595 birr**
- House cut: 700 - 595 = **105 birr**

## Bot Balance Management

### Initial Setup
All 50 bots start with **1000 birr** each.

### Running the Initialization Script
```bash
node scripts/init_bots.js
```

This script will:
1. Connect to MongoDB
2. Create/update all 50 bots
3. Set each bot's balance to 1000 birr
4. Reset win/loss statistics
5. Set difficulty levels:
   - Bots 1-15: Easy
   - Bots 16-35: Medium
   - Bots 36-50: Hard

### Bot Entry Fee Deduction
When a bot is injected into a game:
- Bot's balance is decremented by the room entry fee
- This happens atomically using `findOneAndUpdate` with balance check
- Bot cannot join if balance < entry fee

### Bot Winnings
When a bot wins:
- Bot receives the full prize pool
- Bot's balance is incremented
- Win statistics are updated

## API Endpoints

### Initialize Bots (Admin Only)
```http
POST /api/game/bots/init
Authorization: Bearer <admin_token>
```

### Get All Bots Status (Admin Only)
```http
GET /api/game/bots
Authorization: Bearer <admin_token>
```

Response:
```json
{
  "success": true,
  "bots": [
    {
      "_id": "...",
      "name": "Abebe",
      "telegramId": "bot_1000000000",
      "balance": 1000,
      "totalWins": 0,
      "totalWinnings": 0,
      "gamesPlayed": 0,
      "isActive": true,
      "difficulty": "easy"
    }
  ]
}
```

## Verification Checklist

Before deploying, verify:

- [ ] All 50 bots exist in database
- [ ] All bots have exactly 1000 birr balance
- [ ] Bot injection tracking is working (check memory)
- [ ] Prize pool calculation matches formula
- [ ] House cut is exactly 15%
- [ ] Player count displayed includes both humans and bots
- [ ] Bot balances are deducted on injection
- [ ] Bot balances are credited on win
- [ ] Injection tracking clears on game completion

## Troubleshooting

### Issue: Prize pool doesn't match player count
**Solution**: Check that `totalPlayers` includes both humans AND tracked bots before calculating prize.

### Issue: Same bots being reused repeatedly
**Solution**: Verify the injection sheet is properly excluding already-tracked bots.

### Issue: Bot balance goes negative
**Solution**: Ensure atomic update with `$gte` condition is in place.

### Issue: Memory leak from injection sheet
**Solution**: Verify `clearBotInjectionForRoom()` is called on every game completion.

## Code References

- **Injection Tracking Functions**: `routes/game.js` lines 115-163
- **Bot Injection Logic**: `routes/game.js` lines 264-315
- **Prize Calculation**: `routes/game.js` lines 90-99
- **Bot Balance Deduction**: `routes/game.js` lines 20-37
- **Game Completion Cleanup**: `routes/game.js` lines 478-479, 547-548
- **Initialization Script**: `scripts/init_bots.js`
