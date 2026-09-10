import express from "express";
import { 
    getProviderNotifications, 
    markNotificationAsRead,
    getNotificationPreferences,
    updateNotificationPreferences,
    getUnreadNotificationCount,
    markAllNotificationsAsRead,
    deleteAllNotifications
} from "../controllers/providerNotification.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRegistrationComplete } from "../middleware/requireRegistrationComplete.js";

const router = express.Router();

router.use(requireAuth);
router.use(requireRegistrationComplete);

router.get("/notifications", getProviderNotifications);
router.get("/notifications/unread-count", getUnreadNotificationCount);
router.patch("/notifications/read-all", markAllNotificationsAsRead);
router.delete("/notifications", deleteAllNotifications);
router.patch("/notifications/:id/read", markNotificationAsRead);

router.get("/notifications/preferences", getNotificationPreferences);
router.patch("/notifications/preferences", updateNotificationPreferences);

export default router;