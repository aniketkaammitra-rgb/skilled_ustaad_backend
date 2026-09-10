import mongoose from "mongoose";
import Service from "./models/Service.js";
import dotenv from "dotenv";

dotenv.config();

async function updateServices() {
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri);

  // Mapping for existing services
  const updates = [
    { id: "69bfa0acf604fd3781d5e1b7", trade: "Electrician" }, // Loose wire fix
    { id: "69bd3443c0d0bad9289a4cfb", trade: "Plumber" },    // Toilet flush repair
    { id: "69bfa605f604fd3781d5e3bc", trade: "Plumber" }     // Toilet flush repair (duplicate?)
  ];

  for (const up of updates) {
    const res = await Service.findByIdAndUpdate(up.id, { providerSubService: up.trade });
    // console.log(`Updated ID: ${up.id} with Trade: ${up.trade}`);
  }

  process.exit();
}

updateServices();
