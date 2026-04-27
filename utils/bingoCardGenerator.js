/**
 * Bingo Card Generator Utility
 * Generates standard 5x5 Bingo cards with unique numbers per column.
 * Columns: B(1-15), I(16-30), N(31-45), G(46-60), O(61-75)
 * Center space (2,2) is always FREE.
 */

function generateBingoCard() {
  const card = {
    B: [],
    I: [],
    N: [],
    G: [],
    O: []
  };

  // Helper to get unique random numbers
  const getUniqueNumbers = (min, max, count) => {
    const nums = new Set();
    while (nums.size < count) {
      nums.add(Math.floor(Math.random() * (max - min + 1)) + min);
    }
    return Array.from(nums);
  };

  card.B = getUniqueNumbers(1, 15, 5);
  card.I = getUniqueNumbers(16, 30, 5);
  card.N = getUniqueNumbers(31, 45, 4); // Only 4 numbers, center is free
  card.G = getUniqueNumbers(46, 60, 5);
  card.O = getUniqueNumbers(61, 75, 5);

  // Insert null/free space in the middle of N column for visual representation if needed
  // But for logic, we treat index 2 of N as "matched" automatically.
  
  return card;
}

/**
 * Checks if a card has a winning pattern based on marked numbers.
 * @param {Object} card - The bingo card structure.
 * @param {Set} markedNumbers - Set of numbers that have been called/marked.
 * @returns {boolean} - True if there is a win.
 */
function checkWin(card, markedNumbers) {
  // Flatten card to easier check rows/cols/diagonals
  // Represent card as 5x5 grid. 
  // Grid indices: [col][row] -> card[B/I/N/G/O][index]
  
  const columns = ['B', 'I', 'N', 'G', 'O'];
  let grid = [];

  for (let r = 0; r < 5; r++) {
    let row = [];
    for (let c = 0; c < 5; c++) {
      const colName = columns[c];
      if (c === 2 && r === 2) {
        // Free space
        row.push(true); 
      } else {
        const num = card[colName][c === 2 ? (r > 2 ? r - 1 : r) : r]; 
        // Wait, standard storage is arrays of 5 (or 4 for N). 
        // Let's normalize storage first: Store N as 5 items with null at index 2.
      }
    }
  }

  // Better approach: Normalize card to 5x5 matrix first
  const matrix = [];
  for (let r = 0; r < 5; r++) {
    const rowData = [];
    columns.forEach((col, cIdx) => {
      if (cIdx === 2 && r === 2) {
        rowData.push({ number: null, marked: true }); // Free space
      } else {
        // Determine index in the column array
        // For N column, we have 4 numbers. If r < 2, index is r. If r > 2, index is r-1.
        let valIndex = r;
        if (cIdx === 2 && r > 2) valIndex = r - 1;
        
        const num = card[col][valIndex];
        rowData.push({
          number: num,
          marked: markedNumbers.has(num)
        });
      }
    });
    matrix.push(rowData);
  }

  // Check Rows
  for (let r = 0; r < 5; r++) {
    if (matrix[r].every(cell => cell.marked)) return true;
  }

  // Check Columns
  for (let c = 0; c < 5; c++) {
    let colWin = true;
    for (let r = 0; r < 5; r++) {
      if (!matrix[r][c].marked) {
        colWin = false;
        break;
      }
    }
    if (colWin) return true;
  }

  // Check Diagonals
  if (matrix[0][0].marked && matrix[1][1].marked && matrix[2][2].marked && matrix[3][3].marked && matrix[4][4].marked) return true;
  if (matrix[0][4].marked && matrix[1][3].marked && matrix[2][2].marked && matrix[3][1].marked && matrix[4][0].marked) return true;

  return false;
}

module.exports = {
  generateBingoCard,
  checkWin
};
