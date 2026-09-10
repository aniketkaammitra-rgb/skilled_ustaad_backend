import mongoose from "mongoose";

const biddingRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customerName: {
      type: String,
    },
    category: {
      type: String,
      required: true,
    },
    subService: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      // Removed required per USER request for no location in form
    },
    city: {
      type: String,
      // Required for provider filtering, but we will handle it in controller
    },
    budget: {
      type: Number,
      required: true,
    },
    deadline: {
      type: Date,
      required: true,
    },
    keyFeatures: {
      type: String,
    },
    technicalAssets: {
      domainHosting: String,
      designAssets: String,
      other: String,
    },
    status: {
      type: String,
      enum: ["open", "assigned", "completed", "cancelled"],
      default: "open",
    },
    assignedProviderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
    },
    selectedBidId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bid",
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        // Removed required per USER request
      },
    },
    bidsCount: {
      type: Number,
      default: 0,
    }
  },
  { timestamps: true }
);

biddingRequestSchema.index({ location: "2dsphere" });
biddingRequestSchema.index({ userId: 1 });
biddingRequestSchema.index({ category: 1 });
biddingRequestSchema.index({ status: 1 });

const BiddingRequest = mongoose.model("BiddingRequest", biddingRequestSchema);
export default BiddingRequest;
