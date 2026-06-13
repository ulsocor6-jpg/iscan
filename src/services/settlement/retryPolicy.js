export function canRetry(transaction) {
  const attempts =
    transaction.retryCount || 0;

  return attempts < 5;
}

export function shouldRetry(transaction) {
  return canRetry(transaction);
}

export function getRetryDelay(transaction) {
  const attempts =
    transaction.retryCount || 0;

  return Math.min(
    30000 * Math.pow(2, attempts),
    480000
  );
}

export default {
  canRetry,
  shouldRetry,
  getRetryDelay
};
