import crypto from "crypto";
import IngressEvent from "../../models/IngressEvent.js";

class DeduplicationService {

  createHash(data) {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
  }

  async createEvent(source, eventId, payload = {}) {

    const eventHash = this.createHash(payload);

    try {

      return await IngressEvent.create({
        source,
        eventId,
        eventHash,
        metadata: payload,
        status: "RECEIVED"
      });

    } catch (err) {

      if (err.code === 11000) {
        return null;
      }

      throw err;
    }

  }

  async startProcessing(source, eventId) {

    return IngressEvent.findOneAndUpdate(

      {
        source,
        eventId,
        status: "RECEIVED"
      },

      {
        $set: {
          status: "PROCESSING",
          processingStartedAt: new Date()
        }
      },

      {
        new: true
      }

    );

  }

  async markProcessed(source, eventId) {

    return IngressEvent.findOneAndUpdate(

      {
        source,
        eventId
      },

      {
        $set: {
          status: "PROCESSED",
          processedAt: new Date()
        }
      }

    );

  }

  async markFailed(source, eventId, reason) {

    return IngressEvent.findOneAndUpdate(

      {
        source,
        eventId
      },

      {
        $set: {
          status: "FAILED",
          failureReason: reason
        }
      }

    );

  }

}

export default new DeduplicationService();
