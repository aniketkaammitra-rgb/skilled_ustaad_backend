
import mongoose from "mongoose";
import logger from "../libs/logger.js";
import env from "./env.js";

export default async () => {
  try {
    mongoose.set("strictQuery", true);

    if (!env.mongoUri) {
      throw new Error("Critical Failure: env.mongoUri is undefined!");
    }

    // Production-ready connection options for low latency and high availability
    const options = {
      maxPoolSize: 500, // Handle high concurrency (Increased for Stress Test)
      minPoolSize: 20,  // Keep some connections ready
      serverSelectionTimeoutMS: 5000, // Fail fast if DB is down
      socketTimeoutMS: 45000, // Close sockets that are inactive
      family: 4 // Use IPv4 for stability in some cloud envs
    };

    await mongoose.connect(env.mongoUri, options);
    logger.info("Mongoose DB: Connected (Connection Pool Optimized)");

  } catch (err) {
    logger.error("Mongoose DB: Connection Failure", { message: err.message });
    throw err;
  }
};
