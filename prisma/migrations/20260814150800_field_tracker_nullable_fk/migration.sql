-- Phase 2.8 (ต่อ) — FK ที่ nullable ต้องเป็น `ON DELETE SET NULL` ตามแบบที่ Prisma สร้างให้ตารางอื่น
ALTER TABLE "travel_origins" DROP CONSTRAINT "travel_origins_updated_by_fkey";
ALTER TABLE "travel_origins" ADD CONSTRAINT "travel_origins_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "close_case_drafts" DROP CONSTRAINT "close_case_drafts_updated_by_fkey";
ALTER TABLE "close_case_drafts" ADD CONSTRAINT "close_case_drafts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
