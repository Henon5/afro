# 🚀 Server-to-HTML Connection Guide

## Current Architecture

The AFRO-BINGO application has a **complete server-to-HTML integration** with the following components working together:

### ✅ What's Already Connected

#### 1. **Backend Server (Node.js/Express)**
- Location: `server.js`
- Features:
  - REST API endpoints for authentication, game logic, transactions
  - Socket.io real-time communication
  - MongoDB database integration
  - Rate limiting and security middleware
  - CORS configured for multiple origins

#### 2. **Frontend HTML/JavaScript**
- Location: `index.html`
- Features:
  - Complete game UI with animations
  - REST API client with automatic backend URL detection
  - Socket.io client for real-time game updates
  - Telegram WebApp SDK integration
  - Admin panel functionality
  - Mobile-responsive design

#### 3. **Communication Flow**

```
Browser (HTML/JS)
    ↓
REST API (/api/*)
    ↓
Express Routes (routes/*)
    ↓
Database (MongoDB)

Socket.io Connection
    ↓
Real-time Game Events
    ↓
Update UI Immediately
```

## Key Integration Points

### 1. **API Communication**
The HTML uses the `Api` object to make RESTful calls:
- `Api.syncUser()` - Get user info
- `Api.joinRoom(amount)` - Join a game room
- `Api.claimBingo()` - Submit a win
- `Api.requestDeposit()` - Request deposit
- All other game operations

**Backend Routes:**
- `GET /api/user` - User profile
- `POST /api/game/join` - Join room
- `POST /api/game/mark` - Mark numbers
- `POST /api/game/claim` - Claim bingo
- `POST /api/transaction/deposit` - Deposit request
- `POST /api/admin/*` - Admin operations

### 2. **Socket.io Real-time Events**
The HTML initializes Socket.io connection when joining a game:

**Client Events Emitted:**
- `joinGame` - Join a game room
- `bingoClaim` - Submit bingo claim
- `leave-game` - Leave game room

**Server Events Received:**
- `numberCalled` - A number was drawn
- `gameStarted` - Game started
- `bingoWin` - Someone won
- `gameEnd` - Game ended
- `BOT_MOVE` - Bot players moved
- `GAME_OVER` - Game is over

### 3. **Backend URL Auto-Detection**
The HTML automatically detects the correct backend URL:
```javascript
// Priority order:
1. Meta tag: <meta name="backend-url" content="...">
2. GitHub Pages: uses https://afro-pxbt.onrender.com/api
3. Localhost: uses http://localhost:3000/api
4. Same domain: uses /api (default)
```

## Setup Instructions

### ✅ Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Git

### 1. **Install Dependencies**
```bash
cd afro
npm install
```

### 2. **Configure Environment**
Edit `.env` file:
```
MONGODB_URI=mongodb://localhost:27017/afro-bingo
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/afro-bingo

PORT=3000
NODE_ENV=development
JWT_SECRET=your_strong_secret_here
ADMIN_MASTER_ID=YourMasterID
ADMIN_SECURE_CODE=YourSecureCode
ADMIN_SECURITY_KEY=YourSecurityKey
TELEGRAM_BOT_TOKEN=your_telegram_token
```

### 3. **Start MongoDB** (if using local)
```bash
# On Windows
mongod

# On Mac
brew services start mongodb-community

# On Linux
sudo systemctl start mongod
```

### 4. **Start the Server**
```bash
npm start
# Server runs on http://localhost:3000
```

### 5. **Access the Application**
```
http://localhost:3000
```

## How the Game Flow Works

### 1. **User Login**
```
Browser → Api.syncUser() → /api/user → Database
Response: User profile with balance
```

### 2. **Join Room**
```
Browser → Api.joinRoom(50) → /api/game/join → Database
Returns: Game session, initial bingo card, pool info
Then: initSocket(sessionId) → WebSocket connection established
```

### 3. **Game Play**
```
Browser WebSocket → Server listens to events
Server → callNumber() → Emit 'numberCalled'
Browser → Updates card display
Player clicks number or auto-mark occurs
Browser → Api.markNumber() → /api/game/mark → Database
```

### 4. **Winning**
```
Player achieves bingo → checkForBingo() → emit 'bingoClaim'
Browser → Api.claimBingo() → /api/game/claim
Server validates → Updates balance in Database
Server → emit 'GAME_OVER' → Browser shows winner
```

## Debugging Connection Issues

### Issue: Backend URL not found
**Solution:** 
1. Check browser console (F12) for logged backend URL
2. Ensure server is running on port 3000
3. Check CORS settings in server.js if running on different domain

### Issue: Socket.io not connecting
**Solution:**
1. Verify Socket.io is loaded: `typeof io !== 'undefined'` in console
2. Check browser console for connection errors
3. Ensure server.io is initialized in server.js

### Issue: API calls failing
**Solution:**
1. Check Network tab (F12) to see actual HTTP requests
2. Verify API endpoints exist in routes/
3. Check MongoDB connection status

### Issue: Bingo not registering
**Solution:**
1. Verify Socket.io is connected: `window.socket.connected`
2. Check that sessionId is set: `AppState.game.sessionId`
3. Monitor server logs for claim processing

## Key Files to Understand

### Backend
- `server.js` - Main server file with Socket.io setup
- `routes/game.js` - Game logic endpoints
- `routes/auth.js` - Authentication
- `utils/botManager.js` - Bot player logic
- `models/GameSession.js` - Game data structure

### Frontend
- `index.html` - Complete UI and game logic
  - Lines 1050-3500: API client configuration
  - Lines 3050-3500: Socket.io initialization
  - Lines 2000-2500: Game flow logic
  - Lines 1500-2000: Page rendering

## Testing the Connection

### Test 1: Server Health
```
GET http://localhost:3000/health
Expected: { status: 'ok', timestamp: '...' }
```

### Test 2: Get Rooms
```
GET http://localhost:3000/api/game/rooms
Headers: Authorization: Bearer <token>
Expected: { success: true, rooms: {...} }
```

### Test 3: Socket Connection
```javascript
// In browser console:
typeof io // Should be 'function'
window.socket // Should show connection object
window.socket.connected // Should be true
```

## Production Deployment

### For Render.com:
1. Push code to GitHub
2. Connect repo to Render
3. Set environment variables in Render dashboard
4. Deploy
5. Update HTML backend URL (already configured for render)

### For Vercel (Frontend only):
1. Deploy HTML to Vercel
2. Set meta tag: `<meta name="backend-url" content="https://your-server.com/api">`
3. Ensure CORS is configured on backend

## Performance Optimizations

✅ Already Implemented:
- Gzip compression for responses
- Rate limiting on auth endpoints
- Efficient database queries
- Socket.io polling fallback
- Frontend state management with AppState
- Lazy loading of components

## Security Features

✅ Already Implemented:
- JWT authentication
- Admin token verification
- Rate limiting (100 req/15min, 10 auth/15min)
- Helmet security headers
- CORS validation
- Input validation via Joi
- XSS protection via Content Security Policy

## Common Commands

```bash
# Start development server
npm start

# Run tests
npm test

# Start with auto-reload
npm run dev

# Check server health
curl http://localhost:3000/health

# View logs
tail -f server.log
```

## Support & Documentation

- API Documentation: See routes/ folder for endpoint details
- Game Logic: See utils/botManager.js and utils/bingoLogic.js
- Database Models: See models/ folder for data structures
- Configuration: See .env and server.js for setup options
