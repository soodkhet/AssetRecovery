-- มติ PO U148 (Final Test ด่าน 5 ND-6): ประเภทเงินได้ใน Tax Profile เลือกจากรายการมาตรฐานตามแบบ 50 ทวิ + "อื่น ๆ (ระบุ)"
-- ค่าเดิมที่ตรงป้ายรายการ (ตัดช่องว่างหัวท้าย/ช่องว่างซ้อน) → รหัสนั้น + เขียนป้ายมาตรฐานทับ · ที่เหลือ = other + ข้อความเดิม

CREATE TYPE tax_profile_income_type AS ENUM (
  'hire_of_work_40_8',
  'service_or_hire_of_work',
  'service',
  'advertising',
  'rent',
  'transport',
  'other'
);

ALTER TABLE tax_profiles
  ADD COLUMN income_type_code tax_profile_income_type NOT NULL DEFAULT 'hire_of_work_40_8';

WITH labels(code, label) AS (
  VALUES
    ('hire_of_work_40_8'::tax_profile_income_type, 'ค่าจ้างทำของ มาตรา 40(8)'),
    ('service_or_hire_of_work'::tax_profile_income_type, 'ค่าบริการ / ค่าจ้างทำของ (หัก ณ ที่จ่ายตามมาตรา 3 เตรส)'),
    ('service'::tax_profile_income_type, 'ค่าบริการ'),
    ('advertising'::tax_profile_income_type, 'ค่าโฆษณา'),
    ('rent'::tax_profile_income_type, 'ค่าเช่า'),
    ('transport'::tax_profile_income_type, 'ค่าขนส่ง')
)
UPDATE tax_profiles t
SET income_type_code = COALESCE(
      (SELECT l.code FROM labels l
       WHERE l.label = regexp_replace(btrim(t.income_type), '\s+', ' ', 'g')),
      'other'
    ),
    income_type = COALESCE(
      (SELECT l.label FROM labels l
       WHERE l.label = regexp_replace(btrim(t.income_type), '\s+', ' ', 'g')),
      t.income_type
    );
