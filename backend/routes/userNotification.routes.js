import express from "express";
import { 
  getUserNotifications, 
  markAsRead, 
  markAllAsRead, 
  deleteNotification,
  deleteAllNotifications,
  getUnreadCount,
  markByBookingRead
} from "../controllers/userNotification.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

router.get("/", requireAuth, getUserNotifications);
router.get("/unread-count", requireAuth, getUnreadCount);
router.put("/mark-all-read", requireAuth, markAllAsRead);
router.put("/:notificationId/read", requireAuth, markAsRead);
router.put("/booking/:bookingId/read", requireAuth, markByBookingRead);
router.delete("/", requireAuth, deleteAllNotifications);
router.delete("/:notificationId", requireAuth, deleteNotification);

export default router;
