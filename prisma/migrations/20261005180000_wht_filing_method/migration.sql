-- วิธียื่น ภ.ง.ด. เป็นค่าตั้ง — มติ PO 05/10/2569 (UAT U45 · รีวิว C3 · ประมวลรัษฎากร ม.59)
-- ออนไลน์ (e-Filing) = กำหนดยื่นวันที่ 15 ของเดือนถัดไป · แบบกระดาษ = วันที่ 7 · ค่าเริ่มต้น = ออนไลน์ (พฤติกรรมเดิม)
-- อยู่ในชุดค่าตั้งภาษีหัก ณ ที่จ่าย (effective-dated insert-only เดิม) ⇒ แถวเดิมทั้งหมด = ออนไลน์ ไม่เปลี่ยนความหมาย
-- สรุปรอบนำส่ง snapshot วิธีที่ใช้คิดวันกำหนดยื่น (ป้าย "(ยื่นออนไลน์)"/"(ยื่นแบบกระดาษ)") · วันหยุดราชการไม่คำนวณ

-- CreateEnum
CREATE TYPE "wht_filing_method" AS ENUM ('online', 'paper');

-- AlterTable
ALTER TABLE "wht_policy_history" ADD COLUMN "filing_method" "wht_filing_method" NOT NULL DEFAULT 'online';

-- AlterTable
ALTER TABLE "wht_filing_summaries" ADD COLUMN "filing_method" "wht_filing_method" NOT NULL DEFAULT 'online';
