class DecoderRegistry {

    constructor() {

        this.decoders = [];

    }

    /**
     * Register decoder
     */
    register(decoder) {

        this.decoders.push(decoder);

    }

    /**
     * Decode a raw log
     */
    async decode(rawLog, chain) {

        for (const decoder of this.decoders) {

            try {

                const event = await decoder.decode(rawLog, chain);

                if (event) {

                    return event;

                }

            } catch (err) {

                console.error(
                    `[Decoder:${decoder.name}]`,
                    err.message
                );

            }

        }

        return null;

    }

    /**
     * List registered decoders
     */
    list() {

        return this.decoders.map(d => d.name);

    }

}

export default new DecoderRegistry();
