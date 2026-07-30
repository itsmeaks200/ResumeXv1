import Groq from "groq-sdk";
import { metrics } from "./metrics.js";

let _groq = null;
const groq = () => {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
};

// Single-provider TTS via Groq's Orpheus voice model. Returns base64 WAV audio,
// or null if synthesis fails (caller treats null as "no audio" and degrades gracefully).
export async function synthesize(text, { sessionId = "global" } = {}) {
  const end = metrics.startTimer(sessionId, "tts_total");
  try {
    const response = await groq().audio.speech.create({
      model: "canopylabs/orpheus-v1-english",
      voice: process.env.TTS_VOICE || "hannah",
      input: text,
      response_format: "wav",
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const result = buffer.toString("base64");
    end({ textLength: text.length });
    return result;
  } catch (err) {
    console.error("TTS synthesis failed:", err.message);
    end({ error: err.message });
    return null;
  }
}
