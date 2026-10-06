# 00_MAP.md — แผนที่ช่วงบรรทัดของไฟล์ใหญ่ (สำหรับ Read(offset, limit))

> **วิธีใช้**: ก่อนอ่านไฟล์ใหญ่ ให้เปิดไฟล์นี้หาบรรทัดเริ่มของ section ที่ต้องการ แล้ว `Read(file, offset=<บรรทัดเริ่ม>, limit=<ช่วงที่ต้องการ>)` — **ห้ามอ่านไฟล์ใหญ่ทั้งไฟล์**
> ช่วงจบของแต่ละ section = บรรทัดเริ่มของ section ถัดไป − 1
> ⚠️ **ถ้ามีการแก้ไฟล์ spec/mockup จนบรรทัดเลื่อน ต้อง regenerate MAP นี้ใหม่** (สคริปต์อยู่ท้ายไฟล์)
> ครอบคลุม: ไฟล์ `.md` ใน docs/ ที่ ≥ 15KB ทุกไฟล์ (ตาราง heading) + ไฟล์ < 15KB (ตารางสรุปท้ายส่วนที่ 1) + mockup `.html` ใน reference/ ทุกไฟล์ · เวอร์ชัน = เลขสูงสุดใน Changelog ของไฟล์

---

## ส่วนที่ 1 — Spec files (docs/)


### `docs/01-architecture.md` (14 KB, 238 บรรทัด — v2.2)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 01-architecture.md |
| 3 | # 01 — Architecture |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 27 | ## 1. Summary |
| 31 | ## 2. Purpose |
| 35 | ## 3. In Scope |
| 47 | ## 4. Out of Scope |
| 53 | ## 5. Actors & Responsibilities |
| 64 | ## 6. Core Concepts |
| 66 | ### 6.0 Tech Stack ที่ตัดสินใจแล้ว (Decision Date: 02/07/2569 — DEC-001) |
| 81 | ### 6.0.1 Component Diagram (High-level) |
| 116 | ### 6.1 Permission Architecture (ตัดสินใจแล้ว — DEC-002) |
| 130 | ### 6.2 Architecture Concepts |
| 140 | ## 7. Data Entities / Required Objects |
| 151 | ## 8. UI / UX Rules |
| 158 | ## 9. Workflow / Lifecycle |
| 163 | ## 10. Security / Control Rules |
| 170 | ## 11. Validation & Error Handling |
| 179 | ## 12. Permission Requirements |
| 187 | ## 13. Audit Log Requirements |
| 194 | ## 14. API / Integration Draft |
| 203 | ## 15. Acceptance Criteria |
| 210 | ## 16. Test Cases |
| 220 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 231 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/01_PLAN.md` (65 KB, 412 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 01_PLAN.md — แผนงานละเอียดทั้งโปรเจกต์ (ทุก Task + Reading List + งบ Context) |
| 6 | ## วิธีคิดงบ Context (Opus 5 — window 1M, เพดานใช้งาน 800k) |
| 15 | ## กติกาการแตก task เพิ่ม (ถ้าจำเป็น) |
| 21 | # Phase 0 — Infrastructure & Automation Setup |
| 26 | ### 0.1 — Bootstrap โปรเจกต์ Next.js + โครงสร้าง + CI |
| 32 | ### 0.2 — Deploy pipeline แยก Staging/Production |
| 40 | ### 0.3 — Adapt Orchestrator + Dev Panel เข้าโปรเจกต์นี้ |
| 48 | # Phase 1 — Foundation (Database → Auth → Master Data → Settings) |
| 52 | ### 1.1 — Prisma Schema ชุดที่ 1: Enums ทั้งหมด + Group A (Identity) + Group B (Master ... |
| 58 | ### 1.2 — Prisma Schema ชุดที่ 2: Group C–G (32 ตาราง) + Seed Data |
| 64 | ### 1.3 — Auth & Access Control + Permission Middleware |
| 70 | ### 1.4 — Audit Core Service (immutable) |
| 76 | ### 1.5 — UI Kit + App Shell + Navigation |
| 82 | ### 1.6 — Roles & Permissions Module (ไฟล์ 07) |
| 88 | ### 1.7 — Compensation Plans (11) + Service Fee Templates (12) |
| 94 | ### 1.8 — Teams (09) + Finance Companies (10) |
| 100 | ### 1.9 — Users Module (08) |
| 106 | ### 1.10 — Settings ไฟล์ 13: Backend ครบ 13 หมวด |
| 112 | ### 1.11 — Settings FE ชุดที่ 1 (แท็บ §6.1, §6.2+6.2.1, §6.3, §6.6, §6.8) |
| 118 | ### 1.12 — Settings FE ชุดที่ 2 (แท็บ §6.4, §6.5, §6.7, §6.9, §6.10, §6.11, §6.12, §6.13) |
| 128 | # Phase 2 — Case & Field Operations (ไฟล์ 38, 40, 41, 44, 45) |
| 132 | ### 2.1 — API Contract Infra (ไฟล์ 45) |
| 138 | ### 2.2 — Case Submission Backend ชุดที่ 1 (schema + CRUD + เอกสาร) |
| 144 | ### 2.3 — Case Submission Backend ชุดที่ 2 (state machine + routing + recycle + import) |
| 150 | ### 2.4 — Case Submission Frontend ชุดที่ 1 (list + form + address) |
| 156 | ### 2.5 — Case Submission Frontend ชุดที่ 2 (docs + suggestion + review modal + import) |
| 162 | ### 2.6 — Case Assignment Backend (ไฟล์ 40) |
| 168 | ### 2.7 — Case Assignment Frontend (ไฟล์ 40) |
| 174 | ### 2.8 — Field Tracker Backend ชุดที่ 1 (core flow) |
| 180 | ### 2.9 — Field Tracker Backend ชุดที่ 2 (เงิน + ตีกลับ + reassign + push) |
| 186 | ### 2.10 — Field Tracker Frontend ชุดที่ 1 (shell + detail + งานรายวัน) |
| 192 | ### 2.11 — Field Tracker Frontend ชุดที่ 2 (ฟอร์มปิดงาน + reassignment) |
| 198 | ### 2.12 — Field Tracker Frontend ชุดที่ 3 (เงิน + dashboard + PWA) |
| 204 | ### 2.13 — Warehouse Backend (ไฟล์ 44) |
| 210 | ### 2.14 — Warehouse Frontend ชุดที่ 1 (รับเข้าคลัง + ในคลัง) |
| 215 | ### 2.15 — Warehouse Frontend ชุดที่ 2 (ส่งมอบ) |
| 223 | # Phase 3 — Finance Module (ไฟล์ 14–21 + สูตรจาก 22) |
| 227 | ### 3.1 — Pure Finance Calculation Modules + Unit Tests (ไฟล์ 22 ทั้งหมด) |
| 233 | ### 3.2 — Payee & Tax Profile (18) + Compensation Approval Backend (16) |
| 238 | ### 3.3 — Compensation Approval FE (16) + Claims & Advances (15) |
| 243 | ### 3.4 — Payout Batch Backend (17) + Claims FE ส่วนที่เหลือ |
| 248 | ### 3.5 — Payout FE + Internal PDFs |
| 253 | ### 3.6 — Revenue / Billing / AR Backend (19) |
| 259 | ### 3.7 — Billing FE + Adjustment (20) |
| 264 | ### 3.8 — Profitability Report (21) + Finance Dashboard (14) |
| 271 | # Phase 4 — Accounting Module (ไฟล์ 30–37) |
| 275 | ### 4.1 — Exceptions (34) + Accounting Period / Readiness / Lock Guard (30) |
| 280 | ### 4.2 — Bank Reconciliation (35) |
| 285 | ### 4.3 — Sales & Receipts + Tax Invoice (31) |
| 291 | ### 4.4 — Accounting Expenses (32) + Accountant Questions (36) |
| 296 | ### 4.5 — WHT Data (33) |
| 301 | ### 4.6 — Accounting Pack Export (37) |
| 306 | ### 4.7 — Accounting Frontend ที่เหลือ (shell + periods + exceptions + sales/receipts) |
| 314 | # Phase 5 — Platform Services (ไฟล์ 90, 91) |
| 316 | ### 5.1 — Notification Service + Notification Center |
| 321 | ### 5.2 — Event Wiring ทุกโมดูล + Audit Log UI |
| 326 | ### 5.3 — Background Job Engine + Handlers + Job Log |
| 333 | # Phase 6 — Reports (ไฟล์ 96) + แดชบอร์ดหลัก |
| 335 | ### 6.1 — Report Framework + Export Engine |
| 340 | ### 6.2 — รายงานหมวด F (F1–F5) |
| 344 | ### 6.3 — รายงานหมวด O (O1–O5) |
| 348 | ### 6.4 — รายงานหมวด A (A1–A4) |
| 352 | ### 6.5 — Executive Dashboard (E1–E3) |
| 356 | ### 6.6 — แดชบอร์ดหลัก (Top Nav เมนูแรก) — ✅ อนุมัติ spec แล้ว (มติ PO 2026-08-16) |
| 364 | # Phase 7 — Client Portal (ไฟล์ 97) |
| 368 | ### 7.1 — Portal Auth + Scope Middleware |
| 372 | ### 7.2 — Portal API + Status Mapping Layer |
| 376 | ### 7.3 — Portal Frontend (6 เมนู Desktop + Mobile) |
| 382 | # Phase 8 — Integration, Acceptance & Final |
| 384 | ### 8.1 — E2E Acceptance Tests (ไฟล์ 29) |
| 388 | ### 8.2 — Consistency Sweep + Hardening |
| 392 | ### 8.3 — Final Test ทั้งระบบ (ด่านของ orchestrator) |
| 398 | ## สรุปยอดรวม (ประมาณการ) |

### `docs/02-database-schema-design.md` (263 KB, 2697 บรรทัด — v4.51)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 02-database-schema-design.md |
| 3 | # 02 — Database Schema Design (Full Production Schema) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 89 | ## 1. Summary |
| 92 | ## 2. Conventions (กฎที่ใช้ทั้งไฟล์) |
| 94 | ### 2.1 Naming |
| 104 | ### 2.2 Money |
| 111 | ### 2.3 Timestamps |
| 116 | ### 2.4 Common Columns (ทุก table มีครบ) |
| 127 | ### 2.5 Permission Architecture |
| 134 | ## 3. Enum Types (ทั้งหมด) |
| 491 | ## 4. Schema Group A — Identity & Access |
| 594 | ## 5. Schema Group B — Master Data |
| 980 | ## 6. Schema Group C — Case Workflow |
| 1366 | ## 7. Schema Group D — Warehouse (ไฟล์ 44) |
| 1456 | ## 8. Schema Group E — Finance Operation |
| 1918 | ## 9. Schema Group F — Accounting Handover |
| 2342 | ## 10. Schema Group G — Platform |
| 2504 | ## 11. Migration Order (ลำดับที่ต้อง run) |
| 2580 | ## 12. Seed Data |
| 2654 | ## 13. Immutable Rules (ห้ามแก้ไขย้อนหลัง) |
| 2676 | ## 14. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 2686 | ## 15. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/02_OPEN_DECISIONS.md` (71 KB, 300 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 02_OPEN_DECISIONS.md — ผลรีวิวรอบ Developer (จุดที่ spec ยังไม่เคลียร์) |
| 5 | ## ✅ มติ Product Owner — 2026-08-12 (มีผลเหนือสถานะ ⬜ รายข้อด้านล่างทั้งหมด) |
| 12 | ### รายการที่แปลงเป็น Setting ตามมติข้อ 2 (เพิ่มจากที่ spec มีอยู่แล้ว) |
| 25 | ### ⚠️ ข้อยกเว้น 3 เรื่องที่ **ห้ามทำเป็น setting** (fix ในโค้ดเท่านั้น — เปลี่ยนภายหลั... |
| 31 | ### สิ่งที่มตินี้ยังไม่ครอบ (blocker ภายนอก — ติดตามใน `93` §7.1 + PROGRESS.md) |
| 43 | ## หมวด A — กระทบ Schema ต้องตอบก่อน Phase 1.1–1.2 (Prisma migration) |
| 47 | ### ✅ A1 — WHT ที่ "ลูกค้าหักจากเรา" ไม่มีที่เก็บในระบบ (ร้ายแรงสุดของรอบรีวิว) |
| 54 | ### ✅ A2 — เงินเข้า 1 ก้อน จ่ายหลาย billing batch / จ่ายบางส่วน — schema รองรับไม่ได้ |
| 60 | ### ✅ B3 — Recycle รอบ 2 สำเร็จ → เก็บเงินไฟแนนซ์ซ้ำไหม / commission ทับ no_success_fee... |
| 66 | ### ✅ A4 — Advance ไม่มีเส้นทางจ่ายเงินออก/รับเงินคืน |
| 72 | ### ✅ A5 — `due_rule` เป็น free text คำนวณไม่ได้ |
| 78 | ### ✅ A6 — IMEI: `38` เก็บ free text "IMEI หรือ Serial" แต่ `44` บังคับ 15 หลัก + UNIQUE |
| 84 | ### ✅ A7 — `finance_companies` ขาดฟิลด์ที่ไฟล์ `10` §7.1 + mockup ใช้จริง (พบตอนเริ่ม P... |
| 89 | ### ⬜ A8 — `finance_companies.signer_phone` ยังไม่มีที่เก็บ (ต่อเนื่องจาก A7) |
| 95 | ## หมวด B — กติกาเงินที่ต้องให้นักบัญชีเคาะ (รวมถามพร้อม A2/C3/C4/D2 ของ `QUESTIONS-FOR... |
| 97 | ### ⬜ B1 — กฎปัดเศษ (ไม่มีในสเปคเลยทั้งชุด) |
| 102 | ### ⬜ B2 — ปัดเศษที่ระดับ item เท่านั้น (สูตร batch ใน `22` §6.10 ขัดกันเอง) |
| 107 | ### ⬜ B3 — WHT threshold 1,000 บาท เช็คต่ออะไร + ไฟล์โอน 1 บรรทัดต่อ payee? |
| 112 | ### ⬜ B4 — ยอดโอนคลาดจากค่าธรรมเนียมธนาคาร (10–25 บาท) ทำยังไง |
| 117 | ### ⬜ B5 — Adjustment กระทบ VAT/ใบกำกับที่ออกแล้วไหม + adjust batch ที่ `paid` ได้ไหม |
| 124 | ## หมวด C — Spec ขัดกันเอง (ต้องแก้ไฟล์ — ผมเสนอ default ไว้ ถ้าไม่ค้านจะแก้ตามนี้ตอนถึ... |
| 126 | ### ⬜ C1 — `revenue_date` นิยามขัดกันในไฟล์เดียว (`19` §7.1 = วันปิดเคส vs §6.1 = เกิดต... |
| 130 | ### ⬜ C2 — Revenue trigger เมื่อเคสมีหลาย expense — "approved" หมายถึงใบไหน |
| 134 | ### ⬜ C3 — `success_rate` สูตรขัดกัน (`40` §6.2 หารด้วยเคสที่ได้รับมอบหมาย vs `41` §6.8... |
| 137 | ### ⬜ C4 — Audit log: `90` §12 ให้การเงิน/บัญชีดูได้ แต่เมนูอยู่ใต้ Settings ที่ `06` §... |
| 140 | ### ⬜ C5 — Role "ธุรการ (Admin)" หายจาก Top Nav matrix ทั้งคอลัมน์ (`06` §7.2 มี 8 คอลั... |
| 143 | ### ⬜ C6 — Supervisor กับรายงาน: `06` §7.2 ให้ดู O1–O5 แต่ `96` §5/§10 ไม่มี Supervisor... |
| 146 | ### ⬜ C7 — `97` เมนู "รายงานสรุป" ถูกยุบเข้า Dashboard แล้ว (v3) แต่ §8/§13 ยังอ้างเมนู... |
| 149 | ### ✅ C8 — `job_type` 5 ตัว (`91` §6.1) แต่ §14.1/§17 ยังเขียน 4 ตัว (ตกหล่น `advance_o... |
| 154 | ## หมวด D — Flow ที่ไม่มีทางเดิน (จะจอดตอน implement — ต้องเคาะก่อนถึง task ที่ระบุ) |
| 156 | ### ✅ D1 — First-login / invite flow ไม่มีเลย (สร้าง user แล้วตั้งรหัสผ่านครั้งแรกยังไง?) |
| 164 | ### ⬜ D2 — ลืมรหัสผ่านไม่มีในสเปค (0 hit ทั้งโปรเจกต์) |
| 167 | ### ⬜ D3 — สถาปัตยกรรม upload: Vercel API route จำกัด body ~4.5MB แต่วิดีโอบังคับทุกเคส |
| 170 | ### ⬜ D4 — GPS ไม่มี guard (accuracy / mock / ระยะห่างจากที่อยู่ลูกหนี้) ทั้งที่เป็นฐาน... |
| 173 | ### ⬜ D5 — `reject_evidence` หลังของเดินไปแล้ว (asset in_custody / lot confirmed / expe... |
| 176 | ### ⬜ D6 — Warehouse ขาด 2 state: "ยกเลิก Lot ก่อน confirm" และ "เครื่องหาย/พังในคลัง" |
| 179 | ### ⬜ D7 — Agent ถูก suspend ระหว่างถือเคส / ทีม deactivate ที่มีเคส active — ไม่มี flow |
| 182 | ### ⬜ D8 — Import เคส: spec บางเกิน (ไม่มี template/เพดานแถว/พฤติกรรม error) + เคส impo... |
| 185 | ### ⬜ D9 — Recycle รอบใหม่: ทีมเดิมหรือ route ใหม่ + ประวัติรอบเก่าแสดงที่ไหน |
| 188 | ### ✅ D10 — Google Maps ล่ม/quota หมดตอนปิดงาน + expense ยอด 0 + payout batch ว่าง |
| 192 | ### ⬜ D11 — เลขรันนิ่งเอกสาร: กัน race + ขอบปี + receipt/50ทวิ ไม่มี format config |
| 197 | ### ⬜ D12 — Advance เคลียร์บางส่วน / overdue ค้างข้ามงวด |
| 200 | ### ✅ D13 — ไฟล์ 31 §7 มีฟิลด์ที่ `02` ไม่มีคอลัมน์รองรับ (พบตอน implement 4.3) — **ปิด... |
| 208 | ### ⬜ D14 — ไฟล์ 32/36 มีฟิลด์ที่ `02` ไม่มีคอลัมน์รองรับ (พบตอน implement 4.4 — ตระกูล... |
| 219 | ### ✅ D15 — ไฟล์ 33/28 มีฟิลด์ที่ `02` ไม่มีคอลัมน์รองรับ (พบตอน implement 4.5 — ตระกูล... |
| 231 | ### ✅ D16 — `90` §6.3 มี 2 event ที่สคีมาปัจจุบันไม่มีที่ให้ emit (พบตอนรีวิว Phase 5) |
| 238 | ### ✅ D17 — `90` §12 / `91` §12 ให้บัญชี+การเงินดู Audit Log / Job Log ได้ แต่ `06` §7.... |
| 242 | ### ✅ D18 — `96` §6-O2/O4 อ้าง `slaAlertHours` ที่ไม่มีอยู่จริงทั้งใน `03` และ `02` (พบ... |
| 248 | ## หมวด E — มาตรฐานกลาง UI/Platform ที่หายไป (ผมตั้ง default ให้แล้ว — รับทราบ/ค้านพอ จ... |
| 275 | ## สรุปสำหรับ Product Owner — ตอบชุดแรกแค่ 8 ข้อก็เริ่มยาว ๆ ได้ |
| 293 | ## มติ PO เพิ่มเติม 2026-08-16 (ปลดล็อกงานท้ายโปรเจกต์) |

### `docs/03-non-functional-requirements.md` (14 KB, 213 บรรทัด — v3)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 03-non-functional-requirements.md |
| 3 | # 03 — Non-Functional Requirements |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 25 | ## 1. Summary |
| 29 | ## 2. Purpose |
| 33 | ## 3. In Scope |
| 39 | ## 4. Out of Scope |
| 44 | ## 5. Actors & Responsibilities |
| 59 | ## 6. Core Concepts |
| 67 | ### 6.5 Datetime Standard (ใช้ทั้งระบบ — บังคับทุก module) |
| 118 | ## 7. Data Entities / Required Objects |
| 128 | ## 8. UI / UX Rules |
| 135 | ## 9. Workflow / Lifecycle |
| 141 | ## 10. Security / Control Rules |
| 148 | ## 11. Validation & Error Handling |
| 157 | ## 12. Permission Requirements |
| 164 | ## 13. Audit Log Requirements |
| 171 | ## 14. API / Integration Draft |
| 179 | ## 15. Acceptance Criteria |
| 186 | ## 16. Test Cases |
| 196 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 204 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/04-ui-ux-design-system.md` (19 KB, 214 บรรทัด — v3)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 04-ui-ux-design-system.md |
| 3 | # 04 — UI/UX Design System |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 25 | ## 1. Summary |
| 29 | ## 2. Purpose |
| 33 | ## 3. In Scope |
| 39 | ## 4. Out of Scope |
| 44 | ## 5. Actors & Responsibilities |
| 59 | ## 6. Core Concepts |
| 67 | ## 7. Data Entities / Required Objects |
| 75 | ## 8. UI / UX Rules |
| 86 | ### 8.1 Design Token Reference (สกัดจริงจาก Mockup HTML — ไม่ใช่ค่าที่กำหนดขึ้นใหม่) |
| 141 | ## 10. Security / Control Rules |
| 147 | ## 11. Validation & Error Handling |
| 156 | ## 12. Permission Requirements |
| 163 | ## 13. Audit Log Requirements |
| 170 | ## 14. API / Integration Draft |
| 178 | ## 15. Acceptance Criteria |
| 185 | ## 16. Test Cases |
| 196 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 205 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/05-auth-and-access-control.md` (18 KB, 212 บรรทัด — v3.5)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 05-auth-and-access-control.md |
| 3 | # 05 — Authentication & Access Control |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 30 | ## 1. Summary |
| 34 | ## 2. Purpose |
| 38 | ## 3. In Scope |
| 44 | ## 4. Out of Scope |
| 49 | ## 5. Actors & Responsibilities |
| 64 | ## 6. Core Concepts |
| 72 | ### 6.1 Login Flow (Sequence Diagram) |
| 109 | ## 7. Data Entities / Required Objects |
| 118 | ## 8. UI / UX Rules |
| 124 | ## 9. Workflow / Lifecycle |
| 128 | ## 10. Security / Control Rules |
| 136 | ## 11. Validation & Error Handling |
| 145 | ## 12. Permission Requirements |
| 155 | ## 13. Audit Log Requirements |
| 163 | ## 14. API / Integration Draft |
| 173 | ## 15. Acceptance Criteria |
| 180 | ## 16. Test Cases |
| 192 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 205 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/06-menu-and-navigation-map.md` (36 KB, 233 บรรทัด — v2.12)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 06-menu-and-navigation-map.md |
| 3 | # 06 — Menu and Navigation Map |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 37 | ## 1. Summary |
| 41 | ## 2. Purpose |
| 45 | ## 3. In Scope |
| 51 | ## 4. Out of Scope |
| 56 | ## 5. Actors & Responsibilities |
| 71 | ## 6. Core Concepts |
| 79 | ## 7. Data Entities / Required Objects |
| 87 | ### 7.1 เมนู "งานติดตามทรัพย์" (Asset Recovery Workflow) — Concrete Menu Map |
| 118 | ## 8. UI / UX Rules |
| 130 | ### 7.2 สิทธิ์เข้าถึงเมนูหลัก (Top Nav Visibility Matrix) |
| 155 | ## 9. Workflow / Lifecycle |
| 160 | ## 10. Security / Control Rules |
| 165 | ## 11. Validation & Error Handling |
| 174 | ## 12. Permission Requirements |
| 181 | ## 13. Audit Log Requirements |
| 188 | ## 14. API / Integration Draft |
| 196 | ## 15. Acceptance Criteria |
| 203 | ## 16. Test Cases |
| 215 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 225 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/07-roles-permissions.md` (27 KB, 211 บรรทัด — v2.7)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 07-roles-permissions.md |
| 3 | # 07 — Roles and Permissions (Master Role List) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 30 | ## 1. Summary |
| 34 | ## 2. Purpose |
| 38 | ## 3. In Scope |
| 44 | ## 4. Out of Scope |
| 49 | ## 5. Actors & Responsibilities — Role ทั้งหมด 15 ตัว แบ่งตาม Role Group (system 6 + in... |
| 51 | ### 5.1 กลุ่ม System (ดูแลภาพรวมทั้งระบบ — ไม่ผูกทีม) |
| 62 | ### 5.2 กลุ่ม Inhouse / Outsource (ทีมติดตามทรัพย์ — แยก role ต่อ Role Group) |
| 72 | ### 5.3 กลุ่ม Finance Company (ภายนอก — ผูกกับบริษัทไฟแนนซ์โดยตรง ไม่มี sub-team) |
| 84 | ## 6. Core Concepts |
| 92 | ## 7. Data Entities / Required Objects |
| 94 | ### 7.1 Role |
| 104 | ### 7.2 Permission |
| 112 | ### 7.3 Role Group |
| 121 | ## 8. UI / UX Rules |
| 127 | ## 9. Workflow / Lifecycle |
| 133 | ## 10. Security / Control Rules |
| 140 | ## 11. Validation & Error Handling |
| 150 | ## 12. Permission Requirements (สรุปภาพรวม — รายละเอียดเชิงลึกดูไฟล์ต้นทาง) |
| 162 | ## 13. Audit Log Requirements |
| 168 | ## 14. API / Integration Draft |
| 177 | ## 15. Acceptance Criteria |
| 184 | ## 16. Test Cases |
| 195 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 204 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/08-users.md` (20 KB, 197 บรรทัด — v2.2)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 08-users.md |
| 3 | # 08 — Users |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 25 | ## 1. Summary |
| 29 | ## 2. Purpose |
| 33 | ## 3. In Scope |
| 40 | ## 4. Out of Scope |
| 46 | ## 5. Actors & Responsibilities |
| 59 | ## 6. Core Concepts |
| 68 | ## 7. Data Entities / Required Objects |
| 70 | ### 7.1 User (ตรงกับ table `users` ใน `02-database-schema-design.md` §4) |
| 88 | ### 7.2 User Status Lifecycle |
| 96 | ## 8. UI / UX Rules |
| 105 | ## 9. Workflow / Lifecycle |
| 111 | ## 10. Security / Control Rules |
| 120 | ## 11. Validation & Error Handling |
| 133 | ## 12. Permission Requirements |
| 141 | ## 13. Audit Log Requirements |
| 148 | ## 14. API / Integration Draft |
| 160 | ## 15. Acceptance Criteria |
| 166 | ## 16. Test Cases |
| 182 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 190 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/09-teams.md` (15 KB, 169 บรรทัด — v2.2)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 09-teams.md |
| 3 | # 09 — Teams |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 25 | ## 1. Summary |
| 29 | ## 2. Purpose |
| 33 | ## 3. In Scope |
| 39 | ## 4. Out of Scope |
| 44 | ## 5. Actors & Responsibilities |
| 57 | ## 6. Core Concepts |
| 65 | ## 7. Data Entities / Required Objects |
| 77 | ### 7.1 Manager vs Supervisor Scope |
| 85 | ## 8. UI / UX Rules |
| 91 | ## 9. Workflow / Lifecycle |
| 95 | ## 10. Security / Control Rules |
| 100 | ## 11. Validation & Error Handling |
| 110 | ## 12. Permission Requirements |
| 117 | ## 13. Audit Log Requirements |
| 124 | ## 14. API / Integration Draft |
| 134 | ## 15. Acceptance Criteria |
| 141 | ## 16. Test Cases |
| 153 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 161 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/10-finance-companies.md` (29 KB, 220 บรรทัด — v3.2)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 10-finance-companies.md |
| 3 | # 10 — Finance Companies (บริษัทไฟแนนซ์คู่ค้า) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 27 | ## 1. Summary |
| 31 | ## 2. Purpose |
| 35 | ## 3. In Scope |
| 42 | ## 4. Out of Scope |
| 48 | ## 5. Actors & Responsibilities |
| 57 | ## 6. Core Concepts |
| 65 | ## 7. Data Entities / Required Objects |
| 67 | ### 7.1 Finance Company |
| 90 | ### 7.2 Company User (บัญชีผู้ใช้ฝั่งบริษัทไฟแนนซ์) |
| 101 | ## 8. UI / UX Rules |
| 113 | ## 9. Workflow / Lifecycle |
| 115 | ### 9.1 สร้างบริษัทใหม่ |
| 119 | ### 9.2 Service Fee Template Snapshot (แก้ไขแล้ว — ดู Changelog v2) |
| 130 | ### 9.3 ระงับ/เปิดใช้งานบริษัท |
| 136 | ## 10. Security / Control Rules |
| 142 | ## 11. Validation & Error Handling |
| 153 | ## 12. Permission Requirements |
| 163 | ## 13. Audit Log Requirements |
| 169 | ## 14. API / Integration Draft |
| 181 | ## 15. Acceptance Criteria |
| 188 | ## 16. Test Cases |
| 204 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 212 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/11-compensation.md` (18 KB, 184 บรรทัด — v2.2)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 11-compensation.md |
| 3 | # 11 — Compensation (แผนค่าตอบแทน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 25 | ## 1. Summary |
| 29 | ## 2. Purpose |
| 33 | ## 3. In Scope |
| 39 | ## 4. Out of Scope |
| 44 | ## 5. Actors & Responsibilities |
| 59 | ## 6. Core Concepts |
| 67 | ## 7. Data Entities / Required Objects |
| 76 | ### 7.1 Fuel Rule — 2 โหมด (ไม่ใช่สูตรเดียวแบบ Rule อื่น) |
| 87 | ### 7.2 No-Success Compensation (เบี้ยเสี่ยง/ค่าออกพื้นที่) |
| 96 | ## 8. UI / UX Rules |
| 105 | ## 9. Workflow / Lifecycle |
| 110 | ## 10. Security / Control Rules |
| 118 | ## 11. Validation & Error Handling |
| 127 | ## 12. Permission Requirements |
| 134 | ## 13. Audit Log Requirements |
| 141 | ## 14. API / Integration Draft |
| 150 | ## 15. Acceptance Criteria |
| 157 | ## 16. Test Cases |
| 169 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 177 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/12-service-fee.md` (20 KB, 181 บรรทัด — v2.2)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 12-service-fee.md |
| 3 | # 12 — Service Fee (กติกาค่าบริการที่เรียกเก็บบริษัทไฟแนนซ์) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 26 | ## 1. Summary |
| 30 | ## 2. Purpose |
| 34 | ## 3. In Scope |
| 40 | ## 4. Out of Scope |
| 46 | ## 5. Actors & Responsibilities |
| 53 | ## 6. Core Concepts |
| 55 | ### 6.1 Model: `SUCCESS_FEE` |
| 62 | ### 6.2 Model: `FLAT` |
| 69 | ### 6.3 Model: `HYBRID` |
| 77 | ### 6.4 รอบการติดตาม (tracking round) — คิดทุกรอบอิสระเสมอ (มติ PO U125) |
| 83 | ## 7. Data Entities / Required Objects |
| 85 | ### 7.1 Service Fee Template |
| 99 | ## 8. UI / UX Rules |
| 107 | ## 9. Workflow / Lifecycle |
| 113 | ## 10. Security / Control Rules |
| 118 | ## 11. Validation & Error Handling |
| 126 | ## 12. Permission Requirements |
| 133 | ## 13. Audit Log Requirements |
| 137 | ## 14. API / Integration Draft |
| 145 | ## 15. Acceptance Criteria |
| 151 | ## 16. Test Cases |
| 165 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 174 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/13-accounting-finance-settings.md` (109 KB, 561 บรรทัด — v3.23)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 13-accounting-finance-settings.md |
| 3 | # 13 — Accounting & Finance Settings (ตั้งค่าระบบบัญชี/การเงิน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 51 | ## 1. Summary |
| 55 | ## 2. Purpose |
| 59 | ## 3. In Scope |
| 63 | ## 4. Out of Scope |
| 68 | ## 5. Actors & Responsibilities |
| 76 | ## 6. Core Concepts & Data Entities |
| 78 | ### 6.1 Billing/Payout Cycles (รอบบิลและรอบจ่าย) |
| 93 | ### 6.2 Approval Matrix (สายการอนุมัติ) |
| 120 | ### 6.3 Corporate Bank Accounts (บัญชีธนาคารบริษัท) |
| 135 | ### 6.4 Tax Profile (กติกาภาษี) 🔶 สำคัญมาก — ต้องนักบัญชียืนยันก่อนใช้จริง |
| 189 | ### 6.5 VAT Rate Setting (อัตราภาษีมูลค่าเพิ่ม) 🔶 สำคัญมาก — ติดตามใกล้ชิด |
| 206 | ### 6.6 Cost Center |
| 215 | ### 6.7 Internal Document Templates (รูปแบบเอกสารภายใน) |
| 229 | ### 6.8 Bank File Format (รูปแบบไฟล์ธนาคาร) |
| 239 | ### 6.9 Export Format (รูปแบบไฟล์ Export ส่งสำนักงานบัญชี) |
| 263 | ### 6.10 Functional Permission Matrix (สิทธิ์เฉพาะโมดูลการเงิน/บัญชี) |
| 282 | ### 6.11 Period Lock Policy (นโยบายล็อกรอบบัญชี) |
| 292 | ### 6.12 Document Numbering (เลขที่เอกสาร) — มติ PO 06/10/2569 (UAT U102) |
| 334 | ### 6.13 เทมเพลตเอกสาร (Document Template Settings) — v3.21 มติ PO 06/10/2569 (U122) |
| 353 | ### 6.14 SLA Alert Threshold (เกณฑ์ SLA งานติดตาม) — มติ PO 15/08/2569 (D18) |
| 365 | ### 6.15 ปฏิทินวันหยุด (Public Holidays) — มติ PO 06/10/2569 (UAT U93) |
| 382 | ### 6.16 ระยะเก็บเอกสารลูกหนี้ (Debtor Document Retention — PDPA) — มติ PO 06/10/2569 (... |
| 397 | ### 6.17 ข้อมูลองค์กร (Organization Profile) — มติ PO 06/10/2569 (U99) |
| 419 | ## 7. UI / UX Rules |
| 425 | ### 7.1 คำอธิบายในหน้าจอ (มติ PO 06/10/2569 U108) |
| 451 | ## 8. Workflow / Lifecycle |
| 457 | ## 9. Security / Control Rules |
| 464 | ## 10. Validation & Error Handling |
| 474 | ## 11. Permission Requirements |
| 491 | ## 12. Audit Log Requirements |
| 496 | ## 13. API / Integration Draft |
| 522 | ## 14. Acceptance Criteria |
| 529 | ## 15. Test Cases |
| 541 | ## 16. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 552 | ## 17. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/15-claims-and-advances.md` (54 KB, 286 บรรทัด — v2.10)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 15-claims-and-advances.md |
| 3 | # 15 — Claims and Advances (รายการเบิกและเงินทดรองจ่าย) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 34 | ## 1. Summary |
| 38 | ## 2. Purpose |
| 42 | ## 3. In Scope |
| 47 | ## 4. Out of Scope |
| 53 | ## 5. Actors & Responsibilities |
| 61 | ## 6. Core Concepts |
| 63 | ### 6.1 Claim (รายการเบิก) — มาจาก 2 แหล่ง |
| 68 | ### 6.2 Advance (เงินทดรองจ่าย) |
| 74 | ## 7. Data Entities / Required Objects |
| 76 | ### 7.1 Manual Claim |
| 89 | ### 7.2 Advance (แก้ไขแล้ว — ดู Changelog v2) |
| 105 | ## 8. UI / UX Rules |
| 113 | ## 9. Workflow / Lifecycle |
| 115 | ### 9.1 Advance (แก้ไขแล้ว) |
| 125 | ### 9.3 ปิดยอดคืน (มติ PO 05/10/2569 — UAT U30 · BUG-109) |
| 137 | ### 9.4 ใบรับรองแทนใบเสร็จรับเงิน + เอกสารเงินทดรอง (มติ PO 06/10/2569 U100/U101/U103) |
| 157 | ### 9.2 ห้ามเบิกซ้อน |
| 161 | ## 10. Security / Control Rules |
| 167 | ## 11. Validation & Error Handling |
| 190 | ## 12. Permission Requirements |
| 201 | ## 13. Audit Log Requirements |
| 209 | ## 14. API / Integration Draft |
| 231 | ## 15. Acceptance Criteria |
| 238 | ## 16. Test Cases |
| 270 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 279 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/16-compensation-approval.md` (20 KB, 167 บรรทัด — v2.3)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 16-compensation-approval.md |
| 3 | # 16 — Compensation Approval (สายการอนุมัติค่าตอบแทน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 27 | ## 1. Summary |
| 31 | ## 2. Purpose |
| 35 | ## 3. In Scope |
| 41 | ## 4. Out of Scope |
| 47 | ## 5. Actors & Responsibilities |
| 55 | ## 6. Core Concepts |
| 57 | ### 6.1 Multi-step Approval ตาม Approval Matrix |
| 66 | ### 6.2 ความสัมพันธ์กับ QC Outcome (ไฟล์ 41 §10.1) |
| 73 | ## 7. Data Entities / Required Objects |
| 83 | ## 8. UI / UX Rules |
| 91 | ## 9. Workflow / Lifecycle |
| 97 | ### 9.1 แจ้งเตือนผู้อนุมัติ (มติ PO 05/10/2569 U29 · BUG-106) |
| 104 | ## 10. Security / Control Rules |
| 110 | ## 11. Validation & Error Handling |
| 118 | ## 12. Permission Requirements |
| 126 | ## 13. Audit Log Requirements |
| 130 | ## 14. API / Integration Draft |
| 138 | ## 15. Acceptance Criteria |
| 144 | ## 16. Test Cases |
| 153 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 160 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/17-payroll-and-payout.md` (36 KB, 228 บรรทัด — v2.7)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 17-payroll-and-payout.md |
| 3 | # 17 — Payroll and Payout (รอบจ่ายเงินและไฟล์โอนธนาคาร) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 32 | ## 1. Summary |
| 36 | ## 2. Purpose |
| 40 | ## 3. In Scope |
| 47 | ## 4. Out of Scope |
| 52 | ## 5. Actors & Responsibilities |
| 59 | ## 6. Core Concepts |
| 61 | ### 6.1 Payout Batch แยกฝั่ง inhouse / outsource |
| 65 | ### 6.2 WHT Calculation ต่อ Payout Batch |
| 71 | ### 6.3 Idempotency Key (กันโอนซ้ำ) 🔶 สำคัญมากด้านความปลอดภัยทางการเงิน |
| 75 | ### 6.4 หักคืนเงินทดรองในรอบจ่าย (มติ PO 05/10/2569 — UAT U30 · BUG-109) |
| 85 | ## 7. Data Entities / Required Objects |
| 87 | ### 7.1 Payout Batch (เติมสถานะ `draft` — ดู Changelog v2) |
| 104 | ### 7.2 Payout Batch Item |
| 115 | ## 8. UI / UX Rules |
| 124 | ## 9. Workflow / Lifecycle |
| 128 | ### 9.0 ขั้นหลังรอบจ่ายสำเร็จ (มติ PO 07/10/2569 — U134) |
| 134 | ### 9.1 ยกเลิกรอบจ่าย (มติ PO 05/10/2569 — UAT U67) |
| 149 | ## 10. Security / Control Rules |
| 155 | ## 11. Validation & Error Handling |
| 166 | ## 12. Permission Requirements |
| 174 | ## 13. Audit Log Requirements |
| 180 | ## 14. API / Integration Draft |
| 190 | ## 15. Acceptance Criteria |
| 197 | ## 16. Test Cases |
| 212 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 220 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/18-payee-and-tax-profile.md` (35 KB, 226 บรรทัด — v2.6)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 18-payee-and-tax-profile.md |
| 3 | # 18 — Payee and Tax Profile (ผู้รับเงินและกติกาภาษีรายบุคคล) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 30 | ## 1. Summary |
| 34 | ## 2. Purpose |
| 38 | ## 3. In Scope |
| 44 | ## 4. Out of Scope |
| 49 | ## 5. Actors & Responsibilities |
| 57 | ## 6. Core Concepts |
| 59 | ### 6.1 Payee = บุคคล/นิติบุคคลที่รับเงินจาก AssetRecovery |
| 63 | ### 6.2 Verification ก่อนจ่ายเงิน |
| 67 | ### 6.3 WHT Rate Priority — Payee Level vs Plan Level 🔑 Key Business Rule |
| 105 | ## 7. Data Entities / Required Objects |
| 107 | ### 7.1 Payee Profile (field name ตรงกับ `02-database-schema-design.md` §8 หลังเติม col... |
| 129 | ## 8. UI / UX Rules |
| 140 | ## 9. Workflow / Lifecycle |
| 148 | ## 10. Security / Control Rules |
| 154 | ## 11. Validation & Error Handling |
| 162 | ## 12. Permission Requirements |
| 170 | ## 13. Audit Log Requirements |
| 175 | ## 14. API / Integration Draft |
| 184 | ## 15. Acceptance Criteria |
| 191 | ## 16. Test Cases |
| 211 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 219 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/19-revenue-billing-receivable.md` (43 KB, 253 บรรทัด — v2.10)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 19-revenue-billing-receivable.md |
| 3 | # 19 — Revenue, Billing & Receivable (รายได้ วางบิล และลูกหนี้การค้า) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 34 | ## 1. Summary |
| 38 | ## 2. Purpose |
| 42 | ## 3. In Scope |
| 49 | ## 4. Out of Scope |
| 55 | ## 5. Actors & Responsibilities |
| 63 | ## 6. Core Concepts |
| 65 | ### 6.1 Revenue Record (รายการรายได้) 🔑 Complex Trigger Logic |
| 87 | ### 6.2 Billing Batch (รอบวางบิล) |
| 97 | ### 6.3 VAT Handling 🔶 สำคัญมาก — อัตราอาจเปลี่ยนใน 3 เดือนข้างหน้า |
| 113 | ### 6.4 AR Aging |
| 119 | ## 7. Data Entities / Required Objects |
| 121 | ### 7.1 Revenue |
| 137 | ### 7.2 Billing Batch |
| 150 | ## 8. UI / UX Rules |
| 160 | ## 9. Workflow / Lifecycle |
| 162 | ### 9.1 Revenue → Billing Batch |
| 166 | ### 9.2 Billing Batch Payment Tracking |
| 172 | ## 10. Security / Control Rules |
| 177 | ## 11. Validation & Error Handling |
| 186 | ## 12. Permission Requirements |
| 194 | ## 13. Audit Log Requirements |
| 199 | ## 14. API / Integration Draft |
| 210 | ## 15. Acceptance Criteria |
| 216 | ## 16. Test Cases |
| 234 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 244 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/20-adjustment.md` (17 KB, 162 บรรทัด — v2.5)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 20-adjustment.md |
| 3 | # 20 — Adjustment (รายการปรับปรุง) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 28 | ## 1. Summary |
| 32 | ## 2. Purpose |
| 36 | ## 3. In Scope |
| 41 | ## 4. Out of Scope |
| 46 | ## 5. Actors & Responsibilities |
| 53 | ## 6. Core Concepts |
| 55 | ### 6.1 Adjustment ไม่แก้ของเดิม แต่สร้างรายการใหม่ชดเชย |
| 59 | ### 6.2 ระดับการอนุมัติตาม Period Lock Policy (ไฟล์ 13 §6.11) |
| 67 | ## 7. Data Entities / Required Objects |
| 69 | ### 7.1 Adjustment (target ใช้ Separate FK columns ตาม DEC-004) |
| 83 | ## 8. UI / UX Rules |
| 92 | ## 9. Workflow / Lifecycle |
| 96 | ## 10. Security / Control Rules |
| 101 | ## 11. Validation & Error Handling |
| 109 | ## 12. Permission Requirements |
| 117 | ## 13. Audit Log Requirements |
| 121 | ## 14. API / Integration Draft |
| 131 | ## 15. Acceptance Criteria |
| 136 | ## 16. Test Cases |
| 146 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 155 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/22-finance-calculation-spec.md` (64 KB, 463 บรรทัด — v3.20)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 22-finance-calculation-spec.md |
| 3 | # 22 — Finance Calculation Spec (สูตรคำนวณรวมทั้งระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 45 | ## 1. Summary |
| 49 | ## 2. Purpose |
| 53 | ## 3. In Scope |
| 57 | ## 4. Out of Scope |
| 62 | ## 5. Actors & Responsibilities |
| 66 | ## 6. สูตรคำนวณทั้งหมด |
| 68 | ### 6.1 ค่าน้ำมัน (Fuel) — โหมด PER_KM (อ้างอิงไฟล์ 11, 41 §6.4.2) |
| 80 | ### 6.2 ค่าน้ำมัน (Fuel) — โหมด DAILY_FLAT (อ้างอิงไฟล์ 11) — แก้ไขแล้ว (ดู Changelog v... |
| 94 | ### 6.3 เบี้ยเลี้ยง (Allowance) — แก้ไขแล้ว (ดู Changelog v2, v3.4) |
| 107 | ### 6.4 Commission / No-Success Fee (อ้างอิงไฟล์ 11) |
| 117 | ### 6.5 รายได้จาก Service Fee — Model SUCCESS_FEE (อ้างอิงไฟล์ 12, 19) |
| 129 | ### 6.6 รายได้จาก Service Fee — Model FLAT (อ้างอิงไฟล์ 12) |
| 136 | ### 6.7 รายได้จาก Service Fee — Model HYBRID (อ้างอิงไฟล์ 12) |
| 152 | ### 6.8 VAT (อ้างอิงไฟล์ 13 §6.5, 19 §6.3) |
| 214 | ### 6.9 ภาษีหัก ณ ที่จ่าย (WHT) (อ้างอิงไฟล์ 13 §6.4, 17, 18) |
| 318 | ### 6.10 ยอด Payout Batch รวม (อ้างอิงไฟล์ 17) |
| 328 | ### 6.11 AR คงค้าง (อ้างอิงไฟล์ 19 §6.4) |
| 334 | ### 6.12 กำไรขั้นต้น (Gross Profit) — ไฟล์ 21 (Actual เท่านั้น ไม่ใช่ projection) |
| 344 | ### 6.13 เงินทดรองจ่าย — ยอดคืน (อ้างอิงไฟล์ 15) — แก้ไขแล้ว (มติ PO 03/10/2569 — UAT Q3) |
| 364 | ### 6.14 เงินทดรองจ่าย — ยอดคืนค้าง + หักกลบในรอบจ่าย (อ้างอิงไฟล์ 15 §9.3, 17 §6.4) — ... |
| 384 | ### 6.15 เพดานค่าที่พักต่อคืน (อ้างอิงไฟล์ 11, 41 §6.6) — มติ PO 06/10/2569 (U89) |
| 401 | ### 6.16 ภาษีที่ลูกค้าจะหัก ณ ที่จ่าย (ประมาณ) ของรอบวางบิล (UAT R14 BUG-165) |
| 415 | ### 6.17 ใบรับรองแทนใบเสร็จรับเงิน — ยอดรวม + เพดาน (อ้างอิงไฟล์ 15 §9.4, 41 §6.6, 13 §... |
| 436 | ## 7. Data Entities / Required Objects |
| 440 | ## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 446 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 456 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/23-finance-state-machines.md` (32 KB, 270 บรรทัด — v2.11)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 23-finance-state-machines.md |
| 3 | # 23 — Finance State Machines (สถานะรวมทุก Entity) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 34 | ## 1. Summary |
| 38 | ## 2. Purpose |
| 42 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 46 | ## 6. State Machines ทั้งหมด |
| 48 | ### 6.1 Finance Company (ไฟล์ 10) |
| 54 | ### 6.2 Payee Profile (ไฟล์ 18) |
| 63 | ### 6.3 Expense / Claim (ไฟล์ 15, 41 §6.6 — entity เดียวกัน enum เดียวกัน) — แก้ไขแล้ว |
| 76 | ### 6.4 Advance — เงินทดรองจ่าย (ไฟล์ 15) — แก้ไขแล้ว (5 สถานะ) |
| 91 | ### 6.5 Compensation Approval — Multi-step (ไฟล์ 16, ผูกกับ §6.3 ด้านบน) |
| 100 | ### 6.6 Payout Batch (ไฟล์ 17) — เติม `draft` แล้ว |
| 111 | ### 6.7 Revenue (ไฟล์ 19) |
| 119 | ### 6.8 Billing Batch (ไฟล์ 19) |
| 126 | ### 6.9 Adjustment (ไฟล์ 20) |
| 133 | ### 6.10 Tax Invoice (ไฟล์ 31) — แก้ไขแล้ว ✅ |
| 143 | ### 6.11 WHT Filing Period Summary (ไฟล์ 33) |
| 151 | ### 6.12 Exception (ไฟล์ 34) — แก้ไขแล้ว ✅ |
| 160 | ### 6.13 Accounting Period — Period Lock Policy (ไฟล์ 13 §6.11, ไฟล์ 30) — **state แม่ท... |
| 172 | ### 6.14 Bank Transaction (ไฟล์ 35) — แก้ไขแล้ว ✅ |
| 196 | ### 6.15 Accountant Question (ไฟล์ 36) — ตรวจสอบแล้ว ✅ |
| 204 | ### 6.16 Export Record (ไฟล์ 37) — แก้ไขแล้ว ✅ |
| 212 | ### 6.17 Substitute Receipt — ใบรับรองแทนใบเสร็จรับเงิน (ไฟล์ 15 §9.4 · มติ PO 06/10/25... |
| 231 | ## 7. ความสัมพันธ์ระหว่าง State Machines (Cross-Entity Flow) |
| 250 | ## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 256 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 263 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/24-finance-validation-rules.md` (101 KB, 358 บรรทัด — v4.38)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 24-finance-validation-rules.md |
| 3 | # 24 — Finance Validation Rules (กฎตรวจสอบรวมทั้งระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 75 | ## 1. Summary |
| 79 | ## 2. Purpose |
| 83 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 87 | ## 6. Validation Rules แยกตามหมวด |
| 89 | ### 6.1 หมวดข้อมูลพื้นฐาน (Master Data — ไฟล์ 08, 09, 10, 11, 12, 18) |
| 129 | ### 6.2 หมวดภาษี/VAT (ไฟล์ 13, 19) |
| 144 | ### 6.3 หมวดธนาคาร/ไฟล์ (ไฟล์ 13, 17, 35) |
| 169 | ### 6.4 หมวด Claim/Advance/Approval (ไฟล์ 15, 16) — แก้ไขแล้ว |
| 190 | ### 6.5 หมวด Payout/Payee (ไฟล์ 17, 18) |
| 209 | ### 6.6 หมวด Revenue/Billing (ไฟล์ 19) |
| 218 | ### 6.7 หมวด Adjustment / Period Lock (ไฟล์ 13, 20, 30) |
| 237 | ### 6.8 หมวดเอกสารทางการ/บัญชี (ไฟล์ 31, 32, 34) |
| 284 | ### 6.9 หมวด Auth & Access Control (ไฟล์ 05, 07, 08) |
| 308 | ### 6.10 หมวด Audit (Platform — ไฟล์ 90) |
| 316 | ### 6.11 หมวด Background Job (Platform — ไฟล์ 91) |
| 327 | ### 6.12 หมวดรายงาน (Platform — ไฟล์ 96) |
| 336 | ## 7. Validation Code Naming Convention |
| 340 | ## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 346 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 351 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/25-finance-permission-matrix.md` (34 KB, 230 บรรทัด — v2.15)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 25-finance-permission-matrix.md |
| 3 | # 25 — Finance Permission Matrix (เมทริกซ์สิทธิ์รวมทั้งระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 41 | ## 1. Summary |
| 45 | ## 2. Purpose |
| 49 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 53 | ## 6. Roles ที่ใช้ในโมดูล Finance/Accounting (อ้างอิงจาก Master Role List ไฟล์ 07 §5) |
| 68 | ## 7. Permission Matrix รวม (จัดกลุ่มตามไฟล์ต้นทาง) |
| 70 | ### 7.1 Master Data (ไฟล์ 10, 12, 13) |
| 86 | ### 7.2 ฝั่งรายจ่าย (ไฟล์ 15, 16, 17, 18) |
| 102 | ### 7.3 ฝั่งรายรับ (ไฟล์ 19, 31) |
| 123 | ### 7.4 Adjustment & Period Lock (ไฟล์ 20, 30) |
| 133 | ### 7.5 ฝั่งบัญชี (ไฟล์ 32, 33, 34, 35, 36, 37) |
| 148 | ### 7.6 รายงาน (ไฟล์ 14, 21) |
| 156 | ## 8. ข้อสังเกตเรื่องความสอดคล้อง |
| 165 | ### 8.1 ข้อยกเว้น: endpoint ที่ผูกกับตัวผู้ใช้เอง (self-scoped) — เพิ่ม 15/08/2569 |
| 177 | ### 8.2 สิทธิ์คลังสินค้า (นอก Matrix — เจ้าของ `44` §13) — เพิ่ม 05/10/2569 (มติ PO U22... |
| 186 | ## 9. Workflow / Lifecycle |
| 190 | ## 10-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 196 | ### 16.1 Mapping สัญลักษณ์ในไฟล์นี้ → ระดับสิทธิ์ในระบบ (DEC-009, 05/07/2569) |
| 216 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 223 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/27-finance-api-contracts.md` (26 KB, 288 บรรทัด — v3.15)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 27-finance-api-contracts.md |
| 3 | # 27 — Finance API Contracts (รวม API Endpoint ทั้งระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 43 | ## 1. Summary |
| 47 | ## 2. Purpose |
| 51 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 55 | ## 6. API Endpoints รวมทั้งหมด (จัดกลุ่มตาม Resource) |
| 57 | ### 6.1 Settings (ไฟล์ 13) |
| 84 | ### 6.2 Master Data (ไฟล์ 10, 12) |
| 98 | ### 6.3 Payee (ไฟล์ 18) |
| 109 | ### 6.4 Claims & Advances (ไฟล์ 15) — เติม endpoint แล้ว |
| 127 | ### 6.5 Compensation Approval (ไฟล์ 16) |
| 135 | ### 6.6 Payout (ไฟล์ 17) |
| 150 | ### 6.7 Revenue & Billing (ไฟล์ 19) |
| 162 | ### 6.8 Adjustment (ไฟล์ 20) |
| 176 | ### 6.9 Dashboard & Reports (ไฟล์ 14, 21) |
| 185 | ### 6.10 Accounting: Sales & Receipts (ไฟล์ 31) |
| 194 | ### 6.11 Accounting: Expenses (ไฟล์ 32) |
| 201 | ### 6.12 Accounting: WHT (ไฟล์ 33) |
| 211 | ### 6.13 Exceptions (ไฟล์ 34) |
| 221 | ### 6.14 Bank Reconciliation (ไฟล์ 35) |
| 232 | ### 6.15 Accountant Questions (ไฟล์ 36) |
| 240 | ### 6.16 Monthly Close & Export (ไฟล์ 30, 37) |
| 253 | ### 6.17 ตัวอย่างเอกสารทั้งหมด (ไฟล์ 28 §6.5 — มติ PO U104) |
| 260 | ## 7. REST Convention ที่ใช้สม่ำเสมอทั้งระบบ |
| 269 | ## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 275 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 281 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/28-finance-export-pdf-spec.md` (43 KB, 171 บรรทัด — v2.10)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 28-finance-export-pdf-spec.md |
| 3 | # 28 — Finance Export PDF Spec (เอกสาร PDF ทั้งหมด) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 35 | ## 1. Summary |
| 39 | ## 2. Purpose |
| 43 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 47 | ## 6. รายการเอกสาร PDF ทั้งหมด |
| 49 | ### 6.0 หัวเอกสารกลาง (Letterhead) — มติ PO 06/10/2569 (U99) |
| 58 | ### 6.0.1 เลย์เอาต์เอกสารตามแบบที่อนุมัติ — มติ PO 06/10/2569 (U100/U101) |
| 81 | ### 6.1 เอกสารภายใน (Internal — ไม่มีข้อกำหนดทางกฎหมาย, อ้างอิงไฟล์ 13 §6.7) |
| 96 | ### 6.2 เอกสารทางการ — ใบกำกับภาษี (ไฟล์ 31 §6.2) 🔶 มีข้อกำหนดทางกฎหมายเข้มงวด |
| 113 | ### 6.3 เอกสารทางการ — หนังสือรับรองการหักภาษี ณ ที่จ่าย (ใบ 50 ทวิ) (ไฟล์ 33 §6.3) 🔶 ม... |
| 128 | ### 6.4 Document Checklist Export (ไฟล์ 34, ใช้ XLSX ไม่ใช่ PDF) |
| 132 | ### 6.5 หน้าตัวอย่างเอกสารทั้งหมด — มติ PO 06/10/2569 (U104) |
| 143 | ## 7. Implementation Notes |
| 151 | ## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 157 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 163 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/30-accounting-handover-monthly-close.md` (25 KB, 188 บรรทัด — v2.7)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 30-accounting-handover-monthly-close.md |
| 3 | # 30 — Accounting Handover & Monthly Close (ปิดงวดบัญชีรายเดือน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 30 | ## 1. Summary |
| 34 | ## 2. Purpose |
| 38 | ## 3. In Scope |
| 44 | ## 4. Out of Scope |
| 50 | ## 5. Actors & Responsibilities |
| 57 | ## 6. Core Concepts |
| 59 | ### 6.1 Accounting Period State Machine |
| 67 | ### 6.2 ความพร้อมก่อนปิดงวด (Readiness Check) |
| 79 | ### 6.2a ส่ง/ล็อกได้เมื่องวดสิ้นเดือนแล้วเท่านั้น (มติ PO U51) |
| 87 | ## 7. Data Entities / Required Objects |
| 89 | ### 7.1 Accounting Period |
| 101 | ## 8. UI / UX Rules |
| 109 | ## 9. Workflow / Lifecycle |
| 115 | ## 10. Security / Control Rules |
| 120 | ## 11. Validation & Error Handling |
| 130 | ## 12. Permission Requirements |
| 138 | ## 13. Audit Log Requirements |
| 143 | ## 14. API / Integration Draft |
| 153 | ## 15. Acceptance Criteria |
| 159 | ## 16. Test Cases |
| 174 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 181 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/31-accounting-sales-and-receipts.md` (65 KB, 327 บรรทัด — v4.2)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 31-accounting-sales-and-receipts.md |
| 3 | # 31 — Accounting: Sales and Receipts (บัญชีขายและเงินรับ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 32 | ## 1. Summary |
| 36 | ## 2. Purpose |
| 40 | ## 3. In Scope |
| 48 | ## 4. Out of Scope |
| 54 | ## 5. Actors & Responsibilities |
| 61 | ## 6. Core Concepts |
| 63 | ### 6.1 Sales Record (รายการขาย — มุมมองบัญชี) |
| 67 | ### 6.1.1 ใบแจ้งหนี้/ใบวางบิล (มติ PO 06/10/2569 U95 · U96 #12) |
| 73 | ### 6.2 ใบเสร็จรับเงิน/ใบกำกับภาษี (Tax Invoice) 🔶 มีข้อกำหนดทางกฎหมายเข้มงวด — ต้องให้... |
| 103 | ### 6.3 Cash Receipt (เงินรับจริง) |
| 109 | ### 6.4 Receipt (ใบเสร็จรับเงิน) |
| 113 | ### 6.5 Credit Note (ใบลดหนี้ — มติ PO 05/10/2569 (U14 — บันทึกใบลดหนี้ที่สำนักงานบัญชี... |
| 124 | ### 6.6 50 ทวิ ที่ลูกค้าหักเรา (มติ PO 05/10/2569 U40 — แบบเต็ม) |
| 135 | ## 7. Data Entities / Required Objects |
| 137 | ### 7.1 Sales Record |
| 147 | ### 7.2 Tax Invoice (แก้ไข status แล้ว — ดู Changelog v2) |
| 168 | ### 7.3 Cash Receipt |
| 179 | ### 7.4 Credit Note (มติ PO 05/10/2569 (U14 — บันทึกใบลดหนี้ที่สำนักงานบัญชีออก)) |
| 196 | ## 8. UI / UX Rules |
| 205 | ## 9. Workflow / Lifecycle |
| 207 | ### 9.1 Tax Invoice (แก้ไขแล้ว) |
| 213 | ### 9.2 Cash Receipt |
| 217 | ## 10. Security / Control Rules |
| 223 | ## 11. Validation & Error Handling |
| 243 | ## 12. Permission Requirements |
| 251 | ## 13. Audit Log Requirements |
| 257 | ## 14. API / Integration Draft |
| 272 | ## 15. Acceptance Criteria |
| 278 | ## 16. Test Cases |
| 311 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 319 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/33-accounting-wht-data.md` (43 KB, 227 บรรทัด — v3.10)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 33-accounting-wht-data.md |
| 3 | # 33 — Accounting: WHT Data (ข้อมูลหัก ณ ที่จ่ายและหนังสือรับรอง) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 35 | ## 1. Summary |
| 39 | ## 2. Purpose |
| 43 | ## 3. In Scope |
| 49 | ## 4. Out of Scope |
| 54 | ## 5. Actors & Responsibilities |
| 60 | ## 6. Core Concepts |
| 62 | ### 6.1 WHT Summary (สรุปข้อมูลหัก ณ ที่จ่ายรอนำส่ง) |
| 70 | ### 6.2 กำหนดเวลานำส่งภาษี 🔶 มีโทษปรับจริงหากพลาด — ต้องเตือนให้ชัดเจน |
| 74 | ### 6.3 หนังสือรับรองการหักภาษี ณ ที่จ่าย (ใบ 50 ทวิ) |
| 95 | ### 6.4 ผู้รับนิติบุคคล (มติ PO 06/10/2569 — UAT U96 #2) |
| 99 | ## 7. Data Entities / Required Objects |
| 101 | ### 7.1 WHT Certificate (หนังสือรับรองหัก ณ ที่จ่าย) |
| 125 | ### 7.2 WHT Filing Period Summary |
| 138 | ## 8. UI / UX Rules |
| 145 | ## 9. Workflow / Lifecycle |
| 155 | ## 10. Security / Control Rules |
| 160 | ## 11. Validation & Error Handling |
| 168 | ## 12. Permission Requirements |
| 175 | ## 13. Audit Log Requirements |
| 179 | ## 14. API / Integration Draft |
| 189 | ## 15. Acceptance Criteria |
| 194 | ## 16. Test Cases |
| 212 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 220 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/34-accounting-document-checklist-exceptions.md` (18 KB, 182 บรรทัด — v2.3)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 34-accounting-document-checklist-exceptions.md |
| 3 | # 34 — Document Checklist & Exceptions (รายการตรวจสอบเอกสารและข้อยกเว้น) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 26 | ## 1. Summary |
| 30 | ## 2. Purpose |
| 34 | ## 3. In Scope |
| 39 | ## 4. Out of Scope |
| 44 | ## 5. Actors & Responsibilities |
| 51 | ## 6. Core Concepts |
| 53 | ### 6.1 Severity Levels |
| 61 | ### 6.2 Status: 3 สถานะ (แก้ไขแล้ว — ดู Changelog v2) |
| 71 | ### 6.3 Authorized Exception — ยุบเข้าเป็น field เดียวกับ Exception แล้ว (แก้ไขแล้ว) |
| 81 | ## 7. Data Entities / Required Objects |
| 83 | ### 7.1 Exception (รวม Authorized fields เข้ามาแล้ว — ดู Changelog v2) |
| 97 | ## 8. UI / UX Rules |
| 106 | ## 9. Workflow / Lifecycle |
| 112 | ## 10. Security / Control Rules |
| 118 | ## 11. Validation & Error Handling |
| 125 | ## 12. Permission Requirements |
| 133 | ## 13. Audit Log Requirements |
| 138 | ## 14. API / Integration Draft |
| 148 | ## 15. Acceptance Criteria |
| 155 | ## 16. Test Cases |
| 167 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 175 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/35-bank-reconciliation.md` (30 KB, 203 บรรทัด — v2.4)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 35-bank-reconciliation.md |
| 3 | # 35 — Bank Reconciliation (กระทบยอดธนาคาร) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 27 | ## 1. Summary |
| 31 | ## 2. Purpose |
| 35 | ## 3. In Scope |
| 42 | ## 4. Out of Scope |
| 47 | ## 5. Actors & Responsibilities |
| 53 | ## 6. Core Concepts |
| 55 | ### 6.1 Bank Transaction (รายการจาก Statement) |
| 59 | ### 6.2 Auto-matching Logic |
| 70 | ### 6.3 Manual Matching |
| 74 | ### 6.4 Unmatched Resolved (เพิ่มใหม่ — ดู Changelog v2) |
| 78 | ### 6.5 เงินรับรอตรวจสอบ (มติ PO 05/10/2569 U41) |
| 86 | ### 6.6 คู่ที่ระบบเสนอ — จับคู่ทางกลับ (มติ PO U137) |
| 95 | ## 7. Data Entities / Required Objects |
| 97 | ### 7.1 Bank Transaction (แก้ไข matching structure แล้ว — ดู Changelog v2) |
| 114 | ## 8. UI / UX Rules |
| 123 | ## 9. Workflow / Lifecycle |
| 127 | ## 10. Security / Control Rules |
| 133 | ## 11. Validation & Error Handling |
| 140 | ## 12. Permission Requirements |
| 147 | ## 13. Audit Log Requirements |
| 152 | ## 14. API / Integration Draft |
| 164 | ## 15. Acceptance Criteria |
| 171 | ## 16. Test Cases |
| 189 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 196 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/37-accounting-pack-export-history.md` (55 KB, 198 บรรทัด — v2.19)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 37-accounting-pack-export-history.md |
| 3 | # 37 — Accounting Pack Export History (ประวัติส่งมอบบัญชี) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 43 | ## 1. Summary |
| 47 | ## 2. Purpose |
| 51 | ## 3. In Scope |
| 57 | ## 4. Out of Scope |
| 62 | ## 5. Actors & Responsibilities |
| 68 | ## 6. Core Concepts |
| 70 | ### 6.1 รายชื่อไฟล์มาตรฐานใน Accounting Pack (เรียงเลขต่อเนื่อง พร้อม Adjustment Log) |
| 94 | ### 6.2 Version Control |
| 98 | ## 7. Data Entities / Required Objects |
| 100 | ### 7.1 Export Record (แก้ไข status แล้ว — ดู Changelog v2) |
| 114 | ## 8. UI / UX Rules |
| 123 | ## 9. Workflow / Lifecycle |
| 129 | ## 10. Security / Control Rules |
| 134 | ## 11. Validation & Error Handling |
| 140 | ## 12. Permission Requirements |
| 147 | ## 13. Audit Log Requirements |
| 152 | ## 14. API / Integration Draft |
| 161 | ## 15. Acceptance Criteria |
| 168 | ## 16. Test Cases |
| 184 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 191 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/38-case-submission.md` (116 KB, 531 บรรทัด — v3.8)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 38-case-submission.md |
| 3 | # 38 — Case Submission (รับเคส) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 34 | ## 1. Summary |
| 38 | ## 2. Purpose |
| 42 | ## 3. Scope |
| 44 | ### 3.1 In Scope |
| 52 | ### 3.2 Out of Scope (ยกไป Sprint ถัดไป / เอกสารอื่น) |
| 59 | ## 4. Actors & Responsibilities |
| 72 | ## 5. Menu & Navigation |
| 78 | ## 6. Data Requirements |
| 80 | ### 6.1 Required Fields — ข้อมูลลูกหนี้/คู่สัญญา |
| 102 | ### 6.1.1 Identity Document — Conditional ตามสัญชาติ |
| 110 | ### 6.1.2 Address Structure (ใช้ร่วมกันทั้ง 3 ที่อยู่) |
| 126 | ### 6.1.3 Contact Persons (ผู้ติดต่ออื่น) — Repeatable |
| 133 | ### 6.2 Required Fields — ข้อมูลทรัพย์/สินค้า |
| 142 | ### 6.3 Document Checklist (เอกสารแนบ) |
| 157 | ### 6.3.1 Product Photo (รูปสินค้า) — แยกเป็น Section ของตัวเอง |
| 167 | ### 6.3.2 โหมดเอกสารชุดเดียว (สแกนรวมเล่ม) — v3.2 |
| 180 | ### 6.3.3 ติ๊กรูปสินค้า · จำโหมด · ลบเอกสารที่แนบผิด — v3.5 |
| 188 | ### 6.4 Derived / Computed Fields |
| 204 | ### 6.5 Projected Revenue Calculation (ประมาณการรายได้ก่อนรับเคส) |
| 220 | ### 6.6 Re-track / Recycle Flow (เคสไม่สำเร็จ — ไฟแนนซ์ขอให้ลองใหม่) |
| 231 | ## 7. UI Requirements |
| 233 | ### 7.1 Page Layout |
| 241 | ### 7.2 Table Behavior |
| 250 | ### 7.3 Form / Modal Behavior (Manual Entry) |
| 266 | ### 7.4 Team Suggestion UI |
| 276 | ### 7.5 Case Detail / Review Modal (Consolidated) |
| 298 | ## 8. Actions & Buttons |
| 315 | ## 9. Workflow |
| 331 | ## 10. Status / State Machine |
| 346 | ## 11. Business Rules |
| 357 | ## 12. Validation & Error Handling |
| 381 | ## 13. Permissions |
| 395 | ## 14. Audit Log |
| 409 | ## 15. Notifications |
| 415 | ## 16. Integration Points |
| 423 | ## 17. API / Event Contract Draft |
| 425 | ### 17.1 API Endpoints |
| 438 | ### 17.2 Events |
| 448 | ## 18. Export / Document Requirements |
| 452 | ## 19. Acceptance Criteria |
| 461 | ## 20. Test Cases |
| 504 | ## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 516 | ## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/40-case-assignment-routing.md` (87 KB, 369 บรรทัด — v2.6)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 40-case-assignment-routing.md |
| 3 | # 40 — Case Assignment & Routing (มอบหมายและวางแผนงาน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 30 | ## 1. Summary |
| 33 | ## 2. Purpose |
| 36 | ## 3. Scope |
| 38 | ### 3.1 In Scope |
| 45 | ### 3.2 Out of Scope (ส่งต่อเอกสารอื่น/Sprint ถัดไป) |
| 52 | ## 4. Actors & Responsibilities |
| 64 | ## 5. Menu & Navigation |
| 69 | ## 6. Data Requirements |
| 71 | ### 6.1 Required Fields |
| 85 | ### 6.1.1 Pending Reassignment Object |
| 97 | ### 6.2 Agent Decision-Support Fields (แสดงเฉพาะหน้ามอบหมาย ไม่ผูกกับ case) |
| 105 | ### 6.3 Derived / Computed Fields |
| 109 | ### 6.4 Settings Config — Supervisor Action Permission |
| 121 | ## 7. UI Requirements |
| 123 | ### 7.1 Page Layout |
| 129 | ### 7.2 Table Behavior |
| 142 | ### 7.3 Assignment Modal (Manager) — Consolidated: Case Detail + Agent Picker |
| 161 | ### 7.4 Agent Accept UI |
| 166 | ### 7.5 Kanban Board — ภาพรวม Workload ของทีม |
| 174 | ## 8. Actions & Buttons |
| 183 | ## 9. Workflow |
| 205 | ## 10. Status / State Machine |
| 215 | ## 11. Business Rules |
| 231 | ## 12. Validation & Error Handling |
| 244 | ## 13. Permissions |
| 261 | ## 14. Audit Log |
| 269 | ## 15. Notifications |
| 276 | ## 16. Integration Points |
| 282 | ## 17. API / Event Contract Draft |
| 284 | ### 17.1 API Endpoints |
| 298 | ### 17.2 Events |
| 307 | ## 18. Export / Document Requirements |
| 310 | ## 19. Acceptance Criteria |
| 320 | ## 20. Test Cases |
| 348 | ## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 360 | ## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/41-field-tracker-mobile.md` (167 KB, 618 บรรทัด — v2.26)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 41-field-tracker-mobile.md |
| 3 | # 41 — Field Tracker Mobile (ติดตามภาคสนาม) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 12 | ## Changelog |
| 51 | ## 1. Summary |
| 54 | ## 2. Purpose |
| 57 | ## 3. Scope |
| 59 | ### 3.1 In Scope |
| 68 | ### 3.2 Out of Scope (ยกไปเฟส/เอกสารอื่น) |
| 75 | ## 4. Actors & Responsibilities |
| 86 | ## 5. Menu & Navigation |
| 88 | ### 5.1 Mobile — Bottom Nav (4 รายการ) + Top Bar |
| 97 | ### 5.2 Desktop — Sidebar ถาวร (Fixed) |
| 104 | ## 6. Data Requirements |
| 106 | ### 6.1 Case Assignment Status (รับช่วงจากไฟล์ 40) |
| 119 | ### 6.2 Address Structure (3 ที่อยู่ — รับมาจากไฟล์ 38 §6.1.2) |
| 129 | ### 6.3 Contact Methods (คลิกเพื่อติดต่อได้จริง) |
| 137 | ### 6.4 Evidence (หลักฐานการปิดงาน) |
| 151 | ### 6.4.1 Travel Origin (จุดเริ่มเดินทาง — สำหรับคำนวณค่าน้ำมัน PER_KM) |
| 164 | ### 6.4.2 Distance Calculation (คำนวณระยะทางสำหรับค่าน้ำมัน PER_KM) |
| 171 | ### 6.5 Close-Case Draft (บันทึกฟอร์มปิดงานแบบไม่ครบ) |
| 181 | ### 6.6 Expense (ค่าใช้จ่าย) |
| 218 | ### 6.7 Pending Reassignment (รับมาจากไฟล์ 40) |
| 228 | ### 6.8 Derived / Computed Fields |
| 233 | ## 7. UI Requirements |
| 235 | ### 7.1 Dashboard (หน้าแรก) |
| 245 | ### 7.2 แท็บ "รอรับงาน" |
| 251 | ### 7.3 แท็บ "รับงานแล้ว" (จัดวันที่) |
| 257 | ### 7.4 Calendar Picker (เลือกวันที่ติดตาม) |
| 267 | ### 7.5 แท็บ "กำลังติดตาม" |
| 278 | ### 7.6 ฟอร์มปิดงาน (Close Case) |
| 299 | ### 7.7 Case Detail (รายละเอียดเคสแบบเต็ม) |
| 312 | ### 7.8 Pending Reassignment Flow (ตอบรับ/ปฏิเสธคำขอเปลี่ยนผู้รับผิดชอบ) |
| 321 | ### 7.9 เบิกค่าใช้จ่าย |
| 329 | ### 7.10 สรุปรายได้ |
| 335 | ### 7.11 แท็บ "จบงาน" |
| 340 | ## 8. Actions & Buttons |
| 359 | ## 9. Workflow |
| 385 | ## 10. Status / State Machine |
| 399 | ### 10.1 QC Outcome — สรุปกฎการตีกลับ (ปิด Open Item #9) |
| 418 | ## 11. Business Rules |
| 431 | ## 12. Validation & Error Handling |
| 458 | ## 13. Permissions |
| 467 | ## 14. Audit Log |
| 475 | ## 15. Notifications |
| 487 | ## 16. Integration Points |
| 494 | ## 17. API / Event Contract Draft |
| 496 | ### 17.1 API Endpoints |
| 514 | ### 17.2 Events |
| 530 | ## 18. Export / Document Requirements |
| 533 | ## 19. Acceptance Criteria |
| 540 | ## 20. Test Cases |
| 589 | ## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 604 | ## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/44-asset-custody-handover.md` (57 KB, 671 บรรทัด — v2.7)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 44-asset-custody-handover.md |
| 3 | # 44 — Asset Custody & Handover (คลังสินค้าและการส่งมอบทรัพย์คืน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 32 | ## 1. Summary |
| 35 | ## 2. Purpose |
| 41 | ## 3. In Scope |
| 49 | ## 4. Out of Scope |
| 57 | ## 5. Actors & Responsibilities |
| 70 | ## 6. Core Concepts |
| 72 | ### 6.1 Asset (ทรัพย์ที่ยึดคืน) |
| 77 | ### 6.2 HandoverLot (ล็อตส่งมอบ) |
| 86 | ### 6.3 รูปแบบการส่งมอบ (HandoverType) |
| 95 | ### 6.4 เอกสาร |
| 102 | ### 6.5 IMEI Validation |
| 111 | ## 7. Data Entities / Required Objects |
| 113 | ### 7.1 Asset |
| 147 | ### 7.2 HandoverLot |
| 182 | ## 8. UI / UX Rules (อ้างอิง warehouse.html) |
| 184 | ### 8.1 โครงสร้างหน้า |
| 195 | ### 8.2 แท็บ "รับเข้าคลัง" |
| 238 | ### 8.3 แท็บ "ในคลัง" |
| 277 | ### 8.4 แท็บ "รอส่งมอบ" |
| 302 | ### 8.5 แท็บ "ส่งมอบแล้ว" |
| 323 | ## 9. Workflow / State Machines |
| 325 | ### 9.1 Asset Status Flow |
| 347 | ### 9.2 HandoverLot Status Flow |
| 374 | ### 9.3 สรุป Draft / Confirmed ใน UI |
| 384 | ## 10. Security / Control Rules |
| 401 | ## 11. ผลกระทบต่อ Module อื่นเมื่อ Lot.status = confirmed |
| 439 | ## 12. Validation & Error Handling |
| 464 | ## 13. Permission Requirements |
| 481 | ## 14. Audit Log Requirements |
| 498 | ## 15. API Endpoints |
| 500 | ### Assets |
| 543 | ### HandoverLots |
| 617 | ## 16. Acceptance Criteria |
| 633 | ## 17. Test Cases |
| 655 | ## 18. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 666 | ## 19. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/45-case-warehouse-api-contracts.md` (25 KB, 184 บรรทัด — v1.9)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 45-case-warehouse-api-contracts.md |
| 3 | # 45 — Case & Warehouse API Contracts (รวม API Endpoint ทั้งระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 33 | ## 1. Summary |
| 37 | ## 2. Purpose |
| 41 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 45 | ## 6. API Endpoints รวมทั้งหมด (จัดกลุ่มตาม Resource) |
| 47 | ### 6.1 Case Submission (ไฟล์ 38) |
| 62 | ### 6.2 Case Assignment & Routing (ไฟล์ 40) |
| 76 | ### 6.3 Field Tracker — Mobile/Desktop (ไฟล์ 41) |
| 101 | ### 6.4 Warehouse — Assets (ไฟล์ 44) |
| 110 | ### 6.5 Warehouse — Handover Lots (ไฟล์ 44) |
| 123 | ## 7. Events รวม (สรุปย่อ — รายละเอียดเต็มดูไฟล์ต้นทาง §17.2/§16) |
| 155 | ## 8. REST Convention ที่ใช้สม่ำเสมอทั้งระบบ |
| 165 | ## 9-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 171 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 177 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/90-platform-audit-notification-reporting.md` (34 KB, 251 บรรทัด — v4.5)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 90-platform-audit-notification-reporting.md |
| 3 | # 90 — Platform Audit, Notification & Reporting |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 34 | ## 1. Summary |
| 38 | ## 2. Purpose |
| 42 | ## 3. In Scope |
| 48 | ## 4. Out of Scope |
| 53 | ## 5. Actors & Responsibilities |
| 68 | ## 6. Core Concepts |
| 76 | ### 6.1 Event Flow (Audit → Notification) |
| 95 | ### 6.2 PDPA / Privacy Scope (Draft — 03/07/2569) |
| 125 | ### 6.3 Notification Channel & Event Trigger (Decided — 03/07/2569) |
| 153 | ## 7. Data Entities / Required Objects |
| 163 | ## 8. UI / UX Rules |
| 169 | ## 9. Workflow / Lifecycle |
| 173 | ## 10. Security / Control Rules |
| 179 | ## 11. Validation & Error Handling |
| 188 | ## 12. Permission Requirements |
| 195 | ## 13. Audit Log Requirements |
| 203 | ## 14. API / Integration Draft |
| 214 | ## 15. Acceptance Criteria |
| 221 | ## 16. Test Cases |
| 233 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 242 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/91-platform-api-integration-jobs.md` (36 KB, 261 บรรทัด — v2.10)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 91-platform-api-integration-jobs.md |
| 3 | # 91 — Platform API Integration & Background Jobs |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 35 | ## 1. Summary |
| 39 | ## 2. Purpose |
| 43 | ## 3. In Scope |
| 49 | ## 4. Out of Scope |
| 54 | ## 5. Actors & Responsibilities |
| 69 | ## 6. Core Concepts |
| 77 | ### 6.1 Job Type ที่ระบบรู้จัก (จาก `02-database-schema-design.md` §10) |
| 91 | ### 6.2 Job Lifecycle (State Diagram) |
| 107 | ### 6.3 คิวแจ้งเตือนของ job (Notification Outbox — มติ PO 06/10/2569 U120 · DEC-015) |
| 119 | ### 6.4 ตัวกวาดขั้นหลังรอบจ่ายสำเร็จ (`payout_completion_repair` — มติ PO 07/10/2569 U134) |
| 131 | ## 7. Data Entities / Required Objects |
| 139 | ## 8. UI / UX Rules |
| 146 | ## 9. Workflow / Lifecycle |
| 150 | ## 10. Security / Control Rules |
| 156 | ## 11. Validation & Error Handling |
| 166 | ## 12. Permission Requirements |
| 173 | ## 13. Audit Log Requirements |
| 180 | ## 14. API / Integration Draft |
| 191 | ### 14.1 Dev Trigger Endpoint (`/api/dev/trigger-job`) |
| 202 | ### 14.2 Dev ส่ง/ล็อกงวดด้วยวันที่จำลอง (`/api/dev/accounting-periods/{id}/send\|lock` ... |
| 218 | ## 15. Acceptance Criteria |
| 225 | ## 16. Test Cases |
| 242 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 252 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/93-roadmap-open-items.md` (23 KB, 239 บรรทัด — v3.2)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 93-roadmap-open-items.md |
| 3 | # 93 — Roadmap & Open Items (Consolidated Index) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 27 | ## 1. Summary |
| 31 | ## 2. Purpose |
| 35 | ## 3. In Scope |
| 41 | ## 4. Out of Scope |
| 46 | ## 5. Actors & Responsibilities |
| 61 | ## 6. Core Concepts |
| 69 | ## 7. Data Entities / Required Objects |
| 77 | ### 7.1 Consolidated Open Items Index (รวมทุกไฟล์ — อัปเดต 03/07/2569) |
| 162 | ## 8. UI / UX Rules |
| 168 | ## 9. Workflow / Lifecycle |
| 172 | ## 10. Security / Control Rules |
| 178 | ## 11. Validation & Error Handling |
| 187 | ## 12. Permission Requirements |
| 194 | ## 13. Audit Log Requirements |
| 201 | ## 14. API / Integration Draft |
| 210 | ## 15. Acceptance Criteria |
| 217 | ## 16. Test Cases |
| 227 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 232 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/94-decision-log.md` (43 KB, 308 บรรทัด — v3.8)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 94-decision-log.md |
| 3 | # 94 — Decision Log |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 34 | ## 1. Summary |
| 38 | ## 2. Purpose |
| 42 | ## 3. In Scope |
| 48 | ## 4. Out of Scope |
| 53 | ## 5. Actors & Responsibilities |
| 68 | ## 6. Core Concepts |
| 76 | ## 7. Data Entities / Required Objects |
| 83 | ## 8. UI / UX Rules |
| 89 | ## 9. Workflow / Lifecycle |
| 93 | ## 10. Security / Control Rules |
| 98 | ## 11. Validation & Error Handling |
| 107 | ## 12. Permission Requirements |
| 115 | ## 13. Audit Log Requirements |
| 122 | ## 14. API / Integration Draft |
| 130 | ## 15. Acceptance Criteria |
| 137 | ## 16. Test Cases |
| 148 | ## 17. Decision Records (Source of Truth ทุก DEC ของโปรเจกต์) |
| 150 | ### DEC-001 — Tech Stack (02/07/2569) |
| 160 | ### DEC-002 — Permission Architecture (02/07/2569) |
| 170 | ### DEC-003 — File Storage (02/07/2569) |
| 180 | ### DEC-004 — Polymorphic Relation Pattern (02/07/2569) |
| 190 | ### DEC-005 — UI Datetime Calendar Standard (03/07/2569) |
| 200 | ### DEC-006 — Batch 6 Consistency Sync: คำตอบ D1–D10 ครบชุด (04/07/2569) |
| 210 | ### DEC-007 — Mockup Audit: ผลตรวจ HTML Mockup ทั้งชุด (04/07/2569) |
| 220 | ### DEC-008 — Service Fee Template แสดงผลแบบการ์ด (05/07/2569) |
| 230 | ### DEC-009 — Functional Permission Matrix ใช้ระดับสิทธิ์ 3 ระดับ (05/07/2569) |
| 240 | ### DEC-010 — Login ด้วยอีเมลหรือ username + ผู้ดูแลตั้งรหัสผ่านให้ผู้ใช้ (03/10/2569) |
| 250 | ### DEC-011 — Playwright เป็นเครื่องมือ UAT ฝั่ง dev (03/10/2569) |
| 260 | ### DEC-012 — ค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยงเกิดจาก job รายวันหลังจบวัน (03/10/2569) |
| 270 | ### DEC-013 — SheetJS ติดตั้งจาก cdn.sheetjs.com (pin tarball) ไม่ใช่ npm registry (04/... |
| 280 | ### DEC-014 — Storage: ไม่มี policy ให้ผู้ใช้ · ทุกการเข้าถึงไฟล์ผ่าน server + โทเคน/si... |
| 290 | ### DEC-015 — Notification outbox: แจ้งเตือนของ job เข้าคิวในทรานแซกชันเดียวกับการเปลี่... |
| 300 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/95-diagrams.md` (20 KB, 460 บรรทัด — v2)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 95-diagrams.md |
| 3 | # 95 — Diagrams (System Architecture / ER / Use Case / Workflow) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 23 | ## 1. System Architecture Diagram |
| 109 | ## 2. ER Diagram (Entity Relationship) |
| 199 | ## 3. Use Case Diagram |
| 203 | ### 3.1 งานติดตามทรัพย์ (Case Workflow) |
| 239 | ### 3.2 คลังสินค้า (Warehouse) |
| 265 | ### 3.3 การเงิน (Finance) |
| 301 | ### 3.4 บัญชี (Accounting) |
| 337 | ### 3.5 ตั้งค่า (Settings) |
| 369 | ## 4. Main Workflow Diagram (Business Flow ภาพรวม) |
| 444 | ## 5. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 451 | ## 6. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/96-reports.md` (43 KB, 493 บรรทัด — v2.11)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 96-reports.md |
| 3 | # 96 — Reports (รายงานภาพรวมระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 35 | ## 1. Summary |
| 39 | ## 2. Purpose |
| 42 | ## 3. In Scope |
| 48 | ## 4. Out of Scope |
| 53 | ## 5. Actors & Responsibilities |
| 65 | ## 6. รายงานทั้งหมด |
| 67 | ### หมวด F — รายงานการเงิน |
| 197 | ### หมวด O — รายงานงานติดตามทรัพย์ |
| 277 | ### หมวด A — รายงานบัญชี |
| 326 | ### หมวด E — Executive Dashboard |
| 360 | ## 7. Data Sources (ดึงข้อมูลจากไหน) |
| 382 | ## 8. Caching Strategy |
| 395 | ## 9. API Endpoints |
| 422 | ## 10. Permission Matrix |
| 433 | ## 11. UI / UX Rules |
| 444 | ## 12. Validation & Error Handling |
| 455 | ## 13. Acceptance Criteria |
| 467 | ## 14. Test Cases |
| 484 | ## 15. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 491 | ## 16. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/97-client-portal.md` (79 KB, 360 บรรทัด — v6.1)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 97-client-portal.md |
| 3 | # 97 — Client Portal (พอร์ทัลบริษัทไฟแนนซ์) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 40 | ## 1. Summary |
| 43 | ## 2. Purpose |
| 46 | ## 3. Scope |
| 48 | ### 3.1 In Scope |
| 57 | ### 3.2 Out of Scope (ยืนยันถาวร — ไม่ใช่ Open Item) |
| 63 | ### 3.3 รอการตัดสินใจ (ดู §22) |
| 79 | ## 4. Actors & Responsibilities |
| 91 | ## 5. Menu & Navigation |
| 110 | ## 6. Data Requirements |
| 112 | ### 6.1 เคสของเรา (จากไฟล์ 38) |
| 126 | ### 6.2 รอบวางบิล / AR (จากไฟล์ 19) |
| 141 | ### 6.3 ใบกำกับภาษี (จากไฟล์ 31) |
| 144 | ### 6.4 ใบส่งมอบทรัพย์ (จากไฟล์ 44) |
| 153 | ### 6.5 รายงานสรุป |
| 157 | ### 6.6 ข้อมูลบริษัท (read-only) |
| 162 | ## 7. UI Requirements |
| 169 | ## 8. Actions & Buttons |
| 182 | ## 9. Workflow |
| 190 | ## 10. Status / State Machine |
| 192 | ### 10.1 Case Status Mapping (ใหม่ — เฉพาะพอร์ทัลนี้ ไม่ใช่ state machine ใหม่ แค่ labe... |
| 205 | ### 10.2 HandoverLot Status Mapping |
| 212 | ### 10.3 Tax Invoice / Billing Batch |
| 215 | ## 11. Business Rules |
| 226 | ## 12. Validation & Error Handling |
| 235 | ## 13. Permissions |
| 249 | ### 13.1 ดู portal ในฐานะลูกค้า (ผู้ใช้ภายใน — มติ PO 05/10/2569 U59) |
| 264 | ## 14. Audit Log |
| 271 | ## 15. Notifications |
| 274 | ## 16. Integration Points |
| 277 | ## 17. API / Event Contract Draft |
| 310 | ## 18. Export / Document Requirements |
| 316 | ## 19. Acceptance Criteria |
| 324 | ## 20. Test Cases |
| 338 | ## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions — ยืนยันในรอบสนทนานี้ 03/07/2569) |
| 349 | ## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/DECISIONS-NEEDED-BATCH6.md` (19 KB, 263 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # DECISIONS-NEEDED-BATCH6.md |
| 2 | ## Batch 6 — Consistency Sync: รายการที่ต้องให้ Product Owner ตัดสินใจ |
| 11 | ## 🔴 D1 — ตาราง Settings ที่ขาดจาก schema (บล็อก Phase 1.3) |
| 126 | ## 🔴 D2 — `bank_accounts` ไม่ตรงไฟล์ 13 §6.3 |
| 145 | ## 🟡 D3 — ตาราง `notifications` (เฟส 1 ใช้ Push/In-app แต่ไม่มีที่เก็บ) |
| 170 | ## 🟡 D4 — WHT Certificate: กลไกยกเลิก/ออกใหม่ (ไฟล์ 33 §10) |
| 194 | ## 🟡 D5 — `expenses`: เก็บ approval หลายขั้นตาม Approval Matrix |
| 211 | ## 🟡 D6 — Revenue edge case: เคส `closed_success` ที่ไม่มี expense เลย |
| 221 | ## 🟡 D7 — DB constraints เสริมกฎเงิน (เลือกได้เป็นรายข้อ) |
| 243 | ## 🔵 D8 — ยืนยันจำนวน Seed Role = **15** (แก้เอกสารแล้ว) |
| 247 | ## 🔵 D9 — ยืนยันชื่อ endpoint ใหม่ 2 ตัว (เติมแล้วใน 41/45) |
| 251 | ## 🟢 D10 — รูปแบบข้อมูลใน Export Pack template (ไม่บล็อก build) |
| 258 | ## สรุปตัวเลือกที่แนะนำ (ถ้าต้องการตอบสั้น) |

### `docs/PROGRESS_ARCHIVE.md` (501 KB, 2145 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # PROGRESS_ARCHIVE.md — รายละเอียดเต็มของงานที่เสร็จแล้ว |
| 8 | ## Phase 6.6 — แดชบอร์ดหลัก (เมนูแรก Top Nav) |
| 12 | ### สิ่งที่ทำ |
| 20 | ### widget ต่อ role (matrix ค่าเริ่มต้น — ล็อกด้วย `lib/dashboard/widgets.test.ts`) |
| 35 | ### จุดเบี่ยงจาก mockup (มติ PO 2026-08-16 — บันทึกครบ) |
| 49 | ### เทสต์ |
| 54 | ### verify ที่รันจริง |
| 57 | ### จุดที่คนถัดไปควรรู้ |
| 63 | ## Phase 8.3 — Final Test ทั้งระบบ (ด่านของ orchestrator) |
| 69 | ### ด่าน 1 / 4 / 5 (session ก่อนหน้าในก้อนงานเดียวกัน) |
| 74 | ### ด่าน 6 — ความทนทาน: เทสต์ที่ยังขาดของยามที่กู้มาจาก session ที่ถูกตัด (`1eee46e` → ... |
| 81 | ### ด่าน 3 — บัญชี: ใบ 50 ทวิ ออกซ้ำได้ (`9a4e3a7`) |
| 84 | ### ด่าน 2 + 3 — **A1 ลูกค้าหักภาษีก่อนโอน ตายทั้งเส้น** (`e852f36`) ⚠️ จุดที่ร้ายแรงที... |
| 93 | ### ด่าน 2 — ใบกำกับภาษีออกซ้ำ 2 ใบต่อรายการขายเดียว (`0e8f872`) |
| 96 | ### ด่าน 2 — อีก 3 จุด (`adea507` + `bcf2086` + `94d66ef`) |
| 102 | ### สิ่งที่คนถัดไปควรรู้ |
| 110 | ## Phase 8.2 — Consistency Sweep + Hardening |
| 116 | ### แกน 1–2: เงิน satang + วันที่ พ.ศ. (`0ae328c`) |
| 123 | ### แกน 3: RBAC + scope ย่อย (`91de430`) |
| 130 | ### แกน 4: audit ครบ 9 fields + `reason` (`9bd34bc`) |
| 136 | ### แกน 5: Idempotency (`b69a6b2` · `c98f9a7` · `05cd29f`) |
| 144 | ### Immutable Rules ครบทุกตารางของ `02` §13 (`32b71ff`) |
| 147 | ### Index profiling ของ query ที่ join หนัก (`0d743f9`) |
| 150 | ### สิ่งที่คนถัดไปต้องรู้ |
| 158 | ## Phase 8.1 — E2E Acceptance Tests (ไฟล์ 29) |
| 162 | ### สิ่งที่ทำ |
| 174 | ### การตัดสินใจระหว่างทาง |
| 181 | ### จุดที่คนถัดไปควรรู้ |
| 188 | ### verify ที่รันจริง |
| 193 | ## Phase 6.5 — Executive Dashboard (E1–E3) |
| 197 | ### สิ่งที่ทำ |
| 208 | ### การตัดสินใจระหว่างทาง |
| 216 | ### จุดที่คนถัดไปควรรู้ |
| 225 | ## Phase 6.4 — รายงานหมวด A (A1–A4) |
| 229 | ### สิ่งที่ทำ |
| 241 | ### การตัดสินใจระหว่างทาง |
| 249 | ### จุดที่คนถัดไปควรรู้ |
| 257 | ## Phase 6.3 — รายงานหมวด O (O1–O5) + เกณฑ์ SLA (D18) |
| 261 | ### มติ PO ที่ปลดล็อกงานนี้ (D18) |
| 265 | ### สิ่งที่ทำ |
| 279 | ### การตัดสินใจระหว่างทาง |
| 286 | ### จุดที่คนถัดไปควรรู้ |
| 295 | ## Phase 6.2 — รายงานหมวด F (F1–F5) |
| 299 | ### สิ่งที่ทำ |
| 313 | ### การตัดสินใจระหว่างทาง |
| 323 | ### verify ที่รันจริง |
| 327 | ### จุดที่คนถัดไปควรรู้ |
| 335 | ## Phase 6.1 — Report Framework + Export Engine |
| 339 | ### สิ่งที่ทำ |
| 352 | ### การตัดสินใจระหว่างทาง (คนถัดไปควรรู้) |
| 363 | ### เทสต์ |
| 372 | ### ⚠️ ค้างฝั่ง environment |
| 378 | ## Phase 5.3 — Background Job Engine + Handlers + Job Log |
| 382 | ### สิ่งที่ทำ |
| 396 | ### การตัดสินใจระหว่างทาง (คนถัดไปควรรู้) |
| 407 | ### เทสต์ |
| 414 | ### ค้างไว้ให้คนถัดไป / ต้องทำนอกโค้ด |
| 422 | ## Phase 5.2 — Event Wiring ทุกโมดูล + Audit Log UI |
| 426 | ### สิ่งที่ทำ — ก้อนที่ 1: ต่อ event เข้าการแจ้งเตือน (`90` §6.3) |
| 450 | ### สิ่งที่ทำ — ก้อนที่ 2: หน้าบันทึกการใช้งาน (Audit Log UI — `90` §8/§12/§14) |
| 458 | ### การตัดสินใจระหว่างทาง |
| 468 | ### verify ที่รันจริง |
| 472 | ### จุดที่คนถัดไปควรรู้ |
| 481 | ## Phase 5.1 — Notification Service + Notification Center |
| 485 | ### สิ่งที่ทำ |
| 496 | ### การตัดสินใจระหว่างทาง |
| 504 | ### จุดที่คนถัดไปควรรู้ |
| 513 | ## Phase 4.7 — Accounting Frontend ที่เหลือ (shell + periods + exceptions + sales/recei... |
| 517 | ### สิ่งที่ทำ |
| 530 | ### การตัดสินใจระหว่างทาง |
| 540 | ### จุดที่คนถัดไปควรรู้ |
| 549 | ## Phase 4.6 — Accounting Pack Export (37) |
| 553 | ### สิ่งที่ทำ |
| 566 | ### การตัดสินใจระหว่างทาง |
| 577 | ### จุดที่คนถัดไปควรรู้ |
| 587 | ## Phase 4.5 — WHT Data (33) + ใบ 50 ทวิ PDF |
| 591 | ### สิ่งที่ทำ |
| 603 | ### การตัดสินใจระหว่างทาง |
| 611 | ### จุดที่คนถัดไปควรรู้ |
| 620 | ## Phase 4.4 — Accounting Expenses (32) + Accountant Questions (36) |
| 624 | ### สิ่งที่ทำ |
| 636 | ### การตัดสินใจระหว่างทาง (ยึด schema `02` เป็นหลัก — ตระกูลเดียวกับ D13) |
| 645 | ### จุดที่คนถัดไปควรรู้ |
| 655 | ## Phase 4.3 — Sales & Receipts + Tax Invoice + PDF (31) |
| 659 | ### สิ่งที่ทำ |
| 670 | ### การตัดสินใจระหว่างทาง (ยึด schema `02` เป็นหลัก) |
| 679 | ### จุดที่คนถัดไปควรรู้ |
| 689 | ## Phase 4.2 — Bank Reconciliation (35) |
| 693 | ### สิ่งที่ทำ |
| 704 | ### การตัดสินใจระหว่างทาง (ยึด schema `02` เป็นหลัก) |
| 714 | ### จุดที่คนถัดไปควรรู้ |
| 723 | ## Phase 4.1 — Exceptions (34) + Accounting Period / Readiness / Lock Guard (30) |
| 727 | ### สิ่งที่ทำ |
| 737 | ### การตัดสินใจระหว่างทาง (ยึด schema `02` เป็นหลักตาม Q4) |
| 745 | ### จุดที่คนถัดไปควรรู้ |
| 754 | ## Phase 3.8 — Profitability Report (21) + Finance Dashboard (14) — ปิด Phase 3 |
| 758 | ### สิ่งที่ทำ |
| 770 | ### การตัดสินใจระหว่างทาง |
| 780 | ### จุดที่คนถัดไปควรรู้ |
| 789 | ## Phase 3.7 — Billing FE (19 §8) + Adjustment ทั้งโมดูล (20) |
| 793 | ### สิ่งที่ทำ |
| 806 | ### การตัดสินใจระหว่างทาง |
| 816 | ### จุดที่คนถัดไปควรรู้ |
| 824 | ## Phase 3.6 — Revenue / Billing / AR Backend (19) |
| 828 | ### สิ่งที่ทำ |
| 839 | ### การตัดสินใจระหว่างทาง |
| 848 | ### จุดที่คนถัดไปควรรู้ |
| 857 | ## Phase 3.5 — Payout FE (17 §8) + เอกสารภายใน 3 ใบ (28 §6.1) |
| 861 | ### สิ่งที่ทำ |
| 871 | ### การตัดสินใจระหว่างทาง |
| 879 | ### จุดที่คนถัดไปควรรู้ |
| 888 | ## Phase 3.4 — Payout Batch Backend (17) + แท็บเงินทดรองจ่าย (15) |
| 892 | ### สิ่งที่ทำ |
| 903 | ### การตัดสินใจระหว่างทาง |
| 912 | ### จุดที่คนถัดไปควรรู้ |
| 921 | ## Phase 3.3 — Compensation Approval FE (16) + Claims & Advances (15) |
| 925 | ### สิ่งที่ทำ |
| 935 | ### การตัดสินใจระหว่างทาง |
| 945 | ### จุดที่คนถัดไปควรรู้ |
| 953 | ## Phase 3.2 — Payee & Tax Profile (18) + Compensation Approval Backend (16) |
| 957 | ### สิ่งที่ทำ |
| 970 | ### การตัดสินใจระหว่างทาง |
| 980 | ### จุดที่คนถัดไปควรรู้ |
| 989 | ## Phase 3.1 — Pure Finance Calculation Modules + Unit Tests (ไฟล์ 22 ครบ 13 สูตร) |
| 993 | ### สิ่งที่ทำ |
| 1009 | ### การตัดสินใจระหว่างทาง |
| 1018 | ### จุดที่คนถัดไปควรรู้ |
| 1025 | ## Phase 2.15 — Warehouse Frontend ชุดที่ 2 (ส่งมอบ + แนบเอกสาร · ไฟล์ 44 §8.4–8.5) |
| 1029 | ### สิ่งที่ทำ |
| 1041 | ### การตัดสินใจระหว่างทาง |
| 1050 | ### verify ที่รันจริง |
| 1053 | ### จุดที่คนถัดไปควรรู้ |
| 1061 | ## Phase 2.14 — Warehouse Frontend ชุดที่ 1 (รับเข้าคลัง + ในคลัง · ไฟล์ 44 §8.1–8.3) |
| 1065 | ### สิ่งที่ทำ |
| 1077 | ### การตัดสินใจระหว่างทาง |
| 1086 | ### verify ที่รันจริง |
| 1089 | ### จุดที่คนถัดไปควรรู้ |
| 1096 | ## Phase 2.13 — Warehouse Backend (คลังสินค้า + ส่งมอบ · ไฟล์ 44) |
| 1100 | ### สิ่งที่ทำ |
| 1112 | ### การตัดสินใจระหว่างทาง |
| 1120 | ### verify ที่รันจริง |
| 1123 | ### จุดที่คนถัดไปควรรู้ |
| 1131 | ## Phase 2.12 — Field Tracker Frontend ชุดที่ 3 (เบิกเงิน + รายได้ + จบงาน + PWA) |
| 1135 | ### สิ่งที่ทำ |
| 1153 | ### การตัดสินใจระหว่างทาง |
| 1161 | ### verify ที่รันจริง |
| 1164 | ### จุดที่คนถัดไปควรรู้ |
| 1173 | ## Phase 2.11 — Field Tracker Frontend ชุดที่ 2 (ฟอร์มปิดงาน + คำขอเปลี่ยนผู้รับผิดชอบ) |
| 1177 | ### สิ่งที่ทำ |
| 1189 | ### การตัดสินใจระหว่างทาง |
| 1196 | ### verify ที่รันจริง |
| 1199 | ### จุดที่คนถัดไปควรรู้ |
| 1207 | ## Phase 2.10 — Field Tracker Frontend ชุดที่ 1 (shell + case detail + งานรายวัน + ปฏิทิน) |
| 1211 | ### สิ่งที่ทำ |
| 1224 | ### การตัดสินใจระหว่างทาง |
| 1231 | ### verify ที่รันจริง |
| 1234 | ### จุดที่คนถัดไปควรรู้ |
| 1242 | ## Phase 2.9 — Field Tracker Backend ชุดที่ 2 (เงิน + ตีกลับ + push — ไฟล์ 41) |
| 1246 | ### มติ PO ที่ปลดล็อกงานนี้ (ตอบ `[[NEEDS_DECISION]]` ตอนเริ่ม task) |
| 1251 | ### สิ่งที่ทำ |
| 1257 | ### DoD ที่พิสูจน์แล้ว (`lib/field/field-expense.db.test.ts`) |
| 1265 | ### ตัดสินใจเชิงเทคนิคที่ควรรู้ |
| 1273 | ### ค้าง/ต้องทำต่อ |
| 1281 | ## Phase 2.8 — Field Tracker Backend ชุดที่ 1 (core flow — ไฟล์ 41) |
| 1285 | ### สิ่งที่ทำ |
| 1294 | ### การตัดสินใจระหว่างทาง |
| 1304 | ### จุดที่คนถัดไปควรรู้ |
| 1310 | ### verify ที่รันจริง |
| 1315 | ## Phase 2.7 — Case Assignment Frontend (ไฟล์ 40) |
| 1319 | ### สิ่งที่ทำ |
| 1330 | ### การตัดสินใจระหว่างทาง |
| 1337 | ### จุดที่คนถัดไปควรรู้ |
| 1343 | ### verify ที่รันจริง |
| 1348 | ## Phase 2.6 — Case Assignment Backend (ไฟล์ 40) |
| 1352 | ### สิ่งที่ทำ |
| 1363 | ### การตัดสินใจระหว่างทาง |
| 1371 | ### จุดที่คนถัดไปควรรู้ |
| 1378 | ### verify ที่รันจริง |
| 1383 | ## Phase 2.5 — Case Submission FE ชุด 2 (เอกสาร + ทีมที่เสนอ + review modal + import) |
| 1387 | ### สิ่งที่ทำ |
| 1398 | ### การตัดสินใจระหว่างทาง |
| 1405 | ### จุดที่คนถัดไปควรรู้ |
| 1413 | ## Phase 2.4 — Case Submission FE ชุด 1 (list + form + address component) |
| 1417 | ### สิ่งที่ทำ |
| 1427 | ### การตัดสินใจระหว่างทาง |
| 1435 | ### จุดที่คนถัดไปควรรู้ |
| 1443 | ## Phase 2.3 — Case Submission BE ชุด 2 (state machine + routing + recycle + import + s... |
| 1447 | ### สิ่งที่ทำ |
| 1457 | ### การตัดสินใจระหว่างทาง |
| 1466 | ### จุดที่คนถัดไปควรรู้ |
| 1474 | ## Phase 2.2 — Case Submission BE ชุด 1 (schema + CRUD + เอกสาร) |
| 1478 | ### สิ่งที่ทำ |
| 1487 | ### การตัดสินใจระหว่างทาง (ไม่มีข้อไหนขัดสเปค — บันทึกไว้ให้ตรวจย้อนได้) |
| 1497 | ### จุดที่คนถัดไปควรรู้ |
| 1506 | ## Phase 2.1 — API Contract Infra (ไฟล์ 45): 39 endpoints + event registry + envelope +... |
| 1510 | ### สิ่งที่ทำ |
| 1520 | ### ส่วนต่างชื่อ event ระหว่าง `45` §7 กับไฟล์ต้นทาง (ตาม PLAN §2.1 — บันทึกไว้ ห้ามเงียบ) |
| 1533 | ### การตัดสินใจระหว่างทาง |
| 1542 | ### verify ที่รันจริง |
| 1547 | ### จุดที่คนถัดไปควรรู้ |
| 1556 | ## Phase 1.12 — Settings FE ชุดที่ 2: 8 แท็บที่เหลือ (ไฟล์ 13 §6.4/6.5/6.7/6.9/6.10/6.1... |
| 1560 | ### สิ่งที่ทำ |
| 1572 | ### การตัดสินใจระหว่างทาง |
| 1579 | ### ความครบตาม Test Cases `13` §15 (ตรวจก่อนปิด task) |
| 1589 | ### จุดที่คนถัดไปควรรู้ |
| 1598 | ## Phase 1.11 — Settings FE ชุดที่ 1: shell 13 แท็บ + 5 แท็บแรก (ไฟล์ 13) |
| 1602 | ### สิ่งที่ทำ |
| 1610 | ### การตัดสินใจระหว่างทาง |
| 1617 | ### จุดที่คนถัดไปควรรู้ |
| 1627 | ## Phase 1.10 — Settings ไฟล์ 13: Backend ครบ 13 หมวด |
| 1631 | ### สิ่งที่ทำ |
| 1641 | ### การตัดสินใจระหว่างทาง (ยึด `02` เหนือ spec module ตามลำดับความสำคัญเอกสาร) |
| 1651 | ### จุดที่คนถัดไปควรรู้ |
| 1662 | ## Phase 1.9 — Users (08) + flow เชิญ/ตั้งรหัสผ่านครั้งแรก (ปิด D1) |
| 1666 | ### สิ่งที่ทำ |
| 1684 | ### การตัดสินใจระหว่างทาง |
| 1693 | ### จุดที่คนถัดไปควรรู้ |
| 1702 | ## Phase 1.8 — Teams (09) + Finance Companies (10) |
| 1706 | ### สิ่งที่ทำ |
| 1722 | ### การตัดสินใจระหว่างทาง |
| 1733 | ### จุดที่คนถัดไปควรรู้ |
| 1743 | ## Phase 1.7 — Compensation Plans (11) + Service Fee Templates (12) |
| 1747 | ### สิ่งที่ทำ |
| 1764 | ### การตัดสินใจระหว่างทาง |
| 1775 | ### จุดที่คนถัดไปควรรู้ |
| 1785 | ## Phase 1.6 — Roles & Permissions module |
| 1789 | ### สิ่งที่ทำ |
| 1806 | ### การตัดสินใจระหว่างทาง |
| 1815 | ### verify ที่รันจริง (DoD ของ PLAN §1.6) |
| 1819 | ### จุดที่คนถัดไปควรรู้ |
| 1828 | ## Phase 1.5 — UI Kit + App Shell + Navigation |
| 1832 | ### สิ่งที่ทำ |
| 1845 | ### การตัดสินใจระหว่างทาง |
| 1855 | ### verify ที่รันจริง (DoD ของ PLAN §1.5) |
| 1859 | ### จุดที่คนถัดไปควรรู้ |
| 1870 | ## Phase 1.4 — Audit Core Service (immutable) |
| 1874 | ### สิ่งที่ทำ |
| 1884 | ### การตัดสินใจระหว่างทาง |
| 1892 | ### verify ที่รันจริง (DoD ของ PLAN §1.4) |
| 1898 | ### จุดที่คนถัดไปควรรู้ |
| 1907 | ## Phase 1.3 — Auth & Access Control + Permission Middleware |
| 1911 | ### สิ่งที่ทำ |
| 1922 | ### การตัดสินใจระหว่างทาง |
| 1931 | ### verify ที่รันจริง (DoD ของ PLAN §1.3) |
| 1938 | ### จุดที่คนถัดไปควรรู้ |
| 1948 | ## Phase 1.2 — Prisma Schema ชุดที่ 2: Group C–G + Seed Data |
| 1952 | ### สิ่งที่ทำ |
| 1959 | ### สิ่งที่เพิ่มจากมติ PO (นอกเหนือ spec เดิม) |
| 1968 | ### การตัดสินใจระหว่างทาง |
| 1976 | ### verify ที่รันจริง (DoD ของ PLAN §1.2) |
| 1983 | ### จุดที่คนถัดไปควรรู้ |
| 1991 | ## Phase 1.1 — Prisma Schema ชุดที่ 1: Enums + Group A + Group B |
| 1995 | ### สิ่งที่ทำ |
| 2004 | ### คอลัมน์ที่เพิ่มจากมติ PO (นอกเหนือ spec เดิม — เฉพาะที่ตกอยู่ใน Group B) |
| 2013 | ### บั๊ก/กับดักที่เจอระหว่างทาง |
| 2019 | ### verify ที่รันจริง (DoD ของ PLAN §1.1) |
| 2026 | ### จุดที่คนถัดไปควรรู้ |
| 2035 | ## Phase 0.3 — Adapt Orchestrator + Dev Panel เข้าโปรเจกต์นี้ |
| 2039 | ### สิ่งที่ทำ (adapt ตาม `promptmovetools.md` — ไม่เขียนใหม่ ไม่แตะ logic ที่มี comment... |
| 2051 | ### การตัดสินใจเอง (ต้องรายงานตาม DoD ข้อ 7) |
| 2058 | ### verify ที่รันจริง (DoD 7 ข้อของ promptmovetools) |
| 2069 | ### จุดที่คนถัดไปควรรู้ |
| 2077 | ## Phase 0.2 — Deploy pipeline ฝั่ง Staging |
| 2081 | ### สิ่งที่ทำ (ฝั่ง repo) |
| 2088 | ### สิ่งที่ทำ (ฝั่ง PO — นอก repo) |
| 2092 | ### บั๊กที่เจอและแก้ (สำคัญ — อย่าให้เกิดซ้ำ) |
| 2099 | ### verify ที่รันจริง |
| 2102 | ### จุดที่คนถัดไปควรรู้ — **ยังค้าง 2 อย่างฝั่ง Vercel UI (session อัตโนมัติทำแทนไม่ได้)** |
| 2111 | ## Phase 0.1 — Bootstrap โปรเจกต์ Next.js + โครงสร้าง + CI |
| 2115 | ### สิ่งที่ทำ |
| 2124 | ### การตัดสินใจระหว่างทาง (ไม่ใช่ระดับ DEC — เป็นรายละเอียดเชิงเครื่องมือ ไม่กระทบ tech... |
| 2134 | ### verify ที่รันจริง |
| 2137 | ### จุดที่คนถัดไปควรรู้ |

### `docs/QUESTIONS-FOR-ACCOUNTANT.md` (18 KB, 108 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # คำถามสำหรับนักบัญชี / สำนักงานบัญชี |
| 9 | ## ส่วนที่ 1 — 🟡 ต้องตอบ / ยืนยัน |
| 11 | ### ภาษีหัก ณ ที่จ่าย (ที่เราหักผู้รับเงิน — พนักงานภาคสนาม/ทีม outsource) |
| 28 | ### รายได้ / ใบกำกับภาษี (ที่เราเก็บเงินบริษัทไฟแนนซ์) |
| 47 | ### การส่งมอบข้อมูลให้สำนักงานบัญชี |
| 81 | ## ส่วนที่ 2 — ⚙️ ตั้งค่าได้ในระบบแล้ว (ขอแค่ค่าที่ต้องกรอกตอนเริ่มใช้) |
| 96 | ## ส่วนที่ 3 — 🔵 ฟีเจอร์เพิ่ม (ทำเมื่อยืนยันว่าต้องการ) |
| 103 | ## หมายเหตุ — ข้อที่ไม่ต้องถามแล้ว |

### `docs/README.md` (18 KB, 259 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # AssetRecovery — Build Specification Index |
| 8 | ## แหล่งอ้างอิงหลัก |
| 23 | ## Tech Stack (ตัดสินใจแล้วทั้งหมด — ห้ามเปลี่ยนโดยไม่มี Decision Log) |
| 43 | ## ภาพรวมระบบ |
| 47 | ### Hybrid Accounting Boundary |
| 62 | ## Modules & HTML Mockups |
| 78 | ## File Index |
| 80 | ### 🏗️ Foundation & Platform |
| 98 | ### ⚙️ Settings Module (ไฟล์ 07–13) |
| 110 | ### 💰 Finance Module (ไฟล์ 14–21) |
| 123 | ### 💰 Finance Reference (ไฟล์ 22–29) |
| 136 | ### 📋 Accounting Module (ไฟล์ 30–37) |
| 149 | ### 📦 Case & Field Operations (ไฟล์ 38–44) |
| 161 | ### 📊 Reports (ไฟล์ 96) |
| 167 | ### 🌐 Client Portal (ไฟล์ 97) |
| 175 | ### 📋 Decision & Planning Documents |
| 184 | ## Datetime Standard (บังคับทุก module) |
| 205 | ## Database Conventions |
| 219 | ## Key Business Rules (สรุปจุดสำคัญ) |
| 241 | ## Open Items — รอยืนยันจากภายนอก |
| 243 | ### 🟡 รอนักบัญชี (ดู `QUESTIONS-FOR-ACCOUNTANT.md`) — มีเมนูตั้งค่ารองรับแล้ว ไม่บล็อก ... |
| 249 | ### 🟡 รอ Product Owner (ดู `DECISIONS-NEEDED.md`) |
| 254 | ### 🟢 เฟส 2 (ออกแบบแล้ว ยังไม่ implement) |

### `docs/REUSE_INDEX.md` (436 KB, 682 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # REUSE_INDEX.md — ของที่มีแล้ว / แม่แบบ / กับดัก (เช็คก่อนเขียนโค้ดใหม่ทุกครั้ง) |
| 5 | ## Shared Components (Frontend) |
| 89 | ## Shared Services / Utils (Backend) |
| 596 | ## กับดัก (Lessons Learned) |

### `docs/implementation-todo.md` (16 KB, 184 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # implementation-todo.md |
| 3 | # 99 — Implementation Todo List (ทีละขั้นตอน) |
| 4 | ## AssetRecovery — ลำดับงานตั้งแต่ตั้งค่า Infra จนถึงเริ่มโมดูลแรก |
| 12 | ## Phase 0 — Infrastructure Setup (ก่อนมีโค้ดบรรทัดแรก) |
| 14 | ### 0.1 GitHub Repository |
| 22 | ### 0.2 Next.js Project Bootstrap |
| 37 | ### 0.3 Environment Variables แยก Staging/Production |
| 43 | ### 0.4 Domain Mapping |
| 48 | ### 0.5 CI Pipeline พื้นฐาน (GitHub Actions) |
| 52 | ### 0.6 Verify Pipeline ทำงานจริง |
| 61 | ## Phase 1 — Foundation Modules (ตามลำดับ dependency) |
| 65 | ### 1.0 Database Seeding (Master Data) — ทำก่อน Auth เสมอ |
| 76 | ### 1.1 Auth & Access Control (ไฟล์ 05) |
| 83 | ### 1.2 Roles & Permissions Matrix (ไฟล์ 07) |
| 89 | ### 1.3 Settings / Master Data (ไฟล์ 08–13) — ทำทีละไฟล์ย่อยตามลำดับ |
| 103 | ## Phase 2 — Case & Field Operations (ไฟล์ 38, 40, 41, 44) |
| 113 | ## Phase 3 — Finance Module (ไฟล์ 14–21) |
| 128 | ## Phase 4 — Accounting Module (ไฟล์ 30–37) |
| 143 | ## Phase 5 — Platform Services (ไฟล์ 90–92) |
| 152 | ## Phase 6 — Reports (ไฟล์ 96) |
| 160 | ## Phase 7 — Client Portal (ไฟล์ 97) ✅ Phase ยืนยันแล้ว — เป็นส่วนหนึ่งของ Phase 1 (rel... |
| 173 | ## หมายเหตุการทำงานร่วมกันทุก Phase |


### ไฟล์เล็กใน docs/ (< 15KB — อ่านทั้งไฟล์ได้ ไม่ทำตาราง heading)

| ไฟล์ | ขนาด | บรรทัด | เวอร์ชัน |
|---|---|---|---|
| `docs/00-project-overview.md` | 12 KB | 168 | v2 |
| `docs/00_INDEX.md` | 11 KB | 127 | - |
| `docs/03_PRODUCTION_CHECKLIST.md` | 8 KB | 69 | - |
| `docs/14-finance-dashboard.md` | 8 KB | 133 | v2 |
| `docs/21-profitability-report.md` | 12 KB | 133 | v3 |
| `docs/26-finance-data-model.md` | 9 KB | 117 | v2 |
| `docs/29-finance-acceptance-tests.md` | 11 KB | 133 | v2 |
| `docs/32-accounting-expenses-payments.md` | 10 KB | 147 | v2 |
| `docs/36-accountant-questions.md` | 7 KB | 125 | v2 |
| `docs/92-platform-data-model.md` | 14 KB | 191 | v2 |
| `docs/DECISIONS-NEEDED.md` | 11 KB | 126 | - |
| `docs/tool-register.md` | 8 KB | 73 | - |


---

## ส่วนที่ 2 — UI Mockups (reference/)

> mockup เป็น UI source of truth (โครงหน้าจอ/Tailwind pattern/ข้อมูลตัวอย่าง) — **ห้ามอ้าง business logic จาก mockup** ให้ยึด spec `.md` เสมอ
> ตารางนี้ชี้บรรทัดของ JavaScript function หลักในแต่ละไฟล์ — ใช้ Grep หา render function ที่ต้องการก่อน แล้ว Read เฉพาะช่วง


### `reference/38-case-submission-mockup.html` (94 KB, 1104 บรรทัด)

| บรรทัด | function |
|---|---|
| 28 | `actionTimes` |
| 49 | `getDistricts` |
| 50 | `getSubDistricts` |
| 118 | `setState` |
| 119 | `openModal` |
| 120 | `closeModal` |
| 121 | `showToast` |
| 122 | `money` |
| 125 | `getCompanyByName` |
| 126 | `calcProjectedRevenue` |
| 137 | `feeModelLabel` |
| 142 | `getTeamByName` |
| 143 | `renderTeamCostBox` |
| 164 | `statusBadge` |
| 176 | `fieldStatusBadge` |
| 186 | `sourceBadge` |
| 191 | `btnAction` |
| 194 | `formInput` |
| 197 | `formSelect` |
| 202 | `renderAddressBlock` |
| 251 | `onProvinceChange` |
| 259 | `onDistrictChange` |
| 264 | `updateTeamSuggestion` |
| 273 | `onNationalityChange` |
| 287 | `renderPhotoUploader` |
| 303 | `renderPhotoThumbnails` |
| 310 | `handlePhotoFiles` |
| 322 | `handlePhotoDrop` |
| 323 | `handlePhotoSelect` |
| 324 | `removePhoto` |
| 325 | `refreshPhotoUI` |
| 346 | `renderTopNav` |
| 370 | `kpi` |
| 376 | `renderCaseList` |
| 466 | `canEditCase` |
| 470 | `docChip` |
| 472 | `have` |
| 480 | `renderCaseRow` |
| 511 | `renderCaseCard` |
| 542 | `renderCreateCaseModal` |
| 545 | `v` |
| 678 | `renderContactPersonRow` |
| 693 | `renderReviewModal` |
| 698 | `fileRow` |
| 817 | `viewFile` |
| 824 | `renderTeamSelectionSection` |
| 877 | `refreshTeamSection` |
| 883 | `toggleShowAllTeams` |
| 889 | `selectTeamChange` |
| 894 | `cancelTeamChange` |
| 900 | `confirmTeamChange` |
| 919 | `renderModal` |
| 1010 | `renderToast` |
| 1017 | `render` |
| 1028 | `updateFilter` |

### `reference/40-case-assignment-mockup.html` (69 KB, 1065 บรรทัด)

| บรรทัด | function |
|---|---|
| 240 | `setState` |
| 241 | `showToast` |
| 246 | `money` |
| 249 | `getTeam` |
| 250 | `getAgent` |
| 251 | `getCase` |
| 252 | `currentUser` |
| 254 | `filteredCases` |
| 267 | `kpiCounts` |
| 277 | `myPendingAccept` |
| 281 | `myPendingConsent` |
| 311 | `statusBadge` |
| 324 | `teamBadge` |
| 331 | `agentName` |
| 337 | `assignedInfo` |
| 347 | `doAssign` |
| 361 | `doReassign` |
| 388 | `doAccept` |
| 396 | `doConsent` |
| 407 | `doDecline` |
| 417 | `renderNav` |
| 449 | `renderKPI` |
| 472 | `renderToolbar` |
| 500 | `renderCaseTable` |
| 577 | `renderKanban` |
| 678 | `renderAgentView` |
| 760 | `renderCaseDetailSection` |
| 839 | `renderAgentPicker` |
| 894 | `toggleAgentExpand` |
| 901 | `openModal` |
| 904 | `closeModal` |
| 906 | `renderModal` |
| 1020 | `renderToast` |
| 1031 | `render` |
| 1055 | `switchRole` |

### `reference/41-field-tracker-desktop-mockup.html` (136 KB, 1842 บรรทัด)

| บรรทัด | function |
|---|---|
| 111 | `toBKK` |
| 114 | `fmtDate` |
| 118 | `fmtDateTime` |
| 122 | `nowDate` |
| 123 | `nowDateTime` |
| 143 | `setState` |
| 144 | `showToast` |
| 149 | `money` |
| 150 | `openModal` |
| 188 | `closeModal` |
| 189 | `myCases` |
| 190 | `myPendingReassignments` |
| 191 | `myUnseenPendingReassignments` |
| 192 | `teammateName` |
| 227 | `statusBadge` |
| 240 | `expenseStatusBadge` |
| 254 | `renderSidebar` |
| 259 | `navItem` |
| 296 | `renderPageHeader` |
| 301 | `renderDashboard` |
| 432 | `renderPendingAcceptTab` |
| 459 | `renderUnscheduledTab` |
| 477 | `renderMyUnscheduledList` |
| 493 | `renderTeamUnscheduledList` |
| 519 | `renderScheduledTab` |
| 578 | `formatDateTH` |
| 587 | `formatDDMMYYYY` |
| 592 | `onDragStart` |
| 593 | `onDropReorder` |
| 610 | `renderClosedTab` |
| 619 | `monthLabel` |
| 667 | `renderEmptyState` |
| 677 | `renderCaseFullDetailBody` |
| 679 | `fileRow` |
| 684 | `addressBlock` |
| 776 | `renderCaseDetailModal` |
| 785 | `viewFile` |
| 791 | `acceptCase` |
| 800 | `renderPickDateModal` |
| 825 | `renderDayClickPopup` |
| 856 | `confirmScheduleFromPopup` |
| 862 | `renderCalendarGrid` |
| 907 | `changeCalendarMonth` |
| 916 | `scheduleCase` |
| 927 | `renderCloseCaseModal` |
| 963 | `renderTravelOriginSection` |
| 993 | `selectOutcome` |
| 999 | `renderEvidenceSection` |
| 1092 | `evidenceButton` |
| 1101 | `captureEvidence` |
| 1109 | `addCheckin` |
| 1124 | `removeCheckin` |
| 1132 | `setTravelOrigin` |
| 1145 | `adjustTravelOrigin` |
| 1161 | `haversineKm` |
| 1163 | `dLat` |
| 1164 | `dLng` |
| 1169 | `calculateTravelDistanceKm` |
| 1179 | `addMedia` |
| 1188 | `removeMedia` |
| 1195 | `saveDraftSilently` |
| 1202 | `saveDraftAndClose` |
| 1208 | `submitCloseCase` |
| 1262 | `resubmitCloseCase` |
| 1308 | `renderExpensePage` |
| 1340 | `renderCaseBoundExpenseTab` |
| 1405 | `renderSeparateExpenseTab` |
| 1412 | `monthLabel` |
| 1453 | `parseThaiDateToYearMonth2` |
| 1462 | `parseThaiDateToYearMonth` |
| 1469 | `renderIncomeSummaryPage` |
| 1483 | `monthLabel` |
| 1535 | `renderHotelClaimModal` |
| 1601 | `submitHotelClaim` |
| 1614 | `renderModal` |
| 1648 | `renderToast` |
| 1655 | `renderReassignmentAutoPopup` |
| 1684 | `dismissReassignmentPopup` |
| 1691 | `renderReassignmentResponseModal` |
| 1729 | `submitConsentReassignment` |
| 1746 | `submitDeclineReassignment` |
| 1762 | `checkAndAutoResolveReassignments` |
| 1786 | `parseThaiDateTimeToDate` |
| 1795 | `checkAndApplyQcActions` |
| 1814 | `render` |

### `reference/41-field-tracker-mobile-mockup.html` (141 KB, 1902 บรรทัด)

| บรรทัด | function |
|---|---|
| 111 | `toBKK` |
| 114 | `fmtDate` |
| 118 | `fmtDateTime` |
| 122 | `nowDate` |
| 123 | `nowDateTime` |
| 144 | `setState` |
| 145 | `showToast` |
| 150 | `money` |
| 151 | `openModal` |
| 189 | `closeModal` |
| 190 | `myCases` |
| 191 | `myPendingReassignments` |
| 192 | `myUnseenPendingReassignments` |
| 193 | `teammateName` |
| 228 | `statusBadge` |
| 241 | `expenseStatusBadge` |
| 255 | `renderTopBar` |
| 271 | `renderBottomNav` |
| 294 | `renderHamburgerMenu` |
| 300 | `menuItem` |
| 356 | `renderDashboard` |
| 496 | `renderPendingAcceptTab` |
| 520 | `renderUnscheduledTab` |
| 538 | `renderMyUnscheduledList` |
| 554 | `renderTeamUnscheduledList` |
| 580 | `renderScheduledTab` |
| 639 | `formatDateTH` |
| 648 | `formatDDMMYYYY` |
| 653 | `onDragStart` |
| 654 | `onDropReorder` |
| 671 | `renderClosedTab` |
| 680 | `monthLabel` |
| 723 | `renderEmptyState` |
| 733 | `renderCaseFullDetailBody` |
| 735 | `fileRow` |
| 740 | `addressBlock` |
| 832 | `renderCaseDetailModal` |
| 841 | `viewFile` |
| 847 | `acceptCase` |
| 856 | `renderPickDateModal` |
| 881 | `renderDayClickPopup` |
| 912 | `confirmScheduleFromPopup` |
| 918 | `renderCalendarGrid` |
| 963 | `changeCalendarMonth` |
| 972 | `scheduleCase` |
| 983 | `renderCloseCaseModal` |
| 1019 | `renderTravelOriginSection` |
| 1049 | `selectOutcome` |
| 1055 | `renderEvidenceSection` |
| 1148 | `evidenceButton` |
| 1157 | `captureEvidence` |
| 1165 | `addCheckin` |
| 1180 | `removeCheckin` |
| 1188 | `setTravelOrigin` |
| 1201 | `adjustTravelOrigin` |
| 1217 | `haversineKm` |
| 1219 | `dLat` |
| 1220 | `dLng` |
| 1225 | `calculateTravelDistanceKm` |
| 1235 | `addMedia` |
| 1244 | `removeMedia` |
| 1251 | `saveDraftSilently` |
| 1258 | `saveDraftAndClose` |
| 1264 | `submitCloseCase` |
| 1318 | `resubmitCloseCase` |
| 1364 | `renderExpenseModal` |
| 1396 | `renderCaseBoundExpenseTab` |
| 1461 | `renderSeparateExpenseTab` |
| 1468 | `monthLabel` |
| 1509 | `parseThaiDateToYearMonth2` |
| 1518 | `parseThaiDateToYearMonth` |
| 1525 | `renderIncomeSummaryModal` |
| 1540 | `monthLabel` |
| 1591 | `renderHotelClaimModal` |
| 1657 | `submitHotelClaim` |
| 1670 | `renderModal` |
| 1710 | `renderToast` |
| 1718 | `renderReassignmentAutoPopup` |
| 1748 | `dismissReassignmentPopup` |
| 1755 | `renderReassignmentResponseModal` |
| 1793 | `submitConsentReassignment` |
| 1810 | `submitDeclineReassignment` |
| 1826 | `checkAndAutoResolveReassignments` |
| 1850 | `parseThaiDateTimeToDate` |
| 1859 | `checkAndApplyQcActions` |
| 1877 | `render` |

### `reference/97-client-portal-mobile-mockup.html` (58 KB, 683 บรรทัด)

| บรรทัด | function |
|---|---|
| 40 | `toBKK` |
| 41 | `fmtDate` |
| 42 | `nowDate` |
| 43 | `money` |
| 109 | `setState` |
| 110 | `showToast` |
| 115 | `caseStatusInfo` |
| 126 | `billingStatusInfo` |
| 130 | `invoiceStatusInfo` |
| 131 | `lotStatusInfo` |
| 135 | `conditionInfo` |
| 140 | `findAssetByCaseRef` |
| 147 | `badge` |
| 173 | `renderHeader` |
| 190 | `renderHamburger` |
| 228 | `renderBottomNav` |
| 249 | `kpiSm` |
| 257 | `sectionHeader` |
| 270 | `renderDashboard` |
| 343 | `barChartSm` |
| 356 | `caseCard` |
| 368 | `renderCases` |
| 393 | `renderFinance` |
| 453 | `renderHandover` |
| 487 | `renderProfile` |
| 489 | `row` |
| 511 | `renderDrawer` |
| 603 | `renderAssetDetailDrawer` |
| 607 | `a` |
| 658 | `renderToastEl` |
| 666 | `render` |

### `reference/97-client-portal-mockup.html` (62 KB, 699 บรรทัด)

| บรรทัด | function |
|---|---|
| 36 | `toBKK` |
| 37 | `fmtDate` |
| 38 | `nowDate` |
| 39 | `money` |
| 111 | `S` |
| 112 | `showToast` |
| 117 | `caseStatusInfo` |
| 128 | `billingStatusInfo` |
| 137 | `invoiceStatusInfo` |
| 140 | `lotStatusInfo` |
| 149 | `conditionInfo` |
| 155 | `findAssetByCaseRef` |
| 162 | `badge` |
| 196 | `layout` |
| 238 | `kpi` |
| 246 | `pageHeader` |
| 250 | `sectionHeader` |
| 263 | `renderDashboard` |
| 353 | `renderCases` |
| 392 | `renderBilling` |
| 437 | `renderInvoices` |
| 464 | `renderHandover` |
| 500 | `barChart` |
| 514 | `renderProfile` |
| 516 | `row` |
| 537 | `renderModal` |
| 668 | `renderToast` |
| 676 | `render` |

### `reference/accounting.html` (158 KB, 1921 บรรทัด)

| บรรทัด | function |
|---|---|
| 32 | `toBKK` |
| 33 | `fmtDate` |
| 34 | `fmtDateTime` |
| 35 | `nowDate` |
| 36 | `nowDateTime` |
| 152 | `setState` |
| 153 | `openModal` |
| 154 | `closeModal` |
| 155 | `showToast` |
| 161 | `money` |
| 236 | `statusBadge` |
| 242 | `btnAction` |
| 248 | `formInput` |
| 251 | `formSelect` |
| 254 | `formTextarea` |
| 259 | `renderTopNav` |
| 289 | `renderAccountingOperations` |
| 895 | `renderModal` |
| 1709 | `renderToast` |
| 1726 | `renderAccountingSubNav` |
| 1764 | `renderDocumentSamples` |
| 1765 | `row` |
| 1766 | `card` |
| 1805 | `renderSampleViewer` |
| 1835 | `render` |

### `reference/app-shell.html` (18 KB, 335 บรรทัด)

| บรรทัด | function |
|---|---|
| 156 | `getQueryParam` |
| 167 | `init` |
| 181 | `cfg` |
| 183 | `setMainTab` |
| 192 | `setCaseSubTab` |
| 198 | `toggleFieldView` |
| 203 | `currentIframeSrc` |
| 215 | `renderTopNav` |
| 253 | `renderCaseSubNav` |
| 279 | `renderDashboardPlaceholder` |
| 298 | `renderFrame` |
| 308 | `render` |
| 319 | `attachEvents` |

### `reference/case-management.html` (25 KB, 238 บรรทัด)

| บรรทัด | function |
|---|---|
| 71 | `render` |
| 164 | `openModal` |

### `reference/dashboard.html` (19 KB, 261 บรรทัด)

| บรรทัด | function |
|---|---|
| 162 | `render` |

### `reference/documents.html` (68 KB, 705 บรรทัด)

| บรรทัด | function |
|---|---|
| 114 | `money` |
| 120 | `pct` |
| 121 | `sum` |
| 122 | `esc` |
| 127 | `readInt` |
| 135 | `readLow` |
| 147 | `bahtText` |
| 212 | `copyLabel` |
| 216 | `header` |
| 235 | `metaRow` |
| 245 | `partyLines` |
| 254 | `parties` |
| 262 | `signatures` |
| 276 | `footer` |
| 280 | `paper` |
| 284 | `notes` |
| 290 | `sectionTitle` |
| 297 | `docBilling` |
| 336 | `taxInvoicePaper` |
| 362 | `docTaxInvoice` |
| 393 | `docHandover` |
| 419 | `payCalc` |
| 423 | `payTable` |
| 439 | `docVoucher` |
| 455 | `docPayslip` |
| 479 | `docAdvance` |
| 502 | `docAdvanceReturn` |
| 533 | `docNoReceipt` |
| 563 | `internalHead` |
| 580 | `docInternal` |
| 587 | `T` |
| 622 | `docWht` |
| 623 | `box` |
| 672 | `render` |
| 690 | `badge` |

### `reference/finance.html` (261 KB, 2552 บรรทัด)

| บรรทัด | function |
|---|---|
| 33 | `toBKK` |
| 34 | `fmtDate` |
| 35 | `fmtDateTime` |
| 36 | `nowDate` |
| 37 | `nowDateTime` |
| 40 | `fuelLabel` |
| 46 | `compPlanSummary` |
| 248 | `getRole` |
| 249 | `getUser` |
| 250 | `getCompany` |
| 251 | `getTeam` |
| 252 | `getCompTemplate` |
| 253 | `getServiceTemplate` |
| 254 | `groupLabel` |
| 255 | `groupColor` |
| 290 | `setState` |
| 291 | `updateFilter` |
| 292 | `resetFilters` |
| 293 | `showToast` |
| 294 | `openModal` |
| 295 | `closeModal` |
| 297 | `handleSfChange` |
| 305 | `money` |
| 306 | `statusBadge` |
| 360 | `btnAction` |
| 363 | `formInput` |
| 367 | `formSelect` |
| 385 | `renderTopNav` |
| 413 | `kpi` |
| 419 | `approvalStepBadge` |
| 426 | `renderFinanceOperations` |
| 969 | `renderAccountingOperations` |
| 1054 | `renderSettingsLayout` |
| 1139 | `renderRolesContent` |
| 1193 | `renderTeamsContent` |
| 1261 | `renderCompaniesContent` |
| 1310 | `renderUsersContent` |
| 1366 | `renderCompensationContent` |
| 1370 | `renderServiceFeeContent` |
| 1376 | `renderSystemSettingsContent` |
| 1380 | `renderAuditLogContent` |
| 1386 | `renderSettingsCycles` |
| 1390 | `renderSettingsApprovals` |
| 1394 | `renderSettingsBanks` |
| 1398 | `renderSettingsTax` |
| 1402 | `renderSettingsCost` |
| 1405 | `renderSettingsPayee` |
| 1409 | `renderSettingsDocs` |
| 1413 | `renderSettingsBankFile` |
| 1417 | `renderSettingsExport` |
| 1421 | `renderSettingsPermission` |
| 1472 | `renderSettingsLock` |
| 1486 | `renderModal` |
| 1998 | `baseAmt` |
| 2438 | `renderToast` |
| 2449 | `render` |

### `reference/login.html` (12 KB, 251 บรรทัด)

| บรรทัด | function |
|---|---|
| 60 | `render` |
| 66 | `renderLoginForm` |
| 148 | `renderSuccess` |
| 180 | `renderToast` |
| 187 | `attachEvents` |
| 202 | `handleSubmit` |
| 238 | `handleLogout` |

### `reference/notifications.html` (12 KB, 131 บรรทัด)

| บรรทัด | function |
|---|---|
| 47 | `unread` |
| 49 | `render` |

### `reference/reports.html` (64 KB, 967 บรรทัด)

| บรรทัด | function |
|---|---|
| 38 | `toBKK` |
| 39 | `fmtDate` |
| 40 | `nowDate` |
| 143 | `S` |
| 144 | `openModal` |
| 145 | `closeModal` |
| 146 | `toast` |
| 151 | `money` |
| 152 | `pct` |
| 153 | `trend` |
| 159 | `pill` |
| 171 | `kpiCard` |
| 182 | `barChart` |
| 200 | `lineChart` |
| 221 | `exportBtns` |
| 229 | `periodPicker` |
| 236 | `tbl` |
| 252 | `renderNav` |
| 272 | `renderMainTabs` |
| 301 | `renderF1` |
| 360 | `renderF2` |
| 393 | `renderF3` |
| 426 | `renderF4` |
| 455 | `renderF5` |
| 505 | `renderO1` |
| 508 | `avgRate` |
| 537 | `renderO2` |
| 564 | `renderO3` |
| 591 | `renderO4` |
| 622 | `renderO5` |
| 652 | `renderA1` |
| 686 | `renderA2` |
| 713 | `renderA3` |
| 738 | `renderA4` |
| 766 | `renderE1` |
| 797 | `renderE2` |
| 818 | `renderE3` |
| 846 | `renderModal` |
| 914 | `renderToast` |
| 934 | `render` |

### `reference/settings.html` (272 KB, 2174 บรรทัด)

| บรรทัด | function |
|---|---|
| 33 | `toBKK` |
| 34 | `fmtDate` |
| 35 | `fmtDateTime` |
| 36 | `nowDate` |
| 37 | `nowDateTime` |
| 295 | `getRole` |
| 296 | `getUser` |
| 297 | `getCompany` |
| 298 | `getTeam` |
| 299 | `getCompTemplate` |
| 300 | `getServiceTemplate` |
| 301 | `groupLabel` |
| 302 | `groupColor` |
| 332 | `setState` |
| 333 | `updateFilter` |
| 334 | `resetFilters` |
| 335 | `showToast` |
| 336 | `openModal` |
| 337 | `closeModal` |
| 339 | `handleSfChange` |
| 347 | `money` |
| 348 | `statusBadge` |
| 356 | `btnAction` |
| 359 | `formInput` |
| 363 | `formSelect` |
| 381 | `renderTopNav` |
| 409 | `settingHelp` |
| 422 | `assumptionBadge` |
| 430 | `kpi` |
| 436 | `renderFinanceOperations` |
| 535 | `renderAccountingOperations` |
| 620 | `renderSettingsLayout` |
| 721 | `renderRolesContent` |
| 781 | `renderTeamsContent` |
| 853 | `renderCompaniesContent` |
| 905 | `renderUsersContent` |
| 961 | `renderOrganizationContent` |
| 1038 | `renderCompensationContent` |
| 1058 | `renderServiceFeeContent` |
| 1062 | `basisTh` |
| 1097 | `renderSystemSettingsContent` |
| 1125 | `renderAuditLogContent` |
| 1132 | `renderSettingsCycles` |
| 1146 | `renderSettingsApprovals` |
| 1153 | `renderSettingsBanks` |
| 1160 | `renderSettingsTax` |
| 1178 | `renderSettingsWhtPolicy` |
| 1179 | `box` |
| 1198 | `renderSettingsRetention` |
| 1227 | `renderSettingsHolidays` |
| 1249 | `renderSettingsVat` |
| 1256 | `now` |
| 1263 | `renderSettingsCost` |
| 1274 | `renderSettingsTaxDoc` |
| 1318 | `docNumberPattern` |
| 1321 | `docNumberNext` |
| 1324 | `renderSettingsNumbering` |
| 1368 | `renderSettingsPayee` |
| 1372 | `renderSettingsDocs` |
| 1376 | `renderSettingsBankFile` |
| 1384 | `renderSettingsExport` |
| 1388 | `renderSettingsPermission` |
| 1398 | `levelChip` |
| 1450 | `renderSettingsLock` |
| 1464 | `renderModal` |
| 1867 | `d` |
| 1996 | `lv` |
| 2035 | `renderToast` |
| 2046 | `render` |

### `reference/warehouse.html` (108 KB, 1348 บรรทัด)

| บรรทัด | function |
|---|---|
| 38 | `toBKK` |
| 43 | `fmtDate` |
| 52 | `fmtDateTime` |
| 63 | `nowDate` |
| 64 | `nowDateTime` |
| 154 | `S` |
| 155 | `openModal` |
| 156 | `closeModal` |
| 157 | `toast` |
| 166 | `pill` |
| 167 | `btn` |
| 168 | `getCompany` |
| 169 | `getAsset` |
| 170 | `getLot` |
| 171 | `custodyAssets` |
| 172 | `nextLotId` |
| 173 | `nextDocRef` |
| 174 | `matchSearch` |
| 192 | `filterInput` |
| 200 | `filterSelect` |
| 210 | `renderNav` |
| 235 | `renderSummary` |
| 236 | `cnt` |
| 237 | `lotCnt` |
| 255 | `renderTabs` |
| 272 | `renderIntakeTab` |
| 353 | `renderCustodyTab` |
| 488 | `renderPendingHandoverTab` |
| 598 | `renderDeliveredTab` |
| 746 | `renderModal` |
| 754 | `ah` |
| 1209 | `renderToast` |
| 1222 | `render` |


---

## สคริปต์ regenerate MAP

```bash
# รันที่ root ของ repo หลังแก้ไฟล์ spec/mockup ใดๆ
python3 .claude/hooks/generate-map.py
```
