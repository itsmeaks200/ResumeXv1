const GEMINI_API_KEY = () => process.env.GEMINI_API_KEY;
const VOICE_NAME = process.env.GEMINI_TTS_VOICE || "Kore";
const MODEL = "gemini-2.5-flash-preview-tts";

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

export async function synthesize(text) {
  try {
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

    if (!res.ok) {
      console.error("TTS error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const base64Pcm = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Pcm) {
      console.error("TTS error: no audio data in response");
      return null;
    }

    const wavBuffer = pcmToWav(Buffer.from(base64Pcm, "base64"));
    return wavBuffer.toString("base64");
  } catch (err) {
    console.error("TTS error:", err.message);
    return null;
  }
}
