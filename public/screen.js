import { qs, renderQuestion, playDing, playDrumroll } from "./shared.js";

qs("#session").textContent = "default";

const socket = io({ query: { role: "screen" } });

const elStatus = qs("#status");
const elPackTitle = qs("#packTitle");
const elTitle = qs("#qTitle");
const elSubtitle = qs("#qSubtitle");
const elPhase = qs("#phase");
const elTimer = qs("#timer");
const elPrompt = qs("#prompt");
const elHint = qs("#hint");
const elAnswer = qs("#answer");
const elMedia = qs("#media");

const basePromptClassName = elPrompt.className;

let lastReveal = "none";
let lastFxId = 0;

let currentEndsAt = null;

function fmtCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m <= 0) return String(s);
  return `${m}:${String(s).padStart(2, "0")}`;
}

let timerTick = null;
function ensureTimerTick() {
  if (timerTick) return;
  timerTick = setInterval(() => {
    if (!currentEndsAt) {
      elTimer.textContent = "—";
      return;
    }
    const left = currentEndsAt - Date.now();
    elTimer.textContent = left > 0 ? fmtCountdown(left) : "0";
  }, 200);
}

function setStatus(s) {
  elStatus.textContent = s;
}

function clearMedia() {
  elMedia.innerHTML = "";
}

function renderMedia(media, reveal) {
  clearMedia();
  if (!media) return;

  if (Array.isArray(media.images) && media.images.length) {
    const grid = document.createElement("div");
    grid.className = "grid grid-cols-2 gap-3";
    for (const src of media.images) {
      const img = document.createElement("img");
      img.src = src;
      img.className = "rounded-xl border border-slate-800 bg-slate-950/40";
      img.loading = "lazy";
      grid.appendChild(img);
    }
    elMedia.appendChild(grid);
  }

  const canPlayAudio = typeof media.audio === "string" && media.audio.length;
  if (canPlayAudio) {
    const wrap = document.createElement("div");
    wrap.className = "mt-4";

    const audio = document.createElement("audio");
    audio.src = media.audio;
    audio.controls = true;
    audio.className = "w-full";

    const label = document.createElement("div");
    label.className = "text-xs uppercase tracking-wider text-slate-400 mb-2";
    label.textContent = "Аудио";

    wrap.appendChild(label);
    wrap.appendChild(audio);

    if (reveal === "answer" && media.autoPlayOnAnswer) {
      audio.autoplay = true;
      audio.play().catch(() => undefined);
    }

    elMedia.appendChild(wrap);
  }

  const canPlayVideo = typeof media.video === "string" && media.video.length;
  if (canPlayVideo) {
    const wrap = document.createElement("div");
    wrap.className = "mt-4";

    const video = document.createElement("video");
    video.src = media.video;
    video.controls = true;
    video.className = "w-full rounded-xl border border-slate-800 bg-black";

    const label = document.createElement("div");
    label.className = "text-xs uppercase tracking-wider text-slate-400 mb-2";
    label.textContent = "Видео";

    wrap.appendChild(label);
    wrap.appendChild(video);

    if (reveal === "answer" && media.autoPlayOnAnswer) {
      video.autoplay = true;
      video.play().catch(() => undefined);
    }

    elMedia.appendChild(wrap);
  }
}

socket.on("connect", () => setStatus("connected"));
socket.on("disconnect", () => setStatus("disconnected"));

socket.on("state", (state) => {
  elPhase.textContent = state?.ui?.phase || "—";

  currentEndsAt = state?.ui?.timer?.endsAt || null;
  if (!currentEndsAt) {
    elTimer.textContent = "—";
  } else {
    elTimer.textContent = fmtCountdown(currentEndsAt - Date.now());
  }
  ensureTimerTick();

  const fx = state?.ui?.fx;
  const fxId = Number(fx?.id || 0);
  if (fxId && fxId !== lastFxId) {
    const t = String(fx?.type || "");
    if (t === "drumroll") playDrumroll(1400);
    if (t === "ding") playDing();
    lastFxId = fxId;
  }

  const packId = state?.selection?.packId;
  const idx = state?.selection?.questionIndex;

  fetch(`/api/packs/${encodeURIComponent(packId)}`)
    .then((r) => r.json())
    .then(({ pack }) => {
      const question = pack?.questions?.[idx] || null;
      const model = renderQuestion({ pack, question, state });
      if (!model) return;

      if (model.type === "emoji_song") {
        elPrompt.className = `${basePromptClassName} text-4xl sm:text-5xl font-extrabold tracking-wide`;
      } else {
        elPrompt.className = basePromptClassName;
      }

      elPackTitle.textContent = model.packTitle || "—";
      elTitle.textContent = model.title || "—";
      elSubtitle.textContent = model.subtitle || "";
      elPrompt.textContent = state?.ui?.phase === "idle" ? "Ждите ведущего…" : model.prompt || "";
      elHint.textContent = state?.ui?.reveal !== "none" ? (model.hint || "") : "";
      elAnswer.textContent = state?.ui?.reveal === "answer" ? (model.answer || "") : "";

      renderMedia(model.media, state?.ui?.reveal);

      if (lastReveal !== "answer" && state?.ui?.reveal === "answer") {
        playDing();
      }
      lastReveal = state?.ui?.reveal || "none";
    })
    .catch(() => undefined);
});
