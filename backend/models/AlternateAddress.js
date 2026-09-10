import mongoose from "mongoose";

const alternateAddressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    houseNo: {
      type: String,
      trim: true,
      default: "",
    },
    colony: {
      type: String,
      trim: true,
      default: "",
    },
    landMark: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      required: true,
    },
    state: {
      type: String,
      trim: true,
      required: true,
    },
    pincode: {
      type: String,
      trim: true,
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

alternateAddressSchema.index({ location: "2dsphere" });

export default mongoose.model("AlternateAddress", alternateAddressSchema);
