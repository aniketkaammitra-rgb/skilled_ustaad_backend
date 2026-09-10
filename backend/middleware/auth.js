import { verifyAccess, verifyRefresh, signAccess } from "../libs/token.js";
import User from "../models/User.js";
import { StatusCodes } from "http-status-codes";


/* =====================================================
   PROTECT ROUTE (Access Token)
===================================================== */
export default async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const token = authHeader.split(" ")[1].trim();

    const decoded = verifyAccess(token);

    if (!decoded) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "Invalid or expired access token",
      });
    }

    const user = await User.findById(decoded.sub)
      .select("-otpHash -otpExpires");

    if (!user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "User not found",
      });
    }

    req.user = user;
    next();

  } catch (err) {
    console.error("Protect Middleware Error:", err);
    return res.status(StatusCodes.UNAUTHORIZED).json({
      error: "Unauthorized",
    });
  }
}


/* =====================================================
   REFRESH TOKEN
===================================================== */
export async function refreshToken(req, res) {
  try {
    const { refreshToken } = req.cookies || {};

    if (!refreshToken) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "Missing refresh token",
      });
    }

    const decoded = verifyRefresh(refreshToken);

    if (!decoded) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "Invalid or expired refresh token",
      });
    }

    const user = await User.findById(decoded.sub);

    if (!user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "User not found",
      });
    }

    const newAccessToken = signAccess({
      sub: user._id.toString(),
    });

    return res.status(StatusCodes.OK).json({
      accessToken: newAccessToken,
    });

  } catch (err) {
    console.error("Refresh Token Error:", err);
    return res.status(StatusCodes.UNAUTHORIZED).json({
      error: "Invalid refresh token",
    });
  }
}