# AssetRecovery — Build Specification Index

> **อัปเดตล่าสุด: 04/07/2569 (Batch 6 — Consistency Sync รอบตรวจไขว้ทั้งชุด)**
> **สถานะ: Spec ครบ 100% — พร้อม Implement Phase 1** (Batch 6 Consistency Sync ปิดครบแล้ว 04/07/2569 — Product Owner ตอบ D1–D10 ครบ ดู `94-decision-log.md` DEC-006)

---

## แหล่งอ้างอิงหลัก

| ประเภท | แหล่งอ้างอิง | ใช้สำหรับ |
|---|---|---|
| **Business Logic / Spec** | ไฟล์ `.md` ทั้งหมด (00–96) | Source of Truth — ยึดเป็นหลักเสมอ |
| **UI / Layout / Style** | ไฟล์ `.html` (Mockup) | โครงสร้างหน้าจอ Tailwind pattern ข้อมูลตัวอย่าง |
| **Calculation Rules** | `22-finance-calculation-spec.md` | สูตรคำนวณเงินทุกจุดในระบบ |
| **DB Schema** | `02-database-schema-design.md` | Production schema ครบทุก table/enum/index |
| **API Contracts** | `27-finance-api-contracts.md` (Finance/Accounting) + `45-case-warehouse-api-contracts.md` (Case/Warehouse) | Endpoint รวมทุก module |
| **Permission Matrix** | `25-finance-permission-matrix.md` + `07-roles-permissions.md` | Role/Permission ทุกจุด |

> ⚠️ **กฎสำคัญ**: ไฟล์ `.html` เป็น UI reference เท่านั้น — ห้ามอ้าง Business Logic จากไฟล์เหล่านี้ เพราะ spec `.md` คือ source of truth ที่ถูกต้องกว่าเสมอ

---

## Tech Stack (ตัดสินใจแล้วทั้งหมด — ห้ามเปลี่ยนโดยไม่มี Decision Log)

| Layer | Technology | Decision |
|---|---|---|
| **Frontend + Backend** | Next.js App Router + TypeScript | DEC-001 |
| **ORM** | Prisma | DEC-001 |
| **Database** | PostgreSQL via Supabase | DEC-001 |
| **Permission** | Backend middleware (API layer) — **ไม่ใช้ Supabase RLS** | DEC-002 |
| **File Storage** | Supabase Storage | DEC-003 |
| **Hosting** | Vercel | DEC-001 |
| **Auth** | Supabase Auth (JWT) | DEC-001 |
| **Background Jobs** | Vercel Cron / QStash (Upstash) | DEC-001 |
| **Money** | `INTEGER` satang (÷100 เพื่อแสดงผล) | `02` §2.2 |
| **Datetime** | UTC store / Asia/Bangkok display / พ.ศ. UI | `03` §6.5 |
| **Polymorphic FK** | Separate FK columns + CHECK constraint | DEC-004 |

> ดูรายละเอียดเหตุผลทุก decision ที่ `94-decision-log.md`

---

## ภาพรวมระบบ

**AssetRecovery** คือ Operations Platform สำหรับธุรกิจรับจ้างติดตามทรัพย์ (มือถือ/อุปกรณ์) คืนจากลูกหนี้ให้กับบริษัทไฟแนนซ์ — เชื่อมงานภาคสนาม การเงิน และการส่งข้อมูลให้สำนักงานบัญชีรายเดือน

### Hybrid Accounting Boundary

**ระบบนี้ทำ:**
- รับเคสจากบริษัทไฟแนนซ์ มอบหมายงาน Field Agent
- ติดตาม Check-in / หลักฐาน / ปิดงาน
- คลังสินค้า — รับเครื่องเข้าคลัง ตรวจ IMEI ส่งมอบคืน
- คำนวณค่าตอบแทน Claim / Advance / Payout Batch + Bank File
- รายได้ / วางบิล / ติดตาม AR
- กระทบยอดธนาคาร / WHT Certificate / Export Accounting Pack รายเดือน

**สำนักงานบัญชีทำ (นอกระบบ):**
- ลงบัญชี GL / ออกเอกสารภาษีทางการ / ยื่น VAT-WHT / ปิดงบ

---

## Modules & HTML Mockups

| Module | Spec Files | HTML Mockup | สถานะ |
|---|---|---|---|
| **Auth / Login** | 05 | `login.html` | ✅ Spec + Mockup sync |
| **Settings** | 07–13 | `settings.html` | ✅ Spec + Mockup sync |
| **Case Submission** | 38 | `38-case-submission-mockup.html` | ✅ Spec + Mockup sync |
| **Case Assignment** | 40 | `40-case-assignment-mockup.html` | ✅ Spec + Mockup sync |
| **Field Tracker** | 41 | `41-field-tracker-mobile-mockup.html` `41-field-tracker-desktop-mockup.html` | ✅ Spec + Mockup sync |
| **Warehouse** | 44 | `warehouse.html` | ✅ Spec + Mockup sync |
| **Finance** | 14–21, 22–29 | `finance.html` | ✅ Spec + Mockup sync |
| **Accounting** | 30–37 | `accounting.html` | ✅ Spec + Mockup sync |
| **Reports** | 96 | `reports.html` | ✅ Spec + Mockup sync |

---

## File Index

### 🏗️ Foundation & Platform

| ไฟล์ | เนื้อหา | สถานะ |
|---|---|---|
| `00-project-overview.md` | ภาพรวมโครงการ เป้าหมาย ขอบเขต Hybrid Accounting Boundary | ✅ Ready |
| `01-architecture.md` | Tech Stack, Permission Architecture, Layer Architecture | ✅ Ready |
| `02-database-schema-design.md` | **Full Production Schema** — **53 tables** (v3.8 — +2 ตารางตามมติ PO 2026-08-12: `bank_transaction_allocations`, `customer_wht_certificates`), enums, indexes, migration order, seed data | ✅ Ready |
| `03-non-functional-requirements.md` | Performance, Security, Datetime Standard (§6.5), Reliability | ✅ Ready |
| `04-ui-ux-design-system.md` | สี ฟอนต์ ปุ่ม ตาราง ฟอร์ม Modal สถานะ Tailwind pattern | ✅ Ready |
| `05-auth-and-access-control.md` | Login, Session, MFA, Supabase Auth integration | ✅ Ready |
| `06-menu-and-navigation-map.md` | แผนผังเมนูทั้งระบบ Breadcrumb | ✅ Ready |
| `90-platform-audit-notification-reporting.md` | Audit Log schema, Notification, Reporting | ✅ Ready |
| `91-platform-api-integration-jobs.md` | Background Jobs, External API integration | ✅ Ready |
| `92-platform-data-model.md` | Data model ระดับสูง entity relationship overview | ✅ Ready |
| `93-roadmap-open-items.md` | Roadmap เฟส 2, Open Items ที่รอ | ✅ Ready |
| `94-decision-log.md` | DEC-001 ถึง DEC-004 — Tech Stack, Permission, Storage, Polymorphic | ✅ Ready |
| `95-diagrams.md` | System Architecture + ER + Use Case + Workflow (Mermaid) | ✅ Ready |

### ⚙️ Settings Module (ไฟล์ 07–13)

| ไฟล์ | เนื้อหา | สถานะ |
|---|---|---|
| `07-roles-permissions.md` | **Master Role List 15 roles** — System / Inhouse / Outsource / Finance Company (แก้จำนวนจาก 14 → 15 เมื่อ 04/07/2569 ตามการนับจริง — ดูไฟล์ 07 v2.2) | ✅ Ready |
| `08-users.md` | User CRUD, Scope, Supabase Auth linking | ✅ Ready |
| `09-teams.md` | Teams (Inhouse/Outsource), compensation_plan_id, provinces | ✅ Ready |
| `10-finance-companies.md` | บริษัทไฟแนนซ์ สัญญา VAT mode Company User | ✅ Ready |
| `11-compensation.md` | แผนค่าตอบแทน — fuel (PER_KM/DAILY_FLAT), commission, noSuccessFee, hotel, WHT% | ✅ Ready |
| `12-service-fee.md` | Service Fee Template — SUCCESS_FEE / FLAT / HYBRID, charge_on_fail | ✅ Ready |
| `13-accounting-finance-settings.md` | Billing Cycle, Approval Matrix, Bank Account, Tax Profile, VAT Rate History, Cost Center, Tax Invoice Prefix | ✅ Ready |

### 💰 Finance Module (ไฟล์ 14–21)

| ไฟล์ | เนื้อหา | สถานะ |
|---|---|---|
| `14-finance-dashboard.md` | KPI Dashboard — เงินรออนุมัติ รอจ่าย AR ค้างรับ กำไร | ✅ Ready |
| `15-claims-and-advances.md` | Claim (auto+manual) + Advance — statuses ครบ รวม pending_warehouse_confirm | ✅ Ready |
| `16-compensation-approval.md` | Manager/Finance approval flow, reject_expense | ✅ Ready |
| `17-payroll-and-payout.md` | Payout Batch (inhouse/outsource), Bank File, Idempotency Key | ✅ Ready |
| `18-payee-and-tax-profile.md` | Payee Profile, Tax Profile, **WHT Priority: Payee level ชนะ Plan level** (§6.3) | ✅ Ready |
| `19-revenue-billing-receivable.md` | Revenue trigger (expense approved + Lot confirmed), Billing Batch, AR Aging | ✅ Ready |
| `20-adjustment.md` | Adjustment — Separate FK columns (revenue/expense/billing/payout), Executive approval สำหรับ locked period | ✅ Ready |
| `21-profitability-report.md` | Gross Profit Report — actual ไม่ใช่ projection, drill-down ตามบริษัท/ทีม | ✅ Ready |

### 💰 Finance Reference (ไฟล์ 22–29)

| ไฟล์ | เนื้อหา | สถานะ |
|---|---|---|
| `22-finance-calculation-spec.md` | **สูตรคำนวณทุกจุด** — fuel/allowance/commission/VAT/WHT/GP | ✅ Ready |
| `23-finance-state-machines.md` | State machines รวม Finance objects ทุกตัว | ✅ Ready |
| `24-finance-validation-rules.md` | Error codes และ Validation rules ทุก module | ✅ Ready |
| `25-finance-permission-matrix.md` | Permission matrix ละเอียดแยกตาม capability | ✅ Ready |
| `26-finance-data-model.md` | Entity relationships ด้านการเงิน + Polymorphic pattern | ✅ Ready |
| `27-finance-api-contracts.md` | API Endpoints รวมทุก module Finance/Accounting | ✅ Ready |
| `28-finance-export-pdf-spec.md` | PDF/CSV/Bank File export spec | ✅ Ready |
| `29-finance-acceptance-tests.md` | End-to-end acceptance tests สำหรับ Finance flow | ✅ Ready |

### 📋 Accounting Module (ไฟล์ 30–37)

| ไฟล์ | เนื้อหา | สถานะ |
|---|---|---|
| `30-accounting-handover-monthly-close.md` | Monthly Close — Readiness Check 3 เงื่อนไข, Export Pack, Lock Period | ✅ Ready |
| `31-accounting-sales-and-receipts.md` | Sales Record, Tax Invoice (auto-number), Cash Receipt | ✅ Ready |
| `32-accounting-expenses-payments.md` | Expense Record, Cost Center mapping, WHT | ✅ Ready |
| `33-accounting-wht-data.md` | WHT Certificate (ใบ 50 ทวิ), ภ.ง.ด.3/53, due date countdown | ✅ Ready |
| `34-accounting-document-checklist-exceptions.md` | Exception (critical/warning/info), Authorized Exception | ✅ Ready |
| `35-bank-reconciliation.md` | Bank Statement matching — auto/manual, match_note | ✅ Ready |
| `36-accountant-questions.md` | Q&A ระหว่างทีมและสำนักงานบัญชี | ✅ Ready |
| `37-accounting-pack-export-history.md` | Export Pack versioning, file hash, history | ✅ Ready |

### 📦 Case & Field Operations (ไฟล์ 38–44)

| ไฟล์ | เนื้อหา | สถานะ |
|---|---|---|
| `38-case-submission.md` | รับเคส (manual/import/API), Review, Recycle flow — โดย Case Approver (system role) | ✅ Ready |
| `40-case-assignment-routing.md` | มอบหมายงาน, reassign timeout, supervisor permissions | ✅ Ready (v2) |
| `41-field-tracker-mobile.md` | **Field Tracker (Mobile + Desktop เหมือนกัน)** — Check-in GPS, หลักฐาน, ปิดงาน, PER_KM fuel, needs_revision, reassigned_away, QC Outcome (§10.1) | ✅ Ready (v2) |
| `44-asset-custody-handover.md` | **Warehouse Module** — รับเข้าคลัง IMEI validation, HandoverLot, finance_pickup/we_deliver, ปลดล็อก expense + Revenue trigger | ✅ Ready (v2) |
| `45-case-warehouse-api-contracts.md` | **API Contracts รวม** — Case Submission/Assignment/Field Tracker/Warehouse (คู่กับ `27` ฝั่ง Finance/Accounting) | ✅ Ready (v1, 03/07/2569) |

> **หมายเหตุ**: เลขไฟล์ 39, 42, 43 ไม่มีไฟล์จริง (ตั้งใจไม่สร้างเป็น stub แยก) — เนื้อหาเดิมของไฟล์ 39 merge เข้าไฟล์ 38 แล้วทั้งหมด ส่วนไฟล์ 42 (Check-in/Evidence) และ 43 (QC Outcome) merge เข้าไฟล์ 41 แล้วทั้งหมด — ไม่ renumber ไฟล์ที่เหลือเพื่อรักษาการอ้างอิงเดิมในเอกสารอื่นให้ตรงกัน (เลขไฟล์ 45 เคยเป็นช่องว่างเดียวกันแบบนี้เช่นกัน — ต่างกันตรงที่ 45 ไม่เคยมีเนื้อหาถูก merge ไปที่ไหน จึงสร้างไฟล์จริงขึ้นแทนการทำ stub)

### 📊 Reports (ไฟล์ 96)

| ไฟล์ | เนื้อหา | สถานะ |
|---|---|---|
| `96-reports.md` | **17 รายงาน 4 หมวด** — Finance (F1–F5), Operations (O1–O5), Accounting (A1–A4), Executive (E1–E3) (แก้เลข 13→17 เมื่อ 04/07/2569 — นับจริง 5+5+4+3) | ✅ Ready (v2) |

### 🌐 Client Portal (ไฟล์ 97)

| ไฟล์ | เนื้อหา | สถานะ |
|---|---|---|
| `97-client-portal.md` | Build Spec เต็มรูปแบบ (v4) — scope ยืนยันแล้ว: ติดตามสถานะเคส, การเงิน/บัญชี, รายงานสรุป (read-only ทั้งหมด) — ไม่มีฟอร์มส่งเคส | ✅ Spec + Mockup Ready — **Phase 1 ยืนยันแล้ว 04/07/2569** (implement เป็น Phase 7 ใน `implementation-todo.md` ตามลำดับ dependency) |
| `97-client-portal-mockup.html` | HTML Mockup เวอร์ชัน Desktop | ✅ Ready |
| `97-client-portal-mobile-mockup.html` | HTML Mockup เวอร์ชัน Mobile (bottom nav + bottom sheet) | ✅ Ready |

### 📋 Decision & Planning Documents

| ไฟล์ | เนื้อหา |
|---|---|
| `DECISIONS-NEEDED.md` | รายการที่ต้องตัดสินใจก่อน implement — หมวด 2 (Tech Stack) ✅ ปิดแล้ว, หมวด 1/3/4/5 รอ Product Owner |
| `QUESTIONS-FOR-ACCOUNTANT.md` | 7 หมวด 18 คำถามสำหรับนักบัญชี — WHT, VAT, Tax Invoice prefix, Bank File encoding |

---

## Datetime Standard (บังคับทุก module)

```
Storage  : UTC (TIMESTAMPTZ)
Display  : Asia/Bangkok (UTC+7) + พุทธศักราช (พ.ศ. = ค.ศ. + 543)
Format A : DD/MM/YYYY           เช่น 03/07/2569
Format B : DD/MM/YYYY HH:mm     เช่น 03/07/2569 14:30
HTML input: YYYY-MM-DD (ISO)    browser บังคับ — ใช้ ค.ศ. ตามปกติ
```

```typescript
// Utility functions มาตรฐาน (ใช้ใน HTML Mockup ทุกไฟล์)
const TZ = 'Asia/Bangkok';
function fmtDate(d)     { /* → DD/MM/YYYY พ.ศ. */ }
function fmtDateTime(d) { /* → DD/MM/YYYY HH:mm พ.ศ. */ }
function nowDate()      { return fmtDate(new Date()); }
function nowDateTime()  { return fmtDateTime(new Date()); }
```

---

## Database Conventions

```
Money    : INTEGER satang  (฿ 100.50 → 10050)
PK       : UUID DEFAULT gen_random_uuid()
FK       : <entity>_id  (เช่น payee_id, lot_id)
Soft del : deleted_at TIMESTAMPTZ (NULL = active)
Common   : id, organization_id, created_at, created_by, updated_at, updated_by, deleted_at
Enum     : snake_case  (เช่น asset_status, handover_type)
Polymorphic: Separate FK columns + CHECK exactly one non-null (DEC-004)
```

---

## Key Business Rules (สรุปจุดสำคัญ)

| Rule | ที่อยู่ |
|---|---|
| Revenue เกิดเมื่อ expense approved **AND** HandoverLot confirmed | `19` §6.1, `44` §11 |
| WHT rate: Payee level ชนะ Plan level เสมอ | `18` §6.3, `22` §6.9 |
| 1 HandoverLot = 1 บริษัทไฟแนนซ์ = 1 ใบส่งมอบ | `44` §6.2 |
| finance_pickup → pending_attach (รอส่งมอบ) | `44` §9.2 |
| we_deliver → pending_delivery_proof (ส่งมอบแล้ว ทันที) | `44` §9.2 |
| Lot confirmed → unlock expense + trigger Revenue (1 transaction) | `44` §11 |
| IMEI validation: exact 15 หลัก ห้าม fuzzy match | `44` §10 |
| Payout Batch: Idempotency Key ป้องกันโอนซ้ำ | `17` §6.3 |
| VAT rate: ห้าม hardcode — ใช้ vat_rate_history table | `19` §6.3 |
| reject_evidence: เฉพาะ Case Approver (system role) เท่านั้น | `41` §10.1 |
| Accounting period locked: แก้ตรงไม่ได้ → ต้องผ่าน Adjustment + Executive | `30`, `20` |
| Export Pack: versioned + SHA-256 hash ห้าม overwrite | `37`, `01` |
| Audit log: ห้ามแก้ไข/ลบ ทุก mutation ต้องผ่าน | `90` |
| Warehouse gate ใช้กับ closed_success ทุกกรณี รวมเคสไม่มี expense | `19` §6.1 (DEC-006/D6) |
| WHT Certificate ยกเลิกได้แบบ status model เท่านั้น (active→cancelled + ออกใบใหม่อ้างฉบับเดิม) | `33` §10 (DEC-006/D4) |

---

## Open Items — รอยืนยันจากภายนอก

### 🟡 รอนักบัญชี (ดู `QUESTIONS-FOR-ACCOUNTANT.md`) — มีเมนูตั้งค่ารองรับแล้ว ไม่บล็อก build
- รูปแบบเลขที่ใบกำกับภาษี — ตั้งค่าได้ที่เมนู "ตั้งค่าบัญชี/การเงิน" (`13` §6.12) รอแค่ค่าเริ่มต้นก่อนออก invoice แรก
- VAT 7%/10% — ตั้งค่าได้ที่เมนูเดียวกัน (`13` §6.5, effective-dated) เพิ่มอัตราใหม่ตอนประกาศจริงได้เลย
- Bank File encoding — ตั้งค่าได้ที่เมนูเดียวกัน (`13` §6.8) เหลือแค่ทดสอบจริงกับธนาคาร
- e-Tax Invoice / e-WHT integration กรมสรรพากร — 🟢 เฟส 2 ยังไม่มีสเปกเลย

### 🟡 รอ Product Owner (ดู `DECISIONS-NEEDED.md`)
- ชื่อ Product final
- Notification channels (Email / LINE / SMS)
- PDPA policy, Backup RPO/RTO

### 🟢 เฟส 2 (ออกแบบแล้ว ยังไม่ implement)
- GPS Map routing อัตโนมัติ (`41` Open Item #1)
- Offline Support (`41` Open Item #2)
- Desktop Document Upload (`41` Open Item #4)
- Auto Notification ไปบริษัทไฟแนนซ์ (`44` Open Items)
