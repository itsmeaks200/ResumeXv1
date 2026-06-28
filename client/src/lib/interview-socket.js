const WS_URL = `ws://${window.location.hostname}:5000/ws/interview`;

export function createInterviewSocket(handlers) {
  const ws = new WebSocket(WS_URL);
  let intentional = false;

  ws.onopen = () => handlers.onOpen?.();
  ws.onclose = () => { if (!intentional) handlers.onClose?.(); };
  ws.onerror = (e) => { if (!intentional) handlers.onError?.(e); };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handlers.onMessage?.(msg);
    } catch {
      console.error("Invalid WS message:", event.data);
    }
  };

  return {
    send: (type, payload = {}) => ws.send(JSON.stringify({ type, ...payload })),
    sendAudioChunk: (base64Chunk) => ws.send(JSON.stringify({ type: "audio_chunk", chunk: base64Chunk })),
    close: () => { intentional = true; ws.close(); },
    raw: ws,
  };
}

export function playAudio(base64) {
  if (!base64) return;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  audio.play().catch(() => {});
  return audio;
}
