import express from "express";
import {
  getProviderBookingPaymentDetail,
  markWorkCompleted,
  confirmPaymentReceived
} from "../controllers/ProviderBookingPaymentDetail.controller.js";

const router = express.Router();

router.get("/booking-payment/:bookingId", getProviderBookingPaymentDetail);

router.patch("/work-complete/:bookingId", markWorkCompleted);

router.patch("/confirm-payment/:bookingId", confirmPaymentReceived);

export default router;