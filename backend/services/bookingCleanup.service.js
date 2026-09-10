import Booking from "../models/Booking.js";
import Provider from "../models/Provider.js";
import logger from "../libs/logger.js";

/**
 * Cleanup Unpaid Pending Bookings
 * Checks for bookings that are still "pending" after 1 hour,
 * frees their assigned providers if any, and deletes the bookings.
 */
export const cleanupUnpaidBookings = async () => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // Find pending bookings older than 1 hour
    const expiredBookings = await Booking.find({
      status: "pending",
      createdAt: { $lt: oneHourAgo }
    });

    if (expiredBookings.length === 0) return;

    logger.info(`[Booking Cleanup] Found ${expiredBookings.length} expired pending bookings. Cleaning up...`);

    for (const booking of expiredBookings) {
      // If a provider was assigned but customer didn't pay, make provider available again
      if (booking.providerId) {
        await Provider.findByIdAndUpdate(booking.providerId, {
          isAvailable: true
        });
        logger.info(`[Booking Cleanup] Freed provider ${booking.providerId} from expired booking ${booking._id}`);
      }

      // Delete the booking
      await Booking.findByIdAndDelete(booking._id);
      logger.info(`[Booking Cleanup] Deleted expired booking ${booking._id}`);
    }
  } catch (error) {
    logger.error("[Booking Cleanup] Error during pending booking cleanup:", error);
  }
};

export const startBookingCleanupScheduler = () => {
  logger.info("Initializing Booking Cleanup Scheduler (interval: 5 mins)...");
  
  // Run once immediately on startup
  cleanupUnpaidBookings();

  // Run every 5 minutes
  setInterval(cleanupUnpaidBookings, 5 * 60 * 1000);
};
