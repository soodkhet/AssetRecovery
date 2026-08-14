-- Phase 2.13 — Warehouse: เดินเลขล็อต/ใบส่งมอบ + immutable ของล็อตที่ยืนยันแล้ว
-- (`44` §6.2 "1 Lot = 1 เลขล็อต + 1 ใบส่งมอบ ออกอัตโนมัติ ไม่ซ้ำ แก้ไม่ได้" · `02` §7 · §13)
--
-- ① เดินเลข `LOT-2569-001` / `DLV-2569-001` — ปี **พ.ศ.** และรีเซ็ตลำดับทุกปี
--    ⇒ ใช้ PostgreSQL sequence **หนึ่งตัวต่อ (prefix, ปี)** สร้างแบบ lazy ครั้งแรกที่ใช้ปีนั้น
--    - `nextval()` ไม่ถูก rollback ⇒ กันเลขซ้ำได้แม้มีหลาย transaction พร้อมกัน (`44` §10 "ไม่ recycle")
--    - ห้ามอ่าน MAX() มาบวกเอง — กับดักเดียวกับ `reserveNextInvoiceNumber()` ของ 1.10
--
-- ② `handover_lots` ที่ `status = 'confirmed'` เป็น terminal state ห้าม UPDATE/DELETE (`02` §13 · `44` §10)
--    guard ระดับ service อยู่ที่ `lib/warehouse/queries.ts` — ชั้นนี้กัน raw SQL / งาน ops

-- ── ① ตัวเดินเลข ────────────────────────────────────────────────────────────
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

  RETURN format('%s-%s-%s', p_prefix, p_be_year, lpad(v_next::text, 3, '0'));
END;
$$;

COMMENT ON FUNCTION next_handover_number(text, int) IS
  'เดินเลข LOT-/DLV- ของ handover_lots (`44` §6.2) — ปี พ.ศ. · 1 sequence ต่อ (prefix, ปี)';

-- ── ② handover_lots confirmed = immutable ───────────────────────────────────
CREATE OR REPLACE FUNCTION handover_lots_confirmed_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LOT_ALREADY_CONFIRMED: ล็อต % ยืนยันส่งมอบแล้ว ห้าม % (44 §10 / 02 §13)',
    OLD.lot_number, TG_OP
    USING ERRCODE = '42501';  -- insufficient_privilege
END;
$$;

DROP TRIGGER IF EXISTS trg_handover_lots_confirmed_no_update ON handover_lots;
DROP TRIGGER IF EXISTS trg_handover_lots_confirmed_no_delete ON handover_lots;

-- ROW-level + WHEN (OLD.status = 'confirmed') — คำสั่งที่ไม่โดนแถว confirmed ต้องผ่านตามปกติ
CREATE TRIGGER trg_handover_lots_confirmed_no_update
  BEFORE UPDATE ON handover_lots
  FOR EACH ROW WHEN (OLD.status = 'confirmed')
  EXECUTE FUNCTION handover_lots_confirmed_immutable();

CREATE TRIGGER trg_handover_lots_confirmed_no_delete
  BEFORE DELETE ON handover_lots
  FOR EACH ROW WHEN (OLD.status = 'confirmed')
  EXECUTE FUNCTION handover_lots_confirmed_immutable();
