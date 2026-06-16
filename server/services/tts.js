import Groq from "groq-sdk";

let _groq = null;
const groq = () => {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
};

const VOICE = process.env.TTS_VOICE || "hannah";

export async function synthesize(text) {
  try {
    const response = await groq().audio.speech.create({
      model: "canopylabs/orpheus-v1-english",
      voice: VOICE,
      input: text,
      response_format: "wav",
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString("base64");
  } catch (err) {
    console.error("TTS error:", err.message);
    return null;
  }
}
