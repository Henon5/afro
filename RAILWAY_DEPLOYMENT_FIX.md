# Railway Deployment Fix Guide

## Problem Diagnosis

The npm start command on Railway was failing due to:

1. **Invalid Admin Token Handling**: Corrupted tokens were causing JSON parse errors
2. **Missing Environment Variables**: `.env` file uses placeholders that need to be set in Railway
3. **Token Validation Issues**: Base64 decoding was attempting to decode non-base64 data

## Fixes Applied

### 1. Enhanced Token Validation (`middleware/auth.js`)

Added strict base64 format validation before attempting to decode:

```javascript
// First check if token looks like base64 (only alphanumeric + /+=)
if (!/^[A-Za-z0-9+/=]+$/.test(token)) {
  console.warn('⚠️ Invalid token encoding: not valid base64');
  throw new Error('Invalid token encoding');
}
```

This prevents the `SyntaxError: Unexpected token ''` errors seen in logs.

### 2. Environment Variables Setup

**CRITICAL**: You MUST set these environment variables in Railway Dashboard:

1. Go to your Railway project → Settings → Variables
2. Add the following variables:

```bash
# MongoDB Connection (REQUIRED)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/afro-bingo?retryWrites=true&w=majority

# JWT Secret (REQUIRED - generate a strong random string)
JWT_SECRET=your-super-secret-random-string-min-32-chars

# Telegram Bot Token (REQUIRED for auth)
TELEGRAM_BOT_TOKEN=1234567890:AABBccDDeeFFggHHiiJJkkLLmmNNooP

# Admin Credentials (REQUIRED - change defaults!)
ADMIN_MASTER_ID=YourCustomAdminID
ADMIN_SECURE_CODE=YourSecureCode123
ADMIN_SECURITY_KEY=YourSecurityKey456

# Optional Configuration
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://your-domain.com
HOUSE_COMMISSION=0.15
MIN_DEPOSIT=20
MIN_WITHDRAWAL=10
MAX_WITHDRAWAL=5000
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

### 3. How to Generate Secure Secrets

**JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Admin Credentials:**
```bash
# For ADMIN_SECURE_CODE
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# For ADMIN_SECURITY_KEY  
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

## Railway Configuration Steps

### Step 1: Connect Your Repository
1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository

### Step 2: Configure Environment Variables
1. Click on your project
2. Go to "Variables" tab
3. Add all required variables listed above
4. **Do NOT use the `.env` file** - Railway uses its own variable system

### Step 3: Verify Build Configuration
Railway should auto-detect Node.js. If not, create `railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Step 4: Deploy
1. Click "Deploy"
2. Wait for build to complete (~2-3 minutes)
3. Check logs for any errors

## Troubleshooting

### Issue: "Cannot find module"
**Solution**: Ensure `package.json` is in root directory and all dependencies are listed

### Issue: "MongoDB connection failed"
**Solution**: 
1. Verify MONGODB_URI is correct
2. Check MongoDB Atlas IP whitelist includes Railway IPs (or allow all: 0.0.0.0/0)
3. Ensure database user has read/write permissions

### Issue: "Port already in use"
**Solution**: Railway sets PORT automatically. Remove hardcoded port in server.js:

```javascript
// Use this pattern:
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
```

### Issue: Admin token errors persist
**Solution**: 
1. Clear browser localStorage
2. Re-login to admin panel with correct credentials
3. Check Railway logs for detailed error messages

## Testing Deployment

1. **Check Health Endpoint:**
```bash
curl https://your-railway-app.up.railway.app/api/health
```

2. **Test Admin Login:**
- Open admin panel
- Login with credentials set in Railway variables
- Verify you can access dashboard

3. **Monitor Logs:**
```bash
# In Railway dashboard → Logs tab
# Look for: "🚀 Server running on port XXXX"
# And: "✅ MongoDB Connected"
```

## Security Checklist

- [ ] Changed default admin credentials
- [ ] Generated strong JWT secret (32+ chars)
- [ ] Set MongoDB connection string
- [ ] Added Telegram bot token
- [ ] Removed `.env` from git (should be in .gitignore)
- [ ] Enabled HTTPS (automatic on Railway)
- [ ] Configured CORS for your domain

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `SyntaxError: Unexpected token` | Corrupted admin token | Clear localStorage, re-login |
| `MongoNetworkError` | Wrong MongoDB URI | Check connection string in Railway vars |
| `EADDRINUSE` | Port conflict | Use `process.env.PORT` |
| `Cannot find module` | Missing dependency | Run `npm install` locally, commit package-lock.json |
| `Timeout` | Slow startup | Increase Railway timeout in settings |

## Next Steps After Deployment

1. Test all endpoints with Postman/curl
2. Set up monitoring (Railway has built-in metrics)
3. Configure custom domain (optional)
4. Set up automated backups for MongoDB
5. Enable rate limiting in production

## Support

If issues persist:
1. Check Railway logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test locally with same environment variables
4. Review server.js startup sequence

---

**Last Updated**: 2024
**Status**: ✅ Fixed - Token validation improved, deployment guide added
