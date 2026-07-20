// scripts/backfill-swap-inspector.js
// One-time: syncs all existing FlowerOrder rows into the Inspector collection
// so the Pipeline Inspector immediately reflects swap flows.
// Run: node scripts/backfill-swap-inspector.js

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import FlowerOrder from "../src/models/flower/flowerOrderModel.js";
import Inspector from "../src/models/inspectorModel.js";

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
    console.error("MONGODB_URI not set");
    process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log("Connected to MongoDB");

const orders = await FlowerOrder.find({}).lean();
console.log(`Found ${orders.length} flower orders`);

let created = 0;
let updated = 0;
let skipped = 0;

for (const order of orders) {
    const flowId = order.orderId;
    const existing = await Inspector.findOne({ flowId });

    const stages = [];
    if (order.sweepTxHash) stages.push({ name: "FLOWER_SWEEP", status: "SUCCESS", output: { txHash: order.sweepTxHash } });
    if (order.swapTxHash) stages.push({ name: "FLOWER_SWAP", status: "SUCCESS", output: { txHash: order.swapTxHash } });
    if (order.status === "COMPLETED") stages.push({ name: "FLOWER_SETTLE", status: "SUCCESS" });
    if (order.status?.startsWith("FAILED")) {
        const failedStage = order.status.replace("FAILED_", "FLOWER_");
        stages.push({ name: failedStage, status: "FAILED", error: order.failReason || `Failed at ${order.status}` });
    }

    const status = order.status === "COMPLETED" ? "SUCCESS"
        : order.status?.startsWith("FAILED") ? "FAILED"
        : "RUNNING";

    if (existing) {
        existing.status = status;
        existing.stages = stages;
        await existing.save();
        updated++;
    } else {
        await Inspector.create({
            flowId,
            pipeline: "FLOWER_SWAP",
            source: order.source || "FLOWER",
            transactionType: "swap",
            amount: order.expectedAmount || order.usdcAmountIn || 0,
            currency: "USDC",
            status,
            stages,
        });
        created++;
    }
}

console.log(`Done: ${created} created, ${updated} updated, ${skipped} skipped`);
await mongoose.disconnect();
