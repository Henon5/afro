const mongoose = require('mongoose');

const botSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, index: true },
  telegramId: { type: String, required: true, unique: true, index: true },
  balance: { type: Number, default: 1000, min: 0, index: true },
  totalWins: { type: Number, default: 0 },
  totalWinnings: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium', index: true },
  lastPlayed: { type: Date, index: true },
  lastRefill: { type: Date },
  refillCount: { type: Number, default: 0 },
  winRate: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true },
  // Bingo card fields for game participation
  cardGrid: { 
    type: [[Number]], 
    default: () => {
      // Default empty 5x5 grid
      return Array(5).fill(null).map(() => Array(5).fill(0));
    }
  },
  markedState: { 
    type: [[Boolean]], 
    default: () => {
      // Default all false except center (free space)
      const marked = Array(5).fill(null).map(() => Array(5).fill(false));
      marked[2][2] = true;
      return marked;
    }
  }
});

// Compound indexes for common query patterns
botSchema.index({ isActive: 1, balance: -1 });
botSchema.index({ difficulty: 1, isActive: 1 });
botSchema.index({ telegramId: 1, isActive: 1 });

// Method to generate a new bingo card for the bot
botSchema.methods.generateCard = function() {
  const getUniqueNumbers = (min, max, count) => {
    const nums = new Set();
    while (nums.size < count) {
      nums.add(Math.floor(Math.random() * (max - min + 1)) + min);
    }
    return Array.from(nums);
  };

  // Generate columns: B(1-15), I(16-30), N(31-45), G(46-60), O(61-75)
  const colB = getUniqueNumbers(1, 15, 5);
  const colI = getUniqueNumbers(16, 30, 5);
  const colN = getUniqueNumbers(31, 45, 4); // 4 numbers, center is free
  const colG = getUniqueNumbers(46, 60, 5);
  const colO = getUniqueNumbers(61, 75, 5);

  // Build 5x5 grid
  const grid = Array(5).fill(null).map(() => Array(5).fill(0));
  
  for (let row = 0; row < 5; row++) {
    grid[row][0] = colB[row];
    grid[row][1] = colI[row];
    if (row === 2) {
      grid[row][2] = 0; // Free space
    } else {
      grid[row][2] = colN[row > 2 ? row - 1 : row];
    }
    grid[row][3] = colG[row];
    grid[row][4] = colO[row];
  }

  this.cardGrid = grid;
  
  // Reset marked state
  const marked = Array(5).fill(null).map(() => Array(5).fill(false));
  marked[2][2] = true; // Free space always marked
  this.markedState = marked;

  return grid;
};

// Method to mark numbers on the card based on called numbers
botSchema.methods.markNumbers = function(calledNumbers) {
  let newMarked = false;
  const calledSet = new Set(calledNumbers);

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (row === 2 && col === 2) continue; // Skip free space
      
      const num = this.cardGrid[row][col];
      if (num !== 0 && calledSet.has(num) && !this.markedState[row][col]) {
        this.markedState[row][col] = true;
        newMarked = true;
      }
    }
  }

  return newMarked;
};

// Method to check if the bot has won
botSchema.methods.checkWin = function() {
  const marked = this.markedState;

  // Check rows
  for (let row = 0; row < 5; row++) {
    if (marked[row].every(m => m)) return true;
  }

  // Check columns
  for (let col = 0; col < 5; col++) {
    let colWin = true;
    for (let row = 0; row < 5; row++) {
      if (!marked[row][col]) {
        colWin = false;
        break;
      }
    }
    if (colWin) return true;
  }

  // Check diagonals
  if (marked[0][0] && marked[1][1] && marked[2][2] && marked[3][3] && marked[4][4]) return true;
  if (marked[0][4] && marked[1][3] && marked[2][2] && marked[3][1] && marked[4][0]) return true;

  return false;
};

module.exports = mongoose.model('Bot', botSchema);
