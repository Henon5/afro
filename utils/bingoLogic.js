/**
 * Server-side bingo win validation
 * Prevents client-side manipulation
 */
function checkBingoWin(markedGrid) {
  // Check rows
  for (let row = 0; row < 5; row++) {
    if (markedGrid[row].every(cell => cell === true)) {
      return true;
    }
  }
  
  // Check columns
  for (let col = 0; col < 5; col++) {
    let columnComplete = true;
    for (let row = 0; row < 5; row++) {
      if (markedGrid[row][col] !== true) {
        columnComplete = false;
        break;
      }
    }
    if (columnComplete) return true;
  }
  
  // Check diagonals
  let diag1 = true, diag2 = true;
  for (let i = 0; i < 5; i++) {
    if (markedGrid[i][i] !== true) diag1 = false;
    if (markedGrid[i][4-i] !== true) diag2 = false;
  }
  
  return diag1 || diag2;
}

/**
 * Generate next valid bingo number
 */
function generateBingoNumber(calledNumbers = []) {
  if (calledNumbers.length >= 75) return null;
  
  // Use Set for O(1) lookup instead of O(n) array includes
  const calledSet = new Set(calledNumbers);
  
  // If most numbers are called, use efficient loop instead of random retry
  if (calledNumbers.length > 50) {
    for (let num = 1; num <= 75; num++) {
      if (!calledSet.has(num)) return num;
    }
  }
  
  // Random selection with Set lookup for better performance
  let num;
  do {
    num = Math.floor(Math.random() * 75) + 1;
  } while (calledSet.has(num));
  
  return num;
}

/**
 * Get letter prefix for bingo number
 */
function getBingoLetter(num) {
  if (num <= 15) return 'B';
  if (num <= 30) return 'I';
  if (num <= 45) return 'N';
  if (num <= 60) return 'G';
  return 'O';
}

module.exports = {
  checkBingoWin,
  generateBingoNumber,
  getBingoLetter
};