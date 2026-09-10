import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import Transaction from "../models/Transaction.js";
import { StatusCodes } from "http-status-codes";
import Razorpay from "razorpay";
import crypto from "crypto";
import { dispatchProviders } from "../services/providerDispatch.service.js";
import User from "../models/User.js";
import WalletTransaction from "../models/WalletTransaction.js";
import BiddingRequest from "../models/BiddingRequest.js";
import Bid from "../models/Bid.js";
import Provider from "../models/Provider.js";
import ProviderNotification from "../models/ProviderNotification.js";
import { sendProviderNotification } from "../services/fcm.service.js";
import { getIO, broadcastStats } from "../libs/socket.js";

/* =========================================================
   RAZORPAY INSTANCE
========================================================= */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* =========================================================
   HELPER: FINALIZE BIDDING JOB
========================================================= */

async function finalizeBiddingJob(booking) {
  try {
    const requestId = booking.service?.requestId;
    const bidId = booking.service?.bidId;

    if (!requestId || !bidId) return;

    const request = await BiddingRequest.findById(requestId);
    if (!request || request.status !== "open") return;

    const bid = await Bid.findById(bidId);
    if (!bid || bid.status !== "pending") return;

    // 1. Update Bid Status
    bid.status = "accepted";
    bid.bookingId = booking._id;
    await bid.save();

    // 2. Reject other bids and notify providers
    const otherBids = await Bid.find({ requestId: requestId, _id: { $ne: bidId } });
    for (const otherBid of otherBids) {
      otherBid.status = "rejected";
      await otherBid.save();

      const otherProvider = await Provider.findById(otherBid.providerId);
      if (otherProvider) {
        await ProviderNotification.create({
          providerId: otherProvider._id,
          type: "bid_rejected",
          title: "Update on your Bid",
          message: `The customer has selected another provider for the ${request.subService} request.`,
          metadata: { requestId: requestId.toString() }
        });
      }
    }

    // 3. Update Request
    request.status = "assigned";
    request.assignedProviderId = bid.providerId;
    request.selectedBidId = bidId;
    request.bookingId = booking._id;
    await request.save();

    // 4. Notify Accepted Provider
    const provider = await Provider.findById(bid.providerId);
    if (provider) {
      await ProviderNotification.create({
        providerId: provider._id,
        type: "bid_accepted",
        title: "🎉 Bid Accepted!",
        message: `Your bid for ${request.subService} has been accepted. The customer has completed the payment.`,
        metadata: { requestId: requestId.toString(), bookingId: booking._id.toString() }
      });

      sendProviderNotification(provider, {
        title: "🎉 Bid Accepted!",
        body: `Your bid for ${request.subService} has been accepted and payment confirmed.`,
        data: { requestId: requestId.toString(), bookingId: booking._id.toString(), type: "BID_ACCEPTED" }
      });

      // Emit Socket Event to Provider
      try {
        getIO().to(`provider_${provider._id}`).emit("bid_accepted", {
          requestId: requestId.toString(),
          bidId: bidId.toString(),
          bookingId: booking._id.toString()
        });
      } catch (err) { }
    }

    // 5. Update Booking status to 'accepted' (from 'paid') for Bidding
    booking.status = "accepted";
    await booking.save();

    // Emit Socket Event to Customer
    try {
      getIO().to(`user_${booking.userId}`).emit("bid_accepted", {
        requestId: requestId.toString(),
        bidId: bidId.toString(),
        bookingId: booking._id.toString()
      });
    } catch (err) { }

  } catch (error) {
    console.error("Error finalizing bidding job:", error);
  }
}


/* =========================================================
   CREATE TOKEN ORDER
========================================================= */

export async function createTokenOrder(req, res) {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "BookingId required",
      });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Booking not found",
      });
    }

    //  calculate Add On(if having)

    const BASE_PLATFORM_FEE = 10;
    const ADDON_PLATFORM_FEE = 5;
    const PLATFORM_CHARGE = BASE_PLATFORM_FEE + (booking.addOns?.length || 0) * ADDON_PLATFORM_FEE;
    const servicePrice = Number(booking.price || 0);
    const emergencyCharge = Number(booking.emergencyFee || 0);

    // GST (18%) on (Service Price + Emergency Fee + Platform Charge)
    const taxableValue = servicePrice + emergencyCharge + PLATFORM_CHARGE;
    const GST_PERCENTAGE = 18;
    const gstAmount = Math.round((taxableValue * GST_PERCENTAGE) / 100);

    // Total Amount = Service + Emergency + GST + Platform Fee
    const finalTotal = taxableValue + gstAmount;

    // Token payment = 30% of service charge + emergency + platform charge + 18% GST on these
    const tokenServicePortion = Math.round(servicePrice * 0.30);
    const tokenTaxableValue = tokenServicePortion + emergencyCharge + PLATFORM_CHARGE;
    const tokenGst = Math.round((tokenTaxableValue * GST_PERCENTAGE) / 100);
    const tokenAmount = tokenTaxableValue + tokenGst;

    /*  FIX — Short Receipt (Razorpay max 40 char) */
    const shortBookingId = bookingId.toString().slice(-8);
    const shortReceipt =
      `tk_${shortBookingId}_${Date.now().toString().slice(-4)}`;

    // MOCK FOR LOAD TESTING
    const order = process.env.NODE_ENV === 'test'
      ? { id: `order_mock_${Date.now()}`, amount: tokenAmount * 100, currency: "INR", receipt: shortReceipt }
      : await razorpay.orders.create({
        amount: tokenAmount * 100,
        currency: "INR",
        receipt: shortReceipt,
      });

    /* ✅ Save Payment Record */
    await Payment.create({
      bookingId,
      userId: req.user.sub,
      amount: tokenAmount,
      method: "Razorpay",
      status: "pending",
      razorpayOrderId: order.id,
      paymentTypes: "token",
    });

    return res.status(StatusCodes.OK).json({
      order,
      key: process.env.RAZORPAY_KEY_ID,
    });

  } catch (err) {
    console.error("TOKEN ORDER ERROR 👉", err);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Token order failed",
    });
  }
}

/* =========================================================
   VERIFY TOKEN PAYMENT
========================================================= */

export async function verifyTokenPayment(req, res) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Invalid payment data",
      });
    }

    /* ================= VERIFY SIGNATURE ================= */
    let isSignatureValid = false;
    if (process.env.NODE_ENV === "test") {
      isSignatureValid = true;
    } else {
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest("hex");
      isSignatureValid = expectedSignature === razorpay_signature;
    }

    if (!isSignatureValid) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Invalid payment signature",
      });
    }

    /* ================= UPDATE PAYMENT ================= */
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
        error: "Payment record not found or already processed",
      });
    }

    // console.log(" Payment updated successfully");
    // console.log("Payment:", payment);

    /* ================= UPDATE BOOKING ================= */

    const booking = await Booking.findByIdAndUpdate(
      payment.bookingId,
      {
        status: "accepted",
      },
      { new: true }
    );
    if (!booking) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Booking not found",
      });
    }

    // FINALIZATION FOR BIDDING
    if (booking.service?.requestId) {
      await finalizeBiddingJob(booking);
    }

    // console.log("Booking marked as accepted");

    /* ================= CREATE TRANSACTION ================= */
    try {
      // Breakdown calculation for Transaction record
      const servicePrice = Number(booking.price || 0);
      const emergencyCharge = Number(booking.emergencyFee || 0);
      const BASE_PLATFORM_FEE = 10;
      const ADDON_PLATFORM_FEE = 5;
      const PLATFORM_CHARGE = BASE_PLATFORM_FEE + (booking.addOns?.length || 0) * ADDON_PLATFORM_FEE;

      const taxableValue = servicePrice + emergencyCharge + PLATFORM_CHARGE;
      const GST_PERCENTAGE = 18;
      const gstAmount = Math.round((taxableValue * GST_PERCENTAGE) / 100);
      const totalAmount = taxableValue + gstAmount;
      const tokenAmount = payment.amount; // Use the actual paid token amount

      // Company Share (Deduction): platformCharge + 10% Commission + 18% GST on (servicePrice + emergencyFee + platformFee) [+ emergencyCharge / 2 if emergency]
      const fullServiceTaxable = servicePrice + emergencyCharge + PLATFORM_CHARGE;
      const fullServiceGst = Math.round((fullServiceTaxable * 18) / 100);
      const commission = Math.round(servicePrice * 0.10);

      let totalDeduction = PLATFORM_CHARGE + fullServiceGst + commission;
      if (emergencyCharge > 0) {
        totalDeduction += Math.round(emergencyCharge / 2);
      }

      const adminCommission = totalDeduction;
      const providerWalletEarning = tokenAmount - adminCommission;
      const directPayment = totalAmount - tokenAmount;

      await Transaction.create({
        client: payment.userId,
        provider: booking.providerId,
        bookingId: payment.bookingId,
        service: booking.serviceId || (booking.service && booking.service.toString().match(/^[0-9a-fA-F]{24}$/) ? booking.service : null),
        transactionId: payment.transactionId,
        amount: tokenAmount,

        // Detailed Breakdown
        servicePrice,
        gst: gstAmount,
        platformFee: PLATFORM_CHARGE,
        totalAmount,
        tokenAmount,
        adminCommission,
        providerWalletEarning,
        directPayment,

        type: "token",
        status: "Completed",
      });
    } catch (txError) {
      console.error("Transaction Creation Error (Token):", txError.message);
    }

    /* ================= NOTIFY PROVIDER VIA SOCKET ================= */
    try {
      broadcastStats();
      const io = getIO();

      // Notify booking room — triggers provider's booking_update listener
      io.to(`booking_${booking._id}`).emit("booking_update", { bookingId: booking._id });

      // Notify provider directly with the paid amount
      if (booking.providerId) {
        io.to(`provider_${booking.providerId}`).emit("payment_received", {
          bookingId: booking._id,
          amount: payment.amount,
          type: "token",
          message: `Token payment of ₹${payment.amount} received for ${booking.serviceType}`
        });
      }
    } catch (ioErr) {
      console.error("Socket Emit Error (Token Payment):", ioErr.message);
    }

    /* ================= RESPONSE ================= */

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Payment verified and booking updated",
      booking,
    });

  } catch (err) {
    console.error("VERIFY PAYMENT ERROR:", err);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Verification failed",
    });
  }
}

/* =========================================================
   PAY TOKEN WITH WALLET BALANCE
========================================================= */

export async function payTokenWithWallet(req, res) {
  try {
    const { bookingId } = req.body;
    const userId = req.user.sub;

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

    // CONSISTENT CALCULATION
    const BASE_PLATFORM_FEE = 10;
    const ADDON_PLATFORM_FEE = 5;
    const PLATFORM_CHARGE = BASE_PLATFORM_FEE + (booking.addOns?.length || 0) * ADDON_PLATFORM_FEE;
    const servicePrice = Number(booking.price || 0);
    const emergencyCharge = Number(booking.emergencyFee || 0);
    const taxableValue = servicePrice + emergencyCharge + PLATFORM_CHARGE;
    const GST_PERCENTAGE = 18;
    const gstAmount = Math.round((taxableValue * GST_PERCENTAGE) / 100);
    const finalTotal = taxableValue + gstAmount;

    // Token payment = 30% of service charge + emergency + platform charge + 18% GST on these
    const tokenServicePortion = Math.round(servicePrice * 0.30);
    const tokenTaxableValue = tokenServicePortion + emergencyCharge + PLATFORM_CHARGE;
    const tokenGst = Math.round((tokenTaxableValue * GST_PERCENTAGE) / 100);
    const tokenAmount = tokenTaxableValue + tokenGst;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });
    }

    if ((user.walletBalance || 0) < tokenAmount) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Insufficient wallet balance",
        required: tokenAmount,
        available: user.walletBalance || 0
      });
    }

    // 1. Deduct from User Wallet
    user.walletBalance -= tokenAmount;
    await user.save();

    // 2. Create Wallet Transaction Record
    const walletTx = await WalletTransaction.create({
      user: userId,
      amount: tokenAmount,
      balanceAfter: user.walletBalance,
      type: "debit",
      status: "completed",
      description: `Token payment for ${booking.serviceType} (Booking #${bookingId.toString().slice(-6).toUpperCase()})`,
      razorpayPaymentId: "WALLET_PAYMENT",
      razorpayOrderId: `WAL-${bookingId.toString().slice(-6).toUpperCase()}`
    });

    // Create Payment Record so it reflects in provider app
    await Payment.create({
      bookingId,
      userId,
      amount: tokenAmount,
      method: "Wallet",
      status: "success",
      transactionId: walletTx._id.toString(),
      paymentTypes: "token",
    });

    // 3. Mark Booking as Accepted
    booking.status = "accepted";
    await booking.save();

    // FINALIZATION FOR BIDDING
    if (booking.service?.requestId) {
      await finalizeBiddingJob(booking);
    }

    // 4. Create Regular Transaction Entry
    try {
      const fullServiceTaxable = servicePrice + emergencyCharge + PLATFORM_CHARGE;
      const fullServiceGst = Math.round((fullServiceTaxable * 18) / 100);
      const commission = Math.round(servicePrice * 0.10);

      let totalDeduction = PLATFORM_CHARGE + fullServiceGst + commission;
      if (emergencyCharge > 0) {
        totalDeduction += Math.round(emergencyCharge / 2);
      }

      const adminCommission = totalDeduction;
      const providerWalletEarning = tokenAmount - adminCommission;
      const directPayment = finalTotal - tokenAmount;

      await Transaction.create({
        client: userId,
        bookingId: booking._id,
        service: booking.serviceId || (booking.service && booking.service.toString().match(/^[0-9a-fA-F]{24}$/) ? booking.service : null),
        transactionId: walletTx._id.toString(),
        amount: tokenAmount,
        servicePrice,
        gst: gstAmount,
        platformFee: PLATFORM_CHARGE,
        totalAmount: finalTotal,
        tokenAmount,
        adminCommission,
        providerWalletEarning,
        directPayment,
        type: "token",
        status: "Completed",
      });
    } catch (txErr) {
      console.error("Wallet Token Tx Error:", txErr.message);
    }

    // 6. Real-time Notifications
    try {
      const io = getIO();

      // Notify the user about wallet deduction
      io.to(`user_${userId}`).emit("wallet_updated", {
        balance: user.walletBalance,
        message: `₹${tokenAmount} deducted from wallet for your booking.`
      });

      // Notify booking room — triggers provider's booking_update listener
      io.to(`booking_${booking._id}`).emit("booking_update", { bookingId: booking._id });

      // Notify provider directly with the paid amount
      if (booking.providerId) {
        io.to(`provider_${booking.providerId}`).emit("payment_received", {
          bookingId: booking._id,
          amount: tokenAmount,
          type: "token",
          message: `Token payment of ₹${tokenAmount} received via wallet for ${booking.serviceType}`
        });
      }

      broadcastStats();
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
    console.error("Wallet Booking Payment Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
}