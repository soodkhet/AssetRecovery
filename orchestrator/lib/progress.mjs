// Parse PROGRESS.md → โครงสร้างสถานะงาน (single source of truth ของโปรเจกต์)
import { readFileSync } from 'node:fs';
import { PROGRESS_FILE } from '../config.mjs';

/**
 * รองรับ id: 1 · 1.2 · 2.5a · P.1 · P.2a · 2.5a-2 · 6.2b-pub · 5.4-a1 · V2.1a
 * **และ id ที่ขึ้นต้นด้วยตัวพิมพ์ใหญ่ยาวเท่าไหร่ก็ได้**: RET-2b · OPS-1 · UAT-15 · SYNC-GUARD ·
 * LHCI-FIX · PLATE-FONT · DESIGN-BACK-a · HASORDER-FIX
 *
 * ⚠️ ของเดิมเป็น `[A-Z]{1,2}[0-9]*` = รับตัวพิมพ์ใหญ่ได้แค่ 1–2 ตัว ⇒ **ทิ้งแถวเงียบ ๆ 38 แถว**
 * (`RET-2b`/`OPS-*`/`UAT-*`/`SYNC-*`/`LHCI-*`/`PLATE-FONT`/`DESIGN-BACK-*` ไม่แมตช์เลย) ผลคือ
 * แดชบอร์ดรายงาน **144/144 = 100% "งานทั้งหมดเสร็จแล้ว"** ทั้งที่ `RET-2b` เป็น ⬜ อยู่ในตาราง
 * — สถานะผิดแบบเงียบที่อันตรายที่สุด เพราะดูเหมือนไม่มีอะไรต้องทำ
 *
 * ตัวคั่นท้าย id รับ `-` `–` `—` `/` `…` เพราะมี id แบบ **กลุ่ม/ช่วง** ที่เป็นแถวงานจริง:
 * `FT-1…1g` · `FT-3a–c` · `FT-2a–2d` · `FT-5c/5d` (นับเป็น 1 งานต่อแถวตามที่ตารางเขียนไว้)
 */
const ID_PAT = '(?:[0-9]+|[A-Z][A-Z0-9]*)(?:\\.[0-9]+)?[a-z]?(?:[-–—/…][A-Za-z0-9]+)*';
const TASK_ID = new RegExp(`^(${ID_PAT})$`);
const NEXT_ID = ID_PAT;

function detectStatus(cell) {
  if (cell.includes('✅')) return 'done';
  if (cell.includes('🔄')) return 'doing';
  if (cell.includes('⏸')) return 'blocked';
  if (cell.includes('⬜')) return 'todo';
  return 'unknown';
}

function extractCommits(note) {
  const out = [];
  const re = /`([0-9a-f]{7,40})`/g;
  let m;
  while ((m = re.exec(note))) out.push(m[1]);
  return out;
}

export function parseProgress(file = PROGRESS_FILE) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  let updatedAt = null;
  let nextTask = null;
  const phases = [];
  let current = null;
  let stopTables = false;

  for (const line of lines) {
    // อัปเดตล่าสุด
    if (!updatedAt) {
      const u = line.match(/\*\*อัปเดตล่าสุด:\*\*\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
      if (u) updatedAt = u[1];
    }

    /**
     * งานถัดไป — รับได้ทั้ง 2 รูปแบบที่เคยใช้จริงใน PROGRESS.md:
     *   `## 🎯 งานถัดไป — Phase 2.6c: ชื่องาน`   (รูปแบบเดิม)
     *   `## 🎯 งานถัดไป — **2.6c** ชื่องาน`      (รูปแบบที่ใช้อยู่จริง — ไม่มีคำว่า Phase + มี ** ครอบ)
     * ของเดิมบังคับคำว่า `Phase` ⇒ หัวข้อที่เขียนแบบที่สองทำให้ `nextTask = null` เงียบ ๆ
     * แล้วตกไปใช้ fallback (หา ⬜ ตัวแรก) ซึ่งพังพร้อมกันจาก ID_PAT ⇒ ได้ "ไม่มีงาน"
     */
    const nt = line.match(new RegExp(`^##\\s*🎯\\s*งานถัดไป\\s*[—-]\\s*(?:Phase\\s*)?\\*{0,2}(${NEXT_ID})\\*{0,2}\\s*[:：]?\\s*(.*)$`));
    if (nt) {
      // ตัด `*` ที่เหลือจาก markdown bold ที่คร่อม "id + ชื่องาน" ไว้ด้วยกัน (`**2.6c ชื่องาน**`)
      // ⇒ ตัวปิดจะค้างท้ายชื่อ ถ้าไม่ตัดจะได้ title = "adapter card-only**"
      nextTask = { id: nt[1], phase: nt[1].split('.')[0], title: nt[2].replace(/\*+/g, '').trim() };
      continue;
    }

    // หยุดอ่านตารางเมื่อถึง section บันทึกการตัดสินใจ (ไม่ใช่ task)
    if (/^##\s*บันทึกการตัดสินใจ/.test(line)) { stopTables = true; current = null; continue; }

    // หัว Phase
    const ph = line.match(/^##\s*Phase\s*([0-9A-Z]+)\s*[—-]\s*(.+)$/);
    if (ph) {
      current = {
        key: ph[1],
        name: ph[2].replace(/🔒/g, '').trim(),
        locked: /🔒/.test(ph[2]),
        tasks: [],
      };
      phases.push(current);
      continue;
    }

    if (stopTables || !current) continue;

    // แถวตาราง task
    if (line.startsWith('|')) {
      const cells = line.split('|').map((c) => c.trim());
      // ["", id, งาน, สถานะ, หมายเหตุ..., ""]
      cells.shift();
      if (cells.length && cells[cells.length - 1] === '') cells.pop();
      if (cells.length < 3) continue;
      const id = cells[0];
      if (!TASK_ID.test(id)) continue; // ข้าม header / separator
      const title = cells[1];
      const status = detectStatus(cells[2]);
      const note = cells.slice(3).join(' | ');
      current.tasks.push({ id, phase: id.split('.')[0], title, status, note, commits: extractCommits(note) });
    }
  }

  // mark next task
  if (nextTask) {
    for (const p of phases)
      for (const t of p.tasks) if (t.id === nextTask.id) { t.isNext = true; nextTask.title = nextTask.title || t.title; }
  }

  // stats
  const all = phases.flatMap((p) => p.tasks);
  const count = (s) => all.filter((t) => t.status === s).length;
  const stats = {
    total: all.length,
    done: count('done'),
    doing: count('doing'),
    todo: count('todo'),
    blocked: count('blocked'),
  };
  stats.percent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  for (const p of phases) {
    const t = p.tasks.length;
    const d = p.tasks.filter((x) => x.status === 'done').length;
    p.done = d;
    p.total = t;
    p.percent = t ? Math.round((d / t) * 100) : 0;
  }

  return { updatedAt, nextTask, phases, stats };
}

/**
 * task ถัดไปที่ควรทำ — หัวข้อ `## 🎯 งานถัดไป` ชนะ ถ้าชี้ไปที่แถวที่ยัง `todo`/`doing` จริง
 * ไม่งั้นไล่หา todo/doing ตัวแรกใน phase ที่ปลดล็อกแล้ว
 *
 * ⚠️ **ห้ามสังเคราะห์งานจาก id ในหัวข้อ 🎯 ที่ไม่มีแถวในตาราง** (บั๊กเดิม 2026-08-09):
 * โค้ดเก่าถ้าหา id ไม่เจอจะ `return { ...nextTask, status: 'todo' }` ⇒ **งานที่ไม่มีแถวจริง
 * กลายเป็น todo ตลอดกาล** · เกิดขึ้นจริงกับ `SEC-CSP-3` ที่ทำไม่ได้เพราะรอ CSP violation จาก
 * production (ไม่ใช่รอโค้ด) แต่ไม่มีแถวในตาราง ⇒ engine หยิบมาทำ → agent ทำอะไรไม่ได้ → merge →
 * **หยิบมาใหม่ใน 7 วินาที** วนอยู่ ~2 ชม. เผา session Opus 5 รอบละ ~22 นาที ไป 3 รอบก่อนจับได้
 * (พิมพ์ id ผิดตัวเดียวในหัวข้อก็ให้ผลเดียวกัน)
 *
 * เหตุผลที่ status ต้องเป็น `todo`/`doing` เท่านั้น: ถ้าหัวข้อยังค้างชี้แถวที่ ✅ แล้ว (agent ลืม
 * ย้ายหัวข้อตอนจบงาน) การคืนแถวนั้นกลับไป = สั่งทำงานที่เสร็จแล้วซ้ำ · ถ้าเป็น ⏸️ = สั่งทำงานที่
 * รู้อยู่แล้วว่าติดบล็อก — ทั้งสองเคสต้องข้ามไปหางานถัดไปแทน
 */
export function pickNextTask(progress) {
  const scan = () => {
    for (const p of progress.phases) {
      if (p.locked && p.tasks.some((t) => t.status !== 'done')) continue;
      const t = p.tasks.find((x) => x.status === 'todo' || x.status === 'doing');
      if (t) return { ...t, phaseName: p.name, locked: p.locked };
    }
    return null;
  };

  if (progress.nextTask) {
    for (const p of progress.phases)
      for (const t of p.tasks)
        if (t.id === progress.nextTask.id)
          return t.status === 'todo' || t.status === 'doing'
            ? { ...t, phaseName: p.name, locked: p.locked }
            : scan(); // แถวมีจริงแต่ ✅/⏸️ แล้ว → ไปหางานถัดไป ไม่ทำซ้ำ
    // ไม่มีแถวเลย → ตกมา scan (เดิมสังเคราะห์เป็น todo = ต้นเหตุของลูป)
  }
  return scan();
}
