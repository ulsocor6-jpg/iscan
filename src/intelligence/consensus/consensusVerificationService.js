import consensusEngine from "./consensusEngine.js";
import laptopConsensusProvider from "../laptop/laptopConsensusProvider.js";

class ConsensusVerificationService {

    async verify({

        deposit,

        watcher,

        observedBalance,


    }) {

        const referenceVerified =
            watcher?.referenceId === deposit.referenceId;

        const senderVerified =
            watcher?.senderId === deposit.senderId ||
            watcher?.senderName === deposit.senderName;

        const androidVerified =
            watcher?.verified === true;

        const laptop =
            await laptopConsensusProvider.verify(
                deposit.channel,
                observedBalance
            );

        const laptopVerified =
            laptop.verified;

        const consensus =
            await consensusEngine.evaluate({

                channel: deposit.channel,

                observedBalance,

                referenceVerified,

                androidVerified,

                laptopVerified,

                senderVerified,

                inspectorHealthy: true,

                tolerance: 0

            });

        consensus.laptop = laptop;

        return consensus;
}

}

export default new ConsensusVerificationService();
