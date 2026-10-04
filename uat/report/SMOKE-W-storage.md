# SMOKE-W — Storage ผ่าน server (BUG-143 / fixer W)

วันที่ 05/10/2569 · http://localhost:3000 (200) · policy Supabase cloud = **แบบเดิม (ยังไม่ apply)** · ภาพ `uat/shots/SMOKE-W/`

| # | รายการ | ผล |
|---|---|---|
| 1 | `uat.admin` แก้เคสร่าง UAT-CO1-902 → แนบ `SMOKE-W-bundle.pdf` (193 B) เป็นเอกสารชุด → บันทึก ("บันทึกการแก้ไขเคสแล้ว") → เปิดดูไฟล์ในตัวแสดงไฟล์ได้ | ✅ |
| 1n | network: `POST /api/storage/upload-url` 200 → `PUT …/object/upload/sign/…?token=` 200 (อัปโหลดด้วยโทเคนที่เซ็นแล้ว ปกติ) · เปิดดู: `POST /api/storage/download-url` 200 → `GET …/object/sign/…?token=` (ไม่มี header Authorization) · **ไม่มี** browser เรียก `POST storage/v1/object/sign` ตรง | ✅ |
| 2 | `uat.admin` เปิด C1-contract.pdf ของ UAT-CO1-001 ได้ (ผ่าน download-url) | ✅ |
| 3a | `uat.agent.in2` ขอ download-url เอกสาร C5 (out1) → 404 `ASSIGNMENT_NOT_FOUND` · ตัวควบคุม C3 (ของตัวเอง) → 200 | ✅ |
| 3b | `uat.co2.admin` ขอ download-url เอกสาร C1 (CO1) → 404 `CASE_NOT_FOUND` · ตัวควบคุม C5 (CO2) → 200 | ✅ |
| 3c | `uat.co2.admin` ขอ upload-url target เคส C1 / 902 (CO1) → 403 `PERMISSION_DENIED` · `uat.agent.in2` upload-url เคส C5 → 403 | ✅ (ดูหมายเหตุ) |
| 3d | (เพิ่ม) `uat.agent.in2` ขอ download-url ใบเสร็จของ in1 → 403 `PERMISSION_DENIED` | ✅ ปฏิเสธ (ดูหมายเหตุ) |
| 4 | `uat.agent.in1` (มือถือ) หน้าเบิก แท็บเบิกแยก เห็นรายการค่าที่พัก ฿600 อนุมัติแล้ว — **แต่ในหน้าจอไม่มีปุ่ม/ลิงก์เปิดดูใบเสร็จ** (ไม่ใช่ regression — ก่อน fixer W ก็ไม่มี) · ยืนยันทาง API แทน: in1 ขอ download-url ใบเสร็จตัวเอง → 200 · เปิด signed URL → 200 `image/jpeg` 17,666 B (ภาพ 10) | ✅ ทาง API / ⚠️ UI ไม่มีจุดเปิด |
| 5 | pm2 log: ไม่มี 5xx ระหว่าง smoke (เรียก storage ทั้งหมด 200/403/404 ตามคาด) | ✅ |

## หมายเหตุ / ข้อสังเกต
- **OBS-1 (Low, ไม่ใช่ regression)**: หน้าเบิกของ Field Agent (`components/field/expenses-tab.tsx`) ไม่มีจุดเปิดดูใบเสร็จที่แนบไว้ — เปิดได้แค่ตอนเลือกไฟล์ใหม่ใน "แก้ไขและส่งใหม่"
- **OBS-2 (Low)**: การปฏิเสธนอก scope ยังไม่สม่ำเสมอ — download เคส = 404 ของโมดูล (ไม่ leak) แต่ download ใบเสร็จคนอื่น / upload-url เคสนอก scope = 403 `PERMISSION_DENIED` (บอกเป็นนัยว่ามี path อยู่) · co2.admin ไม่มีสิทธิ์อัปโหลดเอกสารเคสอยู่แล้ว จึงถูกตัดที่ capability ก่อนถึง scope check
- ไม่พบบั๊กใหม่ระดับ Medium ขึ้นไป

## ไฟล์ขยะใน Storage (เก็บไว้ ไม่ได้ลบ)
- `case-documents/cases/76ef07bb-4a2f-4b39-8c37-2492cf2b4e38/bundle_doc/cd7c9943-c189-4be6-bb4e-1e7655de407a-SMOKE-W-bundle.pdf` (มีแถว `case_documents` bundle_doc ของ UAT-CO1-902 ใน DB dev ด้วย)
- upload-url ที่ออกโทเคนสำเร็จมีครั้งเดียว (ข้างบน) — probe อื่นถูกปฏิเสธทั้งหมด จึงไม่มีไฟล์เพิ่ม
