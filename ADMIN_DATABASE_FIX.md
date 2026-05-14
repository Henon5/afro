# Admin Account Database Integration - Complete Fix

## Summary
Fixed the admin account system to store admin users in the database just like regular players, enabling profile updates and balance management.

## Problem
Previously, admin users were authenticated with a mock user object (`_id: 'admin'`) that had no database record. This caused:
- ❌ Profile updates failed with "Admin profiles cannot be updated via this endpoint"
- ❌ Balance was hardcoded to 0
- ❌ No persistence of admin data
- ❌ Admin couldn't play games or use features requiring DB records

## Solution
Modified the authentication middleware to create/find a real database record for admin users using their Telegram ID (ADMIN_MASTER_ID).

## Changes Made

### 1. `/workspace/middleware/auth.js`

**Case 3: Admin authentication via x-admin-auth header**
- Changed from creating mock user object to `User.findOneAndUpdate()` with upsert
- Admin user now has real `_id`, `balance: 500000`, and all standard user fields
- Uses `ADMIN_MASTER_ID` as the `telegramId` for lookup

**Case 4: JWT authentication (admin tokens)**
- Same change: replaced mock object with database lookup/creation
- Ensures admin users authenticated via JWT also have DB records

**Case 5: Admin authentication via x-admin-token header**
- Same change: replaced mock object with database lookup/creation
- All three admin auth methods now create proper DB records

### 2. `/workspace/routes/user.js`

**GET /api/user endpoint:**
- Removed special case for `req.isAdminAuth` 
- Now fetches admin profile from database like regular users
- Returns actual balance and profile data from DB

**GET /api/user/balance endpoint:**
- Removed special case for admin users
- Now returns real balance from database

**PUT /api/user/profile endpoint:**
- Removed blocks preventing admin profile updates
- Now allows admins to update their profiles like regular users
- Still validates ObjectId format (which admin now has)

### 3. `/workspace/routes/auth.js`

**POST /auth/verify endpoint:**
- Added null check for user
- Added `isAdmin` field to response
- Now works for both regular users and admin users

## How It Works

1. **Admin Login**: When admin authenticates via any method (x-admin-auth, JWT, or x-admin-token):
   - System looks up user by `telegramId: ADMIN_MASTER_ID`
   - If not found, creates new user with:
     - `username: 'admin'`
     - `firstName: 'Admin'`
     - `isAdmin: true`
     - `balance: 500000` (initial balance)
     - `gamesPlayed: 0`
     - `totalWins: 0`
   - If found, updates `lastActive` timestamp

2. **Profile Access**: Admin can now:
   - View their profile with real data from DB
   - Update profile fields (name, phone, telegram handle)
   - See and manage their balance
   - Play games (if other route restrictions are lifted)

3. **Database Structure**: Admin user document looks like:
```javascript
{
  _id: ObjectId("..."), // Real MongoDB ObjectId
  telegramId: "685983288", // ADMIN_MASTER_ID
  username: "admin",
  firstName: "Admin",
  isAdmin: true,
  balance: 500000,
  gamesPlayed: 0,
  totalWins: 0,
  lastActive: Date
}
```

## Benefits

✅ Admin accounts now persist in database
✅ Profile updates work for admin users
✅ Balance is tracked and can be modified
✅ Admin can use all player features (if permitted)
✅ Consistent user model for all users
✅ No more mock objects or special cases
✅ Better audit trail for admin activities

## Testing

All existing tests pass:
```
Test Suites: 6 passed, 6 total
Tests:       83 passed, 83 total
```

## Deployment Steps

1. Deploy updated code to production
2. First admin login will automatically create DB record
3. Admin can then update profile and see balance
4. Monitor logs to verify successful creation

## Migration (Optional)

If you want to pre-create the admin user or transfer existing data:

```bash
node scripts/update_admin.js
```

This script will:
- Find admin by telegramId (ADMIN_MASTER_ID)
- Create if doesn't exist with 500,000 balance
- Update isAdmin flag if needed

## Notes

- Admin initial balance: 500,000 ETB (configurable in auth.js)
- Admin identified by telegramId = ADMIN_MASTER_ID environment variable
- All admin authentication methods now use the same DB record
- Admin status determined by `isAdmin: true` field in database
