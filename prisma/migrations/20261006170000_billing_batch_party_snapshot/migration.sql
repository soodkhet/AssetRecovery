-- ใบแจ้งหนี้/ใบวางบิล — snapshot ผู้ขาย/ผู้ซื้อตอนส่งรอบวางบิล (UAT R14 · BUG-164)
--
-- เดิม PDF ใบแจ้งหนี้ (ภายใน + พอร์ทัล + Export Pack) อ่านชื่อ/ที่อยู่/เลขผู้เสียภาษีขององค์กรและบริษัทลูกค้าแบบสด
-- ⇒ แก้ชื่อบริษัทหลังส่งบิลแล้ว ใบที่ส่งลูกค้าไปแล้วเปลี่ยนตาม (ดาวน์โหลดซ้ำไม่ตรงฉบับที่ส่ง)
--
-- ① คอลัมน์ snapshot (ชุดเดียวกับ `tax_invoices`) — NULL ได้ เพราะรอบ `draft` ยังไม่ได้ส่ง ⇒ ยังไม่มีเอกสาร
-- ② backfill รอบที่ส่งแล้วทุกใบจากค่าปัจจุบันขององค์กร/บริษัท (ค่าที่ดีที่สุดที่มี ณ วันแก้)
-- ③ ยาม immutable: เมื่อ snapshot ถูกบันทึกแล้วห้ามเปลี่ยน (ผู้ขายหรือผู้ซื้อก็ตาม)

-- ①
ALTER TABLE "billing_batches"
  ADD COLUMN "seller_name" TEXT,
  ADD COLUMN "seller_tax_id" VARCHAR(13),
  ADD COLUMN "seller_address" TEXT,
  ADD COLUMN "seller_phone" VARCHAR(20),
  ADD COLUMN "seller_branch_code" VARCHAR(5),
  ADD COLUMN "buyer_name" TEXT,
  ADD COLUMN "buyer_tax_id" VARCHAR(13),
  ADD COLUMN "buyer_address" TEXT,
  ADD COLUMN "buyer_phone" VARCHAR(20),
  ADD COLUMN "buyer_branch_code" VARCHAR(5);

-- snapshot มาเป็นชุด — ผู้ขายกับผู้ซื้อต้องมีพร้อมกันหรือไม่มีทั้งคู่
ALTER TABLE "billing_batches" ADD CONSTRAINT "billing_party_snapshot_complete" CHECK (
  ("seller_name" IS NULL AND "buyer_name" IS NULL)
  OR (
    "seller_name" IS NOT NULL AND "seller_tax_id" IS NOT NULL AND "seller_address" IS NOT NULL
    AND "seller_branch_code" IS NOT NULL
    AND "buyer_name" IS NOT NULL AND "buyer_tax_id" IS NOT NULL AND "buyer_address" IS NOT NULL
    AND "buyer_branch_code" IS NOT NULL
  )
);

-- ②
UPDATE "billing_batches" AS b
SET
  "seller_name" = o."name",
  "seller_tax_id" = o."tax_id",
  "seller_address" = o."address",
  "seller_phone" = o."phone",
  "seller_branch_code" = o."branch_code",
  "buyer_name" = c."name",
  "buyer_tax_id" = c."tax_id",
  "buyer_address" = COALESCE(c."address", ''),
  "buyer_phone" = c."phone",
  "buyer_branch_code" = c."branch_code"
FROM "organizations" AS o, "finance_companies" AS c
WHERE o."id" = b."organization_id"
  AND c."id" = b."company_id"
  AND b."status" <> 'draft'
  AND b."seller_name" IS NULL;

-- ③
CREATE OR REPLACE FUNCTION billing_batches_party_snapshot_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."seller_name" IS NOT NULL AND (
       NEW."seller_name"        IS DISTINCT FROM OLD."seller_name"
    OR NEW."seller_tax_id"      IS DISTINCT FROM OLD."seller_tax_id"
    OR NEW."seller_address"     IS DISTINCT FROM OLD."seller_address"
    OR NEW."seller_phone"       IS DISTINCT FROM OLD."seller_phone"
    OR NEW."seller_branch_code" IS DISTINCT FROM OLD."seller_branch_code"
    OR NEW."buyer_name"         IS DISTINCT FROM OLD."buyer_name"
    OR NEW."buyer_tax_id"       IS DISTINCT FROM OLD."buyer_tax_id"
    OR NEW."buyer_address"      IS DISTINCT FROM OLD."buyer_address"
    OR NEW."buyer_phone"        IS DISTINCT FROM OLD."buyer_phone"
    OR NEW."buyer_branch_code"  IS DISTINCT FROM OLD."buyer_branch_code"
  ) THEN
    RAISE EXCEPTION 'BILLING_PARTY_SNAPSHOT_IMMUTABLE: รอบวางบิล % ส่งแล้ว — ข้อมูลผู้ขาย/ผู้ซื้อบนใบแจ้งหนี้แก้ไม่ได้',
      OLD."batch_number" USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_batches_party_snapshot ON "billing_batches";
CREATE TRIGGER trg_billing_batches_party_snapshot
  BEFORE UPDATE ON "billing_batches"
  FOR EACH ROW EXECUTE FUNCTION billing_batches_party_snapshot_immutable();
