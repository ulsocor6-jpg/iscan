const cache = new Map();

export function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;

  if (Date.now() - item.time > 30000) {
    cache.delete(key);
    return null;
  }

  return item.value;
}

export function setCache(key, value) {
  cache.set(key, {
    value,
    time: Date.now()
  });
}
