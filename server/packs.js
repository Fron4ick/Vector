import fs from "fs/promises";
import path from "path";

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

export async function loadAllPacks(dataDir) {
  const packsDir = path.join(dataDir, "packs");
  const entries = await fs.readdir(packsDir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && e.name.endsWith(".json")).map((e) => path.join(packsDir, e.name));

  const packs = {};
  for (const file of files) {
    const pack = await readJson(file);
    if (!pack?.id) throw new Error(`Pack missing id: ${file}`);
    if (!Array.isArray(pack?.questions)) throw new Error(`Pack missing questions[]: ${file}`);
    packs[pack.id] = pack;
  }
  return packs;
}
