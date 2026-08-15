-- Phase 8.2 — Immutable Rules ครบตาราง (`02` §13)
--
-- ก่อนหน้านี้ repo มี trigger แค่ 3 ตาราง (`audit_logs` 1.4 · `handover_lots` 2.12 · `tax_invoices` 4.3)
-- ทั้งที่ `02`:2057 สั่งไว้ตรงตัวว่า **"Immutable Rules บังคับที่ระดับ table ไม่ใช่แค่ระดับ application"**
-- — ยามฝั่ง service กันได้เฉพาะทางที่เดินผ่านโค้ด ส่วน SQL Editor / สคริปต์ซ่อม / bug ในโค้ดใหม่
-- ยังลบเอกสารภาษีทิ้งได้เงียบ ๆ ⇒ ก้อนนี้เติมอีก 7 ตารางที่เหลือให้ครบตามตารางในสเปค
--
-- ### อ่านสเปคแบบตรงตัว — บล็อกเท่าที่ `02` §13 สั่ง ไม่เกินนั้น
-- แถวที่เขียนว่า "ห้าม DELETE" มีแค่ `export_records` · `wht_certificates` · `roles`
-- (+ `tax_invoices`/`handover_lots` ที่ทำไปแล้ว) — แถวอื่นสั่งเฉพาะ UPDATE ⇒ **ไม่ใส่ DELETE trigger**
-- ให้ `case_evidences` / `payout_batches` / `bank_transactions` / `accounting_periods`
-- (ใส่เกินจะไปบล็อก cascade ของ `cases` และงาน housekeeping ที่สเปคไม่ได้ห้าม)
--
-- ### รูปแบบที่ใช้ (ตามแบบเดิมของ repo)
-- ① statement-level unconditional — ยิงแม้ WHERE ไม่โดนแถวไหน + คลุม TRUNCATE (`audit_logs`)
-- ② row-level + `WHEN (...)` — "สถานะปลายทางถูกแช่แข็ง" (`handover_lots`)
-- ③ row-level + allow-list ในฟังก์ชัน — ยังต้องเหลือ transition ที่ถูกกฎหมายไว้ (`tax_invoices`)
-- ทุกตัวขึ้นต้นข้อความด้วย error code ของแอปเพื่อให้ API layer map ต่อได้ + `ERRCODE = '42501'`

-- ─────────────────────────────────────────────────────────────────────────────
-- ① `export_records` — "any / ห้าม DELETE, ต้องสร้าง version ใหม่แทน"
--    UPDATE ยังต้องทำได้ (`mark-sent` / `accept` เขียน `sent_at`/`accepted_at` — `37` §9)
--    ⇒ บล็อกเฉพาะ DELETE/TRUNCATE และใช้ statement-level เพื่อคลุม TRUNCATE ด้วย
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION export_records_no_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'EXPORT_RECORD_IMMUTABLE: ห้าม % ตาราง export_records — ชุดที่ส่งสำนักงานบัญชีแล้วต้องขึ้น version ใหม่เสมอ (02 §13 / 37 §9)', TG_OP
    USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION export_records_no_delete() IS
  'ยาม immutable ของ export_records (`02` §13) — ห้ามลบทุกกรณี · แก้ได้ (mark-sent/accept) · ประวัติเดินด้วย version';

DROP TRIGGER IF EXISTS trg_export_records_no_delete   ON export_records;
DROP TRIGGER IF EXISTS trg_export_records_no_truncate ON export_records;

CREATE TRIGGER trg_export_records_no_delete
  BEFORE DELETE ON export_records
  FOR EACH STATEMENT EXECUTE FUNCTION export_records_no_delete();

CREATE TRIGGER trg_export_records_no_truncate
  BEFORE TRUNCATE ON export_records
  FOR EACH STATEMENT EXECUTE FUNCTION export_records_no_delete();

-- ─────────────────────────────────────────────────────────────────────────────
-- ③ `wht_certificates` — "status = 'cancelled' / ห้าม DELETE, ห้าม reverse cancel"
--    ทำแบบเดียวกับ `tax_invoices` เป๊ะ ๆ: **ลบไม่ได้ทุกสถานะ** เพราะ `certificate_number` เป็น
--    เลขที่เดินตามลำดับ — ลบใบไหนออก = เลขขาดช่วง อธิบายกับสรรพากรไม่ได้ (เหตุผลเดียวกับ `31` §9.1)
--    ใบที่ `cancelled` แล้วแช่แข็ง · ใบที่ `active` แก้ได้ทางเดียวคือ "ยกเลิก"
--    (ออกใบใหม่ = สร้างแถวใหม่ที่อ้าง `replaces_certificate_id` — DEC-006/D4)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION wht_certificates_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'WHT_CERTIFICATE_IMMUTABLE: ใบหัก ณ ที่จ่าย % ลบไม่ได้ — ยกเลิกเท่านั้น (02 §13 / 33 §9)',
      OLD.certificate_number USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'WHT_CERTIFICATE_IMMUTABLE: ใบหัก ณ ที่จ่าย % ถูกยกเลิกแล้ว ห้ามแก้/ห้าม reverse — ออกใบใหม่ที่อ้าง replaces_certificate_id แทน (02 §13 / DEC-006 D4)',
      OLD.certificate_number USING ERRCODE = '42501';
  END IF;

  -- ใบที่ยัง active: ยอมให้เปลี่ยนได้ทางเดียวคือยกเลิก · ตัวเลข/ตัวตนของใบห้ามขยับ
  IF NEW.status <> 'cancelled'
     OR NEW.certificate_number  <> OLD.certificate_number
     OR NEW.gross_satang        <> OLD.gross_satang
     OR NEW.wht_satang          <> OLD.wht_satang
     OR NEW.payment_date        <> OLD.payment_date
     OR NEW.payee_id            <> OLD.payee_id
     OR NEW.expense_record_id   <> OLD.expense_record_id
     OR NEW.organization_id     <> OLD.organization_id THEN
    RAISE EXCEPTION 'WHT_CERTIFICATE_IMMUTABLE: ใบหัก ณ ที่จ่าย % แก้ได้ทางเดียวคือยกเลิก (02 §13 / 33 §10)',
      OLD.certificate_number USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION wht_certificates_immutable() IS
  'ยาม immutable ของ wht_certificates (`02` §13) — ห้ามลบทุกกรณี (เลขที่ห้ามขาดช่วง) · cancelled ห้ามแก้/ห้าม reverse · active แก้ได้เฉพาะการยกเลิก';

DROP TRIGGER IF EXISTS trg_wht_certificates_no_update ON wht_certificates;
DROP TRIGGER IF EXISTS trg_wht_certificates_no_delete ON wht_certificates;

CREATE TRIGGER trg_wht_certificates_no_update
  BEFORE UPDATE ON wht_certificates FOR EACH ROW EXECUTE FUNCTION wht_certificates_immutable();
CREATE TRIGGER trg_wht_certificates_no_delete
  BEFORE DELETE ON wht_certificates FOR EACH ROW EXECUTE FUNCTION wht_certificates_immutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- ② `case_evidences` — "status = 'approved' / ห้าม UPDATE ทุก column"
--    ไม่ใส่ DELETE trigger: สเปคไม่ได้ห้าม และตารางนี้ผูก cascade กับ `cases`
--    (เหตุผลเดียวกับที่ `02`:2044 ยกเว้น `case_edit_history` ไว้)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION case_evidences_approved_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CASE_EVIDENCE_IMMUTABLE: หลักฐานเคส % ผ่าน QC แล้ว ห้ามแก้ทุกคอลัมน์ — ต้องให้ตีกลับก่อน (02 §13 / 41 §10)',
    OLD.id USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION case_evidences_approved_immutable() IS
  'ยาม immutable ของ case_evidences ที่ approved (`02` §13) — ห้าม UPDATE ทุกคอลัมน์';

DROP TRIGGER IF EXISTS trg_case_evidences_approved_no_update ON case_evidences;

CREATE TRIGGER trg_case_evidences_approved_no_update
  BEFORE UPDATE ON case_evidences
  FOR EACH ROW WHEN (OLD.status = 'approved')
  EXECUTE FUNCTION case_evidences_approved_immutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- ③ `payout_batches` — "status = 'completed' / ห้าม UPDATE gross/wht/net"
--    เฉพาะ 3 คอลัมน์เงิน — คอลัมน์อื่น (เช่นข้อมูลไฟล์โอน/`updated_at`) ยังแก้ได้ตามสเปค
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION payout_batches_completed_amounts_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.gross_satang <> OLD.gross_satang
     OR NEW.wht_satang <> OLD.wht_satang
     OR NEW.net_satang <> OLD.net_satang THEN
    RAISE EXCEPTION 'PAYOUT_BATCH_IMMUTABLE: รอบจ่าย % จ่ายเสร็จแล้ว ห้ามแก้ยอด gross/wht/net — ต้องผ่าน Adjustment (02 §13 / 20 §9)',
      OLD.name USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION payout_batches_completed_amounts_immutable() IS
  'ยาม immutable ของ payout_batches ที่ completed (`02` §13) — ล็อกเฉพาะ 3 คอลัมน์เงิน คอลัมน์อื่นยังแก้ได้';

DROP TRIGGER IF EXISTS trg_payout_batches_completed_amounts ON payout_batches;

CREATE TRIGGER trg_payout_batches_completed_amounts
  BEFORE UPDATE ON payout_batches
  FOR EACH ROW WHEN (OLD.status = 'completed')
  EXECUTE FUNCTION payout_batches_completed_amounts_immutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- ② `bank_transactions` — "match_status != 'unmatched' / unmatch ต้องมี reason + audit"
--    DB มองไม่เห็น reason/audit (อยู่คนละตาราง) ⇒ สิ่งที่ trigger บังคับได้จริงคือ
--    **ห้ามถอยกลับไป `unmatched` ตรง ๆ** — การถอยคู่ที่จับแล้วต้องเดินผ่าน service ที่บังคับ reason
--    (`36` §9) แล้วลงเอยที่ `unmatched_resolved` ไม่ใช่ปัด match_status กลับเงียบ ๆ
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bank_transactions_no_silent_unmatch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'BANK_TRANSACTION_IMMUTABLE: รายการเดินบัญชี % จับคู่ไปแล้ว ห้ามปัด match_status กลับเป็น unmatched ตรง ๆ — ต้องถอยผ่านระบบที่บังคับเหตุผล + audit (02 §13 / 36 §9)',
    OLD.id USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION bank_transactions_no_silent_unmatch() IS
  'ยามของ bank_transactions (`02` §13) — แถวที่ match_status ไม่ใช่ unmatched ห้ามถูกปัดกลับเป็น unmatched โดยไม่ผ่าน service ที่บังคับ reason + audit';

DROP TRIGGER IF EXISTS trg_bank_transactions_no_silent_unmatch ON bank_transactions;

CREATE TRIGGER trg_bank_transactions_no_silent_unmatch
  BEFORE UPDATE ON bank_transactions
  FOR EACH ROW WHEN (OLD.match_status <> 'unmatched' AND NEW.match_status = 'unmatched')
  EXECUTE FUNCTION bank_transactions_no_silent_unmatch();

-- ─────────────────────────────────────────────────────────────────────────────
-- ③ `accounting_periods` — "status = 'locked' / แก้ตรงไม่ได้ ต้องผ่าน Adjustment + Executive"
--    ⚠️ ต้องเหลือทางออกให้ `unlockPeriod()` (`30` §10 — ผู้บริหารเท่านั้น) ⇒ allow-list
--    เฉพาะ transition `locked → sent_to_accountant` และห้ามให้ตัวตนของงวดขยับพร้อมกัน
--    สเปคแถวนี้ **ไม่ได้** สั่งห้าม DELETE ⇒ ไม่ใส่ DELETE trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accounting_periods_locked_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'sent_to_accountant'
     OR NEW.year_be         <> OLD.year_be
     OR NEW.month           <> OLD.month
     OR NEW.period_label    <> OLD.period_label
     OR NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'PERIOD_LOCKED_DIRECT_EDIT: งวด % ปิดแล้ว แก้ตรงไม่ได้ — ต้องผ่าน Adjustment + ผู้บริหารปลดล็อก (02 §13 / 30 §10 / 20)',
      OLD.period_label USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION accounting_periods_locked_immutable() IS
  'ยาม immutable ของ accounting_periods ที่ locked (`02` §13) — ทางออกเดียวคือปลดล็อกกลับเป็น sent_to_accountant (`30` §10)';

DROP TRIGGER IF EXISTS trg_accounting_periods_locked ON accounting_periods;

CREATE TRIGGER trg_accounting_periods_locked
  BEFORE UPDATE ON accounting_periods
  FOR EACH ROW WHEN (OLD.status = 'locked')
  EXECUTE FUNCTION accounting_periods_locked_immutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- ②/③ `roles` — "is_seed = true / ห้าม DELETE, ห้าม UPDATE name/role_group"
--    soft delete (`deleted_at`) และการแก้ capability ยังต้องทำได้ ⇒ เทียบเฉพาะ 2 คอลัมน์
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION roles_seed_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SEED_ROLE_IMMUTABLE: บทบาทมาตรฐาน % ลบไม่ได้ (02 §13 / 07 §5)',
      OLD.name USING ERRCODE = '42501';
  END IF;

  IF NEW.name <> OLD.name OR NEW.role_group <> OLD.role_group THEN
    RAISE EXCEPTION 'SEED_ROLE_IMMUTABLE: บทบาทมาตรฐาน % เปลี่ยนชื่อ/กลุ่มไม่ได้ — แก้ได้เฉพาะสิทธิ์ที่ผูกไว้ (02 §13 / 07 §5)',
      OLD.name USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION roles_seed_immutable() IS
  'ยาม immutable ของ roles ที่ is_seed (`02` §13) — ห้ามลบ · ห้ามเปลี่ยน name/role_group · แก้ capability/soft delete ได้';

DROP TRIGGER IF EXISTS trg_roles_seed_no_update ON roles;
DROP TRIGGER IF EXISTS trg_roles_seed_no_delete ON roles;

CREATE TRIGGER trg_roles_seed_no_update
  BEFORE UPDATE ON roles
  FOR EACH ROW WHEN (OLD.is_seed) EXECUTE FUNCTION roles_seed_immutable();
CREATE TRIGGER trg_roles_seed_no_delete
  BEFORE DELETE ON roles
  FOR EACH ROW WHEN (OLD.is_seed) EXECUTE FUNCTION roles_seed_immutable();
