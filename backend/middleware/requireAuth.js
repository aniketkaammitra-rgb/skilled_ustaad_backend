// backend/middleware/requireAuth.js
import { verifyAccess } from "../libs/token.js";

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1].trim();
    const decoded = verifyAccess(token);

    if (!decoded) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    res.status(401).json({ error: "Unauthorized" });
  }
}

export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1].trim();
      const decoded = verifyAccess(token);
      if (decoded) {
        req.user = decoded;
      }
    }
  } catch (err) {
    // Ignore error in optional auth
  }
  next();
}

export async function requireSuperAdmin(req, res, next) {
  try {
    await requireAuth(req, res, () => {
      if (req.user.role !== "superadmin") {
        return res.status(403).json({ error: "Access denied. Super Admin privileges required." });
      }
      next();
    });
  } catch (err) {
    res.status(401).json({ error: "Unauthorized" });
  }
}

export function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      await requireAuth(req, res, () => {
        // Superadmin bypasses permission checks
        if (req.user.role === "superadmin") {
          return next();
        }
        
        const userPermissions = req.user.permissions || [];
        if (!userPermissions.includes(permission)) {
          return res.status(403).json({ error: `Access denied. Requires '${permission}' permission.` });
        }
        next();
      });
    } catch (err) {
      res.status(401).json({ error: "Unauthorized" });
    }
  };
}