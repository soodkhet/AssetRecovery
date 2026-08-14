# 02-database-schema-design.md

# 02 — Database Schema Design (Full Production Schema)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v3 (Reformatted + Index เพิ่มเติม)
> Document Level: Foundation / Platform Build Spec
> เอกสารอ้างอิง: `00-project-overview.md`, `01-architecture.md`, ไฟล์ 07 (Roles), 08 (Users), 09 (Teams), 10 (Companies), 11 (Compensation), 12 (Service Fee), 13 (Settings), 15-19 (Finance), 30-37 (Accounting), 38-41 (Case/Field), 44 (Warehouse), `92-platform-data-model.md`, `94-decision-log.md`
> Tech Stack: Next.js App Router + Prisma + PostgreSQL (Supabase) — DEC-001, DEC-004

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — Schema Group A-G ครบ 45 tables |
| v2 | 03/07/2569 | ปิด DEC-004 (Polymorphic → Separate FK columns) |
| v3 | 03/07/2569 | Reformat header ตามมาตรฐานเอกสารชุดใหม่ + เติม index ที่ขาดในตารางกลุ่ม Accounting (§9) ตาม Open Item เดิม — **เนื้อหา table/column/enum เดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** |
| v3.1 | 03/07/2569 | **แก้ไข `advance_status` enum**: เพิ่ม `'rejected'` — พบว่าไฟล์ `15-claims-and-advances.md` อธิบาย workflow ที่ต้องมีสถานะ "ไม่อนุมัติคำขอเบิก" แต่ enum เดิมไม่มี (column `rejection_reason` มีอยู่แล้วแต่ใช้ไม่ได้เพราะไม่มี status รองรับ) — ยืนยันกับ Product Owner แล้ว (5 สถานะ: pending_approval/approved/cleared/overdue/rejected) |
| v3.2 | 03/07/2569 | **แก้ไข `payee_profiles` table**: เพิ่ม enum `payee_type` (individual/corporate) และ column `id_document_url` ที่ขาดหายไป — พบว่าไฟล์ `18-payee-and-tax-profile.md` §7.1/§10 อ้างถึง field ทั้งสองนี้เป็น business requirement ที่ตัดสินใจแล้ว (payee_type ใช้แยกประเภทผู้รับเงินสำหรับ WHT, id_document_url ใช้เมื่อ `require_payee_id_document=true`) แต่ schema เดิมไม่มี column รองรับ — เป็นการเติมให้ครบ ไม่ใช่การเปลี่ยน design |
| v3.3 | 03/07/2569 | **แก้ไข `case_status` enum**: เพิ่ม `'pending_recycle_review'` — พบว่าไฟล์ `38-case-submission.md` §6.6/§10 ใช้สถานะนี้จริงสำหรับ flow รีไซเกิลเคส (คอมเมนต์เดิมของ `closed_fail` ก็ใบ้ไว้แล้วว่า "terminal หรือรอ recycle") แต่ enum ไม่มีค่ารองรับ — เป็นการเติมให้ครบ |
| v3.4 | 04/07/2569 | **แก้ comment เท่านั้น — ไม่มีการเปลี่ยน DDL/โครงสร้างใดๆ**: (1) จำนวน Seed Roles "14" → **"15"** — นับจาก seed data จริงใน §12 ได้ 15 records (system 6 + inhouse 3 + outsource 3 + finance_company 3 = 15) ตัวเลข 14 เดิมเป็นการนับผิดที่คัดลอกต่อกันหลายไฟล์ (แก้ไฟล์ 05/07/25/README/implementation-todo พร้อมกัน — 🔶 รอ Product Owner ยืนยันตัวเลขสุดท้าย ดู `93-roadmap-open-items.md` §7.1) (2) comment ตาราง `jobs` เติม job_type `'advance_overdue'` ตามไฟล์ 15/91 |
| v3.5 | 04/07/2569 | **Batch 6 เฟส 2 — Product Owner อนุมัติครบทุกข้อ (DEC-006 ใน `94-decision-log.md`)**: (D1=B) เพิ่มตารางกลุ่ม Settings ตามไฟล์ 13 — `billing_payout_cycles` (§6.1), `approval_matrices` (§6.2 เฉพาะสายอนุมัติ), `finance_policy_settings` (1 record/org — แยกค่านโยบายออกจาก matrix), `bank_file_formats` (§6.8), `tax_document_template_settings` (§6.13) + เติม `functional_group` บน `capabilities` (§6.10) + เติม numbering mode เต็มรูปบน `organizations` (§6.12) — (D2=A) เติม `usage`/`statement_format`/`payment_file_format`/`auto_match_tolerance_days` บน `bank_accounts` + deprecate `is_payout_account` — (D3=A) เพิ่มตาราง `notifications` (ไฟล์ 90 §6.3) — (D4=A) `wht_certificates` เพิ่ม status model (`active`/`cancelled` + `replaces_certificate_id`) และแก้ `delivery_format` TEXT → enum — (D5=A) `expenses` เพิ่ม `executive_approved_by/at` + `approval_step_current/total` + `approval_history` + `approval_matrix_id` (ชื่อ field ตามไฟล์ 16 §7 ซึ่งเป็นเจ้าของ flow) — (D7) เพิ่ม partial unique index `advances` (ห้ามเบิกซ้อน) + CHECK `bank_tx_status_fk_shape` (ส่วน UNIQUE `idempotency_key` มีอยู่เดิมแล้ว ไม่ต้องเพิ่ม) — รวมเป็น **51 tables** (45 เดิม + 6 ใหม่) อัปเดต Migration Order/Seed/Immutable Rules ตาม — ทุกตารางใหม่เป็น greenfield จึงเขียนเป็น CREATE/column ในตารางเดิมโดยตรง ไม่มี ALTER migration แยก |
| v3.6 | 05/07/2569 | **DEC-009 — ระดับสิทธิ์ 3 ระดับ**: เพิ่ม enum `capability_access_level` (`view`/`manage`) + column `role_capabilities.access_level` (default `manage`) — "ไม่มีสิทธิ์" = ไม่มี record ในตาราง · Superadmin มีสิทธิ์ manage ทุก capability โดยนิยาม enforce ที่ middleware ไม่ seed record · sync ไฟล์ 13 v3.1 / 25 v2.2 / mockup `settings.html` แล้ว |
| v3.8 | 14/08/2569 | **มติ PO 2026-08-12 (`docs/02_OPEN_DECISIONS.md` หมวด A ที่เหลือ) — implement ใน Phase 1.2**: (A1 ส่วนที่เหลือ) เพิ่ม `billing_batches.wht_withheld_by_customer_satang` + `cash_receipts.wht_withheld_by_customer_satang` + ตารางใหม่ `customer_wht_certificates` (ใบ 50 ทวิ **ฝั่งรับ** ที่ไฟแนนซ์ออกให้เรา = เครดิตภาษี) · (A2) ตารางใหม่ `bank_transaction_allocations` (เงินเข้าก้อนเดียวตัดได้หลายรอบบิล/บางส่วน · ส่วนเกิน = แถว `is_credit` ไม่ให้ AR ติดลบ) + `bank_transactions.is_split_allocation` และขยาย CHECK `bank_tx_one_match`/`bank_tx_status_fk_shape` ให้ครอบโหมดแบ่งยอด · (A4) `payout_batch_items.expense_id` เป็น nullable + เพิ่ม `advance_id` + CHECK `pbi_one_source` (exactly-one — DEC-004) + `advances.payout_batch_item_id` + `bank_transactions.matched_advance_id` — **ใช้ชื่อ `expense_id`/`advance_id` ตามคอลัมน์เดิมของไฟล์นี้** (ข้อเสนอเดิมเขียน `source_*` แต่ `02` เป็น SSOT ของชื่อคอลัมน์) · (A6) `cases.serial_no` + `assets.serial_contract`/`serial_actual`, `assets.imei_contract` เป็น nullable, เปลี่ยน `UNIQUE(org, imei_contract)` → partial unique `uniq_assets_active_imei` (เฉพาะที่ยังไม่ `handed_over`) + CHECK `assets_identifier_required` · (B3) `revenues.tracking_round` + `payout_batch_items.tracking_round` · **ไม่มีการลบคอลัมน์เดิม** — รวมเป็น **53 tables** (51 เดิม + 2 ใหม่) |
| v3.7 | 13/08/2569 | **มติ PO 2026-08-12 (`docs/02_OPEN_DECISIONS.md`) — implement ใน Phase 1.1**: (A1) เพิ่ม `finance_companies.wht_withheld_by_customer_pct` NUMERIC(5,2) default 3.00 — เก็บอัตรา WHT ที่บริษัทไฟแนนซ์หักจากเรา (ตั้งต่อบริษัทได้ · NULL = ไม่หัก) · (A3) เพิ่ม `service_fee_templates.charge_per_tracking_round` BOOLEAN default true — คิดค่าบริการต่อรอบการติดตาม (แต่ละรอบอิสระ) · (A5) `billing_payout_cycles.due_rule` เดิมเป็น free text คำนวณ `due_date` ไม่ได้ → เพิ่ม enum `due_rule_type` (`net_days`/`day_of_next_month`/`month_end`) + `due_rule_value` INTEGER โดย**คง `due_rule` เดิมไว้เป็น label** ที่ผู้ใช้เห็น + CHECK `cycles_due_rule_shape` บังคับให้ 2 ชนิดแรกมีค่าตัวเลขเสมอ (enum รวมเป็น 55 ตัว) · (B4) เพิ่ม `finance_policy_settings.write_off_tolerance_satang` INTEGER default 5000 · (D12) เพิ่ม `finance_policy_settings.advance_uncleared_to_employee_receivable` BOOLEAN default true — **ไม่มีการแก้ column เดิมหรือลบอะไร** ทั้งหมดเป็นการเติมตามมติที่อนุมัติแล้ว |

ขอบเขตเอกสารนี้: Full Production Database Schema — ทุก table, column, type, FK, index, unique constraint, enum, migration order และ seed data สรุปจาก spec ไฟล์ทั้งหมดไว้ในที่เดียว ใช้เป็น source of truth เดียวก่อนเขียน Prisma schema

**ไม่รวมอยู่ในไฟล์นี้**: Business rule การคำนวณ (ดู `22-finance-calculation-spec.md`), State machine การเปลี่ยนสถานะ (ดู `23-finance-state-machines.md`), API Contract (ดู `27-finance-api-contracts.md`, `45-case-warehouse-api-contracts.md`)

---

## 1. Summary
Full Database Schema สำหรับ implement จริง — ครอบคลุมทุก table, column, type, FK, index, unique constraint, enum และ migration order สรุปจาก spec ไฟล์ทั้งหมดไว้ในที่เดียว

## 2. Conventions (กฎที่ใช้ทั้งไฟล์)

### 2.1 Naming
| Item | Rule | Example |
|---|---|---|
| Table | snake_case plural | `payout_batches` |
| Column | snake_case | `created_by` |
| PK | `id` UUID | `id uuid DEFAULT gen_random_uuid()` |
| FK | `<entity>_id` | `payee_id uuid` |
| Enum Type | `<domain>_<name>` | `case_status` |
| Index | `idx_<table>_<cols>` | `idx_cases_org_status` |

### 2.2 Money
**ใช้ `INTEGER` (satang / สตางค์)** — ไม่ใช้ DECIMAL เพื่อหลีกเลี่ยง floating-point error
- `1000` = 10.00 บาท
- ทุก monetary field ลงท้ายด้วย `_satang`
- Display layer หาร 100 ก่อนแสดงผล
- Exception: `rate_pct` (อัตรา %) ใช้ `NUMERIC(5,2)` เช่น `10.00` = 10%

### 2.3 Timestamps
- เก็บเป็น `TIMESTAMPTZ` UTC เสมอ
- Display layer แปลงเป็น Asia/Bangkok + พ.ศ. (ไฟล์ 03 §6.5)
- ชื่อ field: `created_at`, `updated_at`, `deleted_at` (soft delete)

### 2.4 Common Columns (ทุก table มีครบ)
```sql
id              UUID          PRIMARY KEY DEFAULT gen_random_uuid()
organization_id UUID          NOT NULL    REFERENCES organizations(id)
created_at      TIMESTAMPTZ   NOT NULL    DEFAULT NOW()
created_by      UUID          NOT NULL    REFERENCES users(id)
updated_at      TIMESTAMPTZ   NOT NULL    DEFAULT NOW()
updated_by      UUID                      REFERENCES users(id)
deleted_at      TIMESTAMPTZ               -- soft delete; NULL = active
```

### 2.5 Permission Architecture
- Permission enforce ที่ **API layer** (backend middleware) — DEC-002
- ไม่ใช้ Supabase RLS เป็น permission หลัก
- ทุก table ต้องมี `organization_id` สำหรับ multi-tenant query filter

---

## 3. Enum Types (ทั้งหมด)

```sql
-- ══════════════════════════════════════════════
-- Identity & Access
-- ══════════════════════════════════════════════
CREATE TYPE role_group AS ENUM (
  'system',           -- Superadmin, Executive, Finance, Accounting, Admin, Case Approver
  'inhouse',          -- ทีม Inhouse
  'outsource',        -- ทีม Outsource
  'finance_company'   -- บริษัทไฟแนนซ์ภายนอก
);

CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');

-- ══════════════════════════════════════════════
-- Master Data
-- ══════════════════════════════════════════════
CREATE TYPE team_side AS ENUM ('inhouse', 'outsource');
CREATE TYPE team_status AS ENUM ('active', 'inactive');

CREATE TYPE payee_type AS ENUM ('individual', 'corporate'); -- เพิ่ม 03/07/2569 ตามไฟล์ 18 §7.1 (ขาดหายจาก schema เดิม)

-- ══ Settings enums (ไฟล์ 13 — เพิ่ม 04/07/2569 ตาม DEC-006/D1,D2) ══
CREATE TYPE cycle_type             AS ENUM ('AR', 'AP');                        -- ไฟล์ 13 §6.1
CREATE TYPE cutoff_rule_type       AS ENUM ('fixed_dates', 'month_end', 'custom_text');
CREATE TYPE bank_account_usage     AS ENUM ('receive', 'pay', 'both');          -- ไฟล์ 13 §6.3
CREATE TYPE bank_file_type         AS ENUM ('CSV', 'TXT');                      -- ไฟล์ 13 §6.8
CREATE TYPE bank_file_encoding     AS ENUM ('UTF-8', 'TIS-620');
CREATE TYPE bank_file_test_status  AS ENUM ('pending', 'passed', 'failed');
CREATE TYPE invoice_numbering_mode AS ENUM ('continuous', 'yearly_reset');      -- ไฟล์ 13 §6.12
CREATE TYPE tax_document_type      AS ENUM ('tax_invoice', 'wht_certificate');  -- ไฟล์ 13 §6.13
CREATE TYPE tax_doc_paper_size     AS ENUM ('A4', 'A5');
CREATE TYPE tax_doc_language       AS ENUM ('th', 'th_en_bilingual');
CREATE TYPE functional_group       AS ENUM ('ops', 'finance', 'accounting', 'admin'); -- ไฟล์ 13 §6.10
CREATE TYPE capability_access_level AS ENUM ('view', 'manage');  -- ระดับสิทธิ์ 3 ระดับ (ไม่มี = ไม่มี record) — DEC-009 05/07/2569

CREATE TYPE fuel_mode AS ENUM (
  'PER_KM',       -- คำนวณตามระยะทางจริง × rate_per_km
  'DAILY_FLAT'    -- อัตราคงที่รายวัน
);

CREATE TYPE service_fee_model AS ENUM (
  'SUCCESS_FEE',  -- % ของมูลหนี้/มูลค่าทรัพย์ เฉพาะ closed_success
  'FLAT',         -- ค่าคงที่ต่อเคส
  'HYBRID'        -- base + % (ตามไฟล์ 12)
);

CREATE TYPE service_fee_basis AS ENUM (
  'debt_amount',    -- ฐานคิดจากมูลหนี้คงเหลือ
  'asset_value'     -- ฐานคิดจากมูลค่าทรัพย์
);

CREATE TYPE vat_mode AS ENUM (
  'include_vat',    -- ราคารวม VAT แล้ว
  'exclude_vat',    -- ราคาก่อน VAT (บวก VAT แยกบรรทัด)
  'no_vat'          -- ไม่มี VAT (บริษัทไม่จด VAT)
);

-- due_rule แบบคำนวณได้ — มติ PO 2026-08-12 ข้อ A5 (เดิม billing_payout_cycles.due_rule เป็น free text)
CREATE TYPE due_rule_type AS ENUM (
  'net_days',           -- Net N วัน นับจากวันตัดรอบ
  'day_of_next_month',  -- วันที่ N ของเดือนถัดไป (เกินจำนวนวันในเดือน → clamp วันสุดท้าย)
  'month_end'           -- สิ้นเดือน
);

CREATE TYPE company_user_level AS ENUM (
  'manager',      -- เห็นข้อมูลทั้งหมดของบริษัท
  'supervisor',   -- เห็นเฉพาะที่ผู้จัดการมอบหมาย
  'admin'         -- เห็นเฉพาะงานที่ได้รับมอบหมาย
);

-- ══════════════════════════════════════════════
-- Case Workflow
-- ══════════════════════════════════════════════
CREATE TYPE case_status AS ENUM (
  'draft',            -- ร่าง — ยังไม่ส่งพิจารณา
  'pending_review',   -- รอเจ้าหน้าที่อนุมัติเคสพิจารณา
  'need_info',        -- ขอข้อมูลเพิ่มเติม
  'approved',         -- อนุมัติ — เข้าคิวมอบหมายงาน
  'rejected',         -- ปฏิเสธ (terminal)
  'active',           -- กำลังดำเนินงาน
  'closed_success',   -- ปิดงานสำเร็จ — ยึดทรัพย์ได้
  'closed_fail',      -- ปิดงานไม่สำเร็จ
  'pending_recycle_review' -- เพิ่ม 03/07/2569 (ไฟล์ 38 §6.6/§10) — รอเจ้าหน้าที่อนุมัติเคสพิจารณาคำขอรีไซเกิลจากเคส closed_fail
);

CREATE TYPE case_source AS ENUM (
  'manual',     -- กรอกมือในระบบ
  'import',     -- Import ไฟล์ Excel/CSV
  'api'         -- API Ingestion จากบริษัทไฟแนนซ์
);

CREATE TYPE recycle_status AS ENUM (
  'pending',    -- รอพิจารณา
  'approved',   -- อนุมัติ recycle
  'rejected'    -- ไม่อนุมัติ
);

CREATE TYPE assignment_status AS ENUM (
  'pending',    -- รอรับงาน
  'accepted',   -- รับงานแล้ว
  'active',     -- กำลังดำเนินงาน
  'completed',  -- ปิดงานแล้ว (terminal)
  'reassigned', -- ถูก reassign ออก (superseded)
  'cancelled'   -- ยกเลิก
);

CREATE TYPE checkin_type AS ENUM (
  'address',        -- เช็คอินที่อยู่ลูกหนี้
  'contact',        -- พบญาติ/ผู้ที่รู้จัก
  'workplace',      -- สถานที่ทำงาน
  'asset_location'  -- พบทรัพย์
);

CREATE TYPE case_outcome AS ENUM (
  'closed_success', -- ยึดทรัพย์สำเร็จ
  'closed_fail'     -- ไม่สำเร็จ
);

CREATE TYPE evidence_status AS ENUM (
  'pending',    -- รอ QC
  'approved',   -- อนุมัติ (terminal — immutable)
  'rejected'    -- ตีกลับ (ต้องส่งใหม่)
);

-- ══════════════════════════════════════════════
-- Warehouse (ไฟล์ 44)
-- ══════════════════════════════════════════════
CREATE TYPE asset_status AS ENUM (
  'pending_intake',   -- รอรับเข้าคลัง
  'intake_rejected',  -- ตีกลับ IMEI ไม่ตรง
  'in_custody',       -- ในคลัง — รอส่งมอบ
  'handover_pending', -- อยู่ใน Lot แล้ว — รอยืนยัน (finance_pickup)
  'handed_over'       -- ส่งมอบเสร็จสิ้น (terminal)
);

CREATE TYPE asset_condition AS ENUM (
  'normal',       -- ปกติ ครบอุปกรณ์
  'damaged',      -- ชำรุด
  'partial_loss'  -- อุปกรณ์ขาดหาย
);

CREATE TYPE handover_type AS ENUM (
  'finance_pickup', -- ไฟแนนซ์มารับ → เอกสาร 1 ชุด
  'we_deliver'      -- เราส่งไป → เอกสาร 2 ชุด
);

CREATE TYPE handover_lot_status AS ENUM (
  'pending_attach',          -- รอแนบใบเซ็นรับ (finance_pickup, อยู่ใน "รอส่งมอบ")
  'pending_delivery_proof',  -- รอหลักฐานจัดส่ง (we_deliver, อยู่ใน "ส่งมอบแล้ว")
  'confirmed'                -- ยืนยันสมบูรณ์ (terminal)
);

-- ══════════════════════════════════════════════
-- Finance Operation
-- ══════════════════════════════════════════════
CREATE TYPE expense_status AS ENUM (
  'pending_warehouse_confirm', -- รอคลังยืนยัน (closed_success เท่านั้น ไฟล์ 41 §6.6)
  'pending_approval',          -- รอ Manager อนุมัติ
  'pending_finance_approval',  -- รอ Finance อนุมัติ
  'approved',                  -- อนุมัติแล้ว — พร้อมเข้า Payout
  'rejected',                  -- ตีกลับ
  'needs_revision',            -- ส่งกลับให้แก้ไข
  'superseded'                 -- ถูกแทนที่ (recycle round ใหม่)
);

CREATE TYPE expense_type AS ENUM (
  'fuel',         -- ค่าน้ำมัน
  'allowance',    -- เบี้ยเลี้ยง
  'commission',   -- ค่าตอบแทนสำเร็จ
  'no_success_fee', -- เบี้ยเสี่ยง (closed_fail)
  'hotel',        -- ค่าที่พัก
  'receipt',      -- ค่าใช้จ่ายอื่น (ใบเสร็จ)
  'manual'        -- Claim มือ (ไม่ผูกเคส)
);

CREATE TYPE advance_status AS ENUM (
  'pending_approval', -- รออนุมัติ
  'approved',         -- อนุมัติแล้ว — เงินออก (รวมความหมาย "รอเคลียร์ยอด" ในตัว)
  'cleared',          -- เคลียร์แล้ว (terminal)
  'overdue',          -- เกินกำหนดเคลียร์ (auto-mark โดย background job เมื่อเลย due_clear_date)
  'rejected'          -- การเงินไม่อนุมัติคำขอเบิก (terminal) — เพิ่ม 03/07/2569 ตามไฟล์ 15 §17
);

CREATE TYPE payout_batch_side AS ENUM ('inhouse', 'outsource');

CREATE TYPE payout_batch_status AS ENUM (
  'draft',          -- รวบรวมรายการ
  'checking',       -- ตรวจสอบก่อนโอน
  'file_generated', -- สร้างไฟล์โอนแล้ว
  'completed'       -- โอนสำเร็จ (terminal — immutable)
);

CREATE TYPE revenue_status AS ENUM (
  'ready_for_billing', -- รอรวมเป็น Billing Batch
  'billed'             -- อยู่ใน Billing Batch แล้ว
);

CREATE TYPE billing_batch_status AS ENUM (
  'draft',           -- ร่าง
  'sent',            -- ส่งวางบิลแล้ว
  'partially_paid',  -- รับชำระบางส่วน
  'paid'             -- รับชำระครบ (terminal)
);

CREATE TYPE adjustment_type AS ENUM ('increase', 'decrease');

CREATE TYPE adjustment_status AS ENUM (
  'pending_approval', -- รออนุมัติ
  'approved',         -- อนุมัติ (terminal)
  'rejected'          -- ตีกลับ (terminal)
);

-- target ของ Adjustment (Separate FK columns — DEC-004)
-- ใช้ nullable FK แทน discriminator string

-- ══════════════════════════════════════════════
-- Accounting Handover
-- ══════════════════════════════════════════════
CREATE TYPE accounting_period_status AS ENUM (
  'collecting',        -- รวบรวมข้อมูลระหว่างเดือน
  'sent_to_accountant', -- ส่งสำนักงานบัญชีแล้ว
  'locked'             -- ล็อกงวดโดย Executive (terminal)
);

CREATE TYPE exception_level AS ENUM ('info', 'warning', 'critical');

CREATE TYPE exception_status AS ENUM (
  'open',     -- ยังเปิดอยู่
  'resolved', -- แก้ไขแล้ว
  'authorized'-- Executive อนุมัติ exception (เฉพาะ critical)
);

CREATE TYPE bank_match_status AS ENUM (
  'unmatched',        -- ยังไม่จับคู่
  'auto_matched',     -- จับคู่อัตโนมัติ
  'manual_matched',   -- จับคู่มือ
  'unmatched_resolved' -- ตัดจำหน่าย/อธิบายแล้ว
);

CREATE TYPE tax_invoice_status AS ENUM (
  'active',    -- ใช้งานอยู่
  'cancelled'  -- ยกเลิก (terminal — ห้าม delete)
);

CREATE TYPE wht_filing_form AS ENUM (
  'PND3',  -- บุคคลธรรมดา (ภ.ง.ด.3)
  'PND53'  -- นิติบุคคล (ภ.ง.ด.53)
);

CREATE TYPE wht_filing_status AS ENUM ('pending', 'filed');

CREATE TYPE wht_certificate_status AS ENUM (
  'active',    -- ใช้งานอยู่
  'cancelled'  -- ยกเลิก (terminal — ห้าม delete, ออกใบใหม่อ้าง replaces_certificate_id แทน) — เพิ่ม 04/07/2569 DEC-006/D4
);

CREATE TYPE wht_delivery_format AS ENUM ('paper', 'e_withholding');  -- แก้จาก TEXT → enum ตาม convention (DEC-006/D4)

CREATE TYPE export_record_status AS ENUM (
  'generated', -- สร้างแล้ว
  'sent',      -- ส่งให้สำนักงานบัญชี
  'accepted'   -- สำนักงานบัญชีตอบรับ
);

-- ══════════════════════════════════════════════
-- Platform
-- ══════════════════════════════════════════════
CREATE TYPE audit_action AS ENUM (
  'create', 'update', 'delete', 'status_change',
  'approve', 'reject', 'confirm', 'lock', 'unlock',
  'export', 'import', 'login', 'logout'
);

CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
```

---

## 4. Schema Group A — Identity & Access

```sql
-- ── organizations ────────────────────────────────────────────
-- AssetRecovery บริษัทเจ้าของระบบ (Multi-tenant ready)
CREATE TABLE organizations (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT          NOT NULL,
  tax_id          VARCHAR(13)   NOT NULL UNIQUE,  -- เลขประจำตัวผู้เสียภาษี 13 หลัก
  address         TEXT          NOT NULL,
  phone           VARCHAR(20),
  email           VARCHAR(255),
  logo_url        TEXT,                           -- Supabase Storage URL
  vat_registered  BOOLEAN       NOT NULL DEFAULT true,
  -- Tax Invoice numbering prefix (ตัดสินใจก่อน production — ไฟล์ 13 §6.12)
  tax_invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'INV',
  tax_invoice_seq    INTEGER      NOT NULL DEFAULT 0,  -- running seq
  -- Numbering mode เต็มรูป (ไฟล์ 13 §6.12 — เพิ่ม 04/07/2569 DEC-006/D1)
  tax_invoice_numbering_mode invoice_numbering_mode NOT NULL DEFAULT 'continuous',
  tax_invoice_digit_length   INTEGER NOT NULL DEFAULT 4,   -- จำนวนหลัก running (เช่น 4 = 0001)
  tax_invoice_last_reset_year INTEGER,                     -- พ.ศ. — ใช้เฉพาะ yearly_reset
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  -- ไม่มี organization_id (root table)
  -- ไม่มี soft delete (organization ลบไม่ได้)
);

-- ── roles ────────────────────────────────────────────────────
-- 15 Seed roles ตามไฟล์ 07 §5 (ลบ/เปลี่ยนชื่อไม่ได้)
CREATE TABLE roles (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID          NOT NULL REFERENCES organizations(id),
  name            TEXT          NOT NULL,
  role_group      role_group    NOT NULL,
  is_seed         BOOLEAN       NOT NULL DEFAULT false,  -- true = ห้ามลบ/เปลี่ยนชื่อ
  is_editable     BOOLEAN       NOT NULL DEFAULT false,  -- true = แก้ permission ได้
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE(organization_id, name, role_group)
);

-- ── users ─────────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID          NOT NULL REFERENCES organizations(id),
  role_id         UUID          NOT NULL REFERENCES roles(id),
  -- Auth (Supabase Auth managed — ไม่เก็บ password ที่นี่)
  supabase_uid    UUID          UNIQUE,           -- FK → Supabase Auth users
  email           VARCHAR(255)  NOT NULL,
  full_name       TEXT          NOT NULL,
  phone           VARCHAR(20),
  employee_code   VARCHAR(50),                    -- รหัสพนักงาน (optional)
  -- scope
  team_id         UUID          REFERENCES teams(id), -- inhouse/outsource เท่านั้น
  company_id      UUID          REFERENCES finance_companies(id), -- finance_company เท่านั้น
  status          user_status   NOT NULL DEFAULT 'active',
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by      UUID          REFERENCES users(id),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_by      UUID          REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  UNIQUE(organization_id, email)
);
CREATE INDEX idx_users_org_role    ON users(organization_id, role_id);
CREATE INDEX idx_users_org_team    ON users(organization_id, team_id);
CREATE INDEX idx_users_org_company ON users(organization_id, company_id);
CREATE INDEX idx_users_supabase    ON users(supabase_uid);

-- ── capabilities ─────────────────────────────────────────────
-- รายการ action ที่ระบบรู้จัก (เช่น "approve_claim", "export_pack")
CREATE TABLE capabilities (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT    NOT NULL UNIQUE,  -- เช่น 'approve_claim'
  label       TEXT    NOT NULL,         -- ภาษาไทยแสดงใน UI
  module      TEXT    NOT NULL,         -- เช่น 'finance', 'accounting'
  functional_group functional_group,     -- ไฟล์ 13 §6.10 (เพิ่ม 04/07/2569 DEC-006/D1) — ใช้ capabilities+role_capabilities เป็นที่เก็บ Functional Permission Matrix ไม่สร้างตารางซ้ำ
  description TEXT
);

-- ── role_capabilities ─────────────────────────────────────────
-- role ไหนเข้าถึง capability อะไรได้บ้าง ที่ระดับไหน (DEC-009: 3 ระดับ — ไม่มี record = ไม่มีสิทธิ์)
-- Superadmin มีสิทธิ์ 'manage' ทุก capability โดยนิยาม — enforce ที่ middleware ไม่ต้อง seed record (ไฟล์ 25)
CREATE TABLE role_capabilities (
  role_id       UUID    NOT NULL REFERENCES roles(id)        ON DELETE CASCADE,
  capability_id UUID    NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
  access_level  capability_access_level NOT NULL DEFAULT 'manage',  -- 'view' = ดูอย่างเดียว 👁️ / 'manage' = ทำได้ ✅ (เพิ่ม 05/07/2569 DEC-009)
  PRIMARY KEY (role_id, capability_id)
);
```

---

## 5. Schema Group B — Master Data

```sql
-- ── teams ────────────────────────────────────────────────────
CREATE TABLE teams (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID         NOT NULL REFERENCES organizations(id),
  name                   TEXT         NOT NULL,
  side                   team_side    NOT NULL,
  compensation_plan_id   UUID         REFERENCES compensation_plans(id),
  -- scope: ผู้ดูแลทีม
  supervisor_id          UUID         REFERENCES users(id),  -- หัวหน้าทีม (1 คน)
  -- provinces ที่รับผิดชอบ (array)
  provinces              TEXT[]       NOT NULL DEFAULT '{}',
  status                 team_status  NOT NULL DEFAULT 'active',
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by             UUID         NOT NULL REFERENCES users(id),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by             UUID         REFERENCES users(id),
  deleted_at             TIMESTAMPTZ,
  UNIQUE(organization_id, name)
);

-- team_managers: ผู้จัดการทีม (N:N — 1 manager ดูแลได้หลายทีม)
CREATE TABLE team_managers (
  team_id    UUID NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

-- ── compensation_plans ───────────────────────────────────────
-- Template ค่าตอบแทน ตามไฟล์ 11
CREATE TABLE compensation_plans (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID         NOT NULL REFERENCES organizations(id),
  name                  TEXT         NOT NULL,
  side                  team_side    NOT NULL,
  -- Fuel
  fuel_mode             fuel_mode    NOT NULL,
  fuel_rate_per_km_satang  INTEGER,               -- บาท × 100, ใช้เมื่อ PER_KM
  fuel_max_per_case_satang INTEGER,               -- เพดาน, nullable
  fuel_daily_flat_satang   INTEGER,               -- ใช้เมื่อ DAILY_FLAT
  -- Allowance
  allowance_satang      INTEGER      NOT NULL DEFAULT 0,
  -- Commission (จ่ายเมื่อ closed_success)
  commission_satang     INTEGER      NOT NULL DEFAULT 0,
  -- No-Success Fee (จ่ายเมื่อ closed_fail — ไฟล์ 22 §6.4)
  no_success_fee_satang INTEGER      NOT NULL DEFAULT 0,
  -- Hotel
  hotel_max_per_night_satang INTEGER,
  hotel_receipt_required     BOOLEAN  NOT NULL DEFAULT true,
  -- WHT
  wht_pct               NUMERIC(5,2) NOT NULL DEFAULT 3.00, -- % (fallback ถ้า payee ไม่มี tax profile)
  -- Versioning
  version               INTEGER      NOT NULL DEFAULT 1,
  effective_from        DATE         NOT NULL,
  effective_to          DATE,
  is_current            BOOLEAN      NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by            UUID         NOT NULL REFERENCES users(id),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by            UUID         REFERENCES users(id),
  deleted_at            TIMESTAMPTZ,
  UNIQUE(organization_id, name, version)
);
CREATE INDEX idx_comp_plans_org ON compensation_plans(organization_id, is_current);

-- ── finance_companies ────────────────────────────────────────
-- บริษัทไฟแนนซ์คู่ค้า ตามไฟล์ 10
CREATE TABLE finance_companies (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID         NOT NULL REFERENCES organizations(id),
  name                  TEXT         NOT NULL,
  short_name            TEXT         NOT NULL,  -- ชื่อย่อ เช่น "SF", "KTL"
  tax_id                VARCHAR(13)  NOT NULL,
  address               TEXT,
  phone                 VARCHAR(20),
  email                 VARCHAR(255),
  contact_name          TEXT,
  contact_phone         VARCHAR(20),
  signer_name           TEXT,                   -- ชื่อผู้ลงนาม (ใบส่งมอบ)
  -- Service Fee
  service_fee_template_id UUID       REFERENCES service_fee_templates(id),
  -- VAT
  vat_mode              vat_mode     NOT NULL DEFAULT 'exclude_vat',
  vat_registered        BOOLEAN      NOT NULL DEFAULT true,
  -- Billing
  billing_day           INTEGER      NOT NULL DEFAULT 1,    -- วันตัดรอบบิล
  payment_due_days      INTEGER      NOT NULL DEFAULT 30,   -- วันครบกำหนดชำระ
  -- WHT ที่ลูกค้า (ไฟแนนซ์) หักจากเรา — มติ PO 2026-08-12 ข้อ A1 · NULL = บริษัทนี้ไม่หัก
  wht_withheld_by_customer_pct NUMERIC(5,2) DEFAULT 3.00,
  status                TEXT         NOT NULL DEFAULT 'active', -- active | inactive
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by            UUID         NOT NULL REFERENCES users(id),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by            UUID         REFERENCES users(id),
  deleted_at            TIMESTAMPTZ,
  UNIQUE(organization_id, tax_id)
);

-- ── service_fee_templates ────────────────────────────────────
-- กติกาค่าบริการ ตามไฟล์ 12
CREATE TABLE service_fee_templates (
  id                  UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID                 NOT NULL REFERENCES organizations(id),
  name                TEXT                 NOT NULL,
  model               service_fee_model    NOT NULL,
  -- FLAT / HYBRID
  base_satang         INTEGER              NOT NULL DEFAULT 0,
  -- SUCCESS_FEE / HYBRID
  rate_pct            NUMERIC(5,2)         NOT NULL DEFAULT 0,
  basis               service_fee_basis,
  -- FLAT / HYBRID
  charge_on_fail      BOOLEAN              NOT NULL DEFAULT false,
  -- คิดค่าบริการต่อรอบการติดตาม (แต่ละรอบอิสระ) — มติ PO 2026-08-12 ข้อ A3
  charge_per_tracking_round BOOLEAN        NOT NULL DEFAULT true,
  -- Versioning (snapshot ลงใน Case ตอน approved)
  version             INTEGER              NOT NULL DEFAULT 1,
  is_current          BOOLEAN              NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  created_by          UUID                 NOT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_by          UUID                 REFERENCES users(id),
  deleted_at          TIMESTAMPTZ,
  UNIQUE(organization_id, name, version)
);

-- ── tax_profiles ──────────────────────────────────────────────
-- กติกาภาษีต่อ Payee ตามไฟล์ 18 §6.3
CREATE TABLE tax_profiles (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID         NOT NULL REFERENCES organizations(id),
  name                TEXT         NOT NULL,
  wht_pct             NUMERIC(5,2) NOT NULL DEFAULT 3.00,   -- % หัก ณ ที่จ่าย
  wht_basis           TEXT         NOT NULL DEFAULT 'before_vat', -- before_vat | gross_amount
  wht_min_threshold_satang INTEGER NOT NULL DEFAULT 100000, -- 1,000 บาท
  income_type         TEXT         NOT NULL DEFAULT 'ค่าจ้างทำของ มาตรา 40(8)',
  filing_form         wht_filing_form NOT NULL DEFAULT 'PND3',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by          UUID         NOT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE(organization_id, name)
);

-- ── vat_rate_history ──────────────────────────────────────────
-- ประวัติอัตรา VAT (ห้าม hardcode — ไฟล์ 19 §6.3)
CREATE TABLE vat_rate_history (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organizations(id),
  rate_pct        NUMERIC(5,2) NOT NULL,        -- เช่น 7.00
  effective_from  DATE         NOT NULL,
  effective_to    DATE,                          -- NULL = ยังใช้งานอยู่
  note            TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by      UUID         NOT NULL REFERENCES users(id)
);
CREATE INDEX idx_vat_rates_org_date ON vat_rate_history(organization_id, effective_from);

-- ── bank_accounts ─────────────────────────────────────────────
-- บัญชีธนาคารบริษัท ตามไฟล์ 13 §6.3
CREATE TABLE bank_accounts (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID    NOT NULL REFERENCES organizations(id),
  bank_name           TEXT    NOT NULL,
  account_name        TEXT    NOT NULL,
  account_number      TEXT    NOT NULL,
  account_type        TEXT    NOT NULL DEFAULT 'savings', -- savings | current
  is_primary          BOOLEAN NOT NULL DEFAULT false,
  -- Sync กับไฟล์ 13 §6.3 (เพิ่ม 04/07/2569 — DEC-006/D2)
  usage               bank_account_usage NOT NULL DEFAULT 'both',
  statement_format    TEXT,   -- รูปแบบไฟล์ statement นำเข้ากระทบยอด (ไฟล์ 35) — อ้างชื่อจาก bank_file_formats
  payment_file_format TEXT,   -- รูปแบบไฟล์โอนเงินส่งธนาคาร (ไฟล์ 17) — อ้างชื่อจาก bank_file_formats
  auto_match_tolerance_days INTEGER NOT NULL DEFAULT 7,   -- จำนวนวันยอมรับสำหรับ auto-match (ไฟล์ 35)
  is_payout_account   BOOLEAN NOT NULL DEFAULT false,     -- ⚠️ DEPRECATED 04/07/2569 (DEC-006/D2) — ความหมายซ้ำกับ usage ('pay'/'both') ห้ามใช้ในโค้ดใหม่ วางแผนลบใน migration ถัดไป
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID    NOT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE(organization_id, account_number)
);

-- ── cost_centers ──────────────────────────────────────────────
-- ศูนย์ต้นทุน ตามไฟล์ 13 §6.9
CREATE TABLE cost_centers (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID    NOT NULL REFERENCES organizations(id),
  code            TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID    NOT NULL REFERENCES users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE(organization_id, code)
);

-- ── billing_payout_cycles ────────────────────────────────────
-- รอบบิล/รอบจ่าย ตามไฟล์ 13 §6.1 (เพิ่ม 04/07/2569 — DEC-006/D1)
CREATE TABLE billing_payout_cycles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  name             TEXT NOT NULL,
  type             cycle_type NOT NULL,
  cutoff_rule_type cutoff_rule_type NOT NULL,
  cutoff_dates     INTEGER[],          -- ใช้เมื่อ fixed_dates เช่น '{15,30}'
  cutoff_text      TEXT,               -- ใช้เมื่อ custom_text
  -- มติ PO 2026-08-12 ข้อ A5 — ไฟล์ 19 ต้องคำนวณ due_date จากค่าเหล่านี้ (ห้าม parse จาก free text)
  due_rule_type    due_rule_type NOT NULL DEFAULT 'net_days',
  due_rule_value   INTEGER,            -- net_days = จำนวนวัน · day_of_next_month = วันที่ · month_end = ไม่ใช้
  due_rule         TEXT NOT NULL,      -- label ที่ผู้ใช้เห็น เช่น "Net 30 Days" (ไม่ใช้คำนวณ)
  scope            TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT cycles_due_rule_shape CHECK (
    (due_rule_type IN ('net_days','day_of_next_month') AND due_rule_value IS NOT NULL AND due_rule_value > 0) OR
    (due_rule_type = 'month_end')
  ),
  CONSTRAINT cycles_cutoff_shape CHECK (
    (cutoff_rule_type = 'fixed_dates' AND cutoff_dates IS NOT NULL) OR
    (cutoff_rule_type = 'custom_text' AND cutoff_text IS NOT NULL) OR
    (cutoff_rule_type = 'month_end')
  )
);
CREATE INDEX idx_cycles_org ON billing_payout_cycles(organization_id, type);

-- ── approval_matrices ────────────────────────────────────────
-- สายการอนุมัติ ตามไฟล์ 13 §6.2 (DEC-006/D1 — เฉพาะสายอนุมัติ; ค่านโยบายการเงินแยกไป finance_policy_settings)
CREATE TABLE approval_matrices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  condition           TEXT NOT NULL,
  condition_threshold_satang INTEGER,        -- เงินเป็น satang เสมอตาม convention (spec ไฟล์ 13 เขียน decimal ระดับเอกสาร)
  approval_flow       TEXT[] NOT NULL,       -- ลำดับ role เช่น '{Manager,Finance,Executive}'
  enforce_segregation_of_duties BOOLEAN NOT NULL DEFAULT false,  -- ไฟล์ 16 SEGREGATION_OF_DUTIES_VIOLATION
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_approval_matrices_org ON approval_matrices(organization_id);

-- ── finance_policy_settings ──────────────────────────────────
-- ค่านโยบายการเงินระดับองค์กร (1 record ต่อ organization) — DEC-006/D1 Option B
CREATE TABLE finance_policy_settings (
  organization_id     UUID PRIMARY KEY REFERENCES organizations(id),
  advance_max_amount_per_request_satang INTEGER,            -- NULL = ไม่จำกัด (ไฟล์ 15 — validation ADVANCE_EXCEEDS_MAX)
  require_payee_id_document BOOLEAN NOT NULL DEFAULT false, -- ไฟล์ 18
  ar_aging_buckets    INTEGER[] NOT NULL DEFAULT '{30,60,90}', -- ไฟล์ 19 §6.4 (สร้างช่วง 0-30/31-60/61-90/90+ อัตโนมัติ)
  -- มติ PO 2026-08-12 ข้อ B4 — เพดานตัดส่วนต่างค่าธรรมเนียมธนาคารอัตโนมัติ (default 50 บาท)
  write_off_tolerance_satang INTEGER NOT NULL DEFAULT 5000,
  -- มติ PO 2026-08-12 ข้อ D12 — advance ไม่มีใบเสร็จ → ตัดเป็นลูกหนี้พนักงาน หักจาก payout รอบถัดไป
  advance_uncleared_to_employee_receivable BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- ── bank_file_formats ────────────────────────────────────────
-- รูปแบบไฟล์ธนาคาร ตามไฟล์ 13 §6.8 (DEC-006/D1) — validation BANK_FILE_NOT_TESTED อ้าง test_status ที่นี่
CREATE TABLE bank_file_formats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  bank_name       TEXT NOT NULL,
  file_type       bank_file_type NOT NULL,
  encoding        bank_file_encoding NOT NULL,  -- 🔶 TIS-620/UTF-8 ต้องทดสอบจริงกับธนาคารก่อน production
  column_mapping  TEXT NOT NULL,
  test_status     bank_file_test_status NOT NULL DEFAULT 'pending',  -- ต้อง 'passed' ก่อนใช้ตัดโอนจริง
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ
);

-- ── tax_document_template_settings ───────────────────────────
-- รูปแบบเอกสารภาษีทางการ ตามไฟล์ 13 §6.13 (DEC-006/D1) — ฟิลด์บังคับตามกฎหมายปิด/ซ่อนไม่ได้ (ไฟล์ 28 §6.2-6.3)
CREATE TABLE tax_document_template_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  document_type   tax_document_type NOT NULL,
  logo_url        TEXT,
  footer_note     TEXT,
  signature_image_url TEXT,
  paper_size      tax_doc_paper_size NOT NULL DEFAULT 'A4',
  language        tax_doc_language  NOT NULL DEFAULT 'th',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  UNIQUE(organization_id, document_type)
);
```

---

## 6. Schema Group C — Case Workflow

```sql
-- ── cases ─────────────────────────────────────────────────────
-- เคสงานติดตามทรัพย์ ตามไฟล์ 38
CREATE TABLE cases (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organizations(id),
  -- Reference
  case_ref        TEXT         NOT NULL,  -- เลขสัญญาจากไฟแนนซ์ เช่น SF-2026-00832
  tracking_round  INTEGER      NOT NULL DEFAULT 1,  -- รอบติดตาม (เพิ่มเมื่อ recycle)
  source          case_source  NOT NULL DEFAULT 'manual',
  status          case_status  NOT NULL DEFAULT 'draft',
  -- Finance Company
  company_id      UUID         NOT NULL REFERENCES finance_companies(id),
  -- Service Fee (snapshot ตอน approved — ไฟล์ 10 §9.2)
  service_fee_template_id      UUID REFERENCES service_fee_templates(id),
  service_fee_model_snapshot   service_fee_model,
  service_fee_base_satang      INTEGER,
  service_fee_rate_pct         NUMERIC(5,2),
  service_fee_basis_snapshot   service_fee_basis,
  service_fee_charge_on_fail   BOOLEAN,
  -- Debtor info
  debtor_name         TEXT     NOT NULL,
  debtor_national_id  VARCHAR(13),
  debtor_phone_mobile VARCHAR(20),
  debtor_phone_work   VARCHAR(20),
  debtor_line_id      TEXT,
  debtor_facebook     TEXT,
  -- Address (current)
  addr_province       TEXT,
  addr_district       TEXT,
  addr_subdistrict    TEXT,
  addr_postal_code    VARCHAR(5),
  addr_detail         TEXT,
  -- Asset
  asset_description   TEXT     NOT NULL,
  imei                VARCHAR(15),                     -- A6: IMEI 15 หลักเท่านั้น (exact match)
  serial_no           TEXT,                            -- A6: เครื่องที่ไม่มี IMEI (tablet Wi-Fi ฯลฯ)
  debt_amount_satang  INTEGER,
  asset_value_satang  INTEGER,
  -- Team Assignment (ไฟล์ 38 §6.4)
  suggested_team_id   UUID     REFERENCES teams(id),   -- ระบบเสนอ
  assigned_team_id    UUID     REFERENCES teams(id),   -- ผู้จัดการยืนยัน
  team_change_reason  TEXT,                            -- ถ้าเปลี่ยนจากที่เสนอ
  -- Review
  reviewed_by         UUID     REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  review_note         TEXT,
  -- Close
  outcome             case_outcome,
  closed_at           TIMESTAMPTZ,
  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID        NOT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          UUID        REFERENCES users(id),
  deleted_at          TIMESTAMPTZ,
  UNIQUE(organization_id, company_id, case_ref, tracking_round)
);
CREATE INDEX idx_cases_org_status     ON cases(organization_id, status);
CREATE INDEX idx_cases_org_company    ON cases(organization_id, company_id);
CREATE INDEX idx_cases_org_team       ON cases(organization_id, assigned_team_id);
CREATE INDEX idx_cases_closed         ON cases(organization_id, outcome, closed_at);

-- ── case_documents ───────────────────────────────────────────
-- เอกสารแนบต่อเคส (ตามไฟล์ 38 §6.3)
CREATE TABLE case_documents (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID    NOT NULL REFERENCES organizations(id),
  case_id         UUID    NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  document_type   TEXT    NOT NULL,  -- contract_doc | national_id_doc | product_photo | other_doc
  file_url        TEXT    NOT NULL,  -- Supabase Storage URL
  file_hash       TEXT    NOT NULL,  -- SHA-256 (ตามไฟล์ 01)
  original_name   TEXT    NOT NULL,
  mime_type       TEXT    NOT NULL,
  size_bytes      INTEGER NOT NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by     UUID    NOT NULL REFERENCES users(id),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_case_docs_case ON case_documents(case_id, document_type);

-- ── case_contacts ────────────────────────────────────────────
-- ผู้ที่เกี่ยวข้องกับลูกหนี้
CREATE TABLE case_contacts (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID    NOT NULL REFERENCES organizations(id),
  case_id         UUID    NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  contact_name    TEXT    NOT NULL,
  relation        TEXT    NOT NULL,
  phone           VARCHAR(20),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID    NOT NULL REFERENCES users(id)
);
CREATE INDEX idx_case_contacts_case ON case_contacts(case_id);

-- ── recycle_requests ─────────────────────────────────────────
-- คำขอ recycle เคส closed_fail (ไฟล์ 38 §6.5)
CREATE TABLE recycle_requests (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID            NOT NULL REFERENCES organizations(id),
  case_id         UUID            NOT NULL REFERENCES cases(id),
  status          recycle_status  NOT NULL DEFAULT 'pending',
  request_note    TEXT            NOT NULL,
  decision_note   TEXT,
  decided_by      UUID            REFERENCES users(id),
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_by      UUID            NOT NULL REFERENCES users(id)
);
CREATE INDEX idx_recycle_requests_case ON recycle_requests(case_id, status);

-- ── case_assignments ─────────────────────────────────────────
-- การมอบหมายงาน Field Agent ตามไฟล์ 40
CREATE TABLE case_assignments (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID              NOT NULL REFERENCES organizations(id),
  case_id         UUID              NOT NULL REFERENCES cases(id),
  agent_id        UUID              NOT NULL REFERENCES users(id),  -- Field Agent
  team_id         UUID              NOT NULL REFERENCES teams(id),
  tracking_round  INTEGER           NOT NULL DEFAULT 1,
  status          assignment_status NOT NULL DEFAULT 'pending',
  -- จัดวันที่
  scheduled_date  DATE,
  accepted_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  -- Reassign
  reassigned_from UUID              REFERENCES case_assignments(id),
  reassign_reason TEXT,
  -- Audit
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  created_by      UUID              NOT NULL REFERENCES users(id),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_by      UUID              REFERENCES users(id)
);
CREATE INDEX idx_assignments_case   ON case_assignments(case_id, status);
CREATE INDEX idx_assignments_agent  ON case_assignments(agent_id, status);

-- ── check_ins ────────────────────────────────────────────────
-- เช็คอินระหว่างลงพื้นที่ ตามไฟล์ 41 §6.2
CREATE TABLE check_ins (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID          NOT NULL REFERENCES organizations(id),
  case_id         UUID          NOT NULL REFERENCES cases(id),
  assignment_id   UUID          NOT NULL REFERENCES case_assignments(id),
  checkin_type    checkin_type  NOT NULL,
  latitude        NUMERIC(10,7) NOT NULL,
  longitude       NUMERIC(10,7) NOT NULL,
  address_note    TEXT,
  note            TEXT,
  checked_in_at   TIMESTAMPTZ   NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by      UUID          NOT NULL REFERENCES users(id)
);
CREATE INDEX idx_checkins_case ON check_ins(case_id, checked_in_at);

-- ── case_evidences ───────────────────────────────────────────
-- หลักฐานปิดงาน ตามไฟล์ 41 §6.3
CREATE TABLE case_evidences (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID            NOT NULL REFERENCES organizations(id),
  case_id         UUID            NOT NULL REFERENCES cases(id),
  assignment_id   UUID            NOT NULL REFERENCES case_assignments(id),
  outcome         case_outcome    NOT NULL,
  status          evidence_status NOT NULL DEFAULT 'pending',
  -- Files
  product_photos  TEXT[]          NOT NULL DEFAULT '{}',  -- URLs รูปสินค้า
  video_url       TEXT,
  -- Review
  reviewed_by     UUID            REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  reject_reason   TEXT,
  -- Travel
  travel_origin_lat   NUMERIC(10,7),
  travel_origin_lng   NUMERIC(10,7),
  travel_origin_source TEXT,  -- gps_auto | manual
  -- Audit
  submitted_at    TIMESTAMPTZ     NOT NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_by      UUID            NOT NULL REFERENCES users(id),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_by      UUID            REFERENCES users(id)
);
CREATE INDEX idx_evidences_case ON case_evidences(case_id, status);
```

---

## 7. Schema Group D — Warehouse (ไฟล์ 44)

```sql
-- ── assets ───────────────────────────────────────────────────
CREATE TABLE assets (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID            NOT NULL REFERENCES organizations(id),
  case_id         UUID            NOT NULL REFERENCES cases(id),
  company_id      UUID            NOT NULL REFERENCES finance_companies(id),
  lot_id          UUID            REFERENCES handover_lots(id),
  -- Snapshot จาก Case
  case_ref        TEXT            NOT NULL,
  debtor_name     TEXT            NOT NULL,
  device_desc     TEXT            NOT NULL,
  -- IMEI / Serial (A6 — มติ PO 2026-08-12)
  imei_contract   VARCHAR(15),               -- NULL ได้เฉพาะเครื่องที่ไม่มี IMEI (ต้องมี serial_contract แทน)
  imei_actual     VARCHAR(15),
  serial_contract TEXT,
  serial_actual   TEXT,
  -- Status & Condition
  asset_status    asset_status    NOT NULL DEFAULT 'pending_intake',
  condition       asset_condition,
  condition_note  TEXT,
  -- Photos (Supabase Storage URLs)
  photos          TEXT[]          NOT NULL DEFAULT '{}',
  -- Timestamps
  closed_at       TIMESTAMPTZ     NOT NULL,   -- snapshot จาก Case.closed_at
  received_at     TIMESTAMPTZ,               -- วันรับเข้าคลัง
  -- Rejection
  reject_reason   TEXT,
  rejected_at     TIMESTAMPTZ,
  rejected_by     UUID            REFERENCES users(id),
  -- Audit
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_by      UUID            NOT NULL REFERENCES users(id),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_by      UUID            REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  -- A6: ต้องระบุ identifier อย่างน้อย 1 อย่าง
  CONSTRAINT assets_identifier_required CHECK (imei_contract IS NOT NULL OR serial_contract IS NOT NULL)
);
-- A6: เดิม UNIQUE(organization_id, imei_contract) เต็มตาราง → เครื่องเดิมที่ recycle กลับมาชน unique
-- ใหม่: unique เฉพาะเครื่องที่ยัง**ไม่ส่งมอบ** (business check ตอน intake ยังต้องมีข้อความอ่านออก)
CREATE UNIQUE INDEX uniq_assets_active_imei
  ON assets(organization_id, imei_contract)
  WHERE imei_contract IS NOT NULL AND asset_status <> 'handed_over' AND deleted_at IS NULL;
CREATE INDEX idx_assets_org_status  ON assets(organization_id, asset_status);
CREATE INDEX idx_assets_org_company ON assets(organization_id, company_id, asset_status);
CREATE INDEX idx_assets_lot         ON assets(lot_id);

-- ── handover_lots ────────────────────────────────────────────
CREATE TABLE handover_lots (
  id                  UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID                 NOT NULL REFERENCES organizations(id),
  company_id          UUID                 NOT NULL REFERENCES finance_companies(id),
  -- Auto-generated (ใช้ PostgreSQL sequence)
  lot_number          TEXT                 NOT NULL UNIQUE,  -- LOT-2569-001
  doc_ref             TEXT                 NOT NULL UNIQUE,  -- DLV-2569-001
  -- Type & Status
  type                handover_type        NOT NULL,
  status              handover_lot_status  NOT NULL DEFAULT 'pending_attach',
  -- Scheduling
  scheduled_at        TIMESTAMPTZ,
  contact_person      TEXT,
  delivery_addr       TEXT,
  -- Delivery
  delivered_at        TIMESTAMPTZ,
  tracking_no         TEXT,
  -- Confirmation
  confirmed_at        TIMESTAMPTZ,
  confirmed_by        UUID                 REFERENCES users(id),
  -- Documents
  signed_doc_url      TEXT,       -- ① ใบเซ็นรับ (บังคับก่อน confirmed)
  delivery_proof_url  TEXT,       -- ② หลักฐานจัดส่ง (บังคับเฉพาะ we_deliver)
  note                TEXT,
  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID        NOT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          UUID        REFERENCES users(id),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX idx_lots_org_status  ON handover_lots(organization_id, status);
CREATE INDEX idx_lots_org_company ON handover_lots(organization_id, company_id, status);
```

---

## 8. Schema Group E — Finance Operation

```sql
-- ── payee_profiles ───────────────────────────────────────────
-- ตามไฟล์ 18
CREATE TABLE payee_profiles (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID    NOT NULL REFERENCES organizations(id),
  user_id         UUID    NOT NULL REFERENCES users(id),
  payee_type      payee_type NOT NULL DEFAULT 'individual', -- เพิ่ม 03/07/2569 (ไฟล์ 18 §7.1) — individual/corporate ไม่ผูกกับ inhouse/outsource ตรงๆ
  tax_profile_id  UUID    REFERENCES tax_profiles(id),  -- Payee level ชนะ Plan level (ไฟล์ 18 §6.3)
  bank_name       TEXT,
  account_name    TEXT,
  account_number  TEXT,
  national_id     VARCHAR(13),
  id_document_url TEXT,   -- เพิ่ม 03/07/2569 (ไฟล์ 18 §7.1/§10) — บังคับเมื่อ require_payee_id_document=true (ไฟล์ 13 §6.2)
  is_verified     BOOLEAN NOT NULL DEFAULT false,
  verified_by     UUID    REFERENCES users(id),
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID    NOT NULL REFERENCES users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID    REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  UNIQUE(organization_id, user_id)
);

-- ── expenses ─────────────────────────────────────────────────
-- รายการเบิกค่าตอบแทน ตามไฟล์ 15, 41 §6.6
CREATE TABLE expenses (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID            NOT NULL REFERENCES organizations(id),
  -- Source (nullable ถ้าเป็น Manual Claim ไม่ผูกเคส)
  case_id         UUID            REFERENCES cases(id),
  assignment_id   UUID            REFERENCES case_assignments(id),
  payee_id        UUID            NOT NULL REFERENCES payee_profiles(id),
  -- Type & Amount
  expense_type    expense_type    NOT NULL,
  gross_satang    INTEGER         NOT NULL,
  -- Calculation source (ตามไฟล์ 38 §6.4)
  calculation_source    TEXT,   -- 'compensation_plan' | 'manual' | 'receipt'
  comp_plan_id          UUID    REFERENCES compensation_plans(id),  -- snapshot
  comp_plan_version     INTEGER,
  -- Status
  status          expense_status  NOT NULL DEFAULT 'pending_warehouse_confirm',
  -- Approval
  manager_approved_by   UUID    REFERENCES users(id),
  manager_approved_at   TIMESTAMPTZ,
  finance_approved_by   UUID    REFERENCES users(id),
  finance_approved_at   TIMESTAMPTZ,
  executive_approved_by UUID    REFERENCES users(id),   -- ขั้นเกินเพดานตาม Approval Matrix (ไฟล์ 16 §6.1 — เพิ่ม 04/07/2569 DEC-006/D5)
  executive_approved_at TIMESTAMPTZ,
  approval_step_current INTEGER NOT NULL DEFAULT 1,     -- ไฟล์ 16 §7 — ขั้นอนุมัติปัจจุบัน
  approval_step_total   INTEGER NOT NULL DEFAULT 2,     -- ไฟล์ 16 §7 — 2 หรือ 3 ตาม approval_flow
  approval_history      JSONB   NOT NULL DEFAULT '[]',  -- ไฟล์ 16 §7 — [{step, approver_id, action, timestamp, reason}]
  approval_matrix_id    UUID    REFERENCES approval_matrices(id),  -- snapshot ว่ารายการนี้ใช้ matrix แถวไหน
  rejection_reason      TEXT,
  revision_note         TEXT,
  -- Payout (FK → payout_batch_items เมื่อเข้ารอบจ่าย)
  payout_batch_item_id  UUID,   -- FK กลับไป (set หลัง payout_batch_items สร้าง)
  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID        NOT NULL REFERENCES users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID        REFERENCES users(id),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_expenses_org_status ON expenses(organization_id, status);
CREATE INDEX idx_expenses_case       ON expenses(case_id, status);
CREATE INDEX idx_expenses_payee      ON expenses(payee_id, status);

-- ── advances ─────────────────────────────────────────────────
-- เงินทดรองจ่าย ตามไฟล์ 15
CREATE TABLE advances (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID            NOT NULL REFERENCES organizations(id),
  payee_id            UUID            NOT NULL REFERENCES payee_profiles(id),
  requested_satang    INTEGER         NOT NULL,
  approved_satang     INTEGER,
  used_satang         INTEGER         NOT NULL DEFAULT 0,
  return_satang       INTEGER         GENERATED ALWAYS AS (
                        GREATEST(0, COALESCE(approved_satang,0) - used_satang)
                      ) STORED,
  status              advance_status  NOT NULL DEFAULT 'pending_approval',
  purpose             TEXT            NOT NULL,
  due_clear_date      DATE            NOT NULL,
  approved_by         UUID            REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  cleared_at          TIMESTAMPTZ,
  rejection_reason    TEXT,
  -- A4 (มติ PO 2026-08-12): เส้นทางจ่ายเงินทดรองออกผ่านรอบจ่าย (คู่กับ payout_batch_items.advance_id)
  payout_batch_item_id UUID,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_by          UUID            NOT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_by          UUID            REFERENCES users(id),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX idx_advances_payee  ON advances(payee_id, status);
CREATE INDEX idx_advances_due    ON advances(organization_id, due_clear_date, status);
-- ห้ามเบิกซ้อน: 1 payee ถือ Advance ค้าง (approved/overdue) ได้ครั้งละ 1 รายการเท่านั้น (ไฟล์ 15 §9.2 — DEC-006/D7)
CREATE UNIQUE INDEX uniq_active_advance_per_payee
  ON advances(payee_id) WHERE status IN ('approved','overdue') AND deleted_at IS NULL;

-- ── payout_batches ───────────────────────────────────────────
-- รอบจ่ายเงิน ตามไฟล์ 17
CREATE TABLE payout_batches (
  id                    UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID                 NOT NULL REFERENCES organizations(id),
  name                  TEXT                 NOT NULL,
  side                  payout_batch_side    NOT NULL,
  status                payout_batch_status  NOT NULL DEFAULT 'draft',
  -- Totals (คำนวณจาก items)
  gross_satang          INTEGER              NOT NULL DEFAULT 0,
  wht_satang            INTEGER              NOT NULL DEFAULT 0,
  net_satang            INTEGER              NOT NULL DEFAULT 0,
  -- Payment File
  bank_account_id       UUID                 REFERENCES bank_accounts(id),
  payment_file_url      TEXT,
  payment_file_generated_at TIMESTAMPTZ,
  idempotency_key       TEXT                 UNIQUE,  -- ป้องกันโอนซ้ำ (ไฟล์ 17 §6.3)
  -- Audit
  created_at            TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  created_by            UUID                 NOT NULL REFERENCES users(id),
  updated_at            TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_by            UUID                 REFERENCES users(id),
  deleted_at            TIMESTAMPTZ
);
CREATE INDEX idx_payout_batches_org ON payout_batches(organization_id, status);

-- ── payout_batch_items ───────────────────────────────────────
CREATE TABLE payout_batch_items (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID    NOT NULL REFERENCES organizations(id),
  payout_batch_id   UUID    NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
  -- A4 (มติ PO 2026-08-12): แหล่งที่มา 2 แบบ — separate FK + exactly-one non-null (DEC-004)
  expense_id        UUID    REFERENCES expenses(id),
  advance_id        UUID    REFERENCES advances(id),
  payee_id          UUID    NOT NULL REFERENCES payee_profiles(id),
  tracking_round    INTEGER NOT NULL DEFAULT 1,  -- B3 (มติ PO 2026-08-12): รอบติดตามของเคสต้นทาง
  gross_satang      INTEGER NOT NULL,
  wht_satang        INTEGER NOT NULL DEFAULT 0,
  net_satang        INTEGER NOT NULL,
  tax_profile_id    UUID    REFERENCES tax_profiles(id),  -- snapshot ณ เวลาสร้าง
  wht_pct_snapshot  NUMERIC(5,2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID    NOT NULL REFERENCES users(id),
  UNIQUE(payout_batch_id, expense_id),
  UNIQUE(payout_batch_id, advance_id),
  CONSTRAINT pbi_one_source CHECK (
    (CASE WHEN expense_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN advance_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);
CREATE INDEX idx_pbi_batch   ON payout_batch_items(payout_batch_id);
CREATE INDEX idx_pbi_expense  ON payout_batch_items(expense_id);

-- ── revenues ─────────────────────────────────────────────────
-- รายได้ ตามไฟล์ 19
CREATE TABLE revenues (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID            NOT NULL REFERENCES organizations(id),
  case_id               UUID            NOT NULL REFERENCES cases(id),
  company_id            UUID            NOT NULL REFERENCES finance_companies(id),
  billing_batch_id      UUID            REFERENCES billing_batches(id),
  tracking_round        INTEGER         NOT NULL DEFAULT 1,  -- B3 (มติ PO 2026-08-12): กันบิลซ้ำข้ามรอบ recycle
  -- Amounts
  gross_satang          INTEGER         NOT NULL,
  vat_satang            INTEGER         NOT NULL DEFAULT 0,
  vat_rate_pct_used     NUMERIC(5,2)    NOT NULL DEFAULT 7.00,  -- snapshot
  total_satang          INTEGER         NOT NULL,               -- gross + vat
  -- Model snapshot
  fee_model_snapshot    service_fee_model NOT NULL,
  -- Status
  status                revenue_status  NOT NULL DEFAULT 'ready_for_billing',
  revenue_date          DATE            NOT NULL,
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_by            UUID            NOT NULL REFERENCES users(id),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_by            UUID            REFERENCES users(id),
  deleted_at            TIMESTAMPTZ
);
CREATE INDEX idx_revenues_org_status  ON revenues(organization_id, status);
CREATE INDEX idx_revenues_company     ON revenues(company_id, status);
CREATE INDEX idx_revenues_case        ON revenues(case_id);

-- ── billing_batches ──────────────────────────────────────────
-- รอบวางบิล ตามไฟล์ 19
CREATE TABLE billing_batches (
  id                UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID                  NOT NULL REFERENCES organizations(id),
  company_id        UUID                  NOT NULL REFERENCES finance_companies(id),
  period            TEXT                  NOT NULL,  -- "มิถุนายน 2569"
  status            billing_batch_status  NOT NULL DEFAULT 'draft',
  total_satang      INTEGER               NOT NULL DEFAULT 0,
  received_satang   INTEGER               NOT NULL DEFAULT 0,
  -- A1 (มติ PO 2026-08-12): WHT ที่ลูกค้า (ไฟแนนซ์) หักจากเรา — auto-match ต้องเทียบ total − wht ด้วย
  wht_withheld_by_customer_satang INTEGER NOT NULL DEFAULT 0,
  due_date          DATE                  NOT NULL,
  sent_at           TIMESTAMPTZ,
  sent_by           UUID                  REFERENCES users(id),
  created_at        TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  created_by        UUID                  NOT NULL REFERENCES users(id),
  updated_at        TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_by        UUID                  REFERENCES users(id),
  deleted_at        TIMESTAMPTZ,
  UNIQUE(organization_id, company_id, period)
);
CREATE INDEX idx_billing_org_status  ON billing_batches(organization_id, status);
CREATE INDEX idx_billing_company     ON billing_batches(company_id, status);

-- ── adjustments ──────────────────────────────────────────────
-- รายการปรับปรุง ตามไฟล์ 20 (Separate FK columns — DEC-004)
CREATE TABLE adjustments (
  id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID                NOT NULL REFERENCES organizations(id),
  adjustment_type     adjustment_type     NOT NULL,
  amount_satang       INTEGER             NOT NULL,
  reason              TEXT                NOT NULL,
  status              adjustment_status   NOT NULL DEFAULT 'pending_approval',
  period_status_at_target TEXT,  -- snapshot: collecting | sent_to_accountant | locked
  -- Polymorphic target (Separate FK columns — ไฟล์ 94 DEC-004)
  -- ต้องมีเพียง 1 column ที่ไม่ NULL ต่อ 1 record
  revenue_id          UUID                REFERENCES revenues(id),
  expense_id          UUID                REFERENCES expenses(id),
  billing_batch_id    UUID                REFERENCES billing_batches(id),
  payout_batch_id     UUID                REFERENCES payout_batches(id),
  -- Approval
  approved_by         UUID                REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  -- Audit
  created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  created_by          UUID                NOT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_by          UUID                REFERENCES users(id),
  CONSTRAINT adjustments_one_target CHECK (
    (CASE WHEN revenue_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN expense_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN billing_batch_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN payout_batch_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);
CREATE INDEX idx_adjustments_org_status ON adjustments(organization_id, status);
```

---

## 9. Schema Group F — Accounting Handover

```sql
-- ── accounting_periods ───────────────────────────────────────
-- รอบบัญชีรายเดือน ตามไฟล์ 30
CREATE TABLE accounting_periods (
  id                UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID                     NOT NULL REFERENCES organizations(id),
  period_label      TEXT                     NOT NULL,  -- "มิถุนายน 2569"
  year_be           INTEGER                  NOT NULL,  -- 2569 (พ.ศ.)
  month             INTEGER                  NOT NULL,  -- 1-12
  status            accounting_period_status NOT NULL DEFAULT 'collecting',
  -- Export
  export_ready      BOOLEAN                  NOT NULL DEFAULT false,
  last_readiness_checked_at TIMESTAMPTZ,
  -- Sent to accountant
  sent_at           TIMESTAMPTZ,
  sent_by           UUID                     REFERENCES users(id),
  -- Locked
  locked_at         TIMESTAMPTZ,
  locked_by         UUID                     REFERENCES users(id),
  created_at        TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  created_by        UUID                     NOT NULL REFERENCES users(id),
  updated_at        TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, year_be, month)
);

-- ── sales_records ────────────────────────────────────────────
-- บันทึกขาย (บัญชีรายได้) ตามไฟล์ 31
CREATE TABLE sales_records (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID    NOT NULL REFERENCES organizations(id),
  period_id           UUID    NOT NULL REFERENCES accounting_periods(id),
  billing_batch_id    UUID    NOT NULL REFERENCES billing_batches(id) UNIQUE,
  company_id          UUID    NOT NULL REFERENCES finance_companies(id),
  total_before_vat_satang INTEGER NOT NULL,
  vat_satang          INTEGER NOT NULL DEFAULT 0,
  total_satang        INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID    NOT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sales_records_period  ON sales_records(period_id);
CREATE INDEX idx_sales_records_company ON sales_records(company_id, period_id);

-- ── tax_invoices ─────────────────────────────────────────────
-- ใบกำกับภาษี ตามไฟล์ 31 §8
CREATE TABLE tax_invoices (
  id                UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID                NOT NULL REFERENCES organizations(id),
  sales_record_id   UUID                NOT NULL REFERENCES sales_records(id),
  invoice_number    TEXT                NOT NULL UNIQUE,  -- auto-gen, ห้ามแก้
  invoice_date      DATE                NOT NULL,
  status            tax_invoice_status  NOT NULL DEFAULT 'active',
  cancel_reason     TEXT,
  cancelled_by      UUID                REFERENCES users(id),
  cancelled_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  created_by        UUID                NOT NULL REFERENCES users(id)
);
CREATE INDEX idx_tax_invoices_org ON tax_invoices(organization_id, status);

-- ── cash_receipts ────────────────────────────────────────────
-- บันทึกรับเงิน ตามไฟล์ 31
CREATE TABLE cash_receipts (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID    NOT NULL REFERENCES organizations(id),
  period_id         UUID    NOT NULL REFERENCES accounting_periods(id),
  billing_batch_id  UUID    NOT NULL REFERENCES billing_batches(id),
  bank_transaction_id UUID  REFERENCES bank_transactions(id),
  amount_satang     INTEGER NOT NULL,
  -- A1 (มติ PO 2026-08-12): WHT ที่ลูกค้าหักจากยอดนี้ = เครดิตภาษีของบริษัท
  wht_withheld_by_customer_satang INTEGER NOT NULL DEFAULT 0,
  received_date     DATE    NOT NULL,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID    NOT NULL REFERENCES users(id)
);
CREATE INDEX idx_cash_receipts_period  ON cash_receipts(period_id);
CREATE INDEX idx_cash_receipts_billing ON cash_receipts(billing_batch_id);

-- ── expense_records ──────────────────────────────────────────
-- บัญชีค่าใช้จ่าย ตามไฟล์ 32
CREATE TABLE expense_records (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID    NOT NULL REFERENCES organizations(id),
  period_id           UUID    NOT NULL REFERENCES accounting_periods(id),
  payout_batch_item_id UUID   NOT NULL REFERENCES payout_batch_items(id) UNIQUE,
  cost_center_id      UUID    REFERENCES cost_centers(id),
  gross_satang        INTEGER NOT NULL,
  wht_satang          INTEGER NOT NULL DEFAULT 0,
  net_satang          INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID    NOT NULL REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_expense_records_period ON expense_records(period_id);

-- ── wht_certificates ─────────────────────────────────────────
-- หนังสือรับรองหัก ณ ที่จ่าย (ใบ 50 ทวิ) ตามไฟล์ 33
CREATE TABLE wht_certificates (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID              NOT NULL REFERENCES organizations(id),
  certificate_number  TEXT              NOT NULL UNIQUE,
  payee_id            UUID              NOT NULL REFERENCES payee_profiles(id),
  expense_record_id   UUID              NOT NULL REFERENCES expense_records(id),
  income_type         TEXT              NOT NULL DEFAULT 'ค่าจ้างทำของ มาตรา 40(8)',
  payment_date        DATE              NOT NULL,
  gross_satang        INTEGER           NOT NULL,
  wht_satang          INTEGER           NOT NULL,
  filing_form         wht_filing_form   NOT NULL,
  delivery_format     wht_delivery_format NOT NULL DEFAULT 'paper',  -- แก้ TEXT → enum 04/07/2569 (DEC-006/D4)
  -- Cancellation model (ไฟล์ 33 §10 — เพิ่ม 04/07/2569 DEC-006/D4, หลักการเดียวกับ tax_invoices)
  status              wht_certificate_status NOT NULL DEFAULT 'active',
  cancel_reason       TEXT,                                   -- บังคับกรอกเมื่อ cancelled (WHT_CANCEL_REQUIRES_REASON)
  cancelled_by        UUID              REFERENCES users(id),
  cancelled_at        TIMESTAMPTZ,
  replaces_certificate_id UUID          REFERENCES wht_certificates(id),  -- ใบใหม่อ้างอิงฉบับที่ถูกยกเลิก
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  created_by          UUID              NOT NULL REFERENCES users(id)
);
CREATE INDEX idx_wht_certs_payee ON wht_certificates(payee_id, payment_date);

-- ── wht_filing_summaries ─────────────────────────────────────
-- สรุปยื่น WHT รายเดือน ตามไฟล์ 33
CREATE TABLE wht_filing_summaries (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID              NOT NULL REFERENCES organizations(id),
  period_id       UUID              NOT NULL REFERENCES accounting_periods(id),
  period_label    TEXT              NOT NULL,
  filing_due_date DATE              NOT NULL,  -- คำนวณอัตโนมัติ
  pnd3_satang     INTEGER           NOT NULL DEFAULT 0,
  pnd53_satang    INTEGER           NOT NULL DEFAULT 0,
  status          wht_filing_status NOT NULL DEFAULT 'pending',
  filed_at        TIMESTAMPTZ,
  filed_by        UUID              REFERENCES users(id),
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, period_id)
);

-- ── exceptions ───────────────────────────────────────────────
-- ข้อยกเว้น/ปัญหาที่ต้องแก้ไขก่อน export ตามไฟล์ 34
CREATE TABLE exceptions (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID              NOT NULL REFERENCES organizations(id),
  period_id       UUID              NOT NULL REFERENCES accounting_periods(id),
  level           exception_level   NOT NULL,
  status          exception_status  NOT NULL DEFAULT 'open',
  title           TEXT              NOT NULL,
  description     TEXT              NOT NULL,
  source_module   TEXT              NOT NULL,  -- 'billing' | 'payout' | 'bank' | etc.
  source_ref      TEXT,                        -- เลขอ้างอิง (free text, ไม่ใช่ FK)
  resolved_by     UUID              REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  -- Authorized exception (critical only) — Executive อนุมัติ
  authorized_by   UUID              REFERENCES users(id),
  authorized_at   TIMESTAMPTZ,
  authorize_note  TEXT,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  created_by      UUID              NOT NULL REFERENCES users(id),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_by      UUID              REFERENCES users(id)
);
CREATE INDEX idx_exceptions_period ON exceptions(period_id, level, status);

-- ── bank_transactions ────────────────────────────────────────
-- รายการธนาคาร ตามไฟล์ 35
CREATE TABLE bank_transactions (
  id                UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID                NOT NULL REFERENCES organizations(id),
  period_id         UUID                NOT NULL REFERENCES accounting_periods(id),
  bank_account_id   UUID                NOT NULL REFERENCES bank_accounts(id),
  transaction_date  DATE                NOT NULL,
  description       TEXT                NOT NULL,
  amount_satang     INTEGER             NOT NULL,  -- บวก=รับเงิน, ลบ=จ่ายเงิน
  match_status      bank_match_status   NOT NULL DEFAULT 'unmatched',
  match_note        TEXT,
  -- Polymorphic match (Separate FK — DEC-004)
  matched_billing_id UUID               REFERENCES billing_batches(id),
  matched_payout_id  UUID               REFERENCES payout_batches(id),
  matched_advance_id UUID               REFERENCES advances(id),   -- A4: ขาจ่าย/รับคืนเงินทดรอง
  -- A2: true = จับคู่แบบแบ่งยอดผ่าน bank_transaction_allocations (FK ทั้ง 3 ตัวข้างบนต้อง NULL)
  is_split_allocation BOOLEAN           NOT NULL DEFAULT false,
  matched_by        UUID                REFERENCES users(id),
  matched_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  created_by        UUID                NOT NULL REFERENCES users(id),
  updated_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_by        UUID                REFERENCES users(id),
  CONSTRAINT bank_tx_one_match CHECK (
    (CASE WHEN matched_billing_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN matched_payout_id  IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN matched_advance_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  ),
  CONSTRAINT bank_tx_status_fk_shape CHECK (  -- DEC-006/D7: ผูก match_status กับการมี FK กัน state เพี้ยน
    (match_status IN ('auto_matched','manual_matched')
       AND (
         (is_split_allocation = false
            AND (matched_billing_id IS NOT NULL OR matched_payout_id IS NOT NULL OR matched_advance_id IS NOT NULL))
         OR (is_split_allocation = true
            AND matched_billing_id IS NULL AND matched_payout_id IS NULL AND matched_advance_id IS NULL)
       ))
    OR (match_status IN ('unmatched','unmatched_resolved')
       AND is_split_allocation = false
       AND matched_billing_id IS NULL AND matched_payout_id IS NULL AND matched_advance_id IS NULL)
  )
);
CREATE INDEX idx_bank_tx_period  ON bank_transactions(period_id, match_status);
CREATE INDEX idx_bank_tx_account ON bank_transactions(bank_account_id, transaction_date);

-- ── bank_transaction_allocations ─────────────────────────────
-- A2 (มติ PO 2026-08-12): เงินเข้าก้อนเดียวตัดได้หลายรอบบิล / จ่ายบางส่วน (ไฟล์ 35)
-- ส่วนเกินจากยอดบิล → แถว is_credit = true (billing_batch_id NULL) เก็บเป็น credit ของบริษัท **ไม่ให้ AR ติดลบ**
CREATE TABLE bank_transaction_allocations (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID    NOT NULL REFERENCES organizations(id),
  bank_transaction_id UUID    NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  company_id          UUID    NOT NULL REFERENCES finance_companies(id),
  billing_batch_id    UUID    REFERENCES billing_batches(id),  -- NULL = credit ของบริษัท
  allocated_satang    INTEGER NOT NULL,
  is_credit           BOOLEAN NOT NULL DEFAULT false,
  note                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID    NOT NULL REFERENCES users(id),
  UNIQUE(bank_transaction_id, billing_batch_id),
  CONSTRAINT bank_tx_alloc_shape CHECK (
    (is_credit = false AND billing_batch_id IS NOT NULL)
    OR (is_credit = true AND billing_batch_id IS NULL)
  ),
  CONSTRAINT bank_tx_alloc_amount_positive CHECK (allocated_satang > 0)
);
CREATE INDEX idx_bank_tx_alloc_billing ON bank_transaction_allocations(billing_batch_id);

-- ── customer_wht_certificates ────────────────────────────────
-- A1 (มติ PO 2026-08-12): ใบ 50 ทวิ ที่**ลูกค้า (บริษัทไฟแนนซ์) ออกให้เรา** = เครดิตภาษีของบริษัท
-- คนละตารางกับ wht_certificates (ที่เราออกให้ผู้รับเงิน)
CREATE TABLE customer_wht_certificates (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID    NOT NULL REFERENCES organizations(id),
  company_id         UUID    NOT NULL REFERENCES finance_companies(id),
  billing_batch_id   UUID    REFERENCES billing_batches(id),  -- NULL = ยังจับคู่รอบบิลไม่ได้
  certificate_number TEXT    NOT NULL,
  certificate_date   DATE    NOT NULL,
  gross_satang       INTEGER NOT NULL,   -- ฐาน before_vat (`22` §6.9)
  wht_satang         INTEGER NOT NULL,
  file_url           TEXT,               -- ไฟล์สแกนใบจริง
  note               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID    NOT NULL REFERENCES users(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         UUID    REFERENCES users(id),
  deleted_at         TIMESTAMPTZ,
  UNIQUE(organization_id, company_id, certificate_number)
);
CREATE INDEX idx_customer_wht_date ON customer_wht_certificates(organization_id, certificate_date);

-- ── accountant_questions ─────────────────────────────────────
-- คำถามจากสำนักงานบัญชี ตามไฟล์ 36
CREATE TABLE accountant_questions (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID    NOT NULL REFERENCES organizations(id),
  period_id       UUID    NOT NULL REFERENCES accounting_periods(id),
  question_text   TEXT    NOT NULL,
  answer_text     TEXT,
  answered_by     UUID    REFERENCES users(id),
  answered_at     TIMESTAMPTZ,
  is_resolved     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID    NOT NULL REFERENCES users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_accountant_questions_period ON accountant_questions(period_id, is_resolved);

-- ── export_records ───────────────────────────────────────────
-- ประวัติ Export Accounting Pack ตามไฟล์ 37
CREATE TABLE export_records (
  id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID                  NOT NULL REFERENCES organizations(id),
  period_id       UUID                  NOT NULL REFERENCES accounting_periods(id),
  version         INTEGER               NOT NULL DEFAULT 1,
  status          export_record_status  NOT NULL DEFAULT 'generated',
  file_urls       JSONB                 NOT NULL DEFAULT '{}',  -- {01: url, 02: url, ...}
  file_hash       TEXT                  NOT NULL,  -- SHA-256 ของ pack (ไฟล์ 01)
  generated_at    TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  generated_by    UUID                  NOT NULL REFERENCES users(id),
  sent_at         TIMESTAMPTZ,
  sent_by         UUID                  REFERENCES users(id),
  accepted_at     TIMESTAMPTZ
);
CREATE INDEX idx_exports_period ON export_records(period_id, version);
```

---

## 10. Schema Group G — Platform

```sql
-- ── audit_logs ───────────────────────────────────────────────
CREATE TABLE audit_logs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID          NOT NULL REFERENCES organizations(id),
  actor_id        UUID          REFERENCES users(id),  -- null = system job
  actor_role      TEXT,
  action          audit_action  NOT NULL,
  target_type     TEXT          NOT NULL,  -- 'cases' | 'expenses' | 'handover_lots' | ...
  target_id       UUID,
  before_data     JSONB,        -- snapshot ก่อน
  after_data      JSONB,        -- snapshot หลัง
  reason          TEXT,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  -- ห้ามแก้ไข/ลบ row นี้เด็ดขาด
);
CREATE INDEX idx_audit_target ON audit_logs(organization_id, target_type, target_id, created_at);
CREATE INDEX idx_audit_actor  ON audit_logs(organization_id, actor_id, created_at);

-- ── notifications ────────────────────────────────────────────
-- In-app notification เฟส 1 ตามไฟล์ 90 §6.3 (เพิ่ม 04/07/2569 — DEC-006/D3)
CREATE TABLE notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id),
  user_id         UUID        NOT NULL REFERENCES users(id),   -- ผู้รับ
  event_code      TEXT        NOT NULL,                        -- ตามรายการ event ไฟล์ 90 §6.3
  title           TEXT        NOT NULL,
  body            TEXT,
  link_path       TEXT,                                        -- deep link ในแอป
  read_at         TIMESTAMPTZ,                                 -- NULL = ยังไม่อ่าน
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

-- ── jobs ─────────────────────────────────────────────────────
-- Background jobs (Vercel Cron / QStash)
CREATE TABLE jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES organizations(id),
  job_type        TEXT        NOT NULL,  -- 'export_pack' | 'bank_file' | 'wht_summary' | 'reassign_timeout' | 'advance_overdue' (ไฟล์ 15 §9.1)
  status          job_status  NOT NULL DEFAULT 'pending',
  payload         JSONB       NOT NULL DEFAULT '{}',
  result          JSONB,
  error_message   TEXT,
  retry_count     INTEGER     NOT NULL DEFAULT 0,
  max_retries     INTEGER     NOT NULL DEFAULT 3,
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID        REFERENCES users(id)
);
CREATE INDEX idx_jobs_status ON jobs(status, scheduled_at);

-- ── files ────────────────────────────────────────────────────
-- Metadata ของไฟล์ทั้งหมดใน Supabase Storage
CREATE TABLE files (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID    NOT NULL REFERENCES organizations(id),
  bucket          TEXT    NOT NULL,      -- Supabase Storage bucket name
  path            TEXT    NOT NULL,      -- storage path
  url             TEXT    NOT NULL,      -- public/signed URL
  file_hash       TEXT    NOT NULL,      -- SHA-256
  original_name   TEXT    NOT NULL,
  mime_type       TEXT    NOT NULL,
  size_bytes      INTEGER NOT NULL,
  uploaded_by     UUID    REFERENCES users(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE(bucket, path)
);
```

---

## 11. Migration Order (ลำดับที่ต้อง run)

```
01_create_enums.sql
02_organizations.sql
03_roles.sql
04_tax_profiles.sql
05_vat_rate_history.sql
06_bank_accounts.sql
07_cost_centers.sql
08_capabilities.sql
09_compensation_plans.sql
10_service_fee_templates.sql
11_finance_companies.sql
12_users.sql                  ← ต้องหลัง organizations, roles, teams (circular: ใช้ DEFERRABLE FK)
13_role_capabilities.sql
14_team_managers.sql
15_teams.sql                  ← ต้องหลัง users, compensation_plans
16_payee_profiles.sql
17_cases.sql
18_case_documents.sql
19_case_contacts.sql
20_recycle_requests.sql
21_case_assignments.sql
22_check_ins.sql
23_case_evidences.sql
24_assets.sql
25_handover_lots.sql
26_expenses.sql
27_advances.sql
28_payout_batches.sql
29_payout_batch_items.sql
30_revenues.sql
31_billing_batches.sql
32_adjustments.sql
33_accounting_periods.sql
34_sales_records.sql
35_tax_invoices.sql
36_cash_receipts.sql
37_expense_records.sql
38_wht_certificates.sql
39_wht_filing_summaries.sql
40_exceptions.sql
41_bank_transactions.sql
42_accountant_questions.sql
43_export_records.sql
44_audit_logs.sql
45_jobs.sql
46_files.sql
47_billing_payout_cycles.sql    ← เพิ่ม 04/07/2569 (DEC-006/D1)
48_approval_matrices.sql
49_finance_policy_settings.sql
50_bank_file_formats.sql
51_tax_document_template_settings.sql
52_notifications.sql            ← DEC-006/D3
53_bank_transaction_allocations.sql  ← A2 (มติ PO 2026-08-12)
54_customer_wht_certificates.sql     ← A1 (มติ PO 2026-08-12)
99_seed_data.sql
```

> **หมายเหตุ Circular FK** (users ↔ teams ↔ organizations):
> ใช้ `SET CONSTRAINTS DEFERRED` ใน transaction ที่ seed ข้อมูลเริ่มต้น หรือ
> สร้าง FK บาง column แบบ `DEFERRABLE INITIALLY DEFERRED`

---

## 12. Seed Data

```sql
-- ── 1. Organization (1 record) ──────────────────────────────
INSERT INTO organizations (id, name, tax_id, address, vat_registered, tax_invoice_prefix)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'AssetRecovery Co., Ltd.',
  '0000000000000',  -- กรอก Tax ID จริงก่อน go-live
  '...',
  true,
  'INV'
);

-- ── 2. Roles (15 Seed Roles — ไฟล์ 07 §5) ──────────────────
-- system group
INSERT INTO roles (name, role_group, is_seed, is_editable, organization_id) VALUES
  ('Superadmin',                     'system',          true, false, '...org_id...'),
  ('เจ้าหน้าที่อนุมัติเคส',            'system',          true, false, '...'),
  ('บริหาร',                          'system',          true, false, '...'),
  ('การเงิน',                         'system',          true, false, '...'),
  ('บัญชี',                           'system',          true, false, '...'),
  ('ธุรการ',                          'system',          true, true,  '...'),  -- editable
-- inhouse group
  ('ผู้จัดการทีมติดตามทรัพย์',           'inhouse',         true, false, '...'),
  ('หัวหน้าทีมติดตามทรัพย์',             'inhouse',         true, false, '...'),
  ('พนักงานติดตามทรัพย์',               'inhouse',         true, false, '...'),
-- outsource group
  ('ผู้จัดการทีมติดตามทรัพย์',           'outsource',       true, false, '...'),
  ('หัวหน้าทีมติดตามทรัพย์',             'outsource',       true, false, '...'),
  ('พนักงานติดตามทรัพย์',               'outsource',       true, false, '...'),
-- finance_company group
  ('ผู้จัดการ',                        'finance_company', true, false, '...'),
  ('หัวหน้า',                         'finance_company', true, false, '...'),
  ('แอดมิน',                          'finance_company', true, false, '...');
-- รวม 15 records (system 6 + inhouse 3 + outsource 3 + finance_company 3)

-- ── 3. VAT Rate History (เริ่มต้น 7%) ──────────────────────
INSERT INTO vat_rate_history (rate_pct, effective_from, note, organization_id, created_by)
VALUES (7.00, '2025-10-01', 'อัตรา VAT 7% ต่ออายุ (ระบุวันหมดอายุเมื่อรู้)', '...', '...superadmin_id...');

-- ── 4. Default Tax Profile ──────────────────────────────────
INSERT INTO tax_profiles (name, wht_pct, filing_form, organization_id, created_by)
VALUES
  ('Outsource Standard 3%', 3.00, 'PND3',  '...', '...'),
  ('Juristic Entity 3%',    3.00, 'PND53', '...', '...');

-- ── 4.1 Finance Policy Settings ค่าเริ่มต้น (DEC-006/D1) ────
INSERT INTO finance_policy_settings (organization_id, advance_max_amount_per_request_satang, require_payee_id_document, ar_aging_buckets)
VALUES ('...org_id...', NULL, false, '{30,60,90}');  -- NULL = ไม่จำกัดเพดาน Advance (ปรับได้ที่เมนูตั้งค่า)

-- ── 5. Capabilities (รายการ Action ทั้งหมด) ────────────────
-- ตามไฟล์ 25 (Permission Matrix)
-- approve_claim, reject_claim, approve_advance, approve_expense_manager,
-- approve_expense_finance, create_payout_batch, generate_payment_file,
-- manage_billing, issue_tax_invoice, cancel_tax_invoice,
-- create_adjustment, approve_adjustment_locked, lock_period, unlock_period,
-- export_accounting_pack, manage_exceptions, authorize_exception,
-- import_bank_statement, match_bank_transaction,
-- manage_users, manage_roles, manage_companies, manage_teams,
-- manage_compensation_plans, manage_service_fees, manage_settings,
-- intake_asset, reject_asset_intake, create_handover_lot, confirm_handover_lot,
-- approve_case, reject_case, reject_evidence
-- (เพิ่มเติมตาม business logic จริง)
```

---

## 13. Immutable Rules (ห้ามแก้ไขย้อนหลัง)

| Table | Trigger Condition | Rule |
|---|---|---|
| `case_evidences` | status = 'approved' | ห้าม UPDATE ทุก column |
| `payout_batches` | status = 'completed' | ห้าม UPDATE gross/wht/net |
| `tax_invoices` | status = 'cancelled' | ห้าม DELETE, ห้าม reverse cancel |
| `wht_certificates` | status = 'cancelled' | ห้าม DELETE, ห้าม reverse cancel — ออกใบใหม่อ้าง `replaces_certificate_id` แทน (DEC-006/D4) |
| `export_records` | any | ห้าม DELETE, ต้องสร้าง version ใหม่แทน |
| `bank_transactions` | match_status != 'unmatched' | unmatch ต้องมี reason + audit |
| `handover_lots` | status = 'confirmed' | ห้าม UPDATE, ห้าม DELETE |
| `audit_logs` | any | ห้าม UPDATE/DELETE เด็ดขาด |
| `roles` | is_seed = true | ห้าม DELETE, ห้าม UPDATE name/role_group |
| `accounting_periods` | status = 'locked' | แก้ตรงไม่ได้ — ต้องผ่าน Adjustment + Executive |

---

## 14. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Polymorphic relation → Separate FK columns + CHECK constraint** (DEC-004) — ใช้กับ `adjustments` (revenue/expense/billing_batch/payout_batch) และ `bank_transactions` (matched_billing/matched_payout) แทน discriminator string ทั้งหมด
- **Permission architecture → Backend middleware** (DEC-002) — ทุก table มี `organization_id` สำหรับ filter แต่ enforce จริงที่ API layer ไม่ใช่ RLS
- **Money convention → INTEGER satang เสมอ** — ไม่มีตารางใดใช้ DECIMAL สำหรับเงิน ยกเว้น `rate_pct`/`wht_pct` ที่เป็นอัตราร้อยละใช้ NUMERIC(5,2)
- **Index composite ขึ้นต้นด้วย `organization_id` เสมอ** สำหรับ query pattern หลักของแต่ละ module (multi-tenant filter ก่อนเป็นอันดับแรก)
- **Circular FK (users ↔ teams ↔ organizations) แก้ด้วย `DEFERRABLE INITIALLY DEFERRED`** ไม่ใช่ปรับ schema ให้ตัด FK ทิ้ง (ข้อ 11)
- **Immutable Rules บังคับที่ระดับ table ไม่ใช่แค่ระดับ application** — ระบุไว้ชัดในข้อ 13 เพื่อให้ dev รู้ว่าต้องกัน UPDATE/DELETE ที่ backend layer สำหรับ record ที่ status terminal แล้ว
- **เพิ่ม index ที่ขาดในกลุ่ม Accounting (§9) แล้ว** (v3): `sales_records`, `cash_receipts`, `wht_certificates`, `accountant_questions`, `case_contacts`, `recycle_requests` — ปิด Open Item เดิมเรื่อง index profiling บางส่วน

## 15. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- [ ] **Tax Invoice Numbering format** (INV-XXXX vs INV-2569-XXXX) — 🟡 **มีเมนูตั้งค่ารองรับแล้ว** (`13-accounting-finance-settings.md` §6.12, `settings.html`) Superadmin ตั้งค่าเองได้ ไม่บล็อก build — เหลือแค่รอนักบัญชียืนยันค่าเริ่มต้น (`QUESTIONS-FOR-ACCOUNTANT.md` หมวด C1) ก่อนออก invoice แรก
- [ ] **e-Tax Invoice / e-WHT integration** — เฟส 2 หลังตัดสินใจกับนักบัญชี — จะกระทบ column `delivery_format` ใน `wht_certificates` และอาจเพิ่ม table ใหม่สำหรับ integration status — ยังไม่มีเมนูตั้งค่ารองรับ (ต่างจาก Tax Invoice Numbering)
- [ ] **Bank File encoding** (TIS-620 vs UTF-8) — 🟡 **มีเมนูตั้งค่ารองรับแล้ว** (`13-accounting-finance-settings.md` §6.8) ตั้ง encoding ต่อธนาคารได้ + บังคับ `test_status=passed` ก่อนใช้จริง ไม่บล็อก build — เหลือแค่**ทดสอบจริงกับธนาคาร** (`QUESTIONS-FOR-ACCOUNTANT.md` หมวด F1) — กระทบตอน generate `payment_file_url` ใน `payout_batches`
- [ ] **Index profiling เต็มรูปแบบสำหรับ dashboard query ที่ join หลาย table** (เช่น Gross Profit Report join `revenues` + `expense_records` + `billing_batches`) ยังไม่ได้ทดสอบด้วยข้อมูลจริง — ควร EXPLAIN ANALYZE หลังมี seed data ปริมาณใกล้เคียง production
- [ ] Prisma schema (.prisma) ยังไม่แปลงจาก SQL นี้ — เป็นงานถัดไปหลัง Batch 1 เสร็จ (ตาม Execution Workflow §2 Database First)

---

*เอกสารนี้เป็นไฟล์ที่ 3 ในหมวด Foundation & Platform ต่อจาก `01-architecture.md` และก่อน `03-non-functional-requirements.md`*
