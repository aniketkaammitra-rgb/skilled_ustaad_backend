import Booking from "../models/Booking.js";
import ProviderNotification from "../models/ProviderNotification.js";
import logger from "../libs/logger.js";

/**
 * Service Reminder Scheduler
 * Checks every 10 minutes for bookings starting in ~1 hour (50-70 minutes).
 * Creates a ProviderNotification of type "job_reminder" if not already created.
 */
export const checkServiceReminders = async () => {
  try {
    const now = new Date();
    // 50 minutes to 70 minutes from now
    const oneHourLaterStart = new Date(now.getTime() + 50 * 60 * 1000);
    const oneHourLaterEnd = new Date(now.getTime() + 70 * 60 * 1000);

    // Find bookings scheduled to start in approx 1 hour
    const upcomingBookings = await Booking.find({
      status: { $in: ["accepted", "paid"] },
      providerId: { $ne: null },
      date: { $gte: oneHourLaterStart, $lte: oneHourLaterEnd }
    });

    for (const booking of upcomingBookings) {
      if (!booking.time || !booking.date) continue;

      // Check if reminder notification was already sent
      const alreadySent = await ProviderNotification.findOne({
        bookingId: booking._id,
        type: "job_reminder"
      });

      if (!alreadySent) {
        // Create reminder notification
        await ProviderNotification.create({
          providerId: booking.providerId,
          bookingId: booking._id,
          type: "job_reminder",
          title: "Upcoming Service Reminder",
          message: `Your scheduled service for "${booking.serviceType}" starts in 1 hour (at ${booking.time}).`
        });
        logger.info(`Reminder scheduler: Sent 1-hour reminder to provider ${booking.providerId} for booking ${booking._id}`);
      }
    }
  } catch (error) {
    logger.error("Reminder Scheduler Error:", error);
  }
};

export const startReminderScheduler = () => {
  logger.info("Initializing Service Reminder Scheduler (interval: 10 mins)...");
  
  // Run once immediately on startup
  checkServiceReminders();

  // Run every 10 minutes
  setInterval(checkServiceReminders, 10 * 60 * 1000);
};
