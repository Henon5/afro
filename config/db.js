const mongoose = require('mongoose');

let cachedConnection = null;

// Retry configuration for MongoDB Atlas rate limit handling
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  retryWrites: true
};

/**
 * Exponential backoff delay calculator
 */
function calculateBackoffDelay(attempt) {
  const delay = RETRY_CONFIG.initialDelayMs * Math.pow(2, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

/**
 * Execute database operation with retry logic for rate limit errors
 * @param {Function} operation - Async function to execute
 * @param {string} operationName - Name of operation for logging
 * @param {number} maxRetries - Maximum retry attempts
 */
async function executeWithRetry(operation, operationName = 'Database operation', maxRetries = RETRY_CONFIG.maxRetries) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateBackoffDelay(attempt - 1);
        console.log(`⚠️ [DB] ${operationName}: Retrying after ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const result = await operation();
      
      if (attempt > 0) {
        console.log(`✅ [DB] ${operationName}: Succeeded on attempt ${attempt + 1}`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if this is a rate limit error or transient failure
      const isRateLimitError = error.codeName === 'RateLimitExceeded' || 
                               error.message.includes('rate limit') ||
                               error.message.includes('too many requests');
      
      const isTransientError = error.code === 'NetworkTimeout' ||
                               error.message.includes('ECONNRESET') ||
                               error.message.includes('ETIMEDOUT');
      
      if (!isRateLimitError && !isTransientError) {
        // Non-retryable error, throw immediately
        console.error(`❌ [DB] ${operationName}: Non-retryable error:`, error.message);
        throw error;
      }
      
      console.warn(`⚠️ [DB] ${operationName}: Rate limit/transient error (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
      
      if (attempt === maxRetries) {
        console.error(`❌ [DB] ${operationName}: Failed after ${maxRetries + 1} attempts`);
        throw lastError;
      }
    }
  }
  
  throw lastError;
}

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
    const conn = await executeWithRetry(
      () => mongoose.connect(process.env.MONGODB_URI, {
        retryWrites: RETRY_CONFIG.retryWrites,
        serverSelectionTimeoutMS: 10000, // Increased timeout for rate limit scenarios
        socketTimeoutMS: 60000,
        // Connection pool settings for better performance and rate limit mitigation
        maxPoolSize: 5, // Reduced from 10 to lower concurrent requests
        minPoolSize: 2, // Reduced from 5 to maintain fewer connections
        maxIdleTimeMS: 30000, // Close idle connections faster
        waitQueueTimeoutMS: 45000, // Increased wait time for available connection
        // Additional retry settings
        heartbeatFrequencyMS: 10000, // Check connection health every 10 seconds
        localThresholdMS: 15, // Accept replicas within 15ms latency
      }),
      'MongoDB Connection',
      5 // More retries for initial connection
    );
    
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
module.exports.executeWithRetry = executeWithRetry;
