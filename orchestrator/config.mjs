// AssetRecovery Orchestrator — configuration (zero-dependency, Node ESM)
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(HERE, '..');
export const ORCH_DIR = HERE;
export const PROGRESS_FILE = resolve(REPO_ROOT, 'PROGRESS.md');
export const QUEUE_DIR = resolve(ORCH_DIR, 'queue');
export const LOG_DIR = resolve(ORCH_DIR, 'logs');
export const PUBLIC_DIR = resolve(ORCH_DIR, 'public');

/**
 * branch หลักที่แตกงาน/merge เข้า — ใช้เป็นจุดอ้างอิงของ verify แบบ "เฉพาะที่เปลี่ยน" ด้วย
 * **โปรเจกต์นี้สายพัฒนาคือ `staging` ไม่ใช่ `main`** (Release Flow ตาม `.claude/rules/06-git-workflow.md`):
 *   local → push `origin staging` → ทดสอบบน Vercel/Supabase staging → PR `staging`→`main` = production
 * ⇒ orchestrator merge เข้า `staging` ในเครื่องเท่านั้น · `main` แตะไม่ได้เลยจากเส้นทางอัตโนมัติ
 * (บทเรียนเดิม: ตั้ง base เป็น branch ที่ไม่มี merge-base ร่วมกัน ⇒ `--changed`/diff ให้ผลเพี้ยนทั้งชุด)
 */
const BASE_BRANCH = process.env.RTB_BASE_BRANCH || 'staging';

export const config = {
  // --- Claude Code CLI ---
  claudeBin: process.env.RTB_CLAUDE_BIN || 'claude',
  // แยก account ต่อ instance (ใช้เมื่อรันหลาย orchestrator บนเครื่องเดียว คนละ Claude account)
  // เช่น RTB_CLAUDE_CONFIG_DIR=~/.claude-acct2 — ⚠️ CLAUDE_CONFIG_DIR เป็นฟีเจอร์ที่ไม่อยู่ในเอกสารทางการ
  claudeConfigDir: process.env.RTB_CLAUDE_CONFIG_DIR || '',
  model: process.env.RTB_MODEL || 'claude-opus-5', // default = Opus 5 (มติ PO); RTB_MODEL='' เพื่อกลับไปใช้ default ของ Claude Code
  // โหมด permission ตอนรัน headless: 'bypass' = --dangerously-skip-permissions (autonomous เต็ม)
  // 'acceptEdits' = อนุมัติ edit อัตโนมัติแต่ยังถามคำสั่งอื่น (ปลอดภัยกว่าแต่ต้องนั่งเฝ้า)
  permission: process.env.RTB_PERMISSION || 'bypass',
  claudeTimeoutMs: Number(process.env.RTB_CLAUDE_TIMEOUT_MS || 45 * 60 * 1000), // 45 นาที/ก้อนงาน

  // --- Sentinel protocol (agent ↔ orchestrator) ---
  needsDecision: '[[NEEDS_DECISION]]',
  options: '[[OPTIONS]]',
  handoff: '[[HANDOFF]]',   // agent commit ความคืบหน้า + ส่งต่อ session ใหม่ (context สด)
  taskDone: '[[TASK_DONE]]',
  maxHandoffs: Number(process.env.RTB_MAX_HANDOFFS || 8), // กันถ่ายวนไม่จบ

  // โหมด Auto: เจอคำถาม → เลือก "ตัวเลือกที่แนะนำ" เองแล้วทำต่อ (ไม่หยุดถาม)
  autoAnswer: process.env.RTB_AUTO_ANSWER ? process.env.RTB_AUTO_ANSWER === 'true' : true,
  maxAutoAnswers: Number(process.env.RTB_MAX_AUTO_ANSWERS || 5), // ตอบเองได้กี่ครั้งต่อ task

  // ขนาด context window ของโมเดลที่ใช้ (ใช้เป็นตัวหารของหลอดบน dashboard)
  // Opus 4.8 = 1M · รุ่นมาตรฐานทั่วไป = 200k — ปรับได้ที่ RTB_CONTEXT_WINDOW
  contextWindow: Number(process.env.RTB_CONTEXT_WINDOW || 1000000),

  // เป้าอ่อน: บอก agent ให้ hand off ก่อน context แตะเลขนี้ (default = 80% ของ window)
  handoffContextTarget: Number(process.env.RTB_HANDOFF_CTX || 0) || Math.round(Number(process.env.RTB_CONTEXT_WINDOW || 1000000) * 0.8),

  // --- Approval model ---
  // true  = verify ผ่านแล้ว merge เข้า staging ในเครื่องอัตโนมัติ (โหมดที่ PO เลือก: อัตโนมัติเต็ม)
  // false = verify ผ่านแล้วหยุดรอกด Approve ในหน้า dashboard ก่อน merge (เพิ่ม checkpoint คน)
  autoMerge: process.env.RTB_AUTO_MERGE ? process.env.RTB_AUTO_MERGE === 'true' : true,
  // ค่าเริ่มต้นของสวิตช์ Auto ตอน server บูต — **default = ปิด (แมนนวล)**
  // ทุกครั้งที่ restart จะเริ่มที่โหมดแมนนวลเสมอ ต้องกดเปิด Auto เองบน dashboard
  // (ตั้ง RTB_AUTO_NEXT=true ใน .env ถ้าอยากให้เปิด Auto อัตโนมัติตอนบูต)
  autoNext: process.env.RTB_AUTO_NEXT === 'true',

  // --- Verify gates (รันใน REPO_ROOT ก่อน commit/merge) ---
  //
  // **เทสต์/lint คิดเฉพาะสิ่งที่ก้อนงานนี้แตะ** (บทเรียนจากโปรเจกต์เดิม) — เดิมรัน `pnpm test`
  // เต็มทุกก้อนงาน ทั้งที่ session หนึ่งแตะไม่กี่ไฟล์ · `--changed` เลือกเฉพาะที่เกี่ยวให้เอง
  //
  // ⚠️ `--changed` **ไม่ใช่การกรองตามโฟลเดอร์** — vitest ไล่ตาม import graph ให้ ⇒ แก้ pure module
  // สูตรเงินตัวเดียว (`22`) มันจะหยิบเทสต์ของทุกโมดูลที่ import ถึงมารันด้วย แม้ไฟล์นั้นไม่ได้แตะ
  // ⇒ ยังจับ regression ข้ามไฟล์ได้ตามเดิม
  //
  // ⚠️⚠️ **`typecheck` ยังเต็มโดยตั้งใจ ห้ามย่อ** — เป็นด่านเดียวที่จับ "แก้ type ที่ `lib/` หรือ
  // Prisma schema แล้วพังที่ `app/` ที่ไม่มีเทสต์คลุม" ได้ทั้ง repo และถูกกว่าชุดเทสต์มาก
  // (หมายเหตุโปรเจกต์นี้: `pnpm typecheck` = `tsc --noEmit` ต้องมี `lib/generated/prisma` อยู่ก่อน —
  //  ถ้าเพิ่ง clone ใหม่ยังไม่เคย build ให้รัน `pnpm db:generate` ก่อน ไม่งั้นแดงด้วย TS2307)
  //
  // ⚠️⚠️⚠️ **เส้นแบ่งความเสี่ยงอยู่ที่ `git push` ไม่ใช่ที่ merge**
  // **orchestrator ไม่มีคำสั่ง `git push` เลย โดยตั้งใจ** ⇒ auto-merge แตะได้แค่ `staging` ในเครื่อง
  // ซึ่ง `git reset` กลับได้ · ตัวที่ยิง staging จริงคือ **คนกด `git push origin staging`**
  // และ production เข้าได้ทางเดียวคือ **PR `staging`→`main`** ที่มี CI เต็มเป็นด่าน (rules/06)
  // ⇒ กติกาที่ถูก: **ก่อน push `staging` ให้คนรัน `pnpm typecheck && pnpm test` เต็มหนึ่งรอบ**
  verify: [
    { name: 'typecheck', cmd: 'pnpm typecheck' },
    { name: 'test', cmd: `pnpm vitest run --changed ${BASE_BRANCH} --passWithNoTests` },
    // `git diff <ref>` (จุดเดียว) = เทียบกับ working tree ⇒ ครอบทั้งที่ commit แล้วและยังไม่ commit
    // (verify รัน "ก่อน commit" ได้ด้วย — ใช้ `<ref>...HEAD` จะมองไม่เห็นไฟล์ที่ยังไม่ commit)
    // ⚠️ ต้องส่งชื่อไฟล์ผ่าน `xargs` **ห้ามใช้ `eslint $f` เปล่า ๆ** — zsh ไม่ word-split ตัวแปร
    // (ต่างจาก /bin/sh ที่ `shell:true` ใช้) ⇒ จะกลายเป็นชื่อไฟล์เดียวที่มีขึ้นบรรทัดใหม่คั่น
    // แล้ว eslint ตอบ "No files matching the pattern" exit 2 = verify แดงทั้งที่โค้ดไม่ผิด
    // `[ -z "$f" ]` กันเคส task ที่แก้แต่ docs (ไม่มีไฟล์ .ts เลย) ⇒ ผ่าน ไม่ใช่แดง
    { name: 'lint', cmd: `f=$(git diff --name-only --diff-filter=ACMR ${BASE_BRANCH} -- '*.ts' '*.tsx'); [ -z "$f" ] || printf '%s\\n' "$f" | xargs pnpm exec eslint` },
  ],
  // session ถูกตัดกลางคัน → commit ไฟล์ค้างเป็น WIP อัตโนมัติแล้วทำต่อ (ไม่ต้องรอคนกด)
  // ยกเว้นเคสที่ต้องให้คนดูจริง: merge ค้าง / มี conflict ยังไม่แก้
  autoCommitDirty: process.env.RTB_AUTO_COMMIT_DIRTY ? process.env.RTB_AUTO_COMMIT_DIRTY === 'true' : true,
  autoRepairAttempts: Number(process.env.RTB_AUTO_REPAIR || 1), // ลองให้ agent แก้เองกี่ครั้งเมื่อ verify แดง

  // --- AI limit guard: พักก่อนเริ่ม task ใหม่ถ้าโควตาใกล้เต็ม แล้ว auto-resume หลัง reset ---
  limitPause: {
    fiveHour: Number(process.env.RTB_LIMIT_5H || 90),  // 5-hour ≥ % นี้ → หยุดถามก่อนเริ่ม task ใหม่
    weekly: Number(process.env.RTB_LIMIT_WEEK || 95),  // weekly ≥ % นี้ → หยุดถาม
  },
  limitResumePollMs: Number(process.env.RTB_LIMIT_POLL_MS || 3 * 60 * 1000), // เช็คทุก 3 นาทีตอนรอ reset

  // --- Git ---
  baseBranch: BASE_BRANCH,
  branchPrefix: 'auto/phase-',

  // ไฟล์ prompt สำหรับ "เทสงาน/รีวิว" (แก้เนื้อหาได้ที่ไฟล์นี้)
  reviewPromptFile: resolve(ORCH_DIR, 'review-prompt.md'),
  // ไฟล์ prompt สำหรับ "Final test" (ทดสอบทั้งระบบเหมือนใช้งานจริง หลังจบทุกเฟส)
  finalTestPromptFile: resolve(ORCH_DIR, 'final-test-prompt.md'),
  // Final test แบ่งเป็นด่าน — แต่ละด่าน 1 session (แก้เนื้อหาได้ที่ไฟล์ใน final-tests/)
  finalTestStages: [
    { key: '1', label: 'Ops E2E: เคส → มอบหมาย → ภาคสนาม → คลัง', file: resolve(ORCH_DIR, 'final-tests/1-operations.md') },
    { key: '2', label: 'การเงิน: claim/payout/revenue/billing (`22` ทุกสูตร)', file: resolve(ORCH_DIR, 'final-tests/2-finance.md') },
    { key: '3', label: 'บัญชี: ปิดงวด/ภาษี/WHT/Export pack', file: resolve(ORCH_DIR, 'final-tests/3-accounting.md') },
    { key: '4', label: 'สิทธิ์ + Audit + Multi-tenant leak', file: resolve(ORCH_DIR, 'final-tests/4-security.md') },
    { key: '5', label: 'ความครบของ UI (ทุกเมนูใช้ได้จริง)', file: resolve(ORCH_DIR, 'final-tests/5-ui-completeness.md') },
    { key: '6', label: 'ความทนทาน: idempotency / concurrency / jobs', file: resolve(ORCH_DIR, 'final-tests/6-reliability.md') },
  ],

  // --- โมเดลแยกตามบทบาท ('' = ใช้ค่าที่เลือกใน dropdown / default) ---
  roleModels: {
    code: process.env.RTB_MODEL_CODE || '',      // session เขียนโค้ด (งานปกติ)
    review: process.env.RTB_MODEL_REVIEW || '',  // session รีวิว/เทสต์ — แนะนำใช้คนละตัวกับ code
  },

  // --- โมเดลสำหรับ Final Test โดยเฉพาะ (มติ PO 2026-08-16: ใช้ Fable 5) — override: RTB_MODEL_FINAL ---
  finalModel: process.env.RTB_MODEL_FINAL ?? 'claude-fable-5',

  // --- โมเดลตามชนิดงาน: task UI → โมเดลอื่นได้ ---
  // จับจาก id ของ task ใน PROGRESS (prefix match) — แก้รายการได้ที่ RTB_UI_TASKS (คั่นด้วย ,)
  // **โปรเจกต์นี้ตั้งค่าเริ่มต้นเป็นว่าง = ทุก task ใช้โมเดลเดียวกัน (Opus 5)** โดยตั้งใจ:
  // task ใน `docs/01_PLAN.md` เกือบทุกตัวเป็นงานผสม BE+FE (เช่น 1.5, 2.4, 3.3) และถูกวางขนาด
  // ไว้กับงบ context 800k ของ Opus 5 — สลับโมเดลกลางทางจะได้ context window/พฤติกรรมคนละแบบ
  // อยากเปิด: ตั้ง RTB_UI_TASKS='1.5,1.11,1.12,2.4,2.5,2.7,2.10,2.11,2.12,2.14,2.15' ใน .env
  uiModel: process.env.RTB_MODEL_UI ?? 'claude-fable-5',
  uiTaskPrefixes: (process.env.RTB_UI_TASKS || '').split(',').map((x) => x.trim()).filter(Boolean),

  // --- เทสต์อัตโนมัติ ---
  autoReview: {
    onPhaseEnd: process.env.RTB_REVIEW_ON_PHASE ? process.env.RTB_REVIEW_ON_PHASE === 'true' : true, // จบทุก Phase → รีวิว
    onlyPhases: (process.env.RTB_REVIEW_PHASES || '').split(',').map((s) => s.trim()).filter(Boolean), // ว่าง = ทุก Phase
    everyNTasks: Number(process.env.RTB_REVIEW_EVERY_N || 0), // 0 = ปิด
  },
  // งาน task หมดแล้ว + Auto เปิด → เดิน Final test 4 ด่านต่อเองอัตโนมัติ
  autoFinalTest: process.env.RTB_AUTO_FINAL ? process.env.RTB_AUTO_FINAL === 'true' : true,

  // --- รายชื่อโมเดลใน dropdown (แก้/เพิ่มเวอร์ชันได้ที่นี่ที่เดียว) ---
  // value = string ที่ส่งให้ claude --model ('' = ค่าเริ่มต้นของ Claude Code)
  // ถ้าเลือกแล้ว error = ชื่อไม่ตรงกับที่เครื่องรองรับ ให้แก้ค่าที่นี่
  // `ctx` = ขนาด context window ของรุ่นนั้น (ใช้เป็นตัวหารของหลอดบน dashboard)
  // สอบทานกับตารางรุ่นทางการ 2026-08-08: **ทุกรุ่นปัจจุบัน = 1M ยกเว้น Haiku 4.5 = 200k**
  // (ค่า 200k ที่เคยตั้งไว้กับ Opus 4.7/4.6 · Sonnet 5 · Fable 5 เป็นค่าเดาแบบปลอดภัย — ผิด
  //  ทำให้หลอดบน dashboard อ่านว่าเต็มเร็วกว่าจริง 5 เท่าเมื่อเลือกรุ่นเหล่านั้น)
  models: [
    { label: 'ค่าเริ่มต้น (Opus 4.8)', value: '', ctx: 1000000 },
    { label: 'Opus 5', value: 'claude-opus-5', ctx: 1000000 }, // ยืนยันจาก /usage บัญชีจริง 2026-07-30 (1.0M)
    { label: 'Opus 4.8', value: 'claude-opus-4-8', ctx: 1000000 },
    { label: 'Opus 4.7', value: 'claude-opus-4-7', ctx: 1000000 },
    { label: 'Opus 4.6', value: 'claude-opus-4-6', ctx: 1000000 },
    { label: 'Sonnet 5', value: 'claude-sonnet-5', ctx: 1000000 },
    { label: 'Haiku 4.5', value: 'claude-haiku-4-5', ctx: 200000 },
    { label: 'Fable 5', value: 'claude-fable-5', ctx: 1000000 },
  ],

  // --- Server ---
  port: Number(process.env.RTB_PORT || 4174),

  // --- แจ้งเตือนมือถือผ่าน ntfy (เปิดใช้เมื่อมี RTB_NTFY_TOPIC) ---
  notify: {
    server: process.env.RTB_NTFY_SERVER || 'https://ntfy.sh',
    topic: process.env.RTB_NTFY_TOPIC || '',          // ตั้งชื่อลับ ๆ เช่น assetrecovery-a7k3x9
    apiBase: process.env.RTB_API_BASE || '',          // เช่น http://<mac-tailscale>:4174 (ให้ปุ่ม Approve/เปิด dashboard ทำงาน)
    dashboardUrl: process.env.RTB_DASH_URL || '',     // override URL เปิด dashboard (ถ้าเว้น จะสร้างจาก apiBase+token)
    token: '',                                        // ตั้งโดย server ตอน start (= dashboard token)
  },

  // สถานะที่ถือว่า "เป็น task จริง" (ไม่นับ section บันทึกการตัดสินใจ)
  statusEmoji: { done: '✅', doing: '🔄', todo: '⬜', blocked: '⏸️' },
};

export const paths = { REPO_ROOT, ORCH_DIR, PROGRESS_FILE, QUEUE_DIR, LOG_DIR, PUBLIC_DIR };
