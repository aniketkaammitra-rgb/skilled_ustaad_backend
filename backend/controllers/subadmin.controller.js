import { StatusCodes } from "http-status-codes";
import Admin from "../models/Admin.js";

/* ------------------------------------------------------------------
   CREATE SUB-ADMIN
   Endpoint: POST /api/admin/subadmins
-------------------------------------------------------------------*/
export const createSubAdmin = async (req, res) => {
  try {
    const { name, email, password, permissions } = req.body;

    if (!email || !password) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Email and password are required" });
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(StatusCodes.CONFLICT).json({ error: "Email already in use" });
    }

    const subAdmin = new Admin({
      name,
      email,
      password, // Pre-save hook hashes it
      role: "subadmin",
      permissions: permissions || []
    });

    await subAdmin.save();

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Sub-Admin created successfully",
      admin: {
        id: subAdmin._id,
        name: subAdmin.name,
        email: subAdmin.email,
        role: subAdmin.role,
        permissions: subAdmin.permissions
      }
    });
  } catch (error) {
    console.error("Create sub-admin error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
   GET ALL SUB-ADMINS
   Endpoint: GET /api/admin/subadmins
-------------------------------------------------------------------*/
export const getSubAdmins = async (req, res) => {
  try {
    const subAdmins = await Admin.find({ role: "subadmin" }).select("-password -refreshToken");
    return res.status(StatusCodes.OK).json({ success: true, subAdmins });
  } catch (error) {
    console.error("Get sub-admins error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
   UPDATE SUB-ADMIN
   Endpoint: PUT /api/admin/subadmins/:id
-------------------------------------------------------------------*/
export const updateSubAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, permissions } = req.body;

    const subAdmin = await Admin.findById(id);
    if (!subAdmin) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Sub-Admin not found" });
    }
    
    // Safety check
    if (subAdmin.role === "superadmin") {
      return res.status(StatusCodes.FORBIDDEN).json({ error: "Cannot modify superadmin using this endpoint" });
    }

    if (name) subAdmin.name = name;
    if (email) subAdmin.email = email;
    if (password) subAdmin.password = password; // pre-save will hash
    if (permissions) subAdmin.permissions = permissions;

    await subAdmin.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Sub-Admin updated successfully",
      admin: {
        id: subAdmin._id,
        name: subAdmin.name,
        email: subAdmin.email,
        role: subAdmin.role,
        permissions: subAdmin.permissions
      }
    });
  } catch (error) {
    console.error("Update sub-admin error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
   DELETE SUB-ADMIN
   Endpoint: DELETE /api/admin/subadmins/:id
-------------------------------------------------------------------*/
export const deleteSubAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    
    const subAdmin = await Admin.findById(id);
    if (!subAdmin) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Sub-Admin not found" });
    }
    
    if (subAdmin.role === "superadmin") {
      return res.status(StatusCodes.FORBIDDEN).json({ error: "Cannot delete superadmin" });
    }

    await Admin.findByIdAndDelete(id);

    return res.status(StatusCodes.OK).json({ success: true, message: "Sub-Admin deleted successfully" });
  } catch (error) {
    console.error("Delete sub-admin error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};
