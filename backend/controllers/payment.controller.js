import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import Transaction from "../models/Transaction.js";
import ProviderNotification from "../models/ProviderNotification.js";
import User from "../models/User.js";
import WalletTransaction from "../models/WalletTransaction.js";
import { StatusCodes } from "http-status-codes";
import Razorpay from "razorpay";
import crypto from "crypto";

/* =============================
   RAZORPAY INSTANCE
============================= */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

/* =====================================================
   CREATE FULL PAYMENT ORDER (FOR REMAINING AMOUNT)
===================================================== */

export async function createFullPayment(req, res) {
  try {
    const { bookingId, method } = req.body;

    if (!bookingId || !method) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Booking ID and payment method required"
      });
    }

    /* ----------------------------
       FIND BOOKING
    ----------------------------- */

    const booking = await Booking.findById(bookingId).select("price status userId providerId addOns emergencyFee");

    if (!booking) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Booking not found"
      });
    }

    if (!booking.price || isNaN(booking.price)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Invalid booking price"
      });
    }

    /* ----------------------------
       CHECK IF FULL PAYMENT ALREADY DONE
    ----------------------------- */

    const fullPayment = await Payment.findOne({
      bookingId,
      paymentTypes: "full",
      status: "success"
    }).select("_id");

    if (fullPayment) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Payment already completed"
      });
    }

    /* ----------------------------
       FIND TOKEN PAYMENT
    ----------------------------- */

    const tokenPayment = await Payment.findOne({
      bookingId,
      paymentTypes: "token",
      status: "success"
    }).select("amount");

    const tokenAmount = tokenPayment ? tokenPayment.amount : 0;

    /* ----------------------------
       CALCULATE REMAINING AMOUNT
    ----------------------------- */
    const BASE_PLATFORM_FEE = 10;
    const ADDON_PLATFORM_FEE = 5;
    const PLATFORM_CHARGE = BASE_PLATFORM_FEE + (booking.addOns?.length || 0) * ADDON_PLATFORM_FEE;
    const servicePrice = Number(booking.price || 0);
    const emergencyCharge = Number(booking.emergencyFee || 0);
    const taxableValue = servicePrice + emergencyCharge + PLATFORM_CHARGE;
    const GST_PERCENTAGE = 18;
    const gstAmount = Math.round((taxableValue * GST_PERCENTAGE) / 100);
    const finalTotal = taxableValue + gstAmount;

    const remainingAmount = finalTotal - tokenAmount;

    if (remainingAmount <= 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "No remaining payment required"
      });
    }

    /* ----------------------------
       USER ID
    ----------------------------- */

    const userId = req.user.sub || req.user.id;

    /* ----------------------------
       RAZORPAY ORDER OR COD ACTION
    ----------------------------- */

    if (method === "COD") {
      await Payment.create({
        bookingId,
        userId,
        amount: remainingAmount,
        paymentTypes: "full",
        method: "COD",
        status: "pending",
        razorpayOrderId: `COD_${bookingId.toString().slice(-6)}_${Date.now()}`
      });

      // Create Database Notification for Payment Pending
      try {
        if (booking.providerId) {
          await ProviderNotification.create({
            providerId: booking.providerId,
            bookingId,
            type: "payment_pending",
            title: "Cash Payment Pending",
            message: `Customer selected COD. Please collect ₹${remainingAmount} from the customer.`
          });
        }
      } catch (notifErr) {
        console.error("Failed to create COD payment pending notification:", notifErr.message);
      }

      // Notify Provider via Socket
      try {
        const { getIO } = await import("../libs/socket.js");
        const io = getIO();
        if (booking.providerId) {
          io.to(`provider_${booking.providerId}`).emit("payment_method_selected", {
            bookingId,
            method: "COD",
            amount: remainingAmount,
            message: "Customer has opted for Cash on Delivery. Please confirm once received."
          });
        }
      } catch (ioErr) {
        console.warn("Socket notification failed (COD selection):", ioErr.message);
      }

      return res.status(StatusCodes.CREATED).json({
        success: true,
        message: "Direct payment selected. Please provide the amount directly to your expert.",
        booking
      });
    }

    const amountInPaise = Math.round(remainingAmount * 100);

    const receipt = `rcpt_${bookingId.toString().slice(0, 10)}_${Date.now()}`;

    // MOCK FOR LOAD TESTING
    const order = process.env.NODE_ENV === 'test'
      ? { id: `order_mock_${Date.now()}`, amount: amountInPaise, currency: "INR", receipt }
      : await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt,
        notes: {
          bookingId,
          userId
        }
      });

    /* ----------------------------
       SAVE PAYMENT RECORD
    ----------------------------- */

    await Payment.create({
      bookingId,
      userId,
      amount: remainingAmount,
      paymentTypes: "full",
      method,
      status: "pending",
      razorpayOrderId: order.id
    });

    return res.status(StatusCodes.CREATED).json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
      booking
    });

  } catch (err) {
    console.error("Create Payment Error:", err);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to initiate payment"
    });
  }
}

/* =====================================================
   VERIFY RAZORPAY PAYMENT
===================================================== */

export async function verifyPayment(req, res) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Missing payment verification details"
      });
    }

    /* ----------------------------
       VALIDATE SIGNATURE
    ----------------------------- */

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Invalid payment signature"
      });
    }

    /* ----------------------------
       UPDATE PAYMENT (ATOMIC)
    ----------------------------- */

    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        status: "success",
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        transactionId: razorpay_payment_id,
      },
      { new: true }
    );

    if (!payment) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Payment record not found"
      });
    }

    /* ----------------------------
       CREATE TRANSACTION RECORD
    ----------------------------- */
    const updatedBooking = await Booking.findById(payment.bookingId);
    if (!updatedBooking) return res.status(StatusCodes.NOT_FOUND).json({ error: "Booking missing" });

    try {
      // Calculate breakdown: All commission/fees already collected in the token payment phase.
      const adminCommission = 0;
      const providerWalletEarning = payment.amount;
      
      const isFull = payment.paymentTypes === "full";

      // Prevent duplicate transactions
      const existingTx = await Transaction.findOne({ transactionId: payment.transactionId || razorpay_payment_id });
      if (!existingTx) {
        await Transaction.create({
          client: updatedBooking.userId,
          provider: updatedBooking.providerId,
          bookingId: updatedBooking._id,
          service: updatedBooking.serviceId || (updatedBooking.service && updatedBooking.service.toString().match(/^[0-9a-fA-F]{24}$/) ? updatedBooking.service : null),
          transactionId: payment.transactionId || razorpay_payment_id,
          amount: payment.amount,
          
          servicePrice: updatedBooking.price,
          adminCommission,
          providerWalletEarning,
          directPayment: 0,
          
          type: isFull ? "full" : "token",
          status: "Completed",
          date: new Date()
        });
      }

      // Update Booking Status if full
      if (isFull) {
        if (updatedBooking.status === "settling") {
          updatedBooking.status = "completed";
          await updatedBooking.save();

          // Free provider & Increment job count
          if (updatedBooking.providerId) {
            const Provider = (await import("../models/Provider.js")).default;
            await Provider.findByIdAndUpdate(updatedBooking.providerId, {
              isAvailable: true,
              $inc: { jobs: 1 }
            });
          }
        } else if (!["completed", "work-finished"].includes(updatedBooking.status)) {
          updatedBooking.status = "paid";
          await updatedBooking.save();
        }
      }
    } catch (txError) {
      console.error("Transaction Record Error:", txError.message);
    }

    // Real-time Socket.io emissions
    try {
      const { getIO, broadcastStats } = await import("../libs/socket.js");
      broadcastStats(); // Update Admin Dashboard counts & revenue
      const booking = await Booking.findById(payment.bookingId).select("userId providerId serviceType status");
      if (booking) {
        const io = getIO();
        
        // Notify User
        io.to(`user_${booking.userId}`).emit("booking_status", {
          bookingId: booking._id,
          status: booking.status,
          message: "Full payment received. Thank you!"
        });
        
        // Notify the booking room to trigger UI update (important for provider detail page)
        io.to(`booking_${booking._id}`).emit("booking_update", { bookingId: booking._id });
        io.to(`booking_${booking._id}`).emit("booking_status", {
          bookingId: booking._id,
          status: booking.status,
          message: "Full payment received. Thank you!"
        });

        // Notify Provider
        if (booking.providerId) {
          try {
            await ProviderNotification.create({
              providerId: booking.providerId,
              bookingId: booking._id,
              type: "payment_received",
              title: "Payment Received",
              message: `Payment of ₹${payment.amount} has been received for the booking of ${booking.serviceType}.`
            });
          } catch (notifErr) {
            console.error("Failed to create payment received notification:", notifErr.message);
          }

          io.to(`provider_${booking.providerId}`).emit("payment_received", {
            bookingId: booking._id,
            amount: payment.amount,
            message: `Full payment received for ${booking.serviceType}`
          });
        }
      }
    } catch (ioError) {
      console.error("Socket.io Payment Emit Error:", ioError.message);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Payment verified successfully",
      payment
    });

  } catch (err) {
    console.error("Verify Payment Error:", err);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Server error while verifying payment"
    });
  }
}

/* =========================================================
   PAY FULL WITH WALLET BALANCE
   ========================================================= */
export async function payFullWithWallet(req, res) {
  try {
    const { bookingId } = req.body;
    const userId = req.user.sub || req.user.id;

    if (!bookingId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "BookingId required" });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Booking not found" });
    }

    if (booking.status === "paid") {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Booking already paid" });
    }

    // CALCULATE FULL AMOUNT
    const BASE_PLATFORM_FEE = 10;
    const ADDON_PLATFORM_FEE = 5;
    const PLATFORM_CHARGE = BASE_PLATFORM_FEE + (booking.addOns?.length || 0) * ADDON_PLATFORM_FEE;
    const servicePrice = Number(booking.price || 0);
    const emergencyCharge = Number(booking.emergencyFee || 0);
    const taxableValue = servicePrice + emergencyCharge + PLATFORM_CHARGE;
    const GST_PERCENTAGE = 18;
    const gstAmount = Math.round((taxableValue * GST_PERCENTAGE) / 100);
    const totalAmount = taxableValue + gstAmount;

    // Token already paid (if any, normally 0 here)
    const tokenPayment = await Payment.findOne({
      bookingId,
      paymentTypes: "token",
      status: "success"
    }).select("amount");
    const tokenAmount = tokenPayment ? tokenPayment.amount : 0;
    const remainingAmount = Math.max(0, totalAmount - tokenAmount);

    if (remainingAmount <= 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "No remaining payment required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });
    }

    if ((user.walletBalance || 0) < remainingAmount) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Insufficient wallet balance",
        required: remainingAmount,
        available: user.walletBalance || 0
      });
    }

    // 1. Deduct from User Wallet
    user.walletBalance -= remainingAmount;
    await user.save();

    // 2. Create Wallet Transaction Record
    const walletTx = await WalletTransaction.create({
      user: userId,
      amount: remainingAmount,
      balanceAfter: user.walletBalance,
      type: "debit",
      status: "completed",
      description: `Full payment for ${booking.serviceType} (Booking #${bookingId.toString().slice(-6).toUpperCase()})`,
      razorpayPaymentId: "WALLET_PAYMENT",
      razorpayOrderId: `WAL-FL-${bookingId.toString().slice(-6).toUpperCase()}`
    });

    // Create Payment Record
    await Payment.create({
      bookingId,
      userId,
      amount: remainingAmount,
      method: "Wallet",
      status: "success",
      transactionId: walletTx._id.toString(),
      paymentTypes: "full",
    });

    // 3. Update Booking Status
    if (booking.status === "settling") {
      booking.status = "completed";
      // Free provider
      if (booking.providerId) {
        const Provider = (await import("../models/Provider.js")).default;
        await Provider.findByIdAndUpdate(booking.providerId, {
          isAvailable: true,
          $inc: { jobs: 1 }
        });
      }
    } else {
      booking.status = "paid";
    }
    await booking.save();

    // 4. Create Transaction Record
    try {
      const commission = Math.round(servicePrice * 0.10);
      const fullServiceTaxable = servicePrice + emergencyCharge + PLATFORM_CHARGE;
      const fullServiceGst = Math.round((fullServiceTaxable * 18) / 100);

      let totalDeduction = PLATFORM_CHARGE + fullServiceGst + commission;
      if (emergencyCharge > 0) {
        totalDeduction += Math.round(emergencyCharge / 2);
      }

      const adminCommission = tokenAmount > 0 ? 0 : totalDeduction;
      const providerWalletEarning = remainingAmount - adminCommission;

      await Transaction.create({
        client: userId,
        provider: booking.providerId,
        bookingId: booking._id,
        service: booking.serviceId || (booking.service && booking.service.toString().match(/^[0-9a-fA-F]{24}$/) ? booking.service : null),
        transactionId: walletTx._id.toString(),
        amount: remainingAmount,
        servicePrice,
        gst: gstAmount,
        platformFee: PLATFORM_CHARGE,
        totalAmount,
        tokenAmount: tokenAmount,
        adminCommission,
        providerWalletEarning,
        directPayment: 0,
        type: "full",
        status: "Completed",
        date: new Date()
      });
    } catch (txErr) {
      console.error("Wallet Full Tx Error:", txErr.message);
    }

    // 5. Notifications
    try {
      const { getIO, broadcastStats } = await import("../libs/socket.js");
      broadcastStats();
      const io = getIO();

      io.to(`user_${userId}`).emit("wallet_updated", {
        balance: user.walletBalance,
        message: `₹${remainingAmount} deducted from wallet for full booking payment.`
      });

      io.to(`booking_${booking._id}`).emit("booking_update", { bookingId: booking._id });
      io.to(`booking_${booking._id}`).emit("booking_status", {
        bookingId: booking._id,
        status: booking.status,
        message: "Full payment received via wallet. Thank you!"
      });

      if (booking.providerId) {
        io.to(`provider_${booking.providerId}`).emit("payment_received", {
          bookingId: booking._id,
          amount: remainingAmount,
          type: "full",
          message: `Full payment of ₹${remainingAmount} received via wallet for ${booking.serviceType}`
        });
      }
    } catch (ioErr) {
      console.error("Socket Error:", ioErr.message);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Payment processed via wallet",
      newBalance: user.walletBalance,
      booking
    });

  } catch (error) {
    console.error("Wallet Full Payment Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
}