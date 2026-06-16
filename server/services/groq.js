const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const EVAL_MODEL = "llama-3.3-70b-versatile";
const WHISPER_MODEL = "whisper-large-v3-turbo";

async function chat(prompt, systemPrompt = null) {
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const response = await groq.chat.completions.create({
    model: EVAL_MODEL,
    max_tokens: 2048,
    messages,
  });

  return response.choices[0].message.content.trim();
}

async function transcribeAudio(audioBuffer, mimeType = "audio/webm") {
  const file = new File([audioBuffer], "audio.webm", { type: mimeType });

  const transcription = await groq.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    response_format: "json",
  });

  return transcription.text;
}

function stripJson(text) {
  if (text.startsWith("```")) {
    text = text.split("```")[1];
    if (text.startsWith("json")) text = text.slice(4);
  }
  return text.trim();
}

module.exports = { chat, transcribeAudio, stripJson };
