import { Router } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import { resumeUpload } from "../middleware/upload.js";
import { requireAuth } from "../middleware/auth.js";
import Resume from "../models/Resume.js";
import { parseResumeFile } from "../services/parser.js";
const router = Router();

router.post("/", requireAuth, resumeUpload.single("resume"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  
  try {
    const parsedData = await parseResumeFile(filePath, req.file.mimetype);
    
    // Always clean up uploaded file
    fs.unlink(filePath, () => {});

    let resumeId = null;
    try {
      const saved = await Resume.create({
        userId: req.user._id,
        filename: req.file.originalname,
        parsedData,
      });
      resumeId = saved._id;
    } catch (e) {
      console.warn("Failed to save resume to DB:", e.message);
    }

    res.json({ data: parsedData, resumeId });
    
  } catch (err) {
    // Always clean up uploaded file on error
    fs.unlink(filePath, () => {});
    console.error("Parser error:", err);
    res.status(500).json({ error: "Failed to parse resume. The file may be corrupted or in an unsupported format." });
  }
});

// Handle Multer-specific errors (file too large, wrong format) with clean 400s
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large. Maximum size is 5MB." });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err.message?.includes("Only PDF and DOCX")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
