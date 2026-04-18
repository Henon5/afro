# 🚀 Deployment Guide for Afro Bingo

## ⚠️ CRITICAL: Why GitHub Pages Alone Doesn't Work

**GitHub Pages is a static hosting service.** It can only serve HTML, CSS, and JavaScript files. It **CANNOT** run Node.js servers.

Your app has TWO parts:
1. **Frontend** (`index.html`) - ✅ Works on GitHub Pages
2. **Backend** (Express server with MongoDB) - ❌ Does NOT work on GitHub Pages

When you access `https://henon5.github.io/api/user`, GitHub Pages returns a 404 because there's no backend server running.

---

## ✅ Solution 1: Deploy Everything to Railway (Recommended - Easiest)

Railway.app can host both your frontend AND backend together.

### Step-by-Step:

1. **Push code to GitHub**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Go to Railway.app**
   - Visit https://railway.app
   - Sign in with GitHub
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository

3. **Add Environment Variables in Railway**
   In Railway dashboard → Variables → Add these:
   ```
   PORT=3000
   MONGODB_URI=mongodb+srv://your-user:your-pass@cluster.mongodb.net/bingo
   JWT_SECRET=your-random-secret-key-here
   ADMIN_MASTER_ID=MasterAdmin
   ADMIN_SECURE_CODE=SECURE123
   ADMIN_SECURITY_KEY=GOLDENKEY
   HOUSE_COMMISSION=0.15
   FRONTEND_URL=https://your-app.railway.app
   ```

4. **Get MongoDB URI**
   - Go to https://mongodb.com/cloud/atlas
   - Create a free cluster
   - Get connection string
   - Replace `<password>` with your password

5. **Done!** Railway will give you a URL like:
   ```
   https://afro-bingo-production.up.railway.app
   ```

6. **Update Telegram Bot**
   - Open @BotFather in Telegram
   - `/mybots` → Select your bot
   - Bot Settings → Menu Button → Configure
   - Enter your Railway URL

---

## ✅ Solution 2: Split Deployment (Advanced)

**Frontend on GitHub Pages + Backend on Railway**

### Backend (Railway):
1. Follow steps above to deploy backend to Railway
2. Note your Railway URL: `https://your-backend.railway.app`

### Frontend (GitHub Pages):
1. Update `index.html` line 988-990:
   ```javascript
   API_BASE: window.location.hostname === 'localhost' 
     ? 'http://localhost:3000/api' 
     : 'https://your-backend.railway.app/api',
   ```

2. Enable GitHub Pages:
   - Go to repo Settings → Pages
   - Source: Deploy from branch
   - Branch: main, folder: root
   - Save

3. Your site will be at:
   ```
   https://henon5.github.io/afro/
   ```

---

## 🔧 Fixing the 405 Method Not Allowed Error

The error `POST https://henon5.github.io/api/admin/login 405` happens because:

1. GitHub Pages doesn't handle POST requests
2. There's no backend server to process the login

**Solution**: Use Railway (Solution 1) or split deployment (Solution 2) above.

---

## 📱 Testing Locally

```bash
# Terminal 1: Start backend
npm install
npm start

# Terminal 2: (Optional) Serve frontend separately if needed
# But with our setup, just visit http://localhost:3000
```

Visit `http://localhost:3000` in your browser.

---

## 🎯 Quick Checklist

- [ ] MongoDB Atlas account created
- [ ] `.env` file configured (NOT committed to Git!)
- [ ] Code pushed to GitHub
- [ ] Railway project deployed
- [ ] Environment variables set in Railway
- [ ] Telegram bot updated with new URL
- [ ] Test login, game play, and admin panel

---

## 🆘 Common Issues

### "Cannot connect to database"
- Check MongoDB URI in Railway variables
- Ensure IP whitelist includes `0.0.0.0/0` in Atlas

### "CORS error"
- Add `FRONTEND_URL` variable in Railway
- Should match your GitHub Pages or Railway URL

### "404 on all API calls"
- You're probably on GitHub Pages without a backend
- Deploy to Railway instead

### "Telegram WebApp not working"
- Make sure you're opening the bot in Telegram
- Not in a regular browser

---

## 📞 Need Help?

Contact: @rasenok on Telegram
