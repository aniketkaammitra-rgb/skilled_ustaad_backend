import express from "express";
import {
  getActivePlans,
  getAllPlans,
  createPlan,
  updatePlan,
  deletePlan,
} from "../controllers/subscriptionPlan.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

// Public / Provider route
router.get("/active", getActivePlans);

// Admin routes
router.get("/", requireAuth, getAllPlans);
router.post("/", requireAuth, createPlan);
router.put("/:id", requireAuth, updatePlan);
router.delete("/:id", requireAuth, deletePlan);

export default router;
