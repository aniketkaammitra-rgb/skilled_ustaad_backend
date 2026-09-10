import mongoose from "mongoose";
import Provider from "../models/Provider.js";
import Transaction from "../models/Transaction.js";
import Payout from "../models/Payout.js";
import PaymentMethod from "../models/PaymentMethod.js";
import { StatusCodes } from "http-status-codes";
import { getIO } from "../libs/socket.js";
import { sendAdminNotification } from "../services/fcm.service.js";


// Helper to calculate provider earning breakdown for a single booking based on formulas
export const calculateBookingEarningBreakdown = (booking) => {
  const servicePrice = Number(booking.price || 0);
  const emergencyFee = Number(booking.emergencyFee || 0);
  const platformFee = 10 + (booking.addOns?.length || 0) * 5;

  // 1. Calculate token amount paid by customer
  const tokenServicePortion = Math.round(servicePrice * 0.30);
  const tokenTaxableValue = tokenServicePortion + emergencyFee + platformFee;
  const tokenGst = Math.round((tokenTaxableValue * 18) / 100);
  const tokenAmount = tokenTaxableValue + tokenGst;

  // 2. Calculate full service GST (18% of (servicePrice + emergencyFee + platformFee))
  const fullServiceTaxable = servicePrice + emergencyFee + platformFee;
  const fullServiceGst = Math.round((fullServiceTaxable * 18) / 100);

  // 3. Calculate 10% commission of service price
  const commission = Math.round(servicePrice * 0.10);

  // 4. Platform deduction (Company Share)
  let totalDeduction = platformFee + fullServiceGst + commission;
  if (emergencyFee > 0) {
    totalDeduction += Math.round(emergencyFee / 2);
  }

  // 5. Provider wallet earning from token
  const walletEarning = tokenAmount - totalDeduction;

  // 6. External earning (direct payment remaining)
  const finalTotal = fullServiceTaxable + fullServiceGst;
  const directPayment = finalTotal - tokenAmount;

  return {
    walletEarning,
    directPayment,
    adminCommission: totalDeduction
  };
};

// GET DASHBOARD
export const getEarningsDashboard = async (req, res) => {
  try {

    const providerId = new mongoose.Types.ObjectId(req.user.sub);

    // 0. SELF-HEALING: Link any orphaned transactions (token payments)
    try {
      const Booking = (await import("../models/Booking.js")).default;
      const bIds = (await Booking.find({ providerId }).select("_id")).map(b => b._id);
      if (bIds.length > 0) {
        await Transaction.updateMany({ bookingId: { $in: bIds }, provider: { $exists: false } }, { provider: providerId });
        await Transaction.updateMany({ bookingId: { $in: bIds }, provider: null }, { provider: providerId });
      }
    } catch (hErr) { console.warn("Heal error:", hErr.message); }

    // 1. Calculate Earnings dynamically from completed/paid bookings
    const Booking = (await import("../models/Booking.js")).default;
    const bookings = await Booking.find({ providerId, status: { $in: ["completed", "paid"] } });
    
    let totalWorkValue = 0;
    let walletEarnings = 0;
    let externalEarnings = 0;
    let adminCommission = 0;
    const totalJobs = bookings.length;

    for (const b of bookings) {
      totalWorkValue += (b.price || 0);

      const breakdown = calculateBookingEarningBreakdown(b);
      walletEarnings += breakdown.walletEarning;
      externalEarnings += breakdown.directPayment;
      adminCommission += breakdown.adminCommission;
    }

    // 2. Add providerWalletEarning from online full payment transactions if any
    const fullTransactions = await Transaction.find({
      provider: providerId,
      status: "Completed",
      type: "full"
    });

    for (const t of fullTransactions) {
      walletEarnings += t.providerWalletEarning;
      externalEarnings -= t.providerWalletEarning;
    }

    // 3. Separate Pending and Approved Payouts
    const payoutStats = await Payout.aggregate([
      { $match: { provider: providerId } }, 
      {
        $group: {
          _id: null,
          totalApproved: {
            $sum: {
              $cond: [{ $in: ["$status", ["Approved", "SUCCESS"]] }, "$amount", 0]
            }
          },
          totalPending: {
            $sum: {
              $cond: [{ $in: ["$status", ["Pending", "PENDING"]] }, "$amount", 0]
            }
          }
        }
      }
    ]);

    const payouts = await Payout.find({ provider: providerId })
      .sort({ requestedAt: -1 }); 

    const totalApproved = payoutStats[0]?.totalApproved || 0;
    const totalPending = payoutStats[0]?.totalPending || 0;

    const availableBalance = Math.max(0, walletEarnings - (totalApproved + totalPending));
    const onHoldBalance = totalPending;


    // Last 7 days chart (based on service value)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const chartStats = await Transaction.aggregate([
      { $match: { provider: providerId, status: "Completed", date: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          money: { $sum: "$servicePrice" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const chartData = chartStats.map(s => ({
      date: new Date(s._id).toLocaleDateString('en-US', { weekday: 'short' }),
      money: s.money
    }));

    res.status(StatusCodes.OK).json({
      providerName: req.user.fullName,
      totalEarning: totalWorkValue, // Total Service Value
      walletEarnings,
      externalEarnings,
      adminCommission,
      monthlyEa: 0, // Simplified for now, can be added to booking aggregate if needed
      totalJobs,
      availableBalance,
      onHoldBalance,
      chartData: chartData.length > 0 ? chartData : null,
      payoutHistory: payouts
    });


  } catch (error) {

    console.error(error);

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Dashboard fetch failed"
    });

  }
};



// TRANSACTION HISTORY
export const getTransactionHistory = async (req, res) => {

  try {

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({
      provider: req.user.sub
    })
      .select("date payment token status client service servicePrice providerWalletEarning directPayment tokenAmount adminCommission bookingId gst platformFee totalAmount type")
      .populate("client", "fullName")
      .populate("service", "serviceName")
      .populate("bookingId", "address price emergencyFee addOns serviceType status")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments({ provider: req.user.sub });

    const formatted = transactions.map(t => {
      // Calculate breakdown dynamically if booking details are available
      let walletEarningVal = t.providerWalletEarning || 0;
      let externalEarningVal = t.directPayment || 0;
      let adminCommissionVal = t.adminCommission || 0;
      let gstVal = t.gst || 0;
      let platformFeeVal = t.platformFee || 0;
      let totalAmountVal = t.totalAmount || 0;
      let servicePriceVal = t.servicePrice || 0;
      let tokenPaidVal = t.tokenAmount || 0;

      if (t.bookingId && typeof t.bookingId === "object" && t.bookingId.price !== undefined) {
        const booking = t.bookingId;
        const sPrice = Number(booking.price || 0);
        const eFee = Number(booking.emergencyFee || 0);
        const pFee = 10 + (booking.addOns?.length || 0) * 5;

        // Calculate token amount
        const tokenPortion = Math.round(sPrice * 0.30);
        const tokenTax = tokenPortion + eFee + pFee;
        const tokenGst = Math.round((tokenTax * 18) / 100);
        const calculatedTokenAmount = tokenTax + tokenGst;

        // Calculate full service GST & commission
        const fullTaxable = sPrice + eFee + pFee;
        const fullGst = Math.round((fullTaxable * 18) / 100);
        const comm = Math.round(sPrice * 0.10);

        let companyTake = pFee + fullGst + comm;
        if (eFee > 0) {
          companyTake += Math.round(eFee / 2);
        }

        const calculatedWalletEarning = calculatedTokenAmount - companyTake;
        const calculatedFinalTotal = fullTaxable + fullGst;
        const calculatedDirectPayment = calculatedFinalTotal - calculatedTokenAmount;

        servicePriceVal = sPrice;
        adminCommissionVal = companyTake;
        gstVal = fullGst;
        platformFeeVal = pFee;
        totalAmountVal = calculatedFinalTotal;
        tokenPaidVal = calculatedTokenAmount;

        if (t.type === "token") {
          walletEarningVal = calculatedWalletEarning;
          externalEarningVal = calculatedDirectPayment;
        } else if (t.type === "full") {
          walletEarningVal = calculatedDirectPayment;
          externalEarningVal = 0;
        }
      }

      return {
        ...t.toObject(),
        date: t.date,
        jobId: t._id,
        clientName: t.client?.fullName || "Customer",
        serviceType: t.bookingId?.serviceType || t.service?.serviceName || "Service",
        // Keep these names for ProfileEarnings.jsx table compatibility
        servicePrice: `Rs ${servicePriceVal}`,
        walletEarning: `Rs ${walletEarningVal}`,
        externalEarning: `Rs ${externalEarningVal}`,
        tokenPaid: `Rs ${tokenPaidVal}`,
        // Add raw numbers explicitly for the InvoiceModal calculations
        servicePriceRaw: servicePriceVal,
        adminCommissionRaw: adminCommissionVal,
        directPaymentRaw: externalEarningVal,
        walletEarningRaw: walletEarningVal,
        gstRaw: gstVal,
        platformFeeRaw: platformFeeVal,
        totalAmountRaw: totalAmountVal
      };
    });

    res.status(StatusCodes.OK).json({
      success: true,
      data: formatted,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Transaction fetch failed"
    });

  }

};



// PAYMENT METHODS
export const getPaymentMethods = async (req, res) => {

  try {

    const methods = await PaymentMethod.find({
      provider: req.user.sub
    });

    res.status(StatusCodes.OK).json(methods);

  } catch (error) {

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to fetch methods"
    });

  }

};



// ADD PAYMENT METHOD
export const addPaymentMethod = async (req, res) => {

  try {

    const { type, name, details } = req.body;

    // ── Required field check ──────────────────────────────────────────────────
    if (!type || !name || !details) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "All fields required"
      });
    }

    // ── Limit: max 5 payment methods per provider ────────────────────────────
    const MAX_METHODS = 5;
    const existingCount = await PaymentMethod.countDocuments({ provider: req.user.sub });
    if (existingCount >= MAX_METHODS) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: `You can have a maximum of ${MAX_METHODS} payment methods. Please remove one before adding a new one.`
      });
    }

    // ── Name validation: letters and spaces only ─────────────────────────────
    if (!/^[a-zA-Z\s]{1,60}$/.test(name.trim())) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Account Holder Name must contain only letters and spaces (max 60 characters)."
      });
    }

    // ── Parse and validate details ───────────────────────────────────────────
    let parsedDetails;
    try {
      parsedDetails = JSON.parse(details);
    } catch {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Invalid payment details format."
      });
    }

    if (type === "Bank") {
      const { accountNumber, ifscCode } = parsedDetails;

      // Account Number: digits only, 8–18 digits
      if (!accountNumber || !/^\d{8,18}$/.test(accountNumber)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: "Account Number must contain only digits (8–18 digits)."
        });
      }

      // IFSC Code: 4 letters + 0 + 6 alphanumeric
      if (!ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.toUpperCase())) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: "IFSC Code must be 11 characters: 4 letters, digit 0, then 6 alphanumeric (e.g. SBIN0001234)."
        });
      }

      // Normalise IFSC to uppercase before saving
      parsedDetails.ifscCode = ifscCode.toUpperCase();

    } else if (type === "UPI") {
      const { upiId } = parsedDetails;
      if (!upiId || !/^[\w.\-]+@[\w]+$/.test(upiId)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: "UPI ID must be in a valid format (e.g. 9868xxx@ybl)."
        });
      }
    } else {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Payment method type must be 'Bank' or 'UPI'."
      });
    }

    const method = await PaymentMethod.create({
      provider: req.user.sub,
      type,
      name: name.trim(),
      details: JSON.stringify(parsedDetails)
    });

    res.status(StatusCodes.CREATED).json({
      message: "Payment method added",
      method
    });

  } catch (error) {

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Add method failed"
    });

  }

};



// REMOVE PAYMENT METHOD
export const deletePaymentMethod = async (req, res) => {

  try {

    const { id } = req.params;

    await PaymentMethod.deleteOne({
      _id: id,
      provider: req.user.sub
    });

    res.status(StatusCodes.OK).json({
      message: "Payment method removed"
    });

  } catch (error) {

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Delete failed"
    });

  }

};



// WITHDRAW
export const withdrawFunds = async (req, res) => {

  try {

    const providerIdString = req.user.sub;
    const providerId = new mongoose.Types.ObjectId(providerIdString);

    const { amount, methodId } = req.body;

    // 0. SELF-HEALING: Link any orphaned transactions (token/full payments)
    try {
      const Booking = (await import("../models/Booking.js")).default;
      const bIds = (await Booking.find({ providerId }).select("_id")).map(b => b._id);
      if (bIds.length > 0) {
        await Transaction.updateMany({ bookingId: { $in: bIds }, provider: { $exists: false } }, { provider: providerId });
        await Transaction.updateMany({ bookingId: { $in: bIds }, provider: null }, { provider: providerId });
      }
    } catch (hErr) { console.warn("Heal error in withdraw:", hErr.message); }

    const Booking = (await import("../models/Booking.js")).default;
    const bookings = await Booking.find({ providerId, status: { $in: ["completed", "paid"] } });

    let totalWalletEarned = 0;
    for (const b of bookings) {
      const breakdown = calculateBookingEarningBreakdown(b);
      totalWalletEarned += breakdown.walletEarning;
    }

    const fullTransactions = await Transaction.find({
      provider: providerId,
      status: "Completed",
      type: "full"
    });

    for (const t of fullTransactions) {
      totalWalletEarned += t.providerWalletEarning;
    }

    const payoutStats = await Payout.aggregate([
      { $match: { provider: providerId, status: { $in: ["Approved", "Pending", "SUCCESS", "PENDING"] } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const withdrawAmount = Number(amount);
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Invalid withdrawal amount"
      });
    }

    const totalCommitted = payoutStats[0]?.total || 0;
    const realAvailableBalance = totalWalletEarned - totalCommitted;

    if (withdrawAmount > realAvailableBalance) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: `Insufficient funds. Your true available balance (after pending requests) is ₹${realAvailableBalance}.`
      });
    }


    let method;
    if (methodId) {
      method = await PaymentMethod.findOne({
        _id: methodId,
        provider: providerIdString
      }).populate("provider", "fullName");
    } else {
      method = await PaymentMethod.findOne({ provider: providerIdString, isDefault: true }).populate("provider", "fullName") 
               || await PaymentMethod.findOne({ provider: providerIdString }).populate("provider", "fullName");
    }

    if (!method) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "No payment method found (Bank/UPI required)."
      });
    }


    let parsedDetails = {};
    let isJson = false;
    try {
      if (method.details?.startsWith('{')) {
        parsedDetails = JSON.parse(method.details);
        isJson = true;
      }
    } catch (e) {
      console.error("Failed to parse bank details JSON:", e);
    }

    // Fallback if not JSON (legacy data)
    if (!isJson) {
      parsedDetails = {
        accountNumber: method.details, // Store raw string as account number for admin visibility
        ifscCode: "SEE_DETAILS",
        upiId: method.type === 'UPI' ? method.details : "N/A"
      };
    }

    const payout = await Payout.create({
      provider: providerId,
      amount: withdrawAmount,
      method: method.type,
      bankDetails: {
        accountNumber: parsedDetails.accountNumber || parsedDetails.accountNo || parsedDetails.account || "N/A",
        ifscCode: parsedDetails.ifscCode || parsedDetails.ifsc || "N/A",
        upiId: parsedDetails.upiId || parsedDetails.upi || "N/A"
      },
      status: "Pending",
      requestedAt: new Date()
    });

    // Real-time notification to Admin via FCM & DB (for Activity)
    try {
      sendAdminNotification({
        type: "payout_request",
        title: "💳 New Payout Request",
        message: `${method.provider?.fullName || "A Provider"} has requested a payout of ₹${payout.amount}.`,
        metadata: { payoutId: payout._id.toString(), providerId: providerId.toString(), amount: payout.amount.toString() }
      });
      
      const io = getIO();
      io.to("admin_room").emit("new_payout_request", {
        payoutId: payout._id,
        providerName: method.provider?.fullName || "A Provider",
        amount: payout.amount,
        requestedAt: payout.requestedAt
      });
    } catch (socketErr) {
      console.error("Notification/Socket error (new payout):", socketErr.message);
    }

    res.status(StatusCodes.OK).json({
      message: "Withdrawal request submitted successfully",
      payout
    });

  } catch (error) {

    console.error(error);

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Withdraw failed"
    });

  }

};



export const getProviderTransactions = async (req, res) => {
  try {
    const providerId = req.user.sub;

    const transactions = await Transaction.find({ provider: providerId });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};