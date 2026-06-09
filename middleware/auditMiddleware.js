import Audit from '../src/models/auditModel.js';

export const log = (action, entity = '') => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    try {
      await Audit.create({
        userId:    req.user?.id,
        userEmail: req.user?.email,
        action,
        entity,
        entityId:  data?._id || data?.id || null,
        details:   { body: req.body, response: data },
        ip:        req.ip,
        status:    res.statusCode < 400 ? 'success' : 'failed'
      });
    } catch(e) { /* audit failure should never break the main flow */ }
    return originalJson(data);
  };
  next();
};
