# PROGRESS.md — AssetRecovery (Single Source of Truth ของสถานะงาน)

**อัปเดตล่าสุด:** 2026-08-14 — ปิด Phase 1.2 (schema ครบ 53 ตาราง + seed master data ลง DB จริงแล้ว) · งานถัดไป 1.3

> วิธีใช้: ดู `WORKFLOW.md` (วงจรต่อ session) + `CLAUDE.md` (กติกา) · รายละเอียดเต็มของทุก task อยู่ `docs/01_PLAN.md` — อ่านเฉพาะ § ของ task ที่ทำ · จบ task แล้วมาร์ค ✅ + commit hash + ย้ายรายละเอียดไป `docs/PROGRESS_ARCHIVE.md` + เลื่อน "งานถัดไป"

---

## 🎯 งานถัดไป — Phase 1.3: Auth & Access Control + Permission Middleware

- ทำตาม `docs/01_PLAN.md` §1.3 — Supabase Auth integration (server/client แยก) · `proxy.ts` (Next 16 เปลี่ยนชื่อจาก `middleware.ts`) verify JWT · `requirePermission(action, resource, scope)` + scope resolver (global/team/company/self ตาม `role_group`) + cache role+scope ใน session (ห้าม query DB ทุก request) · session timeout 24 ชม. · guard ห้าม deactivate Superadmin คนสุดท้าย · audit hook login/logout/failed (ใช้ audit core จาก 1.4 — ทำก่อนให้ stub interface) · หน้า Login จาก `reference/login.html` · route guard + `<Can>` / `usePermission()`
- **ฐานข้อมูลพร้อมแล้ว (1.2)**: 15 roles + 47 capabilities (37 อยู่ใน Functional Matrix) + user seed `superadmin@assetrecovery.local` (`supabase_uid` ยัง NULL — ต้องผูกกับ Supabase Auth user ในงานนี้)
- สิทธิ์ 3 ระดับ (DEC-009): ไม่มี record = มองไม่เห็น / `view` / `manage` ที่ `role_capabilities.access_level` · Superadmin = manage ทุกอย่าง **ไม่เก็บ record** enforce ที่ middleware · ผูก role ↔ capability ตาม matrix เต็มเป็นงาน 1.6
- อ้างอิง: `05` ทั้งไฟล์ · `07` §6–§7 · `01` §6.1 · `02` Group A · mockup `login.html`
- LOC ~1,800 · งบ ~280k
- DoD: login/logout จริงบน staging · user ไม่ active ถูกปฏิเสธ · endpoint ที่ไม่มีสิทธิ์ตอบ 403 แม้เรียกตรง · test permission middleware ครอบ scope ทั้ง 4 แบบ

---

## Phase 0 — Infrastructure & Automation Setup

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 0.1 | Bootstrap Next.js + โครงสร้าง + CI | ✅ | `7eda8e3` · Next 16 + Prisma 7 + vitest + CI · รายละเอียด: PROGRESS_ARCHIVE |
| 0.2 | Deploy pipeline ฝั่ง Staging (Production เลื่อนไปก่อน PR แรกเข้า main) | ✅ | `6e3fedf`+`6cccf92`+`04f5341` · ⚠️ ค้างฝั่ง Vercel UI: domain ประจำ + env 5 ตัว (บล็อก 1.1) — ดู PROGRESS_ARCHIVE |
| 0.3 | Adapt Orchestrator + Dev Panel (promptmovetools.md) | ✅ | `3a54bb2` · baseBranch=staging · DoD 7 ข้อผ่านครบ · รายละเอียด: PROGRESS_ARCHIVE |

## Phase 1 — Foundation (DB → Auth → Master Data → Settings)

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 1.1 | Prisma schema ชุด 1: enums 54 + Group A+B (19 ตาราง) | ✅ | `35dfb6e` · 55 enums (+due_rule_type A5) · CHECK+DEFERRABLE ผ่าน raw SQL · รายละเอียด: PROGRESS_ARCHIVE |
| 1.2 | Prisma schema ชุด 2: Group C–G (32 ตาราง) + seed | ✅ | 2026-08-14 · `1eba90e` · 53 ตารางครบ + seed idempotent (15 roles / 47 capabilities) · A1/A2/A4/A6/B3 ปิดครบ → archive |
| 1.3 | Auth + Permission middleware + Login | ⬜ | PLAN §1.3 · ไฟล์ 05 · session 24 ชม. |
| 1.4 | Audit core service (immutable) | ⬜ | PLAN §1.4 · ไฟล์ 90 §13 |
| 1.5 | UI Kit + App Shell + Navigation | ⬜ | PLAN §1.5 · ไฟล์ 04+06 |
| 1.6 | Roles & Permissions module | ⬜ | PLAN §1.6 · ไฟล์ 07+25 |
| 1.7 | Compensation Plans + Service Fee Templates | ⬜ | PLAN §1.7 · ไฟล์ 11+12 · ก่อน 1.8 |
| 1.8 | Teams + Finance Companies | ⬜ | PLAN §1.8 · ไฟล์ 09+10 |
| 1.9 | Users module | ⬜ | PLAN §1.9 · ไฟล์ 08 |
| 1.10 | Settings ไฟล์ 13 — Backend ครบ 13 หมวด | ⬜ | PLAN §1.10 · +2 endpoint ที่ spec ตกหล่น |
| 1.11 | Settings FE ชุด 1 (Cycles/Approval/Bank/CostCenter/BankFile) | ⬜ | PLAN §1.11 |
| 1.12 | Settings FE ชุด 2 (Tax/VAT/Matrix/Lock/Numbering/Template) | ⬜ | PLAN §1.12 |

## Phase 2 — Case & Field Operations (ไฟล์ 38, 40, 41, 44, 45)

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 2.1 | API Contract Infra (ไฟล์ 45) — 37 endpoints + events + envelope | ⬜ | PLAN §2.1 |
| 2.2 | Case Submission BE ชุด 1 (schema/CRUD/เอกสาร) | ⬜ | PLAN §2.2 · duplicate 2-layer |
| 2.3 | Case Submission BE ชุด 2 (state/routing/recycle/import/snapshot) | ⬜ | PLAN §2.3 · snapshot ตอน approved |
| 2.4 | Case FE ชุด 1 (list/form/address component) | ⬜ | PLAN §2.4 · address reuse ไฟล์ 41 |
| 2.5 | Case FE ชุด 2 (docs/suggestion/review modal/import) | ⬜ | PLAN §2.5 · detail modal reuse 40/41 |
| 2.6 | Case Assignment BE | ⬜ | PLAN §2.6 · reassign 2 branch + timeout job |
| 2.7 | Case Assignment FE | ⬜ | PLAN §2.7 · Kanban read-only |
| 2.8 | Field Tracker BE ชุด 1 (core flow) | ⬜ | PLAN §2.8 · GPS จริงเท่านั้น |
| 2.9 | Field Tracker BE ชุด 2 (เงิน/ตีกลับ/push) | ⬜ | PLAN §2.9 · ต้องมี Google Maps API key |
| 2.10 | Field FE ชุด 1 (shell/detail/งานรายวัน/calendar) | ⬜ | PLAN §2.10 |
| 2.11 | Field FE ชุด 2 (ฟอร์มปิดงาน/reassignment) | ⬜ | PLAN §2.11 |
| 2.12 | Field FE ชุด 3 (เบิกเงิน/รายได้/จบงาน/PWA) | ⬜ | PLAN §2.12 |
| 2.13 | Warehouse BE (confirm = transaction 4 steps) | ⬜ | PLAN §2.13 · Revenue stub → ของจริง 3.6 |
| 2.14 | Warehouse FE ชุด 1 (รับเข้าคลัง/ในคลัง) | ⬜ | PLAN §2.14 |
| 2.15 | Warehouse FE ชุด 2 (ส่งมอบ/แนบเอกสาร) | ⬜ | PLAN §2.15 |

## Phase 3 — Finance Module (ไฟล์ 14–21, 22)

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 3.1 | Pure calculation modules + unit tests (ไฟล์ 22 ครบ 13 สูตร) | ⬜ | PLAN §3.1 · ก่อนทุกงานใน Phase |
| 3.2 | Payee & Tax Profile + Compensation Approval BE | ⬜ | PLAN §3.2 · WHT Payee ชนะ Plan |
| 3.3 | Approval FE + Claims & Advances | ⬜ | PLAN §3.3 · ห้ามเบิกซ้อน + overdue job |
| 3.4 | Payout Batch BE (idempotency + bank file) | ⬜ | PLAN §3.4 · gate BANK_FILE_NOT_TESTED |
| 3.5 | Payout FE + Internal PDFs | ⬜ | PLAN §3.5 · เทียบ samples 04–06 |
| 3.6 | Revenue / Billing / AR BE | ⬜ | PLAN §3.6 · เสียบ stub จาก 2.13 |
| 3.7 | Billing FE + Adjustment | ⬜ | PLAN §3.7 · 4 FK + CHECK (DEC-004) |
| 3.8 | Profitability + Finance Dashboard | ⬜ | PLAN §3.8 |

## Phase 4 — Accounting Module (ไฟล์ 30–37)

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 4.1 | Exceptions + Period/Readiness/Lock guard | ⬜ | PLAN §4.1 · guard cross-cutting |
| 4.2 | Bank Reconciliation | ⬜ | PLAN §4.2 · trigger 2 ทาง (31/17/19) |
| 4.3 | Sales & Receipts + Tax Invoice + PDF | ⬜ | PLAN §4.3 · เลขห้าม gap |
| 4.4 | Accounting Expenses + Accountant Questions | ⬜ | PLAN §4.4 |
| 4.5 | WHT Data + ใบ 50 ทวิ PDF | ⬜ | PLAN §4.5 · cancelled ไม่นับยอด |
| 4.6 | Accounting Pack Export (8 ไฟล์ + SHA-256) | ⬜ | PLAN §4.6 · เทียบ samples 01–08 |
| 4.7 | Accounting FE ที่เหลือ (shell/periods/exceptions/sales) | ⬜ | PLAN §4.7 |

## Phase 5 — Platform Services (ไฟล์ 90, 91)

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 5.1 | Notification Service + Notification Center | ⬜ | PLAN §5.1 · Push/In-app เท่านั้น |
| 5.2 | Event wiring ทุกโมดูล + Audit Log UI | ⬜ | PLAN §5.2 |
| 5.3 | Job Engine + Handlers + Job Log | ⬜ | PLAN §5.3 · dev trigger 404 ใน prod |

## Phase 6 — Reports (ไฟล์ 96) + แดชบอร์ดหลัก

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 6.1 | Report Framework + Export Engine | ⬜ | PLAN §6.1 · cache 3 โหมด |
| 6.2 | รายงานหมวด F (F1–F5) | ⬜ | PLAN §6.2 |
| 6.3 | รายงานหมวด O (O1–O5) | ⬜ | PLAN §6.3 · Manager team scope |
| 6.4 | รายงานหมวด A (A1–A4) | ⬜ | PLAN §6.4 |
| 6.5 | Executive Dashboard (E1–E3) | ⬜ | PLAN §6.5 · Exec/Superadmin เท่านั้น |
| 6.6 | แดชบอร์ดหลัก (เมนูแรก Top Nav) | ⏸️ | PLAN §6.6 · รอ PO อนุมัติ spec (dashboard.html เป็น DRAFT) |

## Phase 7 — Client Portal (ไฟล์ 97) 🔒 (ปลดล็อกเมื่อ PO ตอบ Auth method — `97` §22 #2)

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 7.1 | Portal Auth + Scope Middleware (company_id) | ⬜ | PLAN §7.1 · บล็อกด้วย Auth method |
| 7.2 | Portal API 11 endpoints + Status Mapping | ⬜ | PLAN §7.2 · GET เท่านั้น |
| 7.3 | Portal FE (Desktop + Mobile) | ⬜ | PLAN §7.3 |

## Phase 8 — Integration, Acceptance & Final

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 8.1 | E2E Acceptance Tests (ไฟล์ 29 — 5 scenarios + 9 checks) | ⬜ | PLAN §8.1 |
| 8.2 | Consistency Sweep + Hardening | ⬜ | PLAN §8.2 |
| 8.3 | Final Test ทั้งระบบ (ด่าน orchestrator) | ⬜ | PLAN §8.3 |

---

## บันทึกการตัดสินใจระหว่างพัฒนา

> ส่วนนี้ parser ไม่อ่านเป็น task — ใช้เก็บ decision ระหว่างทาง (decision ระดับ architecture ต้องไปลง `docs/94-decision-log.md` เป็น DEC ใหม่ด้วย)

- 2026-08-11 — โครงเอกสารชุดนี้สร้างจาก spec `Project_info/assetrecovery_final` (Batch 6 ปิดครบ, DEC-001…009) โดยคงเนื้อหา spec เดิม 100% (คัดลอก byte-identical เข้า `docs/` + `reference/`) แล้วเพิ่มชั้นควบคุม: CLAUDE.md / WORKFLOW.md / PROGRESS.md / docs/00_INDEX / 00_MAP / 01_PLAN / REUSE_INDEX ให้เข้าฟอร์แมต orchestrator
- 2026-08-11 — ขนาด task ตั้งตามงบ context 800k ของ Opus 5 (1M window) — ใหญ่กว่าเกณฑ์ ~2,000 LOC ของ ADAPT_GUIDE (ซึ่ง calibrate ที่ 200k ctx) โดยตั้งใจ เพื่อลดจำนวนครั้งที่ต้องขึ้น session ใหม่ · ทุก task ยัง verify จบในตัว
- คำถามค้างถึง PO/นักบัญชี (ไม่บล็อกการเริ่ม Phase 0–1): ดูท้าย `docs/01_PLAN.md` แต่ละ Phase + `docs/93-roadmap-open-items.md` §7.1 — จุดที่บล็อกจริง: (Q1) Auth method ของ Client Portal → บล็อก Phase 7 · (Q2) spec แดชบอร์ดหลัก → บล็อก 6.6 · (Q3) Google Maps API key + budget → ต้องมีก่อน 2.9 · (Q4) spec↔schema drift 5 จุดของ Accounting (`export_records.version` int vs string ฯลฯ — ดู PLAN หมายเหตุ Phase 4) → default ยึด `02` · (Q5) เลขที่ใบกำกับภาษี format → ต้องตอบก่อนออก invoice จริงใบแรก (ไม่บล็อก build)
- 2026-08-12 — **มติ PO เรื่อง Release Flow**: พัฒนาบน local (สาย `staging`) → คน push `origin staging` ทดสอบบนระบบนิเวศจริง (Vercel+Supabase staging) → ผ่านแล้วจึงเปิด PR `staging`→`main` เป็นทางเดียวเข้า production — **ห้าม push/merge เข้า main ที่ไม่ได้มาจาก staging** · orchestrator ใช้ `baseBranch = staging` (ตั้งใน task 0.3) · รายละเอียด `.claude/rules/06-git-workflow.md`
- 2026-08-12 — **มติ PO ปิด `docs/02_OPEN_DECISIONS.md` ทั้งฉบับ**: เรื่องระบบ/flow ใช้ตามตัวเลือกแนะนำ (ก/default) ทุกข้อ · เรื่องเทมเพลต/รูปแบบ/ค่าที่รองานจริง (บัญชี) ทำเป็น setting พร้อม default (ตารางอยู่หัวไฟล์นั้น) · ข้อยกเว้นห้ามเป็น setting: กฎปัดเศษ, ฐานรวม WHT, Revenue trigger (fix ในโค้ด) · รายการติดธง 🔶 นักบัญชีเซ็นรับก่อนออกเอกสาร/จ่ายเงินจริงครั้งแรก — session ที่ implement ให้ยึดมติหัวไฟล์เป็นหลัก ไม่ต้องรอคำตอบรายข้อ
- 2026-08-13 — **เวอร์ชันเครื่องมือที่ตรึงไว้ตอน bootstrap (0.1)**: Next 16.3 / React 19.2 / Tailwind 4.3 / Prisma 7.9 / vitest 4.1 / Zod 4.4 · **ตรึง TypeScript 5.9** (ไม่ขึ้น 7.x จนกว่า typescript-eslint + next plugin จะนิ่ง) และ **ตรึง ESLint 9** (ESLint 10 พังกับ eslint-plugin-react ที่ eslint-config-next 16 ดึงมา) · Next 16 เปลี่ยน `middleware.ts` → `proxy.ts` และถอด `next lint` · Prisma 7 ย้าย datasource url ไป `prisma.config.ts` + ต้องใช้ driver adapter — ไม่กระทบ DEC-001/002 (stack เดิมทั้งหมด) รายละเอียดที่ `docs/PROGRESS_ARCHIVE.md` §0.1 + กับดักที่ `docs/REUSE_INDEX.md`
- 2026-08-12 — รีวิวรอบ Developer เพิ่ม `docs/02_OPEN_DECISIONS.md` (จุดที่ spec ยัง underspecified/ขัดกันเอง 40+ ข้อ พร้อม default) — **ก่อนเริ่ม 1.1/1.2 ต้องอ่านหมวด A (กระทบ schema: WHT ลูกค้าหัก, payment allocation, tracking_round, advance payout, due_rule, IMEI)** · task ที่ถูกอ้างในไฟล์นั้นต้องเปิดอ่านหมวดที่เกี่ยวก่อนลงมือ · ข้อที่มี [default] ถ้า PO ไม่ค้าน ให้ implement ตาม default แล้วแก้ spec ต้นทาง + changelog
- 2026-08-13 — **PO ลบ `Project_info/` (archive ต้นฉบับ) ออกจาก repo ด้วยตนเอง** — `docs/` + `reference/` เป็นแหล่ง canonical แต่เพียงผู้เดียวนับจากนี้ (สำเนา byte-identical ตรวจ md5 แล้วตอนสร้าง) · ต้นฉบับกู้ได้จากประวัติ git · อัปเดต CLAUDE.md / README / rules/06 / hook / settings.json เอากฎ Project_info ออกแล้ว
