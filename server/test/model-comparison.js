// ─────────────────────────────────────────────────────────────────────────────
// Model Comparison Test — A/B test different LLM models for evaluation quality
// and latency to find the best model for each pipeline stage.
//
// Run:   node test/model-comparison.js
//
// Compares models on:
//   1. Latency (P50/P95)
//   2. Score consistency (σ across repeated runs)
//   3. JSON reliability (parse success rate)
//   4. Response quality (subjective — logged for review)
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

// ── Models to compare ────────────────────────────────────────────────────────
// Check available models at https://console.groq.com/docs/models

const MODELS = [
  "llama-3.3-70b-versatile",         // Current production model
  "llama-3.1-70b-versatile",         // Previous gen — possibly faster
  "llama-3.1-8b-instant",            // Smallest — fast but less accurate
  "mixtral-8x7b-32768",              // MoE model — good for structured output
  "gemma2-9b-it",                    // Google's model — instruction-tuned
];

// ── Test scenario: ATS evaluation ────────────────────────────────────────────

const SYSTEM = "You are a strict ATS scoring engine used by top companies. Return structured JSON only. No markdown, no explanation.";

const EVAL_PROMPT = `
You are a strict ATS scanner. Score this resume against the job description with calibrated honesty.

Scoring rules:
- Missing critical keywords: −3 to −6 each
- Grade: A=80+, B=65-79, C=50-64, D=35-49, F=below 35

Return JSON:
{
  "score": <0-100>,
  "grade": <"A"|"B"|"C"|"D"|"F">,
  "summary": "2 sentence assessment",
  "matched_keywords": ["list"],
  "missing_keywords": ["list"]
}

Job Description: Full-Stack Engineer — React, Node.js, TypeScript, PostgreSQL, AWS, Docker, Kubernetes required.
Resume: { "name": "Test Dev", "skills": { "languages": ["JavaScript", "Python"], "frameworks": ["React", "Node.js"], "tools": ["Docker"], "databases": ["MongoDB"] } }
`;

// ── Runner ────────────────────────────────────────────────────────────────────

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * (p / 100))];
}

async function testModel(model, runsPerPrompt = 8) {
  const times = [];
  const scores = [];
  let jsonSuccess = 0;
  let jsonFail = 0;
  const errors = [];

  for (let i = 0; i < runsPerPrompt; i++) {
    const start = performance.now();
    try {
      const response = await groq.chat.completions.create({
        model,
        max_tokens: 2048,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: EVAL_PROMPT },
        ],
        response_format: { type: "json_object" },
      });

      const duration = Math.round(performance.now() - start);
      times.push(duration);

      const raw = response.choices[0].message.content.trim();
      const parsed = JSON.parse(stripJson(raw));
      jsonSuccess++;

      if (typeof parsed.score === "number") {
        scores.push(parsed.score);
      }

      const tokens = response.usage?.total_tokens ?? 0;
      process.stdout.write(`  [${i + 1}/${runsPerPrompt}] ${duration}ms, score=${parsed.score ?? "?"}, tokens=${tokens}\r`);
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      times.push(duration);
      jsonFail++;
      errors.push(err.message.slice(0, 80));
      process.stdout.write(`  [${i + 1}/${runsPerPrompt}] ${duration}ms ❌\r`);
    }
  }

  const n = times.length;
  const meanLatency = n ? Math.round(times.reduce((a, b) => a + b, 0) / n) : 0;
  const meanScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const stdScore = scores.length > 1
    ? Math.round(Math.sqrt(scores.reduce((s, v) => s + (v - meanScore) ** 2, 0) / scores.length))
    : 0;

  return {
    model,
    runs: runsPerPrompt,
    latency: {
      mean: meanLatency,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      min: Math.min(...times),
      max: Math.max(...times),
    },
    scores: {
      values: scores,
      mean: meanScore,
      std: stdScore,
      min: scores.length ? Math.min(...scores) : null,
      max: scores.length ? Math.max(...scores) : null,
    },
    json: {
      success: jsonSuccess,
      fail: jsonFail,
      rate: +((jsonSuccess / (jsonSuccess + jsonFail)) * 100).toFixed(1),
    },
    errors: errors.slice(0, 3),
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const RUNS = 8;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║          ResumeX — Model Comparison A/B Test                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nTimestamp: ${new Date().toISOString()}`);
  console.log(`Runs per model: ${RUNS}`);
  console.log(`Task: ATS scoring (same resume-JD pair)`);
  console.log(`Expected score: ~45-60 (moderate match — has React/Node, missing TS/PG/K8s/AWS)\n`);

  const results = [];

  for (const model of MODELS) {
    console.log(`\n🔬 Testing: ${model}`);
    try {
      const result = await testModel(model, RUNS);
      results.push(result);
      console.log(`   Latency: mean=${result.latency.mean}ms, p50=${result.latency.p50}ms, p95=${result.latency.p95}ms`);
      console.log(`   Scores:  mean=${result.scores.mean}, σ=${result.scores.std}, range=[${result.scores.min}-${result.scores.max}]`);
      console.log(`   JSON:    ${result.json.rate}% success (${result.json.success}/${result.runs})`);
      if (result.errors.length) console.log(`   Errors:  ${result.errors[0]}`);
    } catch (err) {
      console.log(`   ❌ Model unavailable: ${err.message.slice(0, 100)}`);
      results.push({ model, error: err.message });
    }
  }

  // ── Comparison Table ───────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                          MODEL COMPARISON                                  ║");
  console.log("╠══════════════════════════════════════════════════════════════════════════════╣");
  console.log("  ┌──────────────────────────────┬────────┬────────┬────────┬───────┬────────┐");
  console.log("  │ Model                        │ P50 ms │ P95 ms │ Score  │   σ   │ JSON%  │");
  console.log("  ├──────────────────────────────┼────────┼────────┼────────┼───────┼────────┤");

  for (const r of results) {
    if (r.error) {
      console.log(`  │ ${r.model.padEnd(28)} │  ERR   │  ERR   │  ERR   │  ERR  │  ERR   │`);
      continue;
    }
    const highlight = r.model === "llama-3.3-70b-versatile" ? " ★" : "  ";
    console.log(`  │ ${(r.model + highlight).padEnd(28)} │ ${String(r.latency.p50).padStart(5)}  │ ${String(r.latency.p95).padStart(5)}  │ ${String(r.scores.mean ?? "N/A").padStart(5)}  │ ${String(r.scores.std).padStart(4)}  │ ${String(r.json.rate).padStart(5)}% │`);
  }

  console.log("  └──────────────────────────────┴────────┴────────┴────────┴───────┴────────┘");
  console.log("  ★ = current production model\n");

  // ── Recommendations ────────────────────────────────────────────────────────
  const valid = results.filter((r) => !r.error && r.scores?.mean != null);
  if (valid.length > 0) {
    const fastest = valid.reduce((a, b) => (a.latency.p50 < b.latency.p50 ? a : b));
    const mostConsistent = valid.reduce((a, b) => (a.scores.std < b.scores.std ? a : b));
    const mostReliable = valid.reduce((a, b) => (a.json.rate > b.json.rate ? a : b));

    console.log("  🏆 Recommendations:");
    console.log(`     Fastest:         ${fastest.model} (p50=${fastest.latency.p50}ms)`);
    console.log(`     Most Consistent: ${mostConsistent.model} (σ=${mostConsistent.scores.std})`);
    console.log(`     Most Reliable:   ${mostReliable.model} (${mostReliable.json.rate}% JSON success)`);
  }

  console.log("\n╚══════════════════════════════════════════════════════════════════════════════╝");
}

main().catch(console.error);
