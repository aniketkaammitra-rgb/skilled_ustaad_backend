import express from "express";
import { 
    sendMessage, 
    getMessagesByBooking, 
    clearChat, 
    reportChatIssue, 
    muteChatNotifications 
} from "../controllers/chat.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

router.get("/:bookingId", requireAuth, getMessagesByBooking);
router.post("/send", requireAuth, sendMessage);
router.delete("/:bookingId/clear", requireAuth, clearChat);
router.post("/report", requireAuth, reportChatIssue);
router.post("/:bookingId/mute", requireAuth, muteChatNotifications);

export default router;
