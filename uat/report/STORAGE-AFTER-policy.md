# STORAGE-AFTER — ทดสอบหลังถอด Storage policy (BUG-143 · DEC-014)

วันที่ 05/10/2569 · http://localhost:3000 · project Supabase `qgshdg…` (ใช้ร่วม staging) · ไม่มี policy บน `storage.objects`
สคริปต์: `uat/bin/storage-after/*.mjs` · ภาพ: `uat/shots/STORAGE-AFTER/`

| # | รายการ | ผล | หลักฐาน |
|---|---|---|---|
| 1 | `uat.admin` แก้ไข UAT-CO1-902 → อัปโหลด PDF (ช่องเอกสารชุด) → บันทึก → เปิดดู | ✅ `upload-url` 200 → PUT signed upload 200 → `POST /documents` 201 → toast "บันทึกการแก้ไขเคสแล้ว" → viewer iframe PDF แสดงผล (`download-url` 200, signed GET 200 application/pdf) | 01c, 01d, 01e-902-b-open |
| 2 | เปิดเอกสาร C1 (`C1-idcard.png`) โดย `uat.admin` · รูปหลักฐานปิดงาน C1 (`R4-C1-photo.jpg`) โดย `uat.approver` (กล่องหลักฐานแสดงเฉพาะผู้มีสิทธิ์ตรวจหลักฐาน) | ✅ ทั้งสอง: `download-url` 200 → signed GET 200 · `<img>` โหลดได้ | 02a-C1-doc-b-open, 02b-C1-evidence-b-open |
| 3 | คลัง (ธุรการ) → ส่งมอบแล้ว → LOT-2569-003 → ทรัพย์ C1 → รูป "ด้านหน้า" | ✅ `download-url` 200 → signed GET 200 image/png | 03d, 03e-C1-intake-front |
| 4 | คลัง → LOT-2569-003 → เอกสาร → "เปิดดู / ดาวน์โหลด" ใบเซ็นรับ | ✅ viewer iframe PDF (signed GET 200 application/pdf) | 04a, 04b-lot003-signed-doc |
| 5 | `uat.agent.in1` `POST /api/storage/download-url` ใบเสร็จค่าที่พัก (hotel) ของตัวเอง | ✅ 200 ttl 300s → signed URL GET 200 image/jpeg 17,666 B · (เสริม) `uat.agent.in2` ขอใบเสร็จของ in1 → 403 `PERMISSION_DENIED` | 05-agent-in1-receipt-signed |
| 6 | `uat.co1.mgr` portal: รูปทรัพย์ C1 (7 รูป) + ดาวน์โหลดใบเซ็นรับ LOT-2569-003 | ✅ `/api/portal/assets/…/photos/0–6` 200 image/png ครบ 7 · download `DLV-2569-003-signed.pdf` (776 B, header `%PDF-`) | 06a, 06b |
| 7 | เข้าถึง Storage ตรง (anon/publishable key จาก JS bundle สาธารณะ + access token ผู้ใช้จาก cookie) | ✅ **ล้มทั้งหมด** — รายละเอียดด้านล่าง | 07-* |
| 8 | pm2 log ช่วงทดสอบ (14:00–14:30) | ✅ ไม่มี 5xx / ⨯ Error | — |

## ข้อ 7 — ผลละเอียด (ทดสอบ 2 ผู้ใช้: `uat.agent.in2`, `uat.co1.mgr` × 2 โหมด: token ผู้ใช้ / anon ล้วน)
- key ที่ bundle เปิดเผย = publishable (ไม่ใช่ service role) · token ผู้ใช้ role `authenticated` · portal bundle ไม่มี Supabase URL/key เลย (ใช้ค่าจาก bundle หน้า agent)
- `list` prefix `cases`, `cases/<C1>/national_id_doc`, `''`, `handover-lots`, `expenses` → 200 `[]` (RLS กรองหมด — ไม่เห็นแม้ไฟล์ที่มีอยู่จริง)
- `download` (`/object/authenticated/…` และ `/object/…`) ไฟล์จริง 3 ตัว (เอกสาร C1, ใบเซ็นรับ LOT-003, ใบเสร็จ in1) → 400 `{"statusCode":"404","error":"not_found","message":"Object not found"}`
- `/object/public/…` → 404 `Bucket not found` (bucket private) · `object/info` → `Object not found`
- `createSignedUrl` (`/object/sign/<path>`) → `Object not found` · sign หลาย path → 200 แต่ทุกรายการ `"Either the object does not exist or you do not have access to it"` (ไม่ได้ URL)
- `upload` `cases/test/probe-*.txt` (POST), upsert (PUT x-upsert), `createSignedUploadUrl` → 400 `{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}`
- `move` → `Object not found` · `bucket list` → 200 `[]` · `bucket get case-documents` → `Bucket not found`
- ไฟล์เหล่านี้มีอยู่จริง (ข้อ 2–5 เปิดผ่าน server ได้) ⇒ การปฏิเสธมาจาก RLS ไม่ใช่ path ผิด → **S3 ปิดแล้ว**

## บั๊กที่พบ
- 🐞 **High — login ใหม่หลัง session หมดอายุ วนกลับ `/login?reason=SESSION_EXPIRED` นานสูงสุด 5 นาที**
  ขั้นตอน: ผู้ใช้ที่ `last_login_at` เกิน 24 ชม. เปิดหน้าใดก็ได้ → ถูกส่งไป login (ถูกต้อง) → login สำเร็จ (`POST /api/auth/login` 200, `users.last_login_at` อัปเดตแล้ว) → `/dashboard` ถูกเด้งกลับ SESSION_EXPIRED ซ้ำ ๆ ทุกครั้งจนครบ ~5 นาที แล้วจึงเข้าได้ (ยืนยันกับ `uat.admin` 13:51–13:59)
  สาเหตุที่น่าจะเป็น: `lib/auth/session-cache.ts` cache `SessionUser` (รวม `loginAt` เดิม) ไว้ 5 นาที แม้ session หมดอายุแล้ว — ฝั่ง proxy/instance ที่ตรวจหน้าเป็นคนละ instance กับที่ login เขียน cache ใหม่ จึงถือ `loginAt` เก่าต่อ (ลักษณะเดียวกับกรณี must_change_password ที่แก้ไว้แล้วใน `isCacheableSession`) · เป็น flow ปกติประจำวัน (กลับมาใช้งานวันถัดไป) และบน Vercel หลาย instance จะเจอบ่อยกว่า
  ทางเลี่ยงที่ใช้ในการทดสอบ: login จากหน้า `/login` ตรงด้วย context ใหม่ก่อนแตะหน้าที่ต้อง auth
- 🐞 **Low — dialog "เอกสารที่แนบ" ของล็อต (คลัง) แสดง storage path ดิบ** (`handover-lots/<uuid>/signed-doc/<uuid>.pdf`) เป็นข้อความให้ผู้ใช้เห็น แทนชื่อไฟล์ (ภาพ 04a)

## ไฟล์ใหม่ใน Storage (เก็บไว้ ไม่ลบ)
- `case-documents/cases/76ef07bb-4a2f-4b39-8c37-2492cf2b4e38/bundle_doc/47209d84-0818-4a68-8b55-8cc32d130a90-STORAGE-AFTER-contract.pdf` (399 B · UAT-CO1-902 ช่องเอกสารชุด + แถว `case_documents` ใหม่)
- probe ข้อ 7 อัปโหลดไม่สำเร็จ → ไม่มีไฟล์ `cases/test/*` เกิดขึ้น
