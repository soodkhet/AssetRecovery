// Checkpoint การรีวิว — จำว่ารีวิวถึง commit ไหนแล้ว จะได้รีวิวต่อจากจุดเดิม ไม่เริ่มใหม่ทุกครั้ง
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOG_DIR } from '../config.mjs';

const FILE = join(LOG_DIR, 'review-checkpoint.json');

export function getCheckpoint() {
  try {
    if (existsSync(FILE)) {
      const c = JSON.parse(readFileSync(FILE, 'utf8'));
      return { finalDone: [], phases: [], ...c };
    }
  } catch { /* ignore */ }
  return { lastReviewed: null, at: null, kind: null, phases: [], finalDone: [] };
}

// จำว่า Final test ด่านไหนผ่านแล้ว (จะได้ทำต่อจากด่านที่ค้าง)
export function markFinalStage(stage) {
  try {
    const c = getCheckpoint();
    const done = Array.isArray(c.finalDone) ? c.finalDone : [];
    if (stage && !done.includes(String(stage))) done.push(String(stage));
    writeFileSync(FILE, JSON.stringify({ ...c, finalDone: done, at: new Date().toISOString() }, null, 2));
  } catch { /* ignore */ }
}
export function finalStageDone(stage) {
  const c = getCheckpoint();
  return Array.isArray(c.finalDone) && c.finalDone.includes(String(stage));
}

// kind: 'review' | 'final'
export function setCheckpoint(commit, kind = 'review', phase = null) {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    const prev = getCheckpoint();
    const phases = Array.isArray(prev.phases) ? prev.phases : [];
    if (phase && !phases.includes(phase)) phases.push(phase);
    // เก็บ finalDone ไว้เสมอ — ไม่งั้นทุก setCheckpoint จะลบด่านที่ผ่านแล้วทิ้ง (final test วนไม่จบ)
    const finalDone = Array.isArray(prev.finalDone) ? prev.finalDone : [];
    writeFileSync(FILE, JSON.stringify({ lastReviewed: commit, at: new Date().toISOString(), kind, phases, finalDone }, null, 2));
  } catch { /* ignore */ }
}

// เคยรีวิว phase นี้ไปแล้วหรือยัง (กันรีวิวซ้ำ phase เดิม)
export function phaseReviewed(phase) {
  const c = getCheckpoint();
  return Array.isArray(c.phases) && c.phases.includes(phase);
}
