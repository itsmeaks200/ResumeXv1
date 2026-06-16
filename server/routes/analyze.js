const express = require("express");
const { chat, stripJson } = require("../services/groq");

const router = express.Router();

const SYSTEM = `You are an ATS (Applicant Tracking System) scoring engine.
Analyze resumes against job descriptions and return structured JSON only. No markdown, no explanation.`;

router.post("/", async (req, res) => {
  const { resume, jobDescription } = req.body;

  if (!resume || !jobDescription) {
    return res.status(400).json({ error: "resume and jobDescription are required" });
  }

  const prompt = `
Compare this resume against the job description and return a JSON object with this exact schema:
{
  "score": <number 0-100>,
  "grade": <"A" | "B" | "C" | "D" | "F">,
  "summary": "2-3 sentence overall assessment",
  "matched_keywords": ["keywords present in both resume and JD"],
  "missing_keywords": ["important JD keywords absent from resume"],
  "section_scores": {
    "skills": <0-100>,
    "experience": <0-100>,
    "projects": <0-100>,
    "education": <0-100>
  },
  "suggestions": [
    {
      "section": "Skills | Experience | Projects",
      "issue": "what is weak",
      "fix": "concrete rewrite or addition suggestion"
    }
  ]
}

Job Description:
${jobDescription}

Resume:
${JSON.stringify(resume, null, 2)}
`;

  try {
    const raw = await chat(prompt, SYSTEM);
    const result = JSON.parse(stripJson(raw));
    res.json(result);
  } catch (err) {
    console.error("Analyze error:", err);
    res.status(500).json({ error: "Failed to analyze resume" });
  }
});

module.exports = router;
