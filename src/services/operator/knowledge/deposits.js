// src/services/operator/knowledge/deposits.js

import phpDeposits from "./deposits/phpDeposits.js";
import cryptoDeposits from "./deposits/cryptoDeposits.js";
import depositFlow from "./deposits/depositFlow.js";

export default [

    ...phpDeposits,

    ...cryptoDeposits,

    ...depositFlow

];
