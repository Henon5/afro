# 🤖 Daily Bot Balance Reset System

## Overview
Implemented an automated system to reset all bot balances to 1000 ETB every 24 hours to prevent unlimited wealth accumulation and maintain game balance.

## Features

### 1. Automatic Daily Reset
- **Schedule**: Runs automatically at midnight (00:00 UTC) every day
- **Reset Amount**: All bots are reset to exactly 1000 ETB
- **Detailed Logging**: Every bot's state is logged before and after reset

### 2. Detailed Bot Statistics Logged
For each bot, the system logs:
- 📈 Previous Balance
- 🎯 Target Balance (1000 ETB)
- 💵 Change amount (+/-)
- 🏆 Total Wins
- 💰 Total Winnings (lifetime)
- 🎮 Games Played
- 📊 Win Rate
- ⚙️ Difficulty Level
- ✅ Active Status
- 🕐 Last Played timestamp
- 🕐 Last Refill timestamp
- 🔄 Refill Count

### 3. Admin API Endpoints

#### Get All Bots Status
```bash
GET /api/admin/bots/status
```
Returns detailed statistics for all bots including balance, wins, games played, etc.

#### Manual Reset Now
```bash
POST /api/admin/bots/reset-now
```
Immediately resets all bot balances to 1000 ETB with detailed results.

#### Schedule/Stop Daily Reset
```bash
POST /api/admin/bots/schedule-reset
Body: { "action": "start", "hour": 0, "minute": 0 }
Body: { "action": "stop" }
```
Start or stop the daily reset scheduler with custom time.

#### Get Reset Status
```bash
GET /api/admin/bots/reset-status
```
Check if the daily reset scheduler is currently running.

## Implementation Details

### Files Modified

1. **utils/botManager.js**
   - Added `resetBotBalancesDaily()` - Main reset function with detailed logging
   - Added `startDailyBotReset(hour, minute)` - Scheduler initialization
   - Added `stopDailyBotReset()` - Stop the scheduler
   - Added `getBotResetStatus()` - Check scheduler status
   - Exported all new functions

2. **routes/admin.js**
   - Added GET `/bots/status` endpoint
   - Added POST `/bots/reset-now` endpoint
   - Added POST `/bots/schedule-reset` endpoint
   - Added GET `/bots/reset-status` endpoint

3. **server.js**
   - Imports `startDailyBotReset` from botManager
   - Automatically starts daily reset scheduler on server startup (midnight UTC)
   - Exports app and server instances

## Example Output

```
🔄 ========================================
🔄 STARTING DAILY BOT BALANCE RESET
🔄 ========================================

📊 Found 50 bots to process

----------------------------------------
🤖 Bot: Abebe (bot_1000000000)
   📈 Previous Balance: 15420 ETB
   🎯 Target Balance: 1000 ETB
   💵 Change: -14420 ETB
   🏆 Total Wins: 23
   💰 Total Winnings (lifetime): 45890 ETB
   🎮 Games Played: 156
   📊 Win Rate: 14.74%
   ⚙️  Difficulty: easy
   ✅ Active: true
   🕐 Last Played: 2025-05-07T18:30:00.000Z
   🕐 Last Refill: 2025-05-06T00:00:00.000Z
   🔄 Refill Count: 5
   ✅ Balance reset successfully
   🆕 New Balance: 1000 ETB

... (repeated for all 50 bots)

🔄 ========================================
🔄 DAILY BOT BALANCE RESET COMPLETE
🔄 ========================================
📊 Total Bots Processed: 50
💵 Total Amount Reset: 721500 ETB
🕐 Reset Time: 2025-05-08T00:00:00.000Z
🔄 ========================================
```

## Usage Examples

### Using cURL

1. **View all bot stats:**
```bash
curl -H "x-admin-auth: {\"masterId\":\"your_id\",\"secureCode\":\"your_code\",\"securityKey\":\"your_key\"}" \
  https://your-server.com/api/admin/bots/status
```

2. **Reset bots immediately:**
```bash
curl -X POST -H "x-admin-auth: {\"masterId\":\"your_id\",\"secureCode\":\"your_code\",\"securityKey\":\"your_key\"}" \
  https://your-server.com/api/admin/bots/reset-now
```

3. **Schedule reset for 3:30 AM:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -H "x-admin-auth: {\"masterId\":\"your_id\",\"secureCode\":\"your_code\",\"securityKey\":\"your_key\"}" \
  -d '{"action":"start","hour":3,"minute":30}' \
  https://your-server.com/api/admin/bots/schedule-reset
```

4. **Stop the scheduler:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -H "x-admin-auth: {\"masterId\":\"your_id\",\"secureCode\":\"your_code\",\"securityKey\":\"your_key\"}" \
  -d '{"action":"stop"}' \
  https://your-server.com/api/admin/bots/schedule-reset
```

5. **Check scheduler status:**
```bash
curl -H "x-admin-auth: {\"masterId\":\"your_id\",\"secureCode\":\"your_code\",\"securityKey\":\"your_key\"}" \
  https://your-server.com/api/admin/bots/reset-status
```

## Benefits

1. **Game Balance**: Prevents bots from accumulating unlimited wealth
2. **Fair Competition**: Ensures bots compete at similar levels as human players
3. **Transparency**: Detailed logs show exactly what happened during each reset
4. **Admin Control**: Full control over scheduling and manual resets
5. **Automation**: Runs automatically without manual intervention
6. **Audit Trail**: Tracks refill count and history for each bot

## Testing

All existing tests pass:
- ✅ 83 tests passing
- ✅ No breaking changes to existing functionality
- ✅ Code syntax validated

## Notes

- The scheduler starts automatically when the server starts
- Default schedule is midnight UTC (00:00)
- Can be customized via admin API
- Each reset increments the bot's `refillCount` field
- The `lastRefill` timestamp is updated on each reset
