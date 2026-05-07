# 🔧 Render Deployment Fix Guide

## Problem Diagnosis
You're experiencing **"Authentication Failed"** errors and **Telegram token not activating** on your Render deployment at `https://afro-pxbt.onrender.com`.

## Root Causes Identified

### 1. ❌ Missing Environment Variables on Render
Your backend code requires these critical environment variables that must be set in the Render Dashboard:

| Variable | Purpose | Required For |
|----------|---------|--------------|
| `TELEGRAM_BOT_TOKEN` | Validates Telegram WebApp initData | Telegram Authentication |
| `JWT_SECRET` | Signs/verifies JWT tokens | Session Management |
| `MONGODB_URI` | Database connection | All Data Operations |
| `ADMIN_SECRET_KEY` | Admin API authentication | Admin Panel Access |
| `ADMIN_MASTER_ID` | Admin credential validation | Admin Login |
| `ADMIN_SECURE_CODE` | Admin credential validation | Admin Login |
| `ADMIN_SECURITY_KEY` | Admin credential validation | Admin Login |
| `ADMIN_IDS` | List of admin Telegram IDs | Admin Authorization |

### 2. ⚠️ CORS Configuration Issue
The server was only allowing requests from `https://henon5.github.io`, blocking your Render domain.

### 3. 🛡️ Content Security Policy (CSP) Restrictions
Helmet CSP headers didn't include your Render URL, potentially blocking frontend-backend communication.

---

## ✅ Fixes Applied

### Fix 1: Updated CORS Configuration
**File:** `server.js`
```javascript
// Before
app.use(cors({ 
  origin: 'https://henon5.github.io', 
  credentials: true 
}));

// After
app.use(cors({ 
  origin: ['https://henon5.github.io', 'https://afro-pxbt.onrender.com'], 
  credentials: true 
}));
```

### Fix 2: Updated Content Security Policy
**File:** `server.js`
Added `https://afro-pxbt.onrender.com` to all CSP directives:
- `scriptSrc`
- `scriptSrcElem`
- `styleSrc`
- `connectSrc`
- `frameAncestors`

### Fix 3: Updated Environment Variable Template
**File:** `.env.example`
Added missing variables:
- `TELEGRAM_BOT_TOKEN` (Critical for Telegram auth)
- `ADMIN_SECRET_KEY` (Required for admin token validation)

---

## 🚀 Action Required: Set Environment Variables on Render

### Step-by-Step Instructions:

1. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com
   - Select your service: `afro-pxbt`

2. **Navigate to Environment Tab**
   - Click on the **"Environment"** tab in your service dashboard

3. **Add These Variables** (Click "Add Environment Variable" for each):

```bash
# MongoDB Connection (REQUIRED)
MONGODB_URI=mongodb+srv://your-username:your-password@cluster.mongodb.net/afro-bingo?retryWrites=true&w=majority

# JWT Secret (REQUIRED - use a random secure string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Telegram Bot Token (REQUIRED for Telegram Auth)
TELEGRAM_BOT_TOKEN=1234567890:AABBccDDeeFFggHHiiJJkkLLmmNNooP

# Admin Credentials (REQUIRED for Admin Panel)
ADMIN_MASTER_ID=MasterAdmin
ADMIN_SECURE_CODE=SECURE123
ADMIN_SECURITY_KEY=GOLDENKEY
ADMIN_SECRET_KEY=YOUR_ADMIN_SECRET_KEY_HERE
ADMIN_IDS=685983288

# Optional: Game Configuration
HOUSE_COMMISSION=0.15
MIN_DEPOSIT=20
MIN_WITHDRAWAL=10
MAX_WITHDRAWAL=5000
```

4. **Save Changes**
   - Click **"Save Changes"** at the bottom
   - Render will automatically redeploy with new variables

---

## 🔍 How to Get Your Values

### Getting TELEGRAM_BOT_TOKEN:
1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow prompts to create a bot
4. Copy the token (looks like: `1234567890:AABBccDDeeFFggHHiiJJkkLLmmNNooP`)

### Getting MONGODB_URI:
1. Go to https://mongodb.com/cloud/atlas
2. Connect to your cluster
3. Click "Connect" → "Connect your application"
4. Copy the connection string
5. Replace `<password>` with your actual password

### Generating JWT_SECRET:
Use a random string generator or run this in Node.js:
```javascript
require('crypto').randomBytes(64).toString('hex')
```

---

## 📊 Verification Steps

### 1. Check Render Logs
After setting environment variables:
1. Go to Render Dashboard → Your Service → **Logs**
2. Look for these success messages:
   ```
   ✅ MongoDB Connected: cluster.mongodb.net
   🚀 Server running on port 3000
   ```
3. Watch for errors like:
   - `❌ CRITICAL: TELEGRAM_BOT_TOKEN not set`
   - `❌ CRITICAL: No JWT Secret found`
   - `❌ Database connection error`

### 2. Test Health Endpoint
Visit: `https://afro-pxbt.onrender.com/health`
Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### 3. Test Authentication
Try logging in via Telegram WebApp. If successful, you should see:
- No "Authentication Failed" error
- User data properly saved to database
- Session token generated

---

## 🐛 Common Issues & Solutions

### Issue: "Token not found" Error
**Cause:** Missing `JWT_SECRET` environment variable
**Solution:** Add `JWT_SECRET` to Render Environment Variables

### Issue: "Invalid Telegram data" Error
**Cause:** Missing or incorrect `TELEGRAM_BOT_TOKEN`
**Solution:** 
1. Verify bot token is correct (no extra spaces)
2. Ensure bot is not deleted/banned by Telegram
3. Check logs for verification errors

### Issue: "Database connection failed"
**Cause:** Invalid `MONGODB_URI` or MongoDB Atlas IP whitelist
**Solution:**
1. Verify connection string format
2. Add `0.0.0.0/0` to MongoDB Atlas Network Access (for testing)
3. Check MongoDB user credentials

### Issue: CORS Errors in Browser Console
**Cause:** Frontend domain not in CORS allowlist
**Solution:** Already fixed! Added `https://afro-pxbt.onrender.com` to CORS origins

---

## 📝 Code Changes Summary

| File | Change | Impact |
|------|--------|--------|
| `server.js` | Updated CORS to allow Render domain | ✅ Fixes cross-origin requests |
| `server.js` | Updated Helmet CSP to include Render URL | ✅ Prevents CSP violations |
| `server.js` | Changed comment from Railway to Render | 📝 Documentation only |
| `.env.example` | Added `TELEGRAM_BOT_TOKEN` | 📋 Documents required variable |
| `.env.example` | Added `ADMIN_SECRET_KEY` | 📋 Documents required variable |

---

## 🎯 Next Steps

1. ✅ **Set all environment variables** in Render Dashboard (see above)
2. ✅ **Wait for redeployment** (usually 1-2 minutes)
3. ✅ **Check logs** for any errors
4. ✅ **Test health endpoint**: `https://afro-pxbt.onrender.com/health`
5. ✅ **Test Telegram login** from your frontend

---

## 📞 Support Checklist

If issues persist, provide these details when seeking help:
- [ ] Screenshot of Render Environment Variables (hide secrets)
- [ ] Recent Render Logs (last 50 lines)
- [ ] Browser console errors (F12 → Console tab)
- [ ] Health endpoint response
- [ ] Exact error message text

---

**Status:** ✅ Code fixes applied. **Action Required:** Set environment variables on Render.
