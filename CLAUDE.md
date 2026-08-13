# CLAUDE.md — AssetRecovery

> Operations Platform สำหรับธุรกิจรับจ้างติดตามทรัพย์ (มือถือ/อุปกรณ์) คืนจากลูกหนี้ให้บริษัทไฟแนนซ์ — เชื่อมงานภาคสนาม คลังสินค้า การเงิน และการส่งข้อมูลให้สำนักงานบัญชีรายเดือน
> **Hybrid Accounting Boundary**: ระบบ*เตรียมข้อมูล* claim/payout/billing/AR/WHT เท่านั้น — **ห้ามลง GL เอง ห้ามยื่นภาษีจริงเอง** เอกสารภาษี final ออกโดยสำนักงานบัญชี (นอกระบบ)

## Source of Truth

| ประเภท | ที่อยู่ | หมายเหตุ |
|---|---|---|
| Business Logic / Spec | `docs/*.md` (ไฟล์ 00–97) | **ยึดเป็นหลักเสมอ** |
| UI / Layout / Style | `reference/*.html` (mockup) | UI เท่านั้น — **ห้ามอ้าง business logic จาก mockup** |
| ช่วงบรรทัดไฟล์ใหญ่ | `docs/00_MAP.md` | เปิดก่อน Read ไฟล์ใหญ่เสมอ |
| แผนงานละเอียดต่อ task | `docs/01_PLAN.md` | scope + reading list + งบ context ของทุก task |
| Decision Log | `docs/94-decision-log.md` | DEC-001…DEC-009 — เปลี่ยน tech/architecture ต้องมี DEC ใหม่ |
| ลำดับเมื่อเอกสารขัดกัน | `02` (schema) → ไฟล์ spec ของ module → reference กลาง (22/23/24/25/27/45) → mockup | ขัดกันจริง → `[[NEEDS_DECISION]]` |

⚠️ archive ต้นฉบับ (`Project_info/`) ถูกนำออกจาก repo แล้ว (มติ PO 2026-08-13) — **`docs/` + `reference/` คือแหล่ง canonical ของ spec/mockup** (ต้นฉบับเดิมยังอยู่ในประวัติ git ก่อน commit การลบ)

## Tech Stack (ตัดสินใจแล้ว — ห้ามเปลี่ยนโดยไม่มี Decision Log)

| Layer | Technology | DEC |
|---|---|---|
| Frontend + Backend | Next.js App Router + TypeScript | DEC-001 |
| ORM / Database | Prisma / PostgreSQL (Supabase) | DEC-001 |
| Permission | **Backend middleware (API layer) — ไม่ใช้ Supabase RLS** | DEC-002 |
| Auth / Storage | Supabase Auth (JWT) / Supabase Storage | DEC-001/003 |
| Hosting / Jobs | Vercel / Vercel Cron + QStash | DEC-001 |
| Polymorphic FK | Separate FK columns + CHECK exactly-one non-null | DEC-004 |
| PDF | `@react-pdf/renderer` ฝั่ง server | `28` §7 |
| Chart / Excel | Recharts / SheetJS | `96` §15 |

## กติกาห้ามละเมิด (Non-negotiables)

1. **เงิน = `INTEGER` satang เท่านั้น** ห้าม float/DECIMAL (฿100.50 → `10050`) — ข้อยกเว้นเดียว: `rate_pct`/`wht_pct` = `NUMERIC(5,2)` (`02` §2.2)
2. **Datetime**: เก็บ UTC (`TIMESTAMPTZ`) / แสดง Asia/Bangkok + **พ.ศ. เท่านั้น** format `DD/MM/YYYY [HH:mm]` — ยกเว้น `<input type="date">` (`03` §6.5, DEC-005)
3. **Permission ตรวจที่ API layer ทุก endpoint** ผ่าน `requirePermission(action, resource, scope)` — UI hide/disable เป็นแค่ UX ไม่ใช่ security (DEC-002, `25`)
4. **Audit log ทุก mutation** 9 fields (`actor_id, role, action, target_type, target_id, before, after, reason, created_at`) — immutable ห้าม UPDATE/DELETE แม้ Superadmin, `reason` บังคับเมื่อกระทบเงิน/สิทธิ์/ธนาคาร/ภาษี/lock period (`90` §13)
5. **Revenue trigger**: เกิดเมื่อ `expense.approved` **AND** `HandoverLot.confirmed` (Warehouse gate ใช้กับ `closed_success` **เสมอ** รวมเคสไม่มี expense — DEC-006/D6) — `closed_fail` ไม่ผ่านคลัง (`19` §6.1, `44` §11)
6. **Lot confirmed = `$transaction` 4 steps** (assets→handed_over, unlock expenses, audit, tryCreateRevenue) — fail ข้อใด rollback ทั้งหมด (`44` §11)
7. **WHT**: Payee-level ชนะ Plan-level เสมอ + fallback มี warning, ฐาน before_vat, threshold 1,000 บาท (`18` §6.3, `22` §6.9) · **VAT ห้าม hardcode** — ใช้ `vat_rate_history` effective-dated + snapshot `vat_rate_used` (`19` §6.3)
8. **Snapshot pattern ทุก entity การเงิน** — snapshot เมื่อเกิด ห้ามใช้ live template คำนวณย้อนหลัง; case snapshot service fee ตอน `approved` ไม่ใช่ตอนสร้าง (`92` §7.1, `10` §9.2)
9. **Idempotency**: Payout `idempotency_key` กันโอนซ้ำ (`17` §6.3), background job ทุกตัว idempotent (`91`), Export/Evidence versioned + SHA-256 **ห้าม overwrite** (`37`, `01`)
10. **IMEI = exact match 15 หลัก** ห้าม fuzzy/trim/ignore dash · 1 HandoverLot = 1 บริษัทไฟแนนซ์ (`44` §6.5, §6.2)
11. **State machine + enum ต้องตรง `23` + `02` §3 เป๊ะ** ห้ามสร้าง state/enum ใหม่เอง · **Error code ใช้จาก `24` เท่านั้น** ห้ามตั้งชื่อใหม่โดยไม่เช็คก่อน
12. **Period locked** แก้ตรงไม่ได้ทุกกรณี → ต้องผ่าน Adjustment + Executive (`30`, `20`, `13` §6.11)
13. **TypeScript strict ห้าม `any`** · DB snake_case / โค้ด camelCase · validation ด้วย Zod schema เดียวใช้ร่วม FE/BE
14. **งานการเงินทุกก้อนต้องมี test ในก้อนงานเดียวกัน** — สูตรเงินแยกเป็น pure module + unit test ก่อนเขียน route/UI (`22` = SSOT ของสูตร ห้าม hardcode สูตรจาก mockup)
15. **ห้าม `git push` เด็ดขาด** — เส้นแบ่ง production คือคนกด push เอง (ดู `.claude/rules/06-git-workflow.md`)

> รายละเอียดเพิ่มเติมแยกตามหัวข้อที่ `.claude/rules/` (01-money-datetime, 02-database, 03-permission-audit, 04-state-validation, 05-ui-standards, 06-git-workflow, 07-testing)

## ตารางเส้นทาง (งานประเภทไหน → เปิดเอกสารไหน)

| งาน | อ่านหลัก | อ่านประกอบ |
|---|---|---|
| Prisma schema / migration / seed | `02` (ผ่าน MAP — ห้ามอ่านทั้งไฟล์) | `92`, `26`, `94` |
| Auth / Login / Session | `05` | `07`, `01` §6.1 |
| Roles & Permissions | `07`, `25` | `13` §6.10 (DEC-009) |
| Users / Teams / Finance Companies | `08` / `09` / `10` | `07`, `11`, `12` |
| Compensation Plan / Service Fee | `11` / `12` | `22` §6.1–6.7 |
| Settings 13 แท็บ | `13` (ผ่าน MAP) | `25`, `02` Group B |
| Case Submission / Assignment | `38` / `40` (ผ่าน MAP) | `09`, `10`, `12` |
| Field Tracker | `41` (ผ่าน MAP) | `11`, `22` §6.1–6.4, `23` §6.3 |
| Warehouse / Handover | `44` (ผ่าน MAP) | `19` §6.1, `92` §6.1 |
| Claims & Advances / Approval / Payout | `15` / `16` / `17` | `23`, `13` §6.2/§6.8, `18` |
| Payee & Tax Profile | `18` | `13` §6.4 |
| Revenue / Billing / AR | `19` | `22` §6.5–6.8, `44` §11, `12` |
| Adjustment | `20` | `13` §6.11, `23` §6.9 |
| Accounting (ปิดงวด/ขาย/จ่าย/WHT/Exception/Reconcile/Export) | `30`–`37` ตามเรื่อง | `23`, `24`, `28` |
| สูตรคำนวณเงินใดๆ | **`22` เสมอ** | ไฟล์ต้นทางของ module |
| State transition / Error code / Permission / API path | `23` / `24` / `25` / `27`+`45` | `02` §3 |
| PDF / Export / Bank File | `28` | `13` §6.8/§6.13, `31`/`33`/`37` |
| Audit / Notification / Jobs | `90` / `91` | `02` Group G |
| Reports 17 ตัว | `96` | ไฟล์ต้นทางของรายงานนั้น |
| Client Portal | `97` | `10`, `19`, `31`, `44`, `96` |
| UI component / สี / ฟอนต์ / badge | `04` §8.1 + mockup ใน `reference/` | `06` |
| เมนู / นำทาง / สิทธิ์เห็นเมนู | `06` | `07` |
| E2E / acceptance test | `29` + §16 ของไฟล์ module | `24` |
| Open Items / คำถามค้าง | `93` §7.1 | `DECISIONS-NEEDED.md`, `QUESTIONS-FOR-ACCOUNTANT.md` |

## Context Discipline (บังคับ — งบ context มีจำกัด)

- **ห้ามอ่านไฟล์ใหญ่ทั้งไฟล์** (`02`, `38`, `40`, `41`, `44`, `13`, `97`, mockup ทุกตัว) — เปิด `docs/00_MAP.md` หาช่วงบรรทัดแล้ว `Read(offset, limit)` เฉพาะหัวข้อ
- **Grep ก่อน Read เสมอ** — ห้ามเปิดทั้งไฟล์เพื่อ "ดูว่ามีอะไร"
- งานสำรวจ/วางแผนหลายไฟล์ → ใช้ **subagent** อ่านในหน้าต่างของมันแล้วส่งกลับข้อสรุป
- ไฟล์ generated (migration SQL ที่ gen แล้ว, lockfile, snapshot, `.next/`) **ห้ามผ่าน context** — ใช้ `grep`/`head` เท่านั้น
- แก้ไฟล์ใหญ่ = Grep หาจุด → `Edit` เฉพาะจุด — ห้าม Read ทั้งไฟล์แล้ว Write ทับ
- อ่าน spec เฉพาะไฟล์ตาม reading list ของ task ใน `docs/01_PLAN.md` — ไม่อ่านเผื่อ

## ขนาดงานต่อ Session (Opus 5 — context 1M)

- ทุก task ใน `PROGRESS.md` ถูกวางขนาดให้จบใน 1 session โดยใช้ context ไม่เกิน **~800k tokens** (ดูงบรายละเอียดต่อ task ที่ `docs/01_PLAN.md`)
- **checkpoint 600k**: ถ้างานยังไม่จบ ให้เริ่มเก็บงาน — commit ก้อนที่เสร็จ, เขียนสรุปที่เหลือ
- **เพดาน 800k**: commit แล้ว `[[HANDOFF]] <สรุปที่เหลือ>` — **ห้าม HANDOFF โดยไม่ commit ก่อน**
- แต่ละ task ต้อง **verify จบในตัว**: `pnpm typecheck` + `pnpm test` + lint ผ่าน แล้วจึง commit
- ถ้าประเมินแล้ว task ใหญ่เกินจริง → แตกเป็น sub-task (เช่น `2.4a`/`2.4b`) ใน PROGRESS.md ก่อนลงมือ โดยยึดแนว: migration/schema ก่อน → pure logic + test → backend → UI (แตกที่ขอบแท็บ)

## Repo Layout

```
CLAUDE.md / WORKFLOW.md / PROGRESS.md   → กติกา / วงจรงาน / สถานะงาน (orchestrator อ่าน PROGRESS.md)
docs/                                   → spec ทั้งหมด (00–97) + 00_INDEX + 00_MAP + 01_PLAN + PROGRESS_ARCHIVE + REUSE_INDEX
reference/                              → HTML mockups + samples/ (template CSV/PDF/XLSX ตัวอย่าง)
orchestrator/ , tools/devpanel/         → เครื่องมือ automation (adapt ตาม promptmovetools.md — task 0.3)
app/ components/ lib/ prisma/           → โค้ดแอป (เกิดจาก task 0.1 เป็นต้นไป — โครงตาม docs/implementation-todo.md §0.2)
```

## โปรโตคอลถาม/จบงาน

- ติดจุดตัดสินใจ (เอกสารขัดกัน/สเปคไม่ชัด/ต้อง credential) → หยุด ห้ามเดา ห้าม commit แล้วพิมพ์ `[[NEEDS_DECISION]] <คำถาม>` (+ `[[OPTIONS]] ก (แนะนำ) | ข | ค` ถ้ามีตัวเลือก)
- เสร็จสมบูรณ์ (verify ผ่าน + commit + อัปเดต PROGRESS.md แล้ว) → `[[TASK_DONE]] <commit hash> <headline>`
- อัปเดต PROGRESS.md ทุกครั้งที่จบ task: มาร์ค ✅ + commit hash ใน backtick + ย้ายรายละเอียดลง `docs/PROGRESS_ARCHIVE.md` + เลื่อน "🎯 งานถัดไป" ไป task ถัดไป (คัดรายละเอียดจาก `docs/01_PLAN.md`)
- ก่อนเขียนโค้ดใหม่ทุกครั้ง เช็ค `docs/REUSE_INDEX.md` ว่ามี component/util/pattern อยู่แล้วหรือยัง — สร้างของใหม่ที่ reuse ได้ → เพิ่มลง REUSE_INDEX ด้วย

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
