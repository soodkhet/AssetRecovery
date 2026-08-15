import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * ยามของ run lock (`orchestrator/lib/lock.mjs`)
 *
 * บั๊กที่เทสต์ชุดนี้กัน (2026-08-15): ล็อกเดิมมองข้าม pid ของตัวเอง ⇒ **server เดียวกันยึดล็อก
 * ซ้อนตัวเองได้** — `runLoop()` สองตัวจึงหยิบ task เดียวกันพร้อมกันแล้วยิง `claude -p` สอง session
 * บน branch เดียวกัน (Phase 3.3 runId 795b8370 + a177212f) เขียนไฟล์ทับกัน
 *
 * ⚠️ ทุกเทสต์ใช้ไฟล์ล็อกใน tmp ผ่าน `RTB_LOCK_FILE` — **ห้ามแตะ `orchestrator/.run.lock` จริง**
 * เพราะ orchestrator อาจกำลังรันงานอยู่ระหว่างที่เทสต์วิ่ง
 */

const LOCK_PATH = join(tmpdir(), `rtb-lock-test-${process.pid}.json`);
process.env.RTB_LOCK_FILE = LOCK_PATH;

/** pid ที่ไม่มีทางมีชีวิต (เกินเพดาน pid ของทุก OS ที่ใช้จริง) */
const DEAD_PID = 4_194_305;

let lock;

beforeAll(async () => {
  lock = await import('./lock.mjs');
});

afterEach(() => {
  try { rmSync(LOCK_PATH); } catch { /* ไม่มีไฟล์ = ปกติ */ }
});

afterAll(() => {
  delete process.env.RTB_LOCK_FILE;
});

describe('acquireLock / releaseLock', () => {
  it('ยึดล็อกได้เมื่อยังไม่มีใครถือ + เขียนไฟล์จริง', () => {
    expect(lock.acquireLock()).toEqual({ ok: true });
    expect(existsSync(LOCK_PATH)).toBe(true);
    expect(lock.lockHeld()).toBe(true);
  });

  it('ยึดซ้อนใน process เดียวกันไม่ได้ (บั๊ก task ถูกหยิบซ้ำ 2 session)', () => {
    expect(lock.acquireLock().ok).toBe(true);
    const second = lock.acquireLock();
    expect(second.ok).toBe(false);
    expect(second.samePid).toBe(true);
    expect(second.pid).toBe(process.pid);
  });

  it('ปล่อยแล้วยึดใหม่ได้', () => {
    expect(lock.acquireLock().ok).toBe(true);
    lock.releaseLock();
    expect(lock.lockHeld()).toBe(false);
    expect(lock.acquireLock().ok).toBe(true);
  });

  it('ล็อกของ process ที่ตายไปแล้ว = ยึดต่อได้ (ไม่ค้างถาวร)', () => {
    writeFileSync(LOCK_PATH, JSON.stringify({ pid: DEAD_PID, at: new Date().toISOString() }));
    expect(lock.lockHeld()).toBe(false);
    expect(lock.acquireLock().ok).toBe(true);
  });

  it('ไฟล์ล็อกเสีย (ไม่ใช่ JSON) = ยึดต่อได้', () => {
    writeFileSync(LOCK_PATH, 'ไม่ใช่ JSON');
    expect(lock.acquireLock().ok).toBe(true);
  });

  it('`releaseLock()` ธรรมดาไม่ลบล็อกของ process อื่น — ต้อง force เท่านั้น', () => {
    writeFileSync(LOCK_PATH, JSON.stringify({ pid: DEAD_PID, at: new Date().toISOString() }));
    lock.releaseLock();
    expect(existsSync(LOCK_PATH)).toBe(true);
    lock.releaseLock(true);
    expect(existsSync(LOCK_PATH)).toBe(false);
  });
});

describe('clearDeadLock (เรียกตอน server บูต)', () => {
  it('ล้างล็อกที่เจ้าของตายแล้ว', () => {
    writeFileSync(LOCK_PATH, JSON.stringify({ pid: DEAD_PID, at: new Date().toISOString() }));
    expect(lock.clearDeadLock()).toBe(true);
    expect(existsSync(LOCK_PATH)).toBe(false);
  });

  it('ล้างซาก pid ที่ถูกใช้ซ้ำเป็น pid ของเราเอง (ตอนบูตเรายังไม่ถือล็อก)', () => {
    writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    expect(lock.clearDeadLock()).toBe(true);
    expect(existsSync(LOCK_PATH)).toBe(false);
  });

  it('ไม่มีไฟล์ล็อก = ไม่ต้องล้าง', () => {
    expect(lock.clearDeadLock()).toBe(false);
  });
});

describe('launchWhenFree', () => {
  it('รอจนล็อกถูกปล่อยแล้วค่อยเริ่มงานที่สั่งไว้', async () => {
    expect(lock.acquireLock().ok).toBe(true);
    let started = false;
    lock.launchWhenFree(() => { started = true; }, { tries: 40, delayMs: 5 });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started, 'ยังถือล็อกอยู่ ต้องยังไม่เริ่ม').toBe(false);

    lock.releaseLock();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(started, 'ปล่อยล็อกแล้วต้องเริ่มงานที่ค้างไว้').toBe(true);
  });

  it('ยอมแพ้เงียบ ๆ เมื่อรอจนหมดจำนวนครั้ง (ไม่ค้างเป็น timer อมตะ)', async () => {
    expect(lock.acquireLock().ok).toBe(true);
    let started = false;
    lock.launchWhenFree(() => { started = true; }, { tries: 2, delayMs: 5 });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(started).toBe(false);
  });
});
