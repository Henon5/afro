const mongoose = require('mongoose');

let cachedConnection = null;

const connectDB = async () => {
  console.log('🔗 [DB] Attempting to connect to MongoDB...');
  
  // Return cached connection if available (prevents multiple connections)
  if (cachedConnection) {
    console.log('✅ [DB] Using cached MongoDB connection');
    return cachedConnection;
  }

  try {
    // Validate MONGODB_URI exists
    if (!process.env.MONGODB_URI) {
      console.error('❌ [DB] CRITICAL: MONGODB_URI is not defined in environment variables!');
      console.error('💡 [DB] Please check your Render Environment tab');
      throw new Error('MONGODB_URI is not defined');
    }
    
    console.log('🔗 [DB] MONGODB_URI found, connecting...');
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
      socketTimeoutMS: 45000,
      // Connection pool settings for better performance
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 5,  // Maintain at least 5 sockets
      maxIdleTimeMS: 60000, // Close idle connections after 60 seconds
      waitQueueTimeoutMS: 30000 // Max time a request waits for a connection
    });
    
    cachedConnection = conn;
    console.log(`✅ [DB] MongoDB Connected: ${conn.connection.host}`);
    console.log(`✅ [DB] Database: ${conn.connection.name}`);
    
    // Handle connection events for monitoring
    mongoose.connection.on('error', (err) => {
      console.error('❌ [DB] MongoDB connection error:', err.message);
      cachedConnection = null; // Clear cache on error
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ [DB] MongoDB disconnected');
      cachedConnection = null; // Clear cache on disconnect
    });
    
    mongoose.connection.on('connected', () => {
      console.log('✅ [DB] MongoDB connected successfully');
    });
    
    return conn;
  } catch (error) {
    console.error(`❌ [DB] Database connection error: ${error.message}`);
    console.error('❌ [DB] Stack:', error.stack);
    console.error('💡 [DB] Make sure MongoDB is running or update MONGODB_URI in environment variables');
    // Don't exit process - allow server to start for non-critical DB operations
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ [DB] Exiting process due to production mode');
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectDB;
