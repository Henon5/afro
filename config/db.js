const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Validate MONGODB_URI exists
    if (!process.env.MONGODB_URI) {
      console.error('❌ CRITICAL: MONGODB_URI is not defined in environment variables!');
      console.error('💡 Please check your .env file or environment configuration');
      throw new Error('MONGODB_URI is not defined');
    }
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
      socketTimeoutMS: 45000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Set up connection event handlers for better error handling
    mongoose.connection.on('error', (err) => {
      console.error(`❌ MongoDB connection error: ${err.message}`);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected successfully');
    });
    
    return conn;
  } catch (error) {
    console.error(`❌ Database connection error: ${error.message}`);
    console.error('💡 Make sure MongoDB is running or update MONGODB_URI in .env file');
    // Don't exit process - allow server to start for non-critical DB operations
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    throw error; // Re-throw to prevent further initialization
  }
};

module.exports = connectDB;
