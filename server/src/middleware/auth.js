const jwt = require('jsonwebtoken');

/**
 * Auth middleware — verifies JWT access token on every protected route.
 * Attaches decoded user payload to req.user.
 */
const auth = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Access token missing or malformed',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;   // { id, email, role, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Access token expired — please refresh',
      });
    }
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Access token is invalid',
    });
  }
};

module.exports = auth;
