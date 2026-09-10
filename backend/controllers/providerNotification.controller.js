import ProviderNotification from "../models/ProviderNotification.js";
import Provider from "../models/Provider.js";

export async function getProviderNotifications(req,res){
   const providerId = req.user.sub;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    try {
      // 1. Fetch disabled notification types from Provider preferences
      const provider = await Provider.findById(providerId).select("notificationPreferences status");
      if (!provider || provider.status !== "Active") {
        return res.json({
          success: true,
          notifications: [],
          pagination: {
            total: 0,
            page,
            limit,
            pages: 0
          }
        });
      }
      const prefs = provider?.notificationPreferences || {};
      
      const disabledTypes = Object.keys(prefs).filter(type => prefs[type] === false);

      // 2. Query with pagination and exclusion of disabled types
      const query = { providerId };
      if (disabledTypes.length > 0) {
        query.type = { $nin: disabledTypes };
      }

      const notifications = await ProviderNotification.find(query)
        .select("type title message metadata isRead createdAt")
        .populate("bookingId", "status providerId service serviceType address city date time")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await ProviderNotification.countDocuments(query);

      res.json({
        success: true,
        notifications,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
}

export async function getNotificationPreferences(req, res) {
  try {
    const provider = await Provider.findById(req.user.sub).select("notificationPreferences");
    res.json(provider?.notificationPreferences || {});
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
}

export async function updateNotificationPreferences(req, res) {
  try {
    const provider = await Provider.findByIdAndUpdate(
      req.user.sub,
      { notificationPreferences: req.body },
      { new: true }
    );
    res.json(provider.notificationPreferences);
  } catch (error) {
    res.status(500).json({ error: "Failed to update preferences" });
  }
}

export async function markNotificationAsRead(req, res) {
    try {
        const { id } = req.params;
        const notification = await ProviderNotification.findOneAndUpdate(
            { _id: id, providerId: req.user.sub },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }

        res.json(notification);
    } catch (error) {
        res.status(500).json({ error: "Failed to update notification" });
    }
}

export async function markAllNotificationsAsRead(req, res) {
  try {
    const providerId = req.user.sub;
    await ProviderNotification.updateMany(
      { providerId, isRead: false },
      { isRead: true }
    );
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update notifications" });
  }
}

export async function deleteAllNotifications(req, res) {
  try {
    const providerId = req.user.sub;
    await ProviderNotification.deleteMany({ providerId });
    res.json({ message: "All notifications deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete notifications" });
  }
}

export async function getUnreadNotificationCount(req, res) {
  try {
    const providerId = req.user.sub;
    const provider = await Provider.findById(providerId).select("status");
    if (!provider || provider.status !== "Active") {
      return res.json({ count: 0 });
    }
    const count = await ProviderNotification.countDocuments({
      providerId,
      isRead: false
    });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
}