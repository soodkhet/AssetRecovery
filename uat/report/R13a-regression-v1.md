# R13a — regression หลังมติ U22–U84 · ส่วน A–E (หลายบทบาท)

> วันที่ทดสอบ: 05/10/2569 23:10–23:33 (เวลาไทย — **ไม่ข้ามเที่ยงคืน** ใช้วันที่ 05/10/2569 ตาม step sheet ทั้งรอบ) · snapshot ต้นรอบ: `R13-start` + ซ่อมงวด ต.ค. 2569 เป็น `collecting` (R13.00 ตัวเลือก ก) · ปลายรอบ: ยังไม่ snapshot (orchestrator ทำ) · ขอบเขต R13.01–R13.29 (หยุดก่อนส่วน F)
> ผล: ✅ 21 / ⚠️ 7 / ❌ 1 (บั๊กใหม่ 2 ตัว) / ❓ 0 — ค่าเงินหลักตรง golden ทุกตัว
> สคริปต์: `uat/bin/r13/` (log `uat/bin/r13/run.log`) · ไฟล์ดาวน์โหลด: `uat/fixtures/downloads-R13/` · ภาพ: `uat/shots/R13/`

## ตารางสรุป

| ขั้น | ผล | ค่าที่เห็น vs คาด |
|---|---|---|
| R13.01 mgr.in คลังเฉพาะทีม | ✅ | ทรัพย์ทีม A ทั้ง 3 เครื่องอยู่ใน LOT-2569-003 (handed_over จึงไม่อยู่ในแท็บรับเข้า/ในคลัง) · เห็นเฉพาะ LOT-003 · ไม่มีปุ่มรับเข้า/สร้างล็อต/ยืนยัน (มีแค่ ดูรายการ/เอกสาร) |
| R13.02 sup.in | ✅ | เหมือน R13.01 |
| R13.03 mgr.out | ✅ | เห็นเฉพาะ LOT-2569-004 (1 เครื่อง UAT-CO2-005) |
| R13.04 probe ข้ามทีม | ⚠️ | ข้ามทีมได้ **404** `ASSET_NOT_FOUND`/`LOT_NOT_FOUND` ("…อยู่นอกขอบเขตข้อมูลของคุณ") **ไม่ใช่ 403** ตามคาด · ไม่รั่ว IMEI/ชื่อลูกหนี้ · intake mgr.in = 403 `PERMISSION_DENIED` · sup.in list = 200 · 3 แถว (001/002/004) · in1 `/warehouse` → redirect `/dashboard` · fingerprint assets/lots ไม่เปลี่ยน · audit `access_denied` = 0 (ตามโค้ด: ลงเฉพาะ portal guard) |
| R13.05 บริหาร export ใบส่งมอบ | ❌ BUG-R13-01 | ดาวน์โหลด `LOT-2569-003.pdf` (DLV-2569-003 · วันที่ 04/10/2569 พ.ศ.) + `.xlsx` ได้ · ไม่มีปุ่มยืนยัน/แก้ · PATCH confirm = 403 · **audit `export` +0 (คาด +2)** |
| R13.06 ช่อง IMEI/Serial ตอนส่งเคส | ✅ | `35678910000O094` → เตือนเหลือง "ดูเหมือน IMEI ที่มีตัวอักษรปน — ตรวจอีกครั้ง" ไม่มี error แดง · ตัวคั่นช่องว่าง/ขีด และ `SN-ABC12345` ไม่เตือน · ไม่มี mutation · cases 10 → 10 |
| R13.07 มอบหมาย 901 → in1 | ✅ | toast สำเร็จ · แถวแสดง "มอบหมายเมื่อ 05/10/2569 23:14" · `case_assignments` +1 `pending_accept` · in1 ได้ `assignment.created` |
| R13.08 in1 รับงาน + เช็คอิน | ✅ | รับ 901 · จัดวัน 901/007 = 05/10/2569 · เช็คอิน 901 23:15:35 ก่อน 007 23:15:53 (วันไทย 2026-10-05) |
| R13.09 ปิดงาน 901 | ✅ | `closed_success` · ทรัพย์ `pending_intake` · commission 50000 `pending_warehouse_confirm` · toast "…คอมมิชชั่น ฿500.00" |
| R13.10 ปิดงาน 007 | ✅ | เหมือนกัน (สคริปต์จับ toast ไม่ทัน แต่ API close 200 + DB ถูก) |
| R13.11 ค่าที่พัก 800.00 + ดูใบเสร็จ | ⚠️ known | **probe 800.01 ถูกบันทึกได้** (expense hotel 80001 `pending_approval`) — ไม่บล็อกเกินเพดาน = เรื่องที่ `41` v2.11 บอกว่า "เพดานยังไม่บังคับ รอมติ PO" · ปุ่ม "ดูใบเสร็จ" เปิด modal รูปใบเสร็จ (download-url 200) ✅ · **แก้ข้อมูลผ่านหน้าจอ**: R13.19 ผู้จัดการตีกลับ → in1 แก้ยอดเป็น 800.00 แล้วส่งใหม่ ⇒ golden กลับมาที่ 80000 |
| R13.12 ADV5 | ✅ | `pending_approval` 50000 · เคลียร์ภายใน 12/10/2569 · การเงินได้ `advance.approval_requested` "…ยอด ฿500.00 · เคลียร์ภายใน 12/10/2569" |
| R13.13 settle รายวัน (dev) | ✅ | `settled 1 · expensesCreated 4` · fds in1 05/10: fuel 20000 / allowance 15000 / case_count 2 · ต่อเคส fuel 10000 + allowance 7500 `pending_warehouse_confirm` · สั่งซ้ำ → `duplicate: true` (job เดิม) · หมายเหตุ: body ใช้ `payload` (step sheet เขียน `params`) |
| R13.14 ยอดรวมทุกแท็บ | ✅ (ตามกฎ U27) | ตอนเล่นยังเป็นค่าที่พัก 800.01: รวมทุกแท็บ ฿2,150.01 = ผูกเคส ฿1,350.00 + เบิกแยก ฿800.01 (กล่อง "รอดำเนินการในแท็บนี้") · `pending_warehouse_confirm` ถูกนับเป็นรอดำเนินการ · ถ้า 800.00 จะเป็น ฿2,150.00 ตาม golden |
| R13.15 รับเข้า 901 | ✅ | ว่าง → ปุ่มกดได้แต่ขึ้น "ต้องกรอก IMEI ที่ตรวจจริง…" ไม่ยิง API · `35990100000901A`/16 หลัก → "IMEI ต้องเป็นตัวเลข 15 หลัก (เว้นวรรค ขีด หรือจุดคั่นได้)" ไม่มีเตือนซ้อน · `…012` → เตือนไม่ตรง + ปุ่ม "ยืนยันรับทั้งที่ IMEI ไม่ตรง" (ไม่กด) · `359901-000009-011` → "ตรงกับสัญญา" · ผล `in_custody` (สถานะจริงของระบบ) · `imei_actual 359901000009011` · รูป 7 · audit = `status_change` assets (ไม่มี action ชื่อ `intake`) |
| R13.16 รับเข้า 007 จุดคั่น | ✅ | `356789.100000.078` → ตรงสัญญา · `imei_actual 356789100000078` · 7 รูป |
| R13.17 คลังเฉพาะทีมหลังรับเข้า | ✅ | mgr.in: ในคลัง 2 (901 CO1 + 007 CO2) + LOT-003 3 = 5 · mgr.out: ในคลัง 0 + LOT-004 1 = 1 |
| R13.18 ล็อต 2 ใบ + confirm | ✅ | LOT-2569-005/DLV-2569-005 (CO1·901) · LOT-2569-006/DLV-2569-006 (CO2·007) · probe ผสม = 400 `MIXED_COMPANY_LOT` · ทั้งสอง `confirmed` · ทรัพย์ `handed_over` · 6 รายการ → `pending_approval` · revenue +0 · mgr.in ได้แจ้งเตือน 2 ข้อความ (ต่อล็อต): "…3 รายการ รวม ฿675.00 (เคส …)" · การเงินได้ `lot.confirmed` "ยังไม่เกิดรายได้…" |
| R13.19 แจ้งเตือน + อนุมัติขั้น 1 | ✅ | แจ้งเตือน mgr.in: ค่าที่พัก 1 รายการ ฿800.01 + 2 ข้อความล็อต ฿675.00 ต่อเหตุการณ์ = ตรง U49 · อนุมัติขั้น 1 ผูกเคส 6 รายการ · ตีกลับค่าที่พัก (ต้องมีเหตุผล) → `needs_revision` · in1 แก้เป็น 800.00 ส่งใหม่ → `pending_approval` 80000 → อนุมัติขั้น 1 · sup.in: `/finance` redirect dashboard + API 403 |
| R13.20 การเงินขั้น 2 + รายได้ | ✅ | 7 รายการ `approved` · รายได้ 901: gross **75000** VAT **5250** 7.00 SUCCESS_FEE exclude_vat · 007: gross **700000** VAT **49000** total 749000 FLAT include_vat · `ready_for_billing` · revenue_date 05/10 · ไม่มีรายได้ซ้ำต่อเคส · ⚠️ แจ้งเตือนขั้น 2 = 6 ข้อความแยก (1 ต่อการกดอนุมัติ — ไม่มีอนุมัติแบบกลุ่ม) |
| R13.21 ADV5 + U83 | ✅ | อนุมัติ 50000 `approved` · ปุ่ม "เคลียร์ยอด" ปิด title "ยังไม่ได้จ่ายเงินทดรองนี้ — เคลียร์ได้หลังจ่ายแล้ว" · API settle = 400 **`ADVANCE_IN_PENDING_PAYOUT`** · ADV5 ไม่เปลี่ยน |
| R13.22 รอบ UAT IN-R13a | ⚠️ (ตัวเลข ✅) | gross **265000** · WHT **4050** · สุทธิ **260950** · หักคืน ADV1 **55000** · ยอดโอน **205950** · preview มี "หักคืนเงินทดรอง ฿550.00 · ยอดโอน ฿2,059.50" · ต่างจาก sheet: สถานะ `checking` (ไม่ใช่ draft) · **8 รายการ** (sheet นับ 7 — commission 2 แถวถูกนับเป็น 1) · `advance_returns` **4 แถว** แบ่งตามรายการ (7275+9700+9700+28325 = 55000) ไม่ใช่ 1 แถว |
| R13.23 ยกเลิกรอบ | ✅ | ไม่มีเหตุผล → ปุ่มปิด + API 400 `CANCEL_REQUIRES_REASON` · ยกเลิกจริง → `cancelled` + cancelled_at/by/reason · 7 expense หลุด `payout_batch_item_id` · advance_returns 4 แถว `reversed_at` + reversal_reason · ADV1 แสดง "ค้าง ฿550.00" อีกครั้ง · ไม่มี 50 ทวิ ใหม่ · audit = `status_change` + reason (sheet คาด `cancel`) |
| R13.24 รอบ UAT IN-R13b | ✅ | ตัวเลขชุดเดิมทุกตัว · advance_returns active 4 แถว รวม 55000 (แถวเก่ายัง reversed) |
| R13.25 เคลียร์ ADV5 ระหว่างรอบค้าง | ✅ | ปุ่มปิด title `เงินทดรองนี้อยู่ในรอบจ่าย "UAT IN-R13b" ที่ยังไม่ยืนยันโอนเงิน — …` · API 400 `ADVANCE_IN_PENDING_PAYOUT` (+payoutBatchName) · ADV5 ยัง `approved` |
| R13.26 ไฟล์ธนาคาร + ใบสำคัญจ่าย | ❌ BUG-R13-02 (ตัวไฟล์ ✅) | `file_generated` · CSV `PB-IN-25691005-73E684C3095B-v1.csv` 5 แถวบัญชีเดียวกัน 201.75+72.75+800.00+485.00+500.00 = **2,059.50** (แยกแถวต่อรายการ ตามพฤติกรรมเดิม R6) · ใบสำคัญจ่าย: 2,650.00 / 40.50 / 2,609.50 / หักคืน ADV-3BDE18D7 (550.00) / จ่ายจริง **2,059.50** ✅ · **แต่ modal สร้างไฟล์ + toast แสดง "ยอดโอนสุทธิ ฿2,609.50"** · probe ยกเลิกไม่ติ๊ก → ปุ่มปิด + API 400 `PAYOUT_CANCEL_FILE_CONFIRM_REQUIRED` |
| R13.27 ยืนยันโอน | ✅ (+BUG-R13-02) | `completed` · **WHT-2569-017** 40(8) PND3 ฐาน 135000 WHT **4050** · สรุปนำส่ง ต.ค. ภ.ง.ด.3 **32550** online กำหนด **15/11/2569** (เหลือ 41 วัน) · ADV1 "คืนครบแล้ว" · probe ยกเลิก = 400 `PAYOUT_BATCH_ALREADY_PAID` · modal ยืนยัน/ toast แสดง "ยอดสุทธิที่โอน ฿2,609.50" (ควร 2,059.50) |
| R13.28 เคลียร์ ADV5 รับคืนแยก | ✅ | ใช้จริง 350.00 → ต้องคืน ฿150.00 · วิธี "รับคืนแยก (เงินสด/โอน)" · `cleared` used 35000 return 15000 `separate` |
| R13.29 บันทึกรับคืน ADV5 | ⚠️ | 200.00 → หน้าจอขึ้น "ยอดเกินยอดคืนค้าง" ปุ่มบันทึกปิด (ไม่ยิง API) · บันทึก 150.00 โอนเข้าบัญชีบริษัท → `advance_returns` +1 `bank_transfer` 15000 · 2026-10-05 · evidence + sha256 (64) · "คืนครบแล้ว" · audit create + note · **ยืนยัน code `ADVANCE_RETURN_EXCEEDS_OUTSTANDING` ทาง API ไม่ได้** เพราะหลังคืนครบ probe ได้ 400 `ADVANCE_INVALID_STATUS` (code มีใน catalog + unit test) |

## รายละเอียดที่ควรรู้

### เงิน — เทียบ golden
| รายการ | คาด | เห็น |
|---|---|---|
| รายได้ 901 | 75000 / VAT 5250 | 75000 / 5250 ✅ |
| รายได้ 007 | 700000 / VAT 49000 | 700000 / 49000 ✅ |
| รอบจ่าย gross / WHT / สุทธิ | 265000 / 4050 / 260950 | ✅ |
| หักคืน ADV1 / ยอดโอน | 55000 / 205950 | ✅ (CSV + ใบสำคัญจ่าย) |
| 50 ทวิ ใหม่ | WHT-2569-017 · 4050 | ✅ |
| ภ.ง.ด.3 ต.ค. | 32550 | ✅ |
| ADV5 | used 35000 · คืน 15000 แยก | ✅ |

### หลังบ้าน (counts ก่อน → หลัง)
advances 4→5 · advance_returns 0→9 (4 reversed + 4 active ADV1 + 1 ADV5) · assets 4→6 · handover_lots 2→4 · expenses 17→24 · expense_records 19→27 · field_day_settlements 3→4 · payout_batches 4→6 (IN-R13a cancelled, IN-R13b completed) · payout_batch_items 19→35 · revenues 4→6 · wht_certificates 16→17 · audit_logs 636→718 · notifications 63→91 (`uat/bin/r13/counts-*.txt`)

## 🐞 บั๊กที่พบ (ร่าง — เลขชั่วคราว)

| เลข | ระดับ | ขั้น | อาการ | คาด |
|---|---|---|---|---|
| BUG-R13-01 | S4 | R13.05 | ดาวน์โหลดใบส่งมอบ PDF (`GET /api/handover-lots/:id/pdf`) และ Excel (`/export-excel`) ไม่ลง audit เลย (0 แถว) — สองเส้นทางไม่มีการเรียก audit | audit `export` ต่อไฟล์ (+2) ระบุผู้ดาวน์โหลด — Rule 03 "export ต้อง trace กลับผู้สั่งงานได้" |
| BUG-R13-02 | S3 | R13.26/27 | รอบที่มีหักคืนเงินทดรอง: modal "สร้างไฟล์โอนเงินธนาคาร" (บรรทัด "ยอดโอนสุทธิ"), toast หลังสร้างไฟล์, modal "ยืนยันการจ่ายเงินสำเร็จ" ("ยอดสุทธิที่โอน") และ toast ยืนยัน แสดง **฿2,609.50** (สุทธิหลัง WHT) ทั้งที่ยอดโอนจริงในไฟล์/ใบสำคัญจ่าย = **฿2,059.50** | ทุกจุดที่เขียนว่า "ยอดโอน" ใช้ `transferSatang` (หลังหักคืน U30) — คนกดยืนยันเทียบกับยอดธนาคารแล้วจะไม่ตรง |

## ⚠️ ข้อสังเกต (ไม่ใช่บั๊กใหม่ / ให้ orchestrator ตัดสิน)
1. **R13.04** ข้ามทีมได้ 404 + ข้อความกลาง "…อยู่นอกขอบเขตข้อมูลของคุณ" แทน 403 — ไม่รั่วข้อมูล แต่ code ไม่ตรงค่าคาด (ควรปรับ step sheet หรือมีมติ)
2. **R13.11** เพดานค่าที่พักไม่บังคับ (800.01 ผ่าน) — known ตาม `41` v2.11 รอมติ PO · รอบนี้แก้ข้อมูลผ่านหน้าจอ (ตีกลับ → ส่งใหม่ 800.00) เพิ่มขึ้นมาจาก step sheet: audit `reject` 1 + `status_change` 1 · แจ้งเตือน `expense.rejected` ถึง in1
3. **R13.20** แจ้งเตือนขั้น 2 ไปหาการเงินแยก 6 ข้อความ (1 ต่อคลิกอนุมัติ) — ตรงกฎ "ต่อเหตุการณ์" แต่ส่งมากเมื่อผู้จัดการอนุมัติทีละแถว
4. **R13.22** step sheet ต้องแก้: สถานะเริ่ม `checking` · 8 รายการ · advance_returns แบ่งแถวต่อรายการ (ผลรวมถูก)
5. audit action ชื่อจริง: รับเข้าคลัง = `status_change` assets · ยกเลิกรอบจ่าย = `status_change` + reason · สร้างไฟล์โอน = `export` · ยืนยันโอน = `confirm`
6. dev trigger-job รับ key `payload` (step sheet เขียน `params`)

## ไฟล์ที่เกิดใน Supabase Storage (ข้อมูลตัวอย่าง — ห้ามลบ)
- หลักฐานปิดงาน `case-documents/cases/b976a24e-af0d-490c-a8be-e402f9b9ecd4/field_evidence/{photo/4070799b-…-R4-C1-photo.jpg, video/2843c8c4-…-R4-C1-video.mp4, product_photo/e601225c-…-R4-C1-product.jpg}` (901)
- หลักฐานปิดงาน `case-documents/cases/f476e94f-3375-425f-b6a7-0895e93f33a6/field_evidence/{photo/9eb8b286-…, video/17d20e14-…, product_photo/f276eed8-…}` (007)
- ใบเสร็จค่าที่พัก `expenses/88cb577d-32b4-49ff-96fb-06a2e093d339/receipts/b9af5370-b91a-4c32-9a1e-a49fffad7b95-R4-C1-photo.jpg` (ใช้งานอยู่)
- รูปรับเข้า 7 มุม ×2: `assets/395ac144-775b-4df9-baea-6cbe6bf7f5de/intake/*/…` (901) · `assets/9b94aed8-799c-46ce-b56d-8a1e60307f72/intake/*/…` (007)
- ใบเซ็นรับ `handover-lots/a7dd9315-80de-4cf8-9aae-b7dfef04e96b/signed-doc/7eeddfeb-810f-49f5-9433-661ab80bfbcf.pdf` (LOT-005) · `handover-lots/c4664422-d6b2-49c7-aa07-5abed0e0625e/signed-doc/40f2f843-47ef-458f-823c-028faf9fabcc.pdf` (LOT-006)
- สลิปรับคืน `advances/02221e05-4e8d-4e57-aa54-5d8cd8b557dd/returns/af1c85bc-6d7b-4059-89b6-8017448d43e7.jpg`
- ไฟล์โอน/PDF รอบจ่ายสร้างผ่าน API (`PB-IN-25691005-73E684C3095B-v1.csv`) — สำเนาในเครื่อง `uat/fixtures/downloads-R13/`

## สถานะฐานตอนจบ (พร้อมส่วน F)
- งวด ต.ค. 2569 = `collecting` · ไม่มีรายการเบิกของ in1 ค้างจ่าย · รอบ IN-R13b `completed`
- รายได้ใหม่ 2 แถว `ready_for_billing` (901 CO1 75000+5250 · 007 CO2 700000+49000) — พร้อมใช้ R13.31 วางบิล
- ADV1 คืนครบ (หักกลบ) · ADV5 `cleared` คืนครบ (รับแยก) · ADV3 in2 overdue ไม่แตะ
- ⇒ **พร้อมสำหรับส่วน F** (ไม่มีตัวบล็อก S1/S2)
