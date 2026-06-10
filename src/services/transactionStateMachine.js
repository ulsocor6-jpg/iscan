const STATES = Object.freeze({
  CREATED: 'created',
  VALIDATING: 'validating',
  FRAUD_CHECK: 'fraud_check',
  RESERVED: 'reserved',
  PROCESSING: 'processing',
  SETTLED: 'settled',
  FAILED: 'failed',
  REVERSED: 'reversed'
});

const TRANSITIONS = {
  [STATES.CREATED]: [
    STATES.VALIDATING,
    STATES.FAILED
  ],

  [STATES.VALIDATING]: [
    STATES.FRAUD_CHECK,
    STATES.FAILED
  ],

  [STATES.FRAUD_CHECK]: [
    STATES.RESERVED,
    STATES.FAILED
  ],

  [STATES.RESERVED]: [
    STATES.PROCESSING,
    STATES.FAILED
  ],

  [STATES.PROCESSING]: [
    STATES.SETTLED,
    STATES.FAILED
  ],

  [STATES.SETTLED]: [
    STATES.REVERSED
  ],

  [STATES.REVERSED]: [],

  [STATES.FAILED]: []
};

class TransactionStateMachine {

  getStates() {
    return STATES;
  }

  canTransition(from, to) {

    const allowed = TRANSITIONS[from] || [];

    return allowed.includes(to);
  }

  transition(transaction, nextState) {

    if (
      !this.canTransition(
        transaction.status,
        nextState
      )
    ) {
      throw new Error(
        `Invalid transition: ${transaction.status} -> ${nextState}`
      );
    }

    transaction.status = nextState;

    return transaction;
  }
}

export default new TransactionStateMachine();
