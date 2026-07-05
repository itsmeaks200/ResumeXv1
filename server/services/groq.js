import Groq from "groq-sdk";

let _groq = null;
export const getGroqClient = () => {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
};

export const EVAL_MODEL = "llama-3.3-70b-versatile";
export const WHISPER_MODEL = "whisper-large-v3-turbo";

export async function chat(prompt, systemPrompt = null) {
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const response = await getGroqClient().chat.completions.create({
    model: EVAL_MODEL,
    max_tokens: 2048,
    messages,
  });

  return response.choices[0].message.content.trim();
}

export async function transcribeAudio(audioBuffer, mimeType = "audio/webm") {
  const file = new File([audioBuffer], "audio.webm", { type: mimeType });
  const transcription = await getGroqClient().audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    response_format: "json",
  });
  return transcription.text;
}

/**
 * Extracts raw JSON from an LLM response that may be wrapped in markdown
 * code fences (```json ... ```). Handles uppercase tags, missing closing
 * fences, and extra whitespace.
 */
export function stripJson(text) {
  const fenceMatch = text.match(/^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```\s*$/);
  if (fenceMatch) return fenceMatch[1].trim();

  if (text.startsWith("```")) {
    let inner = text.slice(3);
    if (/^json\s/i.test(inner)) inner = inner.replace(/^json\s*/i, "");
    inner = inner.replace(/```\s*$/, "");
    return inner.trim();
  }

  return text.trim();
}
