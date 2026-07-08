// ─────────────────────────────────────────────────────────────────────────────
// JSON Reliability Test — Measures the JSON parse success rate of LLM responses
// across different prompt strategies.
//
// Run:   node test/json-reliability.js
//
// Tests three configurations:
//   1. JSON mode ON  + stripJson (current production setup)
//   2. JSON mode OFF + stripJson (pre-optimization baseline)
//   3. JSON mode OFF + NO stripJson (raw baseline)
//
// Requires: GROQ_API_KEY in ../.env
// Does NOT require MongoDB
// ─────────────────────────────────────────────────────────────────────────────

import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import Groq from "groq-sdk";
import { stripJson } from "../services/groq.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = "llama-3.3-70b-versatile";
const SYSTEM = "You are a strict ATS scoring engine. Return structured JSON only. No markdown, no explanation.";

// Diverse prompts to stress-test JSON output
const TEST_PROMPTS = [
  // Simple
  `Return a JSON object with a single key "score" set to 42.`,

  // Medium — realistic eval prompt
  `Evaluate this answer. Question: "What is a hash map?" Answer: "It's a data structure that maps keys to values using a hash function."
Return JSON: { "scores": { "correctness": 8, "depth": 5, "clarity": 7 }, "overall": 7, "feedback": "Good basic understanding" }`,

  // Complex — long structured output
  `Score this resume against the JD. Resume has Python, React, Docker. JD requires Python, React, Docker, Kubernetes, AWS, PostgreSQL.
Return JSON:
{
  "score": 55,
  "grade": "C",
  "summary": "Partial match — missing cloud and database skills",
  "matched_keywords": ["Python", "React", "Docker"],
  "missing_keywords": ["Kubernetes", "AWS", "PostgreSQL"],
  "section_scores": { "skills": 60, "experience": 50, "projects": 45, "education": 70 },
  "suggestions": [{ "section": "skills", "issue": "Missing cloud", "fix": "Add AWS" }]
}`,

  // Edge case — asks for nested JSON with arrays
  `Generate an interview question.
Return JSON: { "id": 1, "type": "Technical", "question": "Explain event-driven architecture", "difficulty": "Medium", "topic": "System Design" }`,

  // Edge case — report-style (largest output)
  `Generate a brief interview report.
Return JSON:
{
  "overall_score": 6,
  "overall_grade": "B",
  "summary": "Solid fundamentals",
  "skill_breakdown": { "technical_accuracy": 6, "communication": 7, "depth_of_knowledge": 5, "problem_solving": 6 },
  "strengths": ["Clear communication"],
  "weak_areas": ["Shallow depth"],
  "action_items": ["Study system design"],
  "recommended_topics": [{ "topic": "System Design", "reason": "Weak area", "resources": "Book" }]
}`,
];

// ── Test Runners ─────────────────────────────────────────────────────────────

async function testWithJsonMode(prompt, system) {
  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });
  const raw = response.choices[0].message.content.trim();
  return JSON.parse(stripJson(raw));
}

async function testWithStripJsonOnly(prompt, system) {
  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    // NO response_format — LLM may wrap in markdown fences
  });
  const raw = response.choices[0].message.content.trim();
  return JSON.parse(stripJson(raw));
}

async function testRawBaseline(prompt, system) {
  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    // NO response_format, NO stripJson
  });
  const raw = response.choices[0].message.content.trim();
  return JSON.parse(raw); // Direct parse — will fail if markdown-wrapped
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runConfig(name, testFn, runsPerPrompt = 5) {
  let success = 0;
  let fail = 0;
  const failures = [];
  const total = TEST_PROMPTS.length * runsPerPrompt;

  for (let pi = 0; pi < TEST_PROMPTS.length; pi++) {
    const prompt = TEST_PROMPTS[pi];
    for (let r = 0; r < runsPerPrompt; r++) {
      try {
        await testFn(prompt, SYSTEM);
        success++;
      } catch (err) {
        fail++;
        failures.push({ prompt: pi, run: r, error: err.message.slice(0, 100) });
      }
      process.stdout.write(`  ${name}: [${success + fail}/${total}]\r`);
    }
  }

  return { name, total, success, fail, rate: +((success / total) * 100).toFixed(1), failures };
}

async function main() {
  const RUNS = 5;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║        ResumeX — JSON Parse Reliability Test                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nTimestamp: ${new Date().toISOString()}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Prompts: ${TEST_PROMPTS.length} × ${RUNS} runs each = ${TEST_PROMPTS.length * RUNS} total per config\n`);

  const configs = [
    { name: "JSON mode + stripJson (prod)", fn: testWithJsonMode },
    { name: "stripJson only (baseline)", fn: testWithStripJsonOnly },
    { name: "Raw parse (no safety)", fn: testRawBaseline },
  ];

  const results = [];
  for (const config of configs) {
    console.log(`\n🔬 Testing: ${config.name}`);
    const result = await runConfig(config.name, config.fn, RUNS);
    results.push(result);
    console.log(`   ${result.rate}% success (${result.success}/${result.total})`);
    if (result.failures.length > 0) {
      console.log(`   Failures:`);
      for (const f of result.failures.slice(0, 5)) {
        console.log(`     Prompt #${f.prompt}, run ${f.run}: ${f.error}`);
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                 RELIABILITY COMPARISON                      ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("  ┌──────────────────────────────────┬──────────┬────────────┐");
  console.log("  │ Configuration                    │ Success  │   Rate     │");
  console.log("  ├──────────────────────────────────┼──────────┼────────────┤");
  for (const r of results) {
    const bar = "█".repeat(Math.round(r.rate / 5)) + "░".repeat(20 - Math.round(r.rate / 5));
    console.log(`  │ ${r.name.padEnd(32)} │ ${String(r.success).padStart(3)}/${String(r.total).padStart(3)}  │ ${String(r.rate).padStart(5)}% ${bar.slice(0, 5)}│`);
  }
  console.log("  └──────────────────────────────────┴──────────┴────────────┘");

  // Calculate improvement
  const prodRate = results[0]?.rate ?? 0;
  const rawRate = results[2]?.rate ?? 0;
  if (rawRate > 0 && rawRate < 100) {
    const improvement = ((prodRate - rawRate) / (100 - rawRate) * 100).toFixed(0);
    console.log(`\n  ✨ JSON mode + stripJson reduces failures by ${improvement}% vs raw parsing`);
  }

  console.log("\n╚══════════════════════════════════════════════════════════════╝");
}

main().catch(console.error);
