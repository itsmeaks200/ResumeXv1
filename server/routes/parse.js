import { Router } from "express";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { resumeUpload } from "../middleware/upload.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

router.post("/", resumeUpload.single("resume"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const scriptPath = path.join(__dirname, "../parser/resume_parser.py");

  execFile("python", [scriptPath, filePath], { timeout: 60000, env: process.env }, (err, stdout, stderr) => {
    fs.unlink(filePath, () => {});

    if (err) {
      console.error("Parser error:", stderr);
      return res.status(500).json({ error: "Failed to parse resume", details: stderr });
    }

    try {
      res.json(JSON.parse(stdout));
    } catch {
      res.status(500).json({ error: "Parser returned invalid JSON" });
    }
  });
});

export default router;
