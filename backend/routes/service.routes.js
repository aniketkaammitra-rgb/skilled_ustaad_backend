import express from "express";
import {
  getServices,
  getServiceById,
  addService,
  updateService,
  deleteService,
  patchServiceStatus,
  addCityToService,
  removeCityFromService,
  getHierarchy,
  getGlobalStats,
  getPopularProviders,
  getHighDemandServices,
  getProvidersByService,
} from "../controllers/service.controller.js";
import { requireAuth, optionalAuth } from "../middleware/requireAuth.js";
import { upload } from "../middleware/uploadMiddleware.js";

const router = express.Router();

// GET providers for a specific service
router.get("/:id/providers", optionalAuth, getProvidersByService);

// GET all services (city + query filter)
router.get("/", optionalAuth, getServices);

// platform stats
router.get("/stats", getGlobalStats);

// Hierarchy for Registration (Must be before /:id)
router.get("/hierarchy", getHierarchy);

// Popular Providers & Trending Services (Public)
router.get("/popular-providers", getPopularProviders);
router.get("/high-demand", getHighDemandServices);

// GET single service by ID
router.get("/:id", optionalAuth, getServiceById);

// Add new service
router.post("/", requireAuth, upload.single("image"), addService);

// Update service
router.put("/:id", requireAuth, upload.single("image"), updateService);

// Delete service
router.delete("/:id", requireAuth, deleteService);

// Patch Status
router.patch("/:id/status", requireAuth, patchServiceStatus);

// Management City
router.patch("/:id/add-city", requireAuth, addCityToService);
router.patch("/:id/remove-city", requireAuth, removeCityFromService);

export default router;
