import User from "../models/User.js";
import WalletTransaction from "../models/WalletTransaction.js";
import { StatusCodes } from "http-status-codes";
import Razorpay from "razorpay";
import crypto from "crypto";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* =====================================================
   GET WALLET SUMMARY
===================================================== */

export const getWalletSummary = async (req, res) => {
  try {
    const userId = req.user.sub || req.user.id;
    const user = await User.findById(userId).select("walletBalance savedPaymentMethods");

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });
    }

    const transactions = await WalletTransaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(20);

    return res.status(StatusCodes.OK).json({
      balance: user.walletBalance,
      transactions,
      savedMethods: user.savedPaymentMethods || []
    });
  } catch (error) {
    console.error("Wallet Summary Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

/* =========================================================
   ADD PAYMENT METHOD
   POST /api/v1/wallet/add-method
========================================================= */

export const addPaymentMethod = async (req, res) => {
  try {
    const { type, details } = req.body;
    const userId = req.user.sub || req.user.id;

    if (!type || !details) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Type and details required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });
    }

    // Limit check: maximum 3 payment methods allowed
    if (user.savedPaymentMethods && user.savedPaymentMethods.length >= 3) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Maximum limit of 3 payment methods reached" });
    }

    // Add new method
    user.savedPaymentMethods.push({ type, details, isPrimary: false });
    await user.save();

    return res.status(StatusCodes.CREATED).json({ 
       success: true, 
       message: "Payment method added",
       savedMethods: user.savedPaymentMethods 
    });
  } catch (error) {
    console.error("Add Method Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

/* =====================================================
   INITIATE FUNDS ADDITION (RAZORPAY)
===================================================== */

export const initiateAddFunds = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.sub || req.user.id;

    if (!amount || amount < 1) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Minimum ₹1 required" });
    }

    const amountInPaise = Math.round(amount * 100);
    const receipt = `wallet_topup_${userId.toString().slice(-8)}_${Date.now()}`;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: { userId, type: "wallet_credit" },
    });

    // Create a pending transaction record
    await WalletTransaction.create({
      user: userId,
      amount,
      balanceAfter: 0, // Will update after success
      type: "credit",
      status: "pending",
      description: "Wallet Top-up (Initiated)",
      razorpayOrderId: order.id,
    });

    return res.status(StatusCodes.CREATED).json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("Initiate Add Funds Error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to initiate transaction" });
  }
};

/* =====================================================
   VERIFY TOP-UP PAYMENT
===================================================== */

export const verifyAddFunds = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Missing verification parameters" });
    }

    // Signature Validation
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Fraudulent transaction detected" });
    }

    // Atomic Balance Update
    const tx = await WalletTransaction.findOne({ razorpayOrderId: razorpay_order_id });
    if (!tx || tx.status === "completed") {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Transaction already processed or not found" });
    }

    const user = await User.findById(tx.user);
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });

    const updatedBalance = user.walletBalance + tx.amount;
    
    // Update User Balance
    user.walletBalance = updatedBalance;
    await user.save();

    // Finalize Transaction
    tx.status = "completed";
    tx.razorpayPaymentId = razorpay_payment_id;
    tx.balanceAfter = updatedBalance;
    tx.description = "Funds added via Razorpay";
    await tx.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Wallet recharged successfully",
      newBalance: updatedBalance,
    });
  } catch (err) {
    console.error("Verify Add Funds Error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Server error during verification" });
  }
};

/* =========================================================
   REMOVE PAYMENT METHOD
   DELETE /api/v1/wallet/remove-method/:methodId
========================================================= */
export const removePaymentMethod = async (req, res) => {
  try {
    const { methodId } = req.params;
    const userId = req.user.sub || req.user.id;

    if (!methodId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Method ID required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });
    }

    // Pull the subdocument from array
    user.savedPaymentMethods = user.savedPaymentMethods.filter(
      (m) => m._id && m._id.toString() !== methodId
    );
    
    await user.save();

    return res.status(StatusCodes.OK).json({ 
       success: true, 
       message: "Payment method removed",
       savedMethods: user.savedPaymentMethods 
    });
  } catch (error) {
    console.error("Remove Method Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};
