import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "SkilledUstaadSecureBankKey_2024!"; // Must be 32 characters
const IV_LENGTH = 16;

export function encryptBankDetail(text) {
  if (!text || text === "") return text;
  // If already encrypted, return as is. Encryption format check: "iv:encryptedText"
  if (text.includes(":") && text.split(":")[0].length === 32) return text;

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
  } catch (err) {
    console.error("Encryption error:", err);
    return text; // Fallback to plain text on error
  }
}

export function decryptBankDetail(text) {
  if (!text || text === "") return text;
  // If not encrypted, return as is
  if (!text.includes(":") || text.split(":")[0].length !== 32) return text;

  try {
    const textParts = text.split(":");
    const iv = Buffer.from(textParts.shift(), "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error("Decryption error:", err);
    return text; // Fallback to raw text on error
  }
}
