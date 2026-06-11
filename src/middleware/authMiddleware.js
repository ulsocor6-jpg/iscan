import jwt from 'jsonwebtoken';

export const requireAuth = async (req, res, next) => {
  try {
    let token = null;

    // Authorization: Bearer <token>
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // Cookie fallback
    if (!token && req.cookies?.iscan_token) {
      token = req.cookies.iscan_token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = {
      id: decoded.id,
      email: decoded.email,
      firstName: decoded.firstName
    };

    next();

  } catch (error) {
    console.error('[AUTH ERROR]', error);

    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

export default requireAuth;
