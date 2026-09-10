import { StatusCodes } from "http-status-codes";
import Provider from "../models/Provider.js";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";

export async function getProviderDashboard(req, res) {
  try {
    const providerId = req.user.sub;

    // Pending requests
    const pending = await Booking.countDocuments({
      providerId,
      status: "pending",
    });

    // Active jobs
    const active = await Booking.countDocuments({
      providerId,
      status: { $in: ["accepted", "in-progress"] },
    });

    // Completed jobs
    const completeJobs = await Booking.find({
      providerId,
      status: "completed",
    });

    const totalIncome = completeJobs.reduce(
      (sum, job) => sum + job.price,
      0
    );

    // Today income
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayBookings = await Booking.find({
      providerId,
      status: "completed",
      createdAt: { $gte: startOfDay },
    });

    const todayIncome = todayBookings.reduce(
      (sum, job) => sum + job.price,
      0
    );

    // Recent jobs (populated with customer details)
    const recentJobs = await Booking.find({ providerId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("userId", "fullName phoneNumber profilePhoto");

    // Calculate analytics
    const completedJobsCount = await Booking.countDocuments({ providerId, status: "completed" });
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayBookingsCount = await Booking.countDocuments({ 
      providerId, 
      createdAt: { $gte: startOfToday } 
    });

    const provider = await Provider.findById(providerId);

    // Format recent jobs for frontend expectation
    const formattedRecentJobs = recentJobs.map(job => ({
      ...job.toObject(),
      serviceName: job.serviceType,
      bookingDate: job.date,
      bookingTime: job.time,
      totalAmount: job.price,
      bookingStatus: job.status
    }));

    return res.status(StatusCodes.OK).json({
      stats: {
        pending,
        active,
        totalEarnings: totalIncome,
        completedJobs: completedJobsCount,
        averageRating: provider?.rating || 0,
        todayBookings: todayBookingsCount,
      },
      todayIncome,
      recentJobs: formattedRecentJobs,
    });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to fetch dashboard",
    });
  }
}


export async function toggleAvailability(req, res) {
  try {
    const providerId = req.user.sub;
    const provider = await Provider.findById(providerId);

    if (!provider) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Provider not found",
      });
    }

    if (provider.status !== "Active") {
      return res.status(StatusCodes.FORBIDDEN).json({
        error: "Your account is pending verification. You cannot change availability."
      });
    }

    // Toggle if not provided, otherwise set to the specific value
    const newStatus = req.body.isAvailable !== undefined 
      ? req.body.isAvailable 
      : !provider.isAvailable;

    provider.isAvailable = newStatus;
    
    // Using .save() instead of findByIdAndUpdate triggers the post-save hooks
    // like the one that broadcasts stats via socket
    await provider.save();

    return res.status(StatusCodes.OK).json({
      message: "Availability updated",
      isAvailable: provider.isAvailable
    });
  } catch (error) {
    console.error("Toggle Availability Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to update availability"
    });
  }
}