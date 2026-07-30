import { Router } from "express";
import Interview from "../models/Interview.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// List past interview reports for the authenticated user (summary only)
router.get("/", requireAuth, async (req, res) => {
  try {
    const interviews = await Interview.find({ userId: req.user._id })
      .select("jobDescription duration createdAt report.overall_score report.overall_grade")
      .sort({ createdAt: -1 });
    res.json(interviews);
  } catch {
    res.status(500).json({ error: "Failed to fetch interviews" });
  }
});

// Get a single interview report in full
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const interview = await Interview.findOne({ _id: req.params.id, userId: req.user._id });
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    res.json(interview);
  } catch {
    res.status(500).json({ error: "Failed to fetch interview" });
  }
});

export default router;
