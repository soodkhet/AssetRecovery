-- มติ PO 07/10/2569 U146 (Final ด่าน 5 ND-3) — รวมแหล่งกติกาตัดรอบเป็นที่เดียว
-- รอบบิล (billing_payout_cycles ชนิด AR) เป็นที่เดียวที่กำหนดวันตัดรอบ + เครดิตเทอม · บริษัทเลือก "รอบบิลที่ใช้"
-- (ต่อยอด junction billing_cycle_companies ของ U133) ⇒ ตัด finance_companies.billing_day / payment_due_days
-- + ตัดชนิดกติกาตัดรอบ custom_text (ข้อความอิสระคำนวณวันตัดรอบไม่ได้)
--
-- แปลงข้อมูลเดิมให้วันครบกำหนดของรอบวางบิลได้ผลเดิม:
--   · บริษัทที่ยังไม่มีรอบบิลครอบ (ไม่มีรอบ "ทุกบริษัท" ที่ใช้งาน และไม่อยู่ในรายชื่อของรอบใด) — เดิมสร้างรอบวางบิลโดย
--     ไม่เลือกรอบ ⇒ ใช้ Net payment_due_days วัน · ตอนนี้สร้างรอบบิลใหม่ต่อกลุ่ม (billing_day, payment_due_days)
--     กติกา "ตัดทุกวันที่ billing_day" + "Net payment_due_days วัน" แล้วผูกบริษัทกลุ่มนั้นเข้ารอบ ⇒ วันครบกำหนดเท่าเดิม
--   · บริษัทที่มีรอบครอบอยู่แล้ว — เดิมระบบเลือกรอบนั้นให้อัตโนมัติ (รอบชนะ) ⇒ ไม่เปลี่ยน · ค่าเดิมของบริษัทเลิกใช้
--   · กติกาตัดรอบ custom_text → มีเลขวันที่ในข้อความ (+ "สิ้นเดือน" = 31) ⇒ fixed_dates · ไม่มี ⇒ month_end
--     ข้อความเดิมเก็บที่ legacy_cutoff_text (อ้างอิงเท่านั้น)

-- ── 0) net_days รับ 0 ได้ (เครดิตเทอม 0 วันของบริษัทเดิม = ครบกำหนดวันตัดรอบ) ────────
ALTER TABLE "billing_payout_cycles" DROP CONSTRAINT "cycles_due_rule_shape";
ALTER TABLE "billing_payout_cycles"
  ADD CONSTRAINT "cycles_due_rule_shape" CHECK (
    ("due_rule_type" = 'net_days' AND "due_rule_value" IS NOT NULL AND "due_rule_value" >= 0) OR
    ("due_rule_type" = 'day_of_next_month' AND "due_rule_value" IS NOT NULL AND "due_rule_value" > 0) OR
    ("due_rule_type" = 'month_end')
  );

-- ── 1) รอบบิลใหม่ของบริษัทที่ยังไม่มีรอบครอบ ─────────────────────────────────
DO $$
DECLARE
  grp RECORD;
  new_id UUID;
  base_name TEXT;
  final_name TEXT;
  suffix INTEGER;
BEGIN
  FOR grp IN
    SELECT fc.organization_id,
           fc.billing_day,
           fc.payment_due_days,
           array_agg(fc.id ORDER BY fc.name) AS company_ids,
           (array_agg(fc.created_by ORDER BY fc.created_at))[1] AS creator
    FROM finance_companies fc
    WHERE fc.deleted_at IS NULL
      AND NOT EXISTS (
            SELECT 1 FROM billing_payout_cycles c
            WHERE c.organization_id = fc.organization_id AND c.type = 'AR' AND c.deleted_at IS NULL
              AND c.scope_kind = 'all_companies'
          )
      AND NOT EXISTS (
            SELECT 1 FROM billing_cycle_companies bcc
            JOIN billing_payout_cycles c ON c.id = bcc.cycle_id
            WHERE bcc.company_id = fc.id AND c.type = 'AR' AND c.deleted_at IS NULL
          )
    GROUP BY fc.organization_id, fc.billing_day, fc.payment_due_days
  LOOP
    base_name := format('รอบบิล ตัดวันที่ %s · Net %s วัน', grp.billing_day, grp.payment_due_days);
    final_name := base_name;
    suffix := 1;
    WHILE EXISTS (
      SELECT 1 FROM billing_payout_cycles
      WHERE organization_id = grp.organization_id AND name = final_name AND deleted_at IS NULL
    ) LOOP
      suffix := suffix + 1;
      final_name := format('%s (%s)', base_name, suffix);
    END LOOP;

    INSERT INTO billing_payout_cycles (
      organization_id, name, type, cutoff_rule_type, cutoff_dates, cutoff_text,
      due_rule_type, due_rule_value, due_rule, scope_kind, created_by, updated_at
    ) VALUES (
      grp.organization_id, final_name, 'AR', 'fixed_dates', ARRAY[grp.billing_day], NULL,
      'net_days', grp.payment_due_days, format('Net %s วัน', grp.payment_due_days), 'selected_companies',
      grp.creator, NOW()
    )
    RETURNING id INTO new_id;

    INSERT INTO billing_cycle_companies (organization_id, cycle_id, company_id)
    SELECT grp.organization_id, new_id, unnest(grp.company_ids);
  END LOOP;
END $$;

-- ── 2) ตัดชนิด custom_text ─────────────────────────────────────────────────
ALTER TABLE "billing_payout_cycles" DROP CONSTRAINT "cycles_cutoff_shape";
ALTER TABLE "billing_payout_cycles" RENAME COLUMN "cutoff_text" TO "legacy_cutoff_text";

-- แปลงค่าเดิม (ข้อความยังอยู่ที่ legacy_cutoff_text)
WITH parsed AS (
  SELECT c.id,
         ARRAY(
           SELECT DISTINCT d FROM (
             SELECT m[1]::INTEGER AS d
             FROM regexp_matches(coalesce(c.legacy_cutoff_text, ''), '([0-9]{1,2})', 'g') AS m
             UNION
             SELECT 31 WHERE coalesce(c.legacy_cutoff_text, '') ~ 'สิ้นเดือน'
           ) days
           WHERE d BETWEEN 1 AND 31
           ORDER BY d
         ) AS days
  FROM billing_payout_cycles c
  WHERE c.cutoff_rule_type = 'custom_text'
)
UPDATE billing_payout_cycles c
SET cutoff_rule_type = CASE WHEN cardinality(p.days) > 0 THEN 'fixed_dates'::cutoff_rule_type ELSE 'month_end'::cutoff_rule_type END,
    cutoff_dates = CASE WHEN cardinality(p.days) > 0 THEN p.days ELSE '{}'::INTEGER[] END
FROM parsed p
WHERE c.id = p.id;

-- รอบที่ไม่ใช่ custom_text ไม่มีข้อความเดิมให้อ้าง
UPDATE billing_payout_cycles SET legacy_cutoff_text = NULL
WHERE legacy_cutoff_text IS NOT NULL AND btrim(legacy_cutoff_text) = '';

ALTER TYPE "cutoff_rule_type" RENAME TO "cutoff_rule_type_old";
CREATE TYPE "cutoff_rule_type" AS ENUM ('fixed_dates', 'month_end');
ALTER TABLE "billing_payout_cycles"
  ALTER COLUMN "cutoff_rule_type" TYPE "cutoff_rule_type" USING ("cutoff_rule_type"::TEXT::"cutoff_rule_type");
DROP TYPE "cutoff_rule_type_old";

ALTER TABLE "billing_payout_cycles"
  ADD CONSTRAINT "cycles_cutoff_shape" CHECK (
    ("cutoff_rule_type" = 'fixed_dates' AND "cutoff_dates" IS NOT NULL AND array_length("cutoff_dates", 1) > 0) OR
    ("cutoff_rule_type" = 'month_end')
  );

-- ── 3) ตัดช่องซ้ำของบริษัท ─────────────────────────────────────────────────
ALTER TABLE "finance_companies" DROP COLUMN "billing_day";
ALTER TABLE "finance_companies" DROP COLUMN "payment_due_days";
