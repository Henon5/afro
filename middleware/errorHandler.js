module.exports = (err, req, res, next) => {
  console.error('Error:', err.message);
  if (err.name === 'ValidationError') return res.status(400).json({ error: 'Validation error', details: Object.values(err.errors).map(e => e.message) });
  if (err.code === 11000) return res.status(409).json({ error: 'Resource already exists' });
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
};