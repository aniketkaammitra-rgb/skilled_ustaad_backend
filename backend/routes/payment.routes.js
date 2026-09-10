import { Router } from "express";
import { createFullPayment, verifyPayment, payFullWithWallet } from "../controllers/payment.controller.js";
import { createTokenOrder,verifyTokenPayment, payTokenWithWallet } from "../controllers/tokenPayment.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

//Token order payment 
router.post("/token",requireAuth,createTokenOrder);
router.post("/token/verify",requireAuth,verifyTokenPayment);
router.post("/token-wallet", requireAuth, payTokenWithWallet);

//After Token Payment rest payment
router.post("/full", requireAuth, createFullPayment);
router.post("/full-wallet", requireAuth, payFullWithWallet);
router.post("/verify", requireAuth, verifyPayment);

export default router;
