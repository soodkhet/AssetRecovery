-- มติ PO 05/10/2569 (UAT U40 / U41)
--
-- U40 — 50 ทวิ ที่ลูกค้า (บริษัทไฟแนนซ์) หักเรา "แบบเต็ม":
--   จับคู่เงินรับที่ถูกหักภาษี ⇒ เกิดแถว `customer_wht_certificates` สถานะ `pending` ("รอ 50 ทวิ จากลูกค้า")
--   อัตโนมัติ (ยอด/ลูกค้า/รอบวางบิล/เงินรับ) → ได้รับหนังสือ ⇒ กรอกเลขที่/วันที่/ยอด + แนบไฟล์ ⇒ `received`
--   · เลขที่/วันที่/ยอดในหนังสือจึงต้องว่างได้ระหว่างรอ (บังคับด้วย CHECK เมื่อ `received`)
--   · ตารางนี้ยังไม่เคยมี API เขียน ⇒ แถวเดิม (ถ้ามี) ถือว่าได้รับหนังสือแล้ว ย้ายค่าให้ครบตาม CHECK ใหม่
--
-- U41 — เงินเข้าไม่ทราบที่มา: สถานะรายการเดินบัญชี `suspense` ("เงินรับรอตรวจสอบ" — หนี้สิน ไม่สร้างเงินรับ
--   ไม่ลด AR) → ภายหลังจับคู่กับรอบวางบิล (`manual_matched`) หรือคืนเงินผู้โอน (`suspense_refunded` — terminal)
--   · รายการเดิมที่ปิดเป็น `unmatched_resolved` ไปแล้วไม่ย้าย (มติ U41)
--
-- ⚠️ ค่า enum ใหม่ใช้ใน transaction เดียวกับ ADD VALUE ไม่ได้ (Postgres) ⇒ CHECK ใหม่เทียบผ่าน `::text`

-- ── U41: enum + คอลัมน์ ────────────────────────────────────────────────────
ALTER TYPE "bank_match_status" ADD VALUE IF NOT EXISTS 'suspense';
ALTER TYPE "bank_match_status" ADD VALUE IF NOT EXISTS 'suspense_refunded';

ALTER TABLE "bank_transactions"
  ADD COLUMN "suspense_note" TEXT,
  ADD COLUMN "suspended_at" TIMESTAMPTZ(6),
  ADD COLUMN "suspended_by" UUID,
  ADD COLUMN "refund_date" DATE,
  ADD COLUMN "refund_note" TEXT,
  ADD COLUMN "refund_file_path" TEXT,
  ADD COLUMN "refund_file_sha256" TEXT,
  ADD COLUMN "refunded_at" TIMESTAMPTZ(6),
  ADD COLUMN "refunded_by" UUID;

ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_suspended_by_fkey"
  FOREIGN KEY ("suspended_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_refunded_by_fkey"
  FOREIGN KEY ("refunded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_bank_tx_org_status" ON "bank_transactions"("organization_id", "match_status");

-- สถานะ ↔ รูปทรง FK: `suspense`/`suspense_refunded` ห้ามผูก FK ใด ๆ เหมือน `unmatched`/`unmatched_resolved`
ALTER TABLE "bank_transactions" DROP CONSTRAINT "bank_tx_status_fk_shape";
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_tx_status_fk_shape" CHECK (
  (
    "match_status"::text IN ('auto_matched', 'manual_matched')
    AND (
      ("is_split_allocation" = false AND (
        "matched_billing_id" IS NOT NULL OR "matched_payout_id" IS NOT NULL OR "matched_advance_id" IS NOT NULL))
      OR ("is_split_allocation" = true AND
        "matched_billing_id" IS NULL AND "matched_payout_id" IS NULL AND "matched_advance_id" IS NULL)
    )
  )
  OR (
    "match_status"::text IN ('unmatched', 'unmatched_resolved', 'suspense', 'suspense_refunded')
    AND "is_split_allocation" = false
    AND "matched_billing_id" IS NULL AND "matched_payout_id" IS NULL AND "matched_advance_id" IS NULL
  )
);

-- เงินรับรอตรวจสอบ = เงินเข้าเท่านั้น + ต้องมีเหตุผล/เวลาที่ย้ายเข้า · คืนเงินแล้วต้องมีวันที่ + เหตุผล + หลักฐาน
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_tx_suspense_shape" CHECK (
  "match_status"::text NOT IN ('suspense', 'suspense_refunded')
  OR ("amount_satang" > 0 AND "suspended_at" IS NOT NULL AND "suspense_note" IS NOT NULL)
);
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_tx_refund_shape" CHECK (
  ("match_status"::text = 'suspense_refunded'
    AND "refund_date" IS NOT NULL AND "refund_note" IS NOT NULL AND "refund_file_path" IS NOT NULL
    AND "refunded_at" IS NOT NULL)
  OR ("match_status"::text <> 'suspense_refunded' AND "refund_date" IS NULL AND "refunded_at" IS NULL)
);

-- ── U40: 50 ทวิ ที่ลูกค้าหักเรา ─────────────────────────────────────────────
CREATE TYPE "customer_wht_status" AS ENUM ('pending', 'received');

ALTER TABLE "customer_wht_certificates"
  ADD COLUMN "cash_receipt_id" UUID,
  ADD COLUMN "status" "customer_wht_status" NOT NULL DEFAULT 'pending',
  ADD COLUMN "withheld_satang" INTEGER,
  ADD COLUMN "withheld_date" DATE,
  ADD COLUMN "file_sha256" TEXT,
  ADD COLUMN "received_at" TIMESTAMPTZ(6),
  ADD COLUMN "received_by" UUID,
  ALTER COLUMN "certificate_number" DROP NOT NULL,
  ALTER COLUMN "certificate_date" DROP NOT NULL,
  ALTER COLUMN "gross_satang" DROP NOT NULL,
  ALTER COLUMN "wht_satang" DROP NOT NULL;

-- แถวเดิม (ไม่มี API เขียนมาก่อน — กันไว้เผื่อ) = ได้รับหนังสือแล้ว
UPDATE "customer_wht_certificates"
SET "status" = 'received',
    "withheld_satang" = "wht_satang",
    "withheld_date" = "certificate_date",
    "received_at" = "created_at",
    "received_by" = "created_by";

ALTER TABLE "customer_wht_certificates"
  ALTER COLUMN "withheld_satang" SET NOT NULL,
  ALTER COLUMN "withheld_date" SET NOT NULL;

ALTER TABLE "customer_wht_certificates" ADD CONSTRAINT "customer_wht_certificates_cash_receipt_id_fkey"
  FOREIGN KEY ("cash_receipt_id") REFERENCES "cash_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_wht_certificates" ADD CONSTRAINT "customer_wht_certificates_received_by_fkey"
  FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_customer_wht_status" ON "customer_wht_certificates"("organization_id", "status", "withheld_date");

-- 1 เงินรับ = รายการรอ 50 ทวิ ได้ใบเดียว (ที่ยังไม่ถูกลบ) — จับคู่ซ้ำ/retry ต้องไม่เกิดรายการซ้ำ
CREATE UNIQUE INDEX "uniq_customer_wht_cash_receipt" ON "customer_wht_certificates"("cash_receipt_id")
  WHERE "cash_receipt_id" IS NOT NULL AND "deleted_at" IS NULL;

ALTER TABLE "customer_wht_certificates" ADD CONSTRAINT "customer_wht_withheld_positive" CHECK ("withheld_satang" > 0);
ALTER TABLE "customer_wht_certificates" ADD CONSTRAINT "customer_wht_received_shape" CHECK (
  ("status" = 'pending' AND "received_at" IS NULL)
  OR ("status" = 'received'
    AND "certificate_number" IS NOT NULL AND "certificate_date" IS NOT NULL
    AND "wht_satang" IS NOT NULL AND "wht_satang" > 0 AND "received_at" IS NOT NULL)
);
