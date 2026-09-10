import rateLimit from "express-rate-limit";

// Generic rate limiter for all API requests
export const globalLimiter = process.env.NODE_ENV === "test" 
  ? (req, res, next) => next()
  : rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000, // Limit each IP to 2000 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
});

// Stricter limiter for Auth/OTP routes to prevent brute force
export const authLimiter = process.env.NODE_ENV === "test"
  ? (req, res, next) => next()
  : rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 20, // 20 attempts per 15 mins
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts, please try again in 15 minutes." }
});

// Even stricter for SMS/OTP sending (Costs money!)
export const otpLimiter = process.env.NODE_ENV === "test"
  ? (req, res, next) => next()
  : rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 OTPs per hour per IP (Increased for stability)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many OTP requests. Please wait an hour." }
});