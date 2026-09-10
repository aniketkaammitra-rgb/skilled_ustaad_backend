import multer from "multer";
import path from "path";
import fs from "fs";

const uploadsDir = path.join(path.resolve(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const useFirebase = process.env.NODE_ENV === "production" || process.env.UPLOAD_TO_FIREBASE === "true";

const storage = useFirebase
  ? multer.memoryStorage()
  : multer.diskStorage({
    destination: (req, file, cb) => {
      // console.log("Multer: Starting upload to", uploadsDir);
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const fname = `${file.fieldname}-${Date.now()}${ext}`;
      // console.log("Multer: Generated filename", fname);
      cb(null, fname);
    },
  });

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif", "application/pdf", "image/jpg", "image/webp"];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // If it has a known extension but weird mimetype, we can also check the extension
    const allowedExts = /jpeg|jpg|png|gif|pdf|webp/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.test(ext.replace(".", ""))) {
      cb(null, true);
    } else {
      cb(new Error("Only images/PDFs allowed. Received: " + file.mimetype));
    }
  }
};

export const upload = multer({ storage, fileFilter, limits: { fileSize: 30 * 1024 * 1024 } });
