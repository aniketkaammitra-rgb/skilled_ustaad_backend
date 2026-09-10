import AlternateAddress from "../models/AlternateAddress.js";
import { StatusCodes } from "http-status-codes";

// Get all alternate addresses for the logged-in user
export const getAlternateAddresses = async (req, res) => {
  try {
    const addresses = await AlternateAddress.find({ user: req.user.sub }).sort({ createdAt: -1 });
    return res.status(StatusCodes.OK).json({
      success: true,
      addresses,
    });
  } catch (err) {
    console.error("Error fetching alternate addresses:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to fetch alternate addresses" });
  }
};

// Add a new alternate address
export const addAlternateAddress = async (req, res) => {
  try {
    const { houseNo, colony, landMark, city, state, pincode, latitude, longitude } = req.body;

    if (!city || !state || !pincode || latitude == null || longitude == null) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "City, state, pincode, and valid coordinates are required." });
    }

    // Check limit (max 3)
    const count = await AlternateAddress.countDocuments({ user: req.user.sub });
    if (count >= 3) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "You can only save up to 3 alternative addresses." });
    }

    const newAddress = new AlternateAddress({
      user: req.user.sub,
      houseNo: houseNo || "",
      colony: colony || "",
      landMark: landMark || "",
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      location: {
        type: "Point",
        coordinates: [Number(longitude), Number(latitude)],
      },
    });

    await newAddress.save();

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Address saved successfully",
      address: newAddress,
    });
  } catch (err) {
    console.error("Error saving alternate address:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to save alternate address" });
  }
};

// Delete an alternate address
export const deleteAlternateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedAddress = await AlternateAddress.findOneAndDelete({ _id: id, user: req.user.sub });
    
    if (!deletedAddress) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Address not found" });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Address deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting alternate address:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to delete alternate address" });
  }
};
