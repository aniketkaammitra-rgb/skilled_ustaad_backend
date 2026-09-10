import mongoose from "mongoose";
import Service from "./models/Service.js";
import dotenv from "dotenv";

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        // console.log("Connected to MongoDB for migration...");

        const services = await Service.find({ jobId: { $exists: false } });
        // console.log(`Found ${services.length} services without jobId.`);

        for (const service of services) {
            // Pre-save hook will handle it if we just call save()
            await service.save();
            // console.log(`Updated service ${service._id} with jobId ${service.jobId}`);
        }

        // console.log("Migration complete.");
        process.exit(0);
    } catch (err) {
        // console.error("Migration failed:", err);
        process.exit(1);
    }
};

migrate();
