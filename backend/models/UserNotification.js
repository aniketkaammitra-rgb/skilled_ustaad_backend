import mongoose from "mongoose";

const userNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
        "booking_status",
        "payment_confirmation",
        "chat_message",
        "service_update",
        "promotion",
        "system_alert",
        "new_bid",
        "bid_accepted",
        "bid_rejected"
      ],
      default: "booking_status",
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
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

userNotificationSchema.index({ userId: 1 });
userNotificationSchema.index({ isRead: 1 });
userNotificationSchema.index({ createdAt: -1 });

userNotificationSchema.post("save", async function (doc) {
  try {
    const unreadCount = await doc.constructor.countDocuments({ userId: doc.userId, isRead: false });

    // 1. Socket.io broadcast (Immediate delivery for active sessions)
    const { getIO } = await import("../libs/socket.js");
    getIO().to(`user_${doc.userId.toString()}`).emit("notification", {
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
    const [User, { sendUserNotification }] = await Promise.all([
      import("./User.js").then(m => m.default),
      import("../services/fcm.service.js")
    ]);

    const user = await User.findById(doc.userId).select("deviceToken");
    if (user && user.deviceToken) {
      await sendUserNotification(user, {
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
    console.error("User Notification Lifecycle Error:", err.message);
  }
});

const UserNotification = mongoose.model("UserNotification", userNotificationSchema);
export default UserNotification;
