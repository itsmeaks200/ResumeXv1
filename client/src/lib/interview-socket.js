function getWsUrl() {
  const token = localStorage.getItem("token") || "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  // In production (behind a reverse proxy), use the page's host directly.
  // In dev, the API server runs on port 5000 while Vite runs on 5173.
  const isDev = window.location.port === "5173";
  const host = isDev ? `${window.location.hostname}:5000` : window.location.host;
  return `${protocol}//${host}/ws/interview?token=${encodeURIComponent(token)}`;
}

export function createInterviewSocket(handlers) {
  const ws = new WebSocket(getWsUrl());
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
