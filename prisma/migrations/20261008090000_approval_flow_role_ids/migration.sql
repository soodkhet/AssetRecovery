-- มติ PO U149 (Final Test ด่าน 5 ND-7): สายอนุมัติเก็บ role id แทนชื่อ role
-- เดิม `approval_flow TEXT[]` เก็บชื่อ — role ชื่อซ้ำข้ามกลุ่มได้ และเปลี่ยนชื่อ/ลบ role แล้วสายพังเงียบ
-- แปลงข้อมูลเดิม: ชื่อ (รวมชื่ออังกฤษตัวอย่างใน 13 §6.2) → role seed ของผู้อนุมัติ 3 ตัว
-- เลือก record ตามลำดับกลุ่ม system → inhouse → outsource (ผู้จัดการทีมมี 2 record ที่ถือสิทธิ์อนุมัติเดียวกัน)
-- ชื่อที่แปลงไม่ได้ = ข้อมูลตั้งค่าผิดอยู่แล้ว (อนุมัติไม่ได้ตั้งแต่ก่อน migrate) ⇒ ไม่ตัดขั้นทิ้งเงียบ ๆ:
--   สายนั้นถูกปิดใช้งาน (deleted_at) + RAISE NOTICE รายชื่อ ให้ผู้ดูแลตั้งสายใหม่จากหน้าจอ

ALTER TABLE approval_matrices ADD COLUMN approval_flow_role_ids UUID[];

UPDATE approval_matrices m
SET approval_flow_role_ids = COALESCE((
  SELECT array_agg(x.role_id ORDER BY x.ord) FILTER (WHERE x.role_id IS NOT NULL)
  FROM (
    SELECT s.ord,
      (
        SELECT r.id
        FROM roles r
        WHERE r.organization_id = m.organization_id
          AND r.deleted_at IS NULL
          AND r.name = CASE lower(regexp_replace(btrim(s.step_name), '\s+', '', 'g'))
            WHEN 'manager' THEN 'ผู้จัดการทีมติดตามทรัพย์'
            WHEN 'finance' THEN 'การเงิน'
            WHEN 'financeadmin' THEN 'การเงิน'
            WHEN 'executive' THEN 'บริหาร'
            ELSE btrim(s.step_name)
          END
          AND r.name IN ('ผู้จัดการทีมติดตามทรัพย์', 'การเงิน', 'บริหาร')
        ORDER BY r.is_seed DESC, CASE r.role_group WHEN 'system' THEN 0 WHEN 'inhouse' THEN 1 WHEN 'outsource' THEN 2 ELSE 3 END, r.created_at
        LIMIT 1
      ) AS role_id
    FROM unnest(m.approval_flow) WITH ORDINALITY AS s(step_name, ord)
  ) x
), '{}');

DO $$
DECLARE
  broken TEXT;
BEGIN
  SELECT string_agg(id::text || ' ' || approval_flow::text, '; ')
  INTO broken
  FROM approval_matrices
  WHERE cardinality(approval_flow_role_ids) <> cardinality(approval_flow);
  IF broken IS NOT NULL THEN
    RAISE NOTICE 'U149: ปิดใช้งานสายอนุมัติที่อ้างบทบาทซึ่งแปลงเป็น role id ไม่ได้ — ตั้งสายใหม่จากหน้าจอ: %', broken;
    UPDATE approval_matrices
    SET deleted_at = COALESCE(deleted_at, NOW()), updated_at = NOW()
    WHERE cardinality(approval_flow_role_ids) <> cardinality(approval_flow);
  END IF;
END $$;

ALTER TABLE approval_matrices ALTER COLUMN approval_flow_role_ids SET NOT NULL;
ALTER TABLE approval_matrices DROP COLUMN approval_flow;

-- ค้นสายที่อ้าง role หนึ่ง ๆ (บล็อกลบ role — ROLE_IN_USE)
CREATE INDEX idx_approval_matrices_flow_roles ON approval_matrices USING GIN (approval_flow_role_ids);
