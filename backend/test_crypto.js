import crypto from "crypto";

const hash = (s) =>
  crypto.createHash("sha256").update(s).digest("hex");

try {
    const OTP_TTL_MS = 5 * 60 * 1000;
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    console.log("OTP:", otp);
    const otpHash = hash(otp);
    console.log("OTP Hash:", otpHash);
    const otpExpires = new Date(Date.now() + OTP_TTL_MS);
    console.log("Expires:", otpExpires);
    console.log("All good!");
} catch (e) {
    console.error(e);
}
