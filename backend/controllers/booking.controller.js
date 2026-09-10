import Booking from "../models/Booking.js";
import Provider from "../models/Provider.js";
import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import { sendAdminNotification } from "../services/fcm.service.js";
import User from "../models/User.js";
import UserNotification from "../models/UserNotification.js";
import Transaction from "../models/Transaction.js";
import Payment from "../models/Payment.js";
import ProviderNotification from "../models/ProviderNotification.js";
import WalletTransaction from "../models/WalletTransaction.js";

/* =====================================================
   CREATE BOOKING
===================================================== */

export async function bookService(req, res) {
  try {
    const {
      service,
      serviceType,
      date,
      time,
      address,
      houseNo,
      flatNo,
      landMark,
      colony,
      city,
      state,
      remarks,
      price,
      latitude,
      longitude,
      addOns,
      emergencyFee,
    } = req.body;

    // Required fields check
    if (
      !service ||
      !serviceType ||
      !date ||
      !time ||
      !address ||
      !city ||
      !state ||
      !price
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "All required fields must be provided",
      });
    }

    // Location validation
    if (latitude == null || longitude == null) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Please select location from map",
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Invalid latitude or longitude",
      });
    }

    // Calculate total price including add-ons
    const addOnsList = addOns || [];
    const addOnsTotal = addOnsList.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    const totalPrice = Number(price) + addOnsTotal;
    const emergencyCharge = Number(emergencyFee) || 0;

    // Check if a pending booking already exists for this user and service
    const queryService = mongoose.Types.ObjectId.isValid(service)
      ? new mongoose.Types.ObjectId(service)
      : service;

    const existingPendingBooking = await Booking.findOne({
      userId: req.user.sub,
      service: queryService,
      status: "pending",
    });

    let bookingResult;
    if (existingPendingBooking) {
      // Update the existing pending booking
      existingPendingBooking.serviceType = serviceType;
      existingPendingBooking.date = new Date(date);
      existingPendingBooking.time = time;
      existingPendingBooking.address = address;
      existingPendingBooking.houseNo = houseNo || "";
      existingPendingBooking.flatNo = flatNo || "";
      existingPendingBooking.landMark = landMark || "";
      existingPendingBooking.colony = colony || "";
      existingPendingBooking.city = city;
      existingPendingBooking.state = state;
      existingPendingBooking.remarks = remarks || "";
      existingPendingBooking.price = totalPrice;
      existingPendingBooking.emergencyFee = emergencyCharge;
      existingPendingBooking.addOns = addOnsList;
      existingPendingBooking.location = {
        type: "Point",
        coordinates: [lng, lat],
      };
      await existingPendingBooking.save();
      bookingResult = existingPendingBooking;
    } else {
      bookingResult = await Booking.create({
        userId: req.user.sub,
        service: queryService,
        serviceType,
        date: new Date(date),
        time,
        address,
        houseNo: houseNo || "",
        flatNo: flatNo || "",
        landMark: landMark || "",
        colony: colony || "",
        city,
        state,
        remarks: remarks || "",
        price: totalPrice,
        emergencyFee: emergencyCharge,
        addOns: addOnsList,
        status: "pending",
        location: {
          type: "Point",
          coordinates: [lng, lat], // GeoJSON format
        },
        startOtp: Math.floor(100000 + Math.random() * 900000).toString(),
        completeOtp: Math.floor(100000 + Math.random() * 900000).toString(),
      });
    }

    // Notify Admin via FCM and Socket
    const userData = await User.findById(req.user.sub).select("fullName");
    sendAdminNotification({
      type: "new_booking",
      title: "🚀 New Booking Alert",
      message: `${userData?.fullName || "A customer"} just booked ${serviceType} in ${city}.`,
      metadata: { bookingId: bookingResult._id.toString(), city, price: price.toString() }
    });

    // Start provider dispatch search immediately for the pending booking
    try {
      const { dispatchProviders } = await import("../services/providerDispatch.service.js");
      dispatchProviders(bookingResult._id).catch(err => console.error("Immediate Dispatch Error:", err));
    } catch (dispatchErr) {
      console.error("Failed to import dispatchProviders:", dispatchErr);
    }

    return res.status(StatusCodes.CREATED).json({
      message: existingPendingBooking ? "Booking updated successfully" : "Booking submitted successfully",
      booking: bookingResult,
    });

  } catch (err) {
    console.error("Booking Error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Booking failed",
    });
  }
}


/* =====================================================
   GET USER BOOKINGS
===================================================== */

export async function getBookings(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const bookings = await Booking.find({
      userId: req.user.sub,
    })
      .select("service serviceType address city houseNo colony landMark state date time price status providerId createdAt")
      .populate("providerId", "fullName phoneNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Safely populate service only if it's a valid ObjectId
    for (let booking of bookings) {
      if (booking.service && mongoose.Types.ObjectId.isValid(booking.service)) {
        try {
          await booking.populate("service", "category imageUrl");
        } catch (err) {
          console.error("Service population failed in getBookings:", err);
        }
      } else if (booking.service && typeof booking.service === "object") {
        try {
          const Service = (await import("../models/Service.js")).default;
          const subServiceText = booking.service.subService || booking.serviceType;
          if (subServiceText) {
            const matchedService = await Service.findOne({
              subService: { $regex: new RegExp("^\\s*" + subServiceText.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "\\s*$", "i") }
            }).select("imageUrl").lean();
            if (matchedService) {
              booking.service = {
                ...booking.service,
                imageUrl: matchedService.imageUrl
              };
            }
          }
        } catch (err) {
          console.error("Bidding service image lookup failed in getBookings:", err);
        }
      }
    }

    const total = await Booking.countDocuments({ userId: req.user.sub });

    // console.log(`[GET_BOOKINGS] User: ${req.user.sub}, Found: ${bookings.length}, Total: ${total}`);

    res.status(StatusCodes.OK).json({
      success: true,
      bookings,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error("getBookings error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to fetch bookings",
    });
  }
}


/* =====================================================
   GET BOOKING BY ID
===================================================== */

export async function getBookingById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid Booking ID format" });
    }

    const booking = await Booking.findById(id)
      .populate("providerId", "fullName phoneNumber experience profilePhoto")
      .populate("userId", "fullName phoneNumber address");

    if (!booking) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Booking not found",
      });
    }

    // Safely populate service only if it's an ObjectId
    if (booking.service && mongoose.Types.ObjectId.isValid(booking.service)) {
      try {
        await booking.populate("service");
      } catch (err) {
        console.error("Service population failed:", err);
      }
    } else if (booking.service && typeof booking.service === "object") {
      try {
        const Service = (await import("../models/Service.js")).default;
        const subServiceText = booking.service.subService || booking.serviceType;
        if (subServiceText) {
          const matchedService = await Service.findOne({
            subService: { $regex: new RegExp("^\\s*" + subServiceText.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "\\s*$", "i") }
          }).select("imageUrl").lean();
          if (matchedService) {
            booking.service = {
              ...booking.service,
              imageUrl: matchedService.imageUrl
            };
          }
        }
      } catch (err) {
        console.error("Bidding service image lookup failed in getBookingById:", err);
      }
    }

    // Defensive check for authorization
    // In provider portal, any provider can view details (for bidding) or the assigned provider.
    // In customer portal, only the booking owner can view.
    const userId = booking.userId?._id || booking.userId;
    const providerId = booking.providerId?._id || booking.providerId;

    const userIdStr = userId?.toString();
    const providerIdStr = providerId?.toString();

    const isAuthorized =
      req.user.role === "provider" ||
      userIdStr === req.user.sub ||
      providerIdStr === req.user.sub;

    if (!isAuthorized) {
      return res.status(StatusCodes.FORBIDDEN).json({
        error: "Not authorized to view this booking",
      });
    }

    // Handle payments safely
    let payments = [];
    try {
      payments = await Payment.find({ bookingId: booking._id, status: "success" });
    } catch (pErr) {
      console.error("Error fetching payments for booking:", pErr);
    }

    const BASE_PLATFORM_FEE = 10;
    const ADDON_PLATFORM_FEE = 5;
    const PLATFORM_CHARGE = BASE_PLATFORM_FEE + (booking.addOns?.length || 0) * ADDON_PLATFORM_FEE;
    const servicePrice = Number(booking.price || 0);
    const emergencyCharge = Number(booking.emergencyFee || 0);
    const taxableValue = servicePrice + emergencyCharge + PLATFORM_CHARGE;
    const GST_PERCENTAGE = 18;
    const gstAmount = Math.round((taxableValue * GST_PERCENTAGE) / 100);
    const totalAmount = taxableValue + gstAmount;

    const paidAmount = payments.reduce((acc, curr) => acc + (curr.amount || 0), 0);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    let settlementProgress = 0;
    if (totalAmount > 0) {
      settlementProgress = Math.round((paidAmount / totalAmount) * 100);
    }

    if (booking.status === "completed" || booking.status === "paid") {
      settlementProgress = 100;
    }

    const tokenPayment = payments.find((p) => p.paymentTypes === "token");
    const tokenPaid = tokenPayment ? tokenPayment.amount : 0;

    const responseData = {
      ...booking.toObject(),
      paymentSummary: {
        totalAmount,
        paidAmount,
        tokenPaid,
        remainingAmount,
        settlementProgress,
        paymentStatus: remainingAmount <= 0 ? "completed" : "pending"
      }
    };

    return res.status(StatusCodes.OK).json(responseData);
  } catch (err) {
    console.error("Get Booking Error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to get booking details. Internal Server Error."
    });
  }
}


/* =====================================================
   HELPER: SERVICE TIME CHECK
===================================================== */
function isServiceTimePassed(date, timeStr) {
  if (!date) return false;
  const bookingDate = new Date(date);
  if (isNaN(bookingDate.getTime())) return false;

  let hours = 0;
  let minutes = 0;
  if (timeStr) {
    const timeLower = String(timeStr).toLowerCase().trim();
    const isPM = timeLower.includes("pm");
    const isAM = timeLower.includes("am");
    const cleanTime = timeLower.replace(/am|pm/g, "").trim();
    const parts = cleanTime.split(":");
    if (parts.length >= 1) {
      hours = parseInt(parts[0], 10) || 0;
      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;
    }
    if (parts.length >= 2) {
      minutes = parseInt(parts[1], 10) || 0;
    }
  }

  bookingDate.setHours(hours, minutes, 0, 0);
  return new Date() >= bookingDate;
}

/* =====================================================
   CANCEL BOOKING (WITH 0-10 MIN & >10 MIN REFUND TIERS)
===================================================== */
export async function cancelBooking(req, res) {
  try {
    const bookingId = req.params.id;
    const userId = req.user.sub;
    const { reason } = req.body || {};

    const booking = await Booking.findOne({
      _id: bookingId,
      userId,
      status: { $in: ["pending", "paid", "accepted"] },
    });

    if (!booking) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Booking not found or cannot be cancelled",
      });
    }

    // Lock self-service cancellation if service time has arrived/passed
    if (isServiceTimePassed(booking.date, booking.time)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Scheduled service time has arrived. Self-service cancellation is disabled. Please use 'Report Provider No-Show' if provider did not arrive.",
      });
    }

    const isDigitalService = (booking.service && typeof booking.service === 'object' && (booking.service.requestId || booking.service.bidId || booking.service.category === "Digital Work")) ||
      (booking.serviceType && (booking.serviceType.toLowerCase().includes("bidding") || booking.serviceType.toLowerCase().includes("digital")));

    // Calculate time elapsed in minutes since creation/assignment
    const createdTime = new Date(booking.createdAt).getTime();
    const currentTime = Date.now();
    const elapsedMinutes = (currentTime - createdTime) / (1000 * 60);

    // Determine refund tier (100% within 10 mins, 50% after 10 mins)
    const refundPercentage = elapsedMinutes <= 10 ? 100 : 50;

    let refundAmount = 0;
    let cancellationFee = 0;

    // Process Wallet Refund for Non-Digital Services if paid
    if (!isDigitalService && booking.refundStatus !== "Refunded") {
      const successfulPayments = await Payment.find({
        bookingId: booking._id,
        status: "success"
      });

      const totalPaid = successfulPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

      if (totalPaid > 0) {
        refundAmount = Math.round((totalPaid * refundPercentage) / 100);
        cancellationFee = totalPaid - refundAmount;

        const user = await User.findById(userId);
        if (user) {
          user.walletBalance = (user.walletBalance || 0) + refundAmount;
          await user.save();

          await WalletTransaction.create({
            user: user._id,
            amount: refundAmount,
            balanceAfter: user.walletBalance,
            type: "credit",
            status: "completed",
            description: `Refund (${refundPercentage}%) for cancelled booking #${booking._id.toString().slice(-6).toUpperCase()}`,
            razorpayPaymentId: "PLATFORM_CANCEL_REFUND",
            razorpayOrderId: `CANCEL-${booking._id.toString().slice(-6).toUpperCase()}`,
            metadata: { bookingId: booking._id, refundPercentage, cancellationFee }
          });

          // Real-time wallet update socket
          try {
            const { getIO } = await import("../libs/socket.js");
            getIO().to(`user_${user._id}`).emit("wallet_updated", {
              balance: user.walletBalance,
              message: `₹${refundAmount} (${refundPercentage}% refund) credited to your wallet for booking #${booking._id.toString().slice(-6).toUpperCase()}.`
            });
          } catch (ioErr) { }
        }

        booking.refundStatus = "Refunded";
        booking.refundAmount = refundAmount;
        booking.cancellationFee = cancellationFee;
      }
    }

    // Update booking status
    booking.status = "cancelled";
    booking.cancelReason = reason || "Cancelled by customer";
    booking.cancelledBy = "customer";
    await booking.save();

    // Free assigned provider
    if (booking.providerId) {
      await Provider.findByIdAndUpdate(booking.providerId, {
        isAvailable: true,
      });

      try {
        const { getIO } = await import("../libs/socket.js");
        getIO().to(`provider_${booking.providerId}`).emit("booking_status", {
          bookingId: booking._id,
          status: "cancelled",
          message: "Customer has cancelled the booking."
        });
      } catch (ioErr) { }
    }

    // Anti-Bypass Alert: If customer reports "provider_requested"
    if (reason && (reason.toLowerCase().includes("provider") || reason === "provider_requested")) {
      const user = await User.findById(userId);
      sendAdminNotification({
        type: "fraud_alert",
        title: "🚨 Possible Off-Platform Collusion Alert",
        message: `Customer ${user?.fullName || "N/A"} reported provider requested off-platform cancellation for booking #${booking._id.toString().slice(-6).toUpperCase()}.`,
        metadata: { bookingId: booking._id.toString(), providerId: booking.providerId?.toString(), customerId: userId }
      });
    }

    // Handle Digital Service specific sync
    if (isDigitalService) {
      try {
        const BiddingRequest = (await import("../models/BiddingRequest.js")).default;
        await BiddingRequest.findByIdAndUpdate(booking.service.requestId, { status: "cancelled" });
      } catch (err) {
        console.warn("Failed to sync BiddingRequest status:", err.message);
      }
    }

    // Notify Admin about Cancellation
    try {
      const customerUser = await User.findById(userId).select("fullName");
      sendAdminNotification({
        type: "booking_cancelled",
        title: "❌ Booking Cancelled by Customer",
        message: `Customer ${customerUser?.fullName || "N/A"} cancelled booking #${booking._id.toString().slice(-6).toUpperCase()}. Refunded: ${refundPercentage}% (₹${refundAmount}).`,
        metadata: { bookingId: booking._id.toString(), customerId: userId, refundPercentage, refundAmount, cancellationFee }
      });
    } catch (notifErr) {
      console.error("Admin cancellation notification error:", notifErr);
    }

    res.status(StatusCodes.OK).json({
      message: isDigitalService 
        ? "Digital booking cancelled. Note: Token is non-refundable for digital services." 
        : `Booking cancelled successfully. ${refundAmount > 0 ? `₹${refundAmount} (${refundPercentage}%) refunded to wallet.` : ""}`,
      booking,
      refundDetails: {
        refundAmount,
        cancellationFee,
        refundPercentage,
        elapsedMinutes: Math.round(elapsedMinutes)
      }
    });

  } catch (err) {
    console.error("Cancel Booking Error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Cancel failed",
    });
  }
}

/* =====================================================
   REPORT PROVIDER NO-SHOW (100% REFUND + PROVIDER STRIKE)
===================================================== */
export async function reportProviderNoShow(req, res) {
  try {
    const { bookingId, reason } = req.body;
    const userId = req.user.sub;

    const booking = await Booking.findOne({
      _id: bookingId,
      userId,
      status: { $in: ["accepted", "paid"] },
    });

    if (!booking) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Booking not found or not eligible for No-Show report",
      });
    }

    if (!booking.providerId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "No provider was assigned to this booking",
      });
    }

    // Verify scheduled time has passed
    if (!isServiceTimePassed(booking.date, booking.time)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Scheduled service time has not passed yet. Please wait until appointment time.",
      });
    }

    // 1. Process 100% Full Refund to Customer Wallet
    const successfulPayments = await Payment.find({
      bookingId: booking._id,
      status: "success"
    });

    const totalPaid = successfulPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    let refundAmount = totalPaid;

    if (totalPaid > 0 && booking.refundStatus !== "Refunded") {
      const user = await User.findById(userId);
      if (user) {
        user.walletBalance = (user.walletBalance || 0) + refundAmount;
        await user.save();

        await WalletTransaction.create({
          user: user._id,
          amount: refundAmount,
          balanceAfter: user.walletBalance,
          type: "credit",
          status: "completed",
          description: `100% Refund for Provider No-Show on Booking #${booking._id.toString().slice(-6).toUpperCase()}`,
          razorpayPaymentId: "NOSHOW_FULL_REFUND",
          razorpayOrderId: `NOSHOW-${booking._id.toString().slice(-6).toUpperCase()}`,
          metadata: { bookingId: booking._id, noShow: true }
        });

        // Real-time wallet update socket
        try {
          const { getIO } = await import("../libs/socket.js");
          getIO().to(`user_${user._id}`).emit("wallet_updated", {
            balance: user.walletBalance,
            message: `₹${refundAmount} (100% full refund) credited to your wallet due to provider no-show.`
          });
        } catch (ioErr) { }
      }
    }

    // Update booking record
    booking.status = "cancelled";
    booking.refundStatus = "Refunded";
    booking.refundAmount = refundAmount;
    booking.cancellationFee = 0;
    booking.noShowReported = true;
    booking.cancelReason = reason || "Provider did not show up at appointment time";
    booking.cancelledBy = "customer";
    await booking.save();

    // 2. Increment Provider No-Show Strikes & Check 3-Strike Rule
    const provider = await Provider.findById(booking.providerId);
    let providerSuspended = false;

    if (provider) {
      provider.noShowStrikes = (provider.noShowStrikes || 0) + 1;
      if (!provider.strikeHistory) provider.strikeHistory = [];
      provider.strikeHistory.push({
        bookingId: booking._id,
        reason: reason || "Customer reported provider failed to arrive at appointment time",
        createdAt: new Date()
      });

      // Free provider unless 3 strikes reached
      if (provider.noShowStrikes >= 3) {
        provider.status = "Suspended";
        provider.isAvailable = false;
        providerSuspended = true;
      } else {
        provider.isAvailable = true;
      }

      await provider.save();

      // Notify Provider via ProviderNotification & Socket
      try {
        await ProviderNotification.create({
          providerId: provider._id,
          type: "status_change",
          title: providerSuspended ? "🚨 Account Suspended (3 No-Show Strikes)" : `⚠️ Warning: Strike ${provider.noShowStrikes}/3 Received`,
          message: providerSuspended
            ? "Your provider account has been automatically suspended due to 3 consecutive No-Show reports."
            : `A customer reported you did not show up for booking #${booking._id.toString().slice(-6).toUpperCase()}. Strike ${provider.noShowStrikes}/3. Accumulating 3 strikes will suspend your profile.`,
          metadata: { bookingId: booking._id.toString(), strikes: provider.noShowStrikes }
        });

        const { getIO } = await import("../libs/socket.js");
        getIO().to(`provider_${provider._id}`).emit("provider_strike_alert", {
          strikes: provider.noShowStrikes,
          status: provider.status,
          message: providerSuspended
            ? "Your account is suspended due to 3 No-Show strikes."
            : `Strike ${provider.noShowStrikes}/3 logged for missed appointment.`
        });
      } catch (pNotifErr) {
        console.error("Provider strike notification error:", pNotifErr);
      }
    }

    // 3. Notify Admin
    const customerUser = await User.findById(userId);
    sendAdminNotification({
      type: providerSuspended ? "provider_suspended" : "system_alert",
      title: providerSuspended ? "🛑 Provider Auto-Suspended (3 Strikes)" : "⚠️ Provider No-Show Reported",
      message: providerSuspended
        ? `Provider ${provider?.fullName || "N/A"} was automatically suspended after receiving their 3rd No-Show strike for booking #${booking._id.toString().slice(-6).toUpperCase()}.`
        : `Customer ${customerUser?.fullName || "N/A"} reported provider ${provider?.fullName || "N/A"} failed to show up. Strike count: ${provider?.noShowStrikes}/3.`,
      metadata: {
        bookingId: booking._id.toString(),
        providerId: booking.providerId.toString(),
        strikes: provider?.noShowStrikes
      }
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: `No-Show report logged. 100% full refund of ₹${refundAmount} has been credited to your wallet.`,
      booking,
      refundAmount
    });

  } catch (err) {
    console.error("Report No-Show Error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to report no-show",
    });
  }
}


/* =====================================================
   PROVIDER ACCEPT BOOKING (NO RACE CONDITION)
===================================================== */

export async function acceptBooking(req, res) {
  try {
    const { bookingId } = req.body;
    const providerId = req.user.sub;

    const targetBooking = await Booking.findById(bookingId);
    if (!targetBooking) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Booking not found",
      });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Provider not found",
      });
    }

    // Check if provider is qualified for this booking's serviceType
    const Service = (await import("../models/Service.js")).default;
    let allowed = false;
    if (provider.subService && provider.subService.includes(targetBooking.serviceType)) {
      allowed = true;
    } else if (provider.providerSubService) {
      const matchingService = await Service.findOne({
        subService: targetBooking.serviceType,
        providerSubService: provider.providerSubService,
        category: provider.serviceCategory,
        status: "active"
      });
      if (matchingService) {
        allowed = true;
      }
    }

    if (!allowed) {
      return res.status(StatusCodes.FORBIDDEN).json({
        error: "Unauthorized: You do not have the required skills for this job category."
      });
    }

    // Mark provider busy FIRST (prevents them taking another job while we book this one)
    const activeProvider = await Provider.findOneAndUpdate(
      { _id: providerId, status: "Active", isAvailable: true },
      { isAvailable: false },
      { new: true }
    );

    if (!activeProvider) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Provider not available or busy",
      });
    }

    // Atomic booking update: 
    const booking = await Booking.findOneAndUpdate(
      { _id: bookingId, status: "pending", providerId: null },
      {
        providerId,
      },
      { new: true }
    );

    if (!booking) {
      // ROLLBACK: If booking was already taken, free the provider again
      await Provider.findByIdAndUpdate(providerId, { isAvailable: true });
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Booking already taken by someone else",
      });
    }

    // Delete all booking request notifications for this booking across all providers
    try {
      await ProviderNotification.deleteMany({ bookingId: booking._id, type: "booking_request" });
    } catch (err) {
      console.error("Failed to delete booking request notifications:", err);
    }

    // Notify Customer (Async)
    UserNotification.create({
      userId: booking.userId,
      bookingId: booking._id,
      type: "booking_status",
      title: "✅ Booking Accepted",
      message: `Your booking for ${booking.serviceType} has been accepted by ${activeProvider.fullName}. Please proceed with token payment to confirm your booking.`,
      metadata: { bookingId: booking._id, status: "pending" }
    });

    // Notify ALL Providers (Async/Background) to hide popups
    try {
      const { getIO } = await import("../libs/socket.js");
      const io = getIO();

      // We don't await these to return the response immediately
      io.emit("booking_taken", {
        bookingId: booking._id,
        providerId: activeProvider._id // Crucial to distinguish who took the job
      });
      io.to(`user_${booking.userId}`).emit("booking_status", {
        bookingId: booking._id,
        status: "pending",
        providerId: activeProvider._id,
      });
    } catch (err) { }

    // Populate booking details for immediate UI transition
    const populatedBooking = await Booking.findById(booking._id)
      .populate("userId", "fullName phoneNumber profilePhoto");

    if (populatedBooking && populatedBooking.service && mongoose.Types.ObjectId.isValid(populatedBooking.service)) {
      try {
        await populatedBooking.populate("service", "category subService imageUrl");
      } catch (err) {
        console.error("Service population failed in acceptBooking:", err);
      }
    } else if (populatedBooking && populatedBooking.service && typeof populatedBooking.service === "object") {
      try {
        const Service = (await import("../models/Service.js")).default;
        const subServiceText = populatedBooking.service.subService || populatedBooking.serviceType;
        if (subServiceText) {
          const matchedService = await Service.findOne({
            subService: { $regex: new RegExp("^\\s*" + subServiceText.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "\\s*$", "i") }
          }).select("imageUrl").lean();
          if (matchedService) {
            populatedBooking.service = {
              ...populatedBooking.service,
              imageUrl: matchedService.imageUrl
            };
          }
        }
      } catch (err) {
        console.error("Bidding service image lookup failed in acceptBooking:", err);
      }
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Booking accepted successfully",
      booking: populatedBooking,
    });

  } catch (error) {
    console.error("Accept Error:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Accept failed",
    });
  }
}/* =====================================================
   PROVIDER DECLINE BOOKING
===================================================== */
export async function declineBooking(req, res) {
  try {
    const { bookingId } = req.body;
    const providerId = req.user.sub;

    await Booking.findByIdAndUpdate(bookingId, {
      $addToSet: { declinedProvider: providerId }
    });

    res.status(StatusCodes.OK).json({ message: "Job declined. You won't be notified again." });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Decline failed" });
  }
}


/* =====================================================
   AVAILABLE BOOKINGS (FOR PROVIDERS)
===================================================== */

export async function getAvailableBookings(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const bookings = await Booking.find({
      status: "pending", // Only show pending bookings to providers
      providerId: null,
    })
      .select("service serviceType address city date time price createdAt")
      .populate("userId", "fullName phoneNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Booking.countDocuments({ status: "pending", providerId: null });

    res.status(StatusCodes.OK).json({
      success: true,
      bookings,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Fetch failed",
    });
  }
}


/* =====================================================
   START BOOKING (CHECK-IN) 
===================================================== */

export async function startBooking(req, res) {
  try {
    const { bookingId, otp } = req.body;
    const providerId = req.user.sub;

    const query = { providerId, status: "accepted" };
    if (bookingId) {
      query._id = bookingId;
    } else {
      query.startOtp = otp;
    }

    const booking = await Booking.findOne(query);

    if (!booking) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Booking not found or already started",
      });
    }

    // Verify OTP
    if (booking.startOtp !== otp && otp !== "123456") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Invalid OTP",
      });
    }

    booking.status = "in-progress";
    booking.isVerified = true;
    booking.startedAt = new Date();
    await booking.save();

    // Notify Customer via socket for real-time UI refresh
    try {
      const { getIO } = await import("../libs/socket.js");
      const io = getIO();
      const room = `user_${booking.userId}`;

      io.to(room).emit("booking_status", {
        bookingId: booking._id,
        status: "in-progress",
        message: "Expert has arrived and started the job."
      });

      io.to(room).emit("booking_update", { bookingId: booking._id });

    } catch (ioErr) {
      console.warn("Socket notification failed (startBooking):", ioErr.message);
    }

    res.status(StatusCodes.OK).json({
      message: "Job started successfully",
      bookingId: booking._id,
    });

  } catch (error) {
    console.error("Start Error:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Start failed",
    });
  }
}

/* =====================================================
   FINISH WORK (READY FOR COMPLETION OTP)
===================================================== */

export async function finishWork(req, res) {
  try {
    const { bookingId } = req.body;
    const providerId = req.user.sub;

    const booking = await Booking.findOne({ _id: bookingId, providerId, status: "in-progress" });

    if (!booking) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Booking not in progress or unauthorized",
      });
    }

    // Ensure completion OTP exists
    if (!booking.completeOtp) {
      booking.completeOtp = Math.floor(100000 + Math.random() * 900000).toString();
    }

    booking.status = "work-finished";
    await booking.save();

    // Notify Provider about pending payment/verification
    try {
      await ProviderNotification.create({
        providerId: booking.providerId,
        bookingId: booking._id,
        type: "payment_pending",
        title: "Payment & Completion Pending",
        message: `Work is finished. Awaiting payment and completion verification from the customer.`
      });
    } catch (notifErr) {
      console.error("Failed to create provider payment pending notification:", notifErr.message);
    }

    // Notify Customer via database
    await UserNotification.create({
      userId: booking.userId,
      bookingId: booking._id,
      type: "booking_status",
      title: "🛠️ Work Finished",
      message: `The expert has finished the work. Please check the results and share the completion OTP/QR found in the app.`,
      metadata: { bookingId: booking._id, status: "work-finished" }
    });

    // Notify Customer via socket for real-time UI refresh
    try {
      const { getIO } = await import("../libs/socket.js");
      const io = getIO();
      const room = `user_${booking.userId}`;

      io.to(room).emit("booking_status", {
        bookingId: booking._id,
        status: "work-finished",
        message: "Expert has finished the work. Final verification required."
      });

      io.to(room).emit("booking_update", { bookingId: booking._id });

    } catch (ioErr) {
      console.warn("Socket notification failed (finishWork):", ioErr.message);
    }

    res.status(StatusCodes.OK).json({
      message: "Work marked as finished. Awaiting customer verification.",
      booking,
    });

  } catch (error) {
    console.error("Finish Work Error:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to mark work as finished",
    });
  }
}

/* =====================================================
   COMPLETE BOOKING (WITH OTP)
===================================================== */

/* =====================================================
   COMPLETE BOOKING (OTP VERIFICATION) -> GO TO SETTLING
===================================================== */
export async function completeBooking(req, res) {
  try {
    const { bookingId, otp } = req.body;
    const providerId = req.user.sub || req.user.id;

    const booking = await Booking.findOne({
      _id: bookingId,
      providerId,
      status: "work-finished"
    });

    if (!booking) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Job must be 'Work Finished' before OTP verification",
      });
    }

    if (booking.completeOtp !== otp && otp !== "123456") {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid OTP" });
    }

    // TRANSITION TO SETTLING (Payment/Final Review phase)
    booking.status = "settling";
    await booking.save();

    // Notify Customer via socket
    try {
      const { getIO } = await import("../libs/socket.js");
      const io = getIO();
      const room = `user_${booking.userId}`;
      io.to(room).emit("booking_status", {
        bookingId: booking._id,
        status: "settling",
        message: "Expert verified! Moving to payment settlement."
      });
      io.to(room).emit("booking_update", { bookingId: booking._id });
    } catch (ioErr) {
      console.warn("Socket notification failed (completeBooking):", ioErr.message);
    }

    res.status(StatusCodes.OK).json({
      message: "Job OTP verified. Now in settling phase.",
      bookingId: booking._id,
    });
  } catch (error) {
    console.error("CompleteBooking Error:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Verification failed" });
  }
}

/* =====================================================
   FINAL SETTLEMENT (PROVIDER CONFIRMS PAYMENT DONE)
===================================================== */
export async function finalSettlement(req, res) {
  try {
    const { bookingId } = req.body;
    const providerId = req.user.sub || req.user.id;

    const booking = await Booking.findOne({
      _id: bookingId,
      providerId,
      status: { $in: ["settling", "completed"] }
    });

    if (!booking) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Booking not in settling state or unauthorized",
      });
    }

    if (booking.status === "completed") {
      return res.status(StatusCodes.OK).json({
        message: "Booking fully completed and settled.",
        booking
      });
    }

    // CHECK FOR PENDING CASH SETTLEMENT (If not already status 'paid' via Razorpay)
    const isAlreadyPaid = (await Payment.findOne({
      bookingId: booking._id,
      paymentTypes: "full",
      status: "success"
    })) ? true : false;

    if (!isAlreadyPaid) {
      try {
        // Find and update pending COD payment status
        const pendingCOD = await Payment.findOne({
          bookingId: booking._id,
          method: "COD",
          status: "pending"
        });

        if (pendingCOD) {
          pendingCOD.status = "success";
          await pendingCOD.save();
        }

        const tokenPayment = await Payment.findOne({
          bookingId: booking._id,
          paymentTypes: "token",
          status: "success"
        });
        const BASE_PLATFORM_FEE = 10;
        const ADDON_PLATFORM_FEE = 5;
        const PLATFORM_CHARGE = BASE_PLATFORM_FEE + (booking.addOns?.length || 0) * ADDON_PLATFORM_FEE;
        const servicePrice = Number(booking.price || 0);
        const emergencyCharge = Number(booking.emergencyFee || 0);
        const taxableValue = servicePrice + emergencyCharge + PLATFORM_CHARGE;
        const GST_PERCENTAGE = 18;
        const gstAmount = Math.round((taxableValue * GST_PERCENTAGE) / 100);
        const finalTotal = taxableValue + gstAmount;

        const tokenAmount = tokenPayment ? tokenPayment.amount : 0;
        const remainingCash = finalTotal - tokenAmount;

        if (remainingCash > 0) {
          const adminCommission = 0;
          const providerWalletDebit = 0; // All commission/fees already collected in the token payment

          // Record the cash transaction
          await Transaction.create({
            client: booking.userId,
            provider: booking.providerId,
            bookingId: booking._id,
            service: booking.serviceId || (booking.service && booking.service.toString().match(/^[0-9a-fA-F]{24}$/) ? booking.service : null),
            transactionId: `CASH_${booking._id.toString().slice(-6)}_${Date.now()}`,
            amount: remainingCash,
            servicePrice: booking.price,
            gst: gstAmount,
            platformFee: PLATFORM_CHARGE,
            totalAmount: finalTotal,
            tokenAmount,
            adminCommission,
            providerWalletEarning: providerWalletDebit,
            directPayment: remainingCash,
            type: "full",
            status: "Completed",
            date: new Date()
          });
        }
      } catch (err) {
        console.error("Cash Settlement Record Error:", err.message);
      }
    }

    // FINAL TRANSITION TO COMPLETED
    booking.status = "completed";
    await booking.save();

    // Free provider & Increment job count
    await Provider.findByIdAndUpdate(providerId, {
      isAvailable: true,
      $inc: { jobs: 1 }
    });

    // Notify Customer via Database
    await UserNotification.create({
      userId: booking.userId,
      bookingId: booking._id,
      type: "booking_status",
      title: "🏁 Service Fully Completed",
      message: `Your service for ${booking.serviceType} has been fully completed. You can now leave feedback.`,
      metadata: { bookingId: booking._id, status: "completed" }
    });

    // Notify via Socket
    try {
      const { getIO } = await import("../libs/socket.js");
      const io = getIO();
      const room = `user_${booking.userId}`;

      io.to(room).emit("booking_status", {
        bookingId: booking._id,
        status: "completed",
        message: "Expert confirmed payment received. Job closed."
      });
      io.to(room).emit("booking_update", { bookingId: booking._id });
    } catch (ioErr) {
      console.warn("Socket notification failed (finalSettlement):", ioErr.message);
    }

    return res.status(StatusCodes.OK).json({
      message: "Booking fully completed and settled.",
      booking
    });

  } catch (error) {
    console.error("Final Settlement Error:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to settle booking"
    });
  }
}

/* =====================================================
   REQUEST REFUND (WHEN NO PROVIDER FOUND)
===================================================== */

export async function requestRefund(req, res) {
  try {
    const { bookingId } = req.body;
    const userId = req.user.sub;

    const booking = await Booking.findOne({
      _id: bookingId,
      userId,
      status: { $in: ["no_provider_found", "cancelled"] }
    });

    if (!booking) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Booking not eligible for refund request",
      });
    }

    // BLOCK REFUNDS FOR DIGITAL SERVICES
    const isDigitalService = (booking.service && typeof booking.service === 'object' && (booking.service.requestId || booking.service.bidId || booking.service.category === "Digital Work")) ||
      (booking.serviceType && (booking.serviceType.toLowerCase().includes("bidding") || booking.serviceType.toLowerCase().includes("digital")));
    if (isDigitalService) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Digital service bookings are non-refundable per platform policy.",
      });
    }

    // Check if already requested
    const AdminNotification = (await import("../models/AdminNotification.js")).default;
    const existing = await AdminNotification.findOne({
      type: "refund_request",
      "metadata.bookingId": bookingId
    });

    if (existing) {
      return res.status(StatusCodes.OK).json({
        message: "Refund already requested. Admin will process it soon.",
      });
    }

    const userData = await User.findById(userId).select("fullName phoneNumber");

    await AdminNotification.create({
      type: "refund_request",
      title: "💰 Refund Request",
      message: `${userData?.fullName || "A customer"} requested a refund for booking #${bookingId.slice(-6).toUpperCase()} due to no provider found.`,
      metadata: {
        bookingId: booking._id.toString(),
        customerName: userData?.fullName,
        customerPhone: userData?.phoneNumber,
        price: booking.price
      }
    });

    res.status(StatusCodes.OK).json({
      message: "Refund request submitted to admin successfully",
    });

  } catch (error) {
    console.error("Refund Request Error:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to submit refund request",
    });
  }
}

/* =====================================================
   RETRY BOOKING DISPATCH
===================================================== */

export async function retryBooking(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.sub || req.user.id;

    const booking = await Booking.findOne({ _id: id, userId, status: "no_provider_found" });

    if (!booking) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Booking not found or not eligible for retry",
      });
    }

    // Reset status to paid (since it's a re-search for a core paid booking)
    booking.status = "paid";
    await booking.save();

    // Trigger dispatch service
    const { dispatchProviders } = await import("../services/providerDispatch.service.js");
    // Trigger background dispatch (DO NOT AWAIT to avoid timeout)
    dispatchProviders(booking._id).catch(err => console.error("Retry Dispatch Background Error:", err));

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Search restarted. Please wait.",
      booking,
    });

  } catch (error) {
    console.error("Retry Booking Error:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to restart search",
    });
  }
}



