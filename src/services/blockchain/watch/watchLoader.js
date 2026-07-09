import DepositAddress from "../../../models/depositAddressModel.js";
import addressFilter from "../filter/addressFilter.js";

class WatchLoader {

    async load() {

        console.log("[WatchLoader] Loading watched addresses...");

        const addresses = await DepositAddress.find({

            status: "active"

        }).lean();

        const watches = addresses.map(address => ({

            address: address.address,

            userId: address.userId,

            chain: address.chain,

            token: address.token,

            hdIndex: address.hdIndex

        }));

        addressFilter.replace(watches);

        console.log(
            `[WatchLoader] Loaded ${watches.length} watched addresses.`
        );

    }

    add(watch) {

        addressFilter.add(watch);

    }

    remove(address) {

        addressFilter.remove(address);

    }

}

export default new WatchLoader();
