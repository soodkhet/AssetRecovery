-- UAT R6-E (BUG เงิน S2 · `02` v4.11): กันรายได้ซ้ำ/หายเมื่ออนุมัติรายการเบิกตัวสุดท้ายของเคสพร้อมกัน
-- 1 เคส 1 รอบติดตาม มีรายได้ที่ยังไม่ถูกลบได้แถวเดียว (`19` §6.1 idempotent ต่อเคส · B3 กันบิลซ้ำข้ามรอบ)
-- ตัวกันหลักอยู่ที่ service (`SELECT … FOR UPDATE` แถว `cases` ก่อนประเมินเกต) — index นี้คือยามชั้น DB
-- ⚠️ ถ้ามีแถวซ้ำอยู่แล้ว migration นี้ล้มโดยตั้งใจ (เป็นเงิน ห้ามลบอัตโนมัติ — ต้องตรวจด้วยคนก่อน)
CREATE UNIQUE INDEX uniq_revenues_active_case_round
  ON revenues(organization_id, case_id, tracking_round)
  WHERE deleted_at IS NULL;
