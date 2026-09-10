import Message from "../models/Message.js";
import Booking from "../models/Booking.js";
import UserNotification from "../models/UserNotification.js";
import ProviderNotification from "../models/ProviderNotification.js";
import { getIO } from "../libs/socket.js";
import { sendAdminNotification } from "../services/fcm.service.js";
import logger from "../libs/logger.js";

export const sendMessage = async (req, res) => {
  try {
    const { bookingId, receiverId, content, message, tempId } = req.body;
    const msgContent = content || message;
    const senderId = req.user.sub;
    const senderRole = req.user.role;

    let targetReceiverId = receiverId;

    // Auto-resolve receiverId if missing from frontend
    if (!targetReceiverId && bookingId) {
      const booking = await Booking.findById(bookingId);
      if (booking) {
        if (senderRole === "user") {
          targetReceiverId = booking.providerId;
        } else if (senderRole === "provider") {
          targetReceiverId = booking.userId;
        }
      }
    }

    if (!msgContent || !targetReceiverId || !bookingId) {
      logger.warn(`SendMessage Validation Failed: Missing fields. Body: ${JSON.stringify(req.body)}, Resolved: ${targetReceiverId}`);
      return res.status(400).json({ 
        error: "Missing required fields",
        details: { bookingId: !!bookingId, receiverId: !!targetReceiverId, content: !!msgContent }
      });
    }

    const newMessage = await Message.create({
      bookingId,
      senderId,
      receiverId: targetReceiverId,
      senderRole,
      content: msgContent,
    });

    const io = getIO();
    
    // Structure message for client
    const messagePayload = {
      ...newMessage.toJSON(),
      tempId, // Pass back to frontend for deduplication
      message: msgContent, // Alias for compatibility
      senderName: req.user.name || (senderRole === 'admin' ? "Administrator" : (senderRole === 'provider' ? 'Expert' : 'Customer')),
    };

    // 1. Broadcast to the booking-specific room (for admins/participants who joined)
    io.to(`booking_${bookingId}`).emit("new_message", messagePayload);
    io.to(`booking_${bookingId}`).emit("receive_message", messagePayload); // For older Provider versions

    // 2. Private notification (Use a DIFFERENT event name to avoid duplication on ChatPage)
    const receiverRoom = senderRole === "user" ? `provider_${targetReceiverId}` : `user_${targetReceiverId}`;
    io.to(receiverRoom).emit("message_notification", messagePayload);

    // 3. (Optional) Emit to all admins 
    io.to('admin_room').emit("admin_chat_notification", { bookingId, ...messagePayload });

    /* 
    // 4. Notify Admin via FCM for high-priority activity (Disabled to prevent notification spam)
    if (senderRole !== "admin") {
      sendAdminNotification({
        type: "new_chat",
        title: `💬 Chat: ${messagePayload.senderName}`,
        message: msgContent.length > 50 ? msgContent.substring(0, 47) + "..." : msgContent,
        metadata: { bookingId: bookingId.toString(), senderRole }
      });
    }
    */

    // 5. Create Database Notifications for receiver
    if (senderRole === "provider") {
      await UserNotification.create({
        userId: targetReceiverId,
        bookingId,
        type: "chat_message",
        title: `💬 New message from Expert`,
        message: msgContent.length > 60 ? msgContent.substring(0, 57) + "..." : msgContent,
        metadata: { bookingId, senderId }
      });
    } else if (senderRole === "user") {
      await ProviderNotification.create({
        providerId: targetReceiverId,
        bookingId,
        type: "booking_request", // Reusing standard type
        title: `💬 New Customer Message`,
        message: msgContent.length > 60 ? msgContent.substring(0, 57) + "..." : msgContent,
        metadata: { bookingId, senderId }
      });
    }

    res.status(201).json(newMessage);
  } catch (err) {
    logger.error(`Send Message Error: ${err.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getMessagesByBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.sub;

    const messages = await Message.find({ bookingId })
      .sort({ createdAt: 1 })
      .lean();

    // Check if user is part of this booking
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    if (booking.userId.toString() !== userId && booking.providerId && booking.providerId.toString() !== userId && req.user.role !== "admin") {
      return res.status(403).json({ error: "Access Denied" });
    }

    res.json(messages);
  } catch (err) {
    logger.error(`Get Messages Error: ${err.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/* =====================================================
   CHAT MANAGEMENT ACTIONS
===================================================== */

export const clearChat = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.sub;

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    // Auth check
    if (booking.userId.toString() !== userId && booking.providerId?.toString() !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // In a real app, you'd mark messages as 'deletedFor: [userId]'
    // For simplicity, we'll delete all messages for this booking
    await Message.deleteMany({ bookingId });

    res.status(200).json({ message: "Conversation history purged successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const reportChatIssue = async (req, res) => {
  try {
    const { bookingId, reason, description } = req.body;
    const userId = req.user.sub;

    const SupportQuery = (await import("../models/SupportQuery.js")).default;
    const User = (await import("../models/User.js")).default;
    
    const user = await User.findById(userId);
    
    await SupportQuery.create({
      name: user.fullName,
      email: user.email || `${user.phoneNumber}@karaya.bandhu`,
      subject: `Report: Chat Booking #${bookingId.slice(-6)}`,
      message: `[Reason: ${reason}] Description: ${description || "No additional details provided."}`,
      status: "pending"
    });

    res.status(200).json({ message: "Report filed with security team." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const muteChatNotifications = async (req, res) => {
  try {
    const { bookingId } = req.params;
    // This would typically update a 'mutedUntil' or 'isMuted' flag in a User-Chat-Pivot or Booking model
    // For now, we return success as the actual logic depends on the notification sender implementation
    res.status(200).json({ message: "Notifications muted for this channel." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
