import mongoose from "mongoose";

const payoutSchema = new mongoose.Schema({
  provider: { type: mongoose.Schema.Types.ObjectId, ref: "Provider", required: true },
  amount: { type: Number, required: true },
  method: { type: String, required: true },
  status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    upiId: String
  },
  remarks: { type: String, default: "" },
  receipt: { type: String, default: "" },
  requestedAt: { type: Date, default: Date.now },
  processedAt: { type: Date }
});

payoutSchema.index({ provider: 1 });
payoutSchema.index({ status: 1 });
payoutSchema.index({ requestedAt: 1 });

const Payout = mongoose.model("Payout", payoutSchema);
export default Payout;
