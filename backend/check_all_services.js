import mongoose from "mongoose";
import Service from "./models/Service.js";
import dotenv from "dotenv";

dotenv.config();

async function checkServices() {
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri);
  const count = await Service.countDocuments();
  const activeCount = await Service.countDocuments({ status: "active" });
  // console.log(`Total Services: ${count}`);
  // console.log(`Active Services: ${activeCount}`);

  const services = await Service.find();
  services.forEach(s => {
    // console.log(`ID: ${s._id} | CAT: ${s.category} | SUB: "${s.subService}" | CITY: "${s.city}" | STATUS: ${s.status}`);
  });

  process.exit();
}

checkServices();
