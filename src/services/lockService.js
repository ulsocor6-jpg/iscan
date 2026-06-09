import Redis from 'ioredis';
import crypto from 'crypto';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

/**
 * Distributed Lock Service (ISCAN CORE SAFETY)
 */
class LockService {

  generateLockId() {
    return crypto.randomUUID();
  }

  async acquireLock(key, ttl = 5000) {
    const lockId = this.generateLockId();

    const result = await redis.set(
      `lock:${key}`,
      lockId,
      'NX',
      'PX',
      ttl
    );

    if (!result) {
      return null; // lock failed
    }

    return lockId;
  }

  async releaseLock(key, lockId) {
    const stored = await redis.get(`lock:${key}`);

    if (stored === lockId) {
      await redis.del(`lock:${key}`);
      return true;
    }

    return false;
  }
}

export default new LockService();
