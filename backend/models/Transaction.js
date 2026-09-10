import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  provider: { type: mongoose.Schema.Types.ObjectId, ref: "Provider", required: false },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: false },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  transactionId: { type: String, unique: true },
  amount: { type: Number, required: true }, // This is the total paid in this transaction (token or full)
  
  // New Breakdown Fields
  servicePrice: { type: Number, default: 0 },
  gst: { type: Number, default: 0 },
  platformFee: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  tokenAmount: { type: Number, default: 0 },
  adminCommission: { type: Number, default: 0 },
  providerWalletEarning: { type: Number, default: 0 },
  directPayment: { type: Number, default: 0 },

  type: { type: String, enum: ["token", "full"], default: "token" },
  status: { type: String, enum: ["Completed", "Pending", "Failed", "Refunded"], default: "Completed" },
  date: { type: Date, default: Date.now },
});

transactionSchema.index({ provider: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ date: 1 });

transactionSchema.post("save", async function (doc) {
  try {
    const { getIO } = await import("../libs/socket.js");
    const populated = await doc.populate([
      { path: "provider", select: "fullName" },
      { path: "client", select: "fullName" },
      { path: "service", select: "category" }
    ]);

    getIO().emit("newTransaction", {
      _id: populated._id,
      transactionId: populated.transactionId,
      providerName: populated.provider?.fullName || "System/Platform",
      jobCategory: populated.service?.category || "Booking Fee",
      amount: populated.amount,
      status: populated.status,
      date: populated.date
    });
  } catch (err) {
    console.error("Socket.io Transaction Hook Error:", err.message);
  }
});

const Transaction = mongoose.model("Transaction", transactionSchema);
export default Transaction;
