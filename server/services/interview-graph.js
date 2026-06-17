import { chat, stripJson } from "./groq.js";

const SYSTEM = `You are an expert technical interviewer conducting a live interview. Return structured JSON only. No markdown, no explanation.`;

export function createSession(resume, jobDescription, duration = 30) {
  return {
    resume,
    jobDescription,
    githubProjects: [],
    duration,                  // minutes
    sessionStartTime: null,    // set when Q1 is first asked (after intro)
    candidateIntro: "",
    introSpeech: "",
    currentQuestion: null,
    currentAnswer: "",
    questions: [],
    answers: [],
    evaluations: [],
    followUpCount: 0,
    currentFollowUp: null,
    report: null,
    nextAction: null,
  };
}

// ── Pre-interview intro ─────────────────────────────────────────────────
export async function generateIntro(session) {
  const name = session.resume?.personal_info?.name || session.resume?.name || "";
  const firstName = name.split(" ")[0] || "there";

  const prompt = `
Generate a warm, natural interview opening speech for an AI technical interviewer named "Alex".

Candidate: ${firstName}
Interview duration: ${session.duration} minutes
Role context: ${session.jobDescription ? session.jobDescription.slice(0, 250) : "software engineering"}

Write 3-4 natural spoken sentences:
1. Greet ${firstName} warmly, thank them for their time
2. Introduce yourself as Alex from the engineering team
3. Quick format overview: ~${session.duration} min, mix of background, projects, and technical questions — no fixed number, just conversation
4. Invite them: "Tell me about yourself and what you've been building lately"

Tone: warm, conversational, real human energy. Do NOT mention being an AI.
Return JSON: { "speech": "full spoken intro" }
`;

  const raw = await chat(prompt, SYSTEM);
  const { speech } = JSON.parse(stripJson(raw));
  session.introSpeech = speech;
  return speech;
}

// ── Dynamic question generation ─────────────────────────────────────────
export async function generateNextQuestion(session) {
  // Set start time on first question
  if (!session.sessionStartTime) session.sessionStartTime = Date.now();

  const asked = session.questions.length;
  const elapsedMs = Date.now() - session.sessionStartTime;
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const remainingMin = Math.max(0, session.duration - elapsedMin);

  // Phase based on time elapsed, not question count
  const elapsedFraction = elapsedMs / (session.duration * 60000);
  let phase;
  if (asked === 0) phase = "warmup";
  else if (elapsedFraction < 0.45 && session.githubProjects.length > 0) phase = "project";
  else if (remainingMin <= 4) phase = "closing";
  else phase = "technical";

  const scores = session.evaluations.map((e) => e.evaluation.overall);
  const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

  const history = session.questions
    .map((q, i) => {
      const ans = session.answers[i] ?? "(no answer)";
      const score = session.evaluations[i]?.evaluation?.overall ?? "N/A";
      return `Q${i + 1} [${q.type}/${q.topic}]: ${q.question}\nAnswer: ${ans}\nScore: ${score}/10`;
    })
    .join("\n\n");

  const projectCtx = session.githubProjects.length > 0
    ? session.githubProjects
        .map((p) =>
          `• ${p.name} (${p.primaryLanguage})${p.description ? ": " + p.description : ""}` +
          (p.techStack?.length ? ` | Stack: ${p.techStack.join(", ")}` : "") +
          (p.readmeSnippet ? `\n  About: ${p.readmeSnippet.slice(0, 300)}` : "")
        )
        .join("\n")
    : null;

  const coveredTopics = session.questions.map((q) => q.topic).join(", ");

  const introCtx = session.candidateIntro
    ? `\nCandidate's intro: "${session.candidateIntro.slice(0, 500)}"`
    : "";

  const prompt = `
You are conducting a live technical interview. Generate the single most appropriate NEXT question.

Job Description: ${session.jobDescription || "General software engineering role"}
Time: ${elapsedMin} min elapsed, ~${remainingMin} min remaining
${avgScore ? `Candidate avg score: ${avgScore}/10` : ""}
${coveredTopics ? `Topics covered: ${coveredTopics}` : ""}
${introCtx}

${projectCtx ? `Candidate's GitHub projects:\n${projectCtx}` : "No GitHub projects."}

Conversation so far:
${history || "No questions yet."}

Current phase: ${phase}

Phase rules:
- warmup (Q1): Reference something specific from their intro if possible. "Tell me more about X you mentioned." Easy, conversational.
- project: Pick the most interesting GitHub project. Ask SPECIFIC question using actual project name and tech stack. e.g. "I see you built [project] using [tech] — walk me through the architecture." or "What was the hardest engineering challenge in [project]?"
- technical: JD-relevant abstract questions. Reference previous answers where relevant. Mix DSA/system design/OS/behavioral. Adapt difficulty to avg score (>7: harder, <5: simpler).
- closing (last ~4 min): One light behavioral or reflective question. "Looking back, what's the most complex technical problem you've solved?"

Global rules:
- Each question must feel like a natural continuation — reference what they said.
- Never repeat a covered topic.
- For DSA: frame with time: "You have ~${Math.min(remainingMin, 8)} minutes. Given..."
- For system design: "In ~${Math.min(remainingMin, 10)} minutes, design..."

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

// ── Evaluation ──────────────────────────────────────────────────────────
export async function evaluateAnswer(session) {
  const q = session.currentFollowUp ?? session.currentQuestion;
  const isFollowUp = session.currentFollowUp !== null;

  const prompt = `
Evaluate this interview answer fairly. You are a calibrated senior engineer on a phone screen.

Scoring:
- 8-10: Complete, accurate, shows depth
- 6-7: Correct core idea, some gaps — PASS for phone screen
- 4-5: Partially correct, missing key concepts
- 2-3: Mostly wrong but attempted
- 0-1: No meaningful answer

Return JSON:
{
  "scores": { "correctness": <0-10>, "depth": <0-10>, "clarity": <0-10>, "structure": <0-10> },
  "overall": <0-10>,
  "feedback": "2-3 sentences — start with what they got right, then the gap",
  "what_was_good": "specific strength",
  "what_was_missing": "single most important gap",
  "model_answer_hints": ["3-5 bullet points a complete answer would cover"]
}

Question (${q.type} / ${q.topic}): ${q.question}
Answer: ${session.currentAnswer}
`;

  const raw = await chat(prompt, SYSTEM);
  const evaluation = JSON.parse(stripJson(raw));

  session.answers.push(session.currentAnswer);
  session.evaluations.push({ question: q, answer: session.currentAnswer, evaluation, isFollowUp });

  // Time-based stopping — primary condition
  const elapsedMs = session.sessionStartTime ? Date.now() - session.sessionStartTime : 0;
  const remainingMs = (session.duration * 60000) - elapsedMs;
  const remainingMin = remainingMs / 60000;

  // Safety cap: never exceed duration * 2 questions
  const safetyCapReached = session.questions.length >= session.duration * 2;

  const timeIsUp = remainingMin < 4 || safetyCapReached;
  // Only probe if there's enough time for a follow-up + at least one more question
  const canProbe = !isFollowUp && !timeIsUp && remainingMin > 7 && session.followUpCount < 1;

  if (canProbe) {
    session.nextAction = "followup";
    session.followUpCount += 1;
  } else if (timeIsUp) {
    session.nextAction = "done";
  } else {
    session.nextAction = "next";
  }

  session.currentFollowUp = null;
  session.currentAnswer = "";
  return { session, evaluation };
}

// ── Follow-up / Probe ───────────────────────────────────────────────────
export async function generateFollowUp(session) {
  const lastEval = session.evaluations.at(-1);
  const original = session.currentQuestion;
  const isWeak = lastEval.evaluation.overall < 6;
  const candidateAnswer = session.answers.at(-1) ?? "";

  const prompt = isWeak
    ? `
The candidate gave a weak answer. Generate 1 targeted follow-up that drills into the specific gap.

Original: ${original.question}
Answer: "${candidateAnswer.slice(0, 400)}"
Gap: ${lastEval.evaluation.what_was_missing}

Acknowledge their attempt first: "I see what you're getting at — can you tell me more about..."
Return JSON: { "id": 99, "type": "${original.type}", "question": "string", "difficulty": "Medium", "topic": "${original.topic}" }
`
    : `
Good answer. Generate 1 natural probe that references something specific they said.

Original: ${original.question}
Answer: "${candidateAnswer.slice(0, 400)}"
Strong point: ${lastEval.evaluation.what_was_good}

Reference their exact words. e.g. "You mentioned X — what trade-offs did you consider?" or "Interesting approach — how would that scale to Z?"
Return JSON: { "id": 99, "type": "${original.type}", "question": "string", "difficulty": "Easy", "topic": "${original.topic}" }
`;

  const raw = await chat(prompt, SYSTEM);
  session.currentFollowUp = JSON.parse(stripJson(raw));
  return session;
}

// ── Final report ────────────────────────────────────────────────────────
export async function generateReport(session) {
  const projectCtx = session.githubProjects.length > 0
    ? `Candidate's projects: ${session.githubProjects.map((p) => p.name).join(", ")}`
    : "";

  const allScores = session.evaluations.map((e) => e.evaluation.scores ?? {});
  const avgOf = (key) => {
    const vals = allScores.map((s) => s[key] ?? 0).filter((v) => v > 0);
    return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
  };

  const transcriptData = session.evaluations.map((e) => ({
    question: e.question.question,
    type: e.question.type,
    topic: e.question.topic,
    isFollowUp: e.isFollowUp,
    answer: e.answer,
    score: e.evaluation.overall,
    feedback: e.evaluation.feedback,
    what_was_good: e.evaluation.what_was_good,
    what_was_missing: e.evaluation.what_was_missing,
  }));

  const prompt = `
Generate a comprehensive technical interview debrief.

Aggregated sub-scores:
- Correctness avg: ${avgOf("correctness")}
- Depth avg: ${avgOf("depth")}
- Clarity avg: ${avgOf("clarity")}
- Structure avg: ${avgOf("structure")}

${projectCtx}
Job Description: ${session.jobDescription || "General software engineering"}
Duration: ${session.duration} min, ${session.questions.length} questions asked

Evaluations: ${JSON.stringify(transcriptData)}

Return JSON:
{
  "overall_score": <0-10>,
  "overall_grade": <"A"|"B"|"C"|"D"|"F">,
  "summary": "3-4 sentence honest performance summary",
  "skill_breakdown": {
    "technical_accuracy": <0-10>,
    "communication": <0-10>,
    "depth_of_knowledge": <0-10>,
    "problem_solving": <0-10>
  },
  "strengths": ["top 3 specific strengths with evidence"],
  "weak_areas": ["top 3 gaps with specific examples"],
  "action_items": ["Specific thing to do this week (concrete)", "...", "..."],
  "recommended_topics": [{ "topic": "string", "reason": "string", "resources": "string" }],
  "transcript": ${JSON.stringify(transcriptData)}
}
`;

  const raw = await chat(prompt, SYSTEM);
  session.report = JSON.parse(stripJson(raw));
  return session;
}
