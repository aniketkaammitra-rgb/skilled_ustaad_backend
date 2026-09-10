// controllers/otp.controller.js
import crypto from 'crypto';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import { StatusCodes } from 'http-status-codes';

const SECRET_KEY = "sjgfasbdhfjdsjdasjfhadasdfnasdasdfas";

// Helper: Generate Booking OTP (long-lived)
function generateBookingOtpLogic(userId, bookingId, date, time) {
    const data = `${userId}${bookingId}${SECRET_KEY}${date}${time}`;
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return parseInt(hash.substring(0,6),16) % 1000000; // 6-digit OTP
}

// Helper: Generate Completion OTP (short-lived, 15 min)
function generateCompletionOtpLogic(userId, bookingId, date, time) {
    const timestampWindow = Math.floor(Date.now() / (1000 * 60 * 15)); // 15-min window
    const data = `${userId}${bookingId}${SECRET_KEY}${date}${time}${timestampWindow}`;
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return parseInt(hash.substring(0,6),16) % 1000000;
}

// ====== CONTROLLERS ======

// 1️⃣ Generate Booking OTP (Pre-Service)
export const generateBookingOTP = async (req, res) => {
    try {
        const { bookingId } = req.body;
        if (!bookingId) {
            return res.status(StatusCodes.BAD_REQUEST).json({ error: "bookingId is required" });
        }

        // Fetch booking and user info with selective fields
        const booking = await Booking.findById(bookingId).select("userId date time");
        if (!booking) return res.status(StatusCodes.NOT_FOUND).json({ error: "Booking not found" });

        const user = await User.findById(booking.userId).select("_id");
        if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });

        const otp = generateBookingOtpLogic(user._id, booking._id, booking.date, booking.time);

        return res.status(StatusCodes.OK).json({
            userId: user._id,
            bookingId: booking._id,
            date: booking.date,
            time: booking.time,
            otp,
            qrPayload: JSON.stringify({
                userId: user._id,
                bookingId: booking._id,
                date: booking.date,
                time: booking.time,
                otp
            })
        });

    } catch (error) {
        console.error(error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Server error" });
    }
};

// 2️⃣ Generate Completion OTP (Post-Service)
export const generateCompletionOTP = async (req, res) => {
    try {
        const { bookingId } = req.body;
        if (!bookingId) {
            return res.status(StatusCodes.BAD_REQUEST).json({ error: "bookingId is required" });
        }

        const booking = await Booking.findById(bookingId).select("userId date time");
        if (!booking) return res.status(StatusCodes.NOT_FOUND).json({ error: "Booking not found" });

        const user = await User.findById(booking.userId).select("_id");
        if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });

        const otp = generateCompletionOtpLogic(user._id, booking._id, booking.date, booking.time);

        return res.status(StatusCodes.OK).json({
            userId: user._id,
            bookingId: booking._id,
            otp,
            validMinutes: 15
        });

    } catch (error) {
        console.error(error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Server error" });
    }
};

// 3️⃣ Validate Booking OTP
// export const validateBookingOtp = async (req, res) => {
//     try {
//         const { bookingId, otp } = req.body;
//         if (!bookingId || !otp) {
//             return res.status(StatusCodes.BAD_REQUEST).json({ error: "bookingId and otp required" });
//         }

//         const booking = await Booking.findById(bookingId);
//         if (!booking) return res.status(StatusCodes.NOT_FOUND).json({ error: "Booking not found" });

//         const user = await User.findById(booking.userId);
//         if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });

//         const expectedOtp = generateBookingOtpLogic(user._id, booking._id, booking.dateOfBooking, booking.timeOfBooking);

//         return res.status(StatusCodes.OK).json({ valid: parseInt(otp) === expectedOtp });

//     } catch (error) {
//         console.error(error);
//         return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Server error" });
//     }
// };

export const validateBookingOtp = async (req, res) => {
    try {
        const { bookingId, otp } = req.body;

        if (!bookingId || !otp) {
            return res.status(400).json({ error: "bookingId and otp required" });
        }

        const booking = await Booking.findById(bookingId).select("userId date time");
        if (!booking) return res.status(404).json({ error: "Booking not found" });

        const user = await User.findById(booking.userId).select("_id");
        if (!user) return res.status(404).json({ error: "User not found" });

        const expectedOtp = generateBookingOtpLogic(
            user._id,
            booking._id,
            booking.date,
            booking.time
        );

        const isValid = parseInt(otp) === expectedOtp;

        if (isValid) {
            await Booking.findByIdAndUpdate(bookingId, { isVerified: true });
        }

        return res.status(200).json({ valid: isValid });

    } catch (error) {
        return res.status(500).json({ error: "Server error" });
    }
};

// 4️⃣ Validate Completion OTP
export const validateCompletionOtp = async (req, res) => {
    try {
        const { bookingId, otp } = req.body;
        if (!bookingId || !otp) {
            return res.status(StatusCodes.BAD_REQUEST).json({ error: "bookingId and otp required" });
        }

        const booking = await Booking.findById(bookingId).select("userId date time");
        if (!booking) return res.status(StatusCodes.NOT_FOUND).json({ error: "Booking not found" });

        const user = await User.findById(booking.userId).select("_id");
        if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });

        const expectedOtp = generateCompletionOtpLogic(user._id, booking._id, booking.date, booking.time);

        return res.status(StatusCodes.OK).json({ valid: parseInt(otp) === expectedOtp });

    } catch (error) {
        console.error(error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Server error" });
    }
};