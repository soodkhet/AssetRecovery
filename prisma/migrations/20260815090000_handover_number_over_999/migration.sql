-- Fix (พบระหว่าง Phase 3.5) — เลขล็อต/ใบส่งมอบ **ซ้ำ** เมื่อลำดับของปีนั้นเกิน 999
--
-- อาการ: `next_handover_number()` (migration `20260814183000`) ปิดท้ายด้วย
--   `lpad(v_next::text, 3, '0')`
-- แต่ `lpad()` ของ PostgreSQL **ตัดปลายทิ้ง** เมื่อสตริงยาวกว่าความยาวเป้าหมาย
-- ⇒ ลำดับ 1000–1009 กลายเป็น `100` เหมือนกันหมด และชนกับ `LOT-2569-100` (ลำดับที่ 100) ของปีเดียวกัน
-- ⇒ `Unique constraint failed: lot_number` (ล็อตที่ 1000 ของปีสร้างไม่ได้เลย) และถ้าหลุด constraint
--    ไปได้เมื่อไรคือ **เลขเอกสารซ้ำ** ซึ่งขัด `44` §6.2/§10 ("ออกอัตโนมัติ ไม่ซ้ำ ไม่ recycle")
--
-- ฝั่งแอปคาดหวังพฤติกรรมที่ถูกต้องอยู่แล้ว: `lib/warehouse/numbering.ts` ระบุว่า "เกิน 999 ต่อปีจะ
-- ยาวขึ้นเองตามลำดับจริง" และ `parseHandoverNumber()` รับ `\d{3,}` — ชั้น SQL จึงเป็นฝั่งที่ผิด
--
-- แก้: เติมศูนย์เฉพาะตอนที่ลำดับสั้นกว่า 3 หลัก (ยาวกว่านั้นใช้เลขจริงทั้งตัว)

CREATE OR REPLACE FUNCTION next_handover_number(p_prefix text, p_be_year int)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_seq_name text;
  v_next     bigint;
  v_attempt  int := 0;
BEGIN
  IF p_prefix !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'prefix ของเลขเอกสารต้องเป็นตัวอักษรใหญ่ 3 ตัว (LOT/DLV) — ได้รับ %', p_prefix
      USING ERRCODE = '22023';  -- invalid_parameter_value
  END IF;
  -- ปีต้องเป็น พ.ศ. เสมอ (Rule 01) — ค.ศ. หลุดเข้ามา = เลขเอกสารผิดทั้งชุด
  IF p_be_year < 2500 OR p_be_year > 2999 THEN
    RAISE EXCEPTION 'ปีของเลขเอกสารต้องเป็น พ.ศ. (2500–2999) — ได้รับ %', p_be_year
      USING ERRCODE = '22023';
  END IF;

  v_seq_name := format('seq_handover_%s_%s', lower(p_prefix), p_be_year);

  LOOP
    v_attempt := v_attempt + 1;
    BEGIN
      EXECUTE format('SELECT nextval(%L)', v_seq_name) INTO v_next;
      EXIT;
    EXCEPTION WHEN undefined_table THEN
      IF v_attempt >= 3 THEN
        RAISE EXCEPTION 'สร้าง sequence % ของเลขเอกสารไม่สำเร็จ', v_seq_name;
      END IF;
      -- อีก transaction อาจสร้างพร้อมกัน: CREATE จะบล็อกจนอีกฝั่ง commit แล้วโยน duplicate ออกมา
      BEGIN
        EXECUTE format('CREATE SEQUENCE %I MINVALUE 1', v_seq_name);
      EXCEPTION WHEN duplicate_table OR unique_violation THEN
        NULL;
      END;
    END;
  END LOOP;

  -- ⚠️ ห้ามใช้ `lpad(..., 3, '0')` เดี่ยว ๆ — เกิน 3 หลักแล้ว lpad จะตัดปลายทิ้งจนเลขซ้ำ
  RETURN format(
    '%s-%s-%s',
    p_prefix,
    p_be_year,
    CASE WHEN v_next < 1000 THEN lpad(v_next::text, 3, '0') ELSE v_next::text END
  );
END;
$$;

COMMENT ON FUNCTION next_handover_number(text, int) IS
  'เดินเลขเอกสารคลัง LOT/DLV ต่อปี พ.ศ. — 3 หลักเป็นอย่างน้อย และยาวขึ้นเองเมื่อเกิน 999 (ห้ามตัดปลาย)';
