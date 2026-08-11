#!/usr/bin/env node
// Dashboard server (zero-dependency http) + API + token auth
// ใช้: node orchestrator/server.mjs  แล้วเปิด http://localhost:4173/?token=<TOKEN>
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { config, PUBLIC_DIR, ORCH_DIR, REPO_ROOT } from './config.mjs';
import { getState, runOne, runLoop, resolveQueueItem, tryResumeFromLimit, runReview, runFinalAll, autoWatchdog, activeContextWindow, state } from './lib/engine.mjs';
import { readRuns } from './lib/queue.mjs';
import { recentCommits } from './lib/git.mjs';
import { getUsage, refreshPlanLimits } from './lib/usage.mjs';
import { readSession } from './lib/session.mjs';
import { notify } from './lib/notify.mjs';
import { releaseLock, clearDeadLock } from './lib/lock.mjs';

// --- token: จาก env, ไฟล์ .token, หรือ generate ใหม่ ---
function resolveToken() {
  if (process.env.RTB_DASH_TOKEN) return process.env.RTB_DASH_TOKEN.trim();
  const f = join(ORCH_DIR, '.token');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  const t = randomBytes(16).toString('hex');
  writeFileSync(f, t);
  return t;
}
const TOKEN = resolveToken();
config.notify.token = TOKEN;   // ให้ปุ่ม Approve ในแจ้งเตือนใช้ token เดียวกับ dashboard
const HOST = process.env.RTB_HOST || '0.0.0.0';

function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
function cookieToken(req) {
  const c = req.headers.cookie || '';
  const m = c.match(/(?:^|;\s*)dash=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function isAuthed(req, url) {
  return safeEq(cookieToken(req), TOKEN) || safeEq(req.headers['x-dash-token'], TOKEN) || safeEq(url.searchParams.get('token'), TOKEN);
}

function send(res, code, body, type = 'application/json', extra = {}) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...extra });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((r) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { try { r(b ? JSON.parse(b) : {}); } catch { r({}); } }); });
}

const LOGIN_PAGE = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RTB Orchestrator — เข้าสู่ระบบ</title>
<style>body{background:#0f1115;color:#e7e9ee;font-family:"IBM Plex Sans Thai",system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0}
.box{background:#171a21;border:1px solid #2a2f3a;border-radius:14px;padding:28px 26px;width:320px}
h1{font-size:16px;margin:0 0 14px}input{width:100%;box-sizing:border-box;background:#1f232c;border:1px solid #2a2f3a;color:#e7e9ee;border-radius:9px;padding:11px;font-size:14px;margin-bottom:12px}
button{width:100%;background:#6d28d9;color:#fff;border:0;border-radius:9px;padding:11px;font-size:14px;cursor:pointer}
p{color:#9aa3b2;font-size:12px;margin:12px 0 0}</style></head>
<body><form class="box" onsubmit="location='/?token='+encodeURIComponent(document.getElementById('t').value);return false">
<h1>🔒 RTB Orchestrator</h1><input id="t" type="password" placeholder="ใส่ token" autofocus><button>เข้าสู่ระบบ</button>
<p>token อยู่ในไฟล์ <code>orchestrator/.token</code> หรือ env <code>RTB_DASH_TOKEN</code></p></form></body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const authed = isAuthed(req, url);

  try {
    // --- API (ต้อง auth เสมอ) ---
    if (path.startsWith('/api/')) {
      if (!authed) return send(res, 401, { error: 'unauthorized' });

      if (path === '/api/status') {
        const s = getState();
        return send(res, 200, { ...s, runs: readRuns(25), liveLog: state.liveLog, commits: recentCommits(8), usage: getUsage(), models: config.models, contextWindow: activeContextWindow(), finalStages: config.finalTestStages.map((s) => ({ key: s.key, label: s.label })) });
      }
      if (path === '/api/notify-test' && req.method === 'POST') {
        notify({ title: '🔔 ทดสอบแจ้งเตือน RTB', message: 'ถ้าได้ยินเสียง+เห็นข้อความ = ตั้งค่า ntfy สำเร็จ', tags: ['bell'], priority: 'urgent', view: true });
        return send(res, 200, { sent: !!config.notify.topic, topic: config.notify.topic || null });
      }
      if (path === '/api/session') {
        return send(res, 200, readSession(url.searchParams.get('id') || ''));
      }
      if (path === '/api/run' && req.method === 'POST') {
        if (state.running) return send(res, 409, { error: 'กำลังทำงานอยู่ (ถ้าค้างให้กด "ปลดล็อกสถานะ")' });
        const body = await readBody(req);
        runOne({ force: !!body.force }).then((r) => { if (r && (r.skipped || r.error)) state.lastError = r.skipped || r.error; }).catch(() => {});
        return send(res, 202, { accepted: true, force: !!body.force });
      }
      if (path === '/api/reset' && req.method === 'POST') {
        // ปลดสถานะค้าง: running/lock/phase — ใช้เมื่อกดรันแล้วไม่มีอะไรเกิดขึ้น
        state.running = false; state.lastError = null; state.waitingLimit = null;
        state.resumeAfterReset = false;
        state.phase = 'idle'; state.currentTask = null; state.handoffRound = 0;
        releaseLock(true);
        return send(res, 200, { reset: true });
      }
      if (path === '/api/review' && req.method === 'POST') {
        if (state.running) return send(res, 409, { error: 'กำลังทำงานอยู่' });
        const body = await readBody(req);
        if (body.kind === 'final' && body.stage === 'all') { runFinalAll().catch(() => {}); return send(res, 202, { accepted: true, kind: 'final', stage: 'all' }); }
        runReview({ kind: body.kind === 'final' ? 'final' : 'review', stage: body.stage || null }).catch(() => {});
        return send(res, 202, { accepted: true, kind: body.kind || 'review', stage: body.stage || null });
      }
      if (path === '/api/model' && req.method === 'POST') {
        const body = await readBody(req);
        state.selectedModel = (body.model || '').trim();
        return send(res, 200, { selectedModel: state.selectedModel });
      }
      if (path === '/api/auto' && req.method === 'POST') {
        const body = await readBody(req);
        state.auto = !!body.on;
        if (state.auto && !state.running) runLoop().catch(() => {});
        return send(res, 200, { auto: state.auto });
      }
      if (path === '/api/approve' && req.method === 'POST') {
        const body = await readBody(req);
        // ไม่ await งานยาว (resume claude/merge อาจหลายนาที) — ตอบทันที กัน UI ค้าง แล้วให้ polling อัปเดตสถานะ
        resolveQueueItem(body.queueId, { answer: body.answer, action: body.action || 'approve' })
          .then((r) => { if (state.auto && (r.merged || r.dismissed) && config.autoMerge) runLoop().catch(() => {}); })
          .catch(() => {});
        return send(res, 202, { accepted: true });
      }
      if (path === '/api/restart' && req.method === 'POST') {
        if (state.running) return send(res, 409, { error: 'มีงานกำลังรันอยู่ — รอสถานะ idle ก่อนค่อย restart' });
        send(res, 200, { ok: true, restarting: true });
        releaseLock();
        setTimeout(() => restartSelf(), 300);
        return;
      }
      return send(res, 404, { error: 'not found' });
    }

    // --- dashboard page ---
    if (path === '/' || path === '/index.html') {
      if (!authed) return send(res, 401, LOGIN_PAGE, 'text/html; charset=utf-8');
      // ถ้า auth ผ่านด้วย ?token= ให้ตั้ง cookie แล้ว serve
      const setCookie = url.searchParams.get('token')
        ? { 'set-cookie': `dash=${encodeURIComponent(TOKEN)}; HttpOnly; SameSite=Lax; Max-Age=2592000; Path=/` }
        : {};
      return send(res, 200, readFileSync(join(PUBLIC_DIR, 'dashboard.html'), 'utf8'), 'text/html; charset=utf-8', setCookie);
    }

    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});


// --- ปุ่ม Restart บน dashboard ---
// อ่านค่า .env ใหม่ตอน restart — แก้ .env แล้วกดปุ่มได้เลย ไม่ต้องเปิด terminal ไป source ใหม่
function readEnvFile() {
  try {
    const out = {};
    for (const line of readFileSync(join(REPO_ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
    return out;
  } catch { return {}; }
}
// เกิดใหม่ผ่าน sh: sleep สั้น ๆ ให้ process เดิมปิด port ก่อน แล้ว exec node ตัวเดิม args เดิม (กัน EADDRINUSE)
function restartSelf() {
  const cmd = [process.execPath, ...process.argv.slice(1)]
    .map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ');
  spawn('/bin/sh', ['-c', `sleep 0.7; exec ${cmd}`], {
    cwd: process.cwd(),
    env: { ...process.env, ...readEnvFile() },
    detached: true,
    stdio: 'ignore',
  }).unref();
  try { server.closeAllConnections?.(); } catch { /* ignore */ }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
}

server.listen(config.port, HOST, () => {
  console.log(`\n  RTB Orchestrator dashboard → http://localhost:${config.port}/?token=${TOKEN}`);
  console.log(`  bind=${HOST} · autoMerge=${config.autoMerge} · permission=${config.permission} · claude="${config.claudeBin}"`);
  console.log(`  token เก็บที่ orchestrator/.token (ตั้งเองผ่าน env RTB_DASH_TOKEN ได้)\n`);
  if (clearDeadLock()) console.log('  (ล้าง .run.lock ที่ค้างจาก process เก่าแล้ว)');
  // ดึงโควตา subscription (claude -p /usage) — ถี่ขึ้นตอนกำลังรัน (2 นาที) ปกติ 5 นาที
  let lastPlan = 0;
  refreshPlanLimits().then(() => { lastPlan = Date.now(); }).catch(() => {});
  setInterval(() => {
    const interval = state.running ? 120000 : 300000;
    if (Date.now() - lastPlan >= interval) { lastPlan = Date.now(); refreshPlanLimits().catch(() => {}); }
  }, 30000);
  // รอ limit reset แล้วเดินงานต่อเอง
  setInterval(() => tryResumeFromLimit().catch(() => {}), config.limitResumePollMs);
  // เฝ้าโหมด Auto: ว่างเมื่อไหร่หยิบงานถัดไปเอง (ทุก 60 วิ)
  setInterval(() => autoWatchdog().catch(() => {}), 60000);
});
