/**
 * Error Handler Middleware
 * Centralized error handling for the application
 * @module middleware/errorHandler
 */

module.exports = (err, req, res, next) => {
  // Log error for debugging
  console.error('Error:', err.message);
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errorMessages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ 
      error: 'Validation error', 
      details: errorMessages 
    });
  }
  
  // MongoDB duplicate key error
  if (err.code === 11000) {
    return res.status(409).json({ 
      error: 'Resource already exists' 
    });
  }
  
  // Default error response
  res.status(err.statusCode || 500).json({ 
    error: err.message || 'Internal server error' 
  });
};