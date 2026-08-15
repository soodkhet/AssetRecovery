import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * ยามกัน **หยิบงานซ้ำ** ของ engine (บั๊ก 2026-08-15 — Phase 3.3 ถูกหยิบพร้อมกัน 2 session
 * บน branch `auto/phase-3.3` แล้วเขียนไฟล์ทับกัน)
 *
 * กติกาที่เทสต์นี้ล็อกไว้: **ถ้ามีงานถือ run lock อยู่ ทั้ง `runOne()` และ `runLoop()` ต้องไม่เริ่มงานใหม่**
 * (เดิม `runLoop()` ไม่ถือล็อกเลย และล็อกก็มองข้าม pid ตัวเอง ⇒ ยิง `claude -p` ซ้อนกันได้)
 *
 * ⚠️ เทสต์นี้เรียก `runOne`/`runLoop` **ขณะถือล็อกไว้ก่อนเสมอ** จึงไม่มีทางไปสั่งงานจริง
 * และใช้ไฟล์ล็อกใน tmp (`RTB_LOCK_FILE`) ไม่แตะล็อกจริงของ orchestrator ที่อาจกำลังรันอยู่
 */

const LOCK_PATH = join(tmpdir(), `rtb-run-guard-test-${process.pid}.json`);
process.env.RTB_LOCK_FILE = LOCK_PATH;

let lock;
let engine;

beforeAll(async () => {
  lock = await import('./lock.mjs');
  engine = await import('./engine.mjs');
});

afterEach(() => {
  lock.releaseLock(true);
  try { rmSync(LOCK_PATH); } catch { /* ไม่มีไฟล์ = ปกติ */ }
});

afterAll(() => {
  delete process.env.RTB_LOCK_FILE;
});

describe('มีงานถือล็อกอยู่ = ห้ามเริ่มงานซ้อน', () => {
  it('`runOne()` ข้ามไป พร้อมบอกว่าเป็นงานใน server เดียวกัน', async () => {
    expect(lock.acquireLock().ok).toBe(true);
    const r = await engine.runOne();
    expect(r.skipped).toBeTruthy();
    expect(r.skipped).toContain('server นี้');
  });

  it('`runLoop()` ข้ามไปเช่นกัน — ไม่วนหยิบ task ใหม่', async () => {
    expect(lock.acquireLock().ok).toBe(true);
    const results = await engine.runLoop();
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0].skipped).toBeTruthy();
  });

  it('`autoWatchdog()` ไม่หยิบงานใหม่ขณะมีล็อกค้าง (ช่วงที่ state.running ยังไม่ถูกตั้ง)', async () => {
    expect(lock.acquireLock().ok).toBe(true);
    engine.state.auto = true;
    engine.state.running = false;
    await expect(engine.autoWatchdog()).resolves.toBeUndefined();
    // ล็อกยังเป็นของเรา = watchdog ไม่ได้ไปเริ่มงานอะไรทับ
    expect(lock.acquireLock().ok).toBe(false);
    engine.state.auto = false;
  });
});
