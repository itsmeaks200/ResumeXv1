import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import { handleInterviewSocket } from "./websocket/interview-ws.js";
import parseRoute from "./routes/parse.js";
import analyzeRoute from "./routes/analyze.js";
import authRoute from "./routes/auth.js";
import resumesRoute from "./routes/resumes.js";
import { requireAuth } from "./middleware/auth.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { metrics } from "./services/metrics.js";

// Rate limiters for expensive AI-powered endpoints (F13 fix)
const parseLimiter = rateLimit({ windowMs: 60_000, max: 10, message: "Too many parse requests. Please wait a minute." });
const analyzeLimiter = rateLimit({ windowMs: 60_000, max: 15, message: "Too many analysis requests. Please wait a minute." });
const authLimiter = rateLimit({ windowMs: 60_000, max: 20, message: "Too many login attempts. Please wait a minute." });

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/interview" });

// Restrict CORS to known frontend origins only
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL || "http://localhost:5173",
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));

app.use("/api/parse", parseLimiter, parseRoute);
app.use("/api/analyze", analyzeLimiter, analyzeRoute);
app.use("/api/auth", authLimiter, authRoute);
app.use("/api/resumes", resumesRoute);
app.get("/health", (_, res) => res.json({ status: "ok" }));

// GenAI pipeline metrics — latency percentiles, pre-gen hit rate, TTS fallback rate
app.get("/metrics", requireAuth, (_, res) => {
  res.json(metrics.getSummary());
});

wss.on("connection", handleInterviewSocket);

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/resumex";

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    console.error("Start MongoDB or set MONGODB_URI in .env");
    process.exit(1);
  });
