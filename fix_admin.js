const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bingo';

const userSchema = new mongoose.Schema({
  isAdmin: Boolean
}, { strict: false }); // Allow flexible schema for update

const User = mongoose.model('User', userSchema, 'users'); // Ensure collection name is 'users'

async function makeAdmin() {
  const userId = '69ee67ef3d4dd5e9703f0599';
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to DB');

    const result = await User.updateOne(
      { _id: userId },
      { $set: { isAdmin: true } }
    );

    if (result.modifiedCount > 0) {
      console.log(`✅ Success! User ${userId} is now an admin.`);
    } else if (result.matchedCount > 0) {
      console.log(`ℹ️ User ${userId} found, but no changes were needed (already admin?).`);
    } else {
      console.log(`❌ User ${userId} not found.`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

makeAdmin();
