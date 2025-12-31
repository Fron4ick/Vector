export function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

export function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function playDing() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = 880;
  g.gain.value = 0.0001;
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  const now = ctx.currentTime;
  g.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  o.stop(now + 0.65);
}

export function playDrumroll(ms = 1200) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const bufferSize = 2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 180;

  const gain = ctx.createGain();
  gain.gain.value = 0.0001;

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  noise.start();
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
  noise.stop(now + ms / 1000 + 0.05);
}

export function renderQuestion({ pack, question, state }) {
  if (!pack || !question) return null;

  const reveal = state?.ui?.reveal || "none";
  const type = pack.type;

  const base = {
    packTitle: pack.title,
    type,
    title: question.title || "",
    prompt: question.prompt || "",
    hint: reveal !== "none" ? question.hint || "" : "",
    answer: reveal === "answer" ? question.answer || "" : "",
    media: question.media || null
  };

  if (type === "guess_melody") {
    return {
      ...base,
      subtitle: [question.year, question.artist].filter(Boolean).join(" • ")
    };
  }

  if (type === "lyrics_synonyms") {
    return {
      ...base,
      subtitle: question.subtitle || ""
    };
  }

  if (type === "emoji_song") {
    return {
      ...base,
      subtitle: question.subtitle || ""
    };
  }

  return base;
}
