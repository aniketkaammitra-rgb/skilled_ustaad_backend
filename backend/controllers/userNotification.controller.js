import UserNotification from "../models/UserNotification.js";
import logger from "../libs/logger.js";

export const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.sub;
    const notifications = await UserNotification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    res.json(notifications);
  } catch (err) {
    logger.error(`Get User Notifications Error: ${err.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.sub;

    const notification = await UserNotification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json(notification);
  } catch (err) {
    logger.error(`Mark Notification Read Error: ${err.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.sub;
    await UserNotification.updateMany({ userId, isRead: false }, { isRead: true });
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    logger.error(`Mark All Read Error: ${err.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.sub;

    const notification = await UserNotification.findOneAndDelete({ _id: notificationId, userId });
    if (!notification) return res.status(404).json({ error: "Notification not found" });

    res.json({ message: "Notification deleted" });
  } catch (err) {
    logger.error(`Delete Notification Error: ${err.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const deleteAllNotifications = async (req, res) => {
  try {
    const userId = req.user.sub;
    await UserNotification.deleteMany({ userId });
    res.json({ message: "All notifications deleted" });
  } catch (err) {
    logger.error(`Delete All Notifications Error: ${err.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.sub;
    const count = await UserNotification.countDocuments({ userId, isRead: false });
    res.json({ count });
  } catch (err) {
    logger.error(`Get Unread Count Error: ${err.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const markByBookingRead = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.sub;
    
    await UserNotification.updateMany(
      { userId, bookingId, isRead: false },
      { isRead: true }
    );
    
    res.json({ message: "Notifications for booking marked as read" });
  } catch (err) {
    logger.error(`Mark By Booking Read Error: ${err.message}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
