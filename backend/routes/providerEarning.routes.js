import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRegistrationComplete } from "../middleware/requireRegistrationComplete.js";

import {
  getEarningsDashboard,
  getTransactionHistory,
  getPaymentMethods,
  addPaymentMethod,
  deletePaymentMethod,
  withdrawFunds,
  getProviderTransactions
} from "../controllers/providerEarning.Controller.js";

const router = express.Router();

router.use(requireAuth);
router.use(requireRegistrationComplete);

router.get("/dashboard", getEarningsDashboard);

router.get("/transactions", getTransactionHistory);

router.get("/payment-methods", getPaymentMethods);

router.post("/payment-methods", addPaymentMethod);

router.delete("/payment-methods/:id", deletePaymentMethod);

router.post("/withdraw", withdrawFunds);

router.get("/transaction", getProviderTransactions);

export default router;