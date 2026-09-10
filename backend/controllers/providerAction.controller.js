import Booking from "../models/Booking.js";
import BookingResponse from "../models/BookingResponse.js";
import Provider from "../models/Provider.js";
import Service from "../models/Service.js";
import ProviderNotification from "../models/ProviderNotification.js";

export async function providerBookingAction(req, res) {
  try {

    const { bookingId, action } = req.body;
    const providerId = req.user.sub || req.user.id;

    if (!["accepted", "declined"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    if (provider.status !== "Active") {
      return res.status(403).json({ error: "Your account is pending verification. You cannot accept or decline bookings." });
    }

    if (action === "accepted") {
      const isSubActive =
        provider.subscription &&
        provider.subscription.status === "active" &&
        provider.subscription.expiryDate &&
        new Date(provider.subscription.expiryDate).getTime() > Date.now();

      if (!isSubActive) {
        return res.status(403).json({
          error:
            "Subscription Required: You need an active subscription plan to accept job requests. Please take a subscription plan to proceed.",
        });
      }
    }

    // 1. IDEMPOTENT ACCEPT: If they are already the provider, just say success
    const currentBooking = await Booking.findById(bookingId);
    if (action === "accepted" && currentBooking?.providerId?.toString() === providerId.toString()) {
       return res.status(200).json({ message: "You have already accepted this booking.", booking: currentBooking });
    }

    /* CHECK IF ALREADY RESPONDED */
    const existing = await BookingResponse.findOne({ bookingId, providerId });
    if (existing) {
      if (existing.action === action) {
         return res.json({ message: `You have already ${action} this booking.`, response: existing });
      }
      return res.status(400).json({ error: `You have already ${existing.action} this booking and cannot change your response.` });
    }

    /* SAVE RESPONSE */
    const response = await BookingResponse.create({ bookingId, providerId, action });

    /* IF ACCEPTED → CHECK CONFLICTS FIRST */
    if (action === "accepted") {
      const newBooking = await Booking.findById(bookingId);
      if (!newBooking) return res.status(404).json({ error: "Booking not found" });

      // provider already loaded at start

      // Check if provider is qualified for this booking's serviceType
      let allowed = false;
      if (provider.subService && provider.subService.includes(newBooking.serviceType)) {
        allowed = true;
      } else if (provider.providerSubService) {
        const matchingService = await Service.findOne({
          subService: newBooking.serviceType,
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
          error: "Unauthorized: You do not have the required skills for this job category."
        });
      }

      // Convert "HH:MM" to Date object using booking.date
      const [hours, minutes] = newBooking.time.split(":").map(Number);
      const newStart = new Date(newBooking.date);
      newStart.setUTCHours(hours, minutes, 0, 0);

      // We'll estimate the new job to be at least 1 hour if not set
      const newEnd = new Date(newStart.getTime() + 60 * 60000); 
      const newEndWithBuffer = new Date(newEnd.getTime() + 20 * 60000);

      // Find other bookings on the same day for this provider
      const dateStart = new Date(newBooking.date);
      dateStart.setHours(0,0,0,0);
      const dateEnd = new Date(newBooking.date);
      dateEnd.setHours(23,59,59,999);

      const conflicts = await Booking.find({
        providerId,
        status: { $in: ["accepted", "in-progress"] },
        date: { $gte: dateStart, $lte: dateEnd },
        _id: { $ne: bookingId }
      });

      for (const existing of conflicts) {
        const [eH, eM] = existing.time.split(":").map(Number);
        const eStart = new Date(existing.date);
        eStart.setUTCHours(eH, eM, 0, 0);
        
        // Use estimatedEndTime if available, otherwise default to 60 min
        let eEndWithBuffer;
        if (existing.estimatedEndTime) {
          eEndWithBuffer = new Date(existing.estimatedEndTime.getTime() + 20 * 60000);
        } else {
          eEndWithBuffer = new Date(eStart.getTime() + 80 * 60000); // 60 min job + 20 min buffer
        }

        // Check if overlap exists
        if (newStart < eEndWithBuffer && newEndWithBuffer > eStart) {
          return res.status(400).json({ error: "Your schedule on that date and time is already busy with another job!" });
        }
      }

      /* UPDATE BOOKING STATUS */
      const bookingToUpdate = await Booking.findById(bookingId);
      if (!bookingToUpdate) return res.status(404).json({ error: "Booking not found" });

      const finalStatus = bookingToUpdate.status === "pending" ? "pending" : "accepted";

      const booking = await Booking.findOneAndUpdate(
        {
          _id: bookingId,
          status: { $in: ["pending", "paid"] }
        },
        {
          status: finalStatus,
          providerId
        },
        { new: true }
      );

      if (!booking) {
        const finalCheck = await Booking.findById(bookingId);
        let errorMsg = "Sorry, this job has already been accepted by another expert!";
        
        if (!finalCheck) errorMsg = "Sorry, this job order no longer exists.";
        else if (finalCheck.status === "cancelled") errorMsg = "The customer has cancelled this request.";
        else if (finalCheck.status === "accepted") errorMsg = "Another expert got to this job first!";

        return res.status(400).json({ error: errorMsg });
      }

      // Delete all booking request notifications for this booking across all providers
      try {
        await ProviderNotification.deleteMany({ bookingId: booking._id, type: "booking_request" });
      } catch (err) {
        console.error("Failed to delete booking request notifications:", err);
      }

      await Provider.findByIdAndUpdate(providerId, { isAvailable: false });

      // Real-time Socket.io transmissions
      try {
        const { getIO } = await import("../libs/socket.js");
        const io = getIO();

        io.to(`user_${booking.userId}`).emit("booking_status", {
          bookingId: booking._id,
          status: finalStatus,
          providerId,
          message: finalStatus === "pending"
            ? "Your booking has been accepted by a provider! Please complete token payment."
            : "Your booking has been accepted by a provider!"
        });

        io.emit("booking_taken", { bookingId: booking._id });
        io.emit("booking_status_updated", { bookingId: booking._id, status: finalStatus });

      } catch (ioError) {
        console.error("Socket.io Emit Error (User):", ioError.message);
      }

      return res.json({
        message: "Booking accepted",
        booking,
        response
      });
    }

    /* IF DECLINED */
    await Booking.findByIdAndUpdate(
      bookingId,
      {
        $addToSet: {
          declinedProvider: providerId
        }
      }
    );

    return res.json({
      message: "Booking declined",
      response
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Action failed"
    });
  }
}

/**
 * Update the estimated duration for a booking (Provider Side)
 */
export async function setBookingEstimate(req, res) {
  try {
    const { bookingId, duration } = req.body;
    const providerId = req.user.sub || req.user.id;

    if (!duration || isNaN(duration)) {
      return res.status(400).json({ error: "Invalid duration provided" });
    }

    const booking = await Booking.findOne({ _id: bookingId, providerId });
    if (!booking) {
      return res.status(404).json({ error: "Booking not found or not assigned to you" });
    }

    const [hours, minutes] = booking.time.split(":").map(Number);
    const start = new Date(booking.date);
    start.setUTCHours(hours, minutes, 0, 0);

    const endTime = new Date(start.getTime() + Number(duration) * 60000);

    booking.estimatedDuration = Number(duration);
    booking.estimatedEndTime = endTime;
    await booking.save();

    res.json({ 
      message: "Estimate updated successfully", 
      estimatedDuration: Number(duration),
      estimatedEndTime: endTime 
    });

  } catch (err) {
    console.error("SetEstimate Error:", err);
    res.status(500).json({ error: "Failed to update estimate" });
  }
}