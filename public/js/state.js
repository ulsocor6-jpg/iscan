export const state = {
  balance: 0,
  listeners: new Set()
};

export function setBalance(value) {
  state.balance = Number(value || 0);

  state.listeners.forEach(fn =>
    fn(state.balance)
  );
}

export function subscribeBalance(fn) {
  state.listeners.add(fn);

  fn(state.balance);

  return () => {
    state.listeners.delete(fn);
  };
}
