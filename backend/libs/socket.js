import { Server } from "socket.io";
import { verifyAccess } from "./token.js";
import logger from "./logger.js";
import env from "../config/env.js";

// Models for broadcastStats
import User from "../models/User.js";
import Provider from "../models/Provider.js";
import Service from "../models/Service.js";
import Transaction from "../models/Transaction.js";

let io = null;

export const initIO = (httpServer) => {
  const allowedPattern = /^(https?:\/\/)?(localhost|([a-z0-9-]+\.)?karayabandhu\.com|([a-z0-9-]+\.)?skilledustaad\.com)(:\d+)?$/i;

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedPattern.test(origin) || (env.corsOrigins && env.corsOrigins.includes(origin))) {
             callback(null, true);
        } else {
             callback(new Error("Not allowed by CORS"));
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // JWT Middleware for Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error: Token missing"));
    }

    const payload = verifyAccess(token);
    if (!payload || !payload.sub) {
      return next(new Error("Authentication error: Invalid token"));
    }

    socket.user = payload;
    next();
  });

  io.on("connection", (socket) => {
    const { sub, role } = socket.user;
    logger.info(`User connected: ${sub} (Role: ${role})`);

    // Join room based on role and ID
    const roomName = role === "provider" ? `provider_${sub}` : `user_${sub}`;
    socket.join(roomName);
    if (role === 'admin') socket.join('admin_room');
    logger.info(`Socket ${socket.id} joined individual room: ${roomName}`);

    // Unified join/leave for chat and booking rooms
    const handleJoin = (data) => {
      const bId = (typeof data === 'object') ? data.bookingId : data;
      if (bId) {
        socket.join(`booking_${bId}`);
        logger.info(`Socket ${socket.id} joined booking room: booking_${bId}`);
      }
    };

    const handleLeave = (data) => {
      const bId = (typeof data === 'object') ? data.bookingId : data;
      if (bId) {
        socket.leave(`booking_${bId}`);
        logger.info(`Socket ${socket.id} left booking room: booking_${bId}`);
      }
    };

    socket.on("join_chat", handleJoin);
    socket.on("join_booking", handleJoin);
    socket.on("leave_chat", handleLeave);
    socket.on("leave_booking", handleLeave);

    socket.on("join_admin", () => {
      socket.join("admin_room");
      logger.info(`Admin joined room: admin_room`);
    });

    socket.on("send_message", async (data) => {
      try {
        const { bookingId, receiverId, message, content, senderId, senderType } = data;
        const msgContent = content || message;

        if (!bookingId || !receiverId || !msgContent) {
           logger.error("Socket send_message error: Missing required fields", data);
           return;
        }

        const [Message, UserNotification, ProviderNotification] = await Promise.all([
          import("../models/Message.js").then(m => m.default),
          import("../models/UserNotification.js").then(m => m.default),
          import("../models/ProviderNotification.js").then(m => m.default)
        ]);

        const newMessage = await Message.create({
          bookingId,
          senderId: sub,
          senderRole: role,
          receiverId,
          content: msgContent
        });

        const payload = {
          ...newMessage.toJSON(),
          tempId: data.tempId, // Pass back to sender for robust deduplication
          message: msgContent, // Alias for compatibility
          senderName: role === 'provider' ? 'Expert' : 'Customer'
        };

        // Broadcast to booking room (One broadcast reaches all participants)
        io.to(`booking_${bookingId}`).emit("new_message", payload);
        io.to(`booking_${bookingId}`).emit("receive_message", payload); // Compatibility

        // Notify receiver privately for background/off-page notifications
        const receiverRoom = role === "user" ? `provider_${receiverId}` : `user_${receiverId}`;
        io.to(receiverRoom).emit("message_notification", payload);

        // Database Notification
        if (role === "user") {
          await ProviderNotification.create({
            providerId: receiverId,
            bookingId,
            type: "chat_message",
            title: "New Customer Message",
            message: msgContent.substring(0, 50)
          });
        } else {
          await UserNotification.create({
            userId: receiverId,
            bookingId,
            type: "chat_message",
            title: "Expert Message",
            message: msgContent.substring(0, 50)
          });
        }

      } catch (err) {
        logger.error(`Socket send_message exception: ${err.message}`);
      }
    });

    socket.on("disconnect", () => {
      logger.info(`User disconnected: ${sub}`);
    });

    // Send initial counts to admin on connection
    if (role === "admin") {
      broadcastStats();
    }
  });

  return io;
};

let statsCache = null;
let lastStatsFetch = 0;
const STATS_CACHE_TTL = 30 * 1000; // 30 seconds

let isFetchingStats = false;

export const broadcastStats = async () => {
  try {
    if (!io) return;

    // Use simple in-memory caching to avoid DB flooding (cache TTL of 30s)
    const now = Date.now();
    if (statsCache && (now - lastStatsFetch < STATS_CACHE_TTL)) {
      return io.emit("dashboardStats", statsCache);
    }

    // Lock to prevent multiple concurrent DB sweeps
    if (isFetchingStats) return;
    isFetchingStats = true;

    const [customerCount, providerCount, totalJobsCount] = await Promise.all([
      User.countDocuments(), // Assumed verified count is handled by specific stats if needed
      Provider.countDocuments(),
      Service.countDocuments({ status: "active" }),
    ]);

    const revenueResult = await Transaction.aggregate([
      { $match: { status: "Completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    
    const totalRevenue = revenueResult[0]?.total || 0;
    
    // Basic trends (static for now, could be dynamic)
    const trends = {
      customer: "+12%",
      provider: "+5%",
      job: "+18%",
      revenue: "+22%"
    };

    statsCache = {
      customerCount,
      providerCount,
      totalJobsCount,
      totalRevenue,
      trends
    };
    lastStatsFetch = now;
    isFetchingStats = false;

    io.emit("dashboardStats", statsCache);
  } catch (err) {
    isFetchingStats = false;
    logger.error("Error broadcasting stats:", err.message);
  }
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};
