/**
 * ยามของ `progress.mjs` — parser ที่แดชบอร์ด/orchestrator ใช้ตัดสินว่า "งานถัดไปคืออะไร"
 *
 * ที่มา (2026-08-09): แดชบอร์ดรายงาน **144/144 = 100% "งานทั้งหมดเสร็จแล้ว"** ทั้งที่ `RET-2b`
 * เป็น ⬜ อยู่ในตาราง และมีคิวงาน 2.6c–2.6e รออยู่ — บั๊ก 2 ตัวซ้อนกัน:
 *   1. `ID_PAT` เป็น `[A-Z]{1,2}[0-9]*` ⇒ รับตัวพิมพ์ใหญ่ได้แค่ 1–2 ตัว ⇒ **ทิ้งแถวเงียบ ๆ 35 แถว**
 *      (`RET-2b`/`OPS-*`/`UAT-*`/`SYNC-*`/`LHCI-*`/`PLATE-FONT`/`DESIGN-BACK-*`)
 *   2. regex ของ `## 🎯 งานถัดไป` บังคับคำว่า `Phase` ⇒ หัวข้อรูปแบบ `— **2.6c ...` ไม่แมตช์
 * สองอย่างพังพร้อมกันเลยได้ "ไม่มีงานเหลือ" ซึ่งเป็นสถานะผิดที่อันตรายที่สุด (ดูเหมือนไม่ต้องทำอะไร)
 *
 * เทสต์ตัวที่สำคัญที่สุดคือ "ไม่มีแถวไหนหายไปเงียบ ๆ" — มันคุม id รูปแบบใหม่ที่ยังไม่เกิดด้วย
 * โดยไม่ต้องมาไล่เพิ่มรายการเอง
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROGRESS_FILE } from "../config.mjs";
import { parseProgress, pickNextTask } from "./progress.mjs";

const progress = parseProgress();
const text = readFileSync(PROGRESS_FILE, "utf8");

/** แถวตารางที่ "เป็นงานจริง" นับจากตัวไฟล์ตรง ๆ (ก่อนถึง section บันทึกการตัดสินใจ) */
function countTaskRowsInFile() {
  const lines = text.split("\n");
  const stop = lines.findIndex((l) => /^##\s*บันทึกการตัดสินใจ/.test(l));
  const scope = stop === -1 ? lines : lines.slice(0, stop);
  let inPhase = false;
  let n = 0;
  for (const line of scope) {
    if (/^##\s*Phase\s/.test(line)) { inPhase = true; continue; }
    if (/^##\s/.test(line)) { inPhase = false; continue; }
    if (!inPhase || !line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    cells.shift();
    if (cells[cells.length - 1] === "") cells.pop();
    if (cells.length < 3) continue;
    if (/[✅🔄⬜⏸]/.test(cells[2])) n++;
  }
  return n;
}

describe("progress.mjs — ไม่ทิ้งแถวเงียบ ๆ", () => {
  it("นับงานได้ครบทุกแถวที่มีสถานะในไฟล์จริง (กัน id รูปแบบใหม่หลุด parser)", () => {
    expect(progress.stats.total).toBe(countTaskRowsInFile());
  });

  it("รับ id ทุกแบบที่ใช้จริงในโปรเจกต์ — รวมตัวพิมพ์ใหญ่ยาวเกิน 2 ตัว", () => {
    const ids = new Set(progress.phases.flatMap((p) => p.tasks.map((t) => t.id)));
    // ตัวแทนของรูปแบบที่ **เคยถูกทิ้ง** ทั้งหมด + รูปแบบเดิมที่ต้องไม่พัง
    for (const id of ["RET-2b", "OPS-1", "UAT-15", "SYNC-GUARD", "LHCI-FIX", "PLATE-FONT", "1.2a", "P.2a", "V2.1a", "FT-1L2"]) {
      expect(ids, `id "${id}" หายไปจาก parser`).toContain(id);
    }
  });
});

describe("progress.mjs — งานถัดไป", () => {
  it("อ่านหัวข้อ 🎯 ได้ทั้งรูปแบบที่มีและไม่มีคำว่า Phase", () => {
    expect(progress.nextTask).not.toBeNull();
    expect(progress.nextTask.id).toBeTruthy();
    // ต้องไม่มี `*` ของ markdown ค้างในชื่องาน
    expect(progress.nextTask.title).not.toMatch(/\*/);
  });

  it("หยิบงานถัดไปได้เสมอตราบใดที่ยังมี ⬜/🔄 เหลือ (กันรายงาน 'งานครบแล้ว' ผิด ๆ)", () => {
    const pending = progress.stats.todo + progress.stats.doing;
    if (pending > 0) expect(pickNextTask(progress), `มีงานค้าง ${pending} แต่หยิบไม่ได้`).not.toBeNull();
  });

  it("เปอร์เซ็นต์ต้องไม่ 100 ถ้ายังมีงานค้าง", () => {
    if (progress.stats.todo + progress.stats.doing > 0) expect(progress.stats.percent).toBeLessThan(100);
  });
});

/**
 * ยามกันลูปงานไม่รู้จบ (เหตุการณ์จริง 2026-08-09)
 *
 * `SEC-CSP-3` ทำไม่ได้เพราะรอ CSP violation จาก production (ไม่ใช่รอโค้ด) และ **ไม่มีแถวในตาราง**
 * โค้ดเก่าถ้าหา id จากหัวข้อ 🎯 ไม่เจอจะสังเคราะห์เป็น `status:'todo'` ⇒ engine หยิบมาทำ →
 * agent ทำอะไรไม่ได้ → merge → หยิบมาใหม่ใน 7 วินาที · วน ~2 ชม. เผา session Opus 5 ไป 3 รอบ
 */
const fakePhase = (tasks) => ({ phases: [{ name: 'P', locked: false, tasks }], nextTask: null });

describe("pickNextTask — ห้ามวนงานเดิมไม่รู้จบ", () => {
  it("หัวข้อ 🎯 ชี้ id ที่ไม่มีแถวในตาราง → ห้ามสังเคราะห์เป็น todo", () => {
    const p = { ...fakePhase([{ id: 'A1', status: 'done' }]), nextTask: { id: 'GHOST' } };
    expect(pickNextTask(p)).toBeNull();
  });

  it("id ที่ไม่มีแถว แต่ยังมีงานอื่นค้าง → ต้องหยิบงานที่มีจริงแทน", () => {
    const p = { ...fakePhase([{ id: 'A1', status: 'done' }, { id: 'A2', status: 'todo' }]), nextTask: { id: 'GHOST' } };
    expect(pickNextTask(p)?.id).toBe('A2');
  });

  it("หัวข้อ 🎯 ค้างชี้แถวที่ ✅ แล้ว → ข้ามไปงานถัดไป ไม่สั่งทำซ้ำ", () => {
    const p = { ...fakePhase([{ id: 'A1', status: 'done' }, { id: 'A2', status: 'todo' }]), nextTask: { id: 'A1' } };
    expect(pickNextTask(p)?.id).toBe('A2');
  });

  it("หัวข้อ 🎯 ชี้แถวที่ ⏸️ (บล็อก) → ข้าม ไม่ยัดกลับเข้าคิว", () => {
    const p = { ...fakePhase([{ id: 'A1', status: 'blocked' }, { id: 'A2', status: 'todo' }]), nextTask: { id: 'A1' } };
    expect(pickNextTask(p)?.id).toBe('A2');
  });

  it("ทุกงานเสร็จ/บล็อกหมด → คืน null (ปล่อยให้ engine ไป final test แทนที่จะวน)", () => {
    const p = { ...fakePhase([{ id: 'A1', status: 'done' }, { id: 'A2', status: 'blocked' }]), nextTask: { id: 'A2' } };
    expect(pickNextTask(p)).toBeNull();
  });
});
