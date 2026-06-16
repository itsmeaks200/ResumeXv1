import { chat, stripJson } from "./groq.js";

const SYSTEM = `You are an expert technical interviewer. Return structured JSON only. No markdown, no explanation.`;

export function createSession(resume, jobDescription, duration = 30) {
  return {
    resume,
    jobDescription,
    duration,
    questions: [],
    currentIndex: 0,
    currentAnswer: "",
    answers: [],
    evaluations: [],
    followUpCount: 0,
    currentFollowUp: null,
    report: null,
    nextAction: null,
  };
}

export async function generateQuestions(session, questionCount = 5) {
  const prompt = `
You are generating interview questions for a technical screen. Use only the job description to determine the role type and relevant topics. Do NOT reference the candidate's resume or personal projects.

Detect role type from the job description:
- SDE/Backend: data structures, algorithms, system design, OOP, concurrency
- Systems/Infrastructure: OS internals, networking, distributed systems, low-level programming
- Frontend: browser internals, JS runtime, rendering, state management
- Data/ML: SQL, statistics, ML concepts, data pipelines
- DevOps: containerization, CI/CD, networking, reliability

Interview duration: ${session.duration} minutes for ${questionCount} questions (~${Math.round(session.duration / questionCount)} minutes per question).

Rules:
- Questions must be abstract and universally applicable — no "tell me about a project you've done"
- For DSA: state the problem clearly like a coding interview, and include the time budget (e.g. "You have ~${Math.round(session.duration / questionCount)} minutes. Given an array of integers, find the two numbers that sum to a target. Walk through your approach and complexity.")
- For system design: use the time budget (e.g. "In ~${Math.round(session.duration / questionCount)} minutes, give a high-level design for a URL shortener. Cover the key components and data flow.")
- For concepts/OS/networking: crisp theory questions (e.g. "Explain the difference between a mutex and a semaphore")
- Include 1 behavioral question using a generic STAR prompt (e.g. "Describe a time you had to debug a hard production issue — what steps did you take?")
- Mix difficulties: roughly 30% Easy, 50% Medium, 20% Hard
- Frame every question with the time constraint so the candidate knows the expected depth

Return JSON:
{
  "role_type": "string",
  "questions": [
    { "id": 1, "type": "DSA|System Design|Behavioral|Technical|OS|Networking|ML", "question": "string", "difficulty": "Easy|Medium|Hard", "topic": "string" }
  ]
}

Job Description: ${session.jobDescription}
`;

  const raw = await chat(prompt, SYSTEM);
  const result = JSON.parse(stripJson(raw));
  session.questions = result.questions;
  session.currentIndex = 0;
  return session;
}

export async function evaluateAnswer(session) {
  const q = session.currentFollowUp ?? session.questions[session.currentIndex];

  const prompt = `
Evaluate this interview answer fairly. You are a calibrated senior engineer doing a phone screen — not a FAANG bar-raiser. Reward partial credit generously when the candidate shows genuine understanding, even if they miss details.

Scoring calibration:
- 8-10: Complete, accurate, shows depth and clear communication
- 6-7: Correct core idea, some gaps in detail or edge cases — this is a PASS for a phone screen
- 4-5: Partially correct, missing key concepts, but shows some understanding
- 2-3: Mostly wrong or confused, but attempted
- 0-1: No meaningful answer

Important: If the candidate correctly identifies the main concept and the key trade-off, score at least 6. Do not penalize for missing minor details on an Easy or Medium question.

Return JSON:
{
  "scores": { "correctness": <0-10>, "depth": <0-10>, "clarity": <0-10>, "structure": <0-10> },
  "overall": <0-10>,
  "feedback": "2-3 sentences of specific, constructive feedback — start with what they got right before noting gaps",
  "what_was_good": "string — be specific about what concept they demonstrated correctly",
  "what_was_missing": "string — the single most important gap in their answer",
  "model_answer_hints": ["3-5 concrete bullet points a complete answer would cover"]
}

Question type: ${q.type} — ${q.topic}
Question: ${q.question}
Candidate's answer: ${session.currentAnswer}
`;

  const raw = await chat(prompt, SYSTEM);
  const evaluation = JSON.parse(stripJson(raw));

  session.answers.push(session.currentAnswer);
  session.evaluations.push({ question: q, answer: session.currentAnswer, evaluation });

  const isFollowUp = session.currentFollowUp !== null;
  const weak = evaluation.overall < 6;

  if (!isFollowUp && weak && session.followUpCount < 1) {
    session.nextAction = "followup";
    session.followUpCount += 1;
  } else if (session.currentIndex + 1 >= session.questions.length) {
    session.nextAction = "done";
  } else {
    session.nextAction = "next";
  }

  session.currentFollowUp = null;
  session.currentAnswer = "";
  return { session, evaluation };
}

export async function generateFollowUp(session) {
  const lastEval = session.evaluations.at(-1);
  const original = session.questions[session.currentIndex];

  const prompt = `
The candidate gave a weak answer. Generate 1 targeted follow-up question that drills into the specific gap — keep it abstract and theoretical, not personal.

Original question: ${original.question}
What was missing from their answer: ${lastEval.evaluation.what_was_missing}

The follow-up should be a concrete, answerable question that tests the missing concept directly.

Return JSON:
{ "id": 99, "type": "${original.type}", "question": "string", "difficulty": "Medium", "topic": "${original.topic}" }
`;

  const raw = await chat(prompt, SYSTEM);
  session.currentFollowUp = JSON.parse(stripJson(raw));
  return session;
}

export function advanceQuestion(session) {
  session.currentIndex += 1;
  session.currentAnswer = "";
  session.followUpCount = 0;
  session.currentFollowUp = null;
  return session;
}

export async function generateReport(session) {
  const prompt = `
Generate a full technical interview debrief based on the candidate's performance. Be honest and precise — this is meant to help them improve.

Return JSON:
{
  "overall_score": <0-10>,
  "overall_grade": <"A"|"B"|"C"|"D"|"F">,
  "summary": "3-4 sentence honest performance summary — what they showed and where they fell short",
  "strengths": ["top 3 specific things they did well, with evidence from their answers"],
  "weak_areas": ["top 3 specific concept gaps revealed by their answers"],
  "recommended_topics": [
    { "topic": "string", "reason": "why this gap was exposed", "resources": "specific things to study (book chapters, leetcode tags, system design topics)" }
  ],
  "transcript": [{ "question": "string", "answer": "string", "score": <0-10> }]
}

Questions asked: ${JSON.stringify(session.questions)}
Candidate answers: ${JSON.stringify(session.answers)}
Evaluations: ${JSON.stringify(session.evaluations.map(e => e.evaluation))}
`;

  const raw = await chat(prompt, SYSTEM);
  session.report = JSON.parse(stripJson(raw));
  return session;
}
