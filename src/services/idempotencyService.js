const processed = new Map();

module.exports = {
  isProcessed(key) {
    return processed.has(key);
  },

  get(key) {
    return processed.get(key);
  },

  markProcessed(key, value) {
    processed.set(key, {
      value,
      time: Date.now(),
    });
  },
};
