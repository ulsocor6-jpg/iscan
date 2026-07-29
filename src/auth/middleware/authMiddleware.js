import jwt from 'jsonwebtoken';
import SessionService from '../services/sessionService.js';
import User from '../../models/userModel.js';

export const requireAuth = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token && req.cookies?.iscan_token) {
      token = req.cookies.iscan_token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("_id email firstName role accountStatus");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found."
      });
    }

    if (user.accountStatus !== "ACTIVE") {
      return res.status(401).json({
        success: false,
        message: "User account is not active."
      });
    }


/*
|--------------------------------------------------------------------------
| Database Session Validation
|--------------------------------------------------------------------------
*/

if (decoded.sessionId) {

    const session = await SessionService.findSession(
        decoded.sessionId
    );

    if (!session) {
        return res.status(401).json({
            success: false,
            message: "Session not found."
        });
    }

    if (session.status !== "ACTIVE") {
        return res.status(401).json({
            success: false,
            message: "Session is no longer active."
        });
    }

    await SessionService.touchSession(
        decoded.sessionId
    );

}


    req.user = {
      id: user._id,
      sessionId: decoded.sessionId,
      email: user.email,
      firstName: user.firstName,
      role: user.role || 'user',
      impersonating: decoded.impersonating || false,
      adminId: decoded.adminId || null,
      adminEmail: decoded.adminEmail || null
    };

    next();
  } catch (error) {
    console.error('[AUTH ERROR]', error);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

export default requireAuth;
