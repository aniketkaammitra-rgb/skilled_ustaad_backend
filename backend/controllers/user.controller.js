import User from "../models/User.js";
import { addressSchema } from "../validations/schemas.js";

export async function saveAddress(req, res) {
    const {value, error} = addressSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });
    
    const {address,city,state} = value;
    
    await User.findByIdAndUpdate(req.user.sub, {
        address,
        city,
        state
    });

    res.json({
        message: "Address-saved",
    });
}

export async function saveDeviceToken(req, res) {
    const { deviceToken } = req.body;
    if (!deviceToken) return res.status(400).json({ error: "Device token is required" });

    await User.findByIdAndUpdate(req.user.sub, { deviceToken });
    res.json({ message: "Device-Token-Saved" });
}

export async function me(req, res) {
    const user = await User.findById(req.user.sub).select("fullName phoneNumber city address state profilePhoto isVerified walletBalance notificationSound");
    res.json({
        user
    });
}

export async function updateNotificationSound(req, res) {
    try {
        const userId = req.user.sub;
        const { sound } = req.body;

        if (!sound) {
            return res.status(400).json({ error: "Sound selection is required" });
        }

        await User.findByIdAndUpdate(userId, {
            notificationSound: sound,
        });

        res.json({
            message: "Notification sound updated successfully",
            sound
        });
    } catch (err) {
        console.error("User Sound Update Error:", err);
        res.status(500).json({ error: "Failed to update notification sound" });
    }
}