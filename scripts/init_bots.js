/**
 * Script to initialize/reset all 50 bots with 1000 birr balance and bingo cards
 * Run this script to ensure all bots have the correct starting balance and game cards
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Bot = require('./models/Bot');
const GameSession = require('./models/GameSession');

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

async function initializeAllBots() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/afro-bingo');
    console.log('✅ Connected to MongoDB');

    // Reset all bots to 1000 birr and generate bingo cards
    console.log('\n🔄 Resetting all bot balances to 1000 birr and generating bingo cards...\n');
    
    for (let i = 0; i < botNames.length; i++) {
      const name = botNames[i];
      const telegramId = `bot_${1000000000 + i}`;
      
      // Generate a unique bingo card for each bot
      const { cardGrid, markedState } = GameSession.generateCard();
      
      const bot = await Bot.findOneAndUpdate(
        { $or: [{ name }, { telegramId }] },
        {
          name,
          telegramId,
          balance: 1000,
          totalWins: 0,
          totalWinnings: 0,
          gamesPlayed: 0,
          isActive: true,
          difficulty: i < 15 ? 'easy' : (i < 35 ? 'medium' : 'hard'),
          lastPlayed: null,
          // Store the bot's bingo card in custom fields
          cardGrid: cardGrid,
          markedState: markedState
        },
        { upsert: true, new: true }
      );
      
      console.log(`Bot ${i + 1}/${botNames.length}: ${name} (${telegramId})`);
      console.log(`   Balance: ${bot.balance} birr`);
      console.log(`   Card generated: ${cardGrid[0][0]}...${cardGrid[4][4]}`);
    }

    // Verify final count
    const totalBots = await Bot.countDocuments();
    const activeBots = await Bot.countDocuments({ isActive: true });
    
    console.log('\n✅ Initialization complete!');
    console.log(`   Total bots: ${totalBots}`);
    console.log(`   Active bots: ${activeBots}`);
    console.log(`   All bots have 1000 birr balance and unique bingo cards`);
    
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
    
  } catch (error) {
    console.error('❌ Error initializing bots:', error.message);
    process.exit(1);
  }
}

// Run the script
initializeAllBots();
