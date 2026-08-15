# PROGRESS.md — AssetRecovery (Single Source of Truth ของสถานะงาน)

**อัปเดตล่าสุด:** 2026-08-15 — ปิด Phase 6.2 (รายงานหมวด F ครบ 5 ตัว: กำไรขั้นต้น + drill-down รายเคส · สรุปรายได้ + กราฟแท่ง/MoM · AR Aging ตามค่าตั้ง · สรุปค่าตอบแทนรายทีม/รายคน · เงินทดรองค้างเคลียร์) · งานถัดไป 6.3 (รายงานหมวด O — O1–O5)

> วิธีใช้: ดู `WORKFLOW.md` (วงจรต่อ session) + `CLAUDE.md` (กติกา) · รายละเอียดเต็มของทุก task อยู่ `docs/01_PLAN.md` — อ่านเฉพาะ § ของ task ที่ทำ · จบ task แล้วมาร์ค ✅ + commit hash + ย้ายรายละเอียดไป `docs/PROGRESS_ARCHIVE.md` + เลื่อน "งานถัดไป"

---

## 🎯 งานถัดไป — Phase 6.3: รายงานหมวด O (O1–O5)

- ทำตาม `docs/01_PLAN.md` §6.3 — O1 Success Rate (`success/(success+fail)` **ไม่รวมเคส open**) · O2 Team Performance/SLA (TAT = calendar days รวมวันหยุด, `slaAlertHours`) · O3 Workload · O4 SLA Breach · O5 Warehouse Summary
- **ใช้โครงของ 6.1/6.2 เท่านั้น**: เขียน provider ลงทะเบียนที่ `FINANCE_REPORT_PROVIDERS` เวอร์ชันของหมวด O แล้วต่อเข้า `REPORT_PROVIDERS` + หน้าจอลงทะเบียนที่ `<ReportScreen>` (กราฟใช้ `<ReportBarChart>`) — ห้ามเขียน route/แคช/ยามสิทธิ์/ตาราง/ปุ่มส่งออกชุดใหม่
- % ความสำเร็จต้องเรียก `successRate()` (`lib/assignments/success-rate.ts` — 2.6) ห้ามคำนวณซ้ำ · ทั้งชุดแคชรายชั่วโมง
- **Manager เห็นเฉพาะทีมตัวเอง** (`96` §14) — `ctx.teamIds !== null` ต้องกรองทุก query · รายการว่าง = ผลลัพธ์ว่าง
- อ้างอิง: `96` §6-O, §13–14 ผ่าน MAP · mockup `reports.html` ผ่าน MAP (`renderO1`–`renderO5`)
- LOC ~1,700 · งบ ~280k

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
| 3.4 | Payout Batch BE (idempotency + bank file) | ✅ | 2026-08-15 · `c344dcb`+`1848a48` · API 5 endpoint + batch builder (ค่าตอบแทน+เงินทดรอง) + ไฟล์โอนตาม `13` §6.8 + idempotency key/เตือนซ้ำ + แท็บเงินทดรองจ่าย · เทสต์ pure 51 + DB 17 · ⚠️ ต้องสร้าง bucket `payment-files` ต่อ environment → archive |
| 3.5 | Payout FE + Internal PDFs | ✅ | 2026-08-15 · `9538009`+`c15a75b` · แท็บรอบจ่ายเงิน (ตาราง+3 modal+ยืนยันซ้ำ 2 จังหวะ) + เอกสารภายใน 3 ใบเทียบ samples 04–06 · fix `lpad` เลขเอกสารเกิน 999 → archive |
| 3.6 | Revenue / Billing / AR BE | ✅ | 2026-08-15 · `fb84fd9`+`294f47f` · RevenueService ตัวจริง (เกต `19` §6.1 + ยอด `22` §6.5–6.8 + snapshot VAT) + Billing Batch/AR Aging + API 7 endpoint · เทสต์ pure 34 + DB 30 (`19` §16 ครบ 8 เคส) → archive |
| 3.7 | Billing FE + Adjustment | ✅ | 2026-08-15 · `c9b7f20`+`43764cb`+`9677446` · แท็บรายได้และวางบิล (2 ตาราง + AR Aging) + Adjustment ทั้งโมดูล (4 FK + CHECK · snapshot งวด · ผู้อนุมัติจาก audit) · เทสต์ pure 30 + DB 16 → archive |
| 3.8 | Profitability + Finance Dashboard | ✅ | 2026-08-15 · `43c654f`+`f04f732` · รายงานกำไร (มิติบริษัท/ทีม + drill-down + แคชรายวัน) + แดชบอร์ด KPI 4 ตัว + exception aggregator · เปิดแท็บการเงินครบ 8/9 · เทสต์ pure 44 + DB 17 → archive |

## Phase 4 — Accounting Module (ไฟล์ 30–37)

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 4.1 | Exceptions + Period/Readiness/Lock guard | ✅ | 2026-08-15 · `5a2b26f` · BE 30/34 ครบ + interceptor `PERIOD_LOCKED_DIRECT_EDIT` ต่อเข้า write การเงิน 15 จุด + เทสต์ DB 14 เคส → archive |
| 4.2 | Bank Reconciliation | ✅ | 2026-08-15 · `1b2adeb` · import statement + auto-match (candidate เดียว) + trigger 2 ทาง (Cash Receipt/payout completed) + แท็บกระทบยอด · เทสต์ pure 79 + DB 16 → archive |
| 4.3 | Sales & Receipts + Tax Invoice + PDF | ✅ | 2026-08-15 · `ecde0e8` · sales sync 1:1 จากการส่งบิล + ใบกำกับภาษี auto-number ไม่ gap (FOR UPDATE ในทรานแซกชันเดียวกับ insert) + trigger immutable + `TaxInvoicePDF` · เทสต์ pure 18 + route 9 + DB 10 → archive |
| 4.4 | Accounting Expenses + Accountant Questions | ✅ | 2026-08-15 · `1f3d525` · sync เฉพาะ payout ที่จ่ายจริง + เอกสารไม่ครบขึ้น exception เอง + map cost center (manual) + ข้อซักถามครบวงจร · เทสต์ pure 24 + route 9 + DB 12 → archive |
| 4.5 | WHT Data + ใบ 50 ทวิ PDF | ✅ | 2026-08-15 · `3fb2f75` · ออกใบอัตโนมัติจากรอบจ่ายที่จ่ายจริง + ยกเลิก/ออกใบแทน trace 2 ทาง + ใบ cancelled ไม่นับยอด + ใบ 50 ทวิ PDF · เทสต์ pure 18 + route 9 + DB 13 → archive |
| 4.6 | Accounting Pack Export (8 ไฟล์ + SHA-256) | ✅ | 2026-08-15 · `8c913c5` · ไฟล์ 01–08 ตรง samples ทุกหัวคอลัมน์ (มีเทสต์อ่านไฟล์ตัวอย่างมาเทียบ) + หน้าปก PDF + zip/SHA-256 เขียนเอง deterministic + versioning ไม่ทับของเดิม · ⚠️ ต้องสร้าง bucket `accounting-packs` ต่อ environment → archive |
| 4.7 | Accounting FE ที่เหลือ (shell/periods/exceptions/sales) | ✅ | 2026-08-15 · `ad12e13` · เปิดครบ 9/9 แท็บหน้าบัญชี — รอบส่งบัญชี (readiness สด + ส่ง/ล็อก/ปลดล็อกบังคับเหตุผล) + เอกสารไม่ครบ (authorized แยกจาก resolved) + รายได้และขาย + เงินรับ · ปุ่มทุกปุ่มมาจาก pure `periodActionsFor()`/`exceptionActionsFor()` → archive |

## Phase 5 — Platform Services (ไฟล์ 90, 91)

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 5.1 | Notification Service + Notification Center | ✅ | 2026-08-15 · `fbc275c` · service idempotent (UUIDv5 = id ไม่แตะ schema) + แค็ตตาล็อก event `90` §6.3 + API 3 endpoint + กระดิ่งกลางใช้ร่วม App/Field + หน้า `/notifications` → archive |
| 5.2 | Event wiring ทุกโมดูล + Audit Log UI | ✅ | 2026-08-15 · `c184aa7`+`984248d` · ต่อ event 9 กลุ่มเข้าการแจ้งเตือน (เหลือ 2 code ที่สคีมายังไม่รองรับ) + job เตือนยื่น WHT + หน้า `/settings/audit-logs` (capability `view_audit_log`) → archive |
| 5.3 | Job Engine + Handlers + Job Log | ✅ | 2026-08-15 · `ee55116` · ตัวรันงานกลาง (idempotency ระดับ DB + backoff + dead letter) + ต่อ handler เดิม 6 ตัว + API 5 endpoint (dev trigger 404 ใน prod) + cron ทุก 10 นาที + หน้า `/settings/jobs` · ⚠️ ต้องรัน `pnpm db:deploy` + `pnpm db:seed` ซ้ำ และตั้ง `CRON_SECRET` ต่อ environment → archive |

## Phase 6 — Reports (ไฟล์ 96) + แดชบอร์ดหลัก

| # | งาน | สถานะ | หมายเหตุ |
|---|---|---|---|
| 6.1 | Report Framework + Export Engine | ✅ | 2026-08-15 · `4d76986`+`83600a2` · ทะเบียน 17 รายงาน + ยามสิทธิ์รายหมวด (การเงินเรียก E1 = 403) + แคช 3 โหมด + โครงหน้าจอกลาง `<ReportView>` + export Excel/PDF (>5,000 แถว = job) · ⚠️ ต้องสร้าง bucket `report-exports` ต่อ environment → archive |
| 6.2 | รายงานหมวด F (F1–F5) | ✅ | 2026-08-15 · `22a3fab` · F1–F5 ครบ (drill-down รายเคส + กราฟแท่ง Recharts + AR bucket จากค่าตั้ง + due วันนี้ยังไม่ overdue) + เทสต์ระดับ DB 10 เคส → archive |
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
- 2026-08-15 — **มติ PO ตอนรีวิว Phase 3 — WHT fallback ต้องเตือน ไม่บล็อก**: `18` §6.3 / Rule 01 บังคับว่า fallback ไปอัตราของ Compensation Plan ได้แต่ **ต้องมี warning** ขณะที่ Rule 04 ล็อกรายชื่อ warn-only code ไว้ตายตัว ⇒ เลือกตัวเลือก ก: เพิ่ม `WHT_RATE_FALLBACK_TO_PLAN` เป็น warn-only ตัวที่ 5 (`docs/24` §6.5 v4.5 + `lib/api/error-catalog.ts` + sync `.claude/rules/04-state-validation.md`) · **ไม่เลือกบล็อก** เพราะ `18` §9 ไม่ได้บังคับให้ Payee ที่ verified ต้องมี Tax Profile — บล็อกจะทำให้จ่ายทั้งรอบไม่ได้เพราะข้อมูลที่แก้ทีหลังได้ · รายชื่อ warn-only ถูกล็อกด้วยเทสต์ (`WARNING_ONLY_CODES`) เพิ่มตัวใหม่ต้องมีมติ PO ทุกครั้ง
- 2026-08-15 — **หนี้ค้างจากรีวิว Phase 4 (ยังไม่แก้ — ต้องทำเป็น task แยก)**: (1) **DB trigger ตาม `02` §13 ยังไม่ครบ** — ทั้ง repo มีแค่ `audit_logs`, `handover_lots`, `tax_invoices` ส่วน `wht_certificates`, `export_records`, `bank_transactions`, `accounting_periods`, `case_evidences`, `payout_batches`, `roles` ยังไม่มี ทั้งที่ `02`:2053 สั่ง "บังคับที่ระดับ table ไม่ใช่แค่ระดับ application" · ยังไม่ exploitable (ไม่มี endpoint ลบ + service กันแล้ว) แต่การใส่ trigger จะทำให้ fixture ของ db test ที่ `DELETE` ตารางเหล่านี้พัง ต้องรื้อเป็นแบบ "org ใหม่ทุกรัน" แบบ `sales.db.test.ts` ⇒ **ทำทีเดียวครบ 7 ตาราง** (2) `GET /api/accounting/periods` เขียนข้อมูล — `listPeriods()` → `backfillPeriods()` INSERT รอบ + audit ใน endpoint ที่ขอแค่ `view` ควรย้ายไป job รายเดือน (`91`) หรือแยกเป็น POST
- 2026-08-15 — **มติ PO ตอนรีวิว Phase 4 — `sent_to_accountant` = `limited` แปลว่า "บล็อกเฉพาะที่กระทบยอด"**: `13` §6.11 ระบุ `directEdit: 'limited'` / `adjustmentRequired: 'sometimes'` ไว้ตั้งแต่ Phase 1.10 แต่ `assertPeriodEditable()` บล็อกเฉพาะ `'blocked'` ⇒ รอบที่ส่งสำนักงานบัญชีแล้วยังแก้ยอดตรงได้เงียบๆ ⇒ เลือกตัวเลือก ก: guard รับ `affectsAmount` (**default `true`** — ลืม = ปลอดภัยไว้ก่อน) แล้วปฏิเสธเมื่อ `limited && affectsAmount` ส่วนงานจัดหมวดที่ไม่ขยับตัวเลข (map cost center) ยังทำได้ · `locked` ยังบล็อกทุกกรณีเหมือนเดิม · **ไม่เลือก** บล็อกทั้งหมด (จะเท่ากับ `locked` ทำให้แถว `limited` ใน `13` §6.11 ไร้ความหมาย) และไม่เลือกปล่อยผ่าน (ยอดที่ส่งบัญชีไปแล้วต้องแก้ผ่าน Adjustment) · ยามอยู่ที่ `lib/settings/period-lock.ts` (`isDirectEditRejected`) ห้ามเขียนกติกาซ้ำที่อื่น
- 2026-08-15 — **รีวิว Phase 5 (แก้แล้วในรอบเดียวกัน)**: (1) **คีย์กันซ้ำของงานเบื้องหลังชนข้ามองค์กร** — `findByIdempotencyKey()` ค้นทั้งระบบ + unique index ไม่ผูก org ⇒ องค์กร B ส่งคีย์ซ้ำได้ job ขององค์กร A กลับไปทั้งดวง (`duplicate: true`) และสร้างงานตัวเองไม่ได้ ⇒ index ใหม่เป็น per-org (`uniq_jobs_org_idempotency_key`) + lookup กรอง org · (2) **`manage_jobs` เป็นทางลัดข้ามสิทธิ์** — `export_pack`/`bank_file` รัน service ที่บังคับสิทธิ์ไว้ที่ route เจ้าของ ⇒ เพิ่ม `jobRequiredCapability()` บังคับ `export_accounting_pack`/`generate_payment_file` ก่อนสร้าง job · (3) **งานค้าง `running` กู้ไม่ได้ทุกทาง** (cron ถูกตัดที่ `maxDuration`) ⇒ `reclaimStaleJobs()` ในรอบ cron · (4) **payload/result ของงานระดับระบบรั่วข้ามองค์กร** ⇒ ซ่อนจากทุกคนที่ไม่ใช่ Superadmin · (5) **หน้า audit เปิดให้ scope `team`/`self` เห็นทั้งองค์กร** ⇒ whitelist `global` · (6) **เงินใน before/after ของ audit โชว์ satang ดิบ + วันที่เป็น ค.ศ.** ⇒ `auditValueText(value, field)` · (7) **การเตือนยื่น ภ.ง.ด. ยิงครั้งเดียวตลอดชีพของงวด** (dedupe key ไม่มีขั้น) ⇒ `whtFilingReminderStage()` · (8) **แจ้งเตือนหายบน Vercel** (promise ลอยหลังส่ง response) ⇒ ผูกกับ `after()` ของ Next + `dispatchToCapability()` กัน unhandled rejection 6 จุด
- 2026-08-15 — **หนี้ค้างจากรีวิว Phase 5 (ยังไม่แก้)**: (1) `/api/notifications*` ใช้ `requireSession()` ไม่ใช่ `requirePermission()` — ปลอดภัยจริง (กรอง `userId + organizationId` ที่ชั้น service) และ `docs/25` ไม่มีแถว notification ⇒ ควรบันทึกข้อยกเว้น "self-scoped endpoint" ลง `25` จะได้ไม่ต้องรีวิวซ้ำทุกเฟส · (2) โมดูล accounting/exports/wht/bank-recon/reports ยังไม่มียาม `assert*Readable()` ปฏิเสธ scope `company`/`team` แบบ jobs/audit/sales — ยังไม่ exploitable (default matrix ไม่ให้ capability กับ role กลุ่มบริษัท) แต่เป็นกับดักถ้า Superadmin ผูก capability ให้ role กลุ่มนั้น · (3) ~~D16/D17 รอมติ PO~~ → **ปิดแล้ว 15/08/2569** (ดูบรรทัดถัดไป)
- 2026-08-15 — **มติ PO ปิด D16/D17 ของรีวิว Phase 5 (ใช้ default ทั้งคู่)**: **D17 — เมนู "การตั้งค่า" เปิดให้การเงิน/บัญชีแบบบางส่วน**: `90` §12 / `91` §12 ให้สองบทบาทนี้ถือ `view_audit_log` / `manage_jobs` (view) แต่ `06` §7.2 เดิมไม่ให้เห็นเมนู ⇒ `requireMenuPage()` เด้งกลับแดชบอร์ด = capability ที่ให้ไว้ใช้ไม่ได้เลยผ่าน UI ⇒ `06` §7.2 v2.2: การตั้งค่า = 🔸 เห็นเฉพาะแท็บ **บันทึกการใช้งาน** + **งานเบื้องหลัง** (อ่านอย่างเดียวทั้งคู่) · แท็บที่ตั้งค่าจริงยังเป็นของ Superadmin+บริหาร · `/settings` ต้อง redirect ไป **แท็บแรกที่ผู้ใช้เห็น** (`firstVisibleChildPath()`) ไม่ใช่ `/settings/roles` ตายตัว — ไม่งั้นสองบทบาทนี้เด้งออกตั้งแต่หน้าแรก · สั่งงาน/retry ยังทำไม่ได้ (บังคับที่ API) · **D16 — ถอน 2 event ที่สคีมาไม่มีที่ให้เกิด**: `payout_batch.failed` (`02` §3 ไม่มีสถานะล้มเหลว) + "Exception ใกล้ deadline" (`02` §9 ไม่มีคอลัมน์ due date) ออกจาก `90` §6.3 (v2.3) — ยึดลำดับเอกสาร `02` ชนะไฟล์ spec ของโมดูล ห้ามประดิษฐ์ status/คอลัมน์ใหม่ · ต่อสายได้เมื่อมีมติเพิ่มลง `02` · **เพิ่ม `25` §8.1** บันทึก endpoint แบบ self-scoped (`/api/notifications*`, `/api/field/notifications*`, `/api/meta/menu`) ที่ใช้ `requireSession()` ไม่ผูก capability — จะได้ไม่ถูกหยิบเป็น finding ซ้ำทุกรอบรีวิว
- 2026-08-15 — **หนี้ค้างที่ยังเหลือจากรีวิว Phase 5 (ต้องทำเป็น task แยก)**: โมดูล accounting/exports/wht/bank-recon/reports ยังไม่มียาม `assert*Readable()` ปฏิเสธ scope `company`/`team` แบบที่ jobs/audit ทำ (sales ใช้วิธีแคบ filter แทน) — **ยังไม่ exploitable** เพราะ default matrix ไม่ให้ capability กลุ่มนี้กับ role ฝั่งบริษัท แต่จะกลายเป็นช่องทันทีถ้า Superadmin ผูก capability ให้ role กลุ่มนั้นผ่านหน้า Settings ⇒ ควรทำทีเดียวครบ 5 โมดูลพร้อมเทสต์ (แต่ละโมดูลต้องตัดสินก่อนว่า "แคบ filter" หรือ "403" ถูกกว่ากันตาม spec ของตัวเอง)
- 2026-08-13 — **PO ลบ `Project_info/` (archive ต้นฉบับ) ออกจาก repo ด้วยตนเอง** — `docs/` + `reference/` เป็นแหล่ง canonical แต่เพียงผู้เดียวนับจากนี้ (สำเนา byte-identical ตรวจ md5 แล้วตอนสร้าง) · ต้นฉบับกู้ได้จากประวัติ git · อัปเดต CLAUDE.md / README / rules/06 / hook / settings.json เอากฎ Project_info ออกแล้ว
