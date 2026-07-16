# ⚡ Quick Start Guide

## What's Been Connected

✅ **The server and HTML are fully integrated!** Here's what's working:

### Frontend (HTML)
- Complete game UI with Telegram WebApp integration
- Real-time Socket.io connection to server
- REST API client for all backend operations
- Connection status indicator showing server connectivity
- Enhanced error handling and reconnection logic
- Automatic backend URL detection

### Backend (Node.js/Express)
- Express server with REST API routes
- Socket.io for real-time game events
- MongoDB integration for data persistence
- Rate limiting and security middleware
- Admin panel functionality
- Bot player system

### Key Features Implemented

1. **Authentication**
   - JWT tokens
   - Telegram WebApp integration
   - Admin access control

2. **Game Flow**
   - Join room with bots
   - Real-time number calling
   - Auto-marking with validation
   - Bingo claiming with balance updates
   - Winner announcement

3. **Real-Time Updates**
   - Socket.io for live game events
   - Bot move tracking
   - Player join/leave notifications
   - Game over events

4. **Connection Monitoring**
   - Visual connection status indicator
   - Automatic reconnection with backoff
   - Enhanced error messages for debugging

## Running the Application

### Prerequisites
- Node.js 18+ 
- MongoDB (local or Atlas)
- `.env` file with credentials

### Start Development Server

```bash
cd afro
npm install
npm start
```

Server will run on: `http://localhost:3000`

### Setup MongoDB

**Local Installation:**
```bash
# Windows (with MongoDB installed)
mongod

# Mac (using Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

**OR Use MongoDB Atlas:**
Edit `.env`:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/afro-bingo
```

## Testing the Connection

### 1. Test API Connectivity
```javascript
// In browser console
fetch('http://localhost:3000/health')
  .then(r => r.json())
  .then(d => console.log(d))
```

### 2. Check Socket Connection
```javascript
// In browser console after joining a game
window.socket.connected  // Should be: true
window.AppState.connectionStatus  // Should be: 'connected'
```

### 3. Test User Authentication
```javascript
// In browser console
Api.syncUser().then(user => console.log('User:', user))
```

### 4. Monitor Connection Status
```javascript
// In browser console
// Watch real-time updates:
setInterval(() => {
  console.log('Connection:', window.AppState.connectionStatus);
  console.log('Socket:', window.socket?.connected);
}, 1000);
```

## Key Files Overview

### Frontend
- `index.html` - Everything: UI, API client, game logic, Socket.io
  - Lines 1050-3000: Configuration & API layer
  - Lines 3000-3300: Game logic
  - Lines 3300-3500: Socket.io handlers
  - Lines 3500-3560: Global exports

### Backend
- `server.js` - Main server with Socket.io setup
- `routes/game.js` - Game logic endpoints
- `routes/auth.js` - Authentication
- `utils/botManager.js` - Bot player logic
- `models/GameSession.js` - Game data model

## Debugging Tips

### Check Backend URL
```javascript
console.log(CONFIG.API_BASE)  // Should show: http://localhost:3000/api
```

### Monitor API Calls
```javascript
// Open DevTools Network tab and watch all /api/* requests
// All requests should have Authorization header
```

### Watch Socket Events
```javascript
// In browser console after joining game
window.socket.onAny((event, ...args) => {
  console.log('Socket event:', event, args);
});
```

### View App State
```javascript
console.log(JSON.stringify(window.AppState, null, 2))
```

### Force Reconnect
```javascript
window.socket.disconnect();
window.socket.connect();
```

## Environment Variables (.env)

```
# Server
PORT=3000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/afro-bingo

# JWT
JWT_SECRET=your_jwt_secret_key_here

# Admin
ADMIN_MASTER_ID=MasterAdmin
ADMIN_SECURE_CODE=SECURE123
ADMIN_SECURITY_KEY=GOLDENKEY

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

## Common Issues & Solutions

### ❌ "Cannot reach backend"
- [ ] Is MongoDB running? (`mongod` or `brew services start mongodb-community`)
- [ ] Is server running? (`npm start`)
- [ ] Check `.env` MONGODB_URI is correct
- [ ] Check firewall allows port 3000

### ❌ "Authentication failed"
- [ ] Clear localStorage: `localStorage.clear()`
- [ ] Reload page
- [ ] Check JWT_SECRET in `.env`

### ❌ "Socket not connecting"
- [ ] Check Socket.io is running: `window.io` should exist
- [ ] Check server socket is initialized
- [ ] Check CORS settings in server.js
- [ ] Look for errors in browser Network tab (WebSocket)

### ❌ "Can't join room"
- [ ] Check user has sufficient balance
- [ ] Check MongoDB is storing data (use MongoDB Compass to inspect)
- [ ] Check API response in Network tab

### ❌ "Bingo not claiming"
- [ ] Verify socket is connected: `window.socket.connected`
- [ ] Check game session ID: `window.AppState.game.sessionId`
- [ ] Look at server logs for `/game/claim` endpoint
- [ ] Verify MongoDB connection

## Development Workflow

1. **Make changes to HTML**
   - Edit `index.html` and refresh browser
   - No rebuild needed

2. **Make changes to Backend**
   - Edit files in `routes/`, `models/`, `utils/`, `server.js`
   - Restart server: `npm start`
   - Refresh browser

3. **Check Logs**
   - **Server logs**: Look at terminal output
   - **Browser logs**: F12 → Console tab
   - **Network logs**: F12 → Network tab → Filter "game" or "api"

## Performance Tips

- Server logs show all operations with timestamps
- Use browser DevTools Performance tab to profile frontend
- MongoDB indexes are set up for fast queries
- Socket.io polling fallback if WebSocket fails
- Gzip compression enabled for all responses

## Next Steps

1. Deploy server to Render.com, Railway, or Heroku
2. Deploy HTML to GitHub Pages or Vercel
3. Update backend URL in HTML for production
4. Configure admin credentials in .env
5. Set up MongoDB Atlas for production data
6. Enable SSL/TLS certificates
7. Configure rate limiting for production

## Support

- Check `SERVER_FRONTEND_CONNECTION.md` for detailed architecture
- Look at console logs for specific error messages
- Check server.js comments for endpoint documentation
- Review utils/ for game logic implementation
- Examine models/ for data structures

## Success Indicators

✅ Connection Status shows "Connected" in bottom-right
✅ Can see "Server running on port 3000" in terminal
✅ API calls appear in Network tab with 200-201 status
✅ Socket events show in console logs
✅ Can join rooms and play bingo
✅ Bingo claims work and balance updates

---

**Last Updated:** 2026-07-16
**Framework:** Node.js/Express + Socket.io + MongoDB
**Frontend:** Vanilla JavaScript + HTML/CSS
**Status:** ✅ Production Ready
