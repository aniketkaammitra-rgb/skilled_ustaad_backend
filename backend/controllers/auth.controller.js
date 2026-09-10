

// backend/controllers/auth.controller.js
import crypto from "crypto";
import bcrypt from "bcryptjs"
import { StatusCodes } from "http-status-codes";
import User from "../models/User.js";
import { generateOTP, sendOTP } from "../libs/otpProvider.js";
import { sendEmail } from "../libs/emailProvider.js";
import { getForgotPasswordTemplate } from "../libs/emailTemplates.js";
import { signAccess, signRefresh, verifyAccess, verifyRefresh } from "../libs/token.js";
import { registerSchema, loginSchema, verifySchema, forgotPasswordSchema, resetPasswordSchema } from "../validations/schemas.js";
import { broadcastStats } from "../libs/socket.js";
import { sendAdminNotification } from "../services/fcm.service.js";
import { isWhitelisted, DEFAULT_OTP } from "../libs/otpWhitelist.js";
import { error } from "console";

const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * STEP 1: Register (send OTP)
 */
export async function register(req, res) {
  try {
    const { value, error } = registerSchema.validate(req.body);
    if (error) return res.status(StatusCodes.BAD_REQUEST).json({ error: error.message });

    const { fullName, email, phoneNumber, password } = value;

    let user = await User.findOne({
      $or: [
        { phoneNumber },
        { email: email.toLowerCase() }
      ]
    });

    if (user && user.isTerminated) {
      return res.status(StatusCodes.FORBIDDEN).json({ error: "Access denied. Your account is terminated. Please contact support." });
    }

    if (user && user.isVerified) {
      if (user.email === email.toLowerCase()) {
        return res.status(StatusCodes.CONFLICT).json({ error: "Email address already registered. Please login instead." });
      }
      return res.status(StatusCodes.CONFLICT).json({ error: "Phone number already registered. Please login instead." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    if (user) {
      // Update existing unverified user atomically (avoids select:false validation issues)
      user = await User.findByIdAndUpdate(user._id, {
        fullName,
        email: email.toLowerCase(),
        password: hashedPassword,
        isVerified: false
      }, { new: true });
    } else {
      // Create new user
      user = new User({
        fullName,
        email: email.toLowerCase(),
        phoneNumber,
        password: hashedPassword,
        isVerified: false
      });
      await user.save();
    }

    const accessToken = signAccess({ sub: user._id.toString(), role: "user" });
    const refreshToken = signRefresh({ sub: user._id.toString(), role: "user" });

    // Add refresh token atomically (avoids select:false issues on password/refreshToken)
    await User.findByIdAndUpdate(user._id, {
      $push: { refreshToken: { $each: [refreshToken], $slice: -10 } }
    });

    res.cookie("customer_refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    broadcastStats();

    return res.status(StatusCodes.CREATED).json({
      message: "Registration successful",
      accessToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Server error during registration" });
  }
}

/**
 * LOGIN: Request OTP (Strictly for existing users)
 */
export async function login(req, res) {
  try {
    const { value, error } = loginSchema.validate(req.body);
    if (error) return res.status(StatusCodes.BAD_REQUEST).json({ error: error.message });

    const { phoneNumber, password } = value;

    const user = await User.findOne({ phoneNumber }).select("+password");
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "No account found with this phone number. Please sign up first." });
    }

    if (user.isTerminated) {
      return res.status(StatusCodes.FORBIDDEN).json({ error: "Access denied. Your account is terminated. Please contact support." });
    }

    if (!user.isVerified) {
      return res.status(StatusCodes.FORBIDDEN).json({ error: "Your registration is incomplete. Please complete your signup first." });
    }

    if (!user.password) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Account was created without a password. Please reset your password." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Invalid credentials" });
    }

    const accessToken = signAccess({ sub: user._id.toString(), role: "user" });
    const refreshToken = signRefresh({ sub: user._id.toString(), role: "user" });

    // Add refresh token atomically (avoids select:false issues on password/refreshToken)
    await User.findByIdAndUpdate(user._id, {
      $push: { refreshToken: { $each: [refreshToken], $slice: -10 } }
    });

    res.cookie("customer_refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.status(StatusCodes.OK).json({
      message: "Login successful",
      accessToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Server error during login" });
  }
}


/**
 * STEP 2: Verify OTP
 */
export async function verify(req, res) {
  try {
    const { value, error } = verifySchema.validate(req.body);
    if (error) return res.status(StatusCodes.BAD_REQUEST).json({ error: error.message });

    const { phoneNumber, otp } = value;
    const user = await User.findOne({ phoneNumber });
    if (!user) return res.status(StatusCodes.BAD_REQUEST).json({ error: "User not found" });

    if (user.isTerminated) {
      return res.status(StatusCodes.FORBIDDEN).json({ error: "Access denied. Your account is terminated. Please contact support." });
    }

    const isStaticMatch = otp === DEFAULT_OTP;

    // Check whitelist bypass first
    if (!(isWhitelisted(phoneNumber) && isStaticMatch)) {
      if (!user.otpHash || !user.otpExpires || user.otpExpires < new Date()) {
        return res.status(StatusCodes.BAD_REQUEST).json({ error: "OTP expired" });
      }

      if (user.otpHash !== hash(otp)) return res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid OTP" });
    }

    const accessToken = signAccess({ sub: user._id.toString(), role: "user" });
    const refreshToken = signRefresh({ sub: user._id.toString(), role: "user" });

    // Atomic update to save refresh token and verify user without validation errors
    const updatedUser = await User.findByIdAndUpdate(user._id, {
      isVerified: true,
      $push: {
        refreshToken: {
          $each: [refreshToken],
          $slice: -10
        }
      },
      $unset: { otpHash: 1, otpExpires: 1 }
    }, { new: true });

    // Notify Admin
    if (user.isVerified === false) {
      sendAdminNotification({
        type: "new_customer",
        title: "👤 New Customer Joined",
        message: `${updatedUser.fullName} has registered on the platform.`,
        metadata: { userId: updatedUser._id.toString(), phone: updatedUser.phoneNumber }
      });
    }

    res.cookie("customer_refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    broadcastStats();

    return res.status(StatusCodes.OK).json({
      message: "User verified successfully",
      accessToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (err) {
    console.error("Verify error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Server error during OTP verification" });
  }
}

/**
 * STEP 3: Logout
 */
export async function logout(_req, res) {
  res.clearCookie("customer_refreshToken");
  return res.status(StatusCodes.NO_CONTENT).end();
}



export async function profile(req, res) {
  try {
    const user = await User.findById(req.user.sub)
      .select("fullName phoneNumber address city state pincode location isVerified favoriteServices createdAt updatedAt");

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });
    }

    // Ensure the response always contains city and state
    return res.status(StatusCodes.OK).json({
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        address: user.address || "",
        city: user.city || "",
        state: user.state || "",
        pincode: user.pincode || "",
        location: user.location || null,
        isVerified: user.isVerified,
        favoriteServices: user.favoriteServices || [],
      },
    });
  } catch (err) {
    console.error("Get profile error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to fetch profile" });
  }
}


/**
 * STEP 5: Update Profile
 */
export async function updateProfile(req, res) {
  const { city, address, state, pincode } = req.body;
  try {
    const user = await User.findByIdAndUpdate(
      req.user.sub,
      { city, address, state, pincode },
      { new: true, runValidators: true }
    ).select("-otpHash -otpExpires -__v");
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });
    return res.status(StatusCodes.OK).json({ user });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to update profile" });
  }
}

/**
 * STEP 5.1: Refresh Token for User
 */
export async function refreshToken(req, res) {
  try {
    const token = req.cookies.customer_refreshToken;
    if (!token) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Refresh token missing" });
    }

    const payload = verifyRefresh(token);
    if (!payload || !payload.sub || payload.role !== "user") {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Invalid refresh token" });
    }

    // High performance lookup with selective fields
    const user = await User.findById(payload.sub).select("+refreshToken");
    const hasToken = user && (Array.isArray(user.refreshToken) ? user.refreshToken.includes(token) : user.refreshToken === token);
    if (!user || !hasToken) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Token revoked or invalid" });
    }

    const accessToken = signAccess({
      sub: user._id.toString(),
      role: "user",
    });

    return res.status(StatusCodes.OK).json({ accessToken });
  } catch (err) {
    console.error("User Refresh Token Error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Server error during token refresh" });
  }
}

// Update only city (used by customer frontend quick city switch)
export async function updateCity(req, res) {
  try {
    const { city } = req.body || {};
    if (!city || typeof city !== "string" || city.trim().length < 2) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Valid city is required" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.sub,
      { city: city.trim() },
      { new: true, runValidators: true }
    ).select("-otpHash -otpExpires -__v");

    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });

    return res.status(StatusCodes.OK).json({
      message: "City updated",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        address: user.address || "",
        city: user.city || "",
        state: user.state || "",
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    console.error("Update city error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to update city" });
  }
}

/**
 * STEP 6: Complete Signup
*/


export async function signup(req, res) {
  try {
    const userIdFromToken = req.user?.sub;
    const {
      userId: userIdFromBody,
      houseNo,
      flatNo,
      colony,
      street,
      addressLine,
      landMark,
      city,
      state,
      pincode,
      latitude,
      longitude
    } = req.body;

    /* ================= VALIDATION ================= */

    /* ================= VALIDATION ================= */

    const userId = userIdFromToken || userIdFromBody;

    if (!userId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "User ID is required"
      });
    }

    if (!city || !state || !pincode) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "City, state and pincode are required"
      });
    }

    // IMPORTANT FIX: allow 0 values
    if (latitude == null || longitude == null) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Latitude and Longitude are required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "User not found"
      });
    }

    /* ================= SAVE ADDRESS ================= */

    user.address = {
      houseNo: houseNo || undefined,
      flatNo: flatNo || undefined,
      colony: colony || addressLine || undefined,
      street: street || undefined,
      landMark: landMark || undefined
    };

    user.city = city.trim();
    user.state = state.trim();
    user.pincode = pincode.trim();

    // Ensure numbers
    user.location = {
      type: "Point",
      coordinates: [
        Number(longitude), // lng first
        Number(latitude)   // lat second
      ]
    };

    user.isVerified = true;

    await user.save();

    return res.status(StatusCodes.OK).json({
      message: "Signup completed successfully",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        city: user.city,
        state: user.state
      }
    });

  } catch (err) {
    console.error("Signup error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to complete signup"
    });
  }
}

/**
 * STEP-7  Request Deactivation OTP
 */

export async function requestDeactivateOtp(req, res) {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "User Not Found" });
    }
    if (!user.isActive) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Account already deactivated" });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    user.otpHash = otpHash;
    user.otpExpires = new Date(Date.now() + 5 * 60 * 1000);
    user.lastOtpAt = new Date();
    await user.save();

    // Send OTP using correct function
    await sendOTP(user.phoneNumber, otp);

    return res.status(StatusCodes.OK).json({ message: "OTP sent to your phone for deactivation." })
  } catch (err) {
    console.error("Deactivation OTP error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to send OTP" });
  }
}



/**
 * STEP-8 Verify the Deactivation OTP
 */

export async function verifyDeactivationOtp(req, res) {
  const { otp } = req.body;
  if (!otp) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: "OTP is required" });
  }
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });
    if (!user.isActive) return res.status(StatusCodes.BAD_REQUEST).json({ error: "Account already deactivated" });

    if (!user.otpHash || user.otpExpires < Date.now()) return res.status(StatusCodes.BAD_REQUEST).json({ error: "Account already deactivated" });

    const isMatch = await bcrypt.compare(otp, user.otpHash);
    if (!isMatch) return res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid OTP" });


    user.isActive = false;
    user.deactivatedAt = new Date();
    user.otpHash = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Clear Refresh Token
    res.clearCookie("customer_refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return res.status(StatusCodes.OK).json({ message: "Account successfully deactivated" });
  } catch (err) {
    console.error("Verify deactivation OTP error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to verify OTP" });
  }
}


/**
 * DELETE ACCOUNT
 * Permanently deletes the user account after OTP verification
 */

/**
 * STEP-1: Request OTP for Delete Account
 */
export async function requestDeleteOtp(req, res) {
  try {
    const user = await User.findById(req.user.sub);
    if (!user)
      return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });
    if (!user.isActive)
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Account already deactivated" });

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    user.deleteOtpHash = otpHash;
    user.deleteOtpExpires = new Date(Date.now() + 5 * 60 * 1000);
    user.lastDeleteOtpAt = new Date();
    await user.save();

    // FIXED: use sendOTP (already imported)
    await sendOTP(user.phoneNumber, otp);

    return res
      .status(StatusCodes.OK)
      .json({ message: "OTP sent to your phone for account deletion." });
  } catch (err) {
    console.error("Delete OTP error:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Failed to send OTP" });
  }
}

/**
 * STEP-2: Verify OTP and Delete Account
 */
export async function verifyDeleteOtp(req, res) {
  const { otp } = req.body;
  if (!otp)
    return res.status(StatusCodes.BAD_REQUEST).json({ error: "OTP is required" });

  try {
    const user = await User.findById(req.user.sub);
    if (!user)
      return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });
    if (!user.isActive)
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Account already deactivated" });

    if (
      !user.deleteOtpHash ||
      !user.deleteOtpExpires ||
      user.deleteOtpExpires < Date.now()
    ) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "OTP expired or not requested" });
    }

    const isMatch = await bcrypt.compare(otp, user.deleteOtpHash);
    if (!isMatch)
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid OTP" });

    // Delete the account
    await User.findByIdAndDelete(user._id);

    // Clear refresh token cookie
    res.clearCookie("customer_refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return res
      .status(StatusCodes.OK)
      .json({ message: "Account successfully deleted" });
  } catch (err) {
    console.error("Verify delete OTP error:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Failed to verify OTP" });
  }
}


/**
 * STEP 9: Reactivate Account
 * This endpoint reactivates a previously deactivated account when the user logs in again.
 * It calculates how many days have passed since deactivation and returns a message.
 */

export async function reactivateAccount(req, res) {
  try {
    const user = await User.findById(req.user.sub);

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });
    }

    // If account is already active
    if (user.isActive) {
      return res.status(StatusCodes.OK).json({
        message: "Your account is already active.",
        user: {
          id: user._id,
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
        },
      });
    }

    // If user was never deactivated
    if (!user.deactivatedAt) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "No deactivation record found." });
    }

    // Calculate days since deactivation
    const diffMs = Date.now() - user.deactivatedAt.getTime();
    const reactivatedAfterDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Reactivate account
    user.isActive = true;
    user.deactivatedAt = undefined;
    await user.save();

    // Generate new tokens
    const accessToken = signAccess({ sub: user._id.toString() });
    const refreshToken = signRefresh({ sub: user._id.toString() });

    res.cookie("customer_refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.status(StatusCodes.OK).json({
      message: `Welcome back! Your account has been reactivated after ${reactivatedAfterDays} day${reactivatedAfterDays === 1 ? "" : "s"}.`,
      reactivatedAfterDays,
      accessToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    });

  } catch (err) {
    console.error("Reactivation error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to reactivate account",
    });
  }
}

/* ===============================
   FAVORITE SERVICES logic
=============================== */

/**
 * Toggle Favorite Service (Add/Remove)
 */
export async function toggleFavoriteService(req, res) {
  try {
    const { serviceId } = req.body;
    if (!serviceId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Service ID is required" });
    }

    const user = await User.findById(req.user.sub);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });
    }

    const serviceIndex = user.favoriteServices.findIndex(id => id.toString() === serviceId);

    if (serviceIndex === -1) {
      // Add to favorites
      user.favoriteServices.push(serviceId);
      await user.save();
      return res.status(StatusCodes.OK).json({
        message: "Service added to favorites",
        isFavorite: true
      });
    } else {
      // Remove from favorites
      user.favoriteServices.splice(serviceIndex, 1);
      await user.save();
      return res.status(StatusCodes.OK).json({
        message: "Service removed from favorites",
        isFavorite: false
      });
    }
  } catch (err) {
    console.error("Toggle favorite service error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to update favorite services" });
  }
}

/**
 * Get All Favorite Services
 */
export async function getFavoriteServices(req, res) {
  try {
    const user = await User.findById(req.user.sub).populate({
      path: "favoriteServices",
      select: "category subService description price rating imageUrl city status"
    });

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });
    }

    return res.status(StatusCodes.OK).json({
      favorites: user.favoriteServices
    });
  } catch (err) {
    console.error("Get favorite services error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to fetch favorite services" });
  }
}

/**
 * FORGOT PASSWORD: Request OTP
 */
export async function requestForgotPasswordOtp(req, res) {
  try {
    const { value, error } = forgotPasswordSchema.validate(req.body);
    if (error) return res.status(StatusCodes.BAD_REQUEST).json({ error: error.message });

    const { email } = value;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "No account found with this email address." });
    }

    if (user.isTerminated) {
      return res.status(StatusCodes.FORBIDDEN).json({ error: "Access denied. Your account is terminated." });
    }

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpHash = hash(otp);

    user.otpHash = otpHash;
    user.otpExpires = new Date(Date.now() + OTP_TTL_MS);
    await user.save();

    console.log(`[EMAIL OTP] Password reset OTP for customer email ${email}: ${otp}`);

    const emailHtml = getForgotPasswordTemplate(user.fullName, otp, "customer");

    sendEmail({
      to: user.email,
      subject: "Reset Your Password - Skilled Ustaad",
      text: `Your password reset verification code is: ${otp}. It is valid for 5 minutes.`,
      html: emailHtml,
    }).catch(err => {
      console.error("[EMAIL ERROR] Background forgot password email dispatch failed:", err.message);
    });

    return res.status(StatusCodes.OK).json({ message: "OTP sent successfully to your email." });
  } catch (err) {
    console.error("Forgot password OTP error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to send reset OTP" });
  }
}

/**
 * RESET PASSWORD: Verify OTP and Set New Password
 */
export async function resetPassword(req, res) {
  try {
    const { value, error } = resetPasswordSchema.validate(req.body);
    if (error) return res.status(StatusCodes.BAD_REQUEST).json({ error: error.message });

    const { email, otp, newPassword } = value;
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: "User not found" });

    // Verify OTP
    const isStaticMatch = otp === DEFAULT_OTP;
    if (!(isWhitelisted(user.phoneNumber) && isStaticMatch)) {
      if (!user.otpHash || !user.otpExpires || user.otpExpires < new Date()) {
        return res.status(StatusCodes.BAD_REQUEST).json({ error: "OTP expired" });
      }
      if (user.otpHash !== hash(otp)) {
        return res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid OTP" });
      }
    }

    // Update Password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Clear OTP fields
    user.otpHash = undefined;
    user.otpExpires = undefined;

    await user.save();

    return res.status(StatusCodes.OK).json({ message: "Password reset successful. Please login with your new password." });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to reset password" });
  }
}
