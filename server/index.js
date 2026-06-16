import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { handleInterviewSocket } from "./websocket/interview-ws.js";
import parseRoute from "./routes/parse.js";
import analyzeRoute from "./routes/analyze.js";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/interview" });

app.use(cors());
app.use(express.json());

app.use("/api/parse", parseRoute);
app.use("/api/analyze", analyzeRoute);
app.get("/health", (_, res) => res.json({ status: "ok" }));

wss.on("connection", handleInterviewSocket);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
