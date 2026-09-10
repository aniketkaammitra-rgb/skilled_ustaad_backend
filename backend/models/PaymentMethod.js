import mongoose from "mongoose";

const paymentMethodSchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Provider",
    required: true,
  },

  type: {
    type: String,
    enum: ["Bank", "UPI"],
    required: true,
  },

  name: {
    type: String,
    required: true,
  },

  details: {
    type: String,
    required: true,
  },

  isDefault: {
    type: Boolean,
    default: false,
  },
});

export default mongoose.model("PaymentMethod", paymentMethodSchema);