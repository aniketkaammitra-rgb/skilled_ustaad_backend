import mongoose from "mongoose";

const bookingResponseSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },

    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
    },

    action: {
      type: String,
      enum: ["accepted", "declined"],
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("BookingResponse", bookingResponseSchema);