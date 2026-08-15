# PROGRESS.md — AssetRecovery (Single Source of Truth ของสถานะงาน)

**อัปเดตล่าสุด:** 2026-08-15 — ปิด Phase 3.3 (Approval FE + Claims & Advances) · งานถัดไป 3.4

> วิธีใช้: ดู `WORKFLOW.md` (วงจรต่อ session) + `CLAUDE.md` (กติกา) · รายละเอียดเต็มของทุก task อยู่ `docs/01_PLAN.md` — อ่านเฉพาะ § ของ task ที่ทำ · จบ task แล้วมาร์ค ✅ + commit hash + ย้ายรายละเอียดไป `docs/PROGRESS_ARCHIVE.md` + เลื่อน "งานถัดไป"

---

## 🎯 งานถัดไป — Phase 3.4: Payout Batch Backend (17) + Claims FE ส่วนที่เหลือ

- ทำตาม `docs/01_PLAN.md` §3.4 — **สูตรเงินทุกตัวเรียกจาก `lib/finance/*` (3.1) เท่านั้น ห้ามคำนวณเอง**
- BE 17: batch builder (ดึง `approved` ตาม cutoff/side · `UNVERIFIED_PAYEE_IN_PAYOUT` reject · `MIXED_SIDE_BATCH` · draft→checking อัตโนมัติ) + roll-up gross/wht/net ผ่าน `summarizePayoutBatch()` (3.1)
- payment file generator ตาม `13` §6.8 — gate `assertBankFileUsable()` (`BANK_FILE_NOT_TESTED`) + **`idempotency_key` UNIQUE กันโอนซ้ำ** + `DUPLICATE_PAYMENT_FILE` (เตือนพร้อมวันที่ครั้งก่อน ไม่ block) + audit ทุกก้าว
- complete endpoint + hook รอรับ sync จากไฟล์ 35 (Phase 4.2) · snapshot `tax_profile`/`wht_pct` ลง `payout_batch_items` (`92` §7.1)
- FE 15 ส่วนที่เหลือ: แท็บ "เงินทดรองจ่าย" เต็มรูป (ตาราง 9 คอลัมน์ + banner ยอดค้าง) — เสียบที่ `operation-tabs.ts` (`available: true`) แล้วต่อ component ใน `<FinanceShell>`
- ของที่มีแล้วห้ามเขียนซ้ำ: `summarizePayoutBatch()`/`calculateWhtForPayee()` (3.1) · `PayeeDto.isVerified` + `missingForVerification` (3.2) · `assertBankFileUsable()` (1.10) · `<FinanceShell>`/`advance-ui.ts`/`<AdvanceFormModal>` (3.3)
- อ้างอิง: `17` ทั้งไฟล์ · `18` §6.2 · `22` §6.9–6.10 · `13` §6.1/§6.8 · mockup `finance.html` ผ่าน MAP
- DoD: เทสต์ idempotency (ยิงซ้ำได้ batch เดิม) + gate payee ยังไม่ยืนยัน · LOC ~1,950 · งบ ~300k

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
| 1.3 | Auth + Permission middleware + Login | ✅ | 2026-08-14 · `edfdd9b` · requirePermission + scope 4 แบบ + session 24 ชม. + หน้า Login · ⚠️ ต้องรัน `pnpm auth:link-superadmin` 1 ครั้งต่อ environment → archive |
| 1.4 | Audit core service (immutable) | ✅ | 2026-08-14 · `09b283a` · immutable 2 ชั้น (DB trigger + Prisma extension) + นโยบาย `reason` + diff util + เทสต์ระดับ DB → archive |
| 1.5 | UI Kit + App Shell + Navigation | ✅ | 2026-08-14 · `e4d56b4` · UI Kit `components/ui/*` + App Shell 7 เมนูตาม `06` §7.2 + utils พ.ศ./satang + statusBadge 10 กลุ่ม + `GET /api/meta/menu` → archive |
| 1.6 | Roles & Permissions module | ✅ | 2026-08-14 · `a5ef75c` · API 7 endpoint + ยาม seed role/lock 9 capability + หน้า `/settings/roles` + seed `role_capabilities` 57 แถว → archive |
| 1.7 | Compensation Plans + Service Fee Templates | ✅ | 2026-08-14 · `8417ef1` · API 8 endpoint + versioning (PATCH ไม่ overwrite) + conditional validation fuel 2 โหมด/3 model + หน้าการ์ด 2 แบบ → archive |
| 1.8 | Teams + Finance Companies | ✅ | 2026-08-14 · `0565ff7` · API 11 endpoint + scope ระดับแถว (ทีมตัวเอง/บริษัทตัวเอง) + `02` v3.9 เพิ่ม 2 คอลัมน์ตามมติ PO + หน้าตารางทีม/การ์ดบริษัท → archive |
| 1.9 | Users module | ✅ | 2026-08-14 · `9e505ef`+`680159e` · API 8 endpoint + lifecycle + `USER_HAS_HISTORY` + invite ทางอีเมล (**ปิด D1**) + หน้า `/settings/users` · ⚠️ ต้องรัน `pnpm db:seed` ซ้ำ + ตั้ง Redirect URL ที่ Supabase → archive |
| 1.10 | Settings ไฟล์ 13 — Backend ครบ 13 หมวด | ✅ | 2026-08-14 · `53f4c38`+`b00a5f9` · API 22 endpoint ครบ 13 หมวด + 2 endpoint ที่ spec ตกหล่น + VAT resolver/เดินเลขใบกำกับ atomic → archive |
| 1.11 | Settings FE ชุด 1 (Cycles/Approval/Bank/CostCenter/BankFile) | ✅ | 2026-08-14 · `0eb2e81` · shell 13 แท็บ (`/settings/finance`) + 5 แท็บแรก CRUD ครบ + บังคับ `reason` ทุก mutation → archive |
| 1.12 | Settings FE ชุด 2 (Tax/VAT/Matrix/Lock/Numbering/Template) | ✅ | 2026-08-14 · `fa00f40`+`7e5d61e` · ครบ 13 แท็บของไฟล์ 13 — 8 แท็บที่เหลือ + capability เฉพาะแท็บ + read-only 3 แท็บ → archive |

## Phase 2 — Case & Field Operations (ไฟล์ 38, 40, 41, 44, 45)

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 2.1 | API Contract Infra (ไฟล์ 45) — 39 endpoints + events + envelope | ✅ | 2026-08-14 · `4dba3a3` · contract 39 endpoint + ทะเบียน event 34 + กฎ ESLint + envelope กลาง + error catalog 129 code (เทสต์เทียบ spec จริง) → archive |
| 2.2 | Case Submission BE ชุด 1 (schema/CRUD/เอกสาร) | ✅ | 2026-08-14 · `d5accc2` · schema เคสครบตามไฟล์ 38 §6 + API 5 endpoint + กันเลขสัญญาซ้ำ 2 ชั้น (เทสต์ concurrency 3 ช่องทาง) → archive |
| 2.3 | Case Submission BE ชุด 2 (state/routing/recycle/import/snapshot) | ✅ | 2026-08-14 · `03b50e6` · state machine 8 action + routing จังหวัด + snapshot ค่าบริการตอน approved + recycle ไม่จำกัดรอบ + import ต่อแถว → archive |
| 2.4 | Case FE ชุด 1 (list/form/address component) | ✅ | 2026-08-14 · `9c05e9e` · หน้า `/cases/submit` (filter/pagination/card list) + ฟอร์มรับเคส-แก้ไข + `<AddressFields>` shared (77 จังหวัด + postal auto-complete) → archive |
| 2.5 | Case FE ชุด 2 (docs/suggestion/review modal/import) | ✅ | 2026-08-14 · `07100c8`+`267b3f3` · ผู้ติดต่อ/เอกสาร/รูปสินค้า + ทีมที่เสนอ (ข้อมูลดิบ) + `<CaseDetailModal>` shared 4 โหมด + import wizard · ⚠️ ต้องสร้าง bucket `case-documents` ต่อ environment → archive |
| 2.6 | Case Assignment BE | ✅ | 2026-08-14 · `a79c64c` · schema คำขอเปลี่ยนผู้รับผิดชอบ + API 8 endpoint ของ `45` §6.2 + reassign 2 สาขา + job timeout idempotent + `successRate()` service กลาง → archive |
| 2.7 | Case Assignment FE | ✅ | 2026-08-14 · `612e3b2` · หน้า `/cases/assign` + Assignment Modal (reuse `<CaseDetailModal>`) + Kanban full-screen read-only + `assignment-ui.ts` (ปุ่มหัวหน้า = ซ่อนตาม settings) → archive |
| 2.8 | Field Tracker BE ชุด 1 (core flow) | ✅ | 2026-08-14 · `0465255`+`3f8328f`+`2122229` · `assignment_status` 7 ค่า + `travel_origins`/`close_case_drafts` + API 8 endpoint (รับงาน→จัดวัน→เช็คอิน→ปิดงาน) → archive |
| 2.9 | Field Tracker BE ชุด 2 (เงิน/ตีกลับ/push) | ✅ | 2026-08-14 · `dcb0fc3`+`f19cad0`+`71d8b8d`+`6af1d76` · มติ PO: +5 คอลัมน์ `expenses` + `push_subscriptions` (`02` v4.3) · D10 ✅ · expense อัตโนมัติ + 2 เส้นทางตีกลับ + Web Push · ⚠️ ต้องตั้ง `GOOGLE_MAPS_API_KEY` + VAPID ที่ Vercel → archive |
| 2.10 | Field FE ชุด 1 (shell/detail/งานรายวัน/calendar) | ✅ | 2026-08-14 · `97afe2e`+`4d53196` · shell mobile/desktop (sidebar 260px fixed) + `<FieldCaseDetailBody>` ใช้ซ้ำ 3 ที่ + 3 แท็บงาน + Calendar Picker → archive |
| 2.11 | Field FE ชุด 2 (ฟอร์มปิดงาน/reassignment) | ✅ | 2026-08-14 · `66be882`+`011318f` · ฟอร์มปิดงาน 3 ส่วน (auto GPS + ลากแผนที่ + เช็คอินจากอุปกรณ์จริง + สื่อ 4 ชนิด + draft) + โหมด `needs_revision` + flow คำขอเปลี่ยนผู้รับผิดชอบครบ 3 ทางเข้า → archive |
| 2.12 | Field FE ชุด 3 (เบิกเงิน/รายได้/จบงาน/PWA) | ✅ | 2026-08-14 · `1af69ae`+`07b2744` · 4 หน้าจอสุดท้ายของไฟล์ 41 (เบิกเงิน 2 ขอบแท็บ/รายได้/จบงาน/dashboard) + PWA manifest + service worker + กระดิ่งแจ้งเตือนในแอป · ⚠️ ต้องตั้ง `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (คู่กับ `VAPID_*`) ที่ Vercel ก่อน push จริงจะทำงาน → archive |
| 2.13 | Warehouse BE (confirm = transaction 4 steps) | ✅ | 2026-08-15 · `32f6b4c`+`b9b1f0a` · API 10 endpoint + confirm 4 ขั้น + PDF/Excel ใบส่งมอบ + Revenue stub (ของจริง 3.6) · เทสต์ T01–T15 ของ `44` §17 · ⚠️ ต้องรัน `pnpm db:deploy` ต่อ environment → archive |
| 2.14 | Warehouse FE ชุด 1 (รับเข้าคลัง/ในคลัง) | ✅ | 2026-08-15 · `8d25403` · หน้า `/warehouse` จริง 4 แท็บ + badge + modal รับเข้าคลัง 3 ขั้น (force proceed) + แท็บในคลัง (การ์ด/drill-down/checkbox) → archive |
| 2.15 | Warehouse FE ชุด 2 (ส่งมอบ/แนบเอกสาร) | ✅ | 2026-08-15 · `557fc34` · modal นัดวันส่งมอบ + 2 แท็บล็อต (`<LotTab>`) + แนบเอกสาร/ยืนยันส่งมอบ + ค้นล็อตด้วย IMEI/ชื่อลูกหนี้ → archive |

## Phase 3 — Finance Module (ไฟล์ 14–21, 22)

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 3.1 | Pure calculation modules + unit tests (ไฟล์ 22 ครบ 13 สูตร) | ✅ | 2026-08-15 · `0a05c48` · `lib/finance/*` ครบ 13 สูตร + เทสต์ 169 เคส + ยาม `formula-coverage` อ่าน `22` เทียบทะเบียน → archive |
| 3.2 | Payee & Tax Profile + Compensation Approval BE | ✅ | 2026-08-15 · `fe2834b`+`68cd696` · API 7 endpoint (payee 4 + compensation 3) + auto-reset unverified + สายอนุมัติหลายขั้น snapshot + `expense.approved` → Revenue gate · เทสต์ระดับ DB 19 เคส → archive |
| 3.3 | Approval FE + Claims & Advances | ✅ | 2026-08-15 · `d1f39f6`+`45bd3a1` · API 9 endpoint (`27` §6.4) + ห้ามเบิกซ้อน 2 ชั้น + job auto-overdue idempotent + หน้า `/finance` 2 แท็บแรก · เทสต์ระดับ DB 22 เคสของ `15` §16 → archive |
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
