import express from "express";
import { submitFeedback } from "../controllers/feedback.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

router.post("/:bookingId",requireAuth,submitFeedback);

export default router;