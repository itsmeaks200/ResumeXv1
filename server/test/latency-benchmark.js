// ─────────────────────────────────────────────────────────────────────────────
// Latency Benchmark — Measures P50/P95/mean for all GenAI pipeline stages
//
// Run:   node test/latency-benchmark.js
//
// Requires: GROQ_API_KEY in ../.env
// Does NOT require MongoDB (standalone benchmark)
// ─────────────────────────────────────────────────────────────────────────────

import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import { chat, stripJson } from "../services/groq.js";
import { synthesize } from "../services/tts.js";
import { metrics } from "../services/metrics.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * (p / 100));
  return sorted[Math.min(idx, sorted.length - 1)];
}

function stats(arr) {
  const n = arr.length;
  const mean = Math.round(arr.reduce((a, b) => a + b, 0) / n);
  return {
    n,
    mean,
    p50: percentile(arr, 50),
    p95: percentile(arr, 95),
    min: Math.min(...arr),
    max: Math.max(...arr),
  };
}

function printStats(label, s) {
  console.log(`  ${label.padEnd(28)} │ n=${String(s.n).padStart(3)} │ mean=${String(s.mean).padStart(5)}ms │ p50=${String(s.p50).padStart(5)}ms │ p95=${String(s.p95).padStart(5)}ms │ range=[${s.min}-${s.max}ms]`);
}

// ── Benchmarks ───────────────────────────────────────────────────────────────

const SYSTEM = "You are a strict ATS scoring engine. Return structured JSON only.";

async function benchmarkLLMChat(n = 10) {
  console.log(`\n📊 LLM Chat (llama-3.3-70b) — ${n} calls`);
  const times = [];

  for (let i = 0; i < n; i++) {
    const start = performance.now();
    await chat(
      `Score this resume. Return JSON: { "score": 50, "grade": "C", "summary": "test" }`,
      SYSTEM,
    );
    const duration = Math.round(performance.now() - start);
    times.push(duration);
    process.stdout.write(`  [${i + 1}/${n}] ${duration}ms\r`);
  }

  printStats("LLM Chat", stats(times));
  return times;
}

async function benchmarkLLMEvaluation(n = 5) {
  console.log(`\n📊 LLM Evaluation prompt — ${n} calls`);
  const evalSystem = "You are an expert technical interviewer. Return structured JSON only. No markdown.";
  const evalPrompt = `
Evaluate this interview answer fairly.

Scoring: 8-10: Complete, accurate. 6-7: Correct core idea. 4-5: Partially correct. 2-3: Mostly wrong. 0-1: No meaningful answer.

Return JSON:
{
  "scores": { "correctness": 7, "depth": 6, "clarity": 7, "structure": 6 },
  "overall": 7,
  "feedback": "Good understanding of hash maps",
  "what_was_good": "Correct time complexity",
  "what_was_missing": "Did not discuss collision handling",
  "model_answer_hints": ["hash function", "collision resolution", "load factor"]
}

Question (DSA / Hash Maps): Explain how a hash map works internally.
Answer: A hash map uses a hash function to map keys to indices in an array. When you insert a key-value pair, the key is hashed to find the bucket. Lookup is O(1) on average because you go directly to the bucket.
`;

  const times = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    const raw = await chat(evalPrompt, evalSystem);
    try { JSON.parse(stripJson(raw)); } catch { /* ignore */ }
    const duration = Math.round(performance.now() - start);
    times.push(duration);
    process.stdout.write(`  [${i + 1}/${n}] ${duration}ms\r`);
  }

  printStats("LLM Evaluation", stats(times));
  return times;
}

async function benchmarkQuestionGeneration(n = 5) {
  console.log(`\n📊 LLM Question Generation — ${n} calls`);
  const system = "You are an expert technical interviewer. Return structured JSON only.";
  const prompt = `
Generate a single technical interview question for a full-stack developer role.

Return JSON:
{ "id": 1, "type": "Technical", "question": "string", "difficulty": "Medium", "topic": "string" }
`;

  const times = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    await chat(prompt, system);
    const duration = Math.round(performance.now() - start);
    times.push(duration);
    process.stdout.write(`  [${i + 1}/${n}] ${duration}ms\r`);
  }

  printStats("Question Generation", stats(times));
  return times;
}

async function benchmarkTTS(n = 5) {
  console.log(`\n📊 TTS Synthesis — ${n} calls`);
  const texts = [
    "Hello, welcome to the interview. Tell me about yourself and what you've been building lately.",
    "That's a great project. Can you walk me through the architecture decisions you made?",
    "Interesting approach. How would that scale to handle ten thousand concurrent users?",
    "Let's move on to a technical question. Explain how a hash map handles collisions.",
    "Great job today. I'll compile your feedback and send over the report shortly.",
  ];

  const times = [];
  for (let i = 0; i < n; i++) {
    const text = texts[i % texts.length];
    const start = performance.now();
    const result = await synthesize(text);
    const duration = Math.round(performance.now() - start);
    const provider = result ? "success" : "null";
    times.push(duration);
    process.stdout.write(`  [${i + 1}/${n}] ${duration}ms (${provider})\r`);
  }

  printStats("TTS Synthesis", stats(times));
  return times;
}

async function benchmarkReportGeneration(n = 3) {
  console.log(`\n📊 LLM Report Generation — ${n} calls`);
  const system = "You are an expert technical interviewer. Return structured JSON only.";
  const prompt = `
Generate a comprehensive technical interview debrief.

Aggregated sub-scores: Correctness avg: 6.5, Depth avg: 5.8, Clarity avg: 7.0, Structure avg: 6.2

Job Description: Full-stack developer with React and Node.js experience
Duration: 30 min, 5 questions asked

Evaluations: [{"question":"Explain React hooks","type":"Technical","topic":"React","answer":"Hooks let you use state in functional components","score":7,"feedback":"Good basics"},{"question":"Design a URL shortener","type":"System Design","topic":"System Design","answer":"I would use a hash function to generate short codes","score":5,"feedback":"Missing database and scaling"}]

Return JSON:
{
  "overall_score": 6,
  "overall_grade": "B",
  "summary": "Solid fundamentals but lacks depth in system design",
  "skill_breakdown": { "technical_accuracy": 6, "communication": 7, "depth_of_knowledge": 5, "problem_solving": 6 },
  "strengths": ["Good understanding of React fundamentals"],
  "weak_areas": ["System design lacks detail"],
  "action_items": ["Practice system design problems"],
  "recommended_topics": [{"topic": "System Design", "reason": "Weak area", "resources": "Grokking System Design"}],
  "transcript": []
}
`;

  const times = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    await chat(prompt, system);
    const duration = Math.round(performance.now() - start);
    times.push(duration);
    process.stdout.write(`  [${i + 1}/${n}] ${duration}ms\r`);
  }

  printStats("Report Generation", stats(times));
  return times;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║          ResumeX — GenAI Pipeline Latency Benchmark         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nTimestamp: ${new Date().toISOString()}`);
  console.log(`Model: llama-3.3-70b-versatile (via Groq)`);
  console.log(`TTS: Groq Orpheus`);

  const results = {};

  try {
    results.llmChat = stats(await benchmarkLLMChat(10));
  } catch (err) {
    console.error("  ❌ LLM Chat failed:", err.message);
  }

  try {
    results.llmEvaluation = stats(await benchmarkLLMEvaluation(5));
  } catch (err) {
    console.error("  ❌ LLM Evaluation failed:", err.message);
  }

  try {
    results.questionGen = stats(await benchmarkQuestionGeneration(5));
  } catch (err) {
    console.error("  ❌ Question Generation failed:", err.message);
  }

  try {
    results.tts = stats(await benchmarkTTS(5));
  } catch (err) {
    console.error("  ❌ TTS failed:", err.message);
  }

  try {
    results.reportGen = stats(await benchmarkReportGeneration(3));
  } catch (err) {
    console.error("  ❌ Report Generation failed:", err.message);
  }

  // Summary
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                        SUMMARY                             ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  for (const [name, s] of Object.entries(results)) {
    printStats(name, s);
  }
  console.log("╚══════════════════════════════════════════════════════════════╝");

  // Metrics system summary
  console.log("\n📈 Metrics system captured:");
  console.log(JSON.stringify(metrics.getSummary(), null, 2));
}

main().catch(console.error);
