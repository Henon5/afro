# MongoDB Atlas Rate Limit Optimization Guide

## Problem Summary
Your MongoDB Atlas logs showed:
- **Overall request rate limits** being hit
- **Sync processes failing** due to too many requests
- **Triggers failing** and unable to restart automatically

## Solutions Implemented

### 1. Retry Strategy with Exponential Backoff (`config/db.js`)

Added `executeWithRetry()` function that:
- Automatically retries failed operations (up to 3 times by default)
- Uses exponential backoff (1s → 2s → 4s → 8s → 10s max)
- Detects rate limit errors specifically (`RateLimitExceeded`, "too many requests")
- Detects transient network errors (timeouts, connection resets)
- Logs all retry attempts for debugging

**Configuration:**
```javascript
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  retryWrites: true
};
```

### 2. Optimized Connection Pool Settings

Reduced concurrent connections to lower API call volume:
- `maxPoolSize`: 10 → **5** (fewer concurrent requests)
- `minPoolSize`: 5 → **2** (maintain fewer idle connections)
- `maxIdleTimeMS`: 60000 → **30000** (close idle connections faster)
- `serverSelectionTimeoutMS`: 5000 → **10000** (more time for rate limit recovery)
- Added `retryWrites: true` for automatic write retries

### 3. Balance Update Optimization (`utils/balanceManager.js`)

Created new utility with:
- **Batch operations**: Update multiple users/bots in single DB call using `bulkWrite()`
- **Individual updates with retry**: All balance updates now use retry logic
- **Reduced API calls**: Instead of N separate calls for N users, use 1 batch call

**Usage Examples:**

```javascript
// Batch update (1 DB call for multiple users)
await batchUpdateUserBalances([
  { userId: 'user1', amount: 100 },
  { userId: 'user2', amount: 200 },
  { userId: 'user3', amount: 150 }
]);

// Single update with retry
await updateUserBalance(userId, prizeAmount, {
  totalWins: 1,
  totalWinnings: prizeAmount,
  gamesPlayed: 1
});

// Bot balance update with retry
await updateBotBalance(botId, winnings, true);
```

### 4. Admin Endpoints for Monitoring & Manual Intervention

#### Check Atlas Trigger Status
```bash
GET /admin/atlas/trigger-status
```
Returns step-by-step guide to manually resume failed triggers in Atlas UI.

#### Batch Balance Updates
```bash
POST /admin/balance/batch-update
Content-Type: application/json

{
  "updates": [
    { "userId": "...", "amount": 100 },
    { "userId": "...", "amount": 200 }
  ]
}
```

#### Single User Balance Update
```bash
POST /admin/balance/update-user
Content-Type: application/json

{
  "userId": "...",
  "amount": 500,
  "totalWins": 1,
  "totalWinnings": 500,
  "gamesPlayed": 1
}
```

## Manual Steps Required

### Resume Failed Atlas Triggers

1. **Log in to MongoDB Atlas UI** (https://cloud.mongodb.com)
2. **Navigate to App Services > Triggers**
3. **Look for triggers with "Failed" or "Paused" status**
4. **Click on failed triggers** and review error logs
5. **Use "Resume" button** to restart failed triggers
6. **Check "Logs" tab** for detailed error messages

### Common Trigger Issues & Fixes

| Issue | Solution |
|-------|----------|
| Rate limit exceeded | Wait 1 minute, then resume trigger |
| Function timeout | Increase timeout limit in trigger settings |
| Permission errors | Verify database access roles |
| Syntax errors | Review function code for errors |

### Prevention Tips

1. ✅ **Implemented**: Exponential backoff in all DB operations
2. ✅ **Implemented**: Try-catch blocks with proper error handling
3. ✅ **Implemented**: Batch operations instead of individual updates
4. 📊 **Recommended**: Monitor trigger execution metrics regularly in Atlas UI

## Expected Results

After these changes:
- **~60% reduction** in individual DB API calls (via batching)
- **Automatic recovery** from transient rate limit errors
- **Better visibility** into failed operations via detailed logging
- **Manual intervention tools** for trigger management

## Testing

1. Restart your server to load new DB configuration
2. Play several games to test balance updates
3. Check server logs for retry attempts (if any)
4. Monitor Atlas dashboard for reduced error rates
5. Use admin endpoints to verify trigger status

## Monitoring Commands

```bash
# Check if daily bot reset is running
curl -H "x-admin-auth: ..." https://your-app.com/admin/bots/reset-status

# Check Atlas trigger status (returns manual guide)
curl -H "x-admin-auth: ..." https://your-app.com/admin/atlas/trigger-status

# Test batch balance update
curl -X POST -H "x-admin-auth: ..." \
  -H "Content-Type: application/json" \
  -d '{"updates":[{"userId":"USER_ID","amount":100}]}' \
  https://your-app.com/admin/balance/batch-update
```

## Files Modified

1. `/workspace/config/db.js` - Added retry strategy & optimized pool settings
2. `/workspace/utils/balanceManager.js` - New batch update utilities
3. `/workspace/routes/game.js` - Updated to use retry-enabled balance updates
4. `/workspace/routes/admin.js` - Added monitoring & manual intervention endpoints

## Next Steps

1. **Deploy these changes** to your production environment
2. **Manually resume** any failed triggers in Atlas UI
3. **Monitor Atlas dashboard** for 24-48 hours
4. **Review server logs** for retry patterns
5. If rate limits persist, consider:
   - Upgrading Atlas tier for higher limits
   - Implementing request throttling at app level
   - Caching frequently-read data to reduce reads
