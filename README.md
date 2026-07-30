# ResumeX

> AI-powered resume analysis and mock interview platform built with React + Express.

---

## Features

- **Resume Parsing** — Upload a PDF resume and extract structured data automatically
- **AI Analysis** — Get an ATS score, skill gap analysis, and improvement suggestions powered by Groq
- **GitHub Integration** — Optionally link a GitHub account to enrich project context
- **Mock Interviews** — Voice-only AI interview over WebSocket. Questions are generated live from your resume, GitHub-enriched project data, and the job description — not scripted: a warmup, a deep dive into a real project by name/tech stack, and reasoning-focused technical questions ("why X over Y") grounded in what you actually built, with up to 2 follow-up probes per question. Pacing is driven by elapsed time against your chosen duration (not a fixed question count), spoken via Groq TTS, answers captured push-to-talk and transcribed server-side with Whisper
- **Interview Reports** — Post-interview scoring and detailed feedback, saved to your account
- **Auth** — JWT-based registration & login with protected routes

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, Tailwind CSS v4, React Router v7 |
| Backend | Node.js, Express 5, MongoDB (Mongoose) |
| AI | Groq SDK (LLaMA for chat/eval, Whisper for transcription, Orpheus for TTS) |
| Real-time | WebSocket (`ws`) |
| Auth | JWT + bcrypt |

---

## Project Structure

```
ResumeX1/
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── pages/          # Dashboard, Results, Interview, Report, Login, Register
│   │   ├── components/     # Shared UI components (Layout, etc.)
│   │   ├── context/        # AuthContext, ThemeContext
│   │   └── lib/            # API helpers
│   └── package.json
│
├── server/                 # Express backend
│   ├── routes/             # /api/parse, /api/analyze, /api/auth, /api/resumes, /api/interviews
│   ├── services/           # Resume parsing, GitHub API, AI/LLM calls, TTS, session store, metrics
│   ├── models/             # Mongoose models
│   ├── middleware/         # Auth middleware
│   ├── websocket/          # Interview WebSocket handler
│   └── package.json
│
├── docs/                   # Additional documentation
├── .env.example            # Environment variable template
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or [Atlas](https://www.mongodb.com/atlas))
- [Groq API key](https://console.groq.com/) (used for chat, Whisper transcription, and TTS)

### 1. Clone & configure environment

```bash
git clone https://github.com/itsmeaks200/ResumeXv1.git
cd ResumeXv1
cp .env.example .env
```

Edit `.env` and fill in your keys:

```env
GROQ_API_KEY=your_groq_api_key_here
TTS_VOICE=hannah               # Groq Orpheus TTS voice
PORT=5000
MONGODB_URI=mongodb://localhost:27017/resumex
JWT_SECRET=change_this_to_a_long_random_secret
GITHUB_TOKEN=                  # Optional — enables private repos & higher rate limit
CLIENT_URL=http://localhost:5173  # Optional — CORS whitelist (default: Vite dev server)
REDIS_URL=                     # Optional — shared interview-session store (see below)
```

### 2. Install dependencies

```bash
# Server
cd server && npm install

# Client
cd ../client && npm install
```

### 3. Run in development

Open **two terminals**:

```bash
# Terminal 1 — backend
cd server
npm run dev        # nodemon on port 5000

# Terminal 2 — frontend
cd client
npm run dev        # Vite dev server on port 5173
```

Visit [http://localhost:5173](http://localhost:5173).

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | ✅ | Powers resume analysis, interview chat/eval, Whisper transcription, and Orpheus TTS |
| `TTS_VOICE` | ❌ | Groq Orpheus TTS voice (default: `hannah`) |
| `PORT` | ❌ | Server port (default: `5000`) |
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Secret for signing JWTs — keep this long and random |
| `GITHUB_TOKEN` | ❌ | Personal access token for GitHub API (5000 req/hr vs 60) |
| `CLIENT_URL` | ❌ | Frontend origin for CORS whitelist (default: `http://localhost:5173`) |
| `REDIS_URL` | ❌ | Shared interview-session store. Without it, sessions live in-memory (single instance only, lost on restart). With it, sessions survive restarts and reconnects work across multiple server instances. |

---

## API Overview

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/auth/register` | Create a new account |
| `POST` | `/api/auth/login` | Login and receive JWT |
| `POST` | `/api/parse` | Upload and parse a PDF resume |
| `POST` | `/api/analyze` | Run AI analysis on parsed resume |
| `GET` | `/api/resumes` | List saved resumes (auth required) |
| `GET` | `/api/interviews` | List past interview reports (auth required) |
| `GET` | `/api/interviews/:id` | Get a single interview report (auth required) |
| `WS` | `/ws/interview?token=<jwt>` | Voice-only interview session — adaptive question generation, time-paced (JWT required) |
| `GET` | `/health` | Server health check |

---

## License

MIT
