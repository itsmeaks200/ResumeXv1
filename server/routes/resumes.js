import { Router } from "express";
import Resume from "../models/Resume.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// List all resumes for the authenticated user (no parsedData — list view only)
router.get("/", requireAuth, async (req, res) => {
  try {
    const resumes = await Resume.find({ userId: req.user._id })
      .select("filename createdAt")
      .sort({ createdAt: -1 });
    res.json(resumes);
  } catch {
    res.status(500).json({ error: "Failed to fetch resumes" });
  }
});

// Get single resume with full parsedData
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user._id });
    if (!resume) return res.status(404).json({ error: "Resume not found" });
    res.json(resume);
  } catch {
    res.status(500).json({ error: "Failed to fetch resume" });
  }
});

// Delete a resume
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const resume = await Resume.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!resume) return res.status(404).json({ error: "Resume not found" });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete resume" });
  }
});

export default router;
