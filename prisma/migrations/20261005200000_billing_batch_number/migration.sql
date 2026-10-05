-- มติ PO 05/10/2569 (UAT U76) — เลขรอบวางบิลจริง `BL-<พ.ศ.>-<ลำดับ 3 หลัก>` ต่อองค์กร รีเซ็ตทุกปี พ.ศ.
--
-- ก่อนหน้านี้รอบวางบิลไม่มีเลขเอกสาร (portal สร้าง `BB-<พ.ศ.>-<MM>` จาก `period` แทน — มติ U62)
-- ⇒ เพิ่ม `billing_batches.batch_number` + ตัวนับต่อองค์กรใน `organizations` (แนวเดียวกับ `tax_invoice_seq`)
--
-- ตัวเดินเลข = trigger BEFORE INSERT ที่ล็อกแถว `organizations` (`FOR UPDATE`) ก่อนอ่าน/เพิ่มตัวนับ
--   ⇒ รอบที่สร้างพร้อมกันในองค์กรเดียวกันต่อคิวกันเอง เลขไม่ซ้ำ · ทรานแซกชันล้ม = ตัวนับ rollback ด้วย (ไม่มีช่องว่าง)
--   ⇒ ทุกทางที่ INSERT (API/seed/สคริปต์/เทสต์) ได้เลขเสมอโดยไม่ต้องส่งค่าเอง
-- ปีของเลข = ปี พ.ศ. ของ `created_at` ตามเวลาไทย (Asia/Bangkok) · เลขของรอบห้ามเปลี่ยนหลังออกแล้ว

-- 1) ตัวนับต่อองค์กร
ALTER TABLE organizations
  ADD COLUMN billing_batch_seq      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN billing_batch_seq_year INTEGER;  -- ปี พ.ศ. ของ billing_batch_seq ปัจจุบัน

-- 2) คอลัมน์เลขรอบ + เติมเลขรอบเก่าตามลำดับ created_at (ปีตาม created_at เวลาไทย) — รวมแถวที่ soft delete แล้ว
ALTER TABLE billing_batches ADD COLUMN batch_number TEXT;

WITH numbered AS (
  SELECT id,
         (EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Bangkok'))::int + 543 AS be_year,
         ROW_NUMBER() OVER (
           PARTITION BY organization_id, (EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Bangkok'))::int
           ORDER BY created_at, id
         ) AS seq
    FROM billing_batches
)
UPDATE billing_batches b
   SET batch_number = format('BL-%s-%s', n.be_year,
                             CASE WHEN n.seq < 1000 THEN lpad(n.seq::text, 3, '0') ELSE n.seq::text END)
  FROM numbered n
 WHERE n.id = b.id;

-- ตัวนับขององค์กร = ปีล่าสุดที่มีรอบ + จำนวนรอบของปีนั้น
WITH per_year AS (
  SELECT organization_id,
         (EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Bangkok'))::int + 543 AS be_year,
         COUNT(*)::int AS cnt
    FROM billing_batches
   GROUP BY 1, 2
), latest AS (
  SELECT DISTINCT ON (organization_id) organization_id, be_year, cnt
    FROM per_year
   ORDER BY organization_id, be_year DESC
)
UPDATE organizations o
   SET billing_batch_seq = l.cnt,
       billing_batch_seq_year = l.be_year
  FROM latest l
 WHERE l.organization_id = o.id;

ALTER TABLE billing_batches ALTER COLUMN batch_number SET NOT NULL;
ALTER TABLE billing_batches
  ADD CONSTRAINT billing_batch_number_format CHECK (batch_number ~ '^BL-2[5-9][0-9]{2}-[0-9]{3,}$');
CREATE UNIQUE INDEX uniq_billing_batch_number ON billing_batches(organization_id, batch_number);

-- 3) ตัวเดินเลข
CREATE OR REPLACE FUNCTION next_billing_batch_number(p_organization_id uuid, p_at timestamptz)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_year     int := (EXTRACT(YEAR FROM p_at AT TIME ZONE 'Asia/Bangkok'))::int + 543;
  v_seq      int;
  v_seq_year int;
  v_next     int;
BEGIN
  IF v_year < 2500 OR v_year > 2999 THEN
    RAISE EXCEPTION 'ปีของเลขรอบวางบิลต้องเป็น พ.ศ. (2500–2999) — ได้รับ %', v_year
      USING ERRCODE = '22023';
  END IF;

  -- ล็อกแถวองค์กรก่อน ⇒ คำสั่งถัดไปเห็นรอบที่คนก่อนหน้า commit แล้วเสมอ (READ COMMITTED = snapshot ใหม่ต่อคำสั่ง)
  SELECT billing_batch_seq, billing_batch_seq_year
    INTO v_seq, v_seq_year
    FROM organizations
   WHERE id = p_organization_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบองค์กร % ของรอบวางบิล', p_organization_id USING ERRCODE = '23503';
  END IF;

  IF v_seq_year IS NOT DISTINCT FROM v_year THEN
    v_next := v_seq + 1;
  ELSE
    -- ขึ้นปีใหม่ (รีเซ็ต) หรือรอบที่ลงวันที่ย้อนปี — ต่อจากเลขสูงสุดที่มีอยู่จริงของปีนั้น (ไม่มี = 1)
    SELECT COALESCE(MAX((substring(batch_number FROM '^BL-[0-9]{4}-([0-9]+)$'))::int), 0) + 1
      INTO v_next
      FROM billing_batches
     WHERE organization_id = p_organization_id
       AND batch_number LIKE format('BL-%s-%%', v_year);
  END IF;

  -- ตัวนับเดินตามปีที่ใหม่ที่สุดเท่านั้น (รอบย้อนปีไม่ดึงตัวนับถอยหลัง)
  IF v_seq_year IS NULL OR v_year >= v_seq_year THEN
    UPDATE organizations
       SET billing_batch_seq = v_next,
           billing_batch_seq_year = v_year
     WHERE id = p_organization_id;
  END IF;

  RETURN format('BL-%s-%s', v_year,
                CASE WHEN v_next < 1000 THEN lpad(v_next::text, 3, '0') ELSE v_next::text END);
END;
$$;

CREATE OR REPLACE FUNCTION billing_batches_assign_number()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.batch_number IS NULL THEN
      NEW.batch_number := next_billing_batch_number(NEW.organization_id, COALESCE(NEW.created_at, NOW()));
    END IF;
  ELSIF NEW.batch_number IS DISTINCT FROM OLD.batch_number THEN
    RAISE EXCEPTION 'เลขรอบวางบิล % แก้ไขไม่ได้', OLD.batch_number USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_billing_batches_number
  BEFORE INSERT OR UPDATE OF batch_number ON billing_batches
  FOR EACH ROW EXECUTE FUNCTION billing_batches_assign_number();
