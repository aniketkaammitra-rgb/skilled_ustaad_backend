
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  paymentTypes:{
     type:String,
     enum:["token","full"],
     required:true
  },
  method: {
    type: String,
    enum: [
      "CreditCard",
      "DebitCard",
      "UPI",
      "Netbanking",
      "GooglePay",
      "Paytm",
      "PhonePe",
      "MobiKwik",
      "Razorpay",
      "Wallet",
      "COD"
    ],
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "success", "failed"],
    default: "pending"
  },


  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },

  transactionId: { type: String },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Payment", paymentSchema);
