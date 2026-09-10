import cloudinary from "../config/cloudinary.js";
import fs from "fs";

/**
 * Uploads a file to Cloudinary or returns the local path.
 * @param {Object} file - The file object from Multer (buffer if memoryStorage, path if diskStorage).
 * @param {String} folder - Optional folder name in Cloudinary.
 * @returns {Promise<String>} - The public secure URL or relative local path.
 */
export async function uploadToStorage(file, folder = "karaya_bandhu") {
  if (!file) return null;

  // Check if Cloudinary is explicitly enabled, or if we are in production with valid (non-placeholder) credentials
  const isCloudinaryConfigured = process.env.CLOUDINARY_API_KEY && 
                                 !process.env.CLOUDINARY_API_KEY.includes("placeholder") && 
                                 process.env.CLOUDINARY_API_KEY.trim() !== "" &&
                                 !process.env.CLOUDINARY_API_KEY.includes("hyM4kKzvE"); // Check against dummy key prefix
  
  const useCloudinary = process.env.UPLOAD_TO_CLOUDINARY === "true" || 
                        (process.env.NODE_ENV === "production" && isCloudinaryConfigured);

  if (useCloudinary) {
    try {
      return new Promise((resolve, reject) => {
        const uploadOptions = {
          folder: folder,
          resource_type: "auto",
        };

        if (file.buffer) {
          // Upload from memory buffer
          const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
            if (error) {
              console.error("Cloudinary Upload Error (Buffer):", error);
              return reject(error);
            }
            resolve(result.secure_url);
          });
          stream.end(file.buffer);
        } else if (file.path) {
          // Upload from local path
          cloudinary.uploader.upload(file.path, uploadOptions, (error, result) => {
            if (error) {
              console.error("Cloudinary Upload Error (Path):", error);
              return reject(error);
            }
            resolve(result.secure_url);
          });
        } else {
          reject(new Error("File content not found (buffer or path missing)"));
        }
      });
    } catch (err) {
      console.error("uploadToStorage Error:", err);
      throw err;
    }
  }

  // Local development fallback
  if (file.filename) {
    return `/uploads/${file.filename}`;
  }

  return null;
}
