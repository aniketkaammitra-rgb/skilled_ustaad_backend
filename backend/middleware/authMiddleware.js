import jwt from "jsonwebtoken";

const authMiddleware = async (req, res, next) => {
  try {
    let token;

    // Read Bearer Token
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized, token missing" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // Attach user data to request
    req.user = decoded;

    next();
  } catch (error) {
    console.error("Auth Error:", error);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// ✔ Default export
export default authMiddleware;

// ✔ Named export (optional)
export const protect = authMiddleware;
