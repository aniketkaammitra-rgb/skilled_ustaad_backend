// routes/otp.routes.js
import express from 'express';
import {
    generateBookingOTP,
    generateCompletionOTP,
    validateBookingOtp,
    validateCompletionOtp
} from '../controllers/otp.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { otpLimiter } from '../middleware/rateLimits.js';

const router = express.Router();

// Pre-service booking OTP
router.post('/booking-otp', requireAuth, otpLimiter, generateBookingOTP);

// Post-service completion OTP
router.post('/completion-otp', requireAuth, otpLimiter, generateCompletionOTP);

// Validate booking OTP
router.post('/validate-booking-otp', requireAuth, validateBookingOtp);

// Validate completion OTP
router.post('/validate-completion-otp', requireAuth, validateCompletionOtp);

export default router;