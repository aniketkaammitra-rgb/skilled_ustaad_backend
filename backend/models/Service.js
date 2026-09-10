import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema({
    category:{
        type: String,
        required: true,
    },
    subService:{
        type: String,
        default: "",
    },
    providerSubService: {
        type: String,
        default: "",
    },
    description:{
        type: String,
        required: true,
    },
    requirement:{
        type: String,
        default: "",
    },
    price:{
        type: Number,
        min: 0,
    },
    basePrice: {
        type: Number,
        min: 0,
    },
    discount: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
    },
    serviceType: {
        type: String,
        enum: ["normal", "bidding"],
        default: "normal",
    },
    rating:{
        type: Number,
        default: 0,
        min: 0,
    },
    imageUrl:{
        type: String,
        default: "",
    },
    city:{
        type: String,
        default: "",
    },   
    cities: {
        type: [String],
        default: [],
    },
    status: {
        type: String,
        enum: ["active", "pending", "completed", "inactive"],
        default: "active",
    },
    jobId: {
        type: String,
        unique: true,
    }
}, {
    timestamps: true,
});

serviceSchema.pre("save", async function(next) {
    if (!this.jobId) {
        // Generate a random unique ID, e.g., SERV-XXXX
        const count = await mongoose.model("Service").countDocuments();
        const suffix = (count + 1).toString().padStart(4, '0');
        const randomStr = Math.random().toString(36).substring(2, 4).toUpperCase();
        this.jobId = `JB-${randomStr}${suffix}`;
    }
    next();
});

serviceSchema.index({ category: 1 });
serviceSchema.index({ cities: 1 });
serviceSchema.index({ city: 1 });
serviceSchema.index({ subService: 1 });


export default mongoose.model("Service",serviceSchema);