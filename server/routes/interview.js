const express = require("express");
const { chat, transcribeAudio, stripJson } = require("../services/groq");
const { audioUpload } = require("../middleware/upload");

const router = express.Router();

const SYSTEM = `You are an expert technical interviewer. Return structured JSON only. No markdown, no explanation.`;

// POST /api/interview/start
router.post("/start", async (req, res) => {
  const { resume, jobDescription, questionCount = 5 } = req.body;

  if (!resume || !jobDescription) {
    return res.status(400).json({ error: "resume and jobDescription are required" });
  }

  const prompt = `
You are conducting a mock interview. Based on the resume and job description below, generate ${questionCount} interview questions.

Auto-detect the role type (SDE, Systems, Data, DevOps, etc.) from the JD and mix question types accordingly:
- SDE: DSA problems, system design, OOP, debugging scenarios
- Systems: OS concepts, networking, concurrency, low-level C/C++
- Data: SQL, statistics, ML concepts
- Behavioral: STAR-format questions drawn from the candidate's resume experience

Return JSON:
{
  "role_type": "detected role type",
  "questions": [
    {
      "id": 1,
      "type": "DSA | System Design | Behavioral | Technical | OS | ML",
      "question": "question text",
      "difficulty": "Easy | Medium | Hard",
      "topic": "e.g. Arrays, Operating Systems, Leadership"
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
    console.error("Interview start error:", err);
    res.status(500).json({ error: "Failed to generate interview questions" });
  }
});

// POST /api/interview/transcribe
router.post("/transcribe", audioUpload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file uploaded" });
  }

  try {
    const transcript = await transcribeAudio(req.file.buffer, req.file.mimetype);
    res.json({ transcript });
  } catch (err) {
    console.error("Transcription error:", err);
    res.status(500).json({ error: "Failed to transcribe audio" });
  }
});

// POST /api/interview/answer
router.post("/answer", async (req, res) => {
  const { question, answer, resume } = req.body;

  if (!question || !answer) {
    return res.status(400).json({ error: "question and answer are required" });
  }

  const prompt = `
Evaluate the following interview answer. Return JSON:
{
  "scores": {
    "correctness": <0-10>,
    "depth": <0-10>,
    "clarity": <0-10>,
    "structure": <0-10>
  },
  "overall": <0-10>,
  "feedback": "2-3 sentences of specific, constructive feedback",
  "what_was_good": "what the candidate did well",
  "what_was_missing": "key concepts or points that were absent",
  "model_answer_hints": ["3-5 bullet points of what a strong answer would include"]
}

Question (type: ${question.type}, topic: ${question.topic}):
${question.question}

Candidate's Answer:
${answer}

Candidate's Resume (for context):
${JSON.stringify(resume || {}, null, 2)}
`;

  try {
    const raw = await chat(prompt, SYSTEM);
    const result = JSON.parse(stripJson(raw));
    res.json(result);
  } catch (err) {
    console.error("Answer eval error:", err);
    res.status(500).json({ error: "Failed to evaluate answer" });
  }
});

// POST /api/interview/end
router.post("/end", async (req, res) => {
  const { questions, answers, evaluations } = req.body;

  if (!questions || !evaluations) {
    return res.status(400).json({ error: "questions and evaluations are required" });
  }

  const prompt = `
Generate a full interview debrief based on the session below. Return JSON:
{
  "overall_score": <0-10>,
  "overall_grade": <"A" | "B" | "C" | "D" | "F">,
  "summary": "3-4 sentence overall performance summary",
  "strengths": ["top 3 things the candidate did well"],
  "weak_areas": ["top 3 areas to improve with specific topics"],
  "recommended_topics": [
    {
      "topic": "topic name",
      "reason": "why this needs work",
      "resources": "what to study (e.g. 'LeetCode medium arrays', 'OS concepts: scheduling')"
    }
  ],
  "transcript": [
    {
      "question": "question text",
      "answer": "candidate answer",
      "score": <overall score for this answer>
    }
  ]
}

Questions: ${JSON.stringify(questions)}
Answers: ${JSON.stringify(answers)}
Evaluations: ${JSON.stringify(evaluations)}
`;

  try {
    const raw = await chat(prompt, SYSTEM);
    const result = JSON.parse(stripJson(raw));
    res.json(result);
  } catch (err) {
    console.error("Interview end error:", err);
    res.status(500).json({ error: "Failed to generate interview report" });
  }
});

module.exports = router;
