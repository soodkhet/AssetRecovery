-- มติ 16/10/2569 Q8 (mytester M1/B-03) — เตือน IMEI ซ้ำกับเคสที่ยังดำเนินการอยู่
-- ค้น `cases` ด้วย (organization_id, imei) ทุกครั้งที่เปิดเคส/นำเข้าไฟล์ ⇒ เพิ่ม index กัน seq scan เมื่อเคสเยอะ
CREATE INDEX IF NOT EXISTS "idx_cases_org_imei" ON "cases"("organization_id", "imei");
