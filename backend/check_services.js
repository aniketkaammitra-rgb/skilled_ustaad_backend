import mongoose from "mongoose";
import Service from "./models/Service.js";
import dotenv from "dotenv";

dotenv.config();

async function checkServices() {
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri);
  const services = await Service.find().limit(10);
  services.forEach(s => {
    // console.log(`ID: ${s._id} | CAT: ${s.category} | SUB: ${s.subService}`);
  });
  process.exit();
}

checkServices();
