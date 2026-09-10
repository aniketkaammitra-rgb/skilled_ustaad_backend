import express from "express";
// test
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";


// Environment config
import env from "./config/env.js";

// Routes
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import providerRoutes from "./routes/provider.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import providerJobsRoutes from "./routes/providerJobs.routes.js";
import providerDashboardRoutes from "./routes/providerDashboard.routes.js";
import providerEarningRoutes from "./routes/providerEarning.routes.js";
import FeedbackRoutes from "./routes/feedback.routes.js";
import notificationRoutes from "./routes/providerNotifications.routes.js";
import providerAction from "./routes/providerAction.routes.js";
import otpRoutes from "./routes/otp.routes.js";
import providerBookingPaymentDetail from "./routes/providerBookingPaymentDetail.routes.js"
import Feedback from "./models/Feedback.js";
import chatRoutes from "./routes/chat.routes.js";
import chatbotRoutes from "./routes/chatbot.routes.js";
import userNotificationRoutes from "./routes/userNotification.routes.js";
import walletRoutes from "./routes/wallet.routes.js";
import biddingRoutes from "./routes/bidding.routes.js";
import alternateAddressRoutes from "./routes/alternateAddress.routes.js";
import seoRoutes from "./routes/seo.routes.js";
import subscriptionPlanRoutes from "./routes/subscriptionPlan.routes.js";

// Middleware
import errorHandler from "./middleware/error.js";

const app = express();

// Trust proxy in production
app.set("trust proxy", env.env === "production" ? 1 : false);

// const allowedPattern = /^(https?:\/\/)?(localhost|([a-z0-9-]+\.)?karayabandhu\.com)(:\d+)?$/i;
const allowedPattern = /^(https?:\/\/)?(localhost|([a-z0-9-]+\.)?karayabandhu\.com|([a-z0-9-]+\.)?skilledustaad\.com|([a-z0-9-]+\.)?vercel\.app)(:\d+)?$/i;

app.use(cors({
    origin: (origin, callback) => {
        // Automatically allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        const isAllowed = allowedPattern.test(origin) ||
            (env.corsOrigins && env.corsOrigins.includes(origin));

        if (isAllowed) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked for origin: ${origin}`);
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));
// Latency/Response Time header for monitoring performance in production
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        // console.log(`Request processed: ${req.method} ${req.url} [${duration}ms]`);
    });
    next();
});

// Security & performance middlewares
// Robust Security Configuration for Production (SecurityHeaders.com A+ Grade)
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://maps.googleapis.com", "https://*.googletagmanager.com", "https://checkout.razorpay.com", "https://cdn.razorpay.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "blob:", "https://maps.gstatic.com", "https://maps.google.com", "https://*.googleapis.com", "https://*.googleusercontent.com", "https://*.firebasestorage.app", "https://*.onrender.com", "https://assets.mixkit.co", "https://res.cloudinary.com", "https://cdn-icons-png.flaticon.com", "https://images.unsplash.com", "http://localhost:5000", "http://127.0.0.1:5000"],
            mediaSrc: ["'self'", "data:", "blob:", "https://assets.mixkit.co"],
            connectSrc: ["'self'", "https://*.onrender.com", "wss://*.onrender.com", "https://*.googleapis.com", "https://*.google-analytics.com", "https://fonts.gstatic.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:", "https://cdn.jsdelivr.net"],
            frameSrc: ["'self'", "https://*.onrender.com", "https://www.youtube.com", "https://api.razorpay.com"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
    },
    frameguard: {
        action: "sameorigin",
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
app.use(compression());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

// Prevent caching of API responses
app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
});

// Logging
if (env.env !== "production") app.use(morgan("dev"));

// CORS

// Rate limiting
import { globalLimiter, authLimiter } from "./middleware/rateLimits.js";
app.use("/api", globalLimiter);

import path from "path";

// Health check routes
app.get("/", (req, res) => res.json({ message: "Karaya Bandhu API Node" }));
app.get("/health", (req, res) => res.status(200).json({ message: "Healthy", uptime: process.uptime() }));

// Serve static uploads with caching headers (1 year maxAge) for performance
const staticOptions = {
    maxAge: "31536000000",
    immutable: true,
    setHeaders: (res) => {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    }
};
app.use("/uploads", express.static(path.join(path.resolve(), "uploads"), staticOptions));

// API routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/services", serviceRoutes);
app.use("/api/v1/provider", providerRoutes);
app.use("/api/v1/booking", bookingRoutes);
app.use("/api/v1/payment", paymentRoutes);
app.use("/api/v1/provider", providerDashboardRoutes);
app.use("/api/v1/provider", providerJobsRoutes);
app.use("/api/v1/feedback", FeedbackRoutes);
app.use("/api/v1/provider/booking", providerAction);
app.use("/api/v1/otp", otpRoutes);
app.use("/api/v1/providerBookingPaymentDetail", providerBookingPaymentDetail);
app.use("/api/v1/chatbot", chatbotRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/user/notifications", userNotificationRoutes);
app.use("/api/v1/user/alternate-address", alternateAddressRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/bids", biddingRoutes);
app.use("/", seoRoutes); // Allows accessing /sitemap.xml directly on the backend
app.use("/api/v1/subscription-plans", subscriptionPlanRoutes);
app.use("/api/subscription-plans", subscriptionPlanRoutes);

// Admin routes
import adminRoutes from "./routes/admin.routes.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { upload } from "./middleware/uploadMiddleware.js";
import {
    getStats,
    getCustomers,
    updateCustomerStatus,
    getProviders,
    updateProviderStatus,
    getFinanceTransactions,
    getFinanceTotal,
    getNotificationSettings,
    updateNotificationSettings,
    getGeneralSettings,
    updateGeneralSettings,
    getSupportInfo,
    updateSupportInfo,
    submitSupportQuery,
    getSupportQueries,
    updateSupportQueryStatus,
    submitSecOpsReport,
    getSecOpsReports,
    updateSecOpsReportStatus,
    getPayouts,
    updatePayoutStatus,
    getRevenueAnalytics,
    getAdminNotifications,
    markNotificationsRead,
    rotateSecurityKeys
} from "./controllers/admin.controller.js";
import { getServices } from "./controllers/service.controller.js";
import { loginAdmin, signupAdmin, refreshTokenAdmin } from "./controllers/adminAuth.controller.js";

app.use("/api/v1/admin", adminRoutes);
app.use("/api/admin", adminRoutes);

// Aliases for dashboard compatibility
app.post("/api/auth/login", loginAdmin);
app.post("/api/auth/signup", signupAdmin);
app.post("/api/auth/refresh-token", refreshTokenAdmin);
app.get("/api/stats", requireAuth, getStats);
app.get("/api/revenue", requireAuth, getRevenueAnalytics);
app.get("/api/customers", requireAuth, getCustomers);
app.put("/api/customers/:id", requireAuth, updateCustomerStatus);
app.get("/api/providers", requireAuth, getProviders);
app.put("/api/providers/:id", requireAuth, updateProviderStatus);
app.get("/api/notifications/list", requireAuth, getAdminNotifications);
app.put("/api/notifications/read-all", requireAuth, markNotificationsRead);
app.get("/api/notifications", requireAuth, getNotificationSettings);
app.put("/api/notifications", requireAuth, updateNotificationSettings);
app.get("/api/settings", requireAuth, getGeneralSettings);
app.put("/api/settings", requireAuth, updateGeneralSettings);
app.get("/api/admin/settings", requireAuth, getGeneralSettings);
app.put("/api/admin/settings", requireAuth, updateGeneralSettings);

app.get("/api/support", getSupportInfo);
app.put("/api/support", requireAuth, updateSupportInfo);
app.post("/api/support/query", submitSupportQuery);
app.get("/api/support/queries", requireAuth, getSupportQueries);
app.put("/api/support/queries/:id/status", requireAuth, updateSupportQueryStatus);

app.post("/api/sec-ops/report", requireAuth, submitSecOpsReport);
app.post("/api/admin/security/rotate-keys", requireAuth, rotateSecurityKeys);
app.get("/api/sec-ops/reports", requireAuth, getSecOpsReports);
app.put("/api/sec-ops/reports/:id/status", requireAuth, updateSecOpsReportStatus);

app.get("/api/finance", requireAuth, getFinanceTransactions);
app.get("/api/finance/total", requireAuth, getFinanceTotal);

app.get("/api/payouts", requireAuth, getPayouts);
app.put("/api/payouts/:id/process", requireAuth, upload.single("receipt"), updatePayoutStatus);

app.use("/api/jobs", serviceRoutes);
app.get("/api/v1/jobs", requireAuth, getServices); // Deprecated but kept for compatibility

app.use("/api/v1/provider/earnings", providerEarningRoutes);
app.use("/api/v1/provider", notificationRoutes);

// Global error handler
app.use(errorHandler);

export default app;
