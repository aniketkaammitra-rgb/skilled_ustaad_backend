import admin from "../config/firebaseAdmin.js"
import AdminNotification from "../models/AdminNotification.js";

/**
 * Sends a notification to a specific Provider's device.
 * Supports both direct booking dispatch and generic notifications.
 */
export async function sendProviderNotification(provider, bookingOrNotif) {
  if (!provider.deviceToken) {
    // console.log("Provider has no device token:", provider._id);
    return;
  }

  // Handle both Booking objects (from dispatch) and Notification data (from hook)
  const isBooking = !!bookingOrNotif._id && !bookingOrNotif.body;
  const title = isBooking ? "New Booking Request" : (bookingOrNotif.title || "Notification");
  const body = isBooking ? `Service: ${bookingOrNotif.serviceType} | Price: ₹${bookingOrNotif.price}` : (bookingOrNotif.body || "");
  const data = isBooking ? {
    bookingId: bookingOrNotif._id.toString(),
    type: "BOOKING_REQUEST"
  } : (bookingOrNotif.data || {});

  const unreadCount = parseInt(data.unreadCount) || 1;

  const clickActionUrl = data.url || (data.bookingId ? `/profile/job/${data.bookingId}` : '/profile/notifications');

  const message = {
    token: provider.deviceToken,
    notification: {
      title,
      body,
    },
    data: {
      ...data,
      title,
      body,
      unreadCount: unreadCount.toString(),
      type: data.type || (isBooking ? "BOOKING_REQUEST" : "GENERIC_PROVIDER_NOTIF")
    },
    // ANDROID configuration for badges
    android: {
      notification: {
        notificationCount: unreadCount,
        sound: "default",
      },
      priority: 'high'
    },
    // APNS (iOS) configuration for badges
    apns: {
      payload: {
        aps: {
          badge: unreadCount,
          sound: "default",
          'content-available': 1
        },
      },
    },
    // WEBPUSH (PWA) configuration
    webpush: {
      headers: {
        Urgency: 'high'
      },
      notification: {
        title,
        body,
        icon: '/logo-main.png',
        badge: '/logo-main.png',
        click_action: clickActionUrl,
        vibrate: [300, 110, 300, 110, 450],
        silent: false,
        renotify: true,
        tag: data.tag || 'fcm-notification'
      },
      data: {
        unreadCount: unreadCount.toString(),
      }
    }
  };

  try {
    await admin.messaging().send(message);
    // console.log("Notification sent to provider:", provider._id);

    // Broadcast via Socket for live experience
    try {
      if (isBooking) {
        const { getIO } = await import("../libs/socket.js");
        getIO().to(`provider_${provider._id}`).emit("new_booking_request", {
          bookingId: bookingOrNotif._id,
          price: bookingOrNotif.price,
          service: bookingOrNotif.serviceType,
          client: bookingOrNotif.userId, // Can be improved with fullName later if needed
          createdAt: new Date()
        });
      }
    } catch (socketErr) {
      console.warn("Could not broadcast to provider via socket:", socketErr.message);
    }
  } catch (err) {
    console.error("Provider FCM Error:", err);

    // Clear dead tokens from database if FCM says they are no longer registered
    if (err.code === 'messaging/registration-token-not-registered' ||
      err.message === 'NotRegistered') {
      try {
        const Provider = (await import("../models/Provider.js")).default;
        await Provider.findByIdAndUpdate(provider._id, { deviceToken: null });
        // console.log(`Cleared invalid FCM token for provider: ${provider._id}`);
      } catch (dbErr) {
        // console.error("Failed to clear dead FCM token:", dbErr.message);
      }
    }
  }
}

/**
 * Sends a notification to the 'admin_notifications' topic and saves it to DB.
 */
export async function sendAdminNotification({ type, title, message, metadata = {} }) {
  try {
    // 1. Persist in database
    await AdminNotification.create({ type, title, message, metadata });

    // 2. Send via Firebase Topic
    const fcmMessage = {
      topic: "admin_notifications",
      notification: {
        title,
        body: message,
      },
      data: {
        ...metadata,
        type: type.toString()
      }
    };

    await admin.messaging().send(fcmMessage);
    // console.log(`Admin notification sent: ${title}`);

    // 3. Broadcast via Socket.io for live dashboard updates
    try {
      const { getIO } = await import("../libs/socket.js");
      getIO().to("admin_room").emit("new_admin_notification", {
        type,
        title,
        message,
        metadata,
        createdAt: new Date()
      });
    } catch (socketErr) {
      console.warn("Could not broadcast admin notification via socket:", socketErr.message);
    }
  } catch (err) {
    console.error("Admin FCM Error:", err);
  }
}

/**
 * Sends a push notification to a specific User's device.
 */
export async function sendUserNotification(user, { title, body, data = {} }) {
  if (!user || !user.deviceToken) {
    // No need to log excessively here as it might be a normal case (user opted out or hasn't granted permission)
    return;
  }

  const unreadCount = parseInt(data.unreadCount) || 1;

  const clickActionUrl = data.url || (data.bookingId ? `/booking/${data.bookingId}/detail` : '/');

  const fcmMessage = {
    token: user.deviceToken,
    notification: {
      title,
      body,
    },
    data: {
      ...data,
      title,
      body,
      unreadCount: unreadCount.toString(),
      type: data.type ? data.type.toString() : "GENERIC_USER_NOTIF"
    },
    // ANDROID configuration for badges and sounds
    android: {
      notification: {
        notificationCount: unreadCount,
        sound: "default",
      },
      priority: 'high'
    },
    // APNS (iOS) configuration for badges and sounds
    apns: {
      payload: {
        aps: {
          badge: unreadCount,
          sound: "default",
          'content-available': 1
        },
      },
    },
    // WEBPUSH (PWA) configuration
    webpush: {
      headers: {
        Urgency: 'high'
      },
      notification: {
        title,
        body,
        icon: '/logo-removebg-preview(1).png',
        badge: '/pwa-192x192.png',
        click_action: clickActionUrl,
        vibrate: [300, 110, 300, 110, 450],
        silent: false,
        renotify: true,
        tag: data.tag || 'fcm-notification'
      },
      data: {
        unreadCount: unreadCount.toString(),
      }
    }
  };

  try {
    await admin.messaging().send(fcmMessage);
    // console.log(`Push notification sent to user: ${user._id}`);
  } catch (err) {
    console.error("User FCM Error:", err);

    // Clear dead tokens
    if (err.code === 'messaging/registration-token-not-registered' ||
      err.message === 'NotRegistered') {
      try {
        const User = (await import("../models/User.js")).default;
        await User.findByIdAndUpdate(user._id, { deviceToken: null });
        // console.log(`Cleared invalid FCM token for user: ${user._id}`);
      } catch (dbErr) {
        console.error("Failed to clear dead user FCM token:", dbErr.message);
      }
    }
  }
}