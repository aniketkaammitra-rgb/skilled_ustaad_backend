import mongoose from "mongoose";

const globalSettingsSchema = new mongoose.Schema({
  notifications: {
    sms: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    priority: { type: Boolean, default: true },
    cancellations: { type: Boolean, default: true },
    bookings: { type: Boolean, default: true },
    signups: { type: Boolean, default: true },
  },
  taxAndCommission: {
    gst: { type: String, default: "18%" },
    serviceTax: { type: String, default: "5%" },
    commission: { type: String, default: "10%" },
  },
  localization: {
    language: { type: String, default: "English (Global)" },
    timezone: { type: String, default: "Asia/Kolkata (GMT+5:30)" },
    currency: { type: String, default: "INR (₹)" }
  },
  security: {
    mfaEnabled: { type: Boolean, default: true },
    sessionTimeout: { type: String, default: "45 Minutes" },
    lastRotationAt: { type: Date, default: Date.now }
  },
  branding: {
    themeColor: { type: String, default: "#2563eb" },
    maintenanceMode: { type: Boolean, default: false },
  },
  support: {
    faqs: [
      {
        question: { type: String },
        answer: { type: String }
      }
    ],
    contactPhone: { type: String, default: "+91 6239695774" },
    contactEmail: { type: String, default: "support@skilledustaad.com" }
  }
}, {
  timestamps: true
});

// Singleton logic: always use the same document
const GlobalSettings = mongoose.models.GlobalSettings || mongoose.model("GlobalSettings", globalSettingsSchema);

export default GlobalSettings;
