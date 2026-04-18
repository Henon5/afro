# 🔧 Configuration Guide for AFRO-BINGO

## ⚠️ CRITICAL: Backend URL Configuration

Your frontend is currently trying to connect to `https://henon5.github.io/api`, but **GitHub Pages cannot host your Node.js backend**. You need to deploy your backend separately and configure the URL.

---

## 🚀 Quick Fix (3 Steps)

### Step 1: Deploy Your Backend

Choose ONE of these free/cheap hosting services:

| Service | Free Tier | Setup Time | URL Format |
|---------|-----------|------------|------------|
| **Railway** | $5 credit/month | 5 min | `https://your-app.up.railway.app` |
| **Render** | Yes (with limitations) | 10 min | `https://your-app.onrender.com` |
| **Vercel** | Yes | 10 min | `https://your-app.vercel.app` |
| **Fly.io** | Free tier | 15 min | `https://your-app.fly.dev` |

**Recommended: Railway** (easiest for Node.js + MongoDB)

#### Deploy to Railway:
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login to Railway
railway login

# 3. Initialize your project
railway init

# 4. Add environment variables
railway variables set MONGODB_URI="your-mongodb-atlas-uri"
railway variables set JWT_SECRET="your-secret-key"
railway variables set ADMIN_ID="MasterAdmin"
railway variables set ADMIN_PASS="SECURE123"
railway variables set HOUSE_COMMISSION="0.15"

# 5. Deploy
railway up
```

Railway will give you a URL like: `https://afro-bingo-production.up.railway.app`

---

### Step 2: Update Frontend Configuration

Open `index.html` and find this section (around line 992):

```javascript
const BACKEND_URL = ''; // ← PUT YOUR BACKEND URL HERE
```

**Replace it with your actual backend URL:**

```javascript
const BACKEND_URL = 'https://afro-bingo-production.up.railway.app/api';
```

**Examples:**
- Railway: `'https://your-app.up.railway.app/api'`
- Render: `'https://your-app.onrender.com/api'`
- Vercel: `'https://your-app.vercel.app/api'`

---

### Step 3: Commit and Push

```bash
git add index.html
git commit -m "Configure backend URL for production"
git push origin main
```

Wait 2-3 minutes for GitHub Pages to redeploy, then test your app!

---

## 🧪 Testing Your Backend

Before configuring, verify your backend is working:

### Test Locally:
```bash
# Start your backend
node server.js

# In another terminal, test the API
curl http://localhost:3000/api/user
```

Expected response: JSON data or authentication error (not HTML!)

### Test Production Backend:
```bash
# Replace with your actual URL
curl https://your-backend-url.com/api/user
```

If you get JSON → ✅ Backend is working!  
If you get HTML → ❌ Backend is not deployed correctly

---

## 🔐 Required Environment Variables

Your backend needs these environment variables set:

```bash
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/afro-bingo

# Security
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# Admin Credentials
ADMIN_ID=MasterAdmin
ADMIN_PASS=SECURE123

# Game Settings
HOUSE_COMMISSION=0.15
MIN_BET=50
MAX_BET=5000

# Optional: Telegram Bot Token (for notifications)
TELEGRAM_BOT_TOKEN=your-bot-token
```

---

## 📱 Updating Telegram Bot

After deployment:

1. Open Telegram and go to [@BotFather](https://t.me/BotFather)
2. Send `/mybots` and select your bot
3. Choose **Bot Settings** → **Menu Button** → **Configure Menu Button**
4. Send your new URL: `https://your-backend-url.com` (frontend URL from GitHub Pages)
5. Give it a title: "Play Afro-Bingo"

---

## 🆘 Troubleshooting

### Error: "404 Not Found" on /api/user
- ❌ Backend URL is wrong or backend is not running
- ✅ Check that your backend is deployed and accessible
- ✅ Verify the URL in `BACKEND_URL` constant

### Error: "405 Method Not Allowed"
- ❌ Trying to POST to a static file (GitHub Pages issue)
- ✅ Make sure `BACKEND_URL` points to your backend, not GitHub Pages

### Error: "Unexpected token '<'"
- ❌ Server returned HTML instead of JSON
- ✅ Your backend might be returning an error page
- ✅ Check browser console for the full error message

### Telegram warnings about v6.0
- ℹ️ These are just warnings, not errors
- ✅ The app still works on old Telegram versions
- ✅ Features like BackButton gracefully degrade

---

## 🎯 Architecture Overview

```
┌─────────────────────┐
│   Telegram Users    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  GitHub Pages       │  ← Static Frontend (HTML/CSS/JS)
│  (henon5.github.io) │     Serves index.html
└──────────┬──────────┘
           │ API Calls
           ▼
┌─────────────────────┐
│  Railway/Render     │  ← Node.js Backend (server.js)
│  (your-app.com)     │     Handles /api/* routes
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  MongoDB Atlas      │  ← Database
│  (cloud)            │     Stores users, games, etc.
└─────────────────────┘
```

**Key Point:** Frontend and backend are on DIFFERENT domains!

---

## 📞 Need Help?

1. Check your backend logs (Railway/Render dashboard)
2. Test API endpoints directly in browser/Postman
3. Inspect browser console for detailed errors
4. Verify MongoDB connection is working

---

## ✅ Checklist

- [ ] Backend deployed to Railway/Render/Vercel
- [ ] Environment variables set correctly
- [ ] `BACKEND_URL` configured in `index.html`
- [ ] Changes committed and pushed to GitHub
- [ ] GitHub Pages redeployed
- [ ] Telegram bot updated with new URL
- [ ] Tested login, profile, and game features

**You're done!** 🎉
