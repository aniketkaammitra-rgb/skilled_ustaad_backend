import jwt from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import Admin from "../models/Admin.js";

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || "your-secret-key";

// Admin Authentication Middleware
export async function requireAdminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "Access token is required"
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (!decoded.adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "Invalid token"
      });
    }

    // Check if admin exists and is active
    const admin = await Admin.findById(decoded.adminId);
    if (!admin || !admin.isActive) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "Admin not found or inactive"
      });
    }

    // Add admin info to request object
    req.admin = {
      adminId: admin._id,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions
    };

    next();

  } catch (err) {
    console.error("Admin auth middleware error:", err);
    
    if (err.name === "JsonWebTokenError") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "Invalid token"
      });
    }
    
    if (err.name === "TokenExpiredError") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "Token expired"
      });
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Server error during authentication"
    });
  }
}

// Super Admin Only Middleware
export function requireSuperAdmin(req, res, next) {
  if (req.admin.role !== "super_admin") {
    return res.status(StatusCodes.FORBIDDEN).json({
      error: "Super admin access required"
    });
  }
  next();
}

// Permission-based Middleware
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.admin.permissions[permission]) {
      return res.status(StatusCodes.FORBIDDEN).json({
        error: `Permission '${permission}' is required`
      });
    }
    next();
  };
}
