import { StatusCodes } from "http-status-codes";
import Admin from "../models/Admin.js";
import { signAccess, signRefresh, verifyRefresh } from "../libs/token.js";

/* ------------------------------------------------------------------
   ADMIN LOGIN
   Endpoint: POST /api/auth/login
-------------------------------------------------------------------*/
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Email and password are required"
      });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Invalid credentials"
      });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Invalid credentials"
      });
    }

    // Generate Access & Refresh JWTs
    const accessToken = signAccess({ 
      sub: admin._id, 
      role: admin.role,
      permissions: admin.permissions || []
    });
    const refreshToken = signRefresh({ 
      sub: admin._id, 
      role: admin.role 
    });
 
    // Save refresh to DB atomically (avoids select:false issues)
    await Admin.findByIdAndUpdate(admin._id, {
      $push: { refreshToken: { $each: [refreshToken], $slice: -10 } }
    });
 
    res.cookie("admin_refreshToken", refreshToken, {
       httpOnly: true,
       secure: process.env.NODE_ENV === "production",
       sameSite: "lax",
       maxAge: 7 * 24 * 60 * 60 * 1000,
    });
 
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Login successful",
      token: accessToken,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions || []
      }
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal Server Error"
    });
  }
};

/* ------------------------------------------------------------------
   ADMIN SIGNUP
   Endpoint: POST /api/auth/signup
-------------------------------------------------------------------*/
export const signupAdmin = async (req, res) => {
  return res.status(StatusCodes.FORBIDDEN).json({
    message: "Public signup is disabled for security reasons."
  });
};

 export const refreshTokenAdmin = async (req, res) => {
   try {
     const token = req.cookies.admin_refreshToken;
     if (!token) {
       return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Refresh token missing" });
     }
 
     const payload = verifyRefresh(token);
     if (!payload || !payload.sub || (payload.role !== "admin" && payload.role !== "superadmin" && payload.role !== "subadmin")) {
       return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Invalid refresh token" });
     }
 
     const admin = await Admin.findById(payload.sub).select("+refreshToken");
     const hasToken = admin && (Array.isArray(admin.refreshToken) ? admin.refreshToken.includes(token) : admin.refreshToken === token);
     if (!admin || !hasToken) {
       return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Token revoked or invalid" });
     }
 
     const accessToken = signAccess({ 
       sub: admin._id, 
       role: admin.role,
       permissions: admin.permissions || [] 
     });
 
     return res.status(StatusCodes.OK).json({ accessToken });
   } catch (err) {
     console.error("Admin Refresh error:", err);
     return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
   }
 };
