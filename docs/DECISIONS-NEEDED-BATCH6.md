# DECISIONS-NEEDED-BATCH6.md
## Batch 6 — Consistency Sync: รายการที่ต้องให้ Product Owner ตัดสินใจ
> จัดทำ: 04/07/2569
> ที่มา: การตรวจไขว้เอกสารทั้งชุด (audit 04/07/2569) — เฟส 1 (แก้เอกสาร sync ได้เอง) ทำเสร็จแล้ว 18 ไฟล์
> ✅ **สถานะ: ตอบครบทุกข้อแล้ว 04/07/2569** — คำตอบ: **D1=B, D2=A, D3=A, D4=A, D5=A, D6=A, D7=ทั้ง 3 (D7.2 มี UNIQUE อยู่เดิมแล้ว), D8=ยืนยัน 15, D9=ยืนยัน, D10=A/A** — บันทึกเป็น **DEC-006** ใน `94-decision-log.md` และแก้เอกสารทั้งหมดตามแล้ว (ไฟล์นี้เก็บไว้เป็นบันทึกตัวเลือก/เหตุผล)
> วิธีใช้ (เดิม): ตอบเป็นรหัส เช่น "D1=A, D2=A, D3=A, ..." — ข้อไหนยังไม่ตัดสินใจให้ข้ามได้ (ระบุ priority ไว้ให้แล้วว่าข้อไหนบล็อก Phase ไหน)
> กติกา: ทุกข้อที่เลือกแล้ว ผมจะแก้ไฟล์ 02 + ไฟล์ spec ที่เกี่ยวข้อง พร้อม Changelog และ sync กลับ `93-roadmap-open-items.md` / `94-decision-log.md` (ถ้าเข้าข่าย DEC ใหม่)

---

## 🔴 D1 — ตาราง Settings ที่ขาดจาก schema (บล็อก Phase 1.3)

**ปัญหา**: ไฟล์ 13 กำหนด data entity ครบ field แต่ไฟล์ 02 ไม่มี CREATE TABLE รองรับ 5 กลุ่ม: §6.1 Cycles, §6.2 Approval Matrix, §6.8 Bank File Format, §6.12 Numbering, §6.13 Tax Doc Template — และ §6.10 ต้องการ `functional_group` ที่ตาราง `capabilities` ไม่มี

**จุดที่ต้องเลือกจริงมีจุดเดียว**: ไฟล์ 13 §6.2 เอา field ที่เป็น *นโยบายการเงินระดับองค์กร* (`advance_max_amount_per_request`, `require_payee_id_document`, `ar_aging_buckets`) ไปฝังรวมกับ *สายอนุมัติรายเงื่อนไข* (ซึ่งมีได้หลาย record) — ถ้าทำตามเอกสารตรงตัว ค่านโยบายเหล่านี้จะซ้ำกันทุกแถวของ matrix

**Option A — ตามไฟล์ 13 ตรงตัว**: ตาราง `approval_matrices` เดียว มีทุก field ตาม §6.2
- ✅ ไม่ต้องแก้ไฟล์ 13 / ❌ ค่านโยบาย duplicate ต่อแถว, แก้เพดาน Advance ต้องอัปเดตหลาย record

**Option B — แยกนโยบายออกเป็น `finance_policy_settings` (1 record ต่อ organization)** *(แนะนำ)*
- ✅ ค่านโยบายมีที่เดียว ตรง semantic, validation `ADVANCE_EXCEEDS_MAX`/ไฟล์ 18/19 อ้างจุดเดียว / ❌ ต้องแก้ไฟล์ 13 §6.2 (ย้าย 3 field — บันทึก Changelog)

**ร่าง SQL (เขียนตาม Option B — ถ้าเลือก A ผมย้าย 3 column กลับเข้า `approval_matrices`)**:

```sql
-- enums ใหม่ (snake_case ตาม convention)
CREATE TYPE cycle_type          AS ENUM ('AR', 'AP');
CREATE TYPE cutoff_rule_type    AS ENUM ('fixed_dates', 'month_end', 'custom_text');
CREATE TYPE bank_file_type      AS ENUM ('CSV', 'TXT');
CREATE TYPE bank_file_encoding  AS ENUM ('UTF-8', 'TIS-620');
CREATE TYPE bank_file_test_status AS ENUM ('pending', 'passed', 'failed');
CREATE TYPE invoice_numbering_mode AS ENUM ('continuous', 'yearly_reset');
CREATE TYPE tax_document_type   AS ENUM ('tax_invoice', 'wht_certificate');
CREATE TYPE tax_doc_paper_size  AS ENUM ('A4', 'A5');
CREATE TYPE tax_doc_language    AS ENUM ('th', 'th_en_bilingual');
CREATE TYPE functional_group    AS ENUM ('ops', 'finance', 'accounting', 'admin');

-- ── billing_payout_cycles (ไฟล์ 13 §6.1) ──
CREATE TABLE billing_payout_cycles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  name             TEXT NOT NULL,
  type             cycle_type NOT NULL,
  cutoff_rule_type cutoff_rule_type NOT NULL,
  cutoff_dates     INTEGER[],          -- ใช้เมื่อ fixed_dates เช่น {15,30}
  cutoff_text      TEXT,               -- ใช้เมื่อ custom_text
  due_rule         TEXT NOT NULL,      -- เช่น "Net 30 Days"
  scope            TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT cycles_cutoff_shape CHECK (
    (cutoff_rule_type = 'fixed_dates' AND cutoff_dates IS NOT NULL) OR
    (cutoff_rule_type = 'custom_text' AND cutoff_text IS NOT NULL) OR
    (cutoff_rule_type = 'month_end')
  )
);

-- ── approval_matrices (ไฟล์ 13 §6.2 — เฉพาะสายอนุมัติ) ──
CREATE TABLE approval_matrices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  condition           TEXT NOT NULL,
  condition_threshold_satang INTEGER,   -- เงิน = satang เสมอ (ไฟล์ 13 เขียน decimal ตอน implement แปลงตาม convention)
  approval_flow       TEXT[] NOT NULL,  -- ลำดับ role name เช่น {Manager,Finance,Executive}
  enforce_segregation_of_duties BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ
);

-- ── finance_policy_settings (Option B — 1 record/org) ──
CREATE TABLE finance_policy_settings (
  organization_id     UUID PRIMARY KEY REFERENCES organizations(id),
  advance_max_amount_per_request_satang INTEGER,          -- NULL = ไม่จำกัด (ไฟล์ 15)
  require_payee_id_document BOOLEAN NOT NULL DEFAULT false, -- ไฟล์ 18
  ar_aging_buckets    INTEGER[] NOT NULL DEFAULT '{30,60,90}', -- ไฟล์ 19
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by UUID REFERENCES users(id)
);

-- ── bank_file_formats (ไฟล์ 13 §6.8) ──
CREATE TABLE bank_file_formats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  bank_name       TEXT NOT NULL,
  file_type       bank_file_type NOT NULL,
  encoding        bank_file_encoding NOT NULL,
  column_mapping  TEXT NOT NULL,
  test_status     bank_file_test_status NOT NULL DEFAULT 'pending', -- ต้อง passed ก่อนใช้จริง (BANK_FILE_NOT_TESTED)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ
);

-- ── Tax Invoice Numbering (ไฟล์ 13 §6.12) — ขยาย organizations แทนตารางใหม่
-- (เดิมมี tax_invoice_prefix + tax_invoice_seq อยู่แล้ว — เติมให้ครบ mode)
ALTER TABLE organizations
  ADD COLUMN tax_invoice_numbering_mode invoice_numbering_mode NOT NULL DEFAULT 'continuous',
  ADD COLUMN tax_invoice_digit_length   INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN tax_invoice_last_reset_year INTEGER;  -- พ.ศ. — ใช้เฉพาะ yearly_reset

-- ── tax_document_template_settings (ไฟล์ 13 §6.13) ──
CREATE TABLE tax_document_template_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  document_type   tax_document_type NOT NULL,
  logo_url        TEXT,
  footer_note     TEXT,
  signature_image_url TEXT,
  paper_size      tax_doc_paper_size NOT NULL DEFAULT 'A4',
  language        tax_doc_language  NOT NULL DEFAULT 'th',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by UUID REFERENCES users(id),
  UNIQUE(organization_id, document_type)
);

-- ── capabilities: เติม functional_group (ไฟล์ 13 §6.10) ──
ALTER TABLE capabilities ADD COLUMN functional_group functional_group;
-- หมายเหตุ: §6.10 ใช้ capabilities + role_capabilities เดิมเป็นที่เก็บ Functional Permission Matrix
-- (allowed_role_ids = แถวใน role_capabilities) — ไม่สร้างตารางซ้ำ
```

> ถ้าเลือกข้อนี้ (A หรือ B) ผมจะอัปเดต: ไฟล์ 02 (Group B + Migration Order + Changelog v3.5), ไฟล์ 13 (เพิ่มการ mapping "field → ตาราง" + Changelog), และแก้ประเภทเงินใน 13 §6.2 จาก decimal → satang note

---

## 🔴 D2 — `bank_accounts` ไม่ตรงไฟล์ 13 §6.3

**Option A — เติม column ตามไฟล์ 13** *(แนะนำ — precedent เดียวกับ v3.2 ที่เติม payee_type)*:

```sql
CREATE TYPE bank_account_usage AS ENUM ('receive', 'pay', 'both');
ALTER TABLE bank_accounts
  ADD COLUMN usage bank_account_usage NOT NULL DEFAULT 'both',
  ADD COLUMN statement_format    TEXT,  -- FK ไป bank_file_formats ได้ถ้าเลือก D1
  ADD COLUMN payment_file_format TEXT,
  ADD COLUMN auto_match_tolerance_days INTEGER NOT NULL DEFAULT 7;  -- ไฟล์ 35 auto-match
-- แล้ว deprecate `is_payout_account` (ความหมายซ้ำกับ usage) — เก็บไว้ 1 migration แล้วค่อยลบ
```

**Option B — คง schema เดิม แก้ไฟล์ 13 §6.3 ให้ตัด field เหล่านี้ออก**
- ❌ ไม่แนะนำ: `auto_match_tolerance_days` เป็นเงื่อนไขจำเป็นของ auto-match ไฟล์ 35 ถ้าตัดต้องไปนิยามที่อื่นอยู่ดี

---

## 🟡 D3 — ตาราง `notifications` (เฟส 1 ใช้ Push/In-app แต่ไม่มีที่เก็บ)

**Option A — ตารางเดี่ยว minimal** *(แนะนำ — พอสำหรับ In-app เฟส 1)*:

```sql
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),     -- ผู้รับ
  event_code      TEXT NOT NULL,                          -- ตามรายการไฟล์ 90 §6.3
  title           TEXT NOT NULL,
  body            TEXT,
  link_path       TEXT,                                   -- deep link ในแอป
  read_at         TIMESTAMPTZ,                            -- NULL = ยังไม่อ่าน
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at DESC);
```
Endpoints (จะเพิ่มเข้าไฟล์ 90 §14 + 27): `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`

**Option B — A + ตาราง `notification_preferences`** (user ปิด/เปิดรายประเภทได้)
- ✅ ยืดหยุ่น / ❌ เกิน scope เฟส 1 ที่ตัดสินใจไว้ (ทุก event สำคัญแจ้งหมด) — ทำเฟส 2 ได้

---

## 🟡 D4 — WHT Certificate: กลไกยกเลิก/ออกใหม่ (ไฟล์ 33 §10)

**Option A — เพิ่ม status + อ้างอิงฉบับเดิม** *(แนะนำ — หลักการเดียวกับ tax_invoices)*:

```sql
CREATE TYPE wht_certificate_status AS ENUM ('active', 'cancelled');
CREATE TYPE wht_delivery_format    AS ENUM ('paper', 'e_withholding');  -- แก้ TEXT → enum ตาม convention
ALTER TABLE wht_certificates
  ADD COLUMN status wht_certificate_status NOT NULL DEFAULT 'active',
  ADD COLUMN cancel_reason TEXT,
  ADD COLUMN cancelled_by UUID REFERENCES users(id),
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN replaces_certificate_id UUID REFERENCES wht_certificates(id),
  ALTER COLUMN delivery_format TYPE wht_delivery_format USING delivery_format::wht_delivery_format;
-- + Immutable Rule (ไฟล์ 02 §13): status='cancelled' → ห้าม DELETE/reverse (เหมือน tax_invoices)
-- + endpoint ใหม่: PATCH /api/accounting/wht-certificates/:id/cancel (ต้องมี reason)
-- + error code: WHT_CANCEL_REQUIRES_REASON (ไฟล์ 24/33)
```

**Option B — ไม่มี status ในระบบ** (ผิดพลาด = ออกใบใหม่ + บันทึกใน audit log อย่างเดียว)
- ❌ ตรวจย้อนไม่ได้ว่าใบไหนถูกยกเลิก, ยอดสรุป ภ.ง.ด. เสี่ยงนับซ้ำ

---

## 🟡 D5 — `expenses`: เก็บ approval หลายขั้นตาม Approval Matrix

**Option A — เติม column ขั้น Executive + step pointer** *(แนะนำ — ไฟล์ 16 นิยาม flow ไว้แค่ 2-3 ขั้นตายตัว)*:

```sql
ALTER TABLE expenses
  ADD COLUMN executive_approved_by UUID REFERENCES users(id),
  ADD COLUMN executive_approved_at TIMESTAMPTZ,
  ADD COLUMN current_approval_step INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN approval_matrix_id UUID;  -- snapshot ว่ารายการนี้ใช้ matrix แถวไหน (FK เมื่อ D1 ปิด)
```

**Option B — ตาราง `expense_approvals` แยก (N ขั้นทั่วไป)**
- ✅ รองรับ flow ยาวไม่จำกัด / ❌ ซับซ้อนเกินสเปกปัจจุบัน (ไฟล์ 16 §6.1 มีแค่ Manager→Finance(→Executive)) — เก็บไว้เฟส 2 ถ้า matrix ซับซ้อนขึ้นจริง

---

## 🟡 D6 — Revenue edge case: เคส `closed_success` ที่ไม่มี expense เลย

หมายเหตุท้าย 19 §6.1 เดิมให้สร้าง Revenue ทันทีที่เคส terminal → **ข้าม Warehouse gate**

**Option A — ยังต้องรอ `HandoverLot.confirmed` เสมอ** *(แนะนำ)*: กรณีไม่มี expense เงื่อนไขเหลือ 2 ข้อ (`closed_success` + `Lot confirmed`) — เหตุผลของ gate (กันวางบิลก่อนส่งมอบเครื่องจริง) ไม่ได้หายไปเพราะไม่มีค่าใช้จ่าย
**Option B — คงหมายเหตุเดิม** (terminal = สร้างทันที): เร็วกว่า แต่เปิดช่องวางบิลทั้งที่เครื่องยังไม่ถึงมือไฟแนนซ์
> `closed_fail` ไม่กระทบ — ไม่มี gate อยู่แล้ว

---

## 🟡 D7 — DB constraints เสริมกฎเงิน (เลือกได้เป็นรายข้อ)

```sql
-- 7.1 ห้ามเบิก Advance ซ้อน (บังคับ ADVANCE_PENDING_SETTLEMENT ที่ระดับ DB)
CREATE UNIQUE INDEX uniq_active_advance_per_requester
  ON advances(requester_id) WHERE status IN ('approved','overdue') AND deleted_at IS NULL;

-- 7.2 กันโอนซ้ำระดับ DB
ALTER TABLE payout_batches ADD CONSTRAINT uniq_payout_idempotency UNIQUE (idempotency_key);

-- 7.3 ผูก match_status กับการมี FK (กัน state เพี้ยน)
ALTER TABLE bank_transactions ADD CONSTRAINT bank_tx_status_fk_shape CHECK (
  (match_status IN ('auto_matched','manual_matched')
     AND (matched_billing_id IS NOT NULL OR matched_payout_id IS NOT NULL))
  OR (match_status IN ('unmatched','unmatched_resolved')
     AND matched_billing_id IS NULL AND matched_payout_id IS NULL)
);
```
**ตอบ**: ✅ ทั้ง 3 / เลือกบางข้อ / ❌ ไม่เอา (พึ่ง application อย่างเดียว)

---

## 🔵 D8 — ยืนยันจำนวน Seed Role = **15** (แก้เอกสารแล้ว)

นับจาก seed data จริง: system 6 + inhouse 3 + outsource 3 + finance_company 3 = **15** (เลข "14" เดิมนับผิด — ไม่มีวิธีนับใดได้ 14) — เอกสารแก้เป็น 15 ครบ 6 ไฟล์แล้ว **ตอบ**: ✅ ยืนยัน 15 / ❌ ตัวเลขจริงคือ __ (ระบุ role ที่ต้องตัด/รวม แล้วผมแก้กลับ)

## 🔵 D9 — ยืนยันชื่อ endpoint ใหม่ 2 ตัว (เติมแล้วใน 41/45)

`POST /api/field/cases/:id/resubmit-close` และ `POST /api/field/expenses/:id/resubmit` — ปิดช่องว่าง action `resubmit_close_case`/`resubmit_expense` ที่นิยามใน 41 §8 แต่ไม่มี endpoint **ตอบ**: ✅ ใช้ชื่อนี้ / เสนอชื่ออื่น

## 🟢 D10 — รูปแบบข้อมูลใน Export Pack template (ไม่บล็อก build)

- `06_Bank_Reconciliation.csv` — status: **A)** export ค่า enum เต็ม (`auto_matched`/`manual_matched`/`unmatched_resolved`) *(แนะนำ — สำนักงานบัญชีเห็นที่มาการจับคู่)* / **B)** simplify เป็น `matched`/`unmatched` + บันทึก mapping ไว้ในไฟล์ 28/37
- `05_WHT_Data.csv` — tax_id: **A)** ตัวเลข 13 หลักล้วน (ตรง validation) *(แนะนำ)* / **B)** มีขีดคั่นเพื่ออ่านง่าย (ระบุใน 28 ว่าเป็น display format)

---

## สรุปตัวเลือกที่แนะนำ (ถ้าต้องการตอบสั้น)

`D1=B, D2=A, D3=A, D4=A, D5=A, D6=A, D7=ทั้ง 3, D8=ยืนยัน 15, D9=ยืนยัน, D10=A/A`

หลังได้คำตอบ ผมจะ: (1) แก้ไฟล์ 02 เป็น v3.5 (DDL + Migration Order + Immutable Rules + Seed) (2) อัปเดตไฟล์ 13/16/18/19/24/27/33/35/90 ที่เกี่ยวข้องพร้อม Changelog (3) บันทึก DEC ใหม่เข้า `94-decision-log.md` (4) ปิดรายการใน `93` §7.1
