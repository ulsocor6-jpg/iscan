export async function retry(fn, attempts = 3, delay = 500) {
  let lastError;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      console.log(
        `[RETRY] Attempt ${i + 1} failed:`,
        err.message
      );

      // wait before retrying (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, delay * Math.pow(2, i))
      );
    }
  }

  throw lastError;
}
