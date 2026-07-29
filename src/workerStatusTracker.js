// Live status of every background worker – updated by brainBus events
const status = {};

function update(worker, state, details = {}) {
  status[worker] = { worker, state, ...details, lastSeen: Date.now() };
}

function getAll() {
  return status;
}

export { update, getAll };
