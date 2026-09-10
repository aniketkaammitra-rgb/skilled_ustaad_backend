import mongoose from "mongoose";

const providerNotificationSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
    },

    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: false,
    },
    type: {
      type: String,
      enum: [
        "booking_request",
        "booking_accepted",
        "payment_received",
        "profile_verification",
        "customer_rating",
        "job_reminder",
        "payment_pending",
        "feature_update",
        "chat_message",
        "bidding_request",
        "bid_accepted",
        "bid_rejected",
      ],
      default: "booking_request",
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

providerNotificationSchema.index({ providerId: 1 });
providerNotificationSchema.index({ isRead: 1 });
providerNotificationSchema.index({ createdAt: -1 });

providerNotificationSchema.post("save", async function (doc) {
  try {
    const unreadCount = await doc.constructor.countDocuments({ providerId: doc.providerId, isRead: false });

    // 1. Socket.io broadcast (Immediate delivery for active sessions)
    const { getIO } = await import("../libs/socket.js");
    getIO().to(`provider_${doc.providerId.toString()}`).emit("notification", {
      id: doc._id,
      type: doc.type,
      title: doc.title,
      message: doc.message,
      metadata: doc.metadata,
      bookingId: doc.bookingId,
      unreadCount,
      createdAt: doc.createdAt,
    });

    // 2. FCM Push Notification (Background delivery via Firebase)
    const [ProviderModel, { sendProviderNotification }] = await Promise.all([
      import("./Provider.js").then(m => m.default),
      import("../services/fcm.service.js")
    ]);

    const provider = await ProviderModel.findById(doc.providerId).select("deviceToken");
    if (provider && provider.deviceToken) {
      await sendProviderNotification(provider, {
        title: doc.title,
        body: doc.message,
        data: {
          bookingId: doc.bookingId?.toString() || "",
          notificationId: doc._id.toString(),
          type: doc.type,
          unreadCount: unreadCount.toString()
        }
      });
    }
  } catch (err) {
    console.error("Socket.io Notification Hook Error:", err.message);
  }
});

const ProviderNotification = mongoose.model(
  "ProviderNotification",
  providerNotificationSchema
);
export default ProviderNotification;