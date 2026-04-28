const Bot = require('../models/Bot');

// BOT SPEED CONFIGURATION: 2 second reaction time
// Bots automatically mark their cards when a number is called
const BOT_REACTION_TIME_MS = 2000; // 2 seconds

const botNames = [
  'Abebe', 'Abel', 'Abdi', 'Alem', 'Amanuel',
  'Amare', 'Amsalu', 'Andualem', 'Araya', 'Assefa',
  'Bekele', 'Belay', 'Berhanu', 'Binyam', 'Biruk',
  'Dagim', 'Daniel', 'Dawit', 'Desta', 'Elias',
  'Ermias', 'Eyasu', 'Ezra', 'Fikru', 'Girma',
  'Habtamu', 'Haile', 'Henok', 'Ibsa', 'Kaleab',
  'Kebede', 'Lema', 'Melaku', 'Mekonnen', 'Meron',
  'Mulugeta', 'Natnael', 'Negash', 'Robel', 'Samson',
  'Sisay', 'Tadesse', 'Tamirat', 'Tewodros', 'Tolosa',
  'Worku', 'Yakob', 'Yared', 'Yohannes', 'Zerihun'
];

/**
 * Initialize 50 bots with unique names, telegram IDs, and pre-generated bingo cards
 */
async function initializeBots() {
  try {
    const existingBots = await Bot.countDocuments();
    
    if (existingBots >= 50) {
      console.log(`✅ Bots already initialized (${existingBots} bots found)`);
      // Ensure all existing bots have cards generated
      await ensureAllBotsHaveCards();
      return;
    }

    const botsToCreate = [];
    
    for (let i = 0; i < botNames.length; i++) {
      const name = botNames[i];
      const telegramId = `bot_${1000000000 + i}`; // Unique bot Telegram IDs
      
      // Check if bot already exists
      const existingBot = await Bot.findOne({ $or: [{ name }, { telegramId }] });
      
      if (!existingBot) {
        const botData = {
          name,
          telegramId,
          balance: 1000,
          difficulty: i < 15 ? 'easy' : (i < 35 ? 'medium' : 'hard'),
          isActive: true
        };
        
        // Create temporary bot instance to generate card
        const tempBot = new Bot(botData);
        tempBot.generateCard();
        
        botsToCreate.push({
          ...botData,
          cardGrid: tempBot.cardGrid,
          markedState: tempBot.markedState
        });
      }
    }

    if (botsToCreate.length > 0) {
      await Bot.insertMany(botsToCreate);
      console.log(`✅ Created ${botsToCreate.length} bots with pre-generated bingo cards`);
    } else {
      console.log('✅ All bots already exist');
    }
  } catch (error) {
    console.error('❌ Error initializing bots:', error.message);
    throw error;
  }
}

/**
 * Ensure all existing bots have bingo cards generated
 */
async function ensureAllBotsHaveCards() {
  try {
    const botsWithoutCards = await Bot.find({
      $or: [
        { cardGrid: { $exists: false } },
        { cardGrid: { $size: 0 } },
        { cardGrid: [[0]] } // Check for empty/default grid
      ]
    }).limit(10);
    
    if (botsWithoutCards.length > 0) {
      console.log(`🔄 Generating cards for ${botsWithoutCards.length} bots...`);
      
      for (const bot of botsWithoutCards) {
        bot.generateCard();
        await bot.save();
      }
      
      console.log(`✅ Generated cards for ${botsWithoutCards.length} bots`);
    }
  } catch (error) {
    console.error('❌ Error ensuring bot cards:', error.message);
  }
}

/**
 * Get all active bots
 */
async function getActiveBots() {
  return await Bot.find({ isActive: true });
}

/**
 * Get a random bot for game participation
 */
async function getRandomBot() {
  const bots = await Bot.find({ isActive: true, balance: { $gte: 10 } });
  if (bots.length === 0) return null;
  return bots[Math.floor(Math.random() * bots.length)];
}

/**
 * Simulate bot playing bingo
 * @param {Object} gameSession - The game session
 * @param {Object} bot - The bot player (from database with cardGrid and markedState)
 */
function simulateBotMove(gameSession, bot) {
  const playerIndex = gameSession.players.findIndex(p => p.user === bot.telegramId);
  if (playerIndex === -1) return null;

  const player = gameSession.players[playerIndex];
  const { cardGrid, markedState } = player;
  const calledSet = new Set(gameSession.calledNumbers);

  // Find all valid marks (called numbers that aren't marked yet, excluding free space)
  const validMarks = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (row === 2 && col === 2) continue; // Skip free space
      const num = cardGrid[row][col];
      if (num !== 0 && calledSet.has(num) && !markedState[row][col]) {
        validMarks.push({ row, col, num });
      }
    }
  }

  if (validMarks.length === 0) return null;

  // Bot decision based on difficulty
  let selectedMark;
  const difficulty = bot.difficulty || 'medium';
  
  if (difficulty === 'easy') {
    // Random mark
    selectedMark = validMarks[Math.floor(Math.random() * validMarks.length)];
  } else if (difficulty === 'medium') {
    // Prefer marks that complete patterns
    selectedMark = findStrategicMark(validMarks, markedState);
  } else {
    // Hard: Always choose the best strategic mark
    selectedMark = findBestStrategicMark(validMarks, markedState, calledSet, cardGrid);
  }

  if (!selectedMark) {
    selectedMark = validMarks[Math.floor(Math.random() * validMarks.length)];
  }

  // THE THREAT: Bots react within 2 seconds and automatically mark
  console.log(`⚡ Bot ${bot.name} reacting in ${BOT_REACTION_TIME_MS}ms...`);

  return selectedMark;
}

/**
 * Get bot reaction time in milliseconds
 */
function getBotReactionTime() {
  return BOT_REACTION_TIME_MS;
}

/**
 * Find a strategic mark that helps complete a pattern
 */
function findStrategicMark(validMarks, markedState) {
  // Simple strategy: prefer marks in rows/columns with more marks
  const scores = validMarks.map(mark => {
    const rowMarks = markedState[mark.row].filter(Boolean).length;
    const colMarks = markedState.reduce((sum, row) => sum + (row[mark.col] ? 1 : 0), 0);
    return { ...mark, score: rowMarks + colMarks };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores[0];
}

/**
 * Find the best strategic mark for hard difficulty
 */
function findBestStrategicMark(validMarks, markedState, calledSet, cardGrid) {
  const scores = validMarks.map(mark => {
    let score = 0;
    
    // Count marks in row
    const rowMarks = markedState[mark.row].filter(Boolean).length;
    score += rowMarks * 2;
    
    // Count marks in column
    const colMarks = markedState.reduce((sum, row) => sum + (row[mark.col] ? 1 : 0), 0);
    score += colMarks * 2;
    
    // Check diagonals
    if (mark.row === mark.col) {
      const diagMarks = [0, 1, 2, 3, 4].filter(i => markedState[i][i]).length;
      score += diagMarks * 3;
    }
    if (mark.row + mark.col === 4) {
      const antiDiagMarks = [0, 1, 2, 3, 4].filter(i => markedState[i][4-i]).length;
      score += antiDiagMarks * 3;
    }

    // Bonus for being close to winning
    if (rowMarks >= 3 || colMarks >= 3) score += 10;

    return { ...mark, score };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores[0];
}

/**
 * Check if bot has a winning pattern
 */
function checkBotWin(gameSession, bot) {
  const playerIndex = gameSession.players.findIndex(p => p.user === bot.telegramId);
  if (playerIndex === -1) return { win: false };
  
  return gameSession.checkWin(playerIndex);
}

module.exports = {
  initializeBots,
  getActiveBots,
  getRandomBot,
  simulateBotMove,
  checkBotWin,
  ensureAllBotsHaveCards,
  getBotReactionTime
};
