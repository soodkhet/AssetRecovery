-- staging E-054 (มติ PO 10/10/2569) — เกณฑ์ ฿1,000 ไม่หัก WHT สะสมต่อผู้รับต่อเดือนปฏิทิน (ท.ป.4/2528)
-- ค่าตั้งเลือกได้ (ต่อรอบจ่าย / สะสมต่อเดือน — ค่าเริ่มต้นสะสมต่อเดือน) · snapshot ลงรอบจ่าย (NULL = รอบเก่า = ต่อรอบ)
CREATE TYPE wht_threshold_scope AS ENUM ('per_batch', 'monthly_cumulative');

ALTER TABLE wht_policy_history
  ADD COLUMN threshold_scope wht_threshold_scope NOT NULL DEFAULT 'monthly_cumulative';

ALTER TABLE payout_batches
  ADD COLUMN wht_threshold_scope wht_threshold_scope;

ALTER TABLE payout_batch_items
  ADD COLUMN wht_carried_base_satang INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT chk_payout_batch_items_wht_carried_base CHECK (wht_carried_base_satang >= 0);
