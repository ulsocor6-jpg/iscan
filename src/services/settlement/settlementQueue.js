const queue = [];
const handlers = {};

/**
 * Add settlement job
 */
export async function add(name, data) {
  const job = {
    id: Date.now().toString(),
    name,
    data,
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
  };

  queue.push(job);

  console.log(
    "[SETTLEMENT QUEUE ADD]",
    name,
    job.id
  );

  // execute immediately if worker registered
  if (handlers[name]) {
    try {
      job.status = "processing";

      const result = await handlers[name](job);

      job.status = "completed";
      job.result = result;

      return result;

    } catch (err) {
      job.status = "failed";
      job.error = err.message;

      throw err;
    }
  }

  return job;
}


/**
 * Worker registration
 */
export const settlementQueue = {

  process(name, fn) {
    handlers[name] = fn;

    console.log(
      "[SETTLEMENT HANDLER REGISTERED]",
      name
    );
  },

};


/**
 * Debug helpers
 */
export function getQueue() {
  return queue;
}

export function getNextJob() {
  return queue.find(
    j => j.status === "pending"
  );
}
