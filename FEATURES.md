# ResumeX — Feature Brainstorm

## Core Problem
Job seekers have no way to objectively evaluate how well their resume matches a role,
or to practice interviews tailored to that specific role and their own background.

---

## Feature Areas

### 1. Resume Parsing
- Upload resume as PDF or DOCX
- Extract structured data: skills, experience, education, projects, certifications
- Identify years of experience per skill/domain
- Normalize skill aliases (e.g. "JS" → "JavaScript", "ML" → "Machine Learning")

### 2. Job Description Analysis
- Paste raw JD text
- Extract: required skills, preferred skills, responsibilities, seniority level
- Auto-detect role type (SDE, Systems, Data, PM, DevOps, etc.)
- Identify must-have vs nice-to-have requirements

### 3. ATS Scoring Engine
- Keyword match score (hard skills, tools, technologies)
- Semantic similarity score (meaning-based, not just exact match)
- Section-level breakdown: Skills, Experience, Projects, Education
- Missing keywords report with priority ranking
- Matched keywords highlighted with resume location
- Overall ATS score (0–100) with letter grade

### 4. Resume Gap Analysis
- Skills present in JD but missing from resume
- Experience gaps (e.g. JD asks 2 years Python, resume shows 6 months)
- Suggested bullet point rewrites to better align with JD language
- Recommended projects or certifications to fill gaps

### 5. Mock Interview
- Generate a role-specific interview round based on JD + resume
- Question categories auto-selected by role type:
  - SDE: DSA problems, system design, OOP, debugging
  - Systems: OS concepts, networking, low-level C/C++, concurrency
  - Data: SQL, statistics, ML concepts, case studies
  - Behavioral: STAR-format questions drawn from resume experience
- Configurable round length (5 / 10 / 15 questions)
- Text-based answer input (voice stretch goal)

### 6. Interview Answer Evaluation
- Per-answer scoring: correctness, depth, clarity, structure
- What a strong answer would include (model answer hints)
- Keyword coverage (did you mention the right concepts?)
- Overall round score + performance summary
- Weak areas flagged for follow-up study

### 7. Dashboard
- History of resume + JD pairs analyzed
- ATS score trend over time (as resume improves)
- Interview session history with scores
- Skill gap tracker (what you've improved vs still missing)

### 8. Report Export
- Download ATS report as PDF
- Download interview feedback summary
- Shareable link to session results (stretch)

---

## Stretch Features (Post-MVP)
- Side-by-side resume editor with live ATS re-scoring
- Multiple resume versions — compare which scores higher for a given JD
- Company-specific insights (pulled from public interview databases)
- Cold email / cover letter generator tailored to JD
- LinkedIn profile analyzer (import instead of PDF upload)
- Browser extension to analyze JDs directly on job boards

---

## Non-Goals (explicitly out of scope)
- Auto-applying to jobs
- Resume builder / template generator
- Job board / aggregator
- Recruiter-facing product

---

## MVP Cut Line
**In MVP:**
- Resume upload (PDF)
- JD paste + analysis
- ATS score with keyword breakdown
- Mock interview generation + answer evaluation

**Post-MVP:**
- Dashboard + history
- Gap analysis with rewrite suggestions
- DOCX support
- Export / share
