-- มติ PO 07/10/2569 (Final Test ด่าน 3) — U127 · U130 · U140
--
-- ① U127 ธง "ต้องยื่นเพิ่มเติม" บนรอบ ภ.ง.ด. ที่ยื่นแล้ว (`filed`) — ไม่เพิ่มสถานะใหม่ (state machine เดิม `pending → filed`)
--    ยอด `pnd*_satang` ของรอบที่ยื่นแล้ว = ยอดที่ยื่น (ไม่ถูกคำนวณทับ) · ยอดปัจจุบันคิดสดจากใบที่มีผล
ALTER TABLE "wht_filing_summaries"
  ADD COLUMN "supplementary_required_at" TIMESTAMPTZ(6),
  ADD COLUMN "supplementary_filed_at" TIMESTAMPTZ(6),
  ADD COLUMN "supplementary_filed_by" UUID;

ALTER TABLE "wht_filing_summaries"
  ADD CONSTRAINT "wht_filing_summaries_supplementary_filed_by_fkey"
  FOREIGN KEY ("supplementary_filed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ธงมีได้เฉพาะรอบที่ยื่นแล้ว
ALTER TABLE "wht_filing_summaries"
  ADD CONSTRAINT "wht_filing_supplementary_only_when_filed"
  CHECK ("supplementary_required_at" IS NULL OR "status" = 'filed');

-- ② U130 snapshot หัวกระดาษองค์กรตอนออกเอกสารภายใน (โครง JSON เดียวกับ `handover_lots.letterhead_snapshot` — U111)
--    NULL = เอกสารก่อน U130 / ยังไม่ถึงจังหวะออก ⇒ พิมพ์ด้วยค่าปัจจุบัน (พฤติกรรมเดิม)
ALTER TABLE "payout_batches" ADD COLUMN "letterhead_snapshot" JSONB;
ALTER TABLE "advances" ADD COLUMN "letterhead_snapshot" JSONB;
ALTER TABLE "advance_returns" ADD COLUMN "letterhead_snapshot" JSONB;
ALTER TABLE "substitute_receipts" ADD COLUMN "letterhead_snapshot" JSONB;

--    ใบแจ้งหนี้: % ภาษีที่ลูกค้าหัก + บัญชีรับเงิน + รายละเอียดทรัพย์ต่อบรรทัด ณ วันส่งรอบ
ALTER TABLE "billing_batches" ADD COLUMN "invoice_detail_snapshot" JSONB;

-- เขียนครั้งเดียว — มีค่าแล้วห้ามเปลี่ยน/ล้าง (พิมพ์ซ้ำต้องได้หน้าตาเดิม)
CREATE OR REPLACE FUNCTION document_letterhead_snapshot_write_once() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."letterhead_snapshot" IS NOT NULL
     AND NEW."letterhead_snapshot" IS DISTINCT FROM OLD."letterhead_snapshot" THEN
    RAISE EXCEPTION 'LETTERHEAD_SNAPSHOT_IMMUTABLE: หัวกระดาษของเอกสารที่ออกแล้วแก้ไม่ได้ (% %)', TG_TABLE_NAME, OLD."id"
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payout_batches_letterhead_snapshot
  BEFORE UPDATE ON "payout_batches" FOR EACH ROW EXECUTE FUNCTION document_letterhead_snapshot_write_once();
CREATE TRIGGER trg_advances_letterhead_snapshot
  BEFORE UPDATE ON "advances" FOR EACH ROW EXECUTE FUNCTION document_letterhead_snapshot_write_once();
CREATE TRIGGER trg_advance_returns_letterhead_snapshot
  BEFORE UPDATE ON "advance_returns" FOR EACH ROW EXECUTE FUNCTION document_letterhead_snapshot_write_once();
CREATE TRIGGER trg_substitute_receipts_letterhead_snapshot
  BEFORE UPDATE ON "substitute_receipts" FOR EACH ROW EXECUTE FUNCTION document_letterhead_snapshot_write_once();

CREATE OR REPLACE FUNCTION billing_batches_invoice_detail_snapshot_write_once() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."invoice_detail_snapshot" IS NOT NULL
     AND NEW."invoice_detail_snapshot" IS DISTINCT FROM OLD."invoice_detail_snapshot" THEN
    RAISE EXCEPTION 'BILLING_INVOICE_SNAPSHOT_IMMUTABLE: รอบวางบิล % ส่งแล้ว — รายละเอียดบนใบแจ้งหนี้แก้ไม่ได้',
      OLD."batch_number" USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_billing_batches_invoice_detail_snapshot
  BEFORE UPDATE ON "billing_batches" FOR EACH ROW EXECUTE FUNCTION billing_batches_invoice_detail_snapshot_write_once();

-- ③ U140 การยืนยันค่าตั้งที่เป็นสมมติฐาน (รอนักบัญชียืนยัน) — insert-only · 1 แถวต่อองค์กรต่อรายการ
CREATE TABLE "setting_assumption_confirmations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "assumption_key" VARCHAR(64) NOT NULL,
  "reason" TEXT NOT NULL,
  "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "setting_assumption_confirmations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "setting_assumption_reason_not_blank" CHECK (length(btrim("reason")) > 0)
);

CREATE UNIQUE INDEX "uniq_setting_assumption_confirmation"
  ON "setting_assumption_confirmations"("organization_id", "assumption_key");

ALTER TABLE "setting_assumption_confirmations"
  ADD CONSTRAINT "setting_assumption_confirmations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "setting_assumption_confirmations"
  ADD CONSTRAINT "setting_assumption_confirmations_confirmed_by_fkey"
  FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION setting_assumption_confirmations_insert_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'setting_assumption_confirmations: บันทึกการยืนยันแก้ไข/ลบไม่ได้' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER trg_setting_assumption_confirmations_insert_only
  BEFORE UPDATE OR DELETE ON "setting_assumption_confirmations"
  FOR EACH ROW EXECUTE FUNCTION setting_assumption_confirmations_insert_only();
