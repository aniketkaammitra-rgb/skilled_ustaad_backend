import Booking from "../models/Booking.js";
import Provider from "../models/Provider.js";
import Service from "../models/Service.js";
import mongoose from "mongoose";
import ProviderNotification from "../models/ProviderNotification.js";

export const getProviderJobs = async (req, res) => {
  try {
    // ✅ CORRECT SOURCE
    const providerId = new mongoose.Types.ObjectId(req.user.sub);

    const provider = await Provider.findById(providerId);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    if (!provider || provider.status !== "Active") {
      return res.json({
        success: true,
        bookings: [],
        pagination: {
          total: 0,
          page,
          limit,
          pages: 0
        }
      });
    }

    let allowedSubServices = [];
    if (provider) {
      if (provider.subService && provider.subService.length > 0) {
        allowedSubServices = provider.subService;
      } else if (provider.providerSubService) {
        // Find all subServices under this trade
        const services = await Service.find({
          providerSubService: provider.providerSubService,
          category: provider.serviceCategory,
          status: "active"
        }).select("subService");
        allowedSubServices = services.map(s => s.subService).filter(Boolean);
      }
    }

    const queryConditions = {
      status: { $ne: "cancelled" },
      $or: [
        { providerId: providerId },
        {
          status: { $in: ["pending", "paid"] },
          providerId: null,
          declinedProvider: { $ne: providerId },
          ...(provider?.city && {
            city: { $regex: new RegExp(`^${provider.city}$`, "i") }
          }),
          serviceType: { $in: allowedSubServices }
        },
      ],
    };

    const jobs = await Booking.find(queryConditions)
      .select("service serviceType address city state date time price status providerId createdAt")
      .populate("userId", "fullName phoneNumber profilePhoto")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Booking.countDocuments(queryConditions);

    res.json({
      success: true,
      bookings: jobs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("❌ ERROR:", error);
    res.status(500).json({
      message: "Failed to fetch jobs",
    });
  }
};
export const updateJobStatus = async (req, res) => {
  try {
    const providerId = req.user.sub;
    const { id } = req.params;
    const { status } = req.body;

    let update = {};
    let query = { _id: id };

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    if (provider.status !== "Active") {
      return res.status(403).json({ message: "Your account is pending verification. You cannot accept or modify jobs." });
    }

    if (status === "accepted") {
      const targetBooking = await Booking.findById(id);
      if (!targetBooking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      // Check if provider is qualified for this booking's serviceType
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
        return res.status(403).json({
          message: "Unauthorized: You do not have the required skills for this job category."
        });
      }

      // Atomic check: Only accept if no provider is assigned OR it's already assigned to this provider
      query.$or = [{ providerId: null }, { providerId: providerId }];
      const finalStatus = targetBooking.status === "pending" ? "pending" : "accepted";
      update = { $set: { providerId: providerId, status: finalStatus } };
    } else if (status === "in-progress") {
      query.providerId = providerId;
      update = { $set: { status: "in-progress" } };
    } else if (status === "completed") {
      query.providerId = providerId;
      update = { $set: { status: "completed" } };
    } else if (status === "cancelled") {
      update = { $addToSet: { declinedProvider: providerId } };
    }

    const booking = await Booking.findOneAndUpdate(query, update, { new: true })
      .select("status providerId declinedProvider userId");

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found, already taken, or unauthorized",
      });
    }

    if (booking && status === "accepted") {
      try {
        await ProviderNotification.deleteMany({ bookingId: booking._id, type: "booking_request" });
      } catch (err) {
        console.error("Failed to delete booking request notifications in updateJobStatus:", err);
      }
    }

    // Real-time Socket.io emission to user
    if (booking && ["accepted", "in-progress", "completed", "pending"].includes(booking.status)) {
      try {
        const { getIO } = await import("../libs/socket.js");
        getIO().to(`user_${booking.userId}`).emit("booking_status", {
          bookingId: booking._id,
          status: booking.status,
          providerId: booking.providerId,
          message: booking.status === "pending"
            ? "Your booking has been accepted by a provider! Please complete token payment."
            : `Your booking is now ${booking.status}`
        });
      } catch (ioError) {
        console.error("Socket.io Emit Error (User Status):", ioError.message);
      }
    }

    res.json({ success: true, booking });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to update status",
    });
  }
};