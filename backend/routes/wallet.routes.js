import { Router } from "express";
import {
  getWalletSummary,
  initiateAddFunds,
  verifyAddFunds,
  addPaymentMethod,
  removePaymentMethod,
} from "../controllers/wallet.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

/* =====================================================
   CUSTOMER WALLET ROUTES (PROTECTED)
===================================================== */

router.get("/summary", requireAuth, getWalletSummary);
router.post("/add-funds", requireAuth, initiateAddFunds);
router.post("/verify-funds", requireAuth, verifyAddFunds);
router.post("/add-method", requireAuth, addPaymentMethod);
router.delete("/remove-method/:methodId", requireAuth, removePaymentMethod);

export default router;
