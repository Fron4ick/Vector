import { qs, renderQuestion, playDing } from "./shared.js";

const session = new URLSearchParams(location.search).get("session") || "default";
qs("#session").textContent = session;

const socket = io({ query: { session, role: "screen" } });

const elStatus = qs("#status");
const elPackTitle = qs("#packTitle");
const elTitle = qs("#qTitle");
const elSubtitle = qs("#qSubtitle");
const elPhase = qs("#phase");
const elPrompt = qs("#prompt");
const elHint = qs("#hint");
const elAnswer = qs("#answer");
const elMedia = qs("#media");

let lastReveal = "none";

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
}

socket.on("connect", () => setStatus("connected"));
socket.on("disconnect", () => setStatus("disconnected"));

socket.on("state", (state) => {
  elPhase.textContent = state?.ui?.phase || "—";

  const packId = state?.selection?.packId;
  const idx = state?.selection?.questionIndex;

  fetch(`/api/packs/${encodeURIComponent(packId)}`)
    .then((r) => r.json())
    .then(({ pack }) => {
      const question = pack?.questions?.[idx] || null;
      const model = renderQuestion({ pack, question, state });
      if (!model) return;

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
