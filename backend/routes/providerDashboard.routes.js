import { Router } from "express";
// // import { requireAuth } from "../middleware/requireAuth";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRegistrationComplete } from "../middleware/requireRegistrationComplete.js";
import { getProviderDashboard, toggleAvailability } from "../controllers/providerDashboard.controller.js";
import { getProviderProfile } from "../controllers/provider.controller.js"; 

const router = Router();

router.get("/profile", requireAuth, getProviderProfile);

router.get("/dashboard", requireAuth, requireRegistrationComplete, getProviderDashboard);

router.patch("/availability", requireAuth, requireRegistrationComplete, toggleAvailability);

export default router;


