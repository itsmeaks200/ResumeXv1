// ─────────────────────────────────────────────────────────────────────────────
// ATS Calibration Test — Validates that the ATS scoring pipeline produces
// calibrated, consistent scores across known resume-JD pairs.
//
// Run:   node test/ats-calibration.js
//
// What it measures:
//   1. Score distribution: Are scores in the expected range for each test case?
//   2. Consistency (σ): Is the standard deviation low enough across repeated runs?
//   3. Keyword extraction: Are matched/missing keywords correct?
//   4. Grade calibration: Does the letter grade match the numeric score?
//
// Requires: GROQ_API_KEY in ../.env
// Does NOT require MongoDB
// ─────────────────────────────────────────────────────────────────────────────

import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import { chat, stripJson } from "../services/groq.js";

// ── Test Cases ───────────────────────────────────────────────────────────────

const JD_FULLSTACK = `
Full-Stack Software Engineer — FinTech Startup

Requirements:
- 3+ years experience with React.js and Node.js
- Strong proficiency in TypeScript
- Experience with PostgreSQL and Redis
- Familiarity with AWS (EC2, S3, Lambda)
- Knowledge of CI/CD pipelines (GitHub Actions, Jenkins)
- Experience with Docker and Kubernetes
- Understanding of RESTful APIs and GraphQL
- Strong problem-solving skills and attention to detail

Nice-to-have:
- Experience with Python for data pipelines
- Knowledge of Kafka or RabbitMQ
- Previous FinTech or payments experience
`;

const TEST_CASES = [
  {
    name: "PERFECT_MATCH",
    description: "Resume that closely mirrors the JD",
    expectedRange: [78, 98],
    expectedGrades: ["A"],
    resume: {
      name: "Alice Chen",
      skills: {
        languages: ["JavaScript", "TypeScript", "Python", "SQL"],
        frameworks: ["React.js", "Node.js", "Express", "Next.js", "GraphQL"],
        tools: ["Docker", "Kubernetes", "GitHub Actions", "Jenkins", "AWS"],
        databases: ["PostgreSQL", "Redis", "MongoDB"],
        other: ["CI/CD", "REST APIs", "Kafka"],
      },
      experience: [
        {
          company: "FinPay Inc.",
          role: "Senior Full-Stack Engineer",
          start_date: "2021",
          end_date: null,
          bullets: [
            "Built React.js + Node.js microservices handling $2M daily transactions",
            "Designed PostgreSQL schema with Redis caching, reducing query latency by 60%",
            "Deployed on AWS EC2 with Docker/Kubernetes, managed CI/CD via GitHub Actions",
            "Implemented GraphQL API layer replacing legacy REST endpoints",
          ],
        },
      ],
      projects: [
        {
          name: "PayFlow Dashboard",
          description: "Real-time payments monitoring dashboard",
          tech_stack: ["React", "TypeScript", "Node.js", "PostgreSQL", "Redis", "AWS Lambda", "Kafka"],
        },
      ],
      education: [{ institution: "MIT", degree: "BS", field: "Computer Science" }],
    },
  },
  {
    name: "STRONG_MATCH",
    description: "Strong but imperfect — missing some JD requirements",
    expectedRange: [58, 80],
    expectedGrades: ["B", "C"],
    resume: {
      name: "Bob Martinez",
      skills: {
        languages: ["JavaScript", "TypeScript", "Python"],
        frameworks: ["React.js", "Node.js", "Express"],
        tools: ["Docker", "GitHub Actions", "AWS S3"],
        databases: ["PostgreSQL", "MongoDB"],
        other: ["REST APIs"],
      },
      experience: [
        {
          company: "WebCorp",
          role: "Full-Stack Developer",
          start_date: "2022",
          end_date: null,
          bullets: [
            "Developed React.js frontends with TypeScript",
            "Built Node.js REST APIs with PostgreSQL",
            "Containerized services with Docker",
            "Managed deployments on AWS S3 and EC2",
          ],
        },
      ],
      projects: [],
      education: [{ institution: "State University", degree: "BS", field: "Software Engineering" }],
    },
    expectedMissing: ["Kubernetes", "Redis", "GraphQL", "Kafka"],
  },
  {
    name: "MODERATE_MATCH",
    description: "Partial overlap — frontend dev applying for full-stack",
    expectedRange: [38, 62],
    expectedGrades: ["C", "D"],
    resume: {
      name: "Carol Davis",
      skills: {
        languages: ["JavaScript", "HTML", "CSS"],
        frameworks: ["React.js", "Vue.js", "Tailwind CSS"],
        tools: ["Git", "Figma", "Webpack"],
        databases: [],
        other: ["Responsive Design", "Accessibility"],
      },
      experience: [
        {
          company: "DesignStudio",
          role: "Frontend Developer",
          start_date: "2023",
          end_date: null,
          bullets: [
            "Built responsive React.js interfaces",
            "Implemented design systems with Tailwind CSS",
            "No backend or database experience",
          ],
        },
      ],
      projects: [],
      education: [{ institution: "Community College", degree: "AS", field: "Web Development" }],
    },
  },
  {
    name: "POOR_MATCH",
    description: "Backend ML engineer applying for full-stack React role",
    expectedRange: [20, 45],
    expectedGrades: ["D", "F"],
    resume: {
      name: "Dave Kim",
      skills: {
        languages: ["Python", "R", "Julia", "MATLAB"],
        frameworks: ["TensorFlow", "PyTorch", "scikit-learn", "Flask"],
        tools: ["Jupyter", "MLflow", "Weights & Biases"],
        databases: ["BigQuery"],
        other: ["Machine Learning", "Deep Learning", "Computer Vision"],
      },
      experience: [
        {
          company: "AI Research Lab",
          role: "ML Engineer",
          start_date: "2020",
          end_date: null,
          bullets: [
            "Trained computer vision models with PyTorch",
            "Built ML pipelines with scikit-learn",
            "Deployed models with Flask APIs",
            "No React, Node.js, or frontend experience",
          ],
        },
      ],
      projects: [],
      education: [{ institution: "Stanford", degree: "MS", field: "Machine Learning" }],
    },
  },
  {
    name: "EMPTY_RESUME",
    description: "Minimal / empty resume",
    expectedRange: [5, 30],
    expectedGrades: ["F"],
    resume: {
      name: "Test User",
      skills: { languages: [], frameworks: [], tools: [], databases: [], other: [] },
      experience: [],
      projects: [],
      education: [],
    },
  },
];

// ── ATS Prompt (same as production) ──────────────────────────────────────────

const SYSTEM = "You are a strict ATS scoring engine used by top companies. Return structured JSON only. No markdown, no explanation.";

function buildPrompt(resume, jd) {
  return `
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
  "summary": "2-3 sentence honest assessment",
  "matched_keywords": ["keywords explicitly present in both"],
  "missing_keywords": ["important JD keywords absent from resume"],
  "section_scores": { "skills": <0-100>, "experience": <0-100>, "projects": <0-100>, "education": <0-100> },
  "suggestions": [{ "section": "string", "issue": "string", "fix": "string" }]
}

Job Description: ${jd}
Resume: ${JSON.stringify(resume, null, 2)}
`;
}

// ── Runner ────────────────────────────────────────────────────────────────────

function gradeFromScore(score) {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

async function runTest(testCase, runsPerCase = 5) {
  const scores = [];
  const grades = [];
  const parseFailures = [];
  const allMatched = [];
  const allMissing = [];

  for (let i = 0; i < runsPerCase; i++) {
    try {
      const raw = await chat(buildPrompt(testCase.resume, JD_FULLSTACK), SYSTEM);
      const result = JSON.parse(stripJson(raw));
      scores.push(result.score);
      grades.push(result.grade);
      if (result.matched_keywords) allMatched.push(...result.matched_keywords);
      if (result.missing_keywords) allMissing.push(...result.missing_keywords);
    } catch (err) {
      parseFailures.push(err.message);
    }
    process.stdout.write(`  [${i + 1}/${runsPerCase}]\r`);
  }

  const n = scores.length;
  const mean = n ? Math.round(scores.reduce((a, b) => a + b, 0) / n) : 0;
  const std = n ? Math.round(Math.sqrt(scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / n)) : 0;
  const min = n ? Math.min(...scores) : 0;
  const max = n ? Math.max(...scores) : 0;

  // Deduplicate keywords
  const uniqueMatched = [...new Set(allMatched.map((k) => k.toLowerCase()))];
  const uniqueMissing = [...new Set(allMissing.map((k) => k.toLowerCase()))];

  // Grade consistency
  const expectedGrade = gradeFromScore(mean);
  const gradeConsistency = grades.filter((g) => testCase.expectedGrades.includes(g)).length / grades.length;

  // Score in expected range?
  const inRange = mean >= testCase.expectedRange[0] && mean <= testCase.expectedRange[1];

  return {
    name: testCase.name,
    description: testCase.description,
    scores,
    mean,
    std,
    min,
    max,
    expectedRange: testCase.expectedRange,
    inRange,
    grades,
    gradeConsistency: Math.round(gradeConsistency * 100),
    parseFailures: parseFailures.length,
    matchedKeywords: uniqueMatched.slice(0, 10),
    missingKeywords: uniqueMissing.slice(0, 10),
  };
}

async function main() {
  const RUNS_PER_CASE = 5;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║         ResumeX — ATS Scoring Calibration Test              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nTimestamp: ${new Date().toISOString()}`);
  console.log(`Runs per case: ${RUNS_PER_CASE}`);
  console.log(`Job Description: Full-Stack FinTech role\n`);

  const results = [];

  for (const tc of TEST_CASES) {
    console.log(`\n🔍 ${tc.name}: ${tc.description}`);
    console.log(`   Expected score range: [${tc.expectedRange[0]}-${tc.expectedRange[1]}]`);
    const result = await runTest(tc, RUNS_PER_CASE);
    results.push(result);

    const status = result.inRange ? "✅ PASS" : "❌ FAIL";
    console.log(`   ${status} │ mean=${result.mean} │ σ=${result.std} │ range=[${result.min}-${result.max}] │ grades=${result.grades.join(",")}`);
    if (result.parseFailures > 0) {
      console.log(`   ⚠️  JSON parse failures: ${result.parseFailures}/${RUNS_PER_CASE}`);
    }
    if (result.matchedKeywords.length) {
      console.log(`   Matched: ${result.matchedKeywords.join(", ")}`);
    }
    if (result.missingKeywords.length) {
      console.log(`   Missing: ${result.missingKeywords.join(", ")}`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    CALIBRATION SUMMARY                      ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");

  const totalPassed = results.filter((r) => r.inRange).length;
  const avgStd = Math.round(results.reduce((s, r) => s + r.std, 0) / results.length);
  const totalParseFailures = results.reduce((s, r) => s + r.parseFailures, 0);
  const totalRuns = results.length * RUNS_PER_CASE;

  console.log(`  Score range accuracy:    ${totalPassed}/${results.length} test cases in expected range`);
  console.log(`  Average σ across cases:  ${avgStd} (target: < 10)`);
  console.log(`  JSON parse reliability:  ${totalRuns - totalParseFailures}/${totalRuns} (${((1 - totalParseFailures / totalRuns) * 100).toFixed(1)}%)`);
  console.log(`  Grade consistency:       ${results.map((r) => `${r.name}=${r.gradeConsistency}%`).join(", ")}`);

  // Score distribution table
  console.log("\n  Score Distribution:");
  console.log("  ┌──────────────────┬────────┬──────────────┬────────┬────────┐");
  console.log("  │ Test Case        │  Mean  │  Expected    │   σ    │ Status │");
  console.log("  ├──────────────────┼────────┼──────────────┼────────┼────────┤");
  for (const r of results) {
    const status = r.inRange ? " ✅  " : " ❌  ";
    console.log(`  │ ${r.name.padEnd(16)} │ ${String(r.mean).padStart(5)}  │ [${String(r.expectedRange[0]).padStart(2)}-${String(r.expectedRange[1]).padStart(2)}]       │ ${String(r.std).padStart(5)}  │${status}│`);
  }
  console.log("  └──────────────────┴────────┴──────────────┴────────┴────────┘");

  console.log("\n╚══════════════════════════════════════════════════════════════╝");
}

main().catch(console.error);
