import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

const seedCustomers = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI;
    await mongoose.connect(MONGODB_URI);

    const customers = [
      {
        fullName: "Rahul Sharma",
        phoneNumber: "9812345678",
        isActive: true,
        isVerified: true,
        city: "Delhi",
        state: "Delhi",
        address: { houseNo: "123", colony: "Lajpat Nagar" },
        location: { type: "Point", coordinates: [77.2090, 28.6139] }
      },
      {
        fullName: "Priya Singh",
        phoneNumber: "9823456789",
        isActive: true,
        isVerified: false,
        city: "Mumbai",
        state: "Maharashtra",
        address: { houseNo: "45", colony: "Andheri West" },
        location: { type: "Point", coordinates: [72.8777, 19.0760] }
      },
      {
        fullName: "Amit Patel",
        phoneNumber: "9834567890",
        isActive: false,
        isVerified: true,
        city: "Ahmedabad",
        state: "Gujarat",
        address: { houseNo: "789", colony: "Satellite" },
        location: { type: "Point", coordinates: [72.5714, 23.0225] }
      }
    ];

    for (const c of customers) {
      await User.findOneAndUpdate({ phoneNumber: c.phoneNumber }, c, { upsert: true, new: true });
    }

    // console.log("Test customers seeded successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Seeding error:", err);
    process.exit(1);
  }
};

seedCustomers();
