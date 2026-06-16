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
- Extract every technical skill, tool, language, framework, and requirement from the JD
- A keyword only counts as "matched" if it explicitly appears in the resume (no assumed synonyms)
- Missing critical/required JD keywords heavily penalize the score (−5 to −10 each)
- Years of experience mismatches penalize score
- Projects and skills that are irrelevant to the JD do not add points
- Section scores reflect real gaps: a skills section missing 60% of JD tools should score 30-45, not 70
- Grade: A=85+, B=70-84, C=55-69, D=40-54, F=below 40

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
