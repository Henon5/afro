/**
 * Script to initialize/reset all 50 bots with 1000 birr balance and bingo cards
 * Run this script to ensure all bots have the correct starting balance and game cards
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Bot = require('../models/Bot');

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
      
      // Find or create bot
      let bot = await Bot.findOne({ $or: [{ name }, { telegramId }] });
      
      if (!bot) {
        bot = new Bot({
          name,
          telegramId,
          balance: 1000,
          totalWins: 0,
          totalWinnings: 0,
          gamesPlayed: 0,
          isActive: true,
          difficulty: i < 15 ? 'easy' : (i < 35 ? 'medium' : 'hard')
        });
      } else {
        // Update existing bot
        bot.balance = 1000;
        bot.totalWins = 0;
        bot.totalWinnings = 0;
        bot.gamesPlayed = 0;
        bot.isActive = true;
        bot.difficulty = i < 15 ? 'easy' : (i < 35 ? 'medium' : 'hard');
        bot.lastPlayed = null;
      }
      
      // Generate a unique bingo card using the model method
      bot.generateCard();
      
      await bot.save();
      
      console.log(`Bot ${i + 1}/${botNames.length}: ${name} (${telegramId})`);
      console.log(`   Balance: ${bot.balance} birr`);
      console.log(`   Difficulty: ${bot.difficulty}`);
      console.log(`   Card generated: [${bot.cardGrid[0][0]}, ${bot.cardGrid[0][1]}, ..., ${bot.cardGrid[4][4]}]`);
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
