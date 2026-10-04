# ตั้งค่า Supabase Storage ต่อ environment (ทำครั้งเดียวต่อ project — staging แล้วค่อย production)

> พบใน UAT R2 (03/10/2569): project ที่ localhost + staging ใช้ (`qgshdg…`) **ยังไม่มี bucket เลย** ⇒ อัปโหลดเอกสารเคสไม่ได้ (`Bucket not found`) · โค้ดอ้าง bucket 4 ตัว (`lib/**` `*_BUCKET`)

## 1. สร้าง bucket (Dashboard → Storage → New bucket) — ทุกตัว **Private** (ปิด Public)

| bucket | ใครอัปโหลด | ใช้ทำอะไร |
|---|---|---|
| `case-documents` | **browser ของผู้ใช้** (JWT ของคนที่ login) | เอกสารเคส `cases/<caseId>/…` · หลักฐานปิดงาน · รูปรับเข้าคลัง · เอกสารล็อต `handover-lots/<lotId>/…` (upsert) |
| `payment-files` | server (service role) | ไฟล์โอนเงินของรอบจ่าย |
| `accounting-packs` | server (service role) | Accounting Pack ต่อเวอร์ชัน |
| `report-exports` | server (service role) | ไฟล์ export รายงานแบบงานเบื้องหลัง |

## 2. Policy ของ `case-documents` — ⚠️ **ยกเลิกแล้ว (BUG-143 · DEC-014 · 05/10/2569)**
> ตั้งแต่ fixer W (`ee14b9e`) ทุกการอัปโหลด/ดาวน์โหลดผ่าน server (`POST /api/storage/upload-url`, `POST /api/storage/download-url`) ด้วย signed URL · **ห้ามสร้าง policy ให้ `authenticated`** · ถอด policy เดิมด้วย `pnpm storage:setup --expect-ref <ref> --env .env.local --db-env .env.staging --dry-run` แล้วรันจริงโดยตัด `--dry-run` (**รอผู้ใช้อนุมัติ** — project ใช้ร่วม localhost + staging) · ข้อความด้านล่างเก็บไว้เป็นประวัติเท่านั้น

### (ประวัติ) policy เดิม
ระบบตรวจสิทธิ์จริงที่ API layer (DEC-002) — policy นี้แค่เปิดให้ผู้ใช้ที่ login แล้วอัปโหลด/อ่านไฟล์ใน bucket นี้ได้

| ชื่อ policy | Operation | Target role | USING / WITH CHECK |
|---|---|---|---|
| case-docs read | SELECT | authenticated | `bucket_id = 'case-documents'` |
| case-docs insert | INSERT | authenticated | `bucket_id = 'case-documents'` |
| case-docs update (lot docs upsert) | UPDATE | authenticated | `bucket_id = 'case-documents'` |

ไม่ต้องเปิด DELETE · อีก 3 bucket ไม่ต้องมี policy (service role ข้าม RLS)

## 3. ตรวจ
หลังสร้างแล้ว บอก Claude ว่า "สร้าง bucket แล้ว" — UAT จะ restore `R1-end` แล้วเริ่ม R2 ใหม่ (ขั้น R2.02 คือการทดสอบอัปโหลดครั้งแรก)
