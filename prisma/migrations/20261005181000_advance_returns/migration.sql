-- มติ PO 05/10/2569 (UAT U30 · BUG-109 · A6) — ปิดยอดคืนของเงินทดรองที่เคลียร์แล้ว
--
-- ยอดคืน (`advances.return_satang` generated = max(0, approved − used)) เดิมถูกบันทึกแต่ไม่มีทางปิด
-- ⇒ ผู้เคลียร์เลือกวิธีคืน (`advances.return_method`): หักกลบในรอบจ่ายถัดไป (ค่าเริ่มต้น) หรือรับคืนแยก
-- ⇒ ทุกครั้งที่ "ได้เงินคืน" ลงสมุดย่อย `advance_returns` 1 แถว (ตรวจย้อนหลังได้ว่าคืนเมื่อไร ทางไหน
--    เท่าไร รอบจ่ายไหน หลักฐานอะไร) · ยอดค้าง = return_satang − SUM(แถวที่ยังไม่ถูกกลับรายการ)
--
-- กติกาที่บังคับถึงระดับ DB (Rule 02 — Prisma เขียน CHECK / partial index / trigger ไม่ได้):
--   ① ยอด > 0 · ช่องทาง payout_offset ⇔ ผูกรอบจ่าย+รายการในรอบ · ช่องทางรับแยก ⇔ มีวันที่รับ + หลักฐาน
--   ② กลับรายการ (รอบจ่ายถูกยกเลิก/รายการถูกตัดออก) ⇔ มีเหตุผล + ผู้ทำ + เวลา — ไม่ลบแถว
--   ③ 1 เงินทดรองถูกหักในรายการรอบจ่ายเดียวกันได้ครั้งเดียว (เฉพาะแถวที่ยังไม่กลับรายการ)
--   ④ ยอดคืนสะสม (ไม่นับแถวกลับรายการ) ห้ามเกิน return_satang และเงินทดรองต้อง `cleared` — trigger
--      ล็อกแถวเงินทดรอง (`FOR UPDATE`) ก่อนรวมยอด ⇒ บันทึก/สร้างรอบจ่ายพร้อมกันไม่ทำให้เก็บเงินคืนซ้ำ
--   ⑤ แก้แถวได้ทางเดียวคือกลับรายการครั้งเดียว (ช่องอื่นห้ามเปลี่ยน · แถวที่กลับรายการแล้วห้ามแก้)
--   ⑥ `payout_batch_items.advance_offset_satang` อยู่ระหว่าง 0..net_satang (ยอดโอนไม่ติดลบ — หักหลัง WHT)
--
-- FK ไปเงินทดรอง/รอบจ่ายเป็น CASCADE เพราะทั้งสองตารางไม่มีการลบจริงในระบบ (soft delete / ไม่มี endpoint ลบ)
-- — ให้ชุดเทสต์ล้างข้อมูลขององค์กรทดสอบได้โดยไม่ต้องปิด trigger (ระบบไม่มีเส้นทาง DELETE ของสมุดย่อยนี้)

-- CreateEnum
CREATE TYPE "advance_return_method" AS ENUM ('payout_offset', 'separate');
CREATE TYPE "advance_return_channel" AS ENUM ('payout_offset', 'cash', 'bank_transfer');

-- AlterTable — วิธีคืนที่ผู้เคลียร์เลือก (NULL = ไม่มียอดคืน)
ALTER TABLE "advances" ADD COLUMN "return_method" "advance_return_method";
ALTER TABLE "advances" ADD CONSTRAINT "chk_advances_return_method_shape"
  CHECK ("return_method" IS NULL OR ("status" = 'cleared' AND "return_satang" > 0));

-- AlterTable — snapshot ยอดหักคืนเงินทดรองของรอบ/รายการ (หลัง WHT · ไม่กระทบ gross/wht/net)
ALTER TABLE "payout_batches" ADD COLUMN "advance_offset_satang" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payout_batches" ADD CONSTRAINT "chk_payout_batches_advance_offset"
  CHECK ("advance_offset_satang" >= 0 AND "advance_offset_satang" <= "net_satang");
ALTER TABLE "payout_batch_items" ADD COLUMN "advance_offset_satang" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payout_batch_items" ADD CONSTRAINT "chk_pbi_advance_offset"
  CHECK ("advance_offset_satang" >= 0 AND "advance_offset_satang" <= "net_satang");

-- CreateTable
CREATE TABLE "advance_returns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "advance_id" UUID NOT NULL,
    "payee_id" UUID NOT NULL,
    "channel" "advance_return_channel" NOT NULL,
    "amount_satang" INTEGER NOT NULL,
    "payout_batch_id" UUID,
    "payout_batch_item_id" UUID,
    "received_date" DATE,
    "evidence_file_path" TEXT,
    "evidence_file_sha256" VARCHAR(64),
    "note" TEXT,
    "reversed_at" TIMESTAMPTZ(6),
    "reversed_by" UUID,
    "reversal_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "advance_returns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_advance_returns_amount_positive" CHECK ("amount_satang" > 0),
    CONSTRAINT "chk_advance_returns_channel_shape" CHECK (
      ("channel" = 'payout_offset'
        AND "payout_batch_id" IS NOT NULL AND "payout_batch_item_id" IS NOT NULL
        AND "received_date" IS NULL AND "evidence_file_path" IS NULL)
      OR ("channel" IN ('cash', 'bank_transfer')
        AND "payout_batch_id" IS NULL AND "payout_batch_item_id" IS NULL
        AND "received_date" IS NOT NULL AND "evidence_file_path" IS NOT NULL
        AND btrim("evidence_file_path") <> '')
    ),
    CONSTRAINT "chk_advance_returns_reversal_fields" CHECK (
      ("reversed_at" IS NULL AND "reversed_by" IS NULL AND "reversal_reason" IS NULL)
      OR ("reversed_at" IS NOT NULL AND "reversed_by" IS NOT NULL
          AND "reversal_reason" IS NOT NULL AND btrim("reversal_reason") <> '')
    )
);

-- CreateIndex
CREATE INDEX "idx_advance_returns_org_advance" ON "advance_returns"("organization_id", "advance_id");
CREATE INDEX "idx_advance_returns_org_payee" ON "advance_returns"("organization_id", "payee_id");
CREATE INDEX "idx_advance_returns_org_batch" ON "advance_returns"("organization_id", "payout_batch_id");
CREATE INDEX "idx_advances_org_return_method" ON "advances"("organization_id", "return_method", "status");

-- ③ partial unique
CREATE UNIQUE INDEX "uniq_advance_returns_active_item"
  ON "advance_returns"("advance_id", "payout_batch_item_id")
  WHERE "reversed_at" IS NULL AND "payout_batch_item_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "advance_returns" ADD CONSTRAINT "advance_returns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advance_returns" ADD CONSTRAINT "advance_returns_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "advances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advance_returns" ADD CONSTRAINT "advance_returns_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advance_returns" ADD CONSTRAINT "advance_returns_payout_batch_id_fkey" FOREIGN KEY ("payout_batch_id") REFERENCES "payout_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advance_returns" ADD CONSTRAINT "advance_returns_payout_batch_item_id_fkey" FOREIGN KEY ("payout_batch_item_id") REFERENCES "payout_batch_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advance_returns" ADD CONSTRAINT "advance_returns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advance_returns" ADD CONSTRAINT "advance_returns_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "advance_returns" ADD CONSTRAINT "advance_returns_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ④ ยอดคืนสะสมห้ามเกินยอดคืนของเงินทดรอง (insert)
CREATE OR REPLACE FUNCTION advance_returns_guard_balance() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  adv_return INTEGER;
  adv_status advance_status;
  collected INTEGER;
BEGIN
  SELECT return_satang, status INTO adv_return, adv_status FROM advances WHERE id = NEW.advance_id FOR UPDATE;
  IF adv_status IS DISTINCT FROM 'cleared' THEN
    RAISE EXCEPTION 'advance_returns: เงินทดรอง % ยังไม่เคลียร์ยอด', NEW.advance_id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(SUM(amount_satang), 0) INTO collected
    FROM advance_returns WHERE advance_id = NEW.advance_id AND reversed_at IS NULL;
  IF collected + NEW.amount_satang > adv_return THEN
    RAISE EXCEPTION 'advance_returns: ยอดคืนสะสม % เกินยอดคืน % ของเงินทดรอง %',
      collected + NEW.amount_satang, adv_return, NEW.advance_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_advance_returns_guard_balance
  BEFORE INSERT ON "advance_returns"
  FOR EACH ROW EXECUTE FUNCTION advance_returns_guard_balance();

-- ⑤ แก้ได้ทางเดียว = กลับรายการครั้งเดียว
CREATE OR REPLACE FUNCTION advance_returns_guard_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'advance_returns: แถว % ถูกกลับรายการแล้ว แก้ไม่ได้', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reversed_at IS NULL
     OR NEW.advance_id <> OLD.advance_id OR NEW.payee_id <> OLD.payee_id
     OR NEW.channel <> OLD.channel OR NEW.amount_satang <> OLD.amount_satang
     OR NEW.payout_batch_id IS DISTINCT FROM OLD.payout_batch_id
     OR NEW.payout_batch_item_id IS DISTINCT FROM OLD.payout_batch_item_id
     OR NEW.received_date IS DISTINCT FROM OLD.received_date
     OR NEW.evidence_file_path IS DISTINCT FROM OLD.evidence_file_path
     OR NEW.evidence_file_sha256 IS DISTINCT FROM OLD.evidence_file_sha256
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.organization_id <> OLD.organization_id
     OR NEW.created_at <> OLD.created_at OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'advance_returns: แก้ได้เฉพาะการกลับรายการ (แถว %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_advance_returns_guard_update
  BEFORE UPDATE ON "advance_returns"
  FOR EACH ROW EXECUTE FUNCTION advance_returns_guard_update();

-- Backfill — เงินทดรองที่เคลียร์ไปแล้วและยังมียอดคืน (เช่น UAT ADV1 ฿550) ใช้ค่าเริ่มต้นของมติ:
-- หักกลบในรอบจ่ายถัดไปของผู้รับ (การเงินเปลี่ยนเป็นรับคืนแยกได้ก่อนรอบจ่ายถูกสร้าง)
UPDATE "advances" SET "return_method" = 'payout_offset'
 WHERE "status" = 'cleared' AND "return_satang" > 0 AND "deleted_at" IS NULL AND "return_method" IS NULL;
