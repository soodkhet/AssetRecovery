// Queue — งานที่รอคนตัดสินใจ/อนุมัติ + run log (เก็บเป็นไฟล์ JSON)
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { QUEUE_DIR, LOG_DIR } from '../config.mjs';

function ensure(dir) { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); }

// type: 'decision' | 'merge' | 'verify_failed' | 'error' | 'limit'
export function park(item) {
  ensure(QUEUE_DIR);
  // กันการ์ดซ้ำ: ถ้ามีใบ pending เรื่องเดียวกันค้างอยู่แล้ว (type+task+คำถามเดียวกัน) ใช้ใบเดิม
  const dup = listQueue('pending').find(
    (q) => q.type === item.type && q.taskId === item.taskId && q.question === item.question,
  );
  if (dup) return dup;
  const id = item.id || randomUUID().slice(0, 8);
  const rec = { id, status: 'pending', createdAt: new Date().toISOString(), ...item };
  writeFileSync(join(QUEUE_DIR, `${id}.json`), JSON.stringify(rec, null, 2));
  return rec;
}

export function listQueue(status) {
  ensure(QUEUE_DIR);
  return readdirSync(QUEUE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(QUEUE_DIR, f), 'utf8')))
    .filter((r) => (status ? r.status === status : true))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getQueue(id) {
  const f = join(QUEUE_DIR, `${id}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

export function updateQueue(id, patch) {
  const rec = getQueue(id);
  if (!rec) return null;
  const next = { ...rec, ...patch };
  writeFileSync(join(QUEUE_DIR, `${id}.json`), JSON.stringify(next, null, 2));
  return next;
}


// ปิดการ์ดค้างของ task ที่ทำจนจบ (merged) แล้ว — error/verify_failed/decision ที่ยัง pending/processing
// ของ task เดียวกันถือว่าหมดความหมาย (เช่น session ล้มแล้ว retry รอบใหม่สำเร็จ) → resolve อัตโนมัติ
export function resolveStaleForTask(taskId, note) {
  const stale = listQueue().filter(
    (q) =>
      q.taskId === taskId &&
      (q.status === 'pending' || q.status === 'processing') &&
      ['error', 'verify_failed', 'decision'].includes(q.type),
  );
  for (const q of stale) {
    updateQueue(q.id, {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolution: 'auto-closed',
      note: note || 'task ทำจนจบ (merged) แล้ว — ปิดการ์ดค้างอัตโนมัติ',
    });
  }
  return stale.length;
}

// --- run log (append-only) ---
export function appendRun(entry) {
  ensure(LOG_DIR);
  const f = join(LOG_DIR, 'runs.jsonl');
  const rec = { ts: new Date().toISOString(), ...entry };
  const prev = existsSync(f) ? readFileSync(f, 'utf8') : '';
  writeFileSync(f, prev + JSON.stringify(rec) + '\n');
  return rec;
}

export function readRuns(limit = 30) {
  const f = join(LOG_DIR, 'runs.jsonl');
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .slice(-limit)
    .reverse();
}

export function writeSessionLog(runId, text) {
  ensure(LOG_DIR);
  writeFileSync(join(LOG_DIR, `session-${runId}.log`), text);
}
