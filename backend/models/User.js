
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    /* ===============================
       BASIC INFO
    =============================== */

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    deviceToken: {
      type: String,
      default: null,
    },

    deactivatedAt: {
      type: Date,
    },

    isTerminated: {
      type: Boolean,
      default: false,
    },

    /* ===============================
       ADDRESS (OPTIONAL UNTIL SIGNUP)
    =============================== */

    address: {
      houseNo: { type: String, trim: true },
      colony: { type: String, trim: true },
      // street: { type: String, trim: true },
      landMark: { type: String, trim: true },
    },

    city: {
      type: String,
      trim: true,
    },

    state: {
      type: String,
      trim: true,
    },

    pincode: {
      type: String,
      trim: true,
      index: true,
    },

    refreshToken: {
      type: [String],
      select: false, // Don't return by default
      index: true,
      default: [],
    },

    /* ===============================
       GEO LOCATION
    =============================== */

    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
    },

    /* ===============================
       OTP FIELDS
    =============================== */

    otpHash: String,
    otpExpires: Date,
    otpSendCount: {
      type: Number,
      default: 0,
    },
    lastOtpAt: Date,

    /* ===============================
       WALLET SYSTEM
    =============================== */

    walletBalance: {
      type: Number,
      default: 0,
    },

    /* ===============================
       DELETE ACCOUNT OTP
    =============================== */

    deleteOtpHash: String,
    deleteOtpExpires: Date,
    lastDeleteOtpAt: Date,

    /* ===============================
       FINANCIAL PREFERENCES
    =============================== */

    savedPaymentMethods: [
      {
        type: { type: String, enum: ["UPI", "Card"] },
        details: String,
        isPrimary: { type: Boolean, default: false }
      }
    ],

    /* ===============================
       FAVORITE SERVICES
    =============================== */
    
    favoriteServices: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service",
      },
    ],
    notificationSound: {
      type: String,
      default: "default",
    },
  },
  {
    timestamps: true,
  }
);

/* ===================================
   GEO INDEX
   Partial index prevents geo error
=================================== */


userSchema.index({ city: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ deviceToken: 1 }, { sparse: true }); // Faster notification lookups
userSchema.index({ location: "2dsphere" }, { partialFilterExpression: { location: { $exists: true } } });

userSchema.post("save", async function (doc) {
  try {
    const { getIO, broadcastStats } = await import("../libs/socket.js");
    broadcastStats();

    // Emit real-time updates for administrative dashboard
    const io = getIO();
    if (this.isNew) {
      io.emit("customerAdded", doc);
    } else {
      io.emit("customerUpdated", doc);
    }
  } catch (err) {
    console.error("User Socket Hook Error:", err.message);
  }
});

userSchema.post("remove", async function (doc) {
  try {
    const { getIO } = await import("../libs/socket.js");
    getIO().emit("customerDeleted", { id: doc._id });
  } catch (err) {
    console.error("User Delete Socket Hook Error:", err.message);
  }
});

export default mongoose.model("User", userSchema);