// src/services/operator/knowledgeBase.js

import treasury from "./knowledge/treasury.js";
import rpc from "./knowledge/rpc.js";
import deposits from "./knowledge/deposits.js";
import withdrawals from "./knowledge/withdrawals.js";
import settlement from "./knowledge/settlement.js";
import blockchain from "./knowledge/blockchain.js";
import workers from "./knowledge/workers.js";
import database from "./knowledge/database.js";
import swaps from "./knowledge/swaps.js";
import nonce from "./knowledge/nonce.js";

const knowledgeBase = [

    // ==========================================================
    // TREASURY
    // ==========================================================

    ...treasury,

    // ==========================================================
    // RPC
    // ==========================================================

    ...rpc,

    // ==========================================================
    // DEPOSITS
    // ==========================================================

    ...deposits,

    // ==========================================================
    // WITHDRAWALS
    // ==========================================================

    ...withdrawals,

    // ==========================================================
    // SETTLEMENT
    // ==========================================================

    ...settlement,

    // ==========================================================
    // BLOCKCHAIN
    // ==========================================================

    ...blockchain,

    // ==========================================================
    // WORKERS
    // ==========================================================

    ...workers,

    // ==========================================================
    // DATABASE
    // ==========================================================

    ...database,

    // ==========================================================
    // SWAPS
    // ==========================================================

    ...swaps,

    // ==========================================================
    // NONCE
    // ==========================================================

    ...nonce

];

export default knowledgeBase;
