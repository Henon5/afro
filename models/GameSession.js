const mongoose = require('mongoose');

const gameSessionSchema = new mongoose.Schema({
  roomAmount: { type: Number, required: true, index: true },
  players: [{ 
    user: { type: String, index: true }, 
    telegramId: String,
    name: String,
    isBot: { type: Boolean, index: true },
    cardGrid: [[Number]], 
    markedState: [[Boolean]] 
  }],
  calledNumbers: [Number],
  currentNumber: Number,
  gameStatus: { type: String, enum: ['waiting', 'active', 'completed'], default: 'waiting', index: true },
  winner: { type: String, index: true },
  winnerName: String,
  winningPattern: String,
  startedAt: { type: Date, index: true },
  completedAt: { type: Date, index: true },
  isBotWin: { type: Boolean, index: true }
}, { timestamps: true });

// Compound indexes for common query patterns
gameSessionSchema.index({ roomAmount: 1, gameStatus: 1 });
gameSessionSchema.index({ 'players.user': 1, gameStatus: 1 });
gameSessionSchema.index({ gameStatus: 1, startedAt: -1 });
gameSessionSchema.index({ winner: 1, completedAt: -1 });

gameSessionSchema.statics.generateCard = function(selectedCard) {
  // If a selectedCard (1-100) is provided, use it as a seed so card generation is deterministic
  let rng = Math.random;
  if (selectedCard !== undefined && selectedCard !== null) {
    const seed = Number(selectedCard) || 0;
    // Mulberry32 PRNG
    function mulberry32(a) {
      return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    rng = mulberry32(seed + 0x9e3779b1);
  }

  const card = [], marked = [];
  for (let col = 0; col < 5; col++) {
    const min = col * 15 + 1;
    const nums = new Set();
    while (nums.size < 5) nums.add(Math.floor(rng() * 15) + min);
    Array.from(nums).sort((a, b) => a - b).forEach((num, row) => {
      if (!card[row]) card[row] = [];
      if (!marked[row]) marked[row] = [];
      card[row][col] = num;
      marked[row][col] = false;
    });
  }
  marked[2][2] = true;
  return { cardGrid: card, markedState: marked };
};

gameSessionSchema.methods.checkWin = function(playerIndex) {
  const player = this.players[playerIndex];
  if (!player) return { win: false };
  const { cardGrid, markedState } = player;
  
  // Create a lookup Set for called numbers (O(1) vs O(n))
  const calledSet = new Set(this.calledNumbers);
  const isValidMarked = (r, c) => (r === 2 && c === 2) ? true : (calledSet.has(cardGrid[r][c]) && markedState[r][c]);
  
  // Check rows
  for (let r = 0; r < 5; r++) {
    if ([0,1,2,3,4].every(c => isValidMarked(r, c))) return { win: true, pattern: `row-${r}` };
  }
  // Check columns
  for (let c = 0; c < 5; c++) {
    if ([0,1,2,3,4].every(r => isValidMarked(r, c))) return { win: true, pattern: `col-${['B','I','N','G','O'][c]}` };
  }
  // Check diagonals
  if ([0,1,2,3,4].every(i => isValidMarked(i, i))) return { win: true, pattern: 'diagonal-1' };
  if ([0,1,2,3,4].every(i => isValidMarked(i, 4-i))) return { win: true, pattern: 'diagonal-2' };
  
  return { win: false };
};

module.exports = mongoose.model('GameSession', gameSessionSchema);