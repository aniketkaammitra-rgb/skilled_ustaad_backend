import mongoose from "mongoose";
import dotenv from "dotenv";
import Admin from "../models/Admin.js";

dotenv.config();

const seedAdmin = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI;
    await mongoose.connect(MONGODB_URI);
    // console.log("Connected to MongoDB");

    const email = "admin@skilledustaad.com";
    const password = "adminpassword123"; // User should change this after first login if possible

    const existing = await Admin.findOne({ email });
    if (existing) {
      // console.log("Admin user already exists");
      process.exit(0);
    }

    const admin = new Admin({
      email,
      password,
      role: "admin"
    });

    await admin.save();
    // console.log("Admin user created successfully!");
    // console.log(`Email: ${email}`);
    // console.log(`Password: ${password}`);

    process.exit(0);
  } catch (err) {
    // console.error("Seeding error:", err);
    process.exit(1);
  }
};

seedAdmin();
