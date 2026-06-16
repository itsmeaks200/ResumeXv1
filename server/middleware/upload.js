import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads")),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [".pdf", ".docx", ".doc"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error("Only PDF and DOCX files are allowed"), false);
};

const audioStorage = multer.memoryStorage();
const audioFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("audio/")) cb(null, true);
  else cb(new Error("Only audio files are allowed"), false);
};

export const resumeUpload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });
export const audioUpload = multer({ storage: audioStorage, fileFilter: audioFilter, limits: { fileSize: 25 * 1024 * 1024 } });
