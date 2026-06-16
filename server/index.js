require("dotenv").config({ path: "../.env" });
const express = require("express");
const cors = require("cors");

const parseRoute = require("./routes/parse");
const analyzeRoute = require("./routes/analyze");
const interviewRoute = require("./routes/interview");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/parse", parseRoute);
app.use("/api/analyze", analyzeRoute);
app.use("/api/interview", interviewRoute);

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
