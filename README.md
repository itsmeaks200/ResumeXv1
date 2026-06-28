# ResumeX

> AI-powered resume analysis and mock interview platform built with React + Express.

---

## Features

- **Resume Parsing** — Upload a PDF resume and extract structured data automatically
- **AI Analysis** — Get an ATS score, skill gap analysis, and improvement suggestions powered by Groq
- **GitHub Integration** — Optionally link a GitHub account to enrich project context
- **Mock Interviews** — Real-time AI interview sessions over WebSocket with text-to-speech (Gemini TTS / Groq TTS fallback)
- **Interview Reports** — Post-interview scoring and detailed feedback
- **Auth** — JWT-based registration & login with protected routes

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, Tailwind CSS v4, React Router v7 |
| Backend | Node.js, Express 5, MongoDB (Mongoose) |
| AI | Groq SDK (LLaMA), Gemini API (TTS) |
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
│   ├── routes/             # /api/parse, /api/analyze, /api/auth, /api/resumes, /api/interview
│   ├── services/           # GitHub API, AI services
│   ├── models/             # Mongoose models
│   ├── middleware/         # Auth middleware
│   ├── parser/             # PDF parsing logic
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
- [Groq API key](https://console.groq.com/)
- [Google AI Studio key](https://aistudio.google.com/apikey) (for Gemini TTS)

### 1. Clone & configure environment

```bash
git clone https://github.com/itsmeaks200/ResumeXv1.git
cd ResumeXv1
cp .env.example .env
```

Edit `.env` and fill in your keys:

```env
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_TTS_VOICE=Kore          # Optional — change voice
TTS_VOICE=hannah               # Groq TTS fallback voice
PORT=5000
MONGODB_URI=mongodb://localhost:27017/resumex
JWT_SECRET=change_this_to_a_long_random_secret
GITHUB_TOKEN=                  # Optional — enables private repos & higher rate limit
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
| `GROQ_API_KEY` | ✅ | Powers resume analysis and interview AI |
| `GEMINI_API_KEY` | ✅ | Gemini TTS for interview voice responses |
| `GEMINI_TTS_VOICE` | ❌ | Voice name (default: `Kore`) |
| `TTS_VOICE` | ❌ | Groq TTS fallback voice (default: `hannah`) |
| `PORT` | ❌ | Server port (default: `5000`) |
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Secret for signing JWTs — keep this long and random |
| `GITHUB_TOKEN` | ❌ | Personal access token for GitHub API (5000 req/hr vs 60) |

---

## API Overview

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/auth/register` | Create a new account |
| `POST` | `/api/auth/login` | Login and receive JWT |
| `POST` | `/api/parse` | Upload and parse a PDF resume |
| `POST` | `/api/analyze` | Run AI analysis on parsed resume |
| `GET` | `/api/resumes` | List saved resumes (auth required) |
| `WS` | `/ws/interview` | Real-time interview session |
| `GET` | `/health` | Server health check |

---

## License

MIT
