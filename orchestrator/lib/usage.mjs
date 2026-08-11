// สรุปการใช้งาน AI:
// (A) โควตา subscription จริง — รัน `claude -p "/usage"` แล้ว parse ข้อความ (เวอร์ชันนี้คายออกมาได้)
// (B) cost/turns ที่ orchestrator รันเอง — จาก runs.jsonl (เชื่อถือ 100%)
// (C) token/cost ข้ามทุก session — ccusage (อ่าน ~/.claude)
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOG_DIR, config, REPO_ROOT } from '../config.mjs';

const todayStr = () => new Date().toISOString().slice(0, 10);
const RUNS = join(LOG_DIR, 'runs.jsonl');
const RL_FILE = join(LOG_DIR, 'usage.json');
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

// ================= (A) โควตา subscription จาก `claude -p "/usage"` =================
let planCache = null;

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// แปลงข้อความ reset → ISO timestamp (รองรับ "in 6 min", "Jul 26 at 6:59pm", "Sun 7:00 PM")
function parseResetToISO(raw) {
  if (!raw) return null;
  const s = raw.replace(/\(.*?\)/g, '').trim();
  let m = s.match(/in\s+(\d+)\s*(sec|min|minute|hour|hr|day)/i);
  if (m) {
    const n = +m[1]; const u = m[2].toLowerCase();
    const ms = u.startsWith('sec') ? 1000 : u.startsWith('min') ? 60000 : u.startsWith('h') ? 3600000 : 86400000;
    return new Date(Date.now() + n * ms).toISOString();
  }
  m = s.match(/([A-Za-z]{3,})\s+(\d{1,2})\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mon == null) return null;
    let h = +m[3] % 12; if (/pm/i.test(m[5])) h += 12;
    const d = new Date(); d.setMonth(mon, +m[2]); d.setHours(h, +m[4], 0, 0);
    if (d.getTime() < Date.now() - 2 * 86400000) d.setFullYear(d.getFullYear() + 1);
    return d.toISOString();
  }
  m = s.match(/([A-Za-z]{3,})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (m) {
    const dw = DOW[m[1].slice(0, 3).toLowerCase()]; if (dw == null) return null;
    let h = +m[2] % 12; if (/pm/i.test(m[4])) h += 12;
    const d = new Date(); d.setDate(d.getDate() + ((dw - d.getDay() + 7) % 7)); d.setHours(h, +m[3], 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 7);
    return d.toISOString();
  }
  return null;
}

function parseUsageText(raw) {
  const text = stripAnsi(raw);
  const limits = [];
  const sess = text.match(/Current session:\s*(\d+)%\s*used[^·\n]*·\s*resets?\s*([^\n]+)/i);
  if (sess) limits.push({ key: 'session', label: 'เซสชัน (5 ชม.)', pct: +sess[1], reset: sess[2].trim(), resetAt: parseResetToISO(sess[2]) });
  const re = /Current week \(([^)]+)\):\s*(\d+)%\s*used[^·\n]*·\s*resets?\s*([^\n]+)/gi;
  let m;
  while ((m = re.exec(text))) limits.push({ key: `week:${m[1]}`, label: `สัปดาห์ · ${m[1]}`, pct: +m[2], reset: m[3].trim(), resetAt: parseResetToISO(m[3]) });
  if (!limits.length) return { ok: false, error: 'parse /usage ไม่ได้', raw: text.slice(0, 300), at: new Date().toISOString() };
  const s24 = text.match(/Last 24h[^\n]*/);
  const s7 = text.match(/Last 7d[^\n]*/);
  return { ok: true, limits, last24h: s24 ? s24[0].trim() : null, last7d: s7 ? s7[0].trim() : null, at: new Date().toISOString() };
}

export function refreshPlanLimits() {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = (v) => { if (done) return; done = true; planCache = v; resolve(v); };
    let child;
    const uenv = config.claudeConfigDir ? { ...process.env, CLAUDE_CONFIG_DIR: config.claudeConfigDir } : process.env;
    try { child = spawn(config.claudeBin, ['-p', '/usage'], { cwd: REPO_ROOT, timeout: 60000, env: uenv }); }
    catch (e) { return finish({ ok: false, error: `spawn: ${e.message}`, at: new Date().toISOString() }); }
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => finish({ ok: false, error: `claude ไม่พร้อม: ${e.message}`, at: new Date().toISOString() }));
    child.on('close', () => finish(parseUsageText(out)));
  });
}

// ================= (B) run totals ของ orchestrator =================
export function runTotals() {
  if (!existsSync(RUNS)) return { runs: 0, costTotal: 0, costToday: 0, turnsTotal: 0, merged: 0 };
  const rows = readFileSync(RUNS, 'utf8').trim().split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  let runs = 0, costTotal = 0, costToday = 0, turnsTotal = 0, merged = 0;
  let lastContext = null, lastTokensIn = null, lastTokensOut = null, lastTaskId = null;
  const td = todayStr();
  for (const r of rows) {
    if (r.event === 'claude-done') {
      runs++;
      if (r.cost) { costTotal += r.cost; if ((r.ts || '').slice(0, 10) === td) costToday += r.cost; }
      if (r.turns) turnsTotal += r.turns;
      if (r.peakContext != null) lastContext = r.peakContext;
      if (r.tokensIn != null) lastTokensIn = r.tokensIn;
      if (r.tokensOut != null) lastTokensOut = r.tokensOut;
      if (r.taskId) lastTaskId = r.taskId;
    }
    if (r.event === 'merged' || r.event === 'merged-approved') merged++;
  }
  return { runs, costTotal: +costTotal.toFixed(4), costToday: +costToday.toFixed(4), turnsTotal, merged, lastContext, lastTokensIn, lastTokensOut, lastTaskId };
}

// เก็บ rate_limits ถ้า response ส่งมา (เผื่ออนาคต) — ปัจจุบัน /usage เป็นแหล่งหลัก
export function saveRateLimits(rl) {
  try { writeFileSync(RL_FILE, JSON.stringify({ rateLimits: rl, at: new Date().toISOString() })); } catch { /* ignore */ }
}

// ================= (C) ccusage =================
let ccCache = null;
function pick(o) {
  if (!o) return null;
  const sum = (o.inputTokens || 0) + (o.outputTokens || 0) + (o.cacheCreationTokens || 0) + (o.cacheReadTokens || 0);
  return { tokens: o.totalTokens ?? (sum || null), cost: o.totalCost ?? o.costUSD ?? null };
}
export function refreshCcusage() {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = (v) => { if (done) return; done = true; ccCache = v; resolve(v); };
    let child;
    try { child = spawn('npx', ['-y', 'ccusage@latest', 'daily', '--json'], { timeout: 60000 }); }
    catch (e) { return finish({ ok: false, error: `spawn: ${e.message}` }); }
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', (e) => finish({ ok: false, error: `ccusage ไม่พร้อม: ${e.message}` }));
    child.on('close', () => {
      try {
        const p = JSON.parse(out);
        const rows = p.daily || p.data || [];
        const row = rows.find((r) => String(r.date || '').startsWith(todayStr())) || null;
        finish({ ok: true, today: pick(row), total: pick(p.totals) });
      } catch { finish({ ok: false, error: 'อ่านผล ccusage ไม่ได้' }); }
    });
  });
}

export function getPlanLimits() { return planCache; }

export function getUsage() {
  return { planLimits: planCache, runTotals: runTotals(), ccusage: ccCache };
}
