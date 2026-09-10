import { StatusCodes } from "http-status-codes";
import Booking from "../models/Booking.js";
import Feedback from "../models/Feedback.js";
import Provider from "../models/Provider.js";
import ProviderNotification from "../models/ProviderNotification.js";


export const submitFeedback = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { rating, message, category } = req.body;

        const userId = req.user.sub;

        // check Booking
        const booking = await Booking.findOne({
            _id: bookingId,
            userId,
        })
            .select("status providerId userId serviceType")
            .populate("providerId", "fullName phoneNumber");

        if (!booking) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: "Booking Not Found"
            });
        }

        //Only allow if Booking is Completed
        // Only allow if Booking is Completed or Work-finished
        if(booking.status !== "completed" && booking.status !== "work-finished"){
            return res.status(StatusCodes.FORBIDDEN).json({
                error:"Feedback allowed only after work completion/verification"
            });
        }


        //Prevent Duplicate Feedback
        const existing = await Feedback.findOne({
            bookingId,
            userId,
        }).select("_id");

        if (existing) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: "Feedback already submitted."
            });
        }


        // create Feedback

        const feedback = await Feedback.create({
            bookingId,
            providerId: booking.providerId._id,
            userId,
            rating,
            message,
            category,
        });

        // Scalable Aggregation for Rating
        const stats = await Feedback.aggregate([
            { $match: { providerId: booking.providerId._id } },
            { $group: { _id: null, avgRating: { $avg: "$rating" } } }
        ]);

        const avgRating = stats[0]?.avgRating || rating;

        await Provider.findByIdAndUpdate(
            booking.providerId._id,
            { rating: avgRating }
        );

        // Create Provider Notification for Rating
        try {
            await ProviderNotification.create({
                providerId: booking.providerId._id,
                bookingId,
                type: "customer_rating",
                title: "New Customer Rating",
                message: `A customer has rated you ${rating} stars for your service "${booking.serviceType || 'Service'}".`
            });
        } catch (notifErr) {
            console.error("Failed to create customer rating notification:", notifErr.message);
        }

        return res.status(StatusCodes.CREATED).json({
            message: "Feedback submitted successfully",
            feedback,
        });
    } catch (error) {
        console.error("Feedback Error:", error);

        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            error: "Feedback submission failed",
        });
    }
};