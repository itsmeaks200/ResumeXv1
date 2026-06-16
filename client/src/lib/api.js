import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export const parseResume = (file) => {
  const form = new FormData();
  form.append("resume", file);
  return api.post("/parse", form);
};

export const analyzeResume = (resume, jobDescription) =>
  api.post("/analyze", { resume, jobDescription });

export const startInterview = (resume, jobDescription, questionCount = 5) =>
  api.post("/interview/start", { resume, jobDescription, questionCount });

export const transcribeAudio = (audioBlob) => {
  const form = new FormData();
  form.append("audio", audioBlob, "answer.webm");
  return api.post("/interview/transcribe", form);
};

export const evaluateAnswer = (question, answer, resume) =>
  api.post("/interview/answer", { question, answer, resume });

export const endInterview = (questions, answers, evaluations) =>
  api.post("/interview/end", { questions, answers, evaluations });
