# 00_MAP.md — แผนที่ช่วงบรรทัดของไฟล์ใหญ่ (สำหรับ Read(offset, limit))

> **วิธีใช้**: ก่อนอ่านไฟล์ใหญ่ ให้เปิดไฟล์นี้หาบรรทัดเริ่มของ section ที่ต้องการ แล้ว `Read(file, offset=<บรรทัดเริ่ม>, limit=<ช่วงที่ต้องการ>)` — **ห้ามอ่านไฟล์ใหญ่ทั้งไฟล์**
> ช่วงจบของแต่ละ section = บรรทัดเริ่มของ section ถัดไป − 1
> ⚠️ **ถ้ามีการแก้ไฟล์ spec/mockup จนบรรทัดเลื่อน ต้อง regenerate MAP นี้ใหม่** (สคริปต์อยู่ท้ายไฟล์)
> ครอบคลุม: ไฟล์ `.md` ใน docs/ ที่ ≥ 15KB ทุกไฟล์ (ตาราง heading) + ไฟล์ < 15KB (ตารางสรุปท้ายส่วนที่ 1) + mockup `.html` ใน reference/ ทุกไฟล์ · เวอร์ชัน = เลขสูงสุดใน Changelog ของไฟล์

---

## ส่วนที่ 1 — Spec files (docs/)


### `docs/01-architecture.md` (16 KB, 239 บรรทัด — v2.3)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 01-architecture.md |
| 3 | # 01 — Architecture |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 28 | ## 1. Summary |
| 32 | ## 2. Purpose |
| 36 | ## 3. In Scope |
| 48 | ## 4. Out of Scope |
| 54 | ## 5. Actors & Responsibilities |
| 65 | ## 6. Core Concepts |
| 67 | ### 6.0 Tech Stack ที่ตัดสินใจแล้ว (Decision Date: 02/07/2569 — DEC-001) |
| 82 | ### 6.0.1 Component Diagram (High-level) |
| 117 | ### 6.1 Permission Architecture (ตัดสินใจแล้ว — DEC-002) |
| 131 | ### 6.2 Architecture Concepts |
| 141 | ## 7. Data Entities / Required Objects |
| 152 | ## 8. UI / UX Rules |
| 159 | ## 9. Workflow / Lifecycle |
| 164 | ## 10. Security / Control Rules |
| 171 | ## 11. Validation & Error Handling |
| 180 | ## 12. Permission Requirements |
| 188 | ## 13. Audit Log Requirements |
| 195 | ## 14. API / Integration Draft |
| 204 | ## 15. Acceptance Criteria |
| 211 | ## 16. Test Cases |
| 221 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 232 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

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

### `docs/02-database-schema-design.md` (320 KB, 2972 บรรทัด — v4.81)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 02-database-schema-design.md |
| 3 | # 02 — Database Schema Design (Full Production Schema) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 116 | ## 1. Summary |
| 119 | ## 2. Conventions (กฎที่ใช้ทั้งไฟล์) |
| 121 | ### 2.1 Naming |
| 131 | ### 2.2 Money |
| 138 | ### 2.3 Timestamps |
| 143 | ### 2.4 Common Columns (ทุก table มีครบ) |
| 154 | ### 2.5 Permission Architecture |
| 161 | ## 3. Enum Types (ทั้งหมด) |
| 535 | ## 4. Schema Group A — Identity & Access |
| 642 | ## 5. Schema Group B — Master Data |
| 1088 | ## 6. Schema Group C — Case Workflow |
| 1597 | ## 7. Schema Group D — Warehouse (ไฟล์ 44) |
| 1691 | ## 8. Schema Group E — Finance Operation |
| 2185 | ## 9. Schema Group F — Accounting Handover |
| 2613 | ## 10. Schema Group G — Platform |
| 2775 | ## 11. Migration Order (ลำดับที่ต้อง run) |
| 2853 | ## 12. Seed Data |
| 2927 | ## 13. Immutable Rules (ห้ามแก้ไขย้อนหลัง) |
| 2951 | ## 14. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 2961 | ## 15. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/02_OPEN_DECISIONS.md` (72 KB, 300 บรรทัด)

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

### `docs/04-ui-ux-design-system.md` (19 KB, 215 บรรทัด — v3.1)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 04-ui-ux-design-system.md |
| 3 | # 04 — UI/UX Design System |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 26 | ## 1. Summary |
| 30 | ## 2. Purpose |
| 34 | ## 3. In Scope |
| 40 | ## 4. Out of Scope |
| 45 | ## 5. Actors & Responsibilities |
| 60 | ## 6. Core Concepts |
| 68 | ## 7. Data Entities / Required Objects |
| 76 | ## 8. UI / UX Rules |
| 87 | ### 8.1 Design Token Reference (สกัดจริงจาก Mockup HTML — ไม่ใช่ค่าที่กำหนดขึ้นใหม่) |
| 142 | ## 10. Security / Control Rules |
| 148 | ## 11. Validation & Error Handling |
| 157 | ## 12. Permission Requirements |
| 164 | ## 13. Audit Log Requirements |
| 171 | ## 14. API / Integration Draft |
| 179 | ## 15. Acceptance Criteria |
| 186 | ## 16. Test Cases |
| 197 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 206 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/05-auth-and-access-control.md` (19 KB, 213 บรรทัด — v3.6)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 05-auth-and-access-control.md |
| 3 | # 05 — Authentication & Access Control |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 31 | ## 1. Summary |
| 35 | ## 2. Purpose |
| 39 | ## 3. In Scope |
| 45 | ## 4. Out of Scope |
| 50 | ## 5. Actors & Responsibilities |
| 65 | ## 6. Core Concepts |
| 73 | ### 6.1 Login Flow (Sequence Diagram) |
| 110 | ## 7. Data Entities / Required Objects |
| 119 | ## 8. UI / UX Rules |
| 125 | ## 9. Workflow / Lifecycle |
| 129 | ## 10. Security / Control Rules |
| 137 | ## 11. Validation & Error Handling |
| 146 | ## 12. Permission Requirements |
| 156 | ## 13. Audit Log Requirements |
| 164 | ## 14. API / Integration Draft |
| 174 | ## 15. Acceptance Criteria |
| 181 | ## 16. Test Cases |
| 193 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 206 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/06-menu-and-navigation-map.md` (38 KB, 236 บรรทัด — v2.13)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 06-menu-and-navigation-map.md |
| 3 | # 06 — Menu and Navigation Map |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 38 | ## 1. Summary |
| 42 | ## 2. Purpose |
| 46 | ## 3. In Scope |
| 52 | ## 4. Out of Scope |
| 57 | ## 5. Actors & Responsibilities |
| 72 | ## 6. Core Concepts |
| 80 | ## 7. Data Entities / Required Objects |
| 88 | ### 7.1 เมนู "งานติดตามทรัพย์" (Asset Recovery Workflow) — Concrete Menu Map |
| 119 | ## 8. UI / UX Rules |
| 131 | ### 7.2 สิทธิ์เข้าถึงเมนูหลัก (Top Nav Visibility Matrix) |
| 158 | ## 9. Workflow / Lifecycle |
| 163 | ## 10. Security / Control Rules |
| 168 | ## 11. Validation & Error Handling |
| 177 | ## 12. Permission Requirements |
| 184 | ## 13. Audit Log Requirements |
| 191 | ## 14. API / Integration Draft |
| 199 | ## 15. Acceptance Criteria |
| 206 | ## 16. Test Cases |
| 218 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 228 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/07-roles-permissions.md` (28 KB, 212 บรรทัด — v2.8)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 07-roles-permissions.md |
| 3 | # 07 — Roles and Permissions (Master Role List) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 31 | ## 1. Summary |
| 35 | ## 2. Purpose |
| 39 | ## 3. In Scope |
| 45 | ## 4. Out of Scope |
| 50 | ## 5. Actors & Responsibilities — Role ทั้งหมด 15 ตัว แบ่งตาม Role Group (system 6 + in... |
| 52 | ### 5.1 กลุ่ม System (ดูแลภาพรวมทั้งระบบ — ไม่ผูกทีม) |
| 63 | ### 5.2 กลุ่ม Inhouse / Outsource (ทีมติดตามทรัพย์ — แยก role ต่อ Role Group) |
| 73 | ### 5.3 กลุ่ม Finance Company (ภายนอก — ผูกกับบริษัทไฟแนนซ์โดยตรง ไม่มี sub-team) |
| 85 | ## 6. Core Concepts |
| 93 | ## 7. Data Entities / Required Objects |
| 95 | ### 7.1 Role |
| 105 | ### 7.2 Permission |
| 113 | ### 7.3 Role Group |
| 122 | ## 8. UI / UX Rules |
| 128 | ## 9. Workflow / Lifecycle |
| 134 | ## 10. Security / Control Rules |
| 141 | ## 11. Validation & Error Handling |
| 151 | ## 12. Permission Requirements (สรุปภาพรวม — รายละเอียดเชิงลึกดูไฟล์ต้นทาง) |
| 163 | ## 13. Audit Log Requirements |
| 169 | ## 14. API / Integration Draft |
| 178 | ## 15. Acceptance Criteria |
| 185 | ## 16. Test Cases |
| 196 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 205 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/08-users.md` (25 KB, 203 บรรทัด — v2.3)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 08-users.md |
| 3 | # 08 — Users |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 26 | ## 1. Summary |
| 30 | ## 2. Purpose |
| 34 | ## 3. In Scope |
| 41 | ## 4. Out of Scope |
| 47 | ## 5. Actors & Responsibilities |
| 60 | ## 6. Core Concepts |
| 69 | ## 7. Data Entities / Required Objects |
| 71 | ### 7.1 User (ตรงกับ table `users` ใน `02-database-schema-design.md` §4) |
| 89 | ### 7.2 User Status Lifecycle |
| 97 | ## 8. UI / UX Rules |
| 106 | ## 9. Workflow / Lifecycle |
| 112 | ## 10. Security / Control Rules |
| 123 | ## 11. Validation & Error Handling |
| 137 | ## 12. Permission Requirements |
| 145 | ## 13. Audit Log Requirements |
| 152 | ## 14. API / Integration Draft |
| 165 | ## 15. Acceptance Criteria |
| 171 | ## 16. Test Cases |
| 188 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 196 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/09-teams.md` (19 KB, 173 บรรทัด — v2.4)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 09-teams.md |
| 3 | # 09 — Teams |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 27 | ## 1. Summary |
| 31 | ## 2. Purpose |
| 35 | ## 3. In Scope |
| 41 | ## 4. Out of Scope |
| 46 | ## 5. Actors & Responsibilities |
| 59 | ## 6. Core Concepts |
| 67 | ## 7. Data Entities / Required Objects |
| 79 | ### 7.1 Manager vs Supervisor Scope |
| 87 | ## 8. UI / UX Rules |
| 94 | ## 9. Workflow / Lifecycle |
| 98 | ## 10. Security / Control Rules |
| 103 | ## 11. Validation & Error Handling |
| 113 | ## 12. Permission Requirements |
| 120 | ## 13. Audit Log Requirements |
| 127 | ## 14. API / Integration Draft |
| 137 | ## 15. Acceptance Criteria |
| 144 | ## 16. Test Cases |
| 157 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 165 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/10-finance-companies.md` (41 KB, 253 บรรทัด — v3.6)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 10-finance-companies.md |
| 3 | # 10 — Finance Companies (บริษัทไฟแนนซ์คู่ค้า) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 31 | ## 1. Summary |
| 35 | ## 2. Purpose |
| 39 | ## 3. In Scope |
| 46 | ## 4. Out of Scope |
| 52 | ## 5. Actors & Responsibilities |
| 61 | ## 6. Core Concepts |
| 69 | ## 7. Data Entities / Required Objects |
| 71 | ### 7.1 Finance Company |
| 95 | ### 7.2 Company User (บัญชีผู้ใช้ฝั่งบริษัทไฟแนนซ์) |
| 106 | ### 7.4 เอกสารบริษัท (Company Documents — มติ PO U132) |
| 124 | ## 8. UI / UX Rules |
| 137 | ## 9. Workflow / Lifecycle |
| 139 | ### 9.1 สร้างบริษัทใหม่ |
| 143 | ### 9.2 Service Fee Template Snapshot (แก้ไขแล้ว — ดู Changelog v2) |
| 154 | ### 9.3 ระงับ/เปิดใช้งานบริษัท |
| 160 | ## 10. Security / Control Rules |
| 166 | ## 11. Validation & Error Handling |
| 179 | ## 12. Permission Requirements |
| 191 | ## 13. Audit Log Requirements |
| 197 | ## 14. API / Integration Draft |
| 211 | ## 15. Acceptance Criteria |
| 218 | ## 16. Test Cases |
| 237 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 245 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/11-compensation.md` (22 KB, 188 บรรทัด — v2.5)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 11-compensation.md |
| 3 | # 11 — Compensation (แผนค่าตอบแทน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 28 | ## 1. Summary |
| 32 | ## 2. Purpose |
| 36 | ## 3. In Scope |
| 42 | ## 4. Out of Scope |
| 47 | ## 5. Actors & Responsibilities |
| 62 | ## 6. Core Concepts |
| 70 | ## 7. Data Entities / Required Objects |
| 79 | ### 7.1 Fuel Rule — 2 โหมด (ไม่ใช่สูตรเดียวแบบ Rule อื่น) |
| 90 | ### 7.2 No-Success Compensation (เบี้ยเสี่ยง/ค่าออกพื้นที่) |
| 99 | ## 8. UI / UX Rules |
| 108 | ## 9. Workflow / Lifecycle |
| 113 | ## 10. Security / Control Rules |
| 122 | ## 11. Validation & Error Handling |
| 131 | ## 12. Permission Requirements |
| 138 | ## 13. Audit Log Requirements |
| 145 | ## 14. API / Integration Draft |
| 154 | ## 15. Acceptance Criteria |
| 161 | ## 16. Test Cases |
| 173 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 181 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/12-service-fee.md` (23 KB, 194 บรรทัด — v2.4)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 12-service-fee.md |
| 3 | # 12 — Service Fee (กติกาค่าบริการที่เรียกเก็บบริษัทไฟแนนซ์) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 28 | ## 1. Summary |
| 32 | ## 2. Purpose |
| 36 | ## 3. In Scope |
| 42 | ## 4. Out of Scope |
| 48 | ## 5. Actors & Responsibilities |
| 55 | ## 6. Core Concepts |
| 57 | ### 6.1 Model: `SUCCESS_FEE` |
| 64 | ### 6.2 Model: `FLAT` |
| 70 | ### 6.3 Model: `HYBRID` |
| 77 | ### 6.4 รอบการติดตาม (tracking round) — คิดทุกรอบอิสระเสมอ (มติ PO U125) |
| 83 | ### 6.5 กรณีไม่สำเร็จ — ยอดแยก ทุกโมเดล (มติ PO U165) |
| 91 | ## 7. Data Entities / Required Objects |
| 93 | ### 7.1 Service Fee Template |
| 107 | ## 8. UI / UX Rules |
| 115 | ## 9. Workflow / Lifecycle |
| 123 | ## 10. Security / Control Rules |
| 128 | ## 11. Validation & Error Handling |
| 136 | ## 12. Permission Requirements |
| 143 | ## 13. Audit Log Requirements |
| 147 | ## 14. API / Integration Draft |
| 155 | ## 15. Acceptance Criteria |
| 161 | ## 16. Test Cases |
| 178 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 187 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/13-accounting-finance-settings.md` (167 KB, 666 บรรทัด — v3.38)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 13-accounting-finance-settings.md |
| 3 | # 13 — Accounting & Finance Settings (ตั้งค่าระบบบัญชี/การเงิน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 65 | ## 1. Summary |
| 69 | ## 2. Purpose |
| 73 | ## 3. In Scope |
| 77 | ## 4. Out of Scope |
| 82 | ## 5. Actors & Responsibilities |
| 90 | ## 6. Core Concepts & Data Entities |
| 92 | ### 6.1 Billing/Payout Cycles (รอบบิลและรอบจ่าย) |
| 115 | ### 6.2 Approval Matrix (สายการอนุมัติ) |
| 144 | ### 6.3 Corporate Bank Accounts (บัญชีธนาคารบริษัท) |
| 159 | ### 6.4 Tax Profile (กติกาภาษี) 🔶 สำคัญมาก — ต้องนักบัญชียืนยันก่อนใช้จริง |
| 214 | ### 6.5 VAT Rate Setting (อัตราภาษีมูลค่าเพิ่ม) 🔶 สำคัญมาก — ติดตามใกล้ชิด |
| 233 | ### 6.6 Cost Center |
| 242 | ### 6.7 Internal Document Templates (รูปแบบเอกสารภายใน) |
| 256 | ### 6.8 Bank File Format (รูปแบบไฟล์ธนาคาร) |
| 267 | ### 6.9 Export Format (รูปแบบไฟล์ Export ส่งสำนักงานบัญชี) |
| 293 | ### 6.10 Functional Permission Matrix (สิทธิ์เฉพาะโมดูลการเงิน/บัญชี) |
| 312 | ### 6.11 Period Lock Policy (นโยบายล็อกรอบบัญชี) |
| 322 | ### 6.12 Document Numbering (เลขที่เอกสาร) — มติ PO 06/10/2569 (UAT U102) |
| 364 | ### 6.13 เทมเพลตเอกสาร (Document Template Settings) — v3.21 มติ PO 06/10/2569 (U122) |
| 383 | ### 6.14 SLA Alert Threshold (เกณฑ์ SLA งานติดตาม) — มติ PO 15/08/2569 (D18) |
| 395 | ### 6.15 ปฏิทินวันหยุด (Public Holidays) — มติ PO 06/10/2569 (UAT U93) |
| 412 | ### 6.16 ระยะเก็บเอกสารลูกหนี้ (Debtor Document Retention — PDPA) — มติ PO 06/10/2569 (... |
| 427 | ### 6.17 ข้อมูลองค์กร (Organization Profile) — มติ PO 06/10/2569 (U99) |
| 450 | ### 6.18 Model Phone (แคตตาล็อกแบรนด์/รุ่นเครื่อง + ฐาน TAC) — มติ PO 07/10/2569 (U155 ... |
| 486 | ## 7. UI / UX Rules |
| 492 | ### 7.1 คำอธิบายในหน้าจอ (มติ PO 06/10/2569 U108) |
| 520 | ## 8. Workflow / Lifecycle |
| 526 | ## 9. Security / Control Rules |
| 533 | ## 10. Validation & Error Handling |
| 547 | ## 11. Permission Requirements |
| 565 | ## 12. Audit Log Requirements |
| 570 | ## 13. API / Integration Draft |
| 611 | ## 14. Acceptance Criteria |
| 618 | ## 15. Test Cases |
| 646 | ## 16. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 657 | ## 17. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/15-claims-and-advances.md` (79 KB, 321 บรรทัด — v2.21)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 15-claims-and-advances.md |
| 3 | # 15 — Claims and Advances (รายการเบิกและเงินทดรองจ่าย) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 45 | ## 1. Summary |
| 49 | ## 2. Purpose |
| 53 | ## 3. In Scope |
| 58 | ## 4. Out of Scope |
| 64 | ## 5. Actors & Responsibilities |
| 72 | ## 6. Core Concepts |
| 74 | ### 6.1 Claim (รายการเบิก) — มาจาก 2 แหล่ง |
| 79 | ### 6.2 Advance (เงินทดรองจ่าย) |
| 85 | ## 7. Data Entities / Required Objects |
| 87 | ### 7.1 Manual Claim |
| 102 | ### 7.2 Advance (แก้ไขแล้ว — ดู Changelog v2) |
| 118 | ## 8. UI / UX Rules |
| 131 | ## 9. Workflow / Lifecycle |
| 133 | ### 9.1 Advance (แก้ไขแล้ว) |
| 143 | ### 9.3 ปิดยอดคืน (มติ PO 05/10/2569 — UAT U30 · BUG-109) |
| 155 | ### 9.4 ใบรับรองแทนใบเสร็จรับเงิน + เอกสารเงินทดรอง (มติ PO 06/10/2569 U100/U101/U103) |
| 178 | ### 9.2 ห้ามเบิกซ้อน |
| 182 | ## 10. Security / Control Rules |
| 188 | ## 11. Validation & Error Handling |
| 211 | ## 12. Permission Requirements |
| 225 | ## 13. Audit Log Requirements |
| 234 | ## 14. API / Integration Draft |
| 261 | ## 15. Acceptance Criteria |
| 268 | ## 16. Test Cases |
| 305 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 314 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/16-compensation-approval.md` (28 KB, 178 บรรทัด — v2.10)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 16-compensation-approval.md |
| 3 | # 16 — Compensation Approval (สายการอนุมัติค่าตอบแทน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 34 | ## 1. Summary |
| 38 | ## 2. Purpose |
| 42 | ## 3. In Scope |
| 48 | ## 4. Out of Scope |
| 54 | ## 5. Actors & Responsibilities |
| 62 | ## 6. Core Concepts |
| 64 | ### 6.1 Multi-step Approval ตาม Approval Matrix |
| 73 | ### 6.2 ความสัมพันธ์กับ QC Outcome (ไฟล์ 41 §10.1) |
| 80 | ## 7. Data Entities / Required Objects |
| 90 | ## 8. UI / UX Rules |
| 101 | ## 9. Workflow / Lifecycle |
| 107 | ### 9.1 แจ้งเตือนผู้อนุมัติ (มติ PO 05/10/2569 U29 · BUG-106) |
| 114 | ## 10. Security / Control Rules |
| 120 | ## 11. Validation & Error Handling |
| 128 | ## 12. Permission Requirements |
| 137 | ## 13. Audit Log Requirements |
| 141 | ## 14. API / Integration Draft |
| 149 | ## 15. Acceptance Criteria |
| 155 | ## 16. Test Cases |
| 164 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 171 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/17-payroll-and-payout.md` (44 KB, 242 บรรทัด — v2.15)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 17-payroll-and-payout.md |
| 3 | # 17 — Payroll and Payout (รอบจ่ายเงินและไฟล์โอนธนาคาร) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 39 | ## 1. Summary |
| 43 | ## 2. Purpose |
| 47 | ## 3. In Scope |
| 54 | ## 4. Out of Scope |
| 59 | ## 5. Actors & Responsibilities |
| 66 | ## 6. Core Concepts |
| 68 | ### 6.1 Payout Batch แยกฝั่ง inhouse / outsource |
| 72 | ### 6.2 WHT Calculation ต่อ Payout Batch |
| 78 | ### 6.3 Idempotency Key (กันโอนซ้ำ) 🔶 สำคัญมากด้านความปลอดภัยทางการเงิน |
| 82 | ### 6.4 หักคืนเงินทดรองในรอบจ่าย (มติ PO 05/10/2569 — UAT U30 · BUG-109) |
| 92 | ## 7. Data Entities / Required Objects |
| 94 | ### 7.1 Payout Batch (เติมสถานะ `draft` — ดู Changelog v2) |
| 111 | ### 7.2 Payout Batch Item |
| 124 | ## 8. UI / UX Rules |
| 133 | ## 9. Workflow / Lifecycle |
| 137 | ### 9.0 ขั้นหลังรอบจ่ายสำเร็จ (มติ PO 07/10/2569 — U134) |
| 143 | ### 9.1 ยกเลิกรอบจ่าย (มติ PO 05/10/2569 — UAT U67) |
| 158 | ## 10. Security / Control Rules |
| 164 | ## 11. Validation & Error Handling |
| 177 | ## 12. Permission Requirements |
| 185 | ## 13. Audit Log Requirements |
| 191 | ## 14. API / Integration Draft |
| 202 | ## 15. Acceptance Criteria |
| 209 | ## 16. Test Cases |
| 226 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 234 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/18-payee-and-tax-profile.md` (49 KB, 250 บรรทัด — v2.14)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 18-payee-and-tax-profile.md |
| 3 | # 18 — Payee and Tax Profile (ผู้รับเงินและกติกาภาษีรายบุคคล) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 37 | ## 1. Summary |
| 41 | ## 2. Purpose |
| 45 | ## 3. In Scope |
| 51 | ## 4. Out of Scope |
| 56 | ## 5. Actors & Responsibilities |
| 64 | ## 6. Core Concepts |
| 66 | ### 6.1 Payee = บุคคล/นิติบุคคลที่รับเงินจาก AssetRecovery |
| 70 | ### 6.2 Verification ก่อนจ่ายเงิน |
| 74 | ### 6.3 WHT Rate Priority — Payee Level vs Plan Level 🔑 Key Business Rule |
| 112 | ## 7. Data Entities / Required Objects |
| 114 | ### 7.1 Payee Profile (field name ตรงกับ `02-database-schema-design.md` §8 หลังเติม col... |
| 137 | ## 8. UI / UX Rules |
| 154 | ## 9. Workflow / Lifecycle |
| 162 | ## 10. Security / Control Rules |
| 168 | ## 11. Validation & Error Handling |
| 177 | ## 12. Permission Requirements |
| 187 | ## 13. Audit Log Requirements |
| 193 | ## 14. API / Integration Draft |
| 202 | ## 15. Acceptance Criteria |
| 209 | ## 16. Test Cases |
| 235 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 243 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/19-revenue-billing-receivable.md` (56 KB, 273 บรรทัด — v2.19)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 19-revenue-billing-receivable.md |
| 3 | # 19 — Revenue, Billing & Receivable (รายได้ วางบิล และลูกหนี้การค้า) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 43 | ## 1. Summary |
| 47 | ## 2. Purpose |
| 51 | ## 3. In Scope |
| 58 | ## 4. Out of Scope |
| 64 | ## 5. Actors & Responsibilities |
| 72 | ## 6. Core Concepts |
| 74 | ### 6.1 Revenue Record (รายการรายได้) 🔑 Complex Trigger Logic |
| 96 | ### 6.2 Billing Batch (รอบวางบิล) |
| 106 | ### 6.3 VAT Handling 🔶 สำคัญมาก — อัตราอาจเปลี่ยนใน 3 เดือนข้างหน้า |
| 122 | ### 6.4 AR Aging |
| 128 | ## 7. Data Entities / Required Objects |
| 130 | ### 7.1 Revenue |
| 146 | ### 7.2 Billing Batch |
| 160 | ## 8. UI / UX Rules |
| 171 | ## 9. Workflow / Lifecycle |
| 173 | ### 9.1 Revenue → Billing Batch |
| 179 | ### 9.2 Billing Batch Payment Tracking |
| 189 | ## 10. Security / Control Rules |
| 194 | ## 11. Validation & Error Handling |
| 203 | ## 12. Permission Requirements |
| 211 | ## 13. Audit Log Requirements |
| 216 | ## 14. API / Integration Draft |
| 229 | ## 15. Acceptance Criteria |
| 235 | ## 16. Test Cases |
| 254 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 264 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/20-adjustment.md` (21 KB, 167 บรรทัด — v2.9)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 20-adjustment.md |
| 3 | # 20 — Adjustment (รายการปรับปรุง) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 32 | ## 1. Summary |
| 36 | ## 2. Purpose |
| 40 | ## 3. In Scope |
| 45 | ## 4. Out of Scope |
| 50 | ## 5. Actors & Responsibilities |
| 57 | ## 6. Core Concepts |
| 59 | ### 6.1 Adjustment ไม่แก้ของเดิม แต่สร้างรายการใหม่ชดเชย |
| 63 | ### 6.2 ระดับการอนุมัติตาม Period Lock Policy (ไฟล์ 13 §6.11) |
| 71 | ## 7. Data Entities / Required Objects |
| 73 | ### 7.1 Adjustment (target ใช้ Separate FK columns ตาม DEC-004) |
| 87 | ## 8. UI / UX Rules |
| 97 | ## 9. Workflow / Lifecycle |
| 101 | ## 10. Security / Control Rules |
| 106 | ## 11. Validation & Error Handling |
| 114 | ## 12. Permission Requirements |
| 122 | ## 13. Audit Log Requirements |
| 126 | ## 14. API / Integration Draft |
| 136 | ## 15. Acceptance Criteria |
| 141 | ## 16. Test Cases |
| 151 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 160 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/22-finance-calculation-spec.md` (110 KB, 626 บรรทัด — v3.32)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 22-finance-calculation-spec.md |
| 3 | # 22 — Finance Calculation Spec (สูตรคำนวณรวมทั้งระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 60 | ## 1. Summary |
| 64 | ## 2. Purpose |
| 68 | ## 3. In Scope |
| 72 | ## 4. Out of Scope |
| 77 | ## 5. Actors & Responsibilities |
| 81 | ## 6. สูตรคำนวณทั้งหมด |
| 83 | ### 6.1 ค่าน้ำมัน (Fuel) — โหมด PER_KM (อ้างอิงไฟล์ 11, 41 §6.4.2) |
| 95 | ### 6.2 ค่าน้ำมัน (Fuel) — โหมด DAILY_FLAT (อ้างอิงไฟล์ 11) — แก้ไขแล้ว (ดู Changelog v... |
| 109 | ### 6.3 เบี้ยเลี้ยง (Allowance) — แก้ไขแล้ว (ดู Changelog v2, v3.4) |
| 122 | ### 6.4 Commission / No-Success Fee (อ้างอิงไฟล์ 11) |
| 132 | ### 6.5 รายได้จาก Service Fee — Model SUCCESS_FEE (อ้างอิงไฟล์ 12, 19) |
| 144 | ### 6.6 รายได้จาก Service Fee — Model FLAT (อ้างอิงไฟล์ 12) |
| 151 | ### 6.7 รายได้จาก Service Fee — Model HYBRID (อ้างอิงไฟล์ 12) |
| 174 | ### 6.8 VAT (อ้างอิงไฟล์ 13 §6.5, 19 §6.3) |
| 292 | ### 6.9 ภาษีหัก ณ ที่จ่าย (WHT) (อ้างอิงไฟล์ 13 §6.4, 17, 18) |
| 410 | ### 6.10 ยอด Payout Batch รวม (อ้างอิงไฟล์ 17) |
| 420 | ### 6.11 AR คงค้าง (อ้างอิงไฟล์ 19 §6.4) |
| 474 | ### 6.12 กำไรขั้นต้น (Gross Profit) — ไฟล์ 21 (Actual เท่านั้น ไม่ใช่ projection) |
| 484 | ### 6.13 เงินทดรองจ่าย — ยอดคืน (อ้างอิงไฟล์ 15) — แก้ไขแล้ว (มติ PO 03/10/2569 — UAT Q3) |
| 504 | ### 6.14 เงินทดรองจ่าย — ยอดคืนค้าง + หักกลบในรอบจ่าย (อ้างอิงไฟล์ 15 §9.3, 17 §6.4) — ... |
| 538 | ### 6.15 เพดานค่าที่พักต่อคืน (อ้างอิงไฟล์ 11, 41 §6.6) — มติ PO 06/10/2569 (U89) |
| 555 | ### 6.16 ภาษีที่ลูกค้าจะหัก ณ ที่จ่าย (ประมาณ) ของรอบวางบิล (UAT R14 BUG-165) |
| 578 | ### 6.17 ใบรับรองแทนใบเสร็จรับเงิน — ยอดรวม + เพดาน (อ้างอิงไฟล์ 15 §9.4, 41 §6.6, 13 §... |
| 599 | ## 7. Data Entities / Required Objects |
| 603 | ## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 609 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 619 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/23-finance-state-machines.md` (40 KB, 291 บรรทัด — v2.18)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 23-finance-state-machines.md |
| 3 | # 23 — Finance State Machines (สถานะรวมทุก Entity) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 41 | ## 1. Summary |
| 45 | ## 2. Purpose |
| 49 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 53 | ## 6. State Machines ทั้งหมด |
| 55 | ### 6.1 Finance Company (ไฟล์ 10) |
| 61 | ### 6.2 Payee Profile (ไฟล์ 18) |
| 70 | ### 6.3 Expense / Claim (ไฟล์ 15, 41 §6.6 — entity เดียวกัน enum เดียวกัน) — แก้ไขแล้ว |
| 83 | ### 6.4 Advance — เงินทดรองจ่าย (ไฟล์ 15) — แก้ไขแล้ว (5 สถานะ) |
| 101 | ### 6.5 Compensation Approval — Multi-step (ไฟล์ 16, ผูกกับ §6.3 ด้านบน) |
| 110 | ### 6.6 Payout Batch (ไฟล์ 17) — เติม `draft` แล้ว |
| 121 | ### 6.7 Revenue (ไฟล์ 19) |
| 129 | ### 6.8 Billing Batch (ไฟล์ 19) |
| 139 | ### 6.9 Adjustment (ไฟล์ 20) |
| 146 | ### 6.10 Tax Invoice (ไฟล์ 31) — แก้ไขแล้ว ✅ |
| 156 | ### 6.11 WHT Filing Period Summary (ไฟล์ 33) |
| 164 | ### 6.12 Exception (ไฟล์ 34) — แก้ไขแล้ว ✅ |
| 173 | ### 6.13 Accounting Period — Period Lock Policy (ไฟล์ 13 §6.11, ไฟล์ 30) — **state แม่ท... |
| 185 | ### 6.14 Bank Transaction (ไฟล์ 35) — แก้ไขแล้ว ✅ |
| 209 | ### 6.15 Accountant Question (ไฟล์ 36) — ตรวจสอบแล้ว ✅ |
| 217 | ### 6.16 Export Record (ไฟล์ 37) — แก้ไขแล้ว ✅ |
| 225 | ### 6.17 Substitute Receipt — ใบรับรองแทนใบเสร็จรับเงิน (ไฟล์ 15 §9.4 · มติ PO 06/10/25... |
| 244 | ### 6.18 Model Phone — แบรนด์/รุ่นเครื่อง + ฐาน TAC (`13` §6.18 · มติ PO U155 → U159 → ... |
| 252 | ## 7. ความสัมพันธ์ระหว่าง State Machines (Cross-Entity Flow) |
| 271 | ## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 277 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 284 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/24-finance-validation-rules.md` (135 KB, 413 บรรทัด — v4.66)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 24-finance-validation-rules.md |
| 3 | # 24 — Finance Validation Rules (กฎตรวจสอบรวมทั้งระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 101 | ## 1. Summary |
| 105 | ## 2. Purpose |
| 109 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 113 | ## 6. Validation Rules แยกตามหมวด |
| 115 | ### 6.1 หมวดข้อมูลพื้นฐาน (Master Data — ไฟล์ 08, 09, 10, 11, 12, 18) |
| 164 | ### 6.2 หมวดภาษี/VAT (ไฟล์ 13, 19) |
| 183 | ### 6.3 หมวดธนาคาร/ไฟล์ (ไฟล์ 13, 17, 35) |
| 209 | ### 6.4 หมวด Claim/Advance/Approval (ไฟล์ 15, 16) — แก้ไขแล้ว |
| 232 | ### 6.5 หมวด Payout/Payee (ไฟล์ 17, 18) |
| 253 | ### 6.6 หมวด Revenue/Billing (ไฟล์ 19) |
| 262 | ### 6.7 หมวด Adjustment / Period Lock (ไฟล์ 13, 20, 30) |
| 281 | ### 6.8 หมวดเอกสารทางการ/บัญชี (ไฟล์ 31, 32, 34) |
| 330 | ### 6.9 หมวด Auth & Access Control (ไฟล์ 05, 07, 08) |
| 355 | ### 6.10 หมวด Audit (Platform — ไฟล์ 90) |
| 363 | ### 6.11 หมวด Background Job (Platform — ไฟล์ 91) |
| 374 | ### 6.12 หมวดรายงาน (Platform — ไฟล์ 96) |
| 383 | ### 6.13 หมวดระบบ / API กลาง (Platform — ไฟล์ 45) |
| 391 | ## 7. Validation Code Naming Convention |
| 395 | ## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 401 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 406 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/25-finance-permission-matrix.md` (40 KB, 242 บรรทัด — v2.22)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 25-finance-permission-matrix.md |
| 3 | # 25 — Finance Permission Matrix (เมทริกซ์สิทธิ์รวมทั้งระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 47 | ## 1. Summary |
| 51 | ## 2. Purpose |
| 55 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 59 | ## 6. Roles ที่ใช้ในโมดูล Finance/Accounting (อ้างอิงจาก Master Role List ไฟล์ 07 §5) |
| 74 | ## 7. Permission Matrix รวม (จัดกลุ่มตามไฟล์ต้นทาง) |
| 76 | ### 7.1 Master Data (ไฟล์ 10, 12, 13) |
| 93 | ### 7.2 ฝั่งรายจ่าย (ไฟล์ 15, 16, 17, 18) |
| 114 | ### 7.3 ฝั่งรายรับ (ไฟล์ 19, 31) |
| 135 | ### 7.4 Adjustment & Period Lock (ไฟล์ 20, 30) |
| 145 | ### 7.5 ฝั่งบัญชี (ไฟล์ 32, 33, 34, 35, 36, 37) |
| 160 | ### 7.6 รายงาน (ไฟล์ 14, 21) |
| 168 | ## 8. ข้อสังเกตเรื่องความสอดคล้อง |
| 177 | ### 8.1 ข้อยกเว้น: endpoint ที่ผูกกับตัวผู้ใช้เอง (self-scoped) — เพิ่ม 15/08/2569 |
| 189 | ### 8.2 สิทธิ์คลังสินค้า (นอก Matrix — เจ้าของ `44` §13) — เพิ่ม 05/10/2569 (มติ PO U22... |
| 198 | ## 9. Workflow / Lifecycle |
| 202 | ## 10-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 208 | ### 16.1 Mapping สัญลักษณ์ในไฟล์นี้ → ระดับสิทธิ์ในระบบ (DEC-009, 05/07/2569) |
| 228 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 235 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/27-finance-api-contracts.md` (37 KB, 318 บรรทัด — v3.34)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 27-finance-api-contracts.md |
| 3 | # 27 — Finance API Contracts (รวม API Endpoint ทั้งระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 59 | ## 1. Summary |
| 63 | ## 2. Purpose |
| 67 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 71 | ## 6. API Endpoints รวมทั้งหมด (จัดกลุ่มตาม Resource) |
| 73 | ### 6.1 Settings (ไฟล์ 13) |
| 100 | ### 6.2 Master Data (ไฟล์ 10, 12) |
| 114 | ### 6.3 Payee (ไฟล์ 18) |
| 125 | ### 6.4 Claims & Advances (ไฟล์ 15) — เติม endpoint แล้ว |
| 147 | ### 6.5 Compensation Approval (ไฟล์ 16) |
| 156 | ### 6.6 Payout (ไฟล์ 17) |
| 172 | ### 6.7 Revenue & Billing (ไฟล์ 19) |
| 186 | ### 6.8 Adjustment (ไฟล์ 20) |
| 200 | ### 6.9 Dashboard & Reports (ไฟล์ 14, 21) |
| 211 | ### 6.10 Accounting: Sales & Receipts (ไฟล์ 31) |
| 222 | ### 6.11 Accounting: Expenses (ไฟล์ 32) |
| 230 | ### 6.12 Accounting: WHT (ไฟล์ 33) |
| 240 | ### 6.13 Exceptions (ไฟล์ 34) |
| 250 | ### 6.14 Bank Reconciliation (ไฟล์ 35) |
| 261 | ### 6.15 Accountant Questions (ไฟล์ 36) |
| 269 | ### 6.16 Monthly Close & Export (ไฟล์ 30, 37) |
| 283 | ### 6.17 ตัวอย่างเอกสารทั้งหมด (ไฟล์ 28 §6.5 — มติ PO U104) |
| 290 | ## 7. REST Convention ที่ใช้สม่ำเสมอทั้งระบบ |
| 299 | ## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 305 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 311 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/28-finance-export-pdf-spec.md` (48 KB, 177 บรรทัด — v2.14)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 28-finance-export-pdf-spec.md |
| 3 | # 28 — Finance Export PDF Spec (เอกสาร PDF ทั้งหมด) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 38 | ## 1. Summary |
| 42 | ## 2. Purpose |
| 46 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 50 | ## 6. รายการเอกสาร PDF ทั้งหมด |
| 52 | ### 6.0 หัวเอกสารกลาง (Letterhead) — มติ PO 06/10/2569 (U99) |
| 61 | ### 6.0.1 เลย์เอาต์เอกสารตามแบบที่อนุมัติ — มติ PO 06/10/2569 (U100/U101) |
| 85 | ### 6.1 เอกสารภายใน (Internal — ไม่มีข้อกำหนดทางกฎหมาย, อ้างอิงไฟล์ 13 §6.7) |
| 102 | ### 6.2 เอกสารทางการ — ใบกำกับภาษี (ไฟล์ 31 §6.2) 🔶 มีข้อกำหนดทางกฎหมายเข้มงวด |
| 119 | ### 6.3 เอกสารทางการ — หนังสือรับรองการหักภาษี ณ ที่จ่าย (ใบ 50 ทวิ) (ไฟล์ 33 §6.3) 🔶 ม... |
| 134 | ### 6.4 Document Checklist Export (ไฟล์ 34, ใช้ XLSX ไม่ใช่ PDF) |
| 138 | ### 6.5 หน้าตัวอย่างเอกสารทั้งหมด — มติ PO 06/10/2569 (U104) |
| 149 | ## 7. Implementation Notes |
| 157 | ## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 163 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 169 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/30-accounting-handover-monthly-close.md` (35 KB, 201 บรรทัด — v2.14)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 30-accounting-handover-monthly-close.md |
| 3 | # 30 — Accounting Handover & Monthly Close (ปิดงวดบัญชีรายเดือน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 37 | ## 1. Summary |
| 41 | ## 2. Purpose |
| 45 | ## 3. In Scope |
| 51 | ## 4. Out of Scope |
| 57 | ## 5. Actors & Responsibilities |
| 64 | ## 6. Core Concepts |
| 66 | ### 6.1 Accounting Period State Machine |
| 74 | ### 6.2 ความพร้อมก่อนปิดงวด (Readiness Check) |
| 88 | ### 6.2a ส่ง/ล็อกได้เมื่องวดสิ้นเดือนแล้วเท่านั้น (มติ PO U51) |
| 96 | ## 7. Data Entities / Required Objects |
| 98 | ### 7.1 Accounting Period |
| 110 | ## 8. UI / UX Rules |
| 118 | ## 9. Workflow / Lifecycle |
| 124 | ## 10. Security / Control Rules |
| 129 | ## 11. Validation & Error Handling |
| 139 | ## 12. Permission Requirements |
| 148 | ## 13. Audit Log Requirements |
| 153 | ## 14. API / Integration Draft |
| 164 | ## 15. Acceptance Criteria |
| 170 | ## 16. Test Cases |
| 187 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 194 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/31-accounting-sales-and-receipts.md` (79 KB, 343 บรรทัด — v4.9)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 31-accounting-sales-and-receipts.md |
| 3 | # 31 — Accounting: Sales and Receipts (บัญชีขายและเงินรับ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 39 | ## 1. Summary |
| 43 | ## 2. Purpose |
| 47 | ## 3. In Scope |
| 55 | ## 4. Out of Scope |
| 61 | ## 5. Actors & Responsibilities |
| 68 | ## 6. Core Concepts |
| 70 | ### 6.1 Sales Record (รายการขาย — มุมมองบัญชี) |
| 74 | ### 6.1.1 ใบแจ้งหนี้/ใบวางบิล (มติ PO 06/10/2569 U95 · U96 #12) |
| 80 | ### 6.2 ใบเสร็จรับเงิน/ใบกำกับภาษี (Tax Invoice) 🔶 มีข้อกำหนดทางกฎหมายเข้มงวด — ต้องให้... |
| 112 | ### 6.3 Cash Receipt (เงินรับจริง) |
| 118 | ### 6.4 Receipt (ใบเสร็จรับเงิน) |
| 122 | ### 6.5 Credit Note (ใบลดหนี้ — มติ PO 05/10/2569 (U14 — บันทึกใบลดหนี้ที่สำนักงานบัญชี... |
| 135 | ### 6.6 50 ทวิ ที่ลูกค้าหักเรา (มติ PO 05/10/2569 U40 — แบบเต็ม) |
| 146 | ## 7. Data Entities / Required Objects |
| 148 | ### 7.1 Sales Record |
| 158 | ### 7.2 Tax Invoice (แก้ไข status แล้ว — ดู Changelog v2) |
| 179 | ### 7.3 Cash Receipt |
| 190 | ### 7.4 Credit Note (มติ PO 05/10/2569 (U14 — บันทึกใบลดหนี้ที่สำนักงานบัญชีออก)) |
| 207 | ## 8. UI / UX Rules |
| 216 | ## 9. Workflow / Lifecycle |
| 218 | ### 9.1 Tax Invoice (แก้ไขแล้ว) |
| 224 | ### 9.2 Cash Receipt |
| 228 | ## 10. Security / Control Rules |
| 234 | ## 11. Validation & Error Handling |
| 255 | ## 12. Permission Requirements |
| 263 | ## 13. Audit Log Requirements |
| 269 | ## 14. API / Integration Draft |
| 285 | ## 15. Acceptance Criteria |
| 291 | ## 16. Test Cases |
| 327 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 335 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/33-accounting-wht-data.md` (46 KB, 233 บรรทัด — v3.14)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 33-accounting-wht-data.md |
| 3 | # 33 — Accounting: WHT Data (ข้อมูลหัก ณ ที่จ่ายและหนังสือรับรอง) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 39 | ## 1. Summary |
| 43 | ## 2. Purpose |
| 47 | ## 3. In Scope |
| 53 | ## 4. Out of Scope |
| 58 | ## 5. Actors & Responsibilities |
| 64 | ## 6. Core Concepts |
| 66 | ### 6.1 WHT Summary (สรุปข้อมูลหัก ณ ที่จ่ายรอนำส่ง) |
| 74 | ### 6.2 กำหนดเวลานำส่งภาษี 🔶 มีโทษปรับจริงหากพลาด — ต้องเตือนให้ชัดเจน |
| 78 | ### 6.3 หนังสือรับรองการหักภาษี ณ ที่จ่าย (ใบ 50 ทวิ) |
| 99 | ### 6.4 ผู้รับนิติบุคคล (มติ PO 06/10/2569 — UAT U96 #2) |
| 103 | ## 7. Data Entities / Required Objects |
| 105 | ### 7.1 WHT Certificate (หนังสือรับรองหัก ณ ที่จ่าย) |
| 129 | ### 7.2 WHT Filing Period Summary |
| 142 | ## 8. UI / UX Rules |
| 149 | ## 9. Workflow / Lifecycle |
| 161 | ## 10. Security / Control Rules |
| 166 | ## 11. Validation & Error Handling |
| 174 | ## 12. Permission Requirements |
| 181 | ## 13. Audit Log Requirements |
| 185 | ## 14. API / Integration Draft |
| 195 | ## 15. Acceptance Criteria |
| 200 | ## 16. Test Cases |
| 218 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 226 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

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

### `docs/35-bank-reconciliation.md` (39 KB, 215 บรรทัด — v2.9)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 35-bank-reconciliation.md |
| 3 | # 35 — Bank Reconciliation (กระทบยอดธนาคาร) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 32 | ## 1. Summary |
| 36 | ## 2. Purpose |
| 40 | ## 3. In Scope |
| 47 | ## 4. Out of Scope |
| 52 | ## 5. Actors & Responsibilities |
| 58 | ## 6. Core Concepts |
| 60 | ### 6.1 Bank Transaction (รายการจาก Statement) |
| 64 | ### 6.2 Auto-matching Logic |
| 77 | ### 6.3 Manual Matching |
| 85 | ### 6.4 Unmatched Resolved (เพิ่มใหม่ — ดู Changelog v2) |
| 89 | ### 6.5 เงินรับรอตรวจสอบ (มติ PO 05/10/2569 U41) |
| 97 | ### 6.6 คู่ที่ระบบเสนอ — จับคู่ทางกลับ (มติ PO U137) |
| 106 | ## 7. Data Entities / Required Objects |
| 108 | ### 7.1 Bank Transaction (แก้ไข matching structure แล้ว — ดู Changelog v2) |
| 125 | ## 8. UI / UX Rules |
| 134 | ## 9. Workflow / Lifecycle |
| 138 | ## 10. Security / Control Rules |
| 144 | ## 11. Validation & Error Handling |
| 151 | ## 12. Permission Requirements |
| 158 | ## 13. Audit Log Requirements |
| 163 | ## 14. API / Integration Draft |
| 175 | ## 15. Acceptance Criteria |
| 182 | ## 16. Test Cases |
| 201 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 208 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/37-accounting-pack-export-history.md` (65 KB, 210 บรรทัด — v2.28)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 37-accounting-pack-export-history.md |
| 3 | # 37 — Accounting Pack Export History (ประวัติส่งมอบบัญชี) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 51 | ## 1. Summary |
| 55 | ## 2. Purpose |
| 59 | ## 3. In Scope |
| 65 | ## 4. Out of Scope |
| 70 | ## 5. Actors & Responsibilities |
| 76 | ## 6. Core Concepts |
| 78 | ### 6.1 รายชื่อไฟล์มาตรฐานใน Accounting Pack (เรียงเลขต่อเนื่อง พร้อม Adjustment Log) |
| 104 | ### 6.2 Version Control |
| 108 | ## 7. Data Entities / Required Objects |
| 110 | ### 7.1 Export Record (แก้ไข status แล้ว — ดู Changelog v2) |
| 124 | ## 8. UI / UX Rules |
| 133 | ## 9. Workflow / Lifecycle |
| 139 | ## 10. Security / Control Rules |
| 144 | ## 11. Validation & Error Handling |
| 150 | ## 12. Permission Requirements |
| 157 | ## 13. Audit Log Requirements |
| 162 | ## 14. API / Integration Draft |
| 171 | ## 15. Acceptance Criteria |
| 178 | ## 16. Test Cases |
| 196 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 203 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/38-case-submission.md` (145 KB, 564 บรรทัด — v3.25)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 38-case-submission.md |
| 3 | # 38 — Case Submission (รับเคส) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 51 | ## 1. Summary |
| 55 | ## 2. Purpose |
| 59 | ## 3. Scope |
| 61 | ### 3.1 In Scope |
| 69 | ### 3.2 Out of Scope (ยกไป Sprint ถัดไป / เอกสารอื่น) |
| 76 | ## 4. Actors & Responsibilities |
| 89 | ## 5. Menu & Navigation |
| 95 | ## 6. Data Requirements |
| 97 | ### 6.1 Required Fields — ข้อมูลลูกหนี้/คู่สัญญา |
| 119 | ### 6.1.1 Identity Document — Conditional ตามสัญชาติ |
| 127 | ### 6.1.2 Address Structure (ใช้ร่วมกันทั้ง 3 ที่อยู่) |
| 143 | ### 6.1.3 Contact Persons (ผู้ติดต่ออื่น) — Repeatable |
| 150 | ### 6.2 Required Fields — ข้อมูลทรัพย์/สินค้า |
| 161 | ### 6.3 Document Checklist (เอกสารแนบ) |
| 176 | ### 6.3.1 Product Photo (รูปสินค้า) — แยกเป็น Section ของตัวเอง |
| 186 | ### 6.3.2 โหมดเอกสารชุดเดียว (สแกนรวมเล่ม) — v3.2 |
| 199 | ### 6.3.3 ติ๊กรูปสินค้า · จำโหมด · ลบเอกสารที่แนบผิด — v3.5 |
| 207 | ### 6.4 Derived / Computed Fields |
| 223 | ### 6.5 Projected Revenue Calculation (ประมาณการรายได้ก่อนรับเคส) |
| 239 | ### 6.6 Re-track / Recycle Flow (เคสไม่สำเร็จ — ไฟแนนซ์ขอให้ลองใหม่) |
| 250 | ## 7. UI Requirements |
| 252 | ### 7.1 Page Layout |
| 262 | ### 7.2 Table Behavior |
| 272 | ### 7.3 Form / Modal Behavior (Manual Entry) |
| 289 | ### 7.4 Team Suggestion UI |
| 299 | ### 7.5 Case Detail / Review Modal (Consolidated) |
| 322 | ## 8. Actions & Buttons |
| 339 | ## 9. Workflow |
| 355 | ## 10. Status / State Machine |
| 370 | ## 11. Business Rules |
| 381 | ## 12. Validation & Error Handling |
| 407 | ## 13. Permissions |
| 421 | ## 14. Audit Log |
| 435 | ## 15. Notifications |
| 441 | ## 16. Integration Points |
| 449 | ## 17. API / Event Contract Draft |
| 451 | ### 17.1 API Endpoints |
| 467 | ### 17.2 Events |
| 477 | ## 18. Export / Document Requirements |
| 481 | ## 19. Acceptance Criteria |
| 490 | ## 20. Test Cases |
| 537 | ## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 549 | ## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/40-case-assignment-routing.md` (91 KB, 373 บรรทัด — v2.9)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 40-case-assignment-routing.md |
| 3 | # 40 — Case Assignment & Routing (มอบหมายและวางแผนงาน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 33 | ## 1. Summary |
| 36 | ## 2. Purpose |
| 39 | ## 3. Scope |
| 41 | ### 3.1 In Scope |
| 48 | ### 3.2 Out of Scope (ส่งต่อเอกสารอื่น/Sprint ถัดไป) |
| 55 | ## 4. Actors & Responsibilities |
| 67 | ## 5. Menu & Navigation |
| 72 | ## 6. Data Requirements |
| 74 | ### 6.1 Required Fields |
| 88 | ### 6.1.1 Pending Reassignment Object |
| 100 | ### 6.2 Agent Decision-Support Fields (แสดงเฉพาะหน้ามอบหมาย ไม่ผูกกับ case) |
| 108 | ### 6.3 Derived / Computed Fields |
| 112 | ### 6.4 Settings Config — Supervisor Action Permission |
| 124 | ## 7. UI Requirements |
| 126 | ### 7.1 Page Layout |
| 132 | ### 7.2 Table Behavior |
| 145 | ### 7.3 Assignment Modal (Manager) — Consolidated: Case Detail + Agent Picker |
| 164 | ### 7.4 Agent Accept UI |
| 169 | ### 7.5 Kanban Board — ภาพรวม Workload ของทีม |
| 177 | ## 8. Actions & Buttons |
| 186 | ## 9. Workflow |
| 208 | ## 10. Status / State Machine |
| 218 | ## 11. Business Rules |
| 235 | ## 12. Validation & Error Handling |
| 248 | ## 13. Permissions |
| 265 | ## 14. Audit Log |
| 273 | ## 15. Notifications |
| 280 | ## 16. Integration Points |
| 286 | ## 17. API / Event Contract Draft |
| 288 | ### 17.1 API Endpoints |
| 302 | ### 17.2 Events |
| 311 | ## 18. Export / Document Requirements |
| 314 | ## 19. Acceptance Criteria |
| 324 | ## 20. Test Cases |
| 352 | ## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 364 | ## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/41-field-tracker-mobile.md` (182 KB, 632 บรรทัด — v2.37)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 41-field-tracker-mobile.md |
| 3 | # 41 — Field Tracker Mobile (ติดตามภาคสนาม) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 12 | ## Changelog |
| 61 | ## 1. Summary |
| 64 | ## 2. Purpose |
| 67 | ## 3. Scope |
| 69 | ### 3.1 In Scope |
| 78 | ### 3.2 Out of Scope (ยกไปเฟส/เอกสารอื่น) |
| 85 | ## 4. Actors & Responsibilities |
| 96 | ## 5. Menu & Navigation |
| 98 | ### 5.1 Mobile — Bottom Nav (4 รายการ) + Top Bar |
| 107 | ### 5.2 Desktop — Sidebar ถาวร (Fixed) |
| 114 | ## 6. Data Requirements |
| 116 | ### 6.1 Case Assignment Status (รับช่วงจากไฟล์ 40) |
| 129 | ### 6.2 Address Structure (3 ที่อยู่ — รับมาจากไฟล์ 38 §6.1.2) |
| 139 | ### 6.3 Contact Methods (คลิกเพื่อติดต่อได้จริง) |
| 147 | ### 6.4 Evidence (หลักฐานการปิดงาน) |
| 161 | ### 6.4.1 Travel Origin (จุดเริ่มเดินทาง — สำหรับคำนวณค่าน้ำมัน PER_KM) |
| 174 | ### 6.4.2 Distance Calculation (คำนวณระยะทางสำหรับค่าน้ำมัน PER_KM) |
| 181 | ### 6.5 Close-Case Draft (บันทึกฟอร์มปิดงานแบบไม่ครบ) |
| 191 | ### 6.6 Expense (ค่าใช้จ่าย) |
| 228 | ### 6.7 Pending Reassignment (รับมาจากไฟล์ 40) |
| 238 | ### 6.8 Derived / Computed Fields |
| 243 | ## 7. UI Requirements |
| 245 | ### 7.1 Dashboard (หน้าแรก) |
| 255 | ### 7.2 แท็บ "รอรับงาน" |
| 261 | ### 7.3 แท็บ "รับงานแล้ว" (จัดวันที่) |
| 267 | ### 7.4 Calendar Picker (เลือกวันที่ติดตาม) |
| 278 | ### 7.5 แท็บ "กำลังติดตาม" |
| 289 | ### 7.6 ฟอร์มปิดงาน (Close Case) |
| 310 | ### 7.7 Case Detail (รายละเอียดเคสแบบเต็ม) |
| 323 | ### 7.8 Pending Reassignment Flow (ตอบรับ/ปฏิเสธคำขอเปลี่ยนผู้รับผิดชอบ) |
| 332 | ### 7.9 เบิกค่าใช้จ่าย |
| 340 | ### 7.10 สรุปรายได้ |
| 346 | ### 7.11 แท็บ "จบงาน" |
| 351 | ## 8. Actions & Buttons |
| 370 | ## 9. Workflow |
| 396 | ## 10. Status / State Machine |
| 410 | ### 10.1 QC Outcome — สรุปกฎการตีกลับ (ปิด Open Item #9) |
| 431 | ## 11. Business Rules |
| 444 | ## 12. Validation & Error Handling |
| 471 | ## 13. Permissions |
| 480 | ## 14. Audit Log |
| 488 | ## 15. Notifications |
| 500 | ## 16. Integration Points |
| 507 | ## 17. API / Event Contract Draft |
| 509 | ### 17.1 API Endpoints |
| 528 | ### 17.2 Events |
| 544 | ## 18. Export / Document Requirements |
| 547 | ## 19. Acceptance Criteria |
| 554 | ## 20. Test Cases |
| 603 | ## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 618 | ## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/44-asset-custody-handover.md` (69 KB, 692 บรรทัด — v2.16)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 44-asset-custody-handover.md |
| 3 | # 44 — Asset Custody & Handover (คลังสินค้าและการส่งมอบทรัพย์คืน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 41 | ## 1. Summary |
| 44 | ## 2. Purpose |
| 50 | ## 3. In Scope |
| 58 | ## 4. Out of Scope |
| 66 | ## 5. Actors & Responsibilities |
| 79 | ## 6. Core Concepts |
| 81 | ### 6.1 Asset (ทรัพย์ที่ยึดคืน) |
| 86 | ### 6.2 HandoverLot (ล็อตส่งมอบ) |
| 95 | ### 6.3 รูปแบบการส่งมอบ (HandoverType) |
| 104 | ### 6.4 เอกสาร |
| 111 | ### 6.5 IMEI Validation |
| 120 | ## 7. Data Entities / Required Objects |
| 122 | ### 7.1 Asset |
| 160 | ### 7.2 HandoverLot |
| 195 | ## 8. UI / UX Rules (อ้างอิง warehouse.html) |
| 197 | ### 8.1 โครงสร้างหน้า |
| 208 | ### 8.2 แท็บ "รับเข้าคลัง" |
| 252 | ### 8.3 แท็บ "ในคลัง" |
| 291 | ### 8.4 แท็บ "รอส่งมอบ" |
| 316 | ### 8.5 แท็บ "ส่งมอบแล้ว" |
| 337 | ## 9. Workflow / State Machines |
| 339 | ### 9.1 Asset Status Flow |
| 362 | ### 9.2 HandoverLot Status Flow |
| 389 | ### 9.3 สรุป Draft / Confirmed ใน UI |
| 401 | ## 10. Security / Control Rules |
| 418 | ## 11. ผลกระทบต่อ Module อื่นเมื่อ Lot.status = confirmed |
| 456 | ## 12. Validation & Error Handling |
| 483 | ## 13. Permission Requirements |
| 500 | ## 14. Audit Log Requirements |
| 517 | ## 15. API Endpoints |
| 519 | ### Assets |
| 562 | ### HandoverLots |
| 638 | ## 16. Acceptance Criteria |
| 654 | ## 17. Test Cases |
| 676 | ## 18. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 687 | ## 19. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/45-case-warehouse-api-contracts.md` (31 KB, 202 บรรทัด — v1.19)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 45-case-warehouse-api-contracts.md |
| 3 | # 45 — Case & Warehouse API Contracts (รวม API Endpoint ทั้งระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 42 | ## 1. Summary |
| 46 | ## 2. Purpose |
| 50 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 54 | ## 6. API Endpoints รวมทั้งหมด (จัดกลุ่มตาม Resource) |
| 56 | ### 6.1 Case Submission (ไฟล์ 38) |
| 73 | ### 6.2 Case Assignment & Routing (ไฟล์ 40) |
| 87 | ### 6.3 Field Tracker — Mobile/Desktop (ไฟล์ 41) |
| 113 | ### 6.4 Warehouse — Assets (ไฟล์ 44) |
| 122 | ### 6.5 Warehouse — Handover Lots (ไฟล์ 44) |
| 137 | ## 7. Events รวม (สรุปย่อ — รายละเอียดเต็มดูไฟล์ต้นทาง §17.2/§16) |
| 173 | ## 8. REST Convention ที่ใช้สม่ำเสมอทั้งระบบ |
| 183 | ## 9-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 189 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 195 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/90-platform-audit-notification-reporting.md` (42 KB, 260 บรรทัด — v4.12)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 90-platform-audit-notification-reporting.md |
| 3 | # 90 — Platform Audit, Notification & Reporting |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 40 | ## 1. Summary |
| 44 | ## 2. Purpose |
| 48 | ## 3. In Scope |
| 54 | ## 4. Out of Scope |
| 59 | ## 5. Actors & Responsibilities |
| 74 | ## 6. Core Concepts |
| 82 | ### 6.1 Event Flow (Audit → Notification) |
| 101 | ### 6.2 PDPA / Privacy Scope (Draft — 03/07/2569) |
| 131 | ### 6.3 Notification Channel & Event Trigger (Decided — 03/07/2569) |
| 161 | ## 7. Data Entities / Required Objects |
| 171 | ## 8. UI / UX Rules |
| 178 | ## 9. Workflow / Lifecycle |
| 182 | ## 10. Security / Control Rules |
| 188 | ## 11. Validation & Error Handling |
| 197 | ## 12. Permission Requirements |
| 204 | ## 13. Audit Log Requirements |
| 212 | ## 14. API / Integration Draft |
| 223 | ## 15. Acceptance Criteria |
| 230 | ## 16. Test Cases |
| 242 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 251 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/91-platform-api-integration-jobs.md` (43 KB, 266 บรรทัด — v2.15)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 91-platform-api-integration-jobs.md |
| 3 | # 91 — Platform API Integration & Background Jobs |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 39 | ## 1. Summary |
| 43 | ## 2. Purpose |
| 47 | ## 3. In Scope |
| 53 | ## 4. Out of Scope |
| 58 | ## 5. Actors & Responsibilities |
| 73 | ## 6. Core Concepts |
| 81 | ### 6.1 Job Type ที่ระบบรู้จัก (จาก `02-database-schema-design.md` §10) |
| 96 | ### 6.2 Job Lifecycle (State Diagram) |
| 112 | ### 6.3 คิวแจ้งเตือนของ job (Notification Outbox — มติ PO 06/10/2569 U120 · DEC-015) |
| 124 | ### 6.4 ตัวกวาดขั้นหลังรอบจ่ายสำเร็จ (`payout_completion_repair` — มติ PO 07/10/2569 U134) |
| 136 | ## 7. Data Entities / Required Objects |
| 144 | ## 8. UI / UX Rules |
| 151 | ## 9. Workflow / Lifecycle |
| 155 | ## 10. Security / Control Rules |
| 161 | ## 11. Validation & Error Handling |
| 171 | ## 12. Permission Requirements |
| 178 | ## 13. Audit Log Requirements |
| 185 | ## 14. API / Integration Draft |
| 196 | ### 14.1 Dev Trigger Endpoint (`/api/dev/trigger-job`) |
| 207 | ### 14.2 Dev ส่ง/ล็อกงวดด้วยวันที่จำลอง (`/api/dev/accounting-periods/{id}/send\|lock` ... |
| 223 | ## 15. Acceptance Criteria |
| 230 | ## 16. Test Cases |
| 247 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 257 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

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

### `docs/94-decision-log.md` (58 KB, 346 บรรทัด — v3.10)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 94-decision-log.md |
| 3 | # 94 — Decision Log |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 36 | ## 1. Summary |
| 40 | ## 2. Purpose |
| 44 | ## 3. In Scope |
| 50 | ## 4. Out of Scope |
| 55 | ## 5. Actors & Responsibilities |
| 70 | ## 6. Core Concepts |
| 78 | ## 7. Data Entities / Required Objects |
| 85 | ## 8. UI / UX Rules |
| 91 | ## 9. Workflow / Lifecycle |
| 95 | ## 10. Security / Control Rules |
| 100 | ## 11. Validation & Error Handling |
| 109 | ## 12. Permission Requirements |
| 117 | ## 13. Audit Log Requirements |
| 124 | ## 14. API / Integration Draft |
| 132 | ## 15. Acceptance Criteria |
| 139 | ## 16. Test Cases |
| 150 | ## 17. Decision Records (Source of Truth ทุก DEC ของโปรเจกต์) |
| 152 | ### DEC-001 — Tech Stack (02/07/2569) |
| 162 | ### DEC-002 — Permission Architecture (02/07/2569) |
| 172 | ### DEC-003 — File Storage (02/07/2569) |
| 182 | ### DEC-004 — Polymorphic Relation Pattern (02/07/2569) |
| 192 | ### DEC-005 — UI Datetime Calendar Standard (03/07/2569) |
| 202 | ### DEC-006 — Batch 6 Consistency Sync: คำตอบ D1–D10 ครบชุด (04/07/2569) |
| 212 | ### DEC-007 — Mockup Audit: ผลตรวจ HTML Mockup ทั้งชุด (04/07/2569) |
| 222 | ### DEC-008 — Service Fee Template แสดงผลแบบการ์ด (05/07/2569) |
| 232 | ### DEC-009 — Functional Permission Matrix ใช้ระดับสิทธิ์ 3 ระดับ (05/07/2569) |
| 242 | ### DEC-010 — Login ด้วยอีเมลหรือ username + ผู้ดูแลตั้งรหัสผ่านให้ผู้ใช้ (03/10/2569) |
| 252 | ### DEC-011 — Playwright เป็นเครื่องมือ UAT ฝั่ง dev (03/10/2569) |
| 262 | ### DEC-012 — ค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยงเกิดจาก job รายวันหลังจบวัน (03/10/2569) |
| 272 | ### DEC-013 — SheetJS ติดตั้งจาก cdn.sheetjs.com (pin tarball) ไม่ใช่ npm registry (04/... |
| 282 | ### DEC-014 — Storage: ไม่มี policy ให้ผู้ใช้ · ทุกการเข้าถึงไฟล์ผ่าน server + โทเคน/si... |
| 292 | ### DEC-015 — Notification outbox: แจ้งเตือนของ job เข้าคิวในทรานแซกชันเดียวกับการเปลี่... |
| 302 | ### DEC-016 — แคตตาล็อก Model Phone เติมจาก RapidAPI "Mobile Phone Specs Database" (07/... |
| 314 | ### DEC-017 — ยี่ห้อ/รุ่นจาก IMEI (TAC) ด้วยไฟล์เปิด `MoazEb/tac-database` แทน RapidAPI... |
| 326 | ### DEC-018 — เครื่องมือทดสอบบน Vercel Preview เปิดด้วย `ENABLE_DEV_TOOLS=1` (10/10/2569) |
| 338 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

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

### `docs/96-reports.md` (51 KB, 503 บรรทัด — v2.15)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 96-reports.md |
| 3 | # 96 — Reports (รายงานภาพรวมระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 39 | ## 1. Summary |
| 43 | ## 2. Purpose |
| 46 | ## 3. In Scope |
| 52 | ## 4. Out of Scope |
| 57 | ## 5. Actors & Responsibilities |
| 69 | ## 6. รายงานทั้งหมด |
| 71 | ### หมวด F — รายงานการเงิน |
| 207 | ### หมวด O — รายงานงานติดตามทรัพย์ |
| 287 | ### หมวด A — รายงานบัญชี |
| 336 | ### หมวด E — Executive Dashboard |
| 370 | ## 7. Data Sources (ดึงข้อมูลจากไหน) |
| 392 | ## 8. Caching Strategy |
| 405 | ## 9. API Endpoints |
| 432 | ## 10. Permission Matrix |
| 443 | ## 11. UI / UX Rules |
| 454 | ## 12. Validation & Error Handling |
| 465 | ## 13. Acceptance Criteria |
| 477 | ## 14. Test Cases |
| 494 | ## 15. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 501 | ## 16. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/97-client-portal.md` (96 KB, 382 บรรทัด — v6.15)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 97-client-portal.md |
| 3 | # 97 — Client Portal (พอร์ทัลบริษัทไฟแนนซ์) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 53 | ## 1. Summary |
| 56 | ## 2. Purpose |
| 59 | ## 3. Scope |
| 61 | ### 3.1 In Scope |
| 70 | ### 3.2 Out of Scope (ยืนยันถาวร — ไม่ใช่ Open Item) |
| 76 | ### 3.3 รอการตัดสินใจ (ดู §22) |
| 92 | ## 4. Actors & Responsibilities |
| 104 | ## 5. Menu & Navigation |
| 127 | ## 6. Data Requirements |
| 129 | ### 6.1 เคสของเรา (จากไฟล์ 38) |
| 144 | ### 6.2 รอบวางบิล / AR (จากไฟล์ 19) |
| 159 | ### 6.3 ใบกำกับภาษี (จากไฟล์ 31) |
| 162 | ### 6.4 ใบส่งมอบทรัพย์ (จากไฟล์ 44) |
| 173 | ### 6.5 รายงานสรุป |
| 177 | ### 6.6 ข้อมูลบริษัท (read-only) |
| 182 | ## 7. UI Requirements |
| 189 | ## 8. Actions & Buttons |
| 202 | ## 9. Workflow |
| 210 | ## 10. Status / State Machine |
| 212 | ### 10.1 Case Status Mapping (ใหม่ — เฉพาะพอร์ทัลนี้ ไม่ใช่ state machine ใหม่ แค่ labe... |
| 225 | ### 10.2 HandoverLot Status Mapping |
| 232 | ### 10.3 Tax Invoice / Billing Batch |
| 237 | ## 11. Business Rules |
| 248 | ## 12. Validation & Error Handling |
| 257 | ## 13. Permissions |
| 271 | ### 13.1 ดู portal ในฐานะลูกค้า (ผู้ใช้ภายใน — มติ PO 05/10/2569 U59) |
| 286 | ## 14. Audit Log |
| 293 | ## 15. Notifications |
| 296 | ## 16. Integration Points |
| 299 | ## 17. API / Event Contract Draft |
| 332 | ## 18. Export / Document Requirements |
| 338 | ## 19. Acceptance Criteria |
| 346 | ## 20. Test Cases |
| 360 | ## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions — ยืนยันในรอบสนทนานี้ 03/07/2569) |
| 371 | ## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

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

### `docs/PROGRESS_ARCHIVE.md` (505 KB, 2170 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # PROGRESS_ARCHIVE.md — รายละเอียดเต็มของงานที่เสร็จแล้ว |
| 8 | ## Phase 8.4 — Final Test รอบสุดท้าย (มติ U119 · ด่าน 1–7 + 7b) |
| 12 | ### สิ่งที่ทำ |
| 19 | ### บั๊กที่แก้ (สำคัญ) |
| 23 | ### ค้าง / จุดที่คนถัดไปควรรู้ |
| 33 | ## Phase 6.6 — แดชบอร์ดหลัก (เมนูแรก Top Nav) |
| 37 | ### สิ่งที่ทำ |
| 45 | ### widget ต่อ role (matrix ค่าเริ่มต้น — ล็อกด้วย `lib/dashboard/widgets.test.ts`) |
| 60 | ### จุดเบี่ยงจาก mockup (มติ PO 2026-08-16 — บันทึกครบ) |
| 74 | ### เทสต์ |
| 79 | ### verify ที่รันจริง |
| 82 | ### จุดที่คนถัดไปควรรู้ |
| 88 | ## Phase 8.3 — Final Test ทั้งระบบ (ด่านของ orchestrator) |
| 94 | ### ด่าน 1 / 4 / 5 (session ก่อนหน้าในก้อนงานเดียวกัน) |
| 99 | ### ด่าน 6 — ความทนทาน: เทสต์ที่ยังขาดของยามที่กู้มาจาก session ที่ถูกตัด (`1eee46e` → ... |
| 106 | ### ด่าน 3 — บัญชี: ใบ 50 ทวิ ออกซ้ำได้ (`9a4e3a7`) |
| 109 | ### ด่าน 2 + 3 — **A1 ลูกค้าหักภาษีก่อนโอน ตายทั้งเส้น** (`e852f36`) ⚠️ จุดที่ร้ายแรงที... |
| 118 | ### ด่าน 2 — ใบกำกับภาษีออกซ้ำ 2 ใบต่อรายการขายเดียว (`0e8f872`) |
| 121 | ### ด่าน 2 — อีก 3 จุด (`adea507` + `bcf2086` + `94d66ef`) |
| 127 | ### สิ่งที่คนถัดไปควรรู้ |
| 135 | ## Phase 8.2 — Consistency Sweep + Hardening |
| 141 | ### แกน 1–2: เงิน satang + วันที่ พ.ศ. (`0ae328c`) |
| 148 | ### แกน 3: RBAC + scope ย่อย (`91de430`) |
| 155 | ### แกน 4: audit ครบ 9 fields + `reason` (`9bd34bc`) |
| 161 | ### แกน 5: Idempotency (`b69a6b2` · `c98f9a7` · `05cd29f`) |
| 169 | ### Immutable Rules ครบทุกตารางของ `02` §13 (`32b71ff`) |
| 172 | ### Index profiling ของ query ที่ join หนัก (`0d743f9`) |
| 175 | ### สิ่งที่คนถัดไปต้องรู้ |
| 183 | ## Phase 8.1 — E2E Acceptance Tests (ไฟล์ 29) |
| 187 | ### สิ่งที่ทำ |
| 199 | ### การตัดสินใจระหว่างทาง |
| 206 | ### จุดที่คนถัดไปควรรู้ |
| 213 | ### verify ที่รันจริง |
| 218 | ## Phase 6.5 — Executive Dashboard (E1–E3) |
| 222 | ### สิ่งที่ทำ |
| 233 | ### การตัดสินใจระหว่างทาง |
| 241 | ### จุดที่คนถัดไปควรรู้ |
| 250 | ## Phase 6.4 — รายงานหมวด A (A1–A4) |
| 254 | ### สิ่งที่ทำ |
| 266 | ### การตัดสินใจระหว่างทาง |
| 274 | ### จุดที่คนถัดไปควรรู้ |
| 282 | ## Phase 6.3 — รายงานหมวด O (O1–O5) + เกณฑ์ SLA (D18) |
| 286 | ### มติ PO ที่ปลดล็อกงานนี้ (D18) |
| 290 | ### สิ่งที่ทำ |
| 304 | ### การตัดสินใจระหว่างทาง |
| 311 | ### จุดที่คนถัดไปควรรู้ |
| 320 | ## Phase 6.2 — รายงานหมวด F (F1–F5) |
| 324 | ### สิ่งที่ทำ |
| 338 | ### การตัดสินใจระหว่างทาง |
| 348 | ### verify ที่รันจริง |
| 352 | ### จุดที่คนถัดไปควรรู้ |
| 360 | ## Phase 6.1 — Report Framework + Export Engine |
| 364 | ### สิ่งที่ทำ |
| 377 | ### การตัดสินใจระหว่างทาง (คนถัดไปควรรู้) |
| 388 | ### เทสต์ |
| 397 | ### ⚠️ ค้างฝั่ง environment |
| 403 | ## Phase 5.3 — Background Job Engine + Handlers + Job Log |
| 407 | ### สิ่งที่ทำ |
| 421 | ### การตัดสินใจระหว่างทาง (คนถัดไปควรรู้) |
| 432 | ### เทสต์ |
| 439 | ### ค้างไว้ให้คนถัดไป / ต้องทำนอกโค้ด |
| 447 | ## Phase 5.2 — Event Wiring ทุกโมดูล + Audit Log UI |
| 451 | ### สิ่งที่ทำ — ก้อนที่ 1: ต่อ event เข้าการแจ้งเตือน (`90` §6.3) |
| 475 | ### สิ่งที่ทำ — ก้อนที่ 2: หน้าบันทึกการใช้งาน (Audit Log UI — `90` §8/§12/§14) |
| 483 | ### การตัดสินใจระหว่างทาง |
| 493 | ### verify ที่รันจริง |
| 497 | ### จุดที่คนถัดไปควรรู้ |
| 506 | ## Phase 5.1 — Notification Service + Notification Center |
| 510 | ### สิ่งที่ทำ |
| 521 | ### การตัดสินใจระหว่างทาง |
| 529 | ### จุดที่คนถัดไปควรรู้ |
| 538 | ## Phase 4.7 — Accounting Frontend ที่เหลือ (shell + periods + exceptions + sales/recei... |
| 542 | ### สิ่งที่ทำ |
| 555 | ### การตัดสินใจระหว่างทาง |
| 565 | ### จุดที่คนถัดไปควรรู้ |
| 574 | ## Phase 4.6 — Accounting Pack Export (37) |
| 578 | ### สิ่งที่ทำ |
| 591 | ### การตัดสินใจระหว่างทาง |
| 602 | ### จุดที่คนถัดไปควรรู้ |
| 612 | ## Phase 4.5 — WHT Data (33) + ใบ 50 ทวิ PDF |
| 616 | ### สิ่งที่ทำ |
| 628 | ### การตัดสินใจระหว่างทาง |
| 636 | ### จุดที่คนถัดไปควรรู้ |
| 645 | ## Phase 4.4 — Accounting Expenses (32) + Accountant Questions (36) |
| 649 | ### สิ่งที่ทำ |
| 661 | ### การตัดสินใจระหว่างทาง (ยึด schema `02` เป็นหลัก — ตระกูลเดียวกับ D13) |
| 670 | ### จุดที่คนถัดไปควรรู้ |
| 680 | ## Phase 4.3 — Sales & Receipts + Tax Invoice + PDF (31) |
| 684 | ### สิ่งที่ทำ |
| 695 | ### การตัดสินใจระหว่างทาง (ยึด schema `02` เป็นหลัก) |
| 704 | ### จุดที่คนถัดไปควรรู้ |
| 714 | ## Phase 4.2 — Bank Reconciliation (35) |
| 718 | ### สิ่งที่ทำ |
| 729 | ### การตัดสินใจระหว่างทาง (ยึด schema `02` เป็นหลัก) |
| 739 | ### จุดที่คนถัดไปควรรู้ |
| 748 | ## Phase 4.1 — Exceptions (34) + Accounting Period / Readiness / Lock Guard (30) |
| 752 | ### สิ่งที่ทำ |
| 762 | ### การตัดสินใจระหว่างทาง (ยึด schema `02` เป็นหลักตาม Q4) |
| 770 | ### จุดที่คนถัดไปควรรู้ |
| 779 | ## Phase 3.8 — Profitability Report (21) + Finance Dashboard (14) — ปิด Phase 3 |
| 783 | ### สิ่งที่ทำ |
| 795 | ### การตัดสินใจระหว่างทาง |
| 805 | ### จุดที่คนถัดไปควรรู้ |
| 814 | ## Phase 3.7 — Billing FE (19 §8) + Adjustment ทั้งโมดูล (20) |
| 818 | ### สิ่งที่ทำ |
| 831 | ### การตัดสินใจระหว่างทาง |
| 841 | ### จุดที่คนถัดไปควรรู้ |
| 849 | ## Phase 3.6 — Revenue / Billing / AR Backend (19) |
| 853 | ### สิ่งที่ทำ |
| 864 | ### การตัดสินใจระหว่างทาง |
| 873 | ### จุดที่คนถัดไปควรรู้ |
| 882 | ## Phase 3.5 — Payout FE (17 §8) + เอกสารภายใน 3 ใบ (28 §6.1) |
| 886 | ### สิ่งที่ทำ |
| 896 | ### การตัดสินใจระหว่างทาง |
| 904 | ### จุดที่คนถัดไปควรรู้ |
| 913 | ## Phase 3.4 — Payout Batch Backend (17) + แท็บเงินทดรองจ่าย (15) |
| 917 | ### สิ่งที่ทำ |
| 928 | ### การตัดสินใจระหว่างทาง |
| 937 | ### จุดที่คนถัดไปควรรู้ |
| 946 | ## Phase 3.3 — Compensation Approval FE (16) + Claims & Advances (15) |
| 950 | ### สิ่งที่ทำ |
| 960 | ### การตัดสินใจระหว่างทาง |
| 970 | ### จุดที่คนถัดไปควรรู้ |
| 978 | ## Phase 3.2 — Payee & Tax Profile (18) + Compensation Approval Backend (16) |
| 982 | ### สิ่งที่ทำ |
| 995 | ### การตัดสินใจระหว่างทาง |
| 1005 | ### จุดที่คนถัดไปควรรู้ |
| 1014 | ## Phase 3.1 — Pure Finance Calculation Modules + Unit Tests (ไฟล์ 22 ครบ 13 สูตร) |
| 1018 | ### สิ่งที่ทำ |
| 1034 | ### การตัดสินใจระหว่างทาง |
| 1043 | ### จุดที่คนถัดไปควรรู้ |
| 1050 | ## Phase 2.15 — Warehouse Frontend ชุดที่ 2 (ส่งมอบ + แนบเอกสาร · ไฟล์ 44 §8.4–8.5) |
| 1054 | ### สิ่งที่ทำ |
| 1066 | ### การตัดสินใจระหว่างทาง |
| 1075 | ### verify ที่รันจริง |
| 1078 | ### จุดที่คนถัดไปควรรู้ |
| 1086 | ## Phase 2.14 — Warehouse Frontend ชุดที่ 1 (รับเข้าคลัง + ในคลัง · ไฟล์ 44 §8.1–8.3) |
| 1090 | ### สิ่งที่ทำ |
| 1102 | ### การตัดสินใจระหว่างทาง |
| 1111 | ### verify ที่รันจริง |
| 1114 | ### จุดที่คนถัดไปควรรู้ |
| 1121 | ## Phase 2.13 — Warehouse Backend (คลังสินค้า + ส่งมอบ · ไฟล์ 44) |
| 1125 | ### สิ่งที่ทำ |
| 1137 | ### การตัดสินใจระหว่างทาง |
| 1145 | ### verify ที่รันจริง |
| 1148 | ### จุดที่คนถัดไปควรรู้ |
| 1156 | ## Phase 2.12 — Field Tracker Frontend ชุดที่ 3 (เบิกเงิน + รายได้ + จบงาน + PWA) |
| 1160 | ### สิ่งที่ทำ |
| 1178 | ### การตัดสินใจระหว่างทาง |
| 1186 | ### verify ที่รันจริง |
| 1189 | ### จุดที่คนถัดไปควรรู้ |
| 1198 | ## Phase 2.11 — Field Tracker Frontend ชุดที่ 2 (ฟอร์มปิดงาน + คำขอเปลี่ยนผู้รับผิดชอบ) |
| 1202 | ### สิ่งที่ทำ |
| 1214 | ### การตัดสินใจระหว่างทาง |
| 1221 | ### verify ที่รันจริง |
| 1224 | ### จุดที่คนถัดไปควรรู้ |
| 1232 | ## Phase 2.10 — Field Tracker Frontend ชุดที่ 1 (shell + case detail + งานรายวัน + ปฏิทิน) |
| 1236 | ### สิ่งที่ทำ |
| 1249 | ### การตัดสินใจระหว่างทาง |
| 1256 | ### verify ที่รันจริง |
| 1259 | ### จุดที่คนถัดไปควรรู้ |
| 1267 | ## Phase 2.9 — Field Tracker Backend ชุดที่ 2 (เงิน + ตีกลับ + push — ไฟล์ 41) |
| 1271 | ### มติ PO ที่ปลดล็อกงานนี้ (ตอบ `[[NEEDS_DECISION]]` ตอนเริ่ม task) |
| 1276 | ### สิ่งที่ทำ |
| 1282 | ### DoD ที่พิสูจน์แล้ว (`lib/field/field-expense.db.test.ts`) |
| 1290 | ### ตัดสินใจเชิงเทคนิคที่ควรรู้ |
| 1298 | ### ค้าง/ต้องทำต่อ |
| 1306 | ## Phase 2.8 — Field Tracker Backend ชุดที่ 1 (core flow — ไฟล์ 41) |
| 1310 | ### สิ่งที่ทำ |
| 1319 | ### การตัดสินใจระหว่างทาง |
| 1329 | ### จุดที่คนถัดไปควรรู้ |
| 1335 | ### verify ที่รันจริง |
| 1340 | ## Phase 2.7 — Case Assignment Frontend (ไฟล์ 40) |
| 1344 | ### สิ่งที่ทำ |
| 1355 | ### การตัดสินใจระหว่างทาง |
| 1362 | ### จุดที่คนถัดไปควรรู้ |
| 1368 | ### verify ที่รันจริง |
| 1373 | ## Phase 2.6 — Case Assignment Backend (ไฟล์ 40) |
| 1377 | ### สิ่งที่ทำ |
| 1388 | ### การตัดสินใจระหว่างทาง |
| 1396 | ### จุดที่คนถัดไปควรรู้ |
| 1403 | ### verify ที่รันจริง |
| 1408 | ## Phase 2.5 — Case Submission FE ชุด 2 (เอกสาร + ทีมที่เสนอ + review modal + import) |
| 1412 | ### สิ่งที่ทำ |
| 1423 | ### การตัดสินใจระหว่างทาง |
| 1430 | ### จุดที่คนถัดไปควรรู้ |
| 1438 | ## Phase 2.4 — Case Submission FE ชุด 1 (list + form + address component) |
| 1442 | ### สิ่งที่ทำ |
| 1452 | ### การตัดสินใจระหว่างทาง |
| 1460 | ### จุดที่คนถัดไปควรรู้ |
| 1468 | ## Phase 2.3 — Case Submission BE ชุด 2 (state machine + routing + recycle + import + s... |
| 1472 | ### สิ่งที่ทำ |
| 1482 | ### การตัดสินใจระหว่างทาง |
| 1491 | ### จุดที่คนถัดไปควรรู้ |
| 1499 | ## Phase 2.2 — Case Submission BE ชุด 1 (schema + CRUD + เอกสาร) |
| 1503 | ### สิ่งที่ทำ |
| 1512 | ### การตัดสินใจระหว่างทาง (ไม่มีข้อไหนขัดสเปค — บันทึกไว้ให้ตรวจย้อนได้) |
| 1522 | ### จุดที่คนถัดไปควรรู้ |
| 1531 | ## Phase 2.1 — API Contract Infra (ไฟล์ 45): 39 endpoints + event registry + envelope +... |
| 1535 | ### สิ่งที่ทำ |
| 1545 | ### ส่วนต่างชื่อ event ระหว่าง `45` §7 กับไฟล์ต้นทาง (ตาม PLAN §2.1 — บันทึกไว้ ห้ามเงียบ) |
| 1558 | ### การตัดสินใจระหว่างทาง |
| 1567 | ### verify ที่รันจริง |
| 1572 | ### จุดที่คนถัดไปควรรู้ |
| 1581 | ## Phase 1.12 — Settings FE ชุดที่ 2: 8 แท็บที่เหลือ (ไฟล์ 13 §6.4/6.5/6.7/6.9/6.10/6.1... |
| 1585 | ### สิ่งที่ทำ |
| 1597 | ### การตัดสินใจระหว่างทาง |
| 1604 | ### ความครบตาม Test Cases `13` §15 (ตรวจก่อนปิด task) |
| 1614 | ### จุดที่คนถัดไปควรรู้ |
| 1623 | ## Phase 1.11 — Settings FE ชุดที่ 1: shell 13 แท็บ + 5 แท็บแรก (ไฟล์ 13) |
| 1627 | ### สิ่งที่ทำ |
| 1635 | ### การตัดสินใจระหว่างทาง |
| 1642 | ### จุดที่คนถัดไปควรรู้ |
| 1652 | ## Phase 1.10 — Settings ไฟล์ 13: Backend ครบ 13 หมวด |
| 1656 | ### สิ่งที่ทำ |
| 1666 | ### การตัดสินใจระหว่างทาง (ยึด `02` เหนือ spec module ตามลำดับความสำคัญเอกสาร) |
| 1676 | ### จุดที่คนถัดไปควรรู้ |
| 1687 | ## Phase 1.9 — Users (08) + flow เชิญ/ตั้งรหัสผ่านครั้งแรก (ปิด D1) |
| 1691 | ### สิ่งที่ทำ |
| 1709 | ### การตัดสินใจระหว่างทาง |
| 1718 | ### จุดที่คนถัดไปควรรู้ |
| 1727 | ## Phase 1.8 — Teams (09) + Finance Companies (10) |
| 1731 | ### สิ่งที่ทำ |
| 1747 | ### การตัดสินใจระหว่างทาง |
| 1758 | ### จุดที่คนถัดไปควรรู้ |
| 1768 | ## Phase 1.7 — Compensation Plans (11) + Service Fee Templates (12) |
| 1772 | ### สิ่งที่ทำ |
| 1789 | ### การตัดสินใจระหว่างทาง |
| 1800 | ### จุดที่คนถัดไปควรรู้ |
| 1810 | ## Phase 1.6 — Roles & Permissions module |
| 1814 | ### สิ่งที่ทำ |
| 1831 | ### การตัดสินใจระหว่างทาง |
| 1840 | ### verify ที่รันจริง (DoD ของ PLAN §1.6) |
| 1844 | ### จุดที่คนถัดไปควรรู้ |
| 1853 | ## Phase 1.5 — UI Kit + App Shell + Navigation |
| 1857 | ### สิ่งที่ทำ |
| 1870 | ### การตัดสินใจระหว่างทาง |
| 1880 | ### verify ที่รันจริง (DoD ของ PLAN §1.5) |
| 1884 | ### จุดที่คนถัดไปควรรู้ |
| 1895 | ## Phase 1.4 — Audit Core Service (immutable) |
| 1899 | ### สิ่งที่ทำ |
| 1909 | ### การตัดสินใจระหว่างทาง |
| 1917 | ### verify ที่รันจริง (DoD ของ PLAN §1.4) |
| 1923 | ### จุดที่คนถัดไปควรรู้ |
| 1932 | ## Phase 1.3 — Auth & Access Control + Permission Middleware |
| 1936 | ### สิ่งที่ทำ |
| 1947 | ### การตัดสินใจระหว่างทาง |
| 1956 | ### verify ที่รันจริง (DoD ของ PLAN §1.3) |
| 1963 | ### จุดที่คนถัดไปควรรู้ |
| 1973 | ## Phase 1.2 — Prisma Schema ชุดที่ 2: Group C–G + Seed Data |
| 1977 | ### สิ่งที่ทำ |
| 1984 | ### สิ่งที่เพิ่มจากมติ PO (นอกเหนือ spec เดิม) |
| 1993 | ### การตัดสินใจระหว่างทาง |
| 2001 | ### verify ที่รันจริง (DoD ของ PLAN §1.2) |
| 2008 | ### จุดที่คนถัดไปควรรู้ |
| 2016 | ## Phase 1.1 — Prisma Schema ชุดที่ 1: Enums + Group A + Group B |
| 2020 | ### สิ่งที่ทำ |
| 2029 | ### คอลัมน์ที่เพิ่มจากมติ PO (นอกเหนือ spec เดิม — เฉพาะที่ตกอยู่ใน Group B) |
| 2038 | ### บั๊ก/กับดักที่เจอระหว่างทาง |
| 2044 | ### verify ที่รันจริง (DoD ของ PLAN §1.1) |
| 2051 | ### จุดที่คนถัดไปควรรู้ |
| 2060 | ## Phase 0.3 — Adapt Orchestrator + Dev Panel เข้าโปรเจกต์นี้ |
| 2064 | ### สิ่งที่ทำ (adapt ตาม `promptmovetools.md` — ไม่เขียนใหม่ ไม่แตะ logic ที่มี comment... |
| 2076 | ### การตัดสินใจเอง (ต้องรายงานตาม DoD ข้อ 7) |
| 2083 | ### verify ที่รันจริง (DoD 7 ข้อของ promptmovetools) |
| 2094 | ### จุดที่คนถัดไปควรรู้ |
| 2102 | ## Phase 0.2 — Deploy pipeline ฝั่ง Staging |
| 2106 | ### สิ่งที่ทำ (ฝั่ง repo) |
| 2113 | ### สิ่งที่ทำ (ฝั่ง PO — นอก repo) |
| 2117 | ### บั๊กที่เจอและแก้ (สำคัญ — อย่าให้เกิดซ้ำ) |
| 2124 | ### verify ที่รันจริง |
| 2127 | ### จุดที่คนถัดไปควรรู้ — **ยังค้าง 2 อย่างฝั่ง Vercel UI (session อัตโนมัติทำแทนไม่ได้)** |
| 2136 | ## Phase 0.1 — Bootstrap โปรเจกต์ Next.js + โครงสร้าง + CI |
| 2140 | ### สิ่งที่ทำ |
| 2149 | ### การตัดสินใจระหว่างทาง (ไม่ใช่ระดับ DEC — เป็นรายละเอียดเชิงเครื่องมือ ไม่กระทบ tech... |
| 2159 | ### verify ที่รันจริง |
| 2162 | ### จุดที่คนถัดไปควรรู้ |

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

### `docs/REUSE_INDEX.md` (553 KB, 842 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # REUSE_INDEX.md — ของที่มีแล้ว / แม่แบบ / กับดัก (เช็คก่อนเขียนโค้ดใหม่ทุกครั้ง) |
| 5 | ## Shared Components (Frontend) |
| 101 | ## Shared Services / Utils (Backend) |
| 754 | ## กับดัก (Lessons Learned) |

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
| `docs/14-finance-dashboard.md` | 9 KB | 134 | v2.1 |
| `docs/21-profitability-report.md` | 12 KB | 133 | v3 |
| `docs/26-finance-data-model.md` | 9 KB | 117 | v2 |
| `docs/29-finance-acceptance-tests.md` | 11 KB | 133 | v2 |
| `docs/32-accounting-expenses-payments.md` | 11 KB | 149 | v2.1 |
| `docs/36-accountant-questions.md` | 7 KB | 125 | v2 |
| `docs/92-platform-data-model.md` | 14 KB | 191 | v2 |
| `docs/DECISIONS-NEEDED.md` | 11 KB | 126 | - |
| `docs/tool-register.md` | 8 KB | 73 | - |


---

## ส่วนที่ 2 — UI Mockups (reference/)

> mockup เป็น UI source of truth (โครงหน้าจอ/Tailwind pattern/ข้อมูลตัวอย่าง) — **ห้ามอ้าง business logic จาก mockup** ให้ยึด spec `.md` เสมอ
> ตารางนี้ชี้บรรทัดของ JavaScript function หลักในแต่ละไฟล์ — ใช้ Grep หา render function ที่ต้องการก่อน แล้ว Read เฉพาะช่วง


### `reference/38-case-submission-mockup.html` (99 KB, 1125 บรรทัด)

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
| 695 | `renderContactPersonRow` |
| 710 | `renderReviewModal` |
| 715 | `fileRow` |
| 834 | `viewFile` |
| 841 | `renderTeamSelectionSection` |
| 894 | `refreshTeamSection` |
| 900 | `toggleShowAllTeams` |
| 906 | `selectTeamChange` |
| 911 | `cancelTeamChange` |
| 917 | `confirmTeamChange` |
| 936 | `renderModal` |
| 1031 | `renderToast` |
| 1038 | `render` |
| 1049 | `updateFilter` |

### `reference/40-case-assignment-mockup.html` (69 KB, 1070 บรรทัด)

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
| 505 | `renderCaseTable` |
| 582 | `renderKanban` |
| 683 | `renderAgentView` |
| 765 | `renderCaseDetailSection` |
| 844 | `renderAgentPicker` |
| 899 | `toggleAgentExpand` |
| 906 | `openModal` |
| 909 | `closeModal` |
| 911 | `renderModal` |
| 1025 | `renderToast` |
| 1036 | `render` |
| 1060 | `switchRole` |

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

### `reference/97-client-portal-mobile-mockup.html` (58 KB, 685 บรรทัด)

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
| 605 | `renderAssetDetailDrawer` |
| 609 | `a` |
| 660 | `renderToastEl` |
| 668 | `render` |

### `reference/97-client-portal-mockup.html` (62 KB, 701 บรรทัด)

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
| 670 | `renderToast` |
| 678 | `render` |

### `reference/accounting.html` (166 KB, 1979 บรรทัด)

| บรรทัด | function |
|---|---|
| 32 | `toBKK` |
| 33 | `fmtDate` |
| 34 | `fmtDateTime` |
| 35 | `nowDate` |
| 36 | `nowDateTime` |
| 153 | `setState` |
| 154 | `openModal` |
| 155 | `closeModal` |
| 156 | `showToast` |
| 162 | `money` |
| 237 | `statusBadge` |
| 243 | `btnAction` |
| 249 | `formInput` |
| 252 | `formSelect` |
| 255 | `formTextarea` |
| 260 | `renderTopNav` |
| 290 | `renderAccountingOperations` |
| 896 | `renderModal` |
| 1718 | `renderToast` |
| 1735 | `renderAccountingSubNav` |
| 1774 | `renderDocumentSamples` |
| 1775 | `row` |
| 1776 | `card` |
| 1826 | `renderAssumptions` |
| 1861 | `renderSampleViewer` |
| 1891 | `render` |

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

### `reference/documents.html` (69 KB, 714 บรรทัด)

| บรรทัด | function |
|---|---|
| 114 | `money` |
| 120 | `pct` |
| 121 | `sum` |
| 122 | `esc` |
| 127 | `readInt` |
| 135 | `readLow` |
| 147 | `bahtText` |
| 216 | `copyLabel` |
| 220 | `header` |
| 239 | `metaRow` |
| 249 | `partyLines` |
| 258 | `parties` |
| 270 | `signatures` |
| 285 | `footer` |
| 289 | `paper` |
| 293 | `notes` |
| 299 | `sectionTitle` |
| 306 | `docBilling` |
| 345 | `taxInvoicePaper` |
| 371 | `docTaxInvoice` |
| 402 | `docHandover` |
| 428 | `payCalc` |
| 432 | `payTable` |
| 448 | `docVoucher` |
| 464 | `docPayslip` |
| 488 | `docAdvance` |
| 511 | `docAdvanceReturn` |
| 542 | `docNoReceipt` |
| 572 | `internalHead` |
| 589 | `docInternal` |
| 596 | `T` |
| 631 | `docWht` |
| 632 | `box` |
| 681 | `render` |
| 699 | `badge` |

### `reference/finance.html` (272 KB, 2605 บรรทัด)

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
| 984 | `renderAccountingOperations` |
| 1069 | `renderSettingsLayout` |
| 1154 | `renderRolesContent` |
| 1208 | `renderTeamsContent` |
| 1276 | `renderCompaniesContent` |
| 1325 | `renderUsersContent` |
| 1381 | `renderCompensationContent` |
| 1385 | `renderServiceFeeContent` |
| 1391 | `renderSystemSettingsContent` |
| 1395 | `renderAuditLogContent` |
| 1401 | `renderSettingsCycles` |
| 1405 | `renderSettingsApprovals` |
| 1409 | `renderSettingsBanks` |
| 1413 | `renderSettingsTax` |
| 1417 | `renderSettingsCost` |
| 1420 | `renderSettingsPayee` |
| 1424 | `renderSettingsDocs` |
| 1428 | `renderSettingsBankFile` |
| 1432 | `renderSettingsExport` |
| 1436 | `renderSettingsPermission` |
| 1487 | `renderSettingsLock` |
| 1501 | `renderModal` |
| 2028 | `baseAmt` |
| 2248 | `row` |
| 2491 | `renderToast` |
| 2502 | `render` |

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

### `reference/settings.html` (310 KB, 2333 บรรทัด)

| บรรทัด | function |
|---|---|
| 33 | `toBKK` |
| 34 | `fmtDate` |
| 35 | `fmtDateTime` |
| 36 | `nowDate` |
| 37 | `nowDateTime` |
| 301 | `getRole` |
| 302 | `getUser` |
| 303 | `getCompany` |
| 304 | `getTeam` |
| 305 | `getCompTemplate` |
| 306 | `getServiceTemplate` |
| 307 | `groupLabel` |
| 308 | `groupColor` |
| 338 | `setState` |
| 339 | `updateFilter` |
| 340 | `resetFilters` |
| 341 | `showToast` |
| 342 | `openModal` |
| 343 | `closeModal` |
| 345 | `handleSfChange` |
| 353 | `money` |
| 354 | `statusBadge` |
| 362 | `btnAction` |
| 365 | `formInput` |
| 369 | `formSelect` |
| 387 | `renderTopNav` |
| 415 | `settingHelp` |
| 428 | `assumptionBadge` |
| 436 | `kpi` |
| 442 | `renderFinanceOperations` |
| 541 | `renderAccountingOperations` |
| 626 | `renderSettingsLayout` |
| 729 | `renderRolesContent` |
| 789 | `renderTeamsContent` |
| 861 | `renderCompaniesContent` |
| 915 | `renderUsersContent` |
| 971 | `renderOrganizationContent` |
| 1053 | `renderCompensationContent` |
| 1073 | `renderServiceFeeContent` |
| 1077 | `basisTh` |
| 1110 | `renderSystemSettingsContent` |
| 1142 | `renderModelPhoneContent` |
| 1155 | `srcBadge` |
| 1167 | `resBadge` |
| 1176 | `badge` |
| 1177 | `sectionTitle` |
| 1264 | `renderAuditLogContent` |
| 1271 | `renderSettingsCycles` |
| 1284 | `renderSettingsApprovals` |
| 1291 | `renderSettingsBanks` |
| 1298 | `renderSettingsTax` |
| 1316 | `renderSettingsWhtPolicy` |
| 1317 | `box` |
| 1336 | `renderSettingsRetention` |
| 1365 | `renderSettingsHolidays` |
| 1387 | `renderSettingsVat` |
| 1394 | `now` |
| 1401 | `renderSettingsCost` |
| 1412 | `renderSettingsTaxDoc` |
| 1456 | `docNumberPattern` |
| 1459 | `docNumberNext` |
| 1462 | `renderSettingsNumbering` |
| 1506 | `renderSettingsPayee` |
| 1510 | `renderSettingsDocs` |
| 1514 | `renderSettingsBankFile` |
| 1522 | `renderSettingsExport` |
| 1526 | `renderSettingsPermission` |
| 1536 | `levelChip` |
| 1588 | `renderSettingsLock` |
| 1602 | `renderModal` |
| 2021 | `d` |
| 2104 | `colSel` |
| 2155 | `lv` |
| 2194 | `renderToast` |
| 2205 | `render` |

### `reference/warehouse.html` (111 KB, 1365 บรรทัด)

| บรรทัด | function |
|---|---|
| 38 | `toBKK` |
| 43 | `fmtDate` |
| 52 | `fmtDateTime` |
| 63 | `nowDate` |
| 64 | `nowDateTime` |
| 155 | `S` |
| 156 | `openModal` |
| 157 | `closeModal` |
| 158 | `toast` |
| 167 | `pill` |
| 168 | `btn` |
| 169 | `getCompany` |
| 170 | `getAsset` |
| 171 | `getLot` |
| 172 | `custodyAssets` |
| 173 | `nextLotId` |
| 174 | `nextDocRef` |
| 175 | `matchSearch` |
| 193 | `filterInput` |
| 201 | `filterSelect` |
| 211 | `renderNav` |
| 236 | `renderSummary` |
| 237 | `cnt` |
| 238 | `lotCnt` |
| 256 | `renderTabs` |
| 273 | `renderIntakeTab` |
| 354 | `renderCustodyTab` |
| 489 | `renderPendingHandoverTab` |
| 599 | `renderDeliveredTab` |
| 747 | `renderModal` |
| 755 | `ah` |
| 1222 | `renderToast` |
| 1235 | `render` |


---

## สคริปต์ regenerate MAP

```bash
# รันที่ root ของ repo หลังแก้ไฟล์ spec/mockup ใดๆ
python3 .claude/hooks/generate-map.py
```
