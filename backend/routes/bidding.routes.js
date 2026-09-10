import express from "express";
import {
  createBiddingRequest,
  getOpenRequests,
  placeBid,
  getBidsForRequest,
  acceptBid,
  getMyBiddingRequests,
  getProviderBids,
  cancelBiddingRequest,
  getBiddingRequestById,
} from "../controllers/bidding.controller.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { requireRegistrationComplete } from "../middleware/requireRegistrationComplete.js";

const router = express.Router();

// CUSTOMER ROUTES
router.post("/request", authMiddleware, createBiddingRequest);
router.get("/my-requests", authMiddleware, getMyBiddingRequests);
router.get("/request/:requestId/bids", authMiddleware, getBidsForRequest);
router.post("/request/accept", authMiddleware, acceptBid);
router.post("/request/:requestId/accept/:bidId", authMiddleware, acceptBid); // Legacy alias
router.put("/request/:requestId/cancel", authMiddleware, cancelBiddingRequest);

// PROVIDER ROUTES
router.get("/open-requests", authMiddleware, requireRegistrationComplete, getOpenRequests);
router.post("/place-bid", authMiddleware, requireRegistrationComplete, placeBid);
router.get("/my-bids", authMiddleware, requireRegistrationComplete, getProviderBids);
router.get("/request/:requestId", authMiddleware, requireRegistrationComplete, getBiddingRequestById);

export default router;
