const locks = new Map();

export const lockService = {
  async withLock(key, fn) {
    while (locks.get(key)) {
      await new Promise(r => setTimeout(r, 10)); // wait 10ms
    }
    locks.set(key, true);
    try {
      return await fn();
    } finally {
      locks.delete(key);
    }
  },

  async withMultiLock(keys, fn) {
    const sorted = [...keys].sort();
    for (const key of sorted) {
      while (locks.get(key)) {
        await new Promise(r => setTimeout(r, 10));
      }
      locks.set(key, true);
    }
    try {
      return await fn();
    } finally {
      sorted.forEach(k => locks.delete(k));
    }
  }
};

export default lockService;
