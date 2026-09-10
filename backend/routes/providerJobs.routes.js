
import express from "express";
import {
  getProviderJobs,
  updateJobStatus,
} from "../controllers/providerJobs.controller.js";

import { requireAuth } from "../middleware/requireAuth.js";
import { requireRegistrationComplete } from "../middleware/requireRegistrationComplete.js";

const router = express.Router();

router.use(requireAuth);
router.use(requireRegistrationComplete);

/* GET JOBS */
router.get("/jobs", getProviderJobs);

/* UPDATE JOB STATUS */
router.patch("/jobs/:id/status", updateJobStatus);

export default router;