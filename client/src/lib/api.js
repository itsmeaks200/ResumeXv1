import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

// Resume parsing
export const parseResume = (file) => {
  const form = new FormData();
  form.append("resume", file);
  return api.post("/parse", form);
};

// ATS analysis — pass resumeId (DB) or raw resume object
export const analyzeResume = (resume, jobDescription, resumeId) =>
  api.post("/analyze", { resume, jobDescription, resumeId });

// Auth
export const loginApi = (email, password) =>
  api.post("/auth/login", { email, password });

export const registerApi = (name, email, password) =>
  api.post("/auth/register", { name, email, password });

// Resume library (requires auth header to be set)
export const listResumes = () => api.get("/resumes");
export const getResume = (id) => api.get(`/resumes/${id}`);
export const deleteResume = (id) => api.delete(`/resumes/${id}`);
