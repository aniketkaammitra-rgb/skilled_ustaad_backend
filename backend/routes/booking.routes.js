import { Router } from "express";
import {
  bookService,
  getBookings,
  getBookingById,
  cancelBooking,
  requestRefund,
  acceptBooking,
  declineBooking,
  getAvailableBookings,
  completeBooking,
  startBooking,
  finishWork,
  retryBooking,
  finalSettlement,
  reportProviderNoShow,
} from "../controllers/booking.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRegistrationComplete } from "../middleware/requireRegistrationComplete.js";
import { getBookingDetailsPage } from "../controllers/getBookingDetail.controller.js";
import validate from "../middleware/validate.js";
import { bookingCreateSchema } from "../validations/schemas.js";

const router = Router();

/* =====================================================
   PROVIDER ROUTES (STATIC FIRST)
 ===================================================== */

router.get("/available", requireAuth, requireRegistrationComplete, getAvailableBookings);
router.post("/accept-booking", requireAuth, requireRegistrationComplete, acceptBooking);
router.post("/decline-booking", requireAuth, requireRegistrationComplete, declineBooking);
router.post("/start-booking", requireAuth, requireRegistrationComplete, startBooking);
router.post("/finish-work", requireAuth, requireRegistrationComplete, finishWork);
router.post("/complete-booking", requireAuth, requireRegistrationComplete, completeBooking);
router.post("/settle-payment", requireAuth, requireRegistrationComplete, finalSettlement);

/* =====================================================
   USER ROUTES
===================================================== */

router.get("/", requireAuth, getBookings);
router.post("/", requireAuth, validate(bookingCreateSchema), bookService);
router.put("/:id/cancel", requireAuth, cancelBooking);
router.post("/cancel/:id", requireAuth, cancelBooking);
router.post("/report-no-show", requireAuth, reportProviderNoShow);
router.post("/:id/retry", requireAuth, retryBooking);
router.post("/request-refund", requireAuth, requestRefund);

/*  ALWAYS LAST  BOOKING DETAIL */
router.get("/:id/details",requireAuth,getBookingDetailsPage);
router.get("/:id", requireAuth, getBookingById);

export default router;