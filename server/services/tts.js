import Groq from "groq-sdk";

const GEMINI_API_KEY = () => process.env.GEMINI_API_KEY;
const VOICE_NAME = process.env.GEMINI_TTS_VOICE || "Kore";
const MODEL = "gemini-2.5-flash-preview-tts";

let _groq = null;
const groq = () => {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
};

async function synthesizeGroq(text) {
  const response = await groq().audio.speech.create({
    model: "canopylabs/orpheus-v1-english",
    voice: process.env.TTS_VOICE || "hannah",
    input: text,
    response_format: "wav",
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString("base64");
}

// Gemini TTS returns raw 16-bit PCM mono @ 24kHz with no container —
// wrap it in a WAV header so browsers can play it via <audio>/Blob.
function pcmToWav(pcmBuffer, sampleRate = 24000, channels = 1, bitDepth = 16) {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

async function synthesizeGemini(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } },
          },
        },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const base64Pcm = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Pcm) throw new Error("Gemini TTS: no audio data in response");

  return pcmToWav(Buffer.from(base64Pcm, "base64")).toString("base64");
}

export async function synthesize(text) {
  try {
    return await synthesizeGemini(text);
  } catch (err) {
    console.error("Gemini TTS failed, falling back to Groq:", err.message);
    try {
      return await synthesizeGroq(text);
    } catch (groqErr) {
      console.error("Groq TTS fallback also failed:", groqErr.message);
      return null;
    }
  }
}
