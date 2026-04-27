// scripts/fix_admin_access.js
// Run this script ONCE to grant admin access to your user
// Usage: node scripts/fix_admin_access.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const YOUR_USER_ID = '69ee67ef3d4dd5e9703f0599';

async function fixAdminAccess() {
  try {
    // Connect to MongoDB
    if (!process.env.MONGODB_URI) {
      console.error('❌ Error: MONGODB_URI not found in .env file');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find user by _id (ObjectId format)
    let user = await User.findById(YOUR_USER_ID);
    
    if (!user) {
      // Try finding by telegramId as string
      user = await User.findOne({ telegramId: YOUR_USER_ID });
    }

    if (!user) {
      console.error(`❌ User not found with ID: ${YOUR_USER_ID}`);
      console.log('💡 Tip: Make sure you have logged in at least once so the user exists in the database');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log('📋 Current user data:');
    console.log(`   - _id: ${user._id}`);
    console.log(`   - telegramId: ${user.telegramId}`);
    console.log(`   - username: ${user.username || 'N/A'}`);
    console.log(`   - firstName: ${user.firstName || 'N/A'}`);
    console.log(`   - isAdmin: ${user.isAdmin || false}`);

    // Update user to have admin privileges
    user.isAdmin = true;
    await user.save();

    console.log('\n✅ SUCCESS! Admin privileges granted:');
    console.log(`   - User: ${user.firstName || user.username || user.telegramId}`);
    console.log(`   - telegramId: ${user.telegramId}`);
    console.log(`   - isAdmin: ${user.isAdmin}`);
    
    console.log('\n📝 Next steps:');
    console.log('   1. Restart your Node.js server');
    console.log('   2. Clear your browser cache or do a hard refresh (Ctrl+Shift+R)');
    console.log('   3. Try accessing the admin panel again');
    
    // Verify the ADMIN_IDS env var includes this user
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
    const userIdString = String(user.telegramId || user._id);
    
    if (!adminIds.includes(userIdString)) {
      console.log('\n⚠️  WARNING: Your user ID is not in ADMIN_IDS environment variable!');
      console.log(`   Add this to your .env file:`);
      console.log(`   ADMIN_IDS=${[...adminIds, userIdString].join(',')}`);
      console.log('\n   The middleware checks both isAdmin field AND ADMIN_IDS list.');
    } else {
      console.log('\n✅ Your user ID is already in the ADMIN_IDS list');
    }

    await mongoose.disconnect();
    console.log('\n👋 Database connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixAdminAccess();
