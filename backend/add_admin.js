import mongoose from 'mongoose';
import Admin from './models/Admin.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * PRODUCTION UTILITY: Add Admin Account
 * Usage: node add_admin.js <email> <password>
 */

const args = process.argv.slice(2);
if (args.length < 2) {
  // console.log("Usage: node add_admin.js <email> <password>");
  process.exit(1);
}

const [email, password] = args;

async function addAdmin() {
  try {
    // 1. Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    // console.log("Connected to MongoDB...");

    // 2. Check if admin already exists
    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) {
      console.error(`Error: Admin with email ${email} already exists.`);
      process.exit(1);
    }

    // 3. Create Admin (The hashing is handled automatically by the pre-save hook in Admin.js)
    const newAdmin = new Admin({
      email: email.toLowerCase(),
      password: password, // This will be hashed automatically
      role: "admin"
    });

    await newAdmin.save();
    // console.log("-----------------------------------------");
    // console.log(" SUCCESS: Admin account created!");
    // console.log(` Email: ${email}`);
    // console.log(` Status: Secure & Hashed`);
    // console.log("-----------------------------------------");

    process.exit(0);
  } catch (err) {
    // console.error("Critical Error:", err.message);
    process.exit(1);
  }
}

addAdmin();
