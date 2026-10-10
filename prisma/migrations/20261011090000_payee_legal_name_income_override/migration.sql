-- staging E-002/E-010 (มติ PO 10/10/2569) — ชื่อนิติบุคคลตามหนังสือรับรอง ใช้บน 50 ทวิ · ภ.ง.ด.53 · ไฟล์โอน · เช็คชื่อบัญชี
-- staging E-021 (มติ PO 10/10/2569) — ประเภทเงินได้รายคน (NULL = ตามค่าตั้งองค์กร) · ชนะค่าองค์กร · นิติบุคคลใช้ไม่ได้

ALTER TABLE payee_profiles
  ADD COLUMN legal_name VARCHAR(255),
  ADD COLUMN income_category_override wht_income_category;

-- ผู้รับนิติบุคคลเดิม: ใช้ชื่อผู้ใช้เดิมเป็นค่าตั้งต้น (เดิมระบบพิมพ์ชื่อนี้บนเอกสารอยู่แล้ว — ไม่เปลี่ยนผลเอกสาร)
UPDATE payee_profiles p
   SET legal_name = u.full_name
  FROM users u
 WHERE u.id = p.user_id
   AND p.payee_type = 'corporate'
   AND p.legal_name IS NULL;

ALTER TABLE payee_profiles
  ADD CONSTRAINT chk_payee_profiles_legal_name
    CHECK (payee_type <> 'corporate' OR (legal_name IS NOT NULL AND btrim(legal_name) <> '')),
  ADD CONSTRAINT chk_payee_profiles_income_override
    CHECK (
      income_category_override IS NULL
      OR (payee_type = 'individual' AND income_category_override IN ('sec_40_2', 'sec_40_8'))
    );
