-- mytester DO-07 (มติ 13/10/2569 — Claude ตัดสินแทน PO ตามแนวใช้งานง่าย) — ฟอร์มขอเงินทดรองมีช่อง "อ้างอิงเคส (ไม่บังคับ)"
--   `advances.case_id` = เคสที่ผู้รับเงินรับผิดชอบอยู่ตอนขอเบิก (server ตรวจ scope — `02` v4.74 · `15` v2.15)
--   additive nullable — เงินทดรองเดิมทั้งหมดเป็น NULL (= ไม่อ้างอิงเคส) · ไม่กระทบยอดเงิน/สถานะ/เกตรายได้ของเคส
ALTER TABLE "advances" ADD COLUMN "case_id" UUID;
ALTER TABLE "advances" ADD CONSTRAINT "advances_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "idx_advances_org_case" ON "advances"("organization_id", "case_id");
