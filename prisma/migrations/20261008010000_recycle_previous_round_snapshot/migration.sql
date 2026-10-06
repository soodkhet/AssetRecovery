-- มติ PO O72(2) (BUG-SF2) — snapshot ของรอบติดตามก่อนอนุมัติรีไซเกิล
-- เคสถูกล้าง outcome/closed_at + snapshot ค่าบริการใหม่ตอนขึ้นรอบ ⇒ รายการเบิกของรอบเดิมที่อนุมัติทีหลัง
-- ต้องมีข้อมูลของรอบเดิมเพื่อสร้างรายได้ของรอบนั้น (revenues.tracking_round = previous_round)

ALTER TABLE "recycle_requests"
  ADD COLUMN "prev_outcome" "case_outcome",
  ADD COLUMN "prev_closed_at" TIMESTAMPTZ(6),
  ADD COLUMN "prev_service_fee_model" "service_fee_model",
  ADD COLUMN "prev_service_fee_base_satang" INTEGER,
  ADD COLUMN "prev_service_fee_rate_pct" DECIMAL(5,2),
  ADD COLUMN "prev_service_fee_basis" "service_fee_basis",
  ADD COLUMN "prev_service_fee_charge_on_fail" BOOLEAN,
  ADD COLUMN "prev_debt_amount_satang" INTEGER;

-- backfill คำขอที่อนุมัติไปก่อนมติ: ค่าบริการ/ผลปิดงานจาก audit ของการอนุมัติรีไซเกิล (before_data)
-- วันปิดงาน = completed_at ล่าสุดของการมอบหมายในรอบเดิม · ยอดหนี้ = ค่าปัจจุบันของเคส (รีไซเกิลไม่แก้ยอดหนี้)
WITH src AS (
  SELECT DISTINCT ON (rr.id) rr.id, al.before_data AS b
    FROM "recycle_requests" rr
    JOIN "audit_logs" al
      ON al.organization_id = rr.organization_id
     AND al.target_type = 'cases'
     AND al.target_id = rr.case_id
     AND al.action = 'approve'
     AND al.after_data->>'trackingRound' = rr.new_round::TEXT
   WHERE rr.status = 'approved'
     AND rr.previous_round IS NOT NULL
     AND rr.prev_outcome IS NULL
   ORDER BY rr.id, al.created_at DESC
)
UPDATE "recycle_requests" rr
   SET "prev_outcome" = COALESCE((src.b->>'outcome')::"case_outcome", 'closed_fail'),
       "prev_service_fee_model" = (src.b->>'serviceFeeModelSnapshot')::"service_fee_model",
       "prev_service_fee_base_satang" = (src.b->>'serviceFeeBaseSatang')::INTEGER,
       "prev_service_fee_rate_pct" = (src.b->>'serviceFeeRatePct')::DECIMAL(5,2),
       "prev_service_fee_basis" = (src.b->>'serviceFeeBasisSnapshot')::"service_fee_basis",
       "prev_service_fee_charge_on_fail" = (src.b->>'serviceFeeChargeOnFail')::BOOLEAN
  FROM src
 WHERE rr.id = src.id;

UPDATE "recycle_requests" rr
   SET "prev_closed_at" = (
         SELECT MAX(ca.completed_at) FROM "case_assignments" ca
          WHERE ca.organization_id = rr.organization_id
            AND ca.case_id = rr.case_id
            AND ca.tracking_round = rr.previous_round
       ),
       "prev_debt_amount_satang" = c.debt_amount_satang
  FROM "cases" c
 WHERE c.id = rr.case_id
   AND rr.status = 'approved'
   AND rr.previous_round IS NOT NULL
   AND rr.prev_closed_at IS NULL;
