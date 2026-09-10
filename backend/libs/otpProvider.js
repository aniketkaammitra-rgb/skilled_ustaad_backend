

// import logger from "./logger.js";
// // import Twilio from "twilio";

// let twilioClient = null;

// if (process.env.OTP_PROVIDER === "twilio") {
//   twilioClient = new Twilio(
//     process.env.TWILIO_ACCOUNT_SID,
//     process.env.TWILIO_AUTH_TOKEN
//   );
// }

// export const generateOTP = () =>
//   Math.floor(1000 + Math.random() * 9000).toString();

// export const sendOTP = async (phoneNumber, otp) => {
//   if (process.env.OTP_PROVIDER === "console") {
//     console.log(`OTP for ${phoneNumber}: ${otp}`);
//     return true;
//   }

//   if (process.env.OTP_PROVIDER === "twilio") {
//     if (!twilioClient) throw new Error("Twilio not initialized");

//     try {
//       await twilioClient.messages.create({
//         body: `Your verification code is ${otp}`,
//         from: process.env.TWILIO_FROM_NUMBER,
//         to: phoneNumber,
//       });
//       logger.info({ phone: phoneNumber }, "OTP sent via Twilio");
//       return true;
//     } catch (err) {
//       logger.error(err, "Error sending OTP via Twilio");
//       throw new Error("Failed to send OTP");
//     }
//   }

//   throw new Error("Unsupported OTP provider");
// };



import { isWhitelisted, DEFAULT_OTP } from "./otpWhitelist.js";

export const generateOTP = (phoneNumber) => {
  if (isWhitelisted(phoneNumber)) {
    return DEFAULT_OTP;
  }
  return Math.floor(1000 + Math.random() * 9000).toString();
};

export const sendOTP = async (phoneNumber, otp) => {
  // console.log(`OTP for ${phoneNumber}: ${otp}`);
  return true;
};