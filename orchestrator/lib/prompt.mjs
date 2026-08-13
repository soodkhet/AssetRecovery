// สร้าง prompt ต่อ session ตามวงจร WORKFLOW.md §3 + โปรโตคอลหยุดถาม (CLAUDE.md ข้อ 26)
import { readFileSync } from 'node:fs';
import { config } from '../config.mjs';

const RULES = `กติกาบังคับของ session นี้ (อ้างอิง CLAUDE.md + .claude/rules/* + WORKFLOW.md):
- Context discipline: ห้ามอ่านไฟล์ใหญ่ทั้งไฟล์ (docs/02, 13, 38, 40, 41, 44, 97, reference/*.html) — เปิด docs/00_MAP.md หา offset/limit แล้ว Read เฉพาะช่วง; Grep ก่อน Read เสมอ; งานสำรวจหลายไฟล์ให้ delegate subagent; อ่าน spec เฉพาะ reading list ของ task ใน docs/01_PLAN.md ไม่อ่านเผื่อ
- เอกสารขัดกัน ลำดับ: docs/02 (schema) → ไฟล์ spec ของ module → reference กลาง (22/23/24/25/27/45) → mockup · mockup ใช้ได้เฉพาะ UI ห้ามอ้าง business logic
- **เงิน = INTEGER satang เท่านั้น** ห้าม float/Decimal (฿100.50 → 10050) ยกเว้น rate_pct/wht_pct = NUMERIC(5,2) · สูตรเงินทุกสูตรอยู่ docs/22 เป็น pure module + unit test ห้าม hardcode ซ้ำ · VAT ห้าม hardcode 7% (ใช้ vat_rate_history + snapshot vat_rate_used) · WHT: Payee-level ชนะ Plan-level ฐาน before_vat threshold 1,000
- **Datetime**: เก็บ UTC (TIMESTAMPTZ) / แสดง Asia/Bangkok + **พ.ศ. เท่านั้น** DD/MM/YYYY ผ่าน utils กลาง (ยกเว้น <input type="date">)
- **Permission ตรวจที่ API layer ทุก endpoint** ผ่าน requirePermission(action, resource, scope) — ไม่ใช้ Supabase RLS · UI hide/disable เป็นแค่ UX
- **Audit ทุก mutation** ครบ 9 fields + immutable · reason บังคับเมื่อกระทบเงิน/สิทธิ์/ธนาคาร/ภาษี/lock period
- Snapshot pattern ทุก entity การเงิน (ห้ามคำนวณย้อนหลังจาก live template) · Idempotency: payout key, job, export versioned + SHA-256 ห้าม overwrite
- State machine + enum ตรง docs/23 + docs/02 §3 เป๊ะ · Error code ใช้จาก docs/24 เท่านั้น
- TypeScript strict ห้าม any; DB snake_case / โค้ด camelCase; validation ด้วย Zod schema เดียวใช้ร่วม FE/BE
- **งานการเงินทุกก้อนต้องมี test ในก้อนงานเดียวกัน** — pure module + unit test ก่อนเขียน route/UI
- **ห้าม git push เด็ดขาด** (สายพัฒนา = staging · push/PR เป็นงานของคน) · ห้ามแก้ spec ใน docs/ นอกจากที่ rules/06 อนุญาต`;

export function buildTaskPrompt(task) {
  return `คุณคือ Claude Code ทำงานในโปรเจกต์ AssetRecovery (Next.js App Router + Prisma/PostgreSQL, pnpm) แบบอัตโนมัติ — 1 session = 1 ก้อนงานเดียว

# งานของ session นี้
Phase ${task.id} — ${task.title}
(รายละเอียดเต็มอยู่ในส่วน "🎯 งานถัดไป" ของ PROGRESS.md — อ่านก่อนเริ่ม)

# ลำดับการทำงาน (ทำตามเคร่งครัด)
1. อ่าน PROGRESS.md (ส่วน "🎯 งานถัดไป" + Handoff) และ CLAUDE.md
2. **⚠️ เช็คก่อนลงมือ — กันทำซ้ำ (สำคัญ):** ดู \`git log --oneline -15\` + โค้ด/ไฟล์จริง ยืนยันว่างาน Phase ${task.id} นี้**ยังไม่ถูกทำ+commit ไปแล้ว**
   - ถ้าพบว่า**ทำไปแล้ว** (มี commit/ไฟล์ครบตามสเปค) → **ห้ามทำซ้ำ!** อัปเดต PROGRESS.md ให้ตรงความจริง (มาร์ค task นี้ ✅ + เลื่อน "🎯 งานถัดไป" ไป task ถัดไปที่ยัง ⬜) → commit → พิมพ์ ${config.taskDone} <commit> "Phase ${task.id} ทำไปแล้ว—sync PROGRESS"
   - ถ้า**ยังไม่ได้ทำ** → ทำต่อขั้นถัดไป
3. **เช็ค docs/REUSE_INDEX.md ก่อนเขียนโค้ดทุกครั้ง** (ของที่มีแล้ว/แม่แบบ/กับดัก) แล้วหาเอกสารอ้างอิงจาก "ตารางเส้นทาง" ใน CLAUDE.md + reading list ของ task ใน docs/01_PLAN.md; ใช้ docs/00_MAP.md หา offset ก่อน Read ไฟล์ใหญ่
4. วางแผนทีละขั้น (ระบุ section เอกสาร + วิธีพิสูจน์) แล้วลงมือทำทีละขั้น
5. verify ระหว่างทาง: หลังแต่ละขั้นรัน typecheck/test ที่เกี่ยวข้อง
6. เมื่อโค้ดเสร็จ รัน \`pnpm typecheck\` + \`pnpm test\` + lint ให้ผ่านทั้งหมด
7. อัปเดต PROGRESS.md: เปลี่ยนสถานะแถว task นี้เป็น ✅ พร้อม (วันที่ + commit hash ใน backtick + headline บรรทัดเดียว + "→ archive"); ย้ายรายละเอียดเต็มลง docs/PROGRESS_ARCHIVE.md; cap ส่วน "🎯 งานถัดไป" ให้เหลือ "งานถัดไป" งานเดียว (งานถัดไปตามลำดับใน PROGRESS.md — คัดรายละเอียดจาก docs/01_PLAN.md)
8. commit ด้วย message conventional commits ภาษาไทย: \`feat(<scope>): Phase ${task.id} <headline>\`

# โปรโตคอลหยุดถาม (สำคัญที่สุด — ห้ามเดา)
ถ้าเจอ: เอกสารขัดกัน / สเปคไม่ชัด / ต้องตัดสินใจเชิงธุรกิจ / ต้องใช้ credential หรือไฟล์ที่ไม่มี / งานเสี่ยงกระทบข้อมูลจริง
→ หยุดทันที ห้าม commit แล้วพิมพ์:
${config.needsDecision} <สรุปคำถามสั้น ๆ>
ถ้ามีตัวเลือกที่ชัดเจนให้เลือก พิมพ์บรรทัดถัดไปด้วย (คั่นด้วย | ไม่เกิน 4 ตัว สั้น ๆ; เรียง "ตัวที่คุณแนะนำ" ไว้เป็นตัวแรก แล้วต่อท้ายข้อความนั้นด้วย " (แนะนำ)"):
${config.options} ตัวเลือกที่แนะนำ (แนะนำ) | ตัวเลือกที่ 2 | ตัวเลือกที่ 3

# เมื่อทำเสร็จสมบูรณ์ (verify ผ่าน + commit แล้ว)
พิมพ์บรรทัดสุดท้าย:
${config.taskDone} <commit hash> <headline หนึ่งบรรทัด>

# ถ้างานใหญ่เกินจะจบใน session เดียว (กะ context ไม่ให้เกิน ~${Math.round((globalThis.__rtbHandoffTarget || config.handoffContextTarget) / 1000)}k)
ทำเป็นก้อนย่อยที่ commit ได้เรื่อย ๆ · ถ้าทำไปเยอะแล้วรู้สึก context ยาว/ใกล้เต็มและงานยังไม่จบ:
1. **commit ความคืบหน้าที่ทำได้ก่อน** (สำคัญมาก — session ใหม่เห็นเฉพาะสิ่งที่ commit แล้ว)
2. เขียนสรุปสั้น ๆ ว่าเหลืออะไร/ตัดสินใจอะไรไปแล้ว/จุดที่ค้าง
3. พิมพ์ ${config.handoff} <สรุปสิ่งที่เหลือทำ>
orchestrator จะเปิด session ใหม่ (context สด) มาทำต่อจาก commit ล่าสุด — **ห้าม ${config.handoff} โดยไม่ commit ก่อน**

${RULES}`;
}

export function buildHandoffPrompt(task, handoffText, round) {
  return `คุณคือ Claude Code ทำงานต่อ (session ใหม่ context สด) ของงาน Phase ${task.id} — ${task.title}
นี่คือการถ่ายงานรอบที่ ${round} — ก้อนก่อนหน้า commit ความคืบหน้าไว้บน branch ปัจจุบันแล้ว

# สิ่งที่เหลือทำ (จากก้อนก่อน)
${handoffText || '(ดูจาก git log ล่าสุด + PROGRESS.md)'}

# เริ่มยังไง
1. ดู git log ล่าสุด + diff ล่าสุดเพื่อเข้าใจว่าทำถึงไหน (อย่าอ่านทั้งไฟล์ใหญ่ — ใช้ grep/MAP)
2. ทำส่วนที่เหลือให้เสร็จ + verify (typecheck/test)
3. commit เพิ่ม

โปรโตคอลเดิม:
- ยังใหญ่/context ยาวอีก → commit + ${config.handoff} <ที่เหลือ>
- เจอจุดตัดสินใจ → ${config.needsDecision} <คำถาม> (+ ${config.options} ... ถ้ามีตัวเลือก)
- เสร็จสมบูรณ์ verify ผ่าน + commit + อัปเดต PROGRESS.md → ${config.taskDone} <commit hash> <headline>`;
}

const DEFAULT_REVIEW = 'รีวิวโค้ดที่เพิ่งเขียนเทียบกับ CLAUDE.md + เอกสาร: กติกาห้ามละเมิดครบไหม, สูตร/ตรรกะตรงสเปคไหม, มี any/hardcode ไหม — รายงานเป็นตาราง ผ่าน/ต้องแก้ แล้วแก้ให้เลย';

export function buildReviewPrompt({ since = null, phase = null } = {}) {
  let body = DEFAULT_REVIEW;
  try { body = readFileSync(config.reviewPromptFile, 'utf8').trim() || DEFAULT_REVIEW; } catch { /* ใช้ default */ }
  const scope = since
    ? `**รีวิวเฉพาะการเปลี่ยนแปลงตั้งแต่ commit \`${since}\` เป็นต้นมา** (รีวิวก่อนหน้านั้นผ่านไปแล้ว ไม่ต้องทำซ้ำ)
เริ่มด้วย: \`git log --oneline ${since}..HEAD\` และ \`git diff --stat ${since}..HEAD\` แล้วดู diff เฉพาะไฟล์ที่เกี่ยว`
    : 'ดู `git log --oneline -15` + `git diff` ล่าสุดเพื่อรู้ว่ารีวิวอะไร (ยังไม่มี checkpoint = รีวิวงานล่าสุดที่ยังไม่เคยตรวจ)';
  return `คุณคือ Claude Code ทำหน้าที่ "รีวิว + แก้" โค้ดในโปรเจกต์ AssetRecovery (1 session)${phase ? ` — รอบนี้ตรวจงาน **Phase ${phase}**` : ''}

# ขอบเขตที่ต้องรีวิว
${scope}
**อย่าอ่านทั้งไฟล์ใหญ่ ใช้ grep + docs/00_MAP.md**

# สิ่งที่ต้องรีวิว
${body}

# วิธีทำ
1. อ่าน CLAUDE.md + เอกสารที่เกี่ยว (ผ่าน MAP) เพื่อรู้กติกา/สูตรที่ต้องเทียบ
2. รีวิวโค้ดล่าสุดทีละหัวข้อ; ถ้ามี test สิทธิ์/ข้ามบริษัท (multi-tenant) ให้รันจริง
3. **รายงานเป็นตาราง Markdown:** \`| หัวข้อ | สถานะ (✅ ผ่าน / ❌ ต้องแก้) | รายละเอียด/บรรทัด |\`
4. จุดที่ ❌ → **แก้ให้เลย** + verify (typecheck/test/lint) ให้ผ่าน + commit
5. งานใหญ่/context ยาว → commit + ${config.handoff} <ที่เหลือ>
6. เจอจุดต้องตัดสินใจ → ${config.needsDecision} <คำถาม> (+ ${config.options} ... ถ้ามีตัวเลือก)

# เมื่อเสร็จ
- **ถ้ามีการแก้:** verify ผ่าน + commit แล้วพิมพ์ ${config.taskDone} <commit> <สรุปสิ่งที่แก้>
- **ถ้าผ่านหมดไม่ต้องแก้:** พิมพ์ ${config.taskDone} no-fix — รีวิวผ่านทุกข้อ (ไม่ต้อง commit)

${RULES}`;
}

const DEFAULT_FINAL = 'ทดสอบทั้งระบบเหมือนใช้งานจริง: flow ข้ามเฟสตั้งแต่ต้นจนจบ, integration, security, ข้อมูลการเงินถูกต้อง — รายงานเป็นตาราง แล้วแก้จุดที่พัง';

export function buildFinalTestPrompt(stageKey = null) {
  const stage = stageKey ? config.finalTestStages.find((s) => s.key === String(stageKey)) : null;
  let body = DEFAULT_FINAL;
  try { body = readFileSync(stage ? stage.file : config.finalTestPromptFile, 'utf8').trim() || DEFAULT_FINAL; } catch { /* default */ }
  return `คุณคือ Claude Code ทำหน้าที่ **Final Test** ของโปรเจกต์ AssetRecovery — ทดสอบ "ทั้งระบบ" เหมือนผู้ใช้จริง (ไม่ใช่รีวิว diff รายก้อน)${stage ? `\n**รอบนี้ทดสอบเฉพาะด่าน ${stage.key}/${config.finalTestStages.length} — ${stage.label}** (ด่านอื่นมี session แยก ไม่ต้องทำที่นี่)` : ''}

# สิ่งที่ต้องทำ
${body}

# วิธีทำ
1. อ่าน PROGRESS.md (เฟสที่เสร็จแล้วทั้งหมด) + CLAUDE.md เพื่อรู้ขอบเขตระบบ; ใช้ docs/00_MAP.md หา section ที่ต้องเทียบ (ห้ามอ่านไฟล์ใหญ่ทั้งไฟล์)
2. รัน verify เต็ม: \`pnpm typecheck\` + \`pnpm test\` + lint
3. ทดสอบ flow จริงข้ามเฟส (เคสเข้าระบบ → มอบหมาย → ปิดงานภาคสนาม → รับเข้าคลัง → ส่งมอบ (lot confirmed) → revenue/billing → claim/payout → ปิดงวด/export บัญชี) ด้วย integration test ที่มีอยู่ หรือเขียนเพิ่มถ้าช่องโหว่ชัด
4. ตรวจ cross-cutting: permission 15 roles + scope (ทีม/บริษัท/own) · ข้อมูลข้ามบริษัทไม่รั่ว · เงินเป็น INTEGER satang ทุกจุด · วันที่แสดง พ.ศ. · audit log ครบ 9 fields · idempotency · period lock
5. **รายงานเป็นตาราง Markdown:** \`| ด้าน | สถานะ (✅/❌) | หลักฐาน/ไฟล์ |\` แล้ว **แก้จุดที่ ❌ ให้เลย** + verify + commit

# โปรโตคอล
- งานใหญ่/context ยาว → commit + ${config.handoff} <ที่เหลือ>
- ต้องตัดสินใจ → ${config.needsDecision} <คำถาม> (+ ${config.options} ...)
- เสร็จ: มีแก้ → ${config.taskDone} <commit> <สรุป> · ไม่มีจุดต้องแก้ → ${config.taskDone} no-fix — final test ผ่านทุกด้าน

${RULES}`;
}

export function buildResumePrompt(task, answer) {
  return `ผู้ใช้ (PO) ตอบคำถามที่คุณค้างไว้สำหรับงาน Phase ${task.id} — ${task.title} แล้ว:

"${answer}"

**ลงมือทำจริงให้เสร็จตามคำตอบนี้ได้เลย — ไม่ต้องถามยืนยันแผนซ้ำอีก** เดินหน้าเขียนโค้ด + verify + commit
- หยุดเฉพาะเมื่อเจอจุดที่ตัดสินใจเองไม่ได้จริง ๆ (เอกสารขัดกัน/ต้อง credential) → พิมพ์ ${config.needsDecision} <คำถาม> (+ ${config.options} ... ถ้ามีตัวเลือก) **ห้ามถามแบบข้อความธรรมดา ต้องใช้เครื่องหมายนี้เท่านั้น**
- เมื่อเสร็จ verify ผ่าน + commit + อัปเดต PROGRESS.md แล้ว พิมพ์ ${config.taskDone} <commit hash> <headline>`;
}

export function buildRepairPrompt(task, failureSummary) {
  return `งาน Phase ${task.id} — ${task.title}: verify ไม่ผ่าน ต้องแก้ให้เขียว

ผลลัพธ์ที่ล้มเหลว:
${failureSummary}

แก้ให้ผ่านทั้ง typecheck/test/lint โดยไม่ลด scope/ตัด field/เปลี่ยน workflow (ห้ามแก้เทสต์ให้ผ่านแทนการแก้โค้ด) แล้ว amend หรือ commit เพิ่ม
- แก้ไม่ได้เพราะสเปคไม่ชัด/ต้องตัดสินใจ → พิมพ์ ${config.needsDecision} <คำถาม>
- เสร็จแล้ว → พิมพ์ ${config.taskDone} <commit hash> <headline>`;
}
