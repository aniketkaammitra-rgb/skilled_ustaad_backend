import mongoose from "mongoose";
import dotenv from "dotenv";
import Payout from "../models/Payout.js";
import PaymentMethod from "../models/PaymentMethod.js";

dotenv.config();

const repair = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    // console.log("Connected to MongoDB");

    const pendingPayouts = await Payout.find({ status: { $in: ["Pending", "PENDING"] } });
    // console.log(`Found ${pendingPayouts.length} pending payouts to repair.`);

    for (const payout of pendingPayouts) {
      if (!payout.bankDetails || !payout.bankDetails.accountNumber || payout.bankDetails.accountNumber === "N/A") {
        const method = await PaymentMethod.findOne({ provider: payout.provider, isDefault: true })
          || await PaymentMethod.findOne({ provider: payout.provider });

        if (method) {
          let parsed = {};
          try {
            parsed = typeof method.details === 'string' ? JSON.parse(method.details) : method.details;
          } catch (e) { console.error("Parse error for method", method._id); continue; }

          payout.bankDetails = {
            accountNumber: parsed.accountNumber || parsed.accountNo || "N/A",
            ifscCode: parsed.ifscCode || parsed.ifsc || "N/A",
            upiId: parsed.upiId || parsed.upi || "N/A"
          };
          payout.requestedAt = payout.requestedAt || payout.date;
          // Standardize status while we're at it
          payout.status = "Pending";
          await payout.save();
          // console.log(`Repaired Payout ${payout._id} for Provider ${payout.provider}`);
        } else {
          // console.log(`No payment method found for provider ${payout.provider} on payout ${payout._id}`);
        }
      }
    }

    // console.log("Repair complete!");
    process.exit(0);
  } catch (err) {
    // console.error("Repair failed:", err);
    process.exit(1);
  }
};

repair();
