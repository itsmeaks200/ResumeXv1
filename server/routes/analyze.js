import { Router } from "express";
import { chat, stripJson } from "../services/groq.js";

const router = Router();

const SYSTEM = `You are a strict ATS scoring engine used by top companies. Return structured JSON only. No markdown, no explanation.`;

router.post("/", async (req, res) => {
  const { resume, jobDescription } = req.body;
  if (!resume || !jobDescription)
    return res.status(400).json({ error: "resume and jobDescription are required" });

  const prompt = `
You are a strict ATS scanner. Score this resume against the job description with calibrated honesty — most resumes should score 40-75. Only exceptional matches score above 80.

Scoring rules:
- Extract technical skills, tools, languages, frameworks, and requirements from the JD
- A keyword counts as "matched" if it explicitly or clearly appears in the resume
- Missing critical/required keywords penalize the score (−3 to −6 each)
- Strong project or experience relevance can compensate for minor keyword gaps
- Section scores: a skills section missing ~40% of JD tools scores around 55-65
- Calibration: a solid but imperfect match should score 60-75; a strong match 75-85; near-perfect 85+
- Grade: A=80+, B=65-79, C=50-64, D=35-49, F=below 35

Return JSON:
{
  "score": <0-100, calibrated strictly>,
  "grade": <"A"|"B"|"C"|"D"|"F">,
  "summary": "2-3 sentence honest assessment of fit, naming the biggest gap",
  "matched_keywords": ["keywords explicitly present in both"],
  "missing_keywords": ["important JD keywords absent from resume — be exhaustive"],
  "section_scores": { "skills": <0-100>, "experience": <0-100>, "projects": <0-100>, "education": <0-100> },
  "suggestions": [{ "section": "string", "issue": "specific gap or missing element", "fix": "concrete actionable fix" }]
}

Job Description: ${jobDescription}
Resume: ${JSON.stringify(resume, null, 2)}
`;

  try {
    const result = JSON.parse(stripJson(await chat(prompt, SYSTEM)));
    res.json(result);
  } catch (err) {
    console.error("Analyze error:", err);
    res.status(500).json({ error: "Failed to analyze resume" });
  }
});

export default router;
