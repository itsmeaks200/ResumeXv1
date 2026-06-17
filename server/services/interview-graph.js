import { chat, stripJson } from "./groq.js";

const SYSTEM = `You are an expert technical interviewer conducting a live interview. Return structured JSON only. No markdown, no explanation.`;

export function createSession(resume, jobDescription, duration = 30, questionCount = 5) {
  return {
    resume,
    jobDescription,
    githubProjects: [],   // enriched from GitHub API, set externally before first question
    duration,
    questionCount,
    currentQuestion: null, // the active main question
    currentAnswer: "",
    questions: [],         // history of main questions generated (grows dynamically)
    answers: [],           // answers to each (main + followup interleaved)
    evaluations: [],       // { question, answer, evaluation } for each answered question
    followUpCount: 0,      // follow-ups used on current main question
    currentFollowUp: null,
    report: null,
    nextAction: null,      // "followup" | "next" | "done"
  };
}

// ── Dynamic per-question generation ────────────────────────────────
export async function generateNextQuestion(session) {
  const asked = session.questions.length;         // main questions generated so far
  const target = session.questionCount;
  const remaining = target - asked;
  const perMin = Math.round(session.duration / target);

  // Determine phase based on position in interview
  let phase;
  if (asked === 0) phase = "warmup";
  else if (asked <= Math.min(2, Math.floor(target * 0.4)) && session.githubProjects.length > 0) phase = "project";
  else phase = "technical";

  // Performance trend
  const scores = session.evaluations.map((e) => e.evaluation.overall);
  const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

  // Conversation history for context
  const history = session.questions
    .map((q, i) => {
      const ans = session.answers[i] ?? "(no answer)";
      const score = session.evaluations[i]?.evaluation?.overall ?? "N/A";
      return `Q${i + 1} [${q.type} / ${q.topic}]: ${q.question}\nAnswer: ${ans}\nScore: ${score}/10`;
    })
    .join("\n\n");

  // GitHub project context
  const projectCtx = session.githubProjects.length > 0
    ? session.githubProjects
        .map(
          (p) =>
            `• ${p.name} (${p.primaryLanguage})${p.description ? ": " + p.description : ""}` +
            (p.techStack?.length ? ` | Stack: ${p.techStack.join(", ")}` : "") +
            (p.readmeSnippet ? `\n  About: ${p.readmeSnippet.slice(0, 300)}` : "")
        )
        .join("\n")
    : null;

  // Topics already covered — avoid repeating
  const coveredTopics = session.questions.map((q) => q.topic).join(", ");

  const prompt = `
You are conducting a live technical interview. Generate the single most appropriate NEXT question.

Job Description: ${session.jobDescription}
Interview: ${session.duration} min total | ${remaining} question(s) remaining | ~${perMin} min per question
${avgScore ? `Candidate avg score so far: ${avgScore}/10` : ""}
${coveredTopics ? `Topics already covered: ${coveredTopics}` : ""}

${projectCtx ? `Candidate's GitHub projects (from their resume):\n${projectCtx}` : "No GitHub projects available."}

Conversation so far:
${history || "No questions asked yet."}

Current phase: ${phase}

Phase rules:
- warmup (Q1): Open naturally. "Walk me through your background and what you've been building recently." Friendly, conversational, no pressure. Difficulty: Easy.
- project (Q2-Q${Math.min(3, Math.floor(target * 0.4) + 1)}): Pick the most technically interesting GitHub project and ask a SPECIFIC question about it by name. Examples:
    "I see you built [project name] — walk me through the architecture."
    "What was the hardest engineering challenge in [project name]?"
    "Why did you choose [specific tech] for [project name] over alternatives?"
    "If you were to scale [project name] to 10x users, what would break first?"
  Use their actual project names, languages, and tech stack from the GitHub data.
- technical (Q${Math.min(4, Math.floor(target * 0.4) + 2)}+): Abstract questions relevant to the JD role.
    - If the candidate mentioned a specific technology in a previous answer, probe that first.
    - Mix: DSA (with ~${perMin} min time budget), system design, OS/networking concepts, behavioral.
    - If avg score > 7: increase difficulty. If avg score < 5: simplify or try a different angle.
    - Last question (remaining === 1): Lighter behavioral or wrap-up question.

Global rules:
- Each question must feel like a natural continuation of the conversation — reference what they said before where relevant.
- Never repeat a topic already covered.
- For DSA: frame as a coding problem with time context: "You have ~${perMin} minutes. Given..."
- For system design: "In ~${perMin} minutes, design..."

Return ONE question as JSON:
{ "id": ${asked + 1}, "type": "Warmup|Project|DSA|System Design|Behavioral|Technical|OS|Networking|ML", "question": "string", "difficulty": "Easy|Medium|Hard", "topic": "string" }
`;

  const raw = await chat(prompt, SYSTEM);
  const q = JSON.parse(stripJson(raw));
  session.questions.push(q);
  session.currentQuestion = q;
  session.followUpCount = 0;
  session.currentFollowUp = null;
  return q;
}

// ── Evaluation ──────────────────────────────────────────────────────
export async function evaluateAnswer(session) {
  const q = session.currentFollowUp ?? session.currentQuestion;
  const isFollowUp = session.currentFollowUp !== null;

  const prompt = `
Evaluate this interview answer fairly. You are a calibrated senior engineer doing a phone screen — not a FAANG bar-raiser. Reward partial credit generously when the candidate shows genuine understanding, even if they miss details.

Scoring calibration:
- 8-10: Complete, accurate, shows depth and clear communication
- 6-7: Correct core idea, some gaps in detail or edge cases — PASS for a phone screen
- 4-5: Partially correct, missing key concepts, but shows some understanding
- 2-3: Mostly wrong or confused, but attempted
- 0-1: No meaningful answer

If the candidate correctly identifies the main concept and key trade-off, score at least 6. Do not penalize for missing minor details on Easy or Medium questions.

Return JSON:
{
  "scores": { "correctness": <0-10>, "depth": <0-10>, "clarity": <0-10>, "structure": <0-10> },
  "overall": <0-10>,
  "feedback": "2-3 sentences — start with what they got right, then note the gap",
  "what_was_good": "specific strength in their answer",
  "what_was_missing": "the single most important gap",
  "model_answer_hints": ["3-5 bullet points a complete answer would cover"]
}

Question type: ${q.type} — ${q.topic}
Question: ${q.question}
Answer: ${session.currentAnswer}
`;

  const raw = await chat(prompt, SYSTEM);
  const evaluation = JSON.parse(stripJson(raw));

  session.answers.push(session.currentAnswer);
  session.evaluations.push({ question: q, answer: session.currentAnswer, evaluation, isFollowUp });

  const weak = evaluation.overall < 6;

  if (!isFollowUp && weak && session.followUpCount < 1) {
    session.nextAction = "followup";
    session.followUpCount += 1;
  } else if (session.questions.length >= session.questionCount) {
    // All main questions answered (with or without follow-ups)
    session.nextAction = "done";
  } else {
    session.nextAction = "next";
  }

  session.currentFollowUp = null;
  session.currentAnswer = "";
  return { session, evaluation };
}

// ── Follow-up ───────────────────────────────────────────────────────
export async function generateFollowUp(session) {
  const lastEval = session.evaluations.at(-1);
  const original = session.currentQuestion;

  const prompt = `
The candidate gave a weak answer. Generate 1 targeted follow-up that drills into the specific gap. Keep it concrete and answerable.

Original question: ${original.question}
What was missing: ${lastEval.evaluation.what_was_missing}

Return JSON:
{ "id": 99, "type": "${original.type}", "question": "string", "difficulty": "Medium", "topic": "${original.topic}" }
`;

  const raw = await chat(prompt, SYSTEM);
  session.currentFollowUp = JSON.parse(stripJson(raw));
  return session;
}

// ── Final report ────────────────────────────────────────────────────
export async function generateReport(session) {
  const projectCtx = session.githubProjects.length > 0
    ? `\nCandidate's projects: ${session.githubProjects.map((p) => p.name).join(", ")}`
    : "";

  const prompt = `
Generate a full technical interview debrief. Be honest and precise — this is meant to help the candidate improve.

Return JSON:
{
  "overall_score": <0-10>,
  "overall_grade": <"A"|"B"|"C"|"D"|"F">,
  "summary": "3-4 sentence honest performance summary",
  "strengths": ["top 3 specific things they did well, with evidence"],
  "weak_areas": ["top 3 concept gaps revealed by their answers"],
  "recommended_topics": [
    { "topic": "string", "reason": "why this gap was exposed", "resources": "specific resources to study" }
  ],
  "transcript": [{ "question": "string", "answer": "string", "score": <0-10> }]
}

Questions: ${JSON.stringify(session.questions)}
Answers: ${JSON.stringify(session.answers)}
Evaluations: ${JSON.stringify(session.evaluations.map((e) => e.evaluation))}
Job Description: ${session.jobDescription}
${projectCtx}
`;

  const raw = await chat(prompt, SYSTEM);
  session.report = JSON.parse(stripJson(raw));
  return session;
}
