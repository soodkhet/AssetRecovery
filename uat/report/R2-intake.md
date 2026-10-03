# R2 — รับเคส (ธุรการ `uat.admin` → เจ้าหน้าที่อนุมัติเคส `uat.approver`)

> วันที่ทดสอบ: 03/10/2569 (พ.ศ.) 13:57–14:08 น. เวลาไทย · snapshot ต้นรอบ: `R1-end` (restore ใหม่) · ปลายรอบ: `R2-end` (orchestrator เป็นผู้ snapshot)
> **เล่นครั้งที่ 2** — ครั้งแรกหยุดที่ R2.02 เพราะ Supabase Storage ไม่มี bucket (`R2-intake-attempt1.md`) · ครั้งนี้มี bucket `case-documents` แล้ว ⇒ อัปโหลดผ่านทุกไฟล์ เดินครบทั้งรอบ
> ผู้เล่น: role agent ผ่าน Playwright (Chrome headless, 1440×900) · สคริปต์: `uat/bin/r2/s01…s09-*.mjs` (log `uat/bin/r2/run.log`, ของครั้งแรกย้ายไป `run-attempt1.log`) · ภาพ: `uat/shots/R2/` (51 ภาพใหม่ของครั้งนี้)
> **ผล: ✅ 22 / 🐞 8 / ⚠️ 1 / ❓ 1** (32 step: R2.00–R2.31 · บั๊กใหม่ 7 ตัว `R2-B01`…`R2-B07`) · ไม่มี S1/S2/S3 · ไม่มี 500 ตลอดรอบ
> เวลาเริ่มรอบ (UTC) สำหรับ query audit: `2026-10-03T06:57:51Z` · Storage: อัปโหลดขึ้น `case-documents` สำเร็จ **24 object** (8 เคส × 3) ล้ม 0 · ครั้งแรกไม่มี object ค้าง (ล้มตั้งแต่ไม่มี bucket)

## สรุปผลต่อ step

| Step | เรื่อง | ผล | Step | เรื่อง | ผล |
|---|---|---|---|---|---|
| R2.00 | ตรวจฐานก่อนเริ่ม | ✅ | R2.16 | รายการรวม 8 เคส + ตัวกรอง | 🐞 R2-B03 |
| R2.01 | หน้ารับเคส (ว่าง) | ✅ | R2.17 | probe สิทธิ์ 8 ข้อ | ✅ |
| R2.02 | C1 ร่าง แนบ 2 ไฟล์ | ✅ | R2.18 | probe scope (ก่อนรับเคส) | ❓ R2-2/R2-3 |
| R2.03 | C1 ส่งตรวจ ขาดบัตร (ถูกปัด) | 🐞 R2-B01 | R2.19 | approver เปิดรายการ | 🐞 R2-B05 |
| R2.04 | C1 แนบบัตร + ส่งตรวจ | ✅ | R2.20 | C1 พิจารณา + probe ทีม + รับเคส | 🐞 R2-B02/B04/B07 |
| R2.05 | C2 ร่าง ไม่กรอก IMEI | ✅ | R2.21 | C2 probe API ทีม + รับเคส | ✅ |
| R2.06 | C2 ส่งตรวจ ขาด IMEI (ถูกปัด) | 🐞 R2-B01 | R2.22 | C3 รับเคส (T2) | ✅ |
| R2.07 | C2 เติม IMEI + ส่งตรวจ | ✅ | R2.23 | C4 รับเคส | ✅ |
| R2.08 | C3 + probe .txt + ส่งตรวจ | ⚠️ postal lookup | R2.24 | C5 รับเคส (ทีม C) | ✅ |
| R2.09 | C4 tablet | ✅ | R2.25 | C7 race รับเคส 2 คำขอ | ✅ |
| R2.10 | C5 ปทุมธานี | ✅ | R2.26 | C8 ไม่รับเคส + probe เหตุผล | ✅ |
| R2.11 | C7 | ✅ | R2.27 | probe action ซ้ำ/แก้หลังอนุมัติ | ✅ |
| R2.12 | C8 | ✅ | R2.28 | รายการปลายรอบ (approver) | 🐞 R2-B03 |
| R2.13 | C6 เลขสัญญาซ้ำ (UI+API) | ✅ | R2.29 | probe scope หลังรับเคส | 🐞 R2-B06 |
| R2.14 | C6 race สร้าง 2 คำขอ | ✅ | R2.30 | แจ้งเตือนถึงธุรการ | 🐞 R2-B02 |
| R2.15 | C6 แนบ + ดับเบิลคลิกส่งตรวจ | ✅ | R2.31 | invariant ปลายรอบ | ✅ |

## ผลยืนยัน "บั๊กที่สงสัย" จาก step sheet

| รหัส | ผล | หลักฐาน |
|---|---|---|
| 🐞-R2-A (hash/ไฟล์เชื่อ browser) | **ไม่ได้ probe** (step sheet ห้ามทำใน R2 เพราะจะทิ้งแถวเอกสารปลอม) — R2.17h ยืนยันแค่ว่าผู้ใช้บริษัทยิงไม่ได้ (403) · ทั้ง 24 แถวจริง hash/size ตรง `SHA256SUMS.tsv` และ `file_url` อยู่ใต้ `cases/<caseId>/` ทุกแถว | ค้างเป็น ❓ ให้ orchestrator ตัดสิน |
| 🐞-R2-B (toast ไม่บอกว่าขาดอะไร) | **ยืนยัน** → `R2-B01` | R2.03, R2.06 |
| 🐞-R2-C (ไม่มี optimistic lock) | **ไม่เกิดในการเล่นจริง** — ดับเบิลคลิกส่งออกไปแค่ 1 คำขอ (ปุ่มล็อกเอง) · race 2 context ได้ {200, 400 `CASE_INVALID_STATUS_TRANSITION`} audit approve 1 noti 1 · แต่โค้ดยังเป็น `tx.case.update({ where: { id } })` ไม่เช็คสถานะเดิม (`lib/cases/status-queries.ts:308`) ⇒ ความเสี่ยงเชิงโค้ดยังอยู่ ไม่ออกเลขบั๊ก | R2.15, R2.25 |
| 🐞-R2-D (ไม่มีเวลาส่งตรวจ/รับเคสบน list) | **ยืนยัน** → `R2-B03` | R2.16, R2.28 |
| 🐞-R2-E (ข้อความระบบในแจ้งเตือน) | **ยืนยัน** → `R2-B02` (เห็นบนกระดิ่งของธุรการจริง) | R2.20, R2.30 |
| ข้อสังเกตปุ่ม `+ รับเคส` เห็นโดย approver | **หักล้าง** — approver ไม่เห็นทั้ง `+ รับเคส (กรอกมือ)` และ `Import ไฟล์` | R2.19 |

## สิ่งที่ตัดสินเองระหว่างทาง (ให้ orchestrator รับทราบ)
1. **รหัสไปรษณีย์ lookup ได้แค่ 10900** (ตาราง placeholder มี 5 รหัส: 10260/10900/11000/50200/83000 — Open Item `38` §22 ข้อ 4) ⇒ C2–C8 จังหวัดตามบัตรไม่ถูกเติมให้ สคริปต์เลือกจังหวัดเองตาม DATASET (ผลใน DB ถูกต้องทุกเคส) — ให้ ⚠️ ที่ R2.08 ที่เดียว (step sheet คาดหวังให้เติม "สมุทรปราการ")
2. R2.20 กด Esc ปิดหน้าดูไฟล์แล้ว **หน้าต่างพิจารณาปิดแทน** (R2-B04) → ปิดหน้าดูไฟล์ที่ค้างด้วยปุ่ม "ปิดหน้าต่าง" แล้วกด `พิจารณา` ใหม่ ก่อนทำ probe เปลี่ยนทีมต่อ (ไม่มีอะไรถูกบันทึก)
3. R2.17h ใช้ metadata ปลอมของเอกสาร (hash `0`×64) ยิงด้วย `uat.co1.mgr` → 403 ไม่มีแถวเกิด · ไม่ได้ทำ probe R2-A ด้วยธุรการ (ตาม step sheet)
4. R2.30 เปิดกระดิ่งแจ้งเตือนดูอย่างเดียว ไม่กด "อ่านทั้งหมด" (`read_at` ยังว่างทั้ง 7 ใบ — ส่งต่อ R3 ได้)
5. `uat/.auth/` เดิมมีแค่ `admin.json` ⇒ helper `openAs` ล็อกอินใหม่ให้ 9 persona (เกิด audit `login` 8 แถว — ไม่ใช่ mutation ของเคส) session บันทึกไว้แล้ว
6. ภาพ `R2.04-c1-upload-fail-toast.png` เป็นของครั้งแรก (ไม่ได้อ้างในรายงานนี้) — ไม่ได้ลบ
7. probe เปลี่ยนทีม (R2.20 UI, R2.21 API) ไม่มีครั้งไหนบันทึกจริง ทีมสุดท้ายตรงตาราง §E ทุกเคส

---

## A. เปิดรอบ

### R2.00 ตรวจสภาพฐานก่อนเริ่ม
**เมนู**: — (ตรวจหลังบ้าน)
**ทำ**: `uat/bin/counts.sh` · นับ cases / case_documents / notifications · เทมเพลตที่บริษัทผูก · `curl localhost:3000/login`
**ผลหลังบ้าน**: cases 0 · case_documents 0 · notifications 0 (baseline N0 = 0) · audit_logs 81 · CO1 `UATL` → "UAT Success 5%" **v2** · CO2 `UATC` → "UAT Flat 7,490" **v2** · ทีม A/B/C id ตรง §0.4 · `/login` = 200 · fixture 26 ไฟล์ · pm2 `asset-web` online
**สถานะ**: ✅ ผ่าน

### R2.01 ธุรการเปิดหน้ารับเคส (ยังไม่มีเคส)
**เมนู**: จัดการเคส → รับเคส (`/cases/submit`)
![](../shots/R2/R2.01-empty-list.png)
**ทำ**: ล็อกอินเป็น `uat.admin` (สมใจ ธุรการดี) → เปิดเมนู "จัดการเคส"
**ผลบนจอ**: หัวข้อ "รับเคส (Case Submission)" · ปุ่ม `Import ไฟล์` / `+ รับเคส (กรอกมือ)` · KPI ร่าง 0 / รอพิจารณา 0 / ขอข้อมูลเพิ่ม 0 / รับเคสแล้ว 0 · ตัวกรอง สถานะ/ช่องทาง/ไฟแนนซ์/จังหวัด (ข้อความไทยทั้งหมด) · หัวตารางตรง step sheet ทุกคอลัมน์
**ผลหลังบ้าน**: — · console / 5xx ว่าง
**สถานะ**: ✅ ผ่าน

---

## B. ธุรการสร้างและส่งตรวจเคส

### R2.02 C1 — สร้างเคสร่าง แนบสัญญา + รูปสินค้า (ยังไม่แนบบัตรประชาชน)
**เมนู**: จัดการเคส → รับเคส → `+ รับเคส (กรอกมือ)`
![](../shots/R2/R2.02-c1-form.png)
![](../shots/R2/R2.02-c1-form-attach.png)
**ทำ**: บริษัทไฟแนนซ์ `บริษัท ยูเอที ลิสซิ่ง จำกัด` · เลขที่สัญญา `UAT-CO1-001` · ชื่อ `นายสมชาย ใจดีมาก` · สัญชาติ ไทย · เลขบัตร `1103700000046` · มือถือ `0891000001` · ที่อยู่ปัจจุบัน: เลือกจังหวัด กรุงเทพมหานคร + `12 ซ.ลาดพร้าว 15 แขวงจอมพล เขตจตุจักร` (ไม่กรอกรหัสไปรษณีย์) · ที่อยู่ตามบัตร: พิมพ์รหัสไปรษณีย์ `10900` ก่อน (ระบบเติมจังหวัด **กรุงเทพมหานคร** ให้เอง) + `12 ซ.ลาดพร้าว 15` · ประเภททรัพย์ สมาร์ทโฟน · `Samsung Galaxy A55` · IMEI `356789100000011` · มูลหนี้ `18500.00` · ช่อง "สัญญาเช่าซื้อ" = `C1-contract.pdf`, ช่อง "รูปสินค้า" = `C1-product.png` → `บันทึกเคสร่าง`
![](../shots/R2/R2.02-c1-done.png)
**ผลบนจอ**: toast "สร้างเคสร่างแล้ว · UAT-CO1-001 · บริษัท ยูเอที ลิสซิ่ง จำกัด" · **ไม่มี** toast อัปโหลดล้ม · แถวใหม่: ช่องทาง "กรอกมือ" · "เอกสารแนบ 2 ไฟล์" · 18,500.00 · ทีมที่เสนอ "ยังไม่เสนอ" · `03/10/2569 13:58` + "สมใจ ธุรการดี" · สถานะ **ร่าง** · ปุ่ม `ส่งตรวจสอบเคส` / `แก้ไข` / `ดูรายละเอียด`
**ผลหลังบ้าน**: network — Storage `POST /storage/v1/object/case-documents/cases/<id>/contract_doc/…` **200**, `…/product_photo/…` **200**, `POST /api/cases/<id>/documents` 201 ×2 · `cases`: draft, imei `356789100000011`, serial NULL, debt 1850000, projected **NULL**, suggested/assigned NULL, snapshot 6 คอลัมน์ NULL, source `manual`, normalized `UAT-CO1-001`, tracking_round 1 · `case_documents` 2 แถว (contract_doc pdf 733 B, product_photo png 2296 B) hash ตรง SHA256SUMS · audit `create`/cases 1 + `create`/case_documents 2 (actor_role ธุรการ)
**สถานะ**: ✅ ผ่าน

### R2.03 C1 — ลองส่งตรวจทั้งที่ยังไม่แนบบัตรประชาชน (ต้องถูกปัด)
**เมนู**: แถว UAT-CO1-001 → `ส่งตรวจสอบเคส`
![](../shots/R2/R2.03-c1-doc-incomplete.png)
**ผลบนจอ**: toast error "**เอกสารแนบยังไม่ครบ** — ต้องมีสัญญา, บัตรประชาชน/passport และรูปสินค้าอย่างน้อย 1 รูป ก่อนส่งให้พิจารณา" · สถานะยังเป็น ร่าง · **ไม่บอกว่าขาดชนิดไหน**
**ผลหลังบ้าน**: API 400 `CASE_DOCUMENT_INCOMPLETE` `missing: ["national_id_doc"]` (API รู้ แต่ UI ไม่แสดง) · status draft · projected NULL · audit `status_change` 0
**สถานะ**: 🐞 R2-B01 (S4)

### R2.04 C1 — แก้ไขแนบบัตรประชาชน แล้วส่งตรวจ
**เมนู**: แถว UAT-CO1-001 → `แก้ไข` → modal "แก้ไขเคส UAT-CO1-001"
![](../shots/R2/R2.04-c1-edit-form.png)
**ทำ**: ในส่วน "เอกสารแนบ" เห็น สัญญา "อัปโหลดแล้ว ✓ (1 ไฟล์)" · บัตรประชาชน "ยังไม่อัปโหลด" · รูปสินค้า 1/8 → เลือก `C1-idcard.png` ในช่องบัตรประชาชน → หมายเหตุการแก้ไข `แนบสำเนาบัตรประชาชนที่ขาด` → `บันทึกการแก้ไข` → แถว → `ส่งตรวจสอบเคส`
![](../shots/R2/R2.04-c1-submitted.png)
**ผลบนจอ**: toast "บันทึกการแก้ไขเคสแล้ว" → "ส่งตรวจสอบเคสแล้ว UAT-CO1-001 → รอพิจารณา" · แถว: เอกสารแนบ 3 ไฟล์ · ทีมที่เสนอ **UAT ทีม A กรุงเทพ** · สถานะ **รอพิจารณา** · ปุ่ม `ส่งตรวจสอบเคส` หายไป (เหลือ `แก้ไข` / `พิจารณา`)
**ผลหลังบ้าน**: `cases` pending_review · **projected 92500** (E1 ✓) · projected_revenue_source `model=SUCCESS_FEE · template=878e8143… · v2 · rate=5% · basis=debt_amount` · suggested ทีม A · assigned NULL · snapshot ยัง NULL · `case_documents` 3 แถว hash ตรง · `case_edit_history` 1 แถว changed_fields `{}` note "แนบสำเนาบัตรประชาชนที่ขาด" · audit `update` before `{}` after `{}` (แก้แค่ไฟล์+หมายเหตุ — จดค่าจริง) · audit `status_change` draft→pending_review, projected 92500, suggestedTeamId ทีม A, events `["case.status_changed"]` · notifications ไม่เพิ่ม (0)
**สถานะ**: ✅ ผ่าน

### R2.05 C2 — สร้างเคสร่าง ไม่กรอก IMEI แต่แนบครบ 3 ชนิด
**เมนู**: `+ รับเคส (กรอกมือ)`
![](../shots/R2/R2.05-c2-form-noimei.png)
**ทำ**: กรอก C2 (`UAT-CO1-002` · `นางสาวสุดา รักษ์ดี` · `1103700000054` · `0891000002` · ปัจจุบัน กรุงเทพมหานคร `45 ถ.พระราม 9 แขวงห้วยขวาง` · บัตร `10310` + จังหวัด กรุงเทพมหานคร + `45 ถ.พระราม 9` · สมาร์ทโฟน `iPhone 15 128GB` · มูลหนี้ `24900.00`) **เว้นช่อง IMEI** · แนบ `C2-contract.pdf` / `C2-idcard.png` / `C2-product.png` → `บันทึกเคสร่าง`
![](../shots/R2/R2.05-c2-done.png)
**ผลบนจอ**: บันทึกร่างได้ (ไม่บังคับ IMEI ตอนร่าง ตรง `38` §11) · toast "สร้างเคสร่างแล้ว" · เอกสารแนบ 3 ไฟล์ · หมายเหตุ: รหัส `10310` ไม่เติมจังหวัดให้ (ดู R2.08)
**ผลหลังบ้าน**: imei NULL, serial NULL · `case_documents` 3 แถว hash ตรง
**สถานะ**: ✅ ผ่าน

### R2.06 C2 — ลองส่งตรวจทั้งที่ขาด IMEI (ต้องถูกปัด)
![](../shots/R2/R2.06-c2-required-missing.png)
**ทำ**: แถว UAT-CO1-002 → `ส่งตรวจสอบเคส`
**ผลบนจอ**: toast "**ข้อมูลยังไม่ครบ** — ต้องกรอกข้อมูลที่จำเป็นให้ครบก่อนส่งให้พิจารณา" · ยังเป็น ร่าง · ไม่บอกชื่อช่องที่ขาด
**ผลหลังบ้าน**: 400 `REQUIRED_MISSING` `missingFields: ["assetImeiSerial"]` · status draft · ไม่มี audit status_change
**สถานะ**: 🐞 R2-B01 (S4)

### R2.07 C2 — เติม IMEI แล้วส่งตรวจ
![](../shots/R2/R2.07-c2-submitted.png)
**ทำ**: `แก้ไข` → IMEI `356789100000029` → หมายเหตุ `เติม IMEI` → `บันทึกการแก้ไข` → `ส่งตรวจสอบเคส`
**ผลบนจอ**: "ส่งตรวจสอบเคสแล้ว UAT-CO1-002 → รอพิจารณา" · ทีม A
**ผลหลังบ้าน**: imei `356789100000029` · projected **124500** ✓ · `case_edit_history` changed_fields `{assetImeiSerial}` · audit `update` before `{"assetImeiSerial": null}` → after `"356789100000029"` · `status_change` 1 แถว
**สถานะ**: ✅ ผ่าน

### R2.08 C3 — สร้าง (CO2) + ลองแนบไฟล์ผิดชนิด + ส่งตรวจ
![](../shots/R2/R2.08-c3-txt-rejected.png)
**ทำ**: กรอก C3 (บริษัท **ยูเอที แคปปิตอล** · `UAT-CO2-003` · `นายวีระ หายไป` · ปัจจุบัน กรุงเทพมหานคร `7 ถ.บางนา-ตราด แขวงบางนา` · บัตร `10540` · `OPPO Reno 11` · IMEI `356789100000037` · `12000.00`) → **probe**: ช่อง "รูปสินค้า" เลือก `not-an-image.txt`
**ผลบนจอ (probe)**: InlineAlert "**ไฟล์บางรายการใช้ไม่ได้** — “รูปสินค้า” รับเฉพาะรูปภาพ (JPG/PNG/WebP/HEIC) — ไฟล์ not-an-image.txt ไม่รองรับ" · ช่องรูปสินค้ายัง 0/8 · ไม่มี request ใดของ .txt ออกไป ✓
**ทำต่อ**: รหัสไปรษณีย์ `10540` **ไม่เติมจังหวัด** (ตาราง lookup ยังเป็น placeholder) → เลือก "สมุทรปราการ" เอง → แนบ C3 ×3 → `บันทึกเคสร่าง` → `ส่งตรวจสอบเคส`
![](../shots/R2/R2.08-c3-form.png)
![](../shots/R2/R2.08-c3-submitted.png)
**ผลบนจอ**: รอพิจารณา · ทีมที่เสนอ **UAT ทีม A กรุงเทพ** (ตามที่อยู่ปัจจุบัน ไม่ใช่ตามบัตร) ✓
**ผลหลังบ้าน**: addr_province กรุงเทพมหานคร · id_card_addr_province สมุทรปราการ · projected **749000** (FLAT) ✓ · case_documents 3 แถว (ไม่มี .txt)
**สถานะ**: ⚠️ known — postal lookup เป็น placeholder 5 รหัส (Open Item `38` §22 ข้อ 4) · ส่วนอื่นผ่านหมด

### R2.09 C4 — สร้าง + ส่งตรวจ (Tablet)
![](../shots/R2/R2.09-c4-form.png)
![](../shots/R2/R2.09-c4-submitted.png)
**ทำ**: กรอก C4 (`UAT-CO1-004` · `นางมณี ส่งช้า` · ประเภททรัพย์ `Tablet / iPad` · `iPad Air M2` · IMEI `356789100000045` · `31200.00` · บัตร `10400` เลือกจังหวัดเอง) + ไฟล์ C4 ×3 → บันทึก → ส่งตรวจ
**ผลหลังบ้าน**: pending_review · asset_kind `tablet` · ทีม A · projected **156000** ✓
**สถานะ**: ✅ ผ่าน

### R2.10 C5 — สร้าง + ส่งตรวจ (CO2 ปทุมธานี)
![](../shots/R2/R2.10-c5-submitted.png)
**ทำ**: กรอก C5 (`UAT-CO2-005` · ปัจจุบัน ปทุมธานี `9 ม.2 ต.คลองหนึ่ง อ.คลองหลวง` · `vivo V30` · `15900.00`) + ไฟล์ ×3 → บันทึก → ส่งตรวจ
**ผลบนจอ/หลังบ้าน**: ทีมที่เสนอ **UAT ทีม C ปทุมธานี (OS)** ✓ · projected **749000** ✓
**สถานะ**: ✅ ผ่าน

### R2.11 C7 — สร้าง + ส่งตรวจ (CO2 กรุงเทพ)
![](../shots/R2/R2.11-c7-submitted.png)
**ผลหลังบ้าน**: pending_review · ทีม A · projected **749000** ✓ · เอกสาร 3
**สถานะ**: ✅ ผ่าน

### R2.12 C8 — สร้าง + ส่งตรวจ
![](../shots/R2/R2.12-c8-submitted.png)
**ผลหลังบ้าน**: pending_review · ทีม A · projected **80000** ✓ · เอกสาร 3
**สถานะ**: ✅ ผ่าน

### R2.13 C6 — ลองใช้เลขสัญญาซ้ำกับ C1 (ฟอร์ม + API)
![](../shots/R2/R2.13-c6-dup-inline.png)
**ทำ (UI)**: `+ รับเคส (กรอกมือ)` → บริษัท ยูเอที ลิสซิ่ง · เลขที่สัญญา `UAT-CO1-001` · ข้อมูลลูกหนี้ C6 (ไม่แนบไฟล์) → `บันทึกเคสร่าง`
**ผลบนจอ**: modal ไม่ปิด · InlineAlert "**เลขที่สัญญาซ้ำ** — บริษัทไฟแนนซ์นี้มีเคสที่ใช้เลขที่สัญญานี้อยู่แล้ว — เปิดเคสเดิมเพื่อตรวจสอบ · เคสเดิม: UAT-CO1-001 (รอบที่ 1) [เปิดเคสเดิม]" → `ยกเลิก`
**ทำ (API)**: `POST /api/cases` caseRef `' uat-co1-001 '` (ช่องว่าง+ตัวเล็ก)
**ผลหลังบ้าน**: ทั้ง UI และ API = 400 `CASE_REF_DUPLICATE` พร้อม `existingCase {id, caseRef, status, trackingRound}` · `count(case_ref_normalized='UAT-CO1-001')` = 1 · ไม่มี audit create เพิ่ม
**สถานะ**: ✅ ผ่าน

### R2.14 C6 — สร้าง `UAT-CO1-006` พร้อมกัน 2 หน้าต่าง (race)
**ทำ**: สคริปต์ 2 context ของ `uat.admin` ยิง `POST /api/cases` body C6 พร้อมกัน
**ผลหลังบ้าน**: ได้ **{201, 400 `CASE_REF_DUPLICATE`}** ✓ ไม่มี 500 · ตัว 400 (เส้นทาง P2002 แปลง) body มี `caseRef` แต่ไม่มี `existingCase` ต่างจาก pre-check (ข้อสังเกตเล็ก) · `count(UAT-CO1-006)` = **1** · audit create = 1 · pm2 log ไม่มี error
**สถานะ**: ✅ ผ่าน

### R2.15 C6 — แนบเอกสาร + ดับเบิลคลิกส่งตรวจ
![](../shots/R2/R2.15-c6-edit-attach.png)
**ทำ**: แถว UAT-CO1-006 (ช่องทางแสดง "กรอกมือ") → `แก้ไข` → แนบ C6 ×3 → หมายเหตุ `แนบเอกสาร` → `บันทึกการแก้ไข` → **ดับเบิลคลิก** `ส่งตรวจสอบเคส`
![](../shots/R2/R2.15-c6-submitted.png)
**ผลบนจอ**: toast "ส่งตรวจสอบเคสแล้ว UAT-CO1-006 → รอพิจารณา" ครั้งเดียว
**ผลหลังบ้าน**: PATCH ออกไป **1 ครั้ง** (200) — ปุ่มล็อกตั้งแต่คลิกแรก · projected **100000** ✓ · ทีม A · audit `status_change` = **1**
**สถานะ**: ✅ ผ่าน

### R2.16 ธุรการตรวจหน้ารายการรวม
![](../shots/R2/R2.16-list-8-pending.png)
**ทำ**: reload `/cases/submit` → อ่านตาราง/KPI → ตัวกรองสถานะ "รอพิจารณา" + ค้นหา `UAT-CO2`
![](../shots/R2/R2.16-filter-co2.png)
**ผลบนจอ**: 8 แถว รอพิจารณาทั้งหมด · KPI รอพิจารณา 8 / ร่าง 0 · ทีมที่เสนอตาม §0.7 (C5 = ทีม C ที่เหลือทีม A) · ทุกแถว `03/10/2569 HH:mm` (ไม่มี ค.ศ.) · ตัวกรอง+ค้นหาเหลือ 3 แถว C7, C5, C3 ✓ · **ไม่มีวันเวลาส่งตรวจ** บน list (มีแค่ "สร้างเมื่อ")
**สถานะ**: 🐞 R2-B03 (S4)

### R2.17 probe สิทธิ์ — สร้าง/รับเคสด้วย role ที่ไม่มีสิทธิ์ (API)
| # | ผู้ยิง | คำขอ | ผล |
|---|---|---|---|
| a | uat.agent.in1 | POST /api/cases (`UAT-PROBE-AG`) | 403 `PERMISSION_DENIED` |
| b | uat.agent.in1 | PATCH C2/status accept | 403 |
| c | uat.finance | POST /api/cases (`UAT-PROBE-FN`) | 403 |
| d | uat.finance | PATCH C2/status accept | 403 |
| e | uat.admin | PATCH C2/status accept | 403 `PERMISSION_DENIED` |
| f | uat.mgr.in | PATCH C1/status accept | 403 |
| g | uat.approver | POST /api/cases (`UAT-PROBE-AP`) | 403 |
| h | uat.co1.mgr | POST C1/documents (metadata ปลอม) | 403 |

**ผลหลังบ้าน**: `UAT-PROBE%` = 0 แถว · C1/C2 ยัง pending_review assigned NULL · เอกสาร C1 ยัง 3
**สถานะ**: ✅ ผ่าน

### R2.18 probe scope ช่วงเคสยังรอพิจารณา
![](../shots/R2/R2.18-co2-cases-placeholder.png)
![](../shots/R2/R2.18-mgr-out-assign.png)
| ผู้ดู | ผลจริง |
|---|---|
| uat.co2.admin | list total **3** (C3, C5, C7) แคปปิตอลทั้งหมด · ชื่อทีม null · createdByName `''` ✓ · GET C1 = 404 `CASE_NOT_FOUND` body **เหมือน** id สุ่มทุกไบต์ ✓ · `?finance_company_id=CO1` / `?search=UAT-CO1` = 0 ✓ · UI `/cases` = placeholder "จัดการเคส … อยู่ระหว่างพัฒนา" ไม่มีเลขเคส · `/cases/submit` → `/dashboard` ✓ |
| uat.co1.mgr | total **5** (C1, C2, C4, C6, C8) · GET C1 200 projected/ทีม = null ✓ · GET C3 = 404 ✓ |
| uat.mgr.out | total **1** (C5) · GET C1 404 · `/cases` → `/cases/assign` ไม่มีเลขเคสบนจอ (C5 ยังไม่ approved) ✓ |
| uat.mgr.in | total **7** (ทุกเคสยกเว้น C5) — เห็นเคสรอพิจารณาผ่าน suggested_team ❓-R2-2 |
| uat.agent.in1 | 403 ✓ |
| uat.finance | 200 total **8** พร้อมข้อมูลลูกหนี้ ❓-R2-3 |

**สถานะ**: ❓ ตรงตาม step sheet ทุกข้อ แต่ ❓-R2-2 / ❓-R2-3 รอ PO

---

## C. เจ้าหน้าที่อนุมัติเคสพิจารณา

### R2.19 approver เปิดรายการรอพิจารณา
**เมนู**: ล็อกอิน `uat.approver` → จัดการเคส (`/cases` เด้งไป `/cases/submit`)
![](../shots/R2/R2.19-approver-list.png)
**ผลบนจอ**: 8 แถว รอพิจารณา · ปุ่มแถว `พิจารณา` (เขียว emerald) + `แก้ไข` · **ไม่มี** `+ รับเคส (กรอกมือ)` / `Import ไฟล์` / `ส่งตรวจสอบเคส` ✓ (หักล้างข้อสังเกตใน step sheet)
**ผลหลังบ้าน**: console มี 403 ×2 ทุกครั้งที่เปิดหน้า — `GET /api/finance-companies?status=active` ⇒ ตัวกรอง "ไฟแนนซ์" ของ approver มีแค่ "ไฟแนนซ์ทั้งหมด" กรองตามบริษัทไม่ได้
**สถานะ**: 🐞 R2-B05 (S5)

### R2.20 C1 — พิจารณา + probe เปลี่ยนทีม + รับเคส
**เมนู**: แถว UAT-CO1-001 → `พิจารณา` → modal "เคส UAT-CO1-001 · รอบที่ 1"
![](../shots/R2/R2.20-c1-review-modal.png)
**ตรวจ**: สรุปเคส (มูลหนี้ ฿18,500.00 · IMEI font-mono · สร้างเมื่อ `03/10/2569 13:58 · สมใจ ธุรการดี`) · กล่อง "ประมาณการรายได้ (ถ้าติดตามสำเร็จ)" **฿925.00** ✓ แต่บรรทัดอธิบายแสดงสตริงภายใน `model=SUCCESS_FEE · template=878e8143-… · v2 · rate=5% · basis=debt_amount` (R2-B07) · กล่อง "ทีมที่เสนอ" ป้าย "ระบบเสนอ" UAT ทีม A + หัวหน้าทีม + ค่าใช้จ่ายทีมตามแผน "UAT Inhouse" v1 · เอกสารแนบ 3 หมวดพร้อมเวลาอัปโหลด พ.ศ.
**ทำ 1**: กด `📄 C1-contract.pdf`
![](../shots/R2/R2.20-c1-fileviewer.png)
**ผล**: FileViewer แสดง PDF จริง (signed URL `…/object/sign/case-documents/…` 200, GET ไฟล์ 200 `application/pdf` 733 B) · หัว "แนบโดย สมใจ ธุรการดี · 03/10/2569 13:58" ✓ → กด **Esc** ⇒ **หน้าต่างพิจารณา (ด้านหลัง) ปิด แต่หน้าดูไฟล์ยังค้างอยู่** (R2-B04)
![](../shots/R2/R2.20-c1-after-esc.png)
→ กด "ปิดหน้าต่าง" ที่หน้าดูไฟล์ → กด `พิจารณา` ใหม่
**ทำ 2 (probe)**: `ดูทีมอื่นทั้งหมด (2)` → "UAT ทีม B นนทบุรี (ว่าง)" `เลือกทีมนี้` → dialog "เปลี่ยนทีมเป็น “UAT ทีม B นนทบุรี (ว่าง)”" → เหตุผล `abc` ⇒ `ยืนยันเปลี่ยนทีม` **disabled** ✓ → `ยกเลิก` ⇒ ทีมที่เลือกยังเป็นทีม A ✓
![](../shots/R2/R2.20-c1-teamchange-probe.png)
**ทำ 3**: ช่อง "เหตุผล / หมายเหตุ" ว่าง ⇒ `ไม่รับเคส` / `ขอข้อมูลเพิ่ม` disabled (title "ต้องกรอกเหตุผล/หมายเหตุก่อน") · `รับเคส & ยืนยันทีม` enabled → กด
![](../shots/R2/R2.20-c1-approved.png)
**ผลบนจอ**: toast "รับเคส & ยืนยันทีมแล้ว UAT-CO1-001 → รับเคสแล้ว" · modal ปิด · แถว **รับเคสแล้ว** เหลือปุ่ม `ดูรายละเอียด`
**ผลหลังบ้าน**: approved · assigned **ทีม A** · team_change_reason NULL · reviewed_by `uat.approver` · reviewed_at ไม่ NULL · review_note NULL · projected 92500 · **snapshot**: "UAT Success 5%" **v2** / SUCCESS_FEE / base 0 / rate 5.00 / debt_amount / cof f ✓ · audit `approve` (เจ้าหน้าที่อนุมัติเคส) before snapshot null ทั้งหมด → after ครบ + teamChanged false + events `["case.status_changed","case.approved"]` · reason `snapshot ค่าบริการอัตโนมัติตอนอนุมัติเคส — เทมเพลต "UAT Success 5%" v2` ✓ · noti `case.approved` "เคสผ่านการอนุมัติ" → uat.admin link `/cases/submit` body **`เคส UAT-CO1-001 — snapshot ค่าบริการอัตโนมัติตอนอนุมัติเคส — เทมเพลต "UAT Success 5%" v2`** (R2-B02)
**สถานะ**: 🐞 R2-B02 (S5) · R2-B04 (S4) · R2-B07 (S5) — การรับเคสเองผ่าน

### R2.21 C2 — probe API เปลี่ยนทีมโดยไม่มีเหตุผล แล้วรับเคสปกติ
**ทำ (API)**: `PATCH C2/status {action:'accept', teamId: TEAM_B}`
**ผล**: 400 `CASE_STATUS_REASON_REQUIRED` `field: "teamChangeReason"` ✓ · C2 ยัง pending_review, assigned/snapshot NULL, audit approve 0
**ทำ (UI)**: `พิจารณา` C2 (ประมาณการ ฿1,245.00) → `รับเคส & ยืนยันทีม`
![](../shots/R2/R2.21-c2-review.png)
![](../shots/R2/R2.21-c2-approved.png)
**ผลหลังบ้าน**: approved · ทีม A · T1 v2 SUCCESS_FEE/0/5.00/debt_amount/f · projected **124500** · audit approve 1 reason ระบบ v2 · noti +1
**สถานะ**: ✅ ผ่าน

### R2.22 C3 — รับเคส (CO2 → snapshot เทมเพลต Flat)
![](../shots/R2/R2.22-c3-review.png)
![](../shots/R2/R2.22-c3-approved.png)
**ผลบนจอ**: ประมาณการ **฿7,490.00** ✓ → รับเคสแล้ว
**ผลหลังบ้าน**: approved · ทีม A · "UAT Flat 7,490" **v2** · FLAT · base **749000** · rate **0.00** · basis NULL · cof f · projected 749000 · audit reason `…"UAT Flat 7,490" v2` · noti +1
**สถานะ**: ✅ ผ่าน

### R2.23 C4 — รับเคส
![](../shots/R2/R2.23-c4-approved.png)
**ผลหลังบ้าน**: approved · ทีม A · T1 v2 · projected **156000** (กล่องบนจอ ฿1,560.00) · noti +1
**สถานะ**: ✅ ผ่าน

### R2.24 C5 — รับเคส (ทีม C)
![](../shots/R2/R2.24-c5-review.png)
![](../shots/R2/R2.24-c5-approved.png)
**ผลบนจอ**: ทีมที่เสนอ "ระบบเสนอ" **UAT ทีม C ปทุมธานี (OS)** + ค่าใช้จ่ายตามแผน "UAT Outsource…" · (ข้อสังเกต: กล่องทีมที่เลือก**ไม่มี**ป้าย "ทีมภายนอก" — ป้ายภายใน/ภายนอกมีเฉพาะการ์ดในรายการ "ทีมอื่น" ต่างจากที่ step sheet คาด)
**ผลหลังบ้าน**: approved · assigned **ทีม C** · T2 v2 FLAT/749000 · projected **749000** · noti +1
**สถานะ**: ✅ ผ่าน

### R2.25 C7 — รับเคสพร้อมกัน 2 หน้าต่าง (race)
**ทำ**: สคริปต์ 2 context ของ `uat.approver` ยิง `PATCH C7/status {action:'accept'}` พร้อมกัน
**ผลหลังบ้าน**: **{200, 400 `CASE_INVALID_STATUS_TRANSITION`}** ✓ · audit ของ C7: create 1 / status_change 1 / **approve 1** · noti `case.approved` ของ C7 = **1** · ปลายทาง approved · ทีม A · T2 v2 · projected 749000
**สถานะ**: ✅ ผ่าน (R2-C ไม่เกิด — ดูตารางยืนยันด้านบน)

### R2.26 C8 — ไม่รับเคส (ลองไม่กรอกเหตุผลก่อน)
![](../shots/R2/R2.26-c8-reject-disabled.png)
**ทำ 1 (UI)**: `พิจารณา` C8 → เหตุผลว่าง ⇒ `ไม่รับเคส` disabled + title "ต้องกรอกเหตุผล/หมายเหตุก่อน" · พิมพ์ `"   "` ⇒ ยัง disabled ✓
**ทำ 2 (API)**: `{action:'reject'}` และ `{action:'reject', reason:'   '}` ⇒ 400 `CASE_STATUS_REASON_REQUIRED` ทั้งคู่ ✓ · C8 ยัง pending_review
**ทำ 3 (UI)**: เหตุผล `เอกสารสัญญาไม่ครบ ขาดสำเนาบัตรผู้ค้ำประกัน` → `ไม่รับเคส`
![](../shots/R2/R2.26-c8-reject-reason.png)
![](../shots/R2/R2.26-c8-rejected.png)
**ผลบนจอ**: toast "ไม่รับเคสแล้ว UAT-CO1-008 → ไม่รับเคส" · badge **ไม่รับเคส** สีแดง (`bg-red-100 text-red-800`) · เหลือปุ่ม `ดูรายละเอียด`
**ผลหลังบ้าน**: rejected · review_note = เหตุผล · reviewed_by approver · assigned NULL · snapshot NULL ทุกช่อง ✓ · projected ยัง 80000 · audit `reject` reason เดียวกัน events `["case.status_changed","case.rejected"]` · noti `case.rejected` "เคสถูกปฏิเสธ" → uat.admin body `เคส UAT-CO1-008 — เอกสารสัญญาไม่ครบ…` · `uat.mgr.in` เปิด `/cases/assign` ไม่มี UAT-CO1-008 ✓
**สถานะ**: ✅ ผ่าน

### R2.27 probe ทำซ้ำกับเคสที่ตัดสินแล้ว
**ทำ**: approver `PATCH C8/status accept` · `PATCH C1/status reject (ทดสอบ)` · ธุรการ `PATCH C1 {debtorName:'ทดสอบแก้หลังอนุมัติ'}`
**ผล**: 400 `CASE_INVALID_STATUS_TRANSITION` ×2 · 400 `CASE_LOCKED_AFTER_APPROVAL` ("แก้ไขได้เฉพาะเคสสถานะ ร่าง / รอพิจารณา / รอข้อมูลเพิ่ม เท่านั้น") · ชื่อ C1 เดิม · C6 ยัง pending_review (ไม่แตะ)
**สถานะ**: ✅ ผ่าน

### R2.28 approver ตรวจหน้ารายการปลายรอบ
![](../shots/R2/R2.28-approver-list-end.png)
**ผลบนจอ**: KPI รับเคสแล้ว **6** · รอพิจารณา **1** (C6) · ร่าง 0 · ขอข้อมูลเพิ่ม 0 · C8 ไม่รับเคส · วันเวลา พ.ศ. ทุกแถว · ไม่มีเวลารับเคส/ไม่รับเคสบน list
**สถานะ**: 🐞 R2-B03 (S4)

---

## D. ตรวจปลายรอบ

### R2.29 probe scope หลังรับเคส
![](../shots/R2/R2.29-mgr-in-assign.png)
![](../shots/R2/R2.29-mgr-out-assign.png)
| ผู้ดู | ผลจริง |
|---|---|
| uat.co2.admin | total 3 (C3, C5, C7 approved) ✓ · GET C1/C8 = 404 เหมือน id สุ่ม ✓ · GET C3 200: ทีม/projected/createdBy/teamChangeReason/serviceFeeBase/Rate/Basis = null ✓ **แต่ยังหลุด** `serviceFeeTemplateId`, `serviceFeeModelSnapshot="FLAT"`, `serviceFeeChargeOnFail=false`, `reviewedAt` (R2-B06) |
| uat.co1.mgr / uat.co1.sup | total 5 (C1, C2, C4 approved · C6 pending · C8 rejected) ไม่มี CO2 ✓ |
| uat.mgr.out | API = C5 เท่านั้น · `/cases/assign` เห็น UAT-CO2-005 อย่างเดียว ✓ |
| uat.mgr.in | API 7 เคส · `/cases/assign` เห็น C1, C2, C3, C4, C7 · ไม่เห็น C5 / C6 / C8 ✓ |

**สถานะ**: 🐞 R2-B06 (S5)

### R2.30 แจ้งเตือนถึงธุรการ
![](../shots/R2/R2.30-admin-notifications.png)
**ผลหลังบ้าน**: uat.admin: `case.approved` **6** · `case.rejected` **1** · ไม่มีแจ้งเตือนถึง role อื่น ✓
**ผลบนจอ**: กระดิ่ง "การแจ้งเตือน (ยังไม่อ่าน 7)" → panel "แจ้งเตือนล่าสุด" แต่ละรายการมีวันเวลา `03/10/2569 14:06` (พ.ศ.) ✓ · ข้อความ "เคสผ่านการอนุมัติ" ทุกใบพ่วง "— snapshot ค่าบริการอัตโนมัติตอนอนุมัติเคส — เทมเพลต "…" v2" ให้ผู้ใช้เห็น
**สถานะ**: 🐞 R2-B02 (S5)

### R2.31 สรุป invariant ปลายรอบ
**ผลหลังบ้าน** (ตาราง 1 ตรงคาดหวังทุกช่อง):

| case_ref | status | sugg | assigned | proj | tpl / v | model | base | rate | basis | cof | docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-CO1-001 | approved | ทีม A | ทีม A | 92500 | UAT Success 5% / 2 | SUCCESS_FEE | 0 | 5.00 | debt_amount | f | 3 |
| UAT-CO1-002 | approved | ทีม A | ทีม A | 124500 | UAT Success 5% / 2 | SUCCESS_FEE | 0 | 5.00 | debt_amount | f | 3 |
| UAT-CO1-004 | approved | ทีม A | ทีม A | 156000 | UAT Success 5% / 2 | SUCCESS_FEE | 0 | 5.00 | debt_amount | f | 3 |
| UAT-CO1-006 | pending_review | ทีม A | — | 100000 | — | — | — | — | — | — | 3 |
| UAT-CO1-008 | rejected | ทีม A | — | 80000 | — | — | — | — | — | — | 3 |
| UAT-CO2-003 | approved | ทีม A | ทีม A | 749000 | UAT Flat 7,490 / 2 | FLAT | 749000 | 0.00 | NULL | f | 3 |
| UAT-CO2-005 | approved | ทีม C | ทีม C | 749000 | UAT Flat 7,490 / 2 | FLAT | 749000 | 0.00 | NULL | f | 3 |
| UAT-CO2-007 | approved | ทีม A | ทีม A | 749000 | UAT Flat 7,490 / 2 | FLAT | 749000 | 0.00 | NULL | f | 3 |

- เคสชี้ template v≠2 = **0** · case_ref_normalized ซ้ำ = **0 แถว**
- audit ตั้งแต่เคสแรก: create/cases **8** · create/case_documents **24** · update/cases **3** · status_change **8** · approve **6** · reject **1** (+ login/users 8 จากการล็อกอิน persona) — ตรงคาดหวังขั้นต่ำเป๊ะ
- case_assignments / expenses / revenues = **0 / 0 / 0** ✓ · case_edit_history 3 · notifications 7
- pm2 log ช่วง 13:57–14:08: ไม่มี 500 / unhandled (มีแค่ pg `DeprecationWarning` ตอน 13:58) · console ของทุก persona: มีแค่ 400 ที่ตั้งใจยิง + 403 finance-companies (R2-B05)
- Storage `case-documents`: **24 object** (ทุกไฟล์ 200) path `cases/<caseId>/<slot>/<uuid>-<ชื่อไฟล์>` — เก็บไว้เป็นข้อมูลตัวอย่าง ไม่ได้ลบ
- `counts.sh`: audit_logs 140 · case_documents 24 · case_edit_history 3 · cases 8 · notifications 7 (ที่เหลือเท่า R1-end)
**สถานะ**: ✅ ผ่าน

---

## E. สถานะส่งต่อ R3/R4 (ตรง §E ของ step sheet)
| เคส | สถานะ | ทีม (assigned) | projected | snapshot |
|---|---|---|---|---|
| C1 UAT-CO1-001 | approved | ทีม A | 92500 | T1 v2 |
| C2 UAT-CO1-002 | approved | ทีม A | 124500 | T1 v2 |
| C3 UAT-CO2-003 | approved | ทีม A | 749000 | T2 v2 |
| C4 UAT-CO1-004 | approved | ทีม A | 156000 | T1 v2 |
| C5 UAT-CO2-005 | approved | ทีม C | 749000 | T2 v2 |
| C6 UAT-CO1-006 | pending_review | — (suggested ทีม A) | 100000 | — |
| C7 UAT-CO2-007 | approved | ทีม A | 749000 | T2 v2 |
| C8 UAT-CO1-008 | rejected | — | 80000 | — |

---

## 🐞 บั๊กที่พบ

| รหัส | step | ระดับ / ชนิด | อาการ (คาดหวัง vs เกิดจริง) | reproduce |
|---|---|---|---|---|
| **R2-B01** | R2.03, R2.06 | S4 · code | ส่งตรวจถูกปัดแล้ว toast แสดงข้อความรวม ไม่บอกว่าขาดเอกสาร/ช่องไหน ทั้งที่ API ส่ง `missing: ["national_id_doc"]` / `missingFields: ["assetImeiSerial"]` มาให้ (`cases-manager.tsx` ใช้แค่ `error.message`) | uat.admin · เคสร่างที่ขาดบัตร หรือไม่มี IMEI → `ส่งตรวจสอบเคส` |
| **R2-B02** | R2.20, R2.30 | S5 · code | รับเคสโดยไม่กรอกเหตุผล ⇒ แจ้งเตือนถึงธุรการ body = `เคส <ref> — snapshot ค่าบริการอัตโนมัติตอนอนุมัติเคส — เทมเพลต "…" v2` (ข้อความ audit ภายในหลุดถึงผู้ใช้ — `caseDecisionMessage()` ใช้ audit reason) | uat.approver รับเคสใดก็ได้ → uat.admin เปิดกระดิ่ง |
| **R2-B03** | R2.16, R2.28 | S4 · code vs Rule 05 | list รับเคสแสดงแค่ "สร้างเมื่อ / โดย" — ไม่มีวันเวลา**ส่งตรวจ** และ**รับเคส/ไม่รับเคส** บน list (Rule 05: action สำคัญต้องแสดงวันเวลาบน list) · schema ไม่มี submitted_at (อยู่แค่ audit) | เปิด `/cases/submit` หลังส่งตรวจ/รับเคส |
| **R2-B04** | R2.20 | S4 · code | เปิดไฟล์จากหน้าต่างพิจารณา (FileViewer ซ้อน) แล้วกด **Esc** ⇒ หน้าต่างพิจารณาด้านหลังปิด แต่หน้าดูไฟล์ค้างอยู่ (Modal ทุกตัวฟัง Escape เองทั้งคู่ — `components/ui/modal.tsx:46`) ผู้ใช้ต้องเปิดเคสใหม่ | uat.approver → `พิจารณา` → กดชื่อไฟล์ → Esc |
| **R2-B05** | R2.19, R2.26 | S5 · code | หน้า `/cases/submit` ของ approver เรียก `GET /api/finance-companies?status=active` ได้ 403 ×2 ทุกครั้ง (console error) ⇒ dropdown "ไฟแนนซ์" มีแค่ "ไฟแนนซ์ทั้งหมด" approver กรองเคสตามบริษัทไม่ได้ | uat.approver เปิด `/cases/submit` → ดู console / dropdown ไฟแนนซ์ |
| **R2-B06** | R2.29 | S5 · code / spec-gap | ผู้ใช้บริษัท `GET /api/cases/:id` redact ไม่สม่ำเสมอ: base/rate/basis/projected/ทีม = null แต่ยังส่ง `serviceFeeTemplateId`, `serviceFeeModelSnapshot`, `serviceFeeChargeOnFail`, `reviewedAt` | uat.co2.admin `GET /api/cases/<C3 id>` |
| **R2-B07** | R2.20–R2.24 | S5 · code | กล่อง "ประมาณการรายได้" ในหน้าต่างพิจารณาแสดง `projected_revenue_source` ดิบ: `model=SUCCESS_FEE · template=878e8143-3cce-… · v2 · rate=5% · basis=debt_amount` (UUID/คีย์ภายในบนจอผู้ใช้) | uat.approver → `พิจารณา` เคสใดก็ได้ |

ข้อสังเกตที่ไม่ออกเลขบั๊ก: (1) postal lookup placeholder 5 รหัส → ⚠️ known (Open Item `38` §22 ข้อ 4) · (2) แก้ไขเคสที่เปลี่ยนแค่ไฟล์+หมายเหตุได้ audit `update` before/after `{}` และ `case_edit_history.changed_fields = {}` — การแนบไฟล์ลง audit แยกที่ `case_documents` แล้ว · (3) 400 จาก race (เส้นทาง P2002) body มี `caseRef` ไม่มี `existingCase` ต่างจาก pre-check · (4) กล่องทีมที่เลือกไม่มีป้าย "ทีมภายใน/ภายนอก" (มีเฉพาะการ์ดทีมอื่น) · (5) R2-C: ไม่เกิดในการเล่นจริง แต่โค้ดยังไม่มี guard สถานะใน `update`

## ❓ ต้องตัดสินใจ
- **❓-R2-A** (จาก step sheet) อนุมัติให้ probe `POST /documents` ด้วยธุรการใส่ metadata ปลอม (จะเหลือแถวเอกสารปลอม 1 แถวบน C6) หรือยอมรับเป็นบั๊กจากการอ่านโค้ด
- **❓-R2-1** ไม่มีเคสที่เปลี่ยนทีมจริง (มีแค่ probe ปัด R2.20/R2.21) — แนะนำ ก) ยอมรับ พึ่ง unit test
- **❓-R2-2** ผู้จัดการทีมเห็นเคส pending_review/rejected ผ่าน suggested_team (mgr.in เห็น 7 เคสใน API แม้คิวมอบหมายจะกรองเหลือ approved)
- **❓-R2-3** การเงินเห็นทุกเคสพร้อมข้อมูลลูกหนี้ผ่าน API (`view_master_data`) — PDPA
- **❓-R2-4** ฟอร์มติด `*` ที่รหัสไปรษณีย์/อำเภอ/ตำบล แต่ backend ไม่บังคับ (รอบนี้บันทึกได้โดยไม่กรอกรหัสไปรษณีย์ที่อยู่ปัจจุบัน)
- **❓-R2-5** ประมาณการคำนวณตอน `review` (ส่งตรวจ) — ยืนยันแล้วว่า draft = NULL, ส่งตรวจแล้วมีค่า
- **❓-R2-6 (ใหม่)** R2-B06: ผู้ใช้บริษัทควรเห็นโมเดลค่าบริการ/เทมเพลตของเคสตัวเองหรือไม่ (`97`) — ถ้าเห็นได้ ก็ควรเห็น base/rate ด้วยให้สม่ำเสมอ
