import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";

/*GET BOOKING + PAYMENT DETAILS FOR PROVIDER*/

export const getProviderBookingPaymentDetail = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId)
      .populate("userId", "name phone email")
      .populate("providerId", "name phone")
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    /* PAYMENT DATA */
    const payments = await Payment.find({ bookingId });

    let tokenPaid = 0;
    let fullPaid = 0;

    payments.forEach((p) => {
      if (p.paymentTypes === "token" && p.status === "success") {
        tokenPaid += p.amount;
      }

      if (p.paymentTypes === "full" && p.status === "success") {
        fullPaid += p.amount;
      }
    });

    const totalPaid = tokenPaid + fullPaid;

    const BASE_PLATFORM_FEE = 10;
    const ADDON_PLATFORM_FEE = 5;
    const PLATFORM_CHARGE = BASE_PLATFORM_FEE + (booking.addOns?.length || 0) * ADDON_PLATFORM_FEE;
    const servicePrice = Number(booking.price || 0);
    const emergencyCharge = Number(booking.emergencyFee || 0);
    const taxableValue = servicePrice + emergencyCharge + PLATFORM_CHARGE;
    const GST_PERCENTAGE = 18;
    const gstAmount = Math.round((taxableValue * GST_PERCENTAGE) / 100);
    const totalAmount = taxableValue + gstAmount;

    const remainingAmount = Math.max(0, totalAmount - totalPaid);

    res.status(200).json({
      success: true,

      booking: {
        id: booking._id,
        serviceType: booking.serviceType,
        date: booking.date,
        time: booking.time,
        address: booking.address,
        city: booking.city,
        state: booking.state,
        price: booking.price,
        status: booking.status
      },

      customer: booking.userId,

      provider: booking.providerId,

      payment: {
        totalServiceAmount: totalAmount,
        tokenPaid,
        fullPaid,
        totalPaid,
        remainingAmount
      }
    });

  } catch (error) {
    console.error("Provider Booking Detail Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};



/*MARK WORK COMPLETED (OTP VERIFIED)*/

export const markWorkCompleted = async (req, res) => {
  try {

    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    booking.status = "completed";

    await booking.save();

    res.status(200).json({
      success: true,
      message: "Work marked as completed"
    });

  } catch (error) {

    console.error("Work Complete Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error"
    });

  }
};



/*CONFIRM PAYMENT RECEIVED BY PROVIDER*/

export const confirmPaymentReceived = async (req, res) => {

  try {

    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const payments = await Payment.find({
      bookingId,
      status: "success"
    });

    let totalPaid = 0;

    payments.forEach((p) => {
      totalPaid += p.amount;
    });

    if (totalPaid < booking.price) {
      return res.status(400).json({
        success: false,
        message: "Full payment not completed yet"
      });
    }

    res.status(200).json({
      success: true,
      message: "Payment confirmed successfully"
    });

  } catch (error) {

    console.error("Confirm Payment Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error"
    });

  }
};