import express from "express";
import { providerBookingAction, setBookingEstimate } from "../controllers/providerAction.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRegistrationComplete } from "../middleware/requireRegistrationComplete.js";

const router = express.Router();

router.use(requireAuth);
router.use(requireRegistrationComplete);

router.post("/action", providerBookingAction);
router.put("/estimate", setBookingEstimate);

export default router;