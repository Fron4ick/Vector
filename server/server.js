import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { loadAllPacks } from "./packs.js";
import { createInitialState, reduceAdminAction } from "./state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");

const PORT = Number(process.env.PORT || 5175);

const packs = await loadAllPacks(DATA_DIR);

let state = createInitialState({ packs });

function emitState() {
  io.emit("state", state);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/packs", (_req, res) => {
  res.json({ packs: Object.values(packs).map((p) => ({ id: p.id, title: p.title, type: p.type, count: p.questions.length })) });
});

app.get("/api/packs/:id", (req, res) => {
  const p = packs[req.params.id];
  if (!p) return res.status(404).json({ error: "pack_not_found" });
  res.json({ pack: p });
});

io.on("connection", (socket) => {
  const { role = "screen" } = socket.handshake.query;
  socket.emit("hello", { role: String(role || "screen"), serverTime: Date.now() });
  socket.emit("state", state);

  socket.on("admin:action", (payload, cb) => {
    const action = payload?.action;
    try {
      state = reduceAdminAction(state, action, { packs });
      emitState();
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false, error: "action_failed", details: e?.message || String(e) });
    }
  });
});

server.listen(PORT, () => {
  console.log(`[newyear-show] http://localhost:${PORT}`);
});
