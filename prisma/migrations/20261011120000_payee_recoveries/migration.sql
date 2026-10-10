-- staging E-014 (มติ PO 10/10/2569) — "ยอดเรียกคืนจากผู้รับ": Adjustment ลดยอดรายการเบิกที่จ่ายแล้ว ⇒ หักคืนจากยอดโอน
-- สุทธิในรอบจ่ายถัดไป (หลัง WHT และหลังหักคืนเงินทดรอง — `22` §6.14) · 50 ทวิ เดิมไม่แก้ย้อนหลัง

CREATE TABLE payee_recoveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  payee_id        UUID NOT NULL REFERENCES payee_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  adjustment_id   UUID NOT NULL REFERENCES adjustments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  expense_id      UUID,
  amount_satang   INTEGER NOT NULL,
  created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  created_by      UUID NOT NULL,
  updated_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ(6),
  CONSTRAINT chk_payee_recoveries_amount CHECK (amount_satang > 0)
);
CREATE UNIQUE INDEX payee_recoveries_adjustment_id_key ON payee_recoveries(adjustment_id);
CREATE INDEX idx_payee_recoveries_org_payee ON payee_recoveries(organization_id, payee_id);

CREATE TABLE payee_recovery_collections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  recovery_id          UUID NOT NULL REFERENCES payee_recoveries(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  payee_id             UUID NOT NULL REFERENCES payee_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  payout_batch_id      UUID NOT NULL REFERENCES payout_batches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  payout_batch_item_id UUID NOT NULL REFERENCES payout_batch_items(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  amount_satang        INTEGER NOT NULL,
  reversed_at          TIMESTAMPTZ(6),
  reversed_by          UUID,
  reversal_reason      TEXT,
  created_at           TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  created_by           UUID NOT NULL,
  CONSTRAINT chk_payee_recovery_collections_amount CHECK (amount_satang > 0),
  CONSTRAINT chk_payee_recovery_collections_reversal CHECK (
    (reversed_at IS NULL AND reversed_by IS NULL AND reversal_reason IS NULL)
    OR (reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND reversal_reason IS NOT NULL AND btrim(reversal_reason) <> '')
  )
);
CREATE INDEX idx_payee_recovery_collections_org_recovery ON payee_recovery_collections(organization_id, recovery_id);
CREATE INDEX idx_payee_recovery_collections_item ON payee_recovery_collections(payout_batch_item_id);
-- หักซ้ำยอดเดิมในบรรทัดเดียวกันไม่ได้ (เฉพาะแถวที่ยังไม่กลับรายการ)
CREATE UNIQUE INDEX uniq_active_recovery_collection_per_item
  ON payee_recovery_collections(recovery_id, payout_batch_item_id) WHERE reversed_at IS NULL;

-- ยอดหักสะสม (ยังไม่กลับรายการ) ห้ามเกินยอดเรียกคืน
CREATE OR REPLACE FUNCTION payee_recovery_collections_within_amount() RETURNS trigger AS $$
DECLARE
  total INTEGER;
  limit_amount INTEGER;
BEGIN
  SELECT amount_satang INTO limit_amount FROM payee_recoveries WHERE id = NEW.recovery_id FOR UPDATE;
  SELECT COALESCE(SUM(amount_satang), 0) INTO total
    FROM payee_recovery_collections WHERE recovery_id = NEW.recovery_id AND reversed_at IS NULL;
  IF total > limit_amount THEN
    RAISE EXCEPTION 'ยอดหักคืนสะสม % เกินยอดเรียกคืน %', total, limit_amount;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payee_recovery_collections_within_amount
  AFTER INSERT OR UPDATE ON payee_recovery_collections
  FOR EACH ROW EXECUTE FUNCTION payee_recovery_collections_within_amount();

-- ห้ามลบสมุดย่อย (กลับรายการแทน)
CREATE OR REPLACE FUNCTION payee_recovery_collections_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payee_recovery_collections ห้ามลบ — ใช้การกลับรายการ (reversed_at)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payee_recovery_collections_no_delete
  BEFORE DELETE ON payee_recovery_collections
  FOR EACH ROW EXECUTE FUNCTION payee_recovery_collections_no_delete();

ALTER TABLE payout_batch_items ADD COLUMN recovery_offset_satang INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payout_batch_items ADD CONSTRAINT chk_pbi_recovery_offset
  CHECK (recovery_offset_satang >= 0 AND advance_offset_satang + recovery_offset_satang <= net_satang);
ALTER TABLE payout_batches ADD COLUMN recovery_offset_satang INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payout_batches ADD CONSTRAINT chk_payout_batches_recovery_offset
  CHECK (recovery_offset_satang >= 0 AND advance_offset_satang + recovery_offset_satang <= net_satang);
