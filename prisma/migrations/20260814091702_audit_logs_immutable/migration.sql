-- audit_logs immutable ระดับ DB (`02` §13 · `90` §13, §16 · Rule 03)
--
-- "Audit log ห้ามแก้ไข/ลบเด็ดขาด ไม่มีข้อยกเว้น แม้แต่ Superadmin" (`90` §17)
-- guard ระดับ service (Prisma extension ใน `lib/prisma.ts`) กันได้เฉพาะทางที่ผ่าน Prisma Client
-- ⇒ ต้องมีชั้น DB ด้วย ไม่งั้น raw SQL / psql / งาน ops แก้ทับได้เงียบ ๆ (`90` §16 test case สุดท้าย)
--
-- ใช้ trigger **STATEMENT-level** (ไม่ใช่ ROW) เพราะต้อง reject แม้คำสั่งนั้นไม่ match แถวไหนเลย —
-- ROW-level trigger จะไม่ยิงเมื่อ WHERE ไม่โดนแถว ทำให้ `DELETE FROM audit_logs WHERE ...` ผ่านเงียบ ๆ
-- และคลุม TRUNCATE ด้วย (TRUNCATE ข้าม row trigger ทั้งหมดโดยธรรมชาติ)
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_IMMUTABLE: ห้าม % ตาราง audit_logs เด็ดขาด (02 §13 / 90 §13)', TG_OP
    USING ERRCODE = '42501';  -- insufficient_privilege
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_no_update   ON audit_logs;
DROP TRIGGER IF EXISTS trg_audit_logs_no_delete   ON audit_logs;
DROP TRIGGER IF EXISTS trg_audit_logs_no_truncate ON audit_logs;

CREATE TRIGGER trg_audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();

CREATE TRIGGER trg_audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();

CREATE TRIGGER trg_audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();
