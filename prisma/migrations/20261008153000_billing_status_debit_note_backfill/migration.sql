-- มติ O75 (07/10/2569) — รอบวางบิล `paid` ที่ออกใบเพิ่มหนี้ (หรือยกเลิกใบลดหนี้) ภายหลังจนยอดตามเอกสารค้าง > 0
-- ⇒ `partially_paid` (`23` §6.8 เส้นใหม่ `paid → partially_paid`) · ข้อมูลใหม่ปรับใน transaction ที่บันทึกเอกสาร
-- (`syncBillingStatusWithDocuments()`) — migration นี้ปรับเฉพาะข้อมูลเก่าที่ค้าง (รันซ้ำได้: เลือกเฉพาะแถวที่ยังเป็น paid)
--
-- ยอดตามเอกสาร = ใบแจ้งหนี้ (sales_records.total_satang · ไม่มี ⇒ billing_batches.total_satang)
--               − ใบลดหนี้ active + ใบเพิ่มหนี้ active (นิยามเดียวกับ `documentedAmountsForBatches()`)
-- ชำระแล้ว      = received + ภาษีที่ลูกค้าหัก + ส่วนต่างที่ตัดเป็นค่าธรรมเนียม (`settledSatang()`)

WITH documented AS (
  SELECT bb.id,
         bb.organization_id,
         COALESCE(sr.total_satang, bb.total_satang)
           - COALESCE(SUM(cn.total_satang) FILTER (WHERE cn.note_type = 'credit'), 0)
           + COALESCE(SUM(cn.total_satang) FILTER (WHERE cn.note_type = 'debit'), 0) AS documented_total,
         bb.received_satang + bb.wht_withheld_by_customer_satang + bb.bank_fee_written_off_satang AS settled
    FROM "billing_batches" bb
    LEFT JOIN "sales_records" sr ON sr.billing_batch_id = bb.id
    LEFT JOIN "tax_invoices" ti ON ti.sales_record_id = sr.id
    LEFT JOIN "credit_notes" cn ON cn.tax_invoice_id = ti.id AND cn.status = 'active'
   WHERE bb.status = 'paid' AND bb.deleted_at IS NULL
   GROUP BY bb.id, bb.organization_id, sr.total_satang, bb.total_satang
),
changed AS (
  UPDATE "billing_batches" bb
     SET "status" = 'partially_paid', "updated_at" = now()
    FROM documented d
   WHERE bb.id = d.id
     AND bb.status = 'paid'
     AND d.documented_total - d.settled > 0
  RETURNING bb.id, bb.organization_id, d.documented_total
)
INSERT INTO "audit_logs" ("organization_id", "actor_id", "actor_role", "action", "target_type", "target_id",
                          "before_data", "after_data", "reason")
SELECT c.organization_id, NULL, 'system', 'status_change', 'billing_batches', c.id,
       jsonb_build_object('status', 'paid', 'documented_total_satang', c.documented_total),
       jsonb_build_object('status', 'partially_paid', 'documented_total_satang', c.documented_total,
                          'source_ref', 'migration 20261008153000_billing_status_debit_note_backfill'),
       'มติ O75 — ปรับสถานะรอบที่ยอดตามเอกสารยังค้างหลังออกใบเพิ่มหนี้ (job: migration 20261008153000_billing_status_debit_note_backfill)'
  FROM changed c;
