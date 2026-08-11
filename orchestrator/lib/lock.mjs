// Cross-process lock — กันไม่ให้ orchestrator หลาย process รันงานพร้อมกัน (ต้นเหตุ branch ซ้ำ/conflict)
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ORCH_DIR } from '../config.mjs';

const LOCK = join(ORCH_DIR, '.run.lock');

function alive(pid) {
  if (!pid || pid === process.pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; } // ยิง signal 0 = เช็คว่ายังมีชีวิต
}

// คืน { ok:true } ถ้ายึดล็อกได้ / { ok:false, pid } ถ้ามี process อื่นถืออยู่
export function acquireLock() {
  if (existsSync(LOCK)) {
    try {
      const { pid } = JSON.parse(readFileSync(LOCK, 'utf8'));
      if (alive(pid)) return { ok: false, pid };
    } catch { /* ไฟล์เสีย/ตายแล้ว → ยึดต่อ */ }
  }
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  return { ok: true };
}

export function releaseLock(force = false) {
  try {
    if (existsSync(LOCK)) {
      const { pid } = JSON.parse(readFileSync(LOCK, 'utf8'));
      if (force || pid === process.pid) rmSync(LOCK);
    }
  } catch { if (force) { try { rmSync(LOCK); } catch { /* ignore */ } } }
}

// ล้าง lock ที่ค้างจาก process ที่ตายไปแล้ว (เรียกตอน server บูต)
export function clearDeadLock() {
  try {
    if (!existsSync(LOCK)) return false;
    const { pid } = JSON.parse(readFileSync(LOCK, 'utf8'));
    if (!alive(pid)) { rmSync(LOCK); return true; }
  } catch { try { rmSync(LOCK); return true; } catch { /* ignore */ } }
  return false;
}
