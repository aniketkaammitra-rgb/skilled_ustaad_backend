import mongoose from "mongoose";

const bidSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BiddingRequest",
      required: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    estimatedDuration: {
      type: String, // e.g., "2 hours", "1 day"
    },
    proposal: {
      type: String,
    },
    experience: {
      type: String,
    },
    proofOfWorkImage: {
      type: String, // URL
    },
    projectLink: {
      type: String, // URL
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
  },
  { timestamps: true }
);

bidSchema.index({ requestId: 1 });
bidSchema.index({ providerId: 1 });
bidSchema.index({ status: 1 });

const Bid = mongoose.model("Bid", bidSchema);
export default Bid;
