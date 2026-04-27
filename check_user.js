require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find user by telegramId as string
    const user = await User.findOne({ telegramId: "69ee67ef3d4dd5e9703f0599" });
    console.log('User found:', user ? {
      _id: user._id.toString(),
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName
    } : 'NOT FOUND');
    
    // Also check all users
    const allUsers = await User.find().select('telegramId username firstName');
    console.log('\nAll users in DB:');
    allUsers.forEach(u => {
      console.log(`  - _id: ${u._id}, telegramId: ${u.telegramId}, username: ${u.username}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkUser();
