-- 02 v4.65 — ดัชนีคอลัมน์ FK ที่อ้าง device_models (ON DELETE SET NULL)
-- ลบรุ่นในแคตตาล็อก → Postgres ต้องหาแถวลูกด้วย WHERE device_model_id = $1 ต่อทุกแถวที่ลบ
-- idx_device_tacs_org_model ขึ้นต้น organization_id จึงใช้ค้นแบบนี้ไม่ได้ → seq scan device_tacs (~255k แถวบน staging) ต่อรุ่น
CREATE INDEX "idx_device_tacs_model" ON "device_tacs"("device_model_id");
CREATE INDEX "idx_cases_device_model" ON "cases"("device_model_id");
