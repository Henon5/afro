const mongoose = require('mongoose');

let cachedConnection = null;

const connectDB = async () => {
  // Return cached connection if available (prevents multiple connections)
  if (cachedConnection) {
    return cachedConnection;
  }

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
      // Connection pool settings for better performance
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 5,  // Maintain at least 5 sockets
      maxIdleTimeMS: 60000, // Close idle connections after 60 seconds
      waitQueueTimeoutMS: 30000 // Max time a request waits for a connection
    });
    
    cachedConnection = conn;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events for monitoring
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
      cachedConnection = null; // Clear cache on error
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
      cachedConnection = null; // Clear cache on disconnect
    });
    
    return conn;
  } catch (error) {
    console.error(`❌ Database connection error: ${error.message}`);
    console.error('💡 Make sure MongoDB is running or update MONGODB_URI in .env file');
    // Don't exit process - allow server to start for non-critical DB operations
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectDB;
