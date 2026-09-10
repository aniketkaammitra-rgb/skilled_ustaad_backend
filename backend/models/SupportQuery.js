import mongoose from "mongoose";

const supportQuerySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  userType: {
    type: String,
    enum: ["customer", "provider", "general"],
    default: "customer"
  },
  subject: {
    type: String,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "resolved", "ignored"],
    default: "pending"
  }
}, {
  timestamps: true
});

const SupportQuery = mongoose.models.SupportQuery || mongoose.model("SupportQuery", supportQuerySchema);
export default SupportQuery;
