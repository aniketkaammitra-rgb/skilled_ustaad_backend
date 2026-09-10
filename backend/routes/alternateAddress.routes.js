import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getAlternateAddresses, addAlternateAddress, deleteAlternateAddress } from "../controllers/alternateAddress.controller.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", getAlternateAddresses);
router.post("/", addAlternateAddress);
router.delete("/:id", deleteAlternateAddress);

export default router;
