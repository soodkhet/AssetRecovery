-- มติ PO 07/10/2569 U134 — รอบจ่าย `completed` แต่ขั้นหลัง commit (บันทึกจ่าย/ออก 50 ทวิ) ล้ม ⇒ ตัวกวาดทำต่อ
--
-- `post_completion_synced_at` = เวลาที่ขั้นหลังรอบจ่ายสำเร็จทำครบแล้ว (แนวเดียวกับ outbox — DEC-015)
--  · รอบ `completed` ที่ค่านี้ยังเป็น NULL ⇒ ตัวกวาดใน `runSweeperJobs()` หยิบไปทำต่อ (กุญแจกันซ้ำเดิม:
--    `expense_records.payout_batch_item_id` UNIQUE + `uniq_wht_cert_active_per_expense`)
--  · โค้ดเขียนค่านี้ด้วย raw SQL เท่านั้น — ไม่ให้ `updated_at` ขยับ (วันที่จ่ายของรอบเก่าอ้าง `updated_at`)
--
-- Backfill: รอบ `completed` เดิมที่ทุกรายการมีบันทึกจ่ายแล้ว ⇒ ถือว่าครบ (ใช้ `updated_at` เป็นเวลาอ้างอิง)
-- รอบที่ยังขาดบันทึกจ่าย ⇒ ปล่อย NULL ให้ตัวกวาดทำต่อรอบแรกหลัง deploy

ALTER TABLE "payout_batches" ADD COLUMN "post_completion_synced_at" TIMESTAMPTZ(6);

-- trigger ยามยกเลิก (`payout_batches_cancel_guard`) ไม่ห้ามคอลัมน์นี้บนรอบ completed ⇒ backfill ได้ตรง ๆ
UPDATE "payout_batches" AS pb
   SET "post_completion_synced_at" = pb."updated_at"
 WHERE pb."status" = 'completed'
   AND NOT EXISTS (
     SELECT 1
       FROM "payout_batch_items" AS pbi
       LEFT JOIN "expense_records" AS er ON er."payout_batch_item_id" = pbi."id"
      WHERE pbi."payout_batch_id" = pb."id"
        AND er."id" IS NULL
   );

-- คิวของตัวกวาด — เล็กมากเสมอ (เฉพาะรอบที่ค้าง)
CREATE INDEX "idx_payout_batches_org_post_completion_pending"
  ON "payout_batches" ("organization_id", "updated_at")
  WHERE "status" = 'completed' AND "post_completion_synced_at" IS NULL AND "deleted_at" IS NULL;
