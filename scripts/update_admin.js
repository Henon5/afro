const mongoose = require('mongoose');
require('dotenv').config();

async function updateAdmin() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected!');

    const User = require('../models/User');

    const userId = '69ee67ef3d4dd5e9703f0599';
    const telegramId = '685983288';

    // First, try to find by _id
    let user = await User.findById(userId);
    
    if (!user) {
      // If not found, try telegramId
      user = await User.findOne({ telegramId });
    }

    if (!user) {
      console.log('❌ User not found. Creating new admin user...');
      user = new User({
        _id: userId,
        telegramId,
        username: 'admin',
        firstName: 'Admin',
        isAdmin: true,
        role: 'admin',
        balance: 500000
      });
      await user.save();
      console.log('✅ New admin user created with 500,000 balance!');
    } else {
      console.log(`📝 Found user: ${user._id}, telegramId: ${user.telegramId}, isAdmin: ${user.isAdmin}`);
      
      // Update the fields
      user.isAdmin = true;
      user.telegramId = telegramId;
      if (!user.role) user.role = 'admin';
      
      // Add 500,000 to the balance
      const balanceIncrease = 500000;
      user.balance = (user.balance || 0) + balanceIncrease;
      console.log(`💰 Adding ${balanceIncrease.toLocaleString()} to balance. New balance: ${user.balance.toLocaleString()}`);
      
      await user.save();
      console.log('✅ User updated successfully!');
    }

    console.log('\n=== FINAL STATUS ===');
    console.log(`User ID: ${user._id}`);
    console.log(`Telegram ID: ${user.telegramId}`);
    console.log(`isAdmin: ${user.isAdmin} (type: ${typeof user.isAdmin})`);
    console.log(`role: ${user.role || 'not set'}`);
    
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateAdmin();
