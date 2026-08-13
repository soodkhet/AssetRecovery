# Rule 02 — Database Conventions (`02` §2 — SSOT ของ schema คือไฟล์ 02 เท่านั้น)

- Naming: table = snake_case พหูพจน์ · column = snake_case · PK = `id UUID DEFAULT gen_random_uuid()` · FK = `<entity>_id` · enum = `<domain>_<name>` · index = `idx_<table>_<cols>`
- Common columns ทุกตาราง: `id, organization_id, created_at, created_by, updated_at, updated_by, deleted_at` — ยกเว้นรายการที่ `02` ระบุว่าไม่ครบ (capabilities, junction, insert-only tables — ดู digest ใน 00_MAP/02 §2.4)
- Soft delete = `deleted_at TIMESTAMPTZ` (NULL = active) — `organizations`/`audit_logs`/junction ไม่มี
- **Polymorphic (DEC-004)**: separate nullable FK columns + CHECK exactly-one non-null — ห้าม discriminator string (`adjustments` 4 FK, `bank_transactions` 2 FK)
- Composite index ขึ้นต้น `organization_id` เสมอ · ทุกตารางต้องมี `organization_id` (multi-tenant filter — ไม่ใช่ security boundary, security อยู่ middleware)
- Constraint สำคัญห้ามลืมตอนแก้ schema: `uniq_active_advance_per_payee` (partial), `payout_batches.idempotency_key` UNIQUE, `cases(org, company, case_ref, tracking_round)` UNIQUE, `assets(org, imei_contract)` UNIQUE, `sales_records.billing_batch_id` 1:1, `expense_records.payout_batch_item_id` 1:1
- CHECK constraints / partial index / generated column / DB trigger ที่ Prisma ไม่รองรับ → ใส่ผ่าน **raw SQL migration** เสมอ (ห้ามข้าม)
- **Immutable Rules (`02` §13)** บังคับระดับ DB + service: `audit_logs` ห้าม UPDATE/DELETE · `handover_lots` confirmed ห้ามแก้ · `tax_invoices`/`wht_certificates` cancelled ห้ามลบ/reverse · `export_records` ห้ามลบ ต้องขึ้น version · seed `roles` ห้ามลบ/เปลี่ยนชื่อ · `case_evidences` approved ห้ามแก้
- **Snapshot pattern (`92` §7.1)**: `expenses`(comp_plan_id+version) · `revenues`(fee_model, vat_rate_used) · `payout_batch_items`(tax_profile, wht_pct) · `cases`(service fee ตอน **approved**) — ห้ามคำนวณย้อนหลังจาก live template
- แก้ schema = แก้ `prisma/schema.prisma` + migration + ตรวจเทียบ `02` — ถ้า `02` ไม่ตรงกับความจำเป็นจริง ให้ `[[NEEDS_DECISION]]` ห้ามแก้ spec เงียบๆ
