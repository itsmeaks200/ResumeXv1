import Groq from "groq-sdk";
import { metrics } from "./metrics.js";

let _groq = null;
export const getGroqClient = () => {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
};

export const EVAL_MODEL = "llama-3.3-70b-versatile";
export const WHISPER_MODEL = "whisper-large-v3-turbo";

export async function chat(prompt, systemPrompt = null, { sessionId = "global", stage = "llm_chat", jsonMode = true } = {}) {
  const end = metrics.startTimer(sessionId, stage);
  try {
    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const opts = {
      model: EVAL_MODEL,
      max_tokens: 2048,
      messages,
    };
    // JSON mode eliminates markdown fences — Groq returns raw JSON
    if (jsonMode) opts.response_format = { type: "json_object" };

    const response = await getGroqClient().chat.completions.create(opts);
    const content = response.choices[0].message.content.trim();

    const tokensUsed = response.usage?.total_tokens ?? 0;
    end({ model: EVAL_MODEL, tokens: tokensUsed });
    return content;
  } catch (err) {
    end({ error: err.message });
    throw err;
  }
}

export async function transcribeAudio(audioBuffer, mimeType = "audio/webm", { sessionId = "global" } = {}) {
  const end = metrics.startTimer(sessionId, "whisper_transcription");
  try {
    const file = new File([audioBuffer], "audio.webm", { type: mimeType });
    const transcription = await getGroqClient().audio.transcriptions.create({
      file,
      model: WHISPER_MODEL,
      response_format: "json",
    });
    const charCount = transcription.text?.length ?? 0;
    end({ model: WHISPER_MODEL, chars: charCount });
    return transcription.text;
  } catch (err) {
    end({ error: err.message });
    throw err;
  }
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
