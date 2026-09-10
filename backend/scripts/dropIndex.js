import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const MONGO_URI = process.env.MONGODB_URI;

async function dropIndex() {
  try {
    // console.log("Connecting to:", MONGO_URI);
    await mongoose.connect(MONGO_URI);
    // console.log("Connected to MongoDB");

    const collection = mongoose.connection.collection("services");
    // console.log("Dropping index jobId_1 from services collection...");

    try {
      await collection.dropIndex("jobId_1");
      // console.log("Successfully dropped jobId_1 index");
    } catch (e) {
      if (e.codeName === "IndexNotFound") {
        // console.log("Index jobId_1 not found, skipping.");
      } else {
        throw e;
      }
    }

    await mongoose.disconnect();
    // console.log("Disconnected from MongoDB");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

dropIndex();
