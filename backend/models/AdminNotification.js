import mongoose from "mongoose";

const adminNotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "new_booking",
        "new_provider",
        "new_customer",
        "new_chat",
        "payout_request",
        "system_alert",
        "refund_request",
      ],
      required: true,
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

adminNotificationSchema.index({ createdAt: -1 });

// Socket.io emitting hook
adminNotificationSchema.post("save", async function (doc) {
  try {
    const { getIO } = await import("../libs/socket.js");
    getIO().to(`admin_room`).emit("admin_notification", {
      id: doc._id,
      type: doc.type,
      title: doc.title,
      message: doc.message,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
    });
  } catch (err) {
    console.error("Socket.io Admin Notification Hook Error:", err.message);
  }
});

export default mongoose.model("AdminNotification", adminNotificationSchema);
