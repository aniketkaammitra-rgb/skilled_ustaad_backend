import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    service: {
      type: mongoose.Schema.Types.Mixed,
      ref: "Service",
      required: true,
    },

    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
    },

    serviceType: {
      type: String,
      required: true,
    },

    /* FULL ADDRESS STORED AS STRING */
    address: {
      type: String,
      required: true,
    },

    houseNo: {
      type: String,
    },

    landMark: {
      type: String,
    },

    colony: {
      type: String,
    },

    city: {
      type: String,
      required: true,
    },

    state: {
      type: String,
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

    time: {
      type: String,
      required: true,
    },

    remarks: {
      type: String,
    },

    price: {
      type: Number,
      required: true,
    },

    emergencyFee: {
      type: Number,
      default: 0,
    },

    /* ADD ONS */
    addOns: [
      {
        serviceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Service",
        },
        name: String,
        price: Number,
      },
    ],

    status: {
      type: String,
      enum: [
        "pending",
        "paid",
        "accepted",
        "in-progress",
        "work-finished",
        "settling",
        "completed",
        "cancelled",
        "no_provider_found",
      ],
      default: "pending",
    },
    refundStatus: {
      type: String,
      enum: ["Not Refunded", "Refunded"],
      default: "Not Refunded",
    },
    cancelReason: {
      type: String,
      default: "",
    },
    cancelledBy: {
      type: String,
      enum: ["customer", "provider", "admin"],
    },
    cancellationFee: {
      type: Number,
      default: 0,
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    noShowReported: {
      type: Boolean,
      default: false,
    },

    declinedProvider: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Provider"
  }
],


    location: {
  type: {
    type: String,
    enum: ["Point"],
    default: "Point",
  },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: function (v) {
        return v.length === 2 && 
               typeof v[0] === "number" && 
               typeof v[1] === "number";
      },
      message: "Coordinates must contain valid longitude and latitude",
    },
  },
},

    createdAt: {
      type: Date,
      default: Date.now,
    },
    
    isVerified: {
      type: Boolean,
      default: false,
    },

    startOtp: {
      type: String,
    },

    completeOtp: {
      type: String,
    },

    startedAt: {
      type: Date,
    },
    
    /* ESTIMATED TIME FOR SCHEDULING (FOR PROVIDER) */
    estimatedDuration: {
      type: Number, // in minutes
      default: 60
    },

    estimatedEndTime: {
      type: Date
    }
  },
  { timestamps: true }
);

/* GEO INDEX */
bookingSchema.index({ location: "2dsphere" });

bookingSchema.index({ status: 1 });
bookingSchema.index({ userId: 1 });
bookingSchema.index({ providerId: 1 });
bookingSchema.index({ city: 1 });
bookingSchema.index({ date: 1 });

const Booking = mongoose.model("Booking", bookingSchema);
export default Booking;