import mongoose from 'mongoose';
import './config/env.js';
import User from './models/User.js';

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const user1 = await User.findOne({ phoneNumber: '9999999999' });
    console.log("User 9999999999:", user1);

    const user2 = await User.findOne({ phoneNumber: '6239695774' });
    console.log("User 6239695774:", user2);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.connection.close();
  }
}

run();
