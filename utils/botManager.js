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

/**
 * Process bot moves in the game session with improved error handling and card validation
 * This function is called after every callNumber() execution to activate bot play logic
 * @param {Object} gameSession - The game session
 * @param {number} calledNumber - The number that was just called
 */
async function processBotMoves(gameSession, calledNumber) {
  const botPlayers = gameSession.players.filter(p => p.isBot);
  
  if (botPlayers.length === 0) return; // No bots to process
  
  console.log(`🤖 Processing ${botPlayers.length} bots for number ${calledNumber}...`);
  
  for (const botPlayer of botPlayers) {
    // Use telegramId (string) directly for lookup - DO NOT cast to ObjectId
    const bot = await Bot.findOne({ telegramId: botPlayer.user });
    if (!bot) {
      console.warn(`⚠️ Bot not found in DB: ${botPlayer.user}`);
      continue;
    }

    // Validate bot has a valid card before playing
    if (!bot.cardGrid || !bot.cardGrid.length || bot.cardGrid[0].length === 0) {
      console.warn(`⚠️ Bot ${bot.name} has no valid card, generating one...`);
      bot.generateCard();
      await bot.save();
      // Update player's card in session - Compare as strings
      const botIndex = gameSession.players.findIndex(p => p.user === bot.telegramId.toString());
      if (botIndex !== -1) {
        gameSession.players[botIndex].cardGrid = bot.cardGrid;
        gameSession.players[botIndex].markedState = bot.markedState;
      }
    }

    // Simulate bot reaction with 2 second delay
    await new Promise(resolve => setTimeout(resolve, BOT_REACTION_TIME_MS));
    
    // THE TRIGGER: Call simulateBotMove() for this bot
    const move = simulateBotMove(gameSession, bot);
    if (move) {
      const botIndex = gameSession.players.findIndex(p => p.user === bot.telegramId.toString());
      if (botIndex !== -1) {
        // THE MARK: Update marked state in game session
        gameSession.players[botIndex].markedState[move.row][move.col] = true;
        
        console.log(`✅ Bot ${bot.name} marked position [${move.row},${move.col}] = ${move.num}`);
        
        // THE WIN CHECK: Run checkBotWin() after every mark
        const botWinResult = checkBotWin(gameSession, bot);
        if (botWinResult.win) {
          // Bot wins - handle payout sequence
          console.log(`🏆 BOT WINNER: ${bot.name} with pattern: ${botWinResult.pattern}!`);
          return { winner: bot, botIndex, winResult: botWinResult };
        }
      }
    }
  }
  
  return null; // No winner yet
}

/**
 * Handle bot winning the game - THE PAYOUT
 * Awards currentPool to the winning bot and stops the game
 * @param {Object} gameSession - The game session
 * @param {Object} winningBot - The winning bot
 * @param {number} playerIndex - Index of bot in players array
 * @param {Object} winResult - Win result object with pattern
 */
async function handleBotWin(gameSession, winningBot, playerIndex, winResult) {
  const roomAmount = gameSession.roomAmount;
  
  // Get the room pool with current prize value BEFORE resetting
  const roomPool = await RoomPool.findOne({ roomAmount: gameSession.roomAmount });
  
  if (!roomPool) return;
  
  const winnings = roomPool.currentPool + (roomPool.houseTotal || 0);
  
  // THE PAYOUT: Add currentPool to the winning bot's balance
  await Bot.findByIdAndUpdate(winningBot._id, { 
    $inc: { balance: winnings, totalWins: 1, totalWinnings: winnings } 
  });
  
  console.log(`💰 Bot ${winningBot.name} awarded ${winnings} ETB (new balance will be updated)`);
  
  // Reset room pool
  await RoomPool.findOneAndUpdate(
    { roomAmount: gameSession.roomAmount },
    { $set: { currentPool: 0, players: [] } }
  );
  
  gameSession.gameStatus = 'completed';
  gameSession.completedAt = new Date();
  gameSession.winner = winningBot.telegramId.toString(); // Store as string to match schema
  gameSession.winnerName = winningBot.name;
  gameSession.winningPattern = winResult.pattern;
  gameSession.isBotWin = true;
  await gameSession.save();
  
  // Clear bot injection tracking for this room when game completes
  const { clearBotInjectionForRoom } = require('./botInjectionPlane');
  clearBotInjectionForRoom(roomAmount);
  
  // BROADCAST GAME_OVER: Send Socket.io event to frontend
  const io = require('../server').io;
  if (io) {
    io.emit('GAME_OVER', {
      sessionId: gameSession._id,
      winner: winningBot.name,
      winnerName: winningBot.name,
      isBot: true,
      pattern: winResult.pattern,
      winnings: winnings,
      roomAmount: roomAmount,
      message: `Bot ${winningBot.name} has won the ${winnings} ETB pool!`
    });
  }
}

module.exports = {
  initializeBots,
  getActiveBots,
  getRandomBot,
  simulateBotMove,
  checkBotWin,
  ensureAllBotsHaveCards,
  getBotReactionTime,
  processBotMoves,
  handleBotWin
};
