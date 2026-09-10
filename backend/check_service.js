import mongoose from "mongoose";
import Service from "./models/Service.js";
import dotenv from "dotenv";

dotenv.config();

async function checkService() {
  const uri = process.env.MONGODB_URI;
  // console.log("Connecting to:", uri);
  await mongoose.connect(uri);
  const service = await Service.findById("69bfa0acf604fd3781d5e1b7");
  // console.log("SERVICE DATA:", JSON.stringify(service, null, 2));
  process.exit();
}

checkService();
