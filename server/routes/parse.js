const express = require("express");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const { resumeUpload } = require("../middleware/upload");

const router = express.Router();

router.post("/", resumeUpload.single("resume"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const filePath = req.file.path;
  const scriptPath = path.join(__dirname, "../parser/resume_parser.py");

  execFile("python", [scriptPath, filePath], { timeout: 60000 }, (err, stdout, stderr) => {
    // cleanup uploaded file after parsing
    fs.unlink(filePath, () => {});

    if (err) {
      console.error("Parser error:", stderr);
      return res.status(500).json({ error: "Failed to parse resume", details: stderr });
    }

    try {
      const parsed = JSON.parse(stdout);
      res.json(parsed);
    } catch {
      console.error("JSON parse error:", stdout);
      res.status(500).json({ error: "Parser returned invalid JSON" });
    }
  });
});

module.exports = router;
