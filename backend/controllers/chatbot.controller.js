import GlobalSettings from "../models/GlobalSettings.js";
import { StatusCodes } from "http-status-codes";

/**
 * Advanced rule-based chatbot for providers
 */
const PROVIDER_KNOWLEDGE_BASE = [
    {
        keywords: ["delete account", "deactivate account", "delete my account", "deactivate my account", "remove account", "close account", "delete provider account", "deactivate provider account"],
        answer: "For security and compliance reasons, provider accounts cannot be deactivated or deleted directly from the app. Please contact support@skilledustaad.com or call +91 6239695774 to request account deactivation or deletion. Our support team will process your request within 24-48 business hours after verifying your identity."
    },
    {
        keywords: ["change name", "update name", "change email", "update email", "change phone", "update phone", "change mobile", "update mobile", "edit profile", "profile update"],
        answer: "You can edit your full name and spoken languages by going to 'My Profile' and clicking the 'Edit Basic Info' button. For security reasons, changes to critical details like your registered phone number, email address, bank account details, or government ID documents must be verified and processed by contacting support@skilledustaad.com."
    },
    {
        keywords: ["otp", "scanner", "scan", "qr", "code", "verify", "verifying", "verified", "start", "end"],
        answer: "To verify a customer assignment, use the QR Scanner in the top navbar. Scan the customer's QR code or enter the 4-digit OTP from their dashboard. This securely completes the booking and processes the payment."
    },
    {
        keywords: ["payment", "earning", "earnings", "withdraw", "money", "wallet", "payout", "paid", "dues", "commission", "settlement", "incentive", "referral", "tds", "balance reduced"],
        answer: "Your earnings are displayed in the 'Earnings' section. Payouts are automated and occur every 24-48 hours. The platform deducts a standard commission and applicable TDS. Check your 'Earnings' tab for a detailed history of your payouts and incentives."
    },
    {
        keywords: ["analysis", "pending status", "verify profile", "document", "identity", "background", "approval", "verification", "kyc", "pan", "aadhaar", "rejected", "edit document"],
        answer: "To register, upload valid KYC documents (PAN, Aadhaar). Verification takes 1-2 business days. If your profile is 'Pending Analysis', we are reviewing your documents. If rejected, you can re-upload them from the Profile section."
    },
    {
        keywords: ["location", "place", "city", "service area", "territory", "outside area", "change location", "update location", "change city", "update city"],
        answer: "You can update your active service territories directly from your profile settings. Adding more cities will increase your job visibility. Ensure your GPS is active for accurate job leads."
    },
    {
        keywords: ["bank", "ifsc", "upi", "payout account", "change bank", "bank account", "bank details"],
        answer: "To change your bank account or UPI ID, go to 'My Profile' and click on the 'Payment Methods' edit icon. For security, bank changes may require a one-time OTP verification."
    },
    {
        keywords: ["accept", "decline", "reject", "job request", "not getting jobs", "booking", "lead", "receive", "reschedule", "cancel", "customer unreachable", "disappear", "history", "pause", "completed", "proof"],
        answer: "Bookings are assigned based on your service area. When you receive a push notification, open it to 'Accept' or 'Decline'. You can manage, reschedule, or mark a booking as completed from the 'My Jobs' section. If a customer is unreachable, wait 15 minutes before canceling. You can upload work proofs when marking a job as completed."
    },
    {
        keywords: ["contact", "admin", "support", "help", "email", "talk", "human", "problem", "abusive", "threatened", "emergency", "complaint", "block customer", "personal details"],
        answer: "Your safety is our priority. You can reach support at support@skilledustaad.com or use the 'Support' section for emergencies or to report abusive customers. We reply within 4 hours. Customers only see your professional details."
    },
    {
        keywords: ["login", "password", "forgot", "otp not received", "profile details", "phone number", "photo", "suspended", "inactive", "activate"],
        answer: "If you forgot your password or didn't receive an OTP, try 'Resend OTP' or 'Forgot Password'. Update your profile details, photo, and phone number from the 'My Profile' tab. If your account is suspended or inactive, please contact support for activation."
    },
    {
        keywords: ["refund", "dispute", "false complaint", "payment pending", "refused payment", "resolution"],
        answer: "If a customer requests a refund or makes a false complaint, our dispute resolution team will investigate within 48-72 hours. You can upload proof of your work via the 'Help Center'. If a service is completed but payment is refused, report the issue immediately."
    },
    {
        keywords: ["availability", "working hours", "holiday", "offline", "auto accept", "add service", "remove service", "pricing", "discount", "package", "portfolio"],
        answer: "You can manage your working hours, mark holidays, or go offline from the 'Availability' settings. To update pricing, discounts, auto-accept settings, or add new services and portfolio images, visit the 'Services' tab."
    },
    {
        keywords: ["rating", "ranking", "improve", "fake review", "cancellation rate", "response time"],
        answer: "Ratings are calculated based on customer feedback and completion rate. To improve your ranking, maintain a high response rate, minimize cancellations, and provide excellent service. You can report fake reviews to support."
    },
    {
        keywords: ["notification", "alert", "sms", "sound", "subscription", "premium lead", "renew", "membership"],
        answer: "If missing alerts, check your phone's notification settings. Premium providers get access to premium leads and reduced commissions. You can manage, renew, or cancel your subscription from the 'Membership' section."
    },
    {
        keywords: ["crash", "loading", "gps", "location not updating", "image upload", "chat", "call", "gateway", "server error"],
        answer: "If the app is crashing, loading slowly, or you have issues with GPS, uploads, or chat, please try clearing the app cache and ensuring you are on the latest version. For persistent gateway or server errors, please contact technical support."
    },
    {
        keywords: ["karyabandhu", "platform", "24/7", "update app", "data secure", "referral offer", "transaction", "language", "privacy policy"],
        answer: "Skilled Ustaad connects skilled professionals with customers. We operate in multiple cities 24/7. Your data is strictly secured. You can view your transactions, change the app language, and learn about referral offers in the 'Settings' section."
    }
];

const CUSTOMER_KNOWLEDGE_BASE = [
    {
        keywords: ["create account", "login", "forgot password", "reset password", "otp not coming", "otp", "number registered", "update profile", "change phone", "change email", "upload picture", "blocked", "suspended", "verify account", "delete account"],
        answer: "To manage your account, go to the 'Profile' section. You can update your details, change your phone/email, or upload a picture. If you forgot your password or didn't receive an OTP, try 'Resend OTP' or 'Forgot Password'. For blocked or suspended accounts, or to delete your account, please contact our support team."
    },
    {
        keywords: ["book", "booking", "select provider", "date and time", "emergency", "nearby provider", "cost", "price", "fixed", "negotiable", "multiple", "recurring", "reschedule", "cancel", "rejected", "not responding", "late", "never arrives", "contact provider", "instructions", "images", "status"],
        answer: "To book a service, select a category and your desired date/time. Prices are fixed to ensure quality. If a provider is late or not responding, you can contact them via the app or reschedule/cancel your booking. You can add instructions during booking and track the status in the 'My Bookings' tab."
    },
    {
        keywords: ["payment", "online", "cash", "failed", "deducted", "declined", "upi", "wallet balance", "coupon", "code", "after service", "invoice", "gst", "extra amount", "split payment", "add money", "payment history"],
        answer: "We accept UPI, Cards, Net Banking, and Wallet. Cash payments are subject to provider availability. You can apply coupon codes at checkout. GST is included in the final price unless stated otherwise. If a payment fails but is deducted, it will automatically refund in 3-5 days. You can download invoices and check payment history in the 'Wallet' or 'Bookings' section."
    },
    {
        keywords: ["refund", "cancellation", "money back", "return", "policy", "how long", "not received", "charges", "track refund", "partial refund", "poor service", "dispute", "wrong account"],
        answer: "Cancellations before the provider's arrival are usually free; late cancellations may incur a fee. Refunds are processed to the original payment method within 5-7 business days. If you received poor service, you can raise a refund dispute from the 'Help Center', and our team will investigate."
    },
    {
        keywords: ["on the way", "track location", "extra money", "taking too long", "inappropriate", "damaged", "report issue", "extend duration", "communicate", "chat", "call not working", "issue", "bad quality"],
        answer: "You can track the provider's location and communicate via chat/call once they are assigned. Providers should not ask for extra cash beyond the app invoice. If the provider is inappropriate, damages something, or asks for extra money, please use the 'Emergency SOS' or 'Report Issue' button immediately."
    },
    {
        keywords: ["rate", "review", "edit review", "remove review", "fake review", "cashback", "referral", "reward", "wallet expired", "refunded", "transferred"],
        answer: "You can rate and review your provider after service completion to help us maintain quality. Promotional wallet balances or referral cashbacks cannot be transferred to a bank account and may have expiration dates. You can check your rewards in the 'Wallet' section."
    },
    {
        keywords: ["notification", "sms", "email", "delayed", "enable", "disable", "premium", "membership", "subscription", "renew", "benefits", "refundable"],
        answer: "Ensure notifications are enabled in your phone settings to receive timely booking updates. Our premium membership offers exclusive discounts and priority support. Memberships can be managed or canceled in the 'Membership' section but are generally non-refundable."
    },
    {
        keywords: ["contact support", "report provider", "data secure", "emergency", "complaint", "female provider", "verification", "safety check", "safe", "secure"],
        answer: "Your safety is our top priority. All providers undergo strict background and identity verification. You can request a female provider for certain beauty/home services. For any complaints or emergencies, contact our 24/7 support team via the 'Help Center'."
    }
];

export const queryChatbot = async (req, res) => {
    try {
        const { query, role } = req.body;
        if (!query) return res.status(StatusCodes.BAD_REQUEST).json({ error: "Empty query" });

        const normalizedQuery = query.toLowerCase();
        let bestMatch = null;

        // 1. Check specialized knowledge base based on role
        const knowledgeBase = role === "provider" ? PROVIDER_KNOWLEDGE_BASE : CUSTOMER_KNOWLEDGE_BASE;
        
        for (const item of knowledgeBase) {
            if (item.keywords.some(k => normalizedQuery.includes(k))) {
                bestMatch = item.answer;
                break;
            }
        }

        // 2. Fallback to general FAQs from database
        if (!bestMatch) {
            const settings = await GlobalSettings.findOne();
            const faqs = settings?.support?.faqs || [];
            
            for (const faq of faqs) {
                if (normalizedQuery.includes(faq.question.toLowerCase())) {
                    bestMatch = faq.answer;
                    break;
                }
            }
        }

        // 3. Ultimate Fallback
        if (!bestMatch) {
            bestMatch = "I'm not exactly sure about that. Would you like me to connect you with our support team at support@skilledustaad.com?";
        }

        return res.json({ 
            answer: bestMatch, 
            suggestedAction: bestMatch.includes("support@skilledustaad.com") ? "escalate" : "none" 
        });

    } catch (err) {
        console.error("Chatbot Error:", err);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
    }
};
