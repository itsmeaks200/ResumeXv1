import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN || null;

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

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/interview" });

app.use(cors());
app.use(express.json());

app.use("/api/parse", parseRoute);
app.use("/api/analyze", analyzeRoute);
app.use("/api/auth", authRoute);
app.use("/api/resumes", resumesRoute);
app.get("/health", (_, res) => res.json({ status: "ok" }));

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
