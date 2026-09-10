import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";

/**
 * GET /api/bookings/:id/details
 * Fetch full booking details page data
 */
export const getBookingDetailsPage = async (req, res) => {
  try {
    const bookingId = req.params.id;

    if (!bookingId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Booking ID is required",
      });
    }

    /* =====================================================
       FETCH BOOKING + PROVIDER
    ====================================================== */

    // for real world
    const booking = await Booking.findOne({
      _id: bookingId,
      $or: [
        { userId: req.user?.sub },
        { providerId: req.user?.sub }
      ]
    })
      .select("service serviceType address date time status location price isVerified providerId userId startOtp completeOtp addOns emergencyFee")
      .populate("providerId", "fullName phoneNumber rating experience profilePhoto location")
      .populate("userId", "fullName phoneNumber avatar");

    if (!booking) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Booking not found",
      });
    }

    // Safely populate service only if it's an ObjectId
    if (booking.service && mongoose.Types.ObjectId.isValid(booking.service)) {
      try {
        await booking.populate("service", "imageUrl subService category requestId");
      } catch (err) {
        console.error("Service population failed in details page:", err);
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
        console.error("Bidding service image lookup failed in details page:", err);
      }
    }

    /* =====================================================
       PAYMENT LOGIC (TOKEN ONLY)
    ====================================================== */

    const payments = await Payment.find({
      bookingId: booking._id,
      status: "success",
    }).select("amount paymentTypes");

    const tokenPayment = payments.find(
      (p) => p.paymentTypes === "token"
    );

    const fullPayment = payments.find(
      (p) => p.paymentTypes === "full"
    );

    const tokenPaid = tokenPayment ? tokenPayment.amount : 0;
    const fullPaid = fullPayment ? fullPayment.amount : 0;

    const BASE_PLATFORM_FEE = 10;
    const ADDON_PLATFORM_FEE = 5;
    const PLATFORM_CHARGE = BASE_PLATFORM_FEE + (booking.addOns?.length || 0) * ADDON_PLATFORM_FEE;
    const servicePrice = Number(booking.price || 0);
    const emergencyCharge = Number(booking.emergencyFee || 0);
    const taxableValue = servicePrice + emergencyCharge + PLATFORM_CHARGE;
    const GST_PERCENTAGE = 18;
    const gstAmount = Math.round((taxableValue * GST_PERCENTAGE) / 100);
    const totalAmount = taxableValue + gstAmount;

    const paidAmount = tokenPaid + fullPaid;

    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    const paymentStatus =
      remainingAmount <= 0 ? "completed" : "pending";

    const pendingCODPayment = await Payment.findOne({
      bookingId: booking._id,
      method: "COD",
      status: "pending"
    }).select("_id");

    const settlementProgress =
      (booking.status === "completed" || !!pendingCODPayment)
        ? 100
        : totalAmount > 0
          ? Math.round((paidAmount / totalAmount) * 100)
          : 0;

    const isPendingCOD = !!pendingCODPayment;

    /* =====================================================
       LIVE TRACKING (HAVERSINE) - SKIPPED FOR BIDDING
    ====================================================== */

    let distanceKm = null;
    let estimatedArrival = null;

    const isBiddingJob = booking.serviceType === "Biding Services" || booking.serviceType === "Bidding Services";

    if (
      !isBiddingJob &&
      booking.providerId?.location?.coordinates?.length === 2 &&
      booking.location?.coordinates?.length === 2
    ) {
      const [bookingLng, bookingLat] =
        booking.location.coordinates;

      const [providerLng, providerLat] =
        booking.providerId.location.coordinates;

      const R = 6371; // Earth radius in KM

      const dLat =
        ((providerLat - bookingLat) * Math.PI) / 180;
      const dLng =
        ((providerLng - bookingLng) * Math.PI) / 180;

      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((bookingLat * Math.PI) / 180) *
        Math.cos((providerLat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;

      const c = 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      );

      distanceKm = Number((R * c).toFixed(2));

      // Avg speed = 30km/h
      estimatedArrival = Math.ceil(
        (distanceKm / 30) * 60
      );
    }

    /* =====================================================
      PROVIDER RESPONSE
    ====================================================== */

    let providerData = null;

    if (booking.providerId) {
      providerData = {
        _id: booking.providerId._id,
        id: booking.providerId._id,
        fullName: booking.providerId.fullName,
        phoneNumber: booking.providerId.phoneNumber,
        rating: booking.providerId.rating,
        experience: booking.providerId.experience,
        profilePhoto: booking.providerId.profilePhoto,
      };
    }

    /* =====================================================
       AUTO-GENERATE MISSING OTPS (LEGACY FIX)
    ====================================================== */

    let needsSave = false;
    if (!booking.startOtp && (booking.status === "pending" || booking.status === "accepted")) {
      booking.startOtp = Math.floor(100000 + Math.random() * 900000).toString();
      needsSave = true;
    }
    if (!booking.completeOtp && (booking.status === "in-progress" || booking.status === "work-finished")) {
      booking.completeOtp = Math.floor(100000 + Math.random() * 900000).toString();
      needsSave = true;
    }
    if (needsSave) await booking.save();

    /* =====================================================
      BIDDING REQUEST + SELECTED BID
    ====================================================== */
    let biddingRequestData = null;
    const BiddingRequest = (await import("../models/BiddingRequest.js")).default;
    const Bid = (await import("../models/Bid.js")).default;

    // Try finding by bookingId first (more reliable for assigned bookings)
    biddingRequestData = await BiddingRequest.findOne({ bookingId: booking._id }).lean();

    // Fallback to requestId from service object
    if (!biddingRequestData && booking.service?.requestId) {
       biddingRequestData = await BiddingRequest.findById(booking.service.requestId).lean();
    }
    
    if (biddingRequestData) {
       // Fetch the bid that was actually accepted/selected
       if (biddingRequestData.selectedBidId) {
          biddingRequestData.selectedBid = await Bid.findById(biddingRequestData.selectedBidId).lean();
       } 
       
       // Secondary fallback for selectedBid
       if (!biddingRequestData.selectedBid) {
          biddingRequestData.selectedBid = await Bid.findOne({ 
             $or: [
                { bookingId: booking._id },
                { requestId: biddingRequestData._id }
             ],
             providerId: booking.providerId?._id || booking.providerId
          }).lean();
       }
    }

    /* =====================================================
       FETCH TRANSACTIONS
    ====================================================== */
    const Transaction = (await import("../models/Transaction.js")).default;
    const transactions = await Transaction.find({ bookingId: booking._id })
      .populate("service", "serviceName")
      .populate("client", "fullName");

    const Feedback = (await import("../models/Feedback.js")).default;
    const feedbackExists = await Feedback.findOne({ bookingId: booking._id, userId: req.user?.sub }).select("_id");

    return res.status(StatusCodes.OK).json({
      hasFeedback: !!feedbackExists,
      booking: {
        id: booking._id,
        _id: booking._id,
        service: booking.service,
        serviceType: booking.serviceType,
        // Hide address/location for bidding jobs
        address: isBiddingJob ? undefined : booking.address,
        date: booking.date,
        time: booking.time,
        status: booking.status,
        location: isBiddingJob ? undefined : booking.location,
        customer: booking.userId,
        imageUrl: booking.service?.imageUrl,
        biddingRequest: biddingRequestData,
      },

      provider: providerData,
      liveTracking: isBiddingJob ? null : {
        distanceKm,
        estimatedArrival,
      },

      paymentSummary: {
        totalAmount,
        tokenPaid,
        paidAmount,
        remainingAmount,
        paymentStatus,
        settlementProgress,
      },

      transactions: transactions,

      uiFlags: {
        showPayButton: remainingAmount > 0 && (booking.status === "completed" || booking.status === "paid" || booking.status === "settling"),
        showFeedback: booking.status === "completed",
        showTracking: !isBiddingJob && (booking.status === "accepted" || booking.status === "in-progress"),
        showSettleButton: booking.status === "settling",
        showInvoice: (booking.status === "completed" || booking.status === "paid" || booking.status === "settling" || transactions.length > 0)
      },

      isVerified: booking.isVerified,
      isPendingCOD,
      otp: (booking.status === "accepted" || booking.status === "paid" || booking.status === "pending")
        ? booking.startOtp
        : (booking.status === "work-finished")
          ? booking.completeOtp
          : null,
    });

  } catch (error) {
    console.error("Booking details error:", error);

    return res.status(
      StatusCodes.INTERNAL_SERVER_ERROR
    ).json({
      error: "Failed to fetch booking details. Internal Server Error.",
    });
  }
};