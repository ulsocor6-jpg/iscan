import depositExecutor from "../executors/depositExecutor.js";
import withdrawalExecutor from "../executors/withdrawalExecutor.js";
import swapExecutor from "../executors/swapExecutor.js";
import flowerExecutor from "../executors/flowerExecutor.js";

let started = false;

export function startExecutors() {

    if (started) {

        return;

    }

    started = true;

    console.log("[ExecutorBootstrap] Starting Executors...");

    depositExecutor.start();

    withdrawalExecutor.start();

    swapExecutor.start();

    flowerExecutor.start();

    console.log("[ExecutorBootstrap] Ready.");

}
