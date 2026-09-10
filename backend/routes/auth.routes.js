import { Router } from "express";
import { register, login, verify, logout, profile, updateProfile, signup, updateCity, refreshToken, toggleFavoriteService, getFavoriteServices, requestForgotPasswordOtp, resetPassword } from "../controllers/auth.controller.js";
import { authLimiter } from "../middleware/rateLimits.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requestDeactivateOtp, verifyDeactivationOtp, requestDeleteOtp, verifyDeleteOtp, reactivateAccount } from "../controllers/auth.controller.js";
import validate from "../middleware/validate.js";
import { registerSchema, loginSchema, verifySchema } from "../validations/schemas.js";

const router = Router();



router.post("/register", authLimiter, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), login);
router.post("/verify-otp", authLimiter, validate(verifySchema), verify);
router.post("/forgot-password", authLimiter, requestForgotPasswordOtp);
router.post("/reset-password", authLimiter, resetPassword);
router.post("/refresh-token", refreshToken);
router.post("/logout", logout);
router.post("/signup", requireAuth, authLimiter, signup);

//  profile routes
router.get("/profile", requireAuth, profile);
router.put("/profile", requireAuth, updateProfile);
router.post("/update-city", requireAuth, updateCity);

// Favorite Service routes
router.post("/favorites/toggle", requireAuth, toggleFavoriteService);
router.get("/favorites", requireAuth, getFavoriteServices);

// Deactivate the account
router.post("/deactivate/request-otp", requireAuth, authLimiter, requestDeactivateOtp);
router.post("/deactivate/verify-otp", requireAuth, authLimiter, verifyDeactivationOtp);

//Delete the account
router.post("/delete/request-otp", requireAuth, authLimiter, requestDeleteOtp);
router.post("/delete/verify-otp", requireAuth, authLimiter, verifyDeleteOtp);

//Reactivate account
router.post("/reactivate", requireAuth, authLimiter, reactivateAccount);
export default router;


