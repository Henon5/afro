# Afro Bingo - Telegram Mini App

Ethiopia's #1 Telegram Bingo Game - Win Real Money with TeleBirr & CBE!

## ⚠️ Important Deployment Notice

This application consists of two parts:

1. **Frontend** (`index.html`) - Can be hosted on GitHub Pages, Vercel, or Netlify
2. **Backend** (Node.js/Express server) - **CANNOT** be hosted on GitHub Pages

### Why You're Seeing 404 Errors on GitHub Pages

GitHub Pages only serves **static files** (HTML, CSS, JavaScript). It **cannot run** the Node.js backend server that handles:
- User authentication
- Game logic
- Database operations
- Payment processing

When you deploy only to GitHub Pages, the frontend tries to call `/api/user` but there's no backend server to respond, resulting in 404 errors.

## 🚀 Proper Deployment Options

### Option 1: Deploy Both Frontend & Backend Together (Recommended)

Use a platform that supports both static files and Node.js:

#### Railway.app (Easiest)
```bash
# Push your code to GitHub
git push origin main

# Connect Railway to your GitHub repo
# Railway will automatically detect package.json and deploy
```

#### Vercel with Serverless Functions
1. Move backend routes to `api/` folder for serverless functions
2. Update `index.html` API_BASE to use absolute URLs

#### Heroku
```bash
# Install Heroku CLI
heroku create your-app-name
git push heroku main
```

### Option 2: Separate Deployments

**Frontend**: GitHub Pages
**Backend**: Railway/Render/Heroku

Then update `index.html` line 988-990:

```javascript
API_BASE: 'https://your-backend-url.railway.app/api'
```

## 📋 Environment Variables Required

Create a `.env` file with:

```env
PORT=3000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/bingo
JWT_SECRET=your-super-secret-jwt-key
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather

# Admin Credentials
ADMIN_MASTER_ID=MasterAdmin
ADMIN_SECURE_CODE=SECURE123
ADMIN_SECURITY_KEY=GOLDENKEY

# Game Settings
HOUSE_COMMISSION=0.15

# Frontend URL (for CORS)
FRONTEND_URL=https://your-github-username.github.io
```

## 🔧 Local Development

```bash
# Install dependencies
npm install

# Start MongoDB (or use MongoDB Atlas)
# Update MONGODB_URI in .env

# Start the server
npm start

# Open browser to http://localhost:3000
# Or test in Telegram Desktop
```

## 🎮 Features

- ✅ Real-time Bingo game with 75 balls
- ✅ Multiple room tiers (5 ETB, 10 ETB, 25 ETB, 50 ETB)
- ✅ 15% house commission on all games
- ✅ TeleBirr & CBE payment integration
- ✅ Admin dashboard with statistics
- ✅ Daily commission tracking
- ✅ User profile management
- ✅ Deposit/Withdrawal system
- ✅ Telegram WebApp integration

## 📱 Telegram Integration

The app uses Telegram WebApp SDK with fallbacks for older clients:
- BackButton (v6.1+)
- Header/Background colors (v6.1+)
- Closing confirmation (v6.1+)

Older Telegram clients (v6.0) will see console warnings but the app still works.

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js, Express
- **Database**: MongoDB with Mongoose
- **Real-time**: Socket.io
- **Authentication**: JWT + Telegram initData
- **Deployment**: Railway/Vercel/GitHub Pages (frontend only)

## 📞 Support

- Telegram: @rasenok
- Phone: +251921302111

## 📄 License

MIT License
