import mongoose from "mongoose";

const secOpsReportSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true,
    trim: true
  },
  priority: {
    type: String,
    enum: ["Standard", "High", "Critical"],
    default: "Standard"
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "investigating", "resolved", "dismissed"],
    default: "pending"
  }
}, {
  timestamps: true
});

const SecOpsReport = mongoose.models.SecOpsReport || mongoose.model("SecOpsReport", secOpsReportSchema);
export default SecOpsReport;
