import dotenv from "dotenv";
import dns from "dns";
dns.setDefaultResultOrder("verbatim");

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Resolve current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env file from backend directory
const envPath = path.join(__dirname, "../.env");
let result = { parsed: {} };
try {
  result = dotenv.config({ path: envPath });
} catch (err) {
  console.warn("dotenv.config threw, will attempt parse fallback:", err && err.message);
}

// If dotenv didn't populate parsed, use dotenv.parse which is more reliable for raw content
if (!result || !result.parsed || Object.keys(result.parsed).length === 0) {
  try {
    let raw = fs.readFileSync(envPath, "utf8");
    // strip UTF-8 BOM if present
    raw = raw.replace(/^\uFEFF/, "");
    const parsed = dotenv.parse(raw);
    const result_parsed = {};
    // ONLY set process.env if it's not already defined (Let system/Render variables win)
    Object.entries(parsed).forEach(([k, v]) => {
      if (!process.env[k]) {
        process.env[k] = v;
      }
      result_parsed[k] = v;
    });
    result.parsed = result_parsed;
    // console.log("Loaded .env via fallback from:", envPath);
  } catch (err) {
    console.warn("Could not read/parse .env fallback:", err && err.message);
  }
} else {
  // ONLY set process.env if it's not already defined
  Object.entries(result.parsed).forEach(([k, v]) => {
    if (!process.env[k]) {
      process.env[k] = v;
    }
  });
  // console.log("Loaded .env via config from:", envPath);
}

// Remove raw .env debug for security
// console.log("Loaded configuration keys: (hidden for security)");

// console.log("process.env.MONGODB_URI:", process.env.MONGODB_URI);
// console.log("process.env.CORS_ORIGINS:", process.env.CORS_ORIGINS);

const toBool = (v) => String(v).toLowerCase() === "true";

export default {
  env: process.env.NODE_ENV || "development",
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI,
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map(o => o.trim().replace(/\/$/, ""))
    : ["http://localhost:5173"],

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || "7d",
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || "7d",
  },

  cookies: {
    secure: toBool(process.env.COOKIE_SECURE),
    sameSite: "lax",
  },

  otp: {
    provider: process.env.OTP_PROVIDER || "console",
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      from: process.env.TWILIO_FROM_NUMBER,
    },
  },

  email: {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT || 587,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM || `"Skilled Ustaad Support" <support@skilledustaad.com>`,
  },
};
