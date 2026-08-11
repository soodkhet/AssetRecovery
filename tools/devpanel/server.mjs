#!/usr/bin/env node
/**
 * RTB Dev Panel — เซิร์ฟเวอร์ควบคุม dev แบบกดปุ่ม (ไม่ต้องพิมพ์ terminal)
 *
 * ทำไมต้องมี: งาน dev ประจำ (เปิด API/web/admin/worker, docker postgres, migrate/seed,
 * typecheck/test/build) ต้องพิมพ์คำสั่งใน terminal + จำเรื่อง cd/โหลด .env/ulimit ให้ครบ
 * ไม่งั้นพัง (EMFILE, DATABASE_URL required, connection refused). Panel นี้จัดการให้อัตโนมัติ:
 *   - cwd = repo root เสมอ
 *   - โหลดค่าจาก .env เข้า process ที่ spawn ทุกตัว (แก้ปัญหา env ไม่ถูกโหลด)
 *   - build ตั้ง `ulimit -n` ให้เอง (แก้ EMFILE)
 *
 * ปลอดภัย: bind 127.0.0.1 เท่านั้น (เครื่องตัวเองเข้าได้คนเดียว) — เครื่องมือ dev ล้วน ไม่ ship prod
 * ไม่มี dependency ภายนอก ใช้แต่ core modules ของ Node
 */
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", ".."); // tools/devpanel → repo root
const PANEL_PORT = Number(process.env.PANEL_PORT ?? 4600);

// ---------- โหลด .env → object (ส่งเข้า process ที่ spawn) ----------
function loadDotEnv() {
  const p = path.join(REPO_ROOT, ".env");
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (let line of fs.readFileSync(p, "utf8").split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7);
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

// ---------- log ring buffer (UI poll เอา) ----------
const LOG = [];
let logId = 0;
const MAX_LOG = 4000;
function log(src, line) {
  for (const l of String(line).replace(/\r/g, "").split("\n")) {
    if (l === "" ) continue;
    LOG.push({ id: ++logId, t: Date.now(), src, line: l });
  }
  if (LOG.length > MAX_LOG) LOG.splice(0, LOG.length - MAX_LOG);
}

// ---------- นิยามบริการ (long-running) + one-shot commands ----------
// ports: web=3000, api=3001(API_PORT), admin(vite)=5173
const SERVICES = {
  api:    { label: "API",        script: "dev:api",    port: 3001 },
  web:    { label: "หน้าบ้าน",   script: "dev:web",    port: 3000 },
  admin:  { label: "หลังบ้าน",   script: "dev:admin",  port: 5173 },
  worker: { label: "Worker",     script: "dev:worker", port: null }
};
const children = new Map(); // key → child process (บริการที่กำลังรัน)

// one-shot: รันแล้วจบ (มีได้ทีละงาน)
const TASKS = {
  migrate:    { label: "db:migrate",    cmd: "pnpm --filter @rtb/db db:migrate" },
  "seed-demo":{ label: "seed demo",     cmd: "pnpm --filter @rtb/db db:seed-demo" },
  "clear-demo":{ label: "clear demo",   cmd: "pnpm --filter @rtb/db db:clear-demo" },
  typecheck:  { label: "typecheck",     cmd: "pnpm typecheck" },
  test:       { label: "test",          cmd: "pnpm test" },
  build:      { label: "build หน้าบ้าน", cmd: "ulimit -n 10240; pnpm --filter @rtb/web build" }
};
let runningTask = null; // key ของ one-shot ที่กำลังรัน (ครั้งละงาน)

// studio = long-running แต่จัดเป็น service พิเศษ (เปิดหน้าเว็บ drizzle)
// จัดการผ่าน children map เหมือนบริการอื่น key = "studio"

function baseEnv() {
  return { ...process.env, ...loadDotEnv() };
}

function spawnShell(command, srcTag) {
  // ใช้ login shell เพื่อให้ PATH (nvm/pnpm/docker) ครบ + detached เพื่อคุมทั้ง process group
  const child = spawn("/bin/zsh", ["-lc", command], {
    cwd: REPO_ROOT,
    env: baseEnv(),
    detached: true
  });
  child.stdout.on("data", (d) => log(srcTag, d.toString()));
  child.stderr.on("data", (d) => log(srcTag, d.toString()));
  return child;
}

function startService(key) {
  const s = SERVICES[key];
  if (!s) return { ok: false, error: "unknown service" };
  if (children.has(key)) return { ok: true, already: true };
  log("panel", `▶ เปิด ${s.label} (pnpm ${s.script})…`);
  const child = spawnShell(`exec pnpm ${s.script}`, key);
  children.set(key, child);
  child.on("exit", (code) => {
    log("panel", `⏹ ${s.label} หยุด (exit ${code})`);
    children.delete(key);
  });
  return { ok: true };
}

function stopService(key) {
  const child = children.get(key);
  if (!child) return { ok: true, already: true };
  const label = SERVICES[key]?.label ?? key;
  log("panel", `⏹ ปิด ${label}…`);
  try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch { /* process ตายไปก่อนแล้ว — ถือว่าปิดสำเร็จ */ } }
  return { ok: true };
}

function startStudio() {
  if (children.has("studio")) return { ok: true, already: true };
  log("panel", "▶ เปิด Drizzle Studio…");
  const child = spawnShell("exec pnpm --filter @rtb/db db:studio", "studio");
  children.set("studio", child);
  child.on("exit", (code) => { log("panel", `⏹ Studio หยุด (exit ${code})`); children.delete("studio"); });
  return { ok: true };
}

function runTask(key) {
  const t = TASKS[key];
  if (!t) return { ok: false, error: "unknown task" };
  if (runningTask) return { ok: false, error: `มีงาน "${TASKS[runningTask]?.label}" รันอยู่ รอให้จบก่อน` };
  runningTask = key;
  log("panel", `▶ เริ่ม: ${t.label}…`);
  const child = spawnShell(t.cmd, key);
  child.on("exit", (code) => {
    log("panel", code === 0 ? `✅ ${t.label} สำเร็จ` : `❌ ${t.label} ล้มเหลว (exit ${code})`);
    runningTask = null;
  });
  return { ok: true };
}

// ---------- docker postgres ----------
function dockerCompose(action) {
  const cmd = action === "up" ? "docker compose up -d postgres" : "docker compose down";
  log("panel", `▶ Postgres: ${cmd}…`);
  const child = spawnShell(cmd, "postgres");
  child.on("exit", (code) => log("panel", code === 0 ? "✅ Postgres " + action + " สำเร็จ" : `❌ docker ${action} exit ${code}`));
  return { ok: true };
}

// ---------- เช็คสถานะ ----------
/**
 * พอร์ตมีคนฟังอยู่ไหม — **ต้องลองทั้ง IPv4 และ IPv6 ห้ามเช็คแค่ 127.0.0.1**
 *
 * Vite (หลังบ้าน :5173) ผูกกับ `localhost` ซึ่งบน macOS resolve เป็น `::1` ก่อน ⇒ **ฟัง IPv6
 * อย่างเดียว** (`lsof` เห็น `[::1]:5173`) ต่างจาก Next/Fastify ที่เป็น `*:3000`/`*:3001` = ทุก interface
 *
 * ของเดิมเช็คแค่ IPv4 ⇒ หลังบ้านขึ้นจุดเทา "ปิดอยู่" ตลอดทั้งที่รันอยู่จริง, ปุ่ม "เปิดเว็บ" ถูก disable,
 * และพอกด "เปิด" ก็ไป spawn vite ตัวที่สองมาชนพอร์ตเดิมแล้วตาย = อาการ "หลังบ้านกดเปิดไม่ได้"
 */
function portOpen(port) {
  if (!port) return Promise.resolve(false);
  const tryHost = (host) =>
    new Promise((resolve) => {
      const sock = net.connect({ host, port }, () => { sock.destroy(); resolve(true); });
      sock.on("error", () => resolve(false));
      sock.setTimeout(400, () => { sock.destroy(); resolve(false); });
    });
  return Promise.all([tryHost("127.0.0.1"), tryHost("::1")]).then((r) => r.some(Boolean));
}
function dockerRunning() {
  return new Promise((resolve) => {
    const c = spawn("docker", ["inspect", "-f", "{{.State.Running}}", "rtb-postgres"], { env: baseEnv() });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.on("exit", () => resolve(out.trim() === "true"));
    c.on("error", () => resolve(false));
  });
}

async function status() {
  const services = {};
  for (const [key, s] of Object.entries(SERVICES)) {
    services[key] = {
      label: s.label,
      port: s.port,
      managed: children.has(key),        // panel เป็นคนเปิด
      listening: await portOpen(s.port)  // พอร์ตตอบสนอง (เปิดจากที่ไหนก็ตาม)
    };
  }
  return {
    services,
    studio: children.has("studio"),
    postgres: await dockerRunning(),
    runningTask: runningTask ? (TASKS[runningTask]?.label ?? runningTask) : null
  };
}

// ---------- one-click: เปิดครบ ----------
async function startAll() {
  dockerCompose("up");
  // รอ postgres พร้อมสักครู่ก่อนเปิด API (API ต้องต่อ DB ได้)
  setTimeout(() => startService("api"), 4000);
  setTimeout(() => { startService("web"); startService("admin"); }, 6000);
  log("panel", "▶ เปิดครบ: Postgres → (4วิ) API → (6วิ) หน้าบ้าน+หลังบ้าน. รอสักครู่แล้วกดปุ่มเปิดเว็บ");
  return { ok: true };
}
function stopAll() {
  for (const key of [...children.keys()]) stopService(key);
  return { ok: true };
}

function openUrl(url) {
  spawn("open", [url], { env: baseEnv() });
  log("panel", `🌐 เปิด ${url}`);
  return { ok: true };
}

// ---------- HTTP ----------
const INDEX = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PANEL_PORT}`);
  const q = url.searchParams;
  try {
    if (url.pathname === "/") return send(res, 200, INDEX, "text/html; charset=utf-8");
    if (url.pathname === "/api/status") return send(res, 200, await status());
    if (url.pathname === "/api/log") {
      const since = Number(q.get("since") ?? 0);
      return send(res, 200, { lines: LOG.filter((l) => l.id > since), lastId: logId });
    }
    if (req.method === "POST") {
      switch (url.pathname) {
        case "/api/service/start": return send(res, 200, startService(q.get("key")));
        case "/api/service/stop":  return send(res, 200, stopService(q.get("key")));
        case "/api/task":          return send(res, 200, runTask(q.get("key")));
        case "/api/postgres":      return send(res, 200, dockerCompose(q.get("action") === "up" ? "up" : "down"));
        case "/api/studio":        return send(res, 200, startStudio());
        case "/api/open":          return send(res, 200, openUrl(q.get("url")));
        case "/api/startall":      return send(res, 200, await startAll());
        case "/api/stopall":       return send(res, 200, stopAll());
        case "/api/quit":          send(res, 200, { ok: true }); log("panel", "👋 ปิดแผง + บริการทั้งหมด…"); cleanup(); return;
      }
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: String(e?.message ?? e) });
  }
});

server.listen(PANEL_PORT, "127.0.0.1", () => {
  log("panel", `RTB Dev Panel พร้อมใช้งานที่ http://localhost:${PANEL_PORT}`);
  console.log(`\n  ▲ RTB Dev Panel → http://localhost:${PANEL_PORT}\n  repo: ${REPO_ROOT}\n`);
});

// ปิด panel = ปิดบริการลูกทั้งหมด (กันค้าง)
function cleanup() { stopAll(); setTimeout(() => process.exit(0), 300); }
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("SIGHUP", cleanup);
