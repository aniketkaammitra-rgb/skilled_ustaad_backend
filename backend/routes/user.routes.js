import { Router } from "express";
import  protect  from "../middleware/auth.js";
import { saveAddress, me, saveDeviceToken, updateNotificationSound } from "../controllers/user.controller.js";

const router = Router();
router.get("/me", protect, me);
router.post("/address", protect, saveAddress);
router.post("/device-token", protect, saveDeviceToken);
router.post("/notification-sound", protect, updateNotificationSound);

export default router;