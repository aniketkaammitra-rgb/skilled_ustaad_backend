/**
 * Generates the HTML template for Password Reset OTP emails.
 * 
 * @param {string} name - Recipient's name
 * @param {string} otp - The 4-digit verification code
 * @param {'partner' | 'customer'} platformType - Type of platform
 * @returns {string} HTML content
 */
export const getForgotPasswordTemplate = (name, otp, platformType = "customer") => {
  const isPartner = platformType === "partner";
  const headerColor = isPartner ? "#2563eb" : "#4f46e5";
  const subtitle = isPartner ? "Partner Platform" : "Customer Platform";
  const greetingName = name || (isPartner ? "Partner" : "User");
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: ${headerColor}; margin: 0; font-size: 24px; font-weight: 800; tracking-tight: -0.025em; letter-spacing: -0.025em;">SKILLED USTAAD</h2>
        <p style="color: #64748b; font-size: 12px; font-weight: 600; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 0.1em;">${subtitle}</p>
      </div>
      <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
      <p style="font-size: 16px; color: #334155; line-height: 1.6; margin: 0 0 10px 0;">Hello ${greetingName},</p>
      <p style="font-size: 16px; color: #334155; line-height: 1.6; margin: 0 0 20px 0;">We received a request to reset the password for your Skilled Ustaad account. Use the verification code below to continue. Expires in 5 minutes.</p>
      <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 25px 0 0 0; text-align: center;">YOUR VERIFICATION CODE</p>
      <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; padding: 20px; text-align: center; border-radius: 12px; margin: 25px 0;">
        <span style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #0f172a; font-family: monospace;">${otp}</span>
      </div>
      <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 25px 0 0 0; text-align: center;">Enter this code on the password reset screen to set a new password. For your security, never share this code with anyone — Skilled Ustaad will never ask for it over phone or chat.</p>
      <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 25px 0 0 0; text-align: center;">If you didn't request this, you can safely ignore this email. Your account remains secure.</p>
      <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 25px 0 0 0; text-align: center;">Thanks, <br> Team Skilled Ustaad</p>
    </div>
  `;
};
