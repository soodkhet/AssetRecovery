// Run lock — กันไม่ให้มีงาน orchestrator วิ่งพร้อมกันเกิน 1 งาน (ต้นเหตุ branch ซ้ำ/session ซ้ำ/conflict)
//
// ⚠️ บั๊กที่ไฟล์นี้แก้ (2026-08-15): เดิม `alive()` คืน false เมื่อ pid เป็นของ process ตัวเอง
// ⇒ **process เดียวกันยึดล็อกซ้อนตัวเองได้** — `runLoop()` สองตัวใน server เดียวกันจึงยิง
// `claude -p` ของ task เดียวกันพร้อมกัน 2 session บน branch เดียวกัน (runId 795b8370 + a177212f
// ของ Phase 3.3) แล้วเขียนไฟล์ทับกัน · ตอนนี้ล็อกกัน **ทั้งข้าม process และในตัวเอง**
//
// เขียนไฟล์แบบ `wx` (สร้างใหม่เท่านั้น) ⇒ การยึดล็อกเป็น atomic จริงระดับ filesystem
// ไม่ใช่ "เช็คแล้วค่อยเขียน" ที่แทรกกันได้
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ORCH_DIR } from '../config.mjs';

// override ได้เพื่อให้เทสต์ไม่ไปแตะล็อกจริงของ orchestrator ที่กำลังรันอยู่
const LOCK = process.env.RTB_LOCK_FILE || join(ORCH_DIR, '.run.lock');

export function lockFile() { return LOCK; }

// process ยังมีชีวิตอยู่ไหม — **นับ pid ของตัวเองว่ามีชีวิตด้วย** (จุดที่เคยพลาด)
function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function holder() {
  try { return JSON.parse(readFileSync(LOCK, 'utf8')); } catch { return null; }
}

function write() {
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: 'wx' });
}

// คืน { ok:true } ถ้ายึดล็อกได้ / { ok:false, pid, samePid } ถ้ามีงานอื่นถืออยู่
export function acquireLock() {
  try { write(); return { ok: true }; } catch { /* มีไฟล์อยู่แล้ว → ดูว่าเจ้าของยังอยู่ไหม */ }

  const held = holder();
  const pid = held?.pid ?? null;
  if (alive(pid)) return { ok: false, pid, samePid: pid === process.pid };

  // เจ้าของตายไปแล้ว (หรือไฟล์เสีย) → เก็บกวาดแล้วยึดต่อ · แพ้การแข่งตอนนี้ = ยอมให้อีกฝ่ายไป
  try { rmSync(LOCK); } catch { /* ignore */ }
  try { write(); return { ok: true }; } catch { return { ok: false, pid: holder()?.pid ?? null }; }
}

export function releaseLock(force = false) {
  try {
    if (!existsSync(LOCK)) return;
    const pid = holder()?.pid ?? null;
    if (force || pid === process.pid) rmSync(LOCK);
  } catch { if (force) { try { rmSync(LOCK); } catch { /* ignore */ } } }
}

// มีงานถือล็อกอยู่จริงไหม (เจ้าของยังมีชีวิต) — ใช้โดย `launchWhenFree()`
export function lockHeld() {
  if (!existsSync(LOCK)) return false;
  return alive(holder()?.pid ?? null);
}

// ล้าง lock ที่ค้างจาก process ที่ตายไปแล้ว (เรียกตอน server บูต)
// ตอนบูตเรายังไม่ถือล็อกใดๆ ⇒ ไฟล์ที่เขียน pid เท่ากับเรา = ซาก pid ที่ถูกใช้ซ้ำ ล้างได้เลย
export function clearDeadLock() {
  try {
    if (!existsSync(LOCK)) return false;
    const pid = holder()?.pid ?? null;
    if (pid === process.pid || !alive(pid)) { rmSync(LOCK); return true; }
  } catch { try { rmSync(LOCK); return true; } catch { /* ignore */ } }
  return false;
}

/**
 * สั่งงานใหม่ให้เริ่ม "หลังงานปัจจุบันปล่อยล็อกแล้ว"
 *
 * จำเป็นเพราะจุดที่สั่งงานต่อบางจุด (`resolveCore` → retry/force run) ทำงาน**ขณะยังถือล็อกอยู่**
 * — ถ้าเรียกตรง ๆ งานใหม่จะถูกล็อกปฏิเสธแล้วหายเงียบ · รอจนว่างแล้วค่อยเริ่ม (หมดเวลา = ยอมแพ้เงียบ)
 */
export function launchWhenFree(fn, { tries = 240, delayMs = 250 } = {}) {
  let left = tries;
  const tick = () => {
    if (!lockHeld()) { try { fn(); } catch { /* ignore */ } return; }
    if (--left <= 0) return;
    setTimeout(tick, delayMs).unref?.();
  };
  setTimeout(tick, delayMs).unref?.();
}
