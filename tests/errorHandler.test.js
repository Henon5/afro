const errorHandler = require('../middleware/errorHandler');

describe('errorHandler middleware', () => {
  let req, res;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  test('should handle ValidationError', () => {
    const err = {
      name: 'ValidationError',
      errors: {
        field1: { message: 'Field 1 is required' },
        field2: { message: 'Field 2 must be unique' }
      }
    };

    errorHandler(err, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Validation error',
      details: ['Field 1 is required', 'Field 2 must be unique']
    });
  });

  test('should handle duplicate key error (code 11000)', () => {
    const err = {
      code: 11000,
      message: 'Duplicate key error'
    };

    errorHandler(err, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Resource already exists'
    });
  });

  test('should handle error with statusCode', () => {
    const err = {
      statusCode: 404,
      message: 'Not found'
    };

    errorHandler(err, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Not found'
    });
  });

  test('should handle generic error without statusCode', () => {
    const err = {
      message: 'Something went wrong'
    };

    errorHandler(err, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Something went wrong'
    });
  });

  test('should handle error without message', () => {
    const err = {
      name: 'UnknownError'
    };

    errorHandler(err, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error'
    });
  });

  test('should log error to console', () => {
    console.error = jest.fn();
    const err = {
      message: 'Test error'
    };

    errorHandler(err, req, res, () => {});

    expect(console.error).toHaveBeenCalledWith('Error:', 'Test error');
  });
});
