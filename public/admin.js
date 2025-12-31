import { qs } from "./shared.js";

qs("#session").textContent = "default";
qs("#screenLink").href = "/screen.html";

const socket = io({ query: { role: "admin" } });

let latestState = null;
let packsIndex = [];

const elStatus = qs("#authStatus");

const elPack = qs("#pack");
const elNow = qs("#now");

const elTimerSeconds = qs("#timerSeconds");
const elTimerStart = qs("#timerStart");
const elTimerStop = qs("#timerStop");
const elFxDrumroll = qs("#fxDrumroll");
const elFxDing = qs("#fxDing");

function setAuthStatus(t) {
  elStatus.textContent = t;
}

function adminAction(action) {
  socket.emit("admin:action", { action }, (res) => {
    if (!res?.ok) setAuthStatus(`ошибка: ${res?.error || "unknown"}`);
  });
}

function renderNow() {
  const packId = latestState?.selection?.packId;
  const idx = latestState?.selection?.questionIndex;
  const pack = packsIndex.find((p) => p.id === packId);
  const phase = latestState?.ui?.phase;
  const reveal = latestState?.ui?.reveal;

  const endsAt = latestState?.ui?.timer?.endsAt;
  const durationSec = latestState?.ui?.timer?.durationSec;
  const timerText = endsAt ? `таймер: ${durationSec ?? "?"}с` : "таймер: —";

  elNow.textContent = `Пак: ${pack?.title || "—"} | Вопрос #${(idx ?? 0) + 1} | Фаза: ${phase} | Reveal: ${reveal} | ${timerText}`;
}

function renderPackSelect() {
  elPack.innerHTML = "";
  for (const p of packsIndex) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.title} (${p.count})`;
    elPack.appendChild(opt);
  }
  const current = latestState?.selection?.packId;
  if (current) elPack.value = current;
}

fetch("/api/packs")
  .then((r) => r.json())
  .then((data) => {
    packsIndex = data?.packs || [];
    renderPackSelect();
    renderNow();
  })
  .catch(() => undefined);

socket.on("state", (state) => {
  latestState = state;
  if (packsIndex.length) renderPackSelect();
  renderNow();
});

setAuthStatus("готово");

elPack.addEventListener("change", () => {
  adminAction({ type: "setPack", packId: elPack.value });
});

qs("#prev").addEventListener("click", () => adminAction({ type: "prev" }));
qs("#next").addEventListener("click", () => adminAction({ type: "next" }));
qs("#start").addEventListener("click", () => adminAction({ type: "start" }));
qs("#reset").addEventListener("click", () => adminAction({ type: "reset" }));
qs("#hint").addEventListener("click", () => adminAction({ type: "reveal", step: "hint" }));
qs("#answer").addEventListener("click", () => adminAction({ type: "reveal", step: "answer" }));

elTimerStart.addEventListener("click", () => {
  const raw = String(elTimerSeconds.value || "").trim();
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    setAuthStatus("таймер: введите секунды (например 30)");
    return;
  }
  adminAction({ type: "timerStart", seconds });
});

elTimerStop.addEventListener("click", () => adminAction({ type: "timerStop" }));

elFxDrumroll.addEventListener("click", () => adminAction({ type: "fx", fx: "drumroll" }));
elFxDing.addEventListener("click", () => adminAction({ type: "fx", fx: "ding" }));
