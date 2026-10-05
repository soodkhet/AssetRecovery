-- มติ PO 06/10/2569 (UAT U86 · BUG-155) — หลายรอบวางบิลต่อบริษัทต่อเดือนได้
--
-- เดิม UNIQUE(organization_id, company_id, period) บังคับ "1 บริษัท 1 รอบเดือน = 1 รอบวางบิล"
--   ⇒ รายได้ที่เกิดหลังสร้างรอบของเดือนนั้นแล้ววางบิลไม่ได้เลย (รายได้ค้างถาวร · ปิดงวดไม่ผ่าน)
-- ใหม่: ถอด unique ออก เหลือ index ธรรมดาสำหรับค้นตามงวด
--   ตัวกันวางบิลซ้ำยังเป็น 1:1 `revenues.billing_batch_id` (รอบใหม่ยึดเฉพาะรายได้ที่ยังไม่ผูกรอบใด)
--   เลขรอบ `BL-<พ.ศ.>-NNN` (U76) ไม่ซ้ำอยู่แล้วด้วย `uniq_billing_batch_number`
--   กติกา "ห้ามมีรอบร่างซ้อนของบริษัทเดียวกัน" บังคับที่ชั้น service (ล็อกแถวบริษัท FOR UPDATE)
--   ไม่ทำเป็น partial unique เพราะข้อมูลเดิมอาจมีรอบร่างของต่างเดือนค้างพร้อมกันอยู่แล้ว

ALTER TABLE billing_batches DROP CONSTRAINT IF EXISTS billing_batches_organization_id_company_id_period_key;
DROP INDEX IF EXISTS billing_batches_organization_id_company_id_period_key;

CREATE INDEX idx_billing_org_company_period ON billing_batches(organization_id, company_id, period);
