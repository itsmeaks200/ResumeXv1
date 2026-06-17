import { Router } from "express";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { resumeUpload } from "../middleware/upload.js";
import { optionalAuth } from "../middleware/auth.js";
import Resume from "../models/Resume.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

router.post("/", optionalAuth, resumeUpload.single("resume"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const scriptPath = path.join(__dirname, "../parser/resume_parser.py");

  execFile("python", [scriptPath, filePath], { timeout: 60000, env: process.env }, async (err, stdout, stderr) => {
    fs.unlink(filePath, () => {});

    if (err) {
      console.error("Parser error:", stderr);
      return res.status(500).json({ error: "Failed to parse resume", details: stderr });
    }

    let parsedData;
    try {
      parsedData = JSON.parse(stdout);
    } catch {
      return res.status(500).json({ error: "Parser returned invalid JSON" });
    }

    let resumeId = null;
    if (req.user) {
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
    }

    res.json({ data: parsedData, resumeId });
  });
});

export default router;
