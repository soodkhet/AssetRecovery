# R5 — คลังสินค้า: รับเข้า C1/C2/C4/C5 → ล็อตบริษัท 1 (C1,C2,C4) + ล็อตบริษัท 2 (C5) → แนบเอกสาร → ยืนยันส่งมอบ (ธุรการ `uat.admin`)

> step sheet `uat/steps/R5.md` **v1** (R5.01–R5.24) · golden `uat/DATASET.md` v2 §R5 · ต้นรอบ = `R4-v2-end` · ปลายรอบ = `R5-end` (orchestrator snapshot)
> วันที่ทดสอบ: 03/10/2569 (พ.ศ.) 20:10–20:27 น. เวลาไทย · T0 (UTC) `2026-10-03 13:10:00+00`
> ผู้เล่น: role agent ผ่าน Playwright (Chrome headless · desktop 1440×900 · พนักงานจำลอง iPhone 14) · สคริปต์ `uat/bin/r5/s02-03 … s22.mjs` (log `uat/bin/r5/run.log`) · ภาพ `uat/shots/R5/*.png` (**55 ภาพ**) + `R5.13-DLV-2569-001.pdf` + `R5.13-LOT-2569-001.xlsx`
> **ผล: ✅ 24 step (ไม่มี step ล้ม) · 🐞 ยืนยันบั๊กที่สงสัย 4 ตัว (BUG-074…077) + บั๊กใหม่ 5 ตัว (S4 ×1, S5 ×4 — ไม่บล็อก) · ⚠️ 0 · ❓ 3**
> **ไม่มี 500 ตลอดรอบ** (pm2 error log ไม่ถูกเขียนตั้งแต่ 19:29) · console error มีแค่ 403 ของ API เติมตัวกรอง (R5-B03) · **probe ทุกตัวล้มก่อนทรานแซกชัน (ไม่มี 2xx)** · มติ ❓-R5-1 = ไม่กด "ยืนยันรับทั้งที่ IMEI ไม่ตรง"

## สรุปผลต่อ step

| Step | เรื่อง | ผล |
|---|---|---|
| R5.01 | baseline + fixture (19 ไฟล์ sha ตรง) | ✅ |
| R5.02 | ธุรการเปิดคลัง + กระดิ่ง | ✅ (C4 แจ้งซ้ำ = BUG-071 known) |
| R5.03 | probe หน้าจอ modal C1 (0 request) | ✅ + 🐞 BUG-074 (จอ) · 🐞 R5-B05 |
| R5.04 | probe API intake/reject 10 ตัว | ✅ + 🐞 BUG-074 (API h) · ❓ BUG-078 (g) |
| R5.05 | C1 รับเข้า 7 มุม + ดับเบิลคลิก | ✅ |
| R5.06 | C2 ตีกลับ → probe → ดูเหตุผล → รับใหม่ · กระดิ่ง in1 | ✅ + 🐞 BUG-075 |
| R5.07 | C4 รูปปลอม → ลบรูป → อุปกรณ์ขาดหาย · approver ตีกลับหลักฐานไม่ได้ | ✅ |
| R5.08 | C5 race รับเข้า 2 คำขอ | ✅ |
| R5.09 | แท็บในคลัง / วันที่ / รายละเอียดเครื่อง | ✅ + 🐞 BUG-077 |
| R5.10 | probe สร้างล็อต 8 ตัว (ไม่เผาเลข) | ✅ |
| R5.11 | ล็อต CO1 finance_pickup + ดับเบิลคลิก → LOT-2569-001 | ✅ |
| R5.12 | ล็อต CO2 we_deliver → LOT-2569-002 | ✅ |
| R5.13 | probe หลังมีล็อต + PDF/Excel | ✅ + 🐞 R5-B01, R5-B02 |
| R5.14 | ยืนยันโดยไม่แนบ → `LOT_MISSING_SIGNED_DOC` | ✅ |
| R5.15 | แนบใบเซ็นรับ ปลอม → v1 → v2 + probe 5 ตัว | ✅ |
| R5.16 | ยืนยันล็อต CO1 (ดับเบิลคลิก) — transaction 4 ขั้น | ✅ |
| R5.17 | probe หลังยืนยัน + modal เอกสาร | ✅ + 🐞 R5-B04 |
| R5.18 | ล็อต CO2 แนบไม่ครบ → `LOT_MISSING_DELIVERY_PROOF` → ครบ | ✅ |
| R5.19 | ยืนยันล็อต CO2 ด้วย race 2 context | ✅ |
| R5.20 | ผู้ใช้บริษัท CO1/CO2 scope | ✅ + 🐞 R5-B03 |
| R5.21 | การเงิน/บัญชี/บริหาร/ผู้จัดการ/หัวหน้าทีม/พนักงาน | ✅ + 🐞 BUG-076 · ❓ R5-Q3 |
| R5.22 | แจ้งเตือนทั้งรอบ = 3 แถว | ✅ |
| R5.23 | audit ทั้งรอบ = 17 แถว | ✅ |
| R5.24 | invariant ปลายรอบ | ✅ |

## ผลยืนยันจุดที่ต้องดูเป็นพิเศษ

| เรื่อง | ผล | step |
|---|---|---|
| ตรวจรูปฝั่ง server (Q13) | ✅ path ของเครื่องอื่น → `UPLOAD_PATH_OUT_OF_SCOPE` · ไฟล์ไม่มี → `UPLOAD_FILE_NOT_FOUND` · `R5-fake-photo.jpg` → 'ชนิดไฟล์ไม่รองรับ' ใน modal (asset ไม่เปลี่ยน audit 0) · photo_hashes 13 คีย์ sha ตรง `SHA256SUMS-R5.tsv` ทุกตัว | R5.04/05/07 |
| หลักฐานผ่านอัตโนมัติ (Q14) | ✅ C1/C2/C4(v2)/C5 → `approved` reviewed_by = ธุรการ ในทรานแซกชันเดียวกับรับเข้า · C4 v1 `rejected` ไม่แตะ · C3 `pending` · approver: `data-testid="evidence-approved"` 'ผ่านอัตโนมัติเมื่อคลังรับเครื่องเข้า — ตีกลับไม่ได้แล้ว' ไม่มีปุ่มตีกลับ · API → 400 `EVIDENCE_REJECT_AFTER_FINAL` | R5.05–08 |
| ดับเบิลคลิก รับเข้า / สร้างล็อต / ยืนยันล็อต | ✅ ทุกปุ่มส่ง **1 request** (ปุ่มล็อกตอน loading) · เลขล็อตไม่กระโดด | R5.05/11/16 |
| race รับเข้า C5 | ✅ A 200 · B 400 `ASSET_INVALID_STATUS` (ไม่ใช่ 500) · audit status_change 1 + approve 1 | R5.08 |
| race ยืนยันล็อต CO2 | ✅ A 200 · B 400 `LOT_ALREADY_CONFIRMED` · audit confirm 1 แถว · แจ้งเตือน 1 แถว | R5.19 |
| เลขล็อต (ไม่ recycle / probe ไม่เผาเลข) | ✅ probe 8 ตัวก่อนสร้าง → sequence ยังไม่ถูกสร้าง · หลังสร้าง 2 ล็อต `lot_seq = dlv_seq = 2` และหลัง probe R5.13 ก็ยัง 2 | R5.10–13 |
| เอกสารล็อตต่อเวอร์ชัน (ปิดหนี้ #1) | ✅ v1 `…/signed-doc/77e65b67….pdf` → v2 `…/signed-doc/97091b88….pdf` (uuid ใหม่) · audit แถวที่ 2 before = v1 path + hash · v1 ยังอยู่ใน bucket (probe d ได้ `UPLOAD_HASH_MISMATCH`) · หลัง confirmed แนบใหม่ → `LOT_ALREADY_CONFIRMED` | R5.15/17 |
| transaction ยืนยันล็อต (`44` §11) | ✅ ดูหัวข้อ R5.16/R5.19 — assets → `handed_over`, expenses 9 + 2 → `pending_approval`, revenue 0, audit confirm 1 แถวต่อล็อต | R5.16/19 |
| แจ้งเตือน lot.confirmed | ✅ ถึง `uat.finance` คนเดียว 2 แถว ('ยังไม่เกิดรายได้ในล็อตนี้ (รออนุมัติค่าตอบแทน)') ลิงก์ `/finance?tab=revenue` · ไม่ถึงบริหาร/บัญชี/ผู้ใช้บริษัท | R5.16/19/22 |
| scope บริษัท | ✅ ดู R5.20 — เห็นเฉพาะล็อต/เครื่องของบริษัทตัวเอง · นอก scope = 404 ข้อความเดียวกับ id สุ่ม · ฟิลด์ภายในเป็น null | R5.20 |

---

# คู่มือ — ธุรการทำงานคลังสินค้า (`uat.admin` สมใจ ธุรการดี)

ภาพรวมงานคลัง 4 ขั้น: **รับเข้าคลัง** (ตรวจ IMEI + สภาพ + รูป) → **นัดวันส่งมอบ** (สร้างล็อต 1 บริษัท/ล็อต) → **แนบเอกสาร** (ใบเซ็นรับ / หลักฐานจัดส่ง) → **ยืนยันส่งมอบ** (ปิดล็อต ปลดล็อกรายการเบิก)

## A. เตรียม

### R5.01 baseline + fixture
**ทำ**: ตรวจ sha ของ `uat/fixtures/files/R5-*` (19 ไฟล์) กับ `SHA256SUMS-R5.tsv` → ตรงทุกไฟล์ · รัน SQL มาตรฐาน
**ผลหลังบ้าน**: assets 4 แถว `pending_intake` (imei_actual NULL, photos 0) · handover_lots 0 · evidence C1/C2/C5 `pending`, C4 `rejected`+`pending`, C3 `pending` · expenses 18 (`pending_warehouse_confirm` 11 · `pending_approval` 4 · `superseded` 3) · revenues 0 — ตรงตาราง I ของ R4
**สถานะ**: ✅ ผ่าน

### R5.02 เปิดหน้าคลังสินค้า + ดูกระดิ่ง
**เมนู**: คลังสินค้า (`/warehouse`) — เมนูธุรการ 'แดชบอร์ด | จัดการเคส | คลังสินค้า | การตั้งค่า'
![](../shots/R5/R5.02-admin-warehouse.png)
**ผลบนจอ**: แท็บ 'รับเข้าคลัง 4 · ในคลัง 0 · รอส่งมอบ 0 · ส่งมอบแล้ว 0' · ตาราง 4 แถว (UAT-CO2-005 ทีม C / ประเสริฐ รับเหมา, UAT-CO1-004 ทีม A / บุญมี, UAT-CO1-002 และ UAT-CO1-001 ทีม A / อนันต์) ทุกแถว 'รอรับเข้าคลัง' สภาพ '—' วันปิดเคส `03/10/2569` ปุ่ม 'รับเข้าคลัง' + 'ตีกลับ' · **ไม่มี** UAT-CO2-003 (ปิดไม่สำเร็จ) และ UAT-CO2-007
![](../shots/R5/R5.02-admin-bell.png)
**กระดิ่ง**: 11 ยังไม่อ่าน · 'ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง' 5 แถว (C1 19:29, C2 19:30, C4 19:37, C5 19:39, C4 19:47 — C4 ซ้ำ = BUG-071 known)
**สถานะ**: ✅ ผ่าน

## B. ตรวจกติกาการรับเข้าก่อนทำจริง (ไม่มีข้อมูลเปลี่ยน)

### R5.03 ฟอร์ม 'รับเครื่องเข้าคลัง' ตรวจให้ก่อนส่ง
**เมนู**: แท็บ 'รับเข้าคลัง' → แถว UAT-CO1-001 → ปุ่ม 'รับเข้าคลัง' → modal 'รับเครื่องเข้าคลัง' ('ตรวจ IMEI → บันทึกสภาพ → ถ่ายรูปหลักฐาน 7 มุม')
**ทำ / ผลบนจอ** (นับ request ไป `/api/assets/*/intake` = **0** ตลอดขั้นนี้):
1. IMEI `356789100000011` ไม่เลือกสภาพ → 'ยืนยันรับเข้าคลัง' → กล่องแดง **'ยังไม่ได้เลือกสภาพเครื่อง'** (กล่องเขียว 'ตรงกับสัญญา' 'ตรวจแล้วตรงทุกช่อง — รับเข้าคลังได้เลย')
![](../shots/R5/R5.03-no-condition.png)
2. 'ปกติ' + IMEI 14 หลัก `35678910000001` → **'รูปแบบ IMEI ไม่ถูกต้อง'** 'IMEI ต้องเป็นตัวเลข 15 หลัก — ตรวจสอบที่กรอกอีกครั้ง' + ใต้ช่อง 'ต้องเป็นตัวเลข 15 หลัก' (พร้อมกล่องแดง 'IMEI ที่ตรวจจริงไม่ตรงกับสัญญา … ระบบบันทึกค่าที่ตรวจจริงไว้แล้วและรับเข้าคลังต่อได้' — ข้อความขัดกัน → 🐞 R5-B05)
![](../shots/R5/R5.03-imei14.png)
3. IMEI มีขีด `356789-100000011` → ช่องเหลือ `356789-10000001` (maxLength 15) + ข้อความรูปแบบผิดแบบเดียวกัน
![](../shots/R5/R5.03-imei-dash.png)
4. IMEI ไม่ตรง `356789100000999` → กล่องแดง 'IMEI ที่ตรวจจริงไม่ตรงกับสัญญา' → กดยืนยัน 1 ครั้ง → ไม่ยิง API · ข้อความ 'กด “ยืนยันรับทั้งที่ IMEI ไม่ตรง” อีกครั้งเพื่อรับเข้าคลัง — ระบบจะบันทึกค่าที่ตรวจจริงไว้' · ปุ่มเปลี่ยนเป็น **'ยืนยันรับทั้งที่ IMEI ไม่ตรง'** → **ไม่กดต่อ** (มติ ❓-R5-1)
![](../shots/R5/R5.03-imei-mismatch.png)
5. IMEI ถูก + 'ชำรุด' ไม่กรอกรายละเอียด (ปุ่มกลับเป็น 'ยืนยันรับเข้าคลัง') → **'ต้องระบุรายละเอียดสภาพเครื่อง'** + ป้าย 'รายละเอียดสภาพเครื่อง*'
![](../shots/R5/R5.03-damaged-no-note.png)
6. ล้างช่อง IMEI ให้ว่าง → **ไม่มีคำเตือนเรื่อง IMEI เลย** (กล่อง 'ตรงกับสัญญา'/'ไม่ตรง' หายทั้งคู่ เหลือแค่ error สภาพจากข้อ 5) → 'ยกเลิก'
![](../shots/R5/R5.03-imei-empty.png)
**ผลหลังบ้าน**: asset C1 ยัง `pending_intake`
**สถานะ**: ✅ ผ่าน (validation ฝั่งจอทำงาน) · 🐞 **BUG-074 ยืนยัน (ฝั่งจอ)** · 🐞 R5-B05

### R5.04 ตรวจกติกาทาง API (ทุกคำขอต้องล้ม)
**ทำ**: ธุรการยิง `POST /api/assets/<C1>/intake` ด้วย body ตั้งต้น `{imeiActual:'356789100000011', condition:'normal', photos:[]}` แล้วเปลี่ยนทีละข้อ
**ผล**:
| # | คำขอ | ได้ |
|---|---|---|
| a | IMEI 14 หลัก | 400 `REQUIRED_MISSING` fields.imeiActual 'IMEI ต้องเป็นตัวเลข 15 หลัก' |
| b | IMEI มีขีด | 400 `REQUIRED_MISSING` (ไม่ ignore dash ✔) |
| c | condition null | 400 `INTAKE_MISSING_CONDITION` |
| d | damaged + note ว่าง | 400 `INTAKE_MISSING_NOTE` |
| e | รูป path ของ C2 | 400 `UPLOAD_PATH_OUT_OF_SCOPE` |
| f | รูป path ไม่มีจริง | 400 `UPLOAD_FILE_NOT_FOUND` |
| g | IMEI เว้นวรรคหน้า + condition null | 400 **`INTAKE_MISSING_CONDITION`** (= Zod trim แล้วผ่าน → ❓ BUG-078) |
| h | IMEI null + condition null | 400 **`INTAKE_MISSING_CONDITION`** (= IMEI ว่างผ่าน Zod → BUG-074 ยืนยันฝั่ง API) |
| i | reject-intake เหตุผลช่องว่าง | 400 `REJECT_MISSING_REASON` |
| j | id สุ่ม | 404 `ASSET_NOT_FOUND` 'ไม่พบเครื่องที่ระบุ หรือเครื่องนี้อยู่นอกขอบเขตข้อมูลของคุณ' |
**ผลหลังบ้าน**: asset C1 ไม่เปลี่ยน · audit หลัง T0 = 0 แถว
**สถานะ**: ✅ ผ่าน · 🐞 BUG-074 · ❓ BUG-078

## C. รับเครื่องเข้าคลัง

### R5.05 รับเข้า C1 ครบ 7 มุม
**เมนู**: คลังสินค้า → แท็บ 'รับเข้าคลัง' → แถว UAT-CO1-001 → 'รับเข้าคลัง'
**ทำ**: ① IMEI ที่ตรวจจริง `356789100000011` (ขึ้นกล่องเขียว 'ตรงกับสัญญา') → ② 'ปกติ' → ③ แนบรูปทีละช่อง ด้านหน้า/ด้านหลัง/ด้านบน/ด้านล่าง/ด้านซ้าย/ด้านขวา/IMEI บนเครื่อง (แต่ละช่องเปลี่ยน 'ยังไม่ถ่าย' → 'ถ่ายแล้ว' + ปุ่ม 'ลบรูป' · คำเตือน 'รูปยังไม่ครบทุกมุม' หายเมื่อครบ 7) → **ดับเบิลคลิก** 'ยืนยันรับเข้าคลัง'
![](../shots/R5/R5.05-c1-photos.png)
![](../shots/R5/R5.05-c1-done.png)
**ผลบนจอ**: toast เขียว **'รับเครื่องเข้าคลังแล้ว' 'UAT-CO1-001 · Samsung Galaxy A55'** · แถวหาย · 'รับเข้าคลัง 3 · ในคลัง 1'
**ผลหลังบ้าน**: POST intake **1 ครั้ง** (ดับเบิลคลิกไม่หลุด) · asset `in_custody` imei_actual `356789100000011` condition `normal` photos 7 (`assets/c7d95a2c…/intake/<มุม>/<uuid>-R5-C1-intake-<มุม>.png`) photo_hashes 7 คีย์ sha ตรง fixture · evidence C1 → `approved` (reviewed_by ธุรการ) · expenses C1 ยัง `pending_warehouse_confirm` · audit 2 แถว: `status_change` assets (imeiMatch true, photosCount 7, evidenceApprovedId, events `["asset.intake"]`) + `approve` case_evidences reason 'หลักฐานปิดงานผ่านอัตโนมัติ — คลังรับเครื่องเข้าแล้ว' · ไม่มีแจ้งเตือน
**สถานะ**: ✅ ผ่าน

### R5.06 ตีกลับ C2 → ดูเหตุผล → รับใหม่
**ทำ 1**: แถว UAT-CO1-002 → 'รับเข้าคลัง' → IMEI `356789100000999` → เห็นกล่อง IMEI ไม่ตรง → **'ยกเลิก'** → ปุ่ม 'ตีกลับ' → modal 'ตีกลับ — ไม่รับเครื่องเข้าคลัง' (กล่อง 'ตีกลับ = ไม่รับเข้าคลัง' · 'IMEI ที่บันทึกไว้ (ไม่ได้บันทึก)') → 'ยืนยันตีกลับ' ว่าง → **'ต้องระบุเหตุผลที่ตีกลับ'** (ไม่มี request) → กรอก 'IMEI บนเครื่อง 356789100000999 ไม่ตรงกับสัญญา 356789100000029 — ให้พนักงานตรวจเครื่องอีกครั้ง' → 'ยืนยันตีกลับ'
![](../shots/R5/R5.06-c2-rejected.png)
**ผล 1**: toast 'ตีกลับเครื่องแล้ว' 'UAT-CO1-002' · แถวสถานะ 'ตีกลับ' ปุ่ม 'ดูเหตุผล' + 'รับใหม่' · asset `intake_rejected` reject_reason ตรง rejected_by = ธุรการ · **imei_actual NULL** · audit `reject` after `{"imeiActual": null, "imeiContract": "356789100000029", …}` (BUG-075) · evidence ยัง `pending` · แจ้งเตือน 1 แถวถึง `uat.agent.in1` 'คลังตีกลับการรับเข้า' link `/field/closed`
**ทำ 2 (probe)**: ตีกลับซ้ำ → 400 `ASSET_INVALID_STATUS` · สร้างล็อตที่มี C2 → 400 `ASSET_NOT_IN_CUSTODY` (assetIds=[C2]) · handover_lots 0, sequence ยังไม่มี
**ทำ 3**: 'ดูเหตุผล' → modal 'เหตุผลที่ตีกลับ' แสดงเหตุผล + **'ตีกลับเมื่อ 03/10/2569 20:13'** + 'IMEI ที่พบ (ไม่ได้บันทึก)' → 'ปิดหน้าต่าง'
![](../shots/R5/R5.06-c2-reason.png)
**ทำ 4**: 'รับใหม่' → title **'รับเครื่องเข้าคลังอีกครั้ง'** → IMEI `356789100000029` → 'ปกติ' → แนบด้านหน้า + IMEI บนเครื่อง → คำเตือน 'ยังไม่ได้ถ่ายอีก 5 มุม (แนะนำให้ครบ 7 มุม) — รับเข้าคลังต่อได้' (ไม่บล็อก) → 'ยืนยันรับเข้าคลัง'
![](../shots/R5/R5.06-c2-retry-done.png)
**ผล 4**: toast 'รับเครื่องเข้าคลังอีกครั้งแล้ว' 'UAT-CO1-002 · iPhone 15 128GB' · asset `in_custody` photos 2 hashed 2 · reject_reason/rejected_at/rejected_by → NULL · evidence C2 `approved` · audit `status_change` events `["asset.intake_retry","asset.intake"]` + `approve`
**กระดิ่ง in1** (มือถือ): 'คลังตีกลับการรับเข้า' 'เคส UAT-CO1-002 — IMEI บนเครื่อง … ' 'คลังสินค้า · 03/10/2569 20:13' → คลิกไป `/field/closed` (ไม่ 404)
![](../shots/R5/R5.06-in1-bell.png)
**สถานะ**: ✅ ผ่าน · 🐞 **BUG-075 ยืนยัน**

### R5.07 C4 — รูปปลอมถูกปัด → ลบรูป → รับเข้าสภาพ "อุปกรณ์ขาดหาย"
**ทำ 1**: แถว UAT-CO1-004 → IMEI `356789100000045` → 'อุปกรณ์ขาดหาย' → รายละเอียด 'ไม่มีกล่องและสายชาร์จ ตัวเครื่องปกติ' → ช่อง 'ด้านหน้า' แนบ `R5-fake-photo.jpg` (ป้าย 'ถ่ายแล้ว') → 'ยืนยันรับเข้าคลัง'
![](../shots/R5/R5.07-c4-fake-rejected.png)
**ผล 1**: กล่องแดงใน modal **'ชนิดไฟล์ไม่รองรับ'** 'เนื้อไฟล์ไม่ตรงกับชนิดที่ช่องนี้รับ …' · modal ไม่ปิด · asset ยัง `pending_intake` · audit 0
**ทำ 2**: ช่อง 'ด้านหน้า' → ปุ่ม **'ลบรูป'** (ป้ายกลับเป็น 'ยังไม่ถ่าย') → แนบ `R5-C4-intake-front.png` + IMEI บนเครื่อง `R5-C4-intake-imei.png` → 'ยืนยันรับเข้าคลัง'
> หมายเหตุการรัน: สคริปต์รอบแรกล้มตอนหาปุ่ม 'ลบรูป' (ช่อง file input ได้ชื่อ 'ลบรูป' จาก label ที่ครอบ — a11y) จึงเปิด modal ใหม่แล้วทำข้อ 1 ซ้ำถึงขั้นแนบรูปปลอม (ไม่กดยืนยัน) → ลบรูป → แนบรูปจริง ⇒ รูปปลอมค้างใน bucket **2 ไฟล์**
![](../shots/R5/R5.07-c4-done.png)
**ผล 2**: toast 'รับเครื่องเข้าคลังแล้ว' 'UAT-CO1-004 · iPad Air M2' · asset `in_custody` condition `partial_loss` condition_note ตรง photos 2 (**ไม่มี path รูปปลอม**) · evidence แถว v2 (19:47) → `approved` · v1 `rejected` ไม่เปลี่ยน · audit 2 แถว
**ทำ 3** (`uat.approver`): จัดการเคส → รับเคส → กรอง 'ปิดงานสำเร็จ' → UAT-CO1-004 'ดูรายละเอียด'
![](../shots/R5/R5.07-approver-no-reject.png)
**ผล 3**: กล่อง 'หลักฐานชุดนี้ผ่านแล้ว' 'ผ่านอัตโนมัติเมื่อคลังรับเครื่องเข้า — ตีกลับไม่ได้แล้ว' '03/10/2569 20:14' · `evidence-approved` = 1 · ปุ่ม 'ตีกลับหลักฐานปิดงาน' = 0 (เหมือนกันที่ C1) · API reject-evidence C4/C1 → 400 **`EVIDENCE_REJECT_AFTER_FINAL`**
**สถานะ**: ✅ ผ่าน

### R5.08 C5 — กดรับเข้าพร้อมกัน 2 ที่ (race)
**ทำ**: context A กรอก C5 (IMEI `356789100000052`, ปกติ, 2 รูป) · ดักคำขอแล้วให้ context B (ธุรการ session ใหม่) ยิง body เดียวกันพร้อมกัน → A กด 'ยืนยันรับเข้าคลัง'
![](../shots/R5/R5.08-c5-race.png)
**ผล**: A 200 toast 'รับเครื่องเข้าคลังแล้ว' 'UAT-CO2-005 · vivo V30' · B 400 `ASSET_INVALID_STATUS` · asset `in_custody` photos 2 · evidence `approved` 1 ครั้ง · audit status_change 1 + approve 1 · แท็บ 'รับเข้าคลัง 0 · ในคลัง 4'
**สถานะ**: ✅ ผ่าน

### R5.09 ดูเครื่องในคลัง
**เมนู**: แท็บ 'ในคลัง' → การ์ดบริษัท → ปุ่ม 'ดู'
![](../shots/R5/R5.09-custody-cards.png)
**ผลบนจอ**: แท็บรับเข้าคลังว่าง 'ไม่มีเครื่องรอรับเข้าคลัง' · การ์ด 'บริษัท ยูเอที ลิสซิ่ง จำกัด 3 เครื่องทั้งหมด พร้อมส่ง 3 · 2 ปกติ · 1 อุปกรณ์ขาดหาย' + 'บริษัท ยูเอที แคปปิตอล จำกัด 1 · พร้อมส่ง 1'
![](../shots/R5/R5.09-custody-co1.png)
**drill ลิสซิ่ง**: '3 เครื่องในคลัง · พร้อมส่ง 3 · อยู่ในล็อตแล้ว 0' · คอลัมน์ 'วันที่รับเข้า' = **`03/10/2569` ไม่มีเวลา** (BUG-077) · ไม่มีเครื่องบริษัทอื่นให้เลือก
![](../shots/R5/R5.09-asset-detail.png)
**modal 'ข้อมูลเครื่องในคลัง'**: 'วันที่รับเข้า 03/10/2569 20:12' · IMEI ที่ตรวจจริง · สภาพ · 'รูปหลักฐาน (7)' เป็นปุ่มตามมุม → กด 'ด้านหน้า' เปิด viewer (signed URL → 200 image/png)
![](../shots/R5/R5.09-photo-front.png)
**ผลหลังบ้าน**: evidence C1/C2/C4v2/C5 `approved` · C4v1 `rejected` · C3 `pending` · expenses เหมือน R5.01 · revenues 0
**สถานะ**: ✅ ผ่าน · 🐞 **BUG-077 ยืนยัน**

## D. นัดวันส่งมอบ (สร้างล็อต)

### R5.10 ตรวจกติกาการสร้างล็อตทาง API (ห้ามเผาเลข)
| # | body | ได้ |
|---|---|---|
| a | assetIds [] | 400 `EMPTY_LOT` |
| b | [C1, C5] | 400 `MIXED_COMPANY_LOT` foundCompanyIds=[CO2] |
| c | [C5] ในล็อต CO1 | 400 `MIXED_COMPANY_LOT` |
| d | id สุ่ม | 404 `ASSET_NOT_FOUND` |
| e | [C1, C1] | 400 `REQUIRED_MISSING` 'เลือกเครื่องซ้ำกัน' |
| f | we_deliver ไม่มีที่อยู่ | 400 `REQUIRED_MISSING` fields.deliveryAddr |
| g | ปี พ.ศ. 2569 | 400 `REQUIRED_MISSING` fields.scheduledAt 'ปีของวันเวลาต้องเป็น ค.ศ. …' |
| h | `uat.co1.mgr` | 403 `PERMISSION_DENIED` |
**ผลหลังบ้าน**: handover_lots 0 · `seq_handover_lot_2569` ยังไม่ถูกสร้าง · assets 4 `in_custody` lot_id NULL · audit 0
**สถานะ**: ✅ ผ่าน

### R5.11 ล็อตบริษัท 1 แบบ "ไฟแนนซ์มารับที่คลัง"
**เมนู**: แท็บ 'ในคลัง' → การ์ด 'บริษัท ยูเอที ลิสซิ่ง จำกัด' → checkbox 'เลือกทุกเครื่องที่พร้อมส่ง' → ปุ่ม 'นัดวันส่งมอบ (3)' (ก่อนเลือก disabled)
**ทำ**: modal 'นัดวันส่งมอบ — บริษัท ยูเอที ลิสซิ่ง จำกัด' '3 เครื่อง · 1 ล็อต = 1 บริษัทไฟแนนซ์เสมอ' → ก่อนเลือกรูปแบบ ปุ่ม 'บันทึกการนัด' disabled + 'เลือกรูปแบบการส่งมอบก่อน…' → '🏢 ไฟแนนซ์มารับที่คลัง' → กดบันทึกตอนวันว่าง → **'ต้องระบุวันนัดรับ'** → 'วันเวลานัดรับ' 03/10/2569 19:46 (เวลาไทย −30 นาที) → ผู้ประสานงาน 'คุณวิภา ฝ่ายติดตามทรัพย์ (UAT)' → หมายเหตุ 'UAT R5 ล็อตบริษัท 1' → 'ดูตัวอย่างใบส่งมอบ' (วันนัดรับ 03/10/2569 19:46 · วันที่พิมพ์ร่าง 03/10/2569 — พ.ศ. ทั้งหมด) → **ดับเบิลคลิก** 'บันทึกการนัด'
![](../shots/R5/R5.11-no-datetime.png)
![](../shots/R5/R5.11-preview.png)
![](../shots/R5/R5.11-lot1-created.png)
**ผลบนจอ**: toast **'สร้างล็อต LOT-2569-001 แล้ว' '3 เครื่อง · ใบส่งมอบ DLV-2569-001 · ไปต่อที่แท็บ “รอส่งมอบ”'** · แท็บ 'รอส่งมอบ 1' การ์ด '🏢 ไฟแนนซ์มารับ · รอแนบใบเซ็นรับ · ⏳ ใบส่งมอบที่มีลายเซ็นผู้รับ รอแนบ · นัดรับ: 03/10/2569 19:46' · การ์ดในคลัง 'พร้อมส่ง 0 · อยู่ในล็อต 3' checkbox disabled title 'อยู่ในล็อตส่งมอบแล้ว'
![](../shots/R5/R5.11-custody-after.png)
**ผลหลังบ้าน**: POST 1 ครั้ง (201) · lot `LOT-2569-001`/`DLV-2569-001` `finance_pickup` `pending_attach` CO1 scheduled_at 12:46 UTC (= 19:46 ไทย) · C1/C2/C4 `handover_pending` · audit `create` events `["lot.created"]` assetIds 3 · seq 1/1
**สถานะ**: ✅ ผ่าน

### R5.12 ล็อตบริษัท 2 แบบ "เราจัดส่งไปให้"
**ทำ**: การ์ด 'บริษัท ยูเอที แคปปิตอล จำกัด' → 'เลือก UAT-CO2-005' → 'นัดวันส่งมอบ (1)' → '🚚 เราจัดส่งไปให้' → 'กำหนดวันเวลาจัดส่ง' 03/10/2569 20:08 → ที่อยู่ (ค่าตั้งต้น '88 ถนนงามวงศ์วาน ตำบลบางกระสอ อำเภอเมืองนนทบุรี นนทบุรี 11000') ลบให้ว่าง → 'บันทึกการนัด' → **'ล็อตแบบ "เราจัดส่งไปให้" ต้องระบุที่อยู่จัดส่ง'** (ไม่มี request) → กรอก '99 อาคารยูเอที ถ.วิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร 10900' → เลขพัสดุ 'TH-UAT-R5-0001' → 'บันทึกการนัด'
![](../shots/R5/R5.12-addr-required.png)
![](../shots/R5/R5.12-lot-co2.png)
**ผล**: toast **'สร้างล็อต LOT-2569-002 แล้ว' '1 เครื่อง · ใบส่งมอบ DLV-2569-002 · ไปต่อที่แท็บ “ส่งมอบแล้ว”'** · เด้งไปแท็บ **'ส่งมอบแล้ว 1'** การ์ด 'รอแนบหลักฐานจัดส่ง · ⏳ ใบส่งมอบที่มีลายเซ็นผู้รับ รอแนบ · ⏳ หลักฐานส่งพัสดุ / Delivered รอแนบ · กำหนดส่ง: 03/10/2569 20:08' · DB `pending_delivery_proof` `we_deliver` delivery_addr/tracking_no ตรง · C5 `handover_pending` · seq 2/2
**สถานะ**: ✅ ผ่าน

### R5.13 ตรวจหลังมีล็อต + ใบส่งมอบ PDF / Excel
**probe**: สร้างล็อตซ้ำด้วย C1 → 400 `ASSET_ALREADY_IN_LOT` lotNumbers `["LOT-2569-001"]` · C5 → `["LOT-2569-002"]` · ตีกลับ C1 → `ASSET_INVALID_STATUS` · seq ยัง 2/2
**หน้าจอ**: แท็บ 'รอส่งมอบ' → 'ดูรายการ' → '← กลับไปหน้ารวมล็อต' · 'LOT-2569-001 รอแนบใบเซ็นรับ' · '🏢 ไฟแนนซ์มารับ · ใบส่งมอบ DLV-2569-001 · 3 เครื่อง' · ลิงก์ 'Export Excel' / 'ใบส่งมอบ PDF' / ปุ่ม 'แนบเอกสาร & ยืนยัน' · ตาราง 3 เครื่อง
![](../shots/R5/R5.13-lot1-detail.png)
**PDF** `GET …/pdf` = 200 application/pdf `LOT-2569-001.pdf` · Excel = 200 xlsx (DLV-2569-001, วันที่ 03/10/2569, IMEI ตรวจจริง '—' เมื่อตรง, หมายเหตุสภาพ C4)
![](../shots/R5/R5.13-DLV-2569-001-pdf.png)
**ผล PDF**: 'เลขที่: DLV-2569-001 · เลขล็อต LOT-2569-001 · วันที่ 03/10/2569' (พ.ศ.) · แต่ชื่อผู้รับมอบตัวหนาแสดง **'บริษัท ยูเอที ลิสซิ่ง จำกั'** (ตัวท้าย 'ด' หาย → 🐞 R5-B01) · ไม่มีวันนัดรับซึ่งตัวอย่างใบส่งมอบแสดง (🐞 R5-B02)
**สถานะ**: ✅ ผ่าน · 🐞 R5-B01, R5-B02

## E. แนบเอกสาร + ยืนยันส่งมอบ

### R5.14 ยืนยันไม่ได้ถ้ายังไม่แนบใบเซ็นรับ
**ทำ**: การ์ด LOT-2569-001 → 'แนบเอกสาร' → modal 'แนบใบเซ็นรับ — LOT-2569-001' ('ต้องการเอกสารชิ้นเดียว: ใบส่งมอบที่มีลายเซ็นผู้รับ …')
![](../shots/R5/R5.14-confirm-disabled.png)
**ผล**: ปุ่ม 'ยืนยันส่งมอบสำเร็จ' **disabled** · API `PATCH …/confirm {}` → 400 **`LOT_MISSING_SIGNED_DOC`** · lot ยัง `pending_attach` · assets/expenses ไม่เปลี่ยน · audit 0
**สถานะ**: ✅ ผ่าน

### R5.15 แนบใบเซ็นรับ: ไฟล์ปลอม → v1 → v2
**ทำ 1**: ช่อง '① ใบส่งมอบที่มีลายเซ็นผู้รับ *' → 'เลือกไฟล์' `R5-fake-signed.pdf` → toast แดง **'แนบไฟล์ไม่สำเร็จ'** 'เนื้อไฟล์ไม่ตรงกับชนิดที่ช่องนี้รับ …' · ช่องยัง 'เลือกไฟล์' · DB signed_doc_url NULL
![](../shots/R5/R5.15-fake-signed.png)
**ทำ 2**: แนบ `R5-LOT-CO1-signed-v1.pdf` → 'แนบแล้ว ✅' + 'แนบไฟล์ใหม่แทน' + 'ดูไฟล์ที่แนบ' (เปิด viewer 'ใบส่งมอบที่มีลายเซ็นผู้รับ' 'เปิดในแท็บใหม่' 'ปิดหน้าต่าง')
![](../shots/R5/R5.15-v1-attached.png)
![](../shots/R5/R5.15-v1-view.png)
→ DB `…/signed-doc/77e65b67-….pdf` hash `c2f53e93…` ตรง · audit `update` before fileUrl NULL
**ทำ 3**: 'แนบไฟล์ใหม่แทน' `R5-LOT-CO1-signed-v2.pdf` → DB `…/signed-doc/97091b88-….pdf` (uuid ใหม่) hash `bdc13b27…` · audit แถวใหม่ before = v1 path + hash v1
![](../shots/R5/R5.15-v2-attached.png)
**ทำ 4 (probe `POST …/documents`)**: path ล็อตอื่น → `UPLOAD_PATH_OUT_OF_SCOPE` · โฟลเดอร์ผิดชนิด → `UPLOAD_PATH_OUT_OF_SCOPE` · ไฟล์ไม่มี → `UPLOAD_FILE_NOT_FOUND` · V1 + hash ผิด → **`UPLOAD_HASH_MISMATCH`** (v1 ยังอยู่จริง) · `uat.co1.mgr` → 403 · signed_doc_url ยังชี้ v2
**สถานะ**: ✅ ผ่าน

### R5.16 ยืนยันส่งมอบล็อตบริษัท 1
**เมนู**: รายละเอียดล็อต → 'แนบเอกสาร & ยืนยัน'
**ทำ**: ช่อง ① 'แนบแล้ว ✅' · 'วันเวลาที่ผู้รับมารับจริง' คงค่าตั้งต้น (2026-10-03T20:21) · อ่านกล่อง 'เมื่อยืนยันแล้ว ระบบจะทำให้ทันทีในทรานแซกชันเดียว' + 'ล็อตที่ยืนยันแล้วแก้ไขไม่ได้ทุกกรณี' → **ดับเบิลคลิก** 'ยืนยันส่งมอบสำเร็จ'
![](../shots/R5/R5.16-lot1-confirmed.png)
**ผลบนจอ**: toast **'ยืนยันส่งมอบ LOT-2569-001 แล้ว' 'เครื่อง 3 เครื่องส่งมอบแล้ว · ปลดล็อกรายการเบิก 9 รายการ'** · 'รอส่งมอบ 0' ('ไม่มีล็อตในแท็บ “รอส่งมอบ”') · แท็บ 'ส่งมอบแล้ว' การ์ด 'ยืนยันแล้ว · ✅ ใบส่งมอบที่มีลายเซ็นผู้รับ แนบแล้ว · นัดรับ 03/10/2569 19:46 · ส่งมอบจริง: 03/10/2569 20:21 · ยืนยัน: 03/10/2569 20:21' ปุ่ม 'ดูรายการ' + 'เอกสาร'
**ผลหลังบ้าน** (PATCH 1 ครั้ง):
- lot1 `confirmed` confirmed_by ธุรการ · confirmed_at 13:21:43 UTC · delivered_at 13:21 · signed_doc_hash = v2
- ① assets C1/C2/C4 **`handed_over`**
- ② expenses C1/C2/C4 ใหม่ **9 แถว → `pending_approval`** · superseded 3 ไม่เปลี่ยน · C5 ยัง `pending_warehouse_confirm`
- ④ **revenues = 0** (revenueIdsCreated `[]`, revenueEligibleCaseIds `[]`)
- ③ audit `confirm` **1 แถว** assetIdsHandedOver 3 · expenseIdsUnlocked 9 · events `["lot.doc_attached","lot.confirmed"]`
- แจ้งเตือน 1 แถวถึง `uat.finance` 'ยืนยันส่งมอบล็อตแล้ว' 'LOT-2569-001 · บริษัท ยูเอที ลิสซิ่ง จำกัด · 3 เครื่อง — ยังไม่เกิดรายได้ในล็อตนี้ (รออนุมัติค่าตอบแทน)' `/finance?tab=revenue`
**สถานะ**: ✅ ผ่าน

### R5.17 ล็อตที่ยืนยันแล้วแก้ไม่ได้
**probe**: confirm ซ้ำ → `LOT_ALREADY_CONFIRMED` · แนบเอกสาร (V1) → `LOT_ALREADY_CONFIRMED` · สร้างล็อตด้วย C1 → `ASSET_ALREADY_IN_LOT` · intake C1 → `ASSET_INVALID_STATUS` (status handed_over)
**หน้าจอ**: การ์ด LOT-2569-001 ปุ่มเหลือ 'ดูรายการ' + 'เอกสาร' → modal 'เอกสารที่แนบ — LOT-2569-001' ('เลขที่ใบส่งมอบ DLV-2569-001' · 'ส่งมอบจริง 03/10/2569 20:21' · 'ยืนยันเมื่อ 03/10/2569 20:21 · สมใจ ธุรการดี' · ① แสดงเป็น path `handover-lots/dc03…/signed-doc/97091b88….pdf` (🐞 R5-B04) · 'เปิดดู / ดาวน์โหลด' · 'ปิด') · รายละเอียดล็อตเหลือ 'Export Excel' / 'ใบส่งมอบ PDF' / 'ดูเอกสารแนบ' (ไม่มี 'แนบเอกสาร & ยืนยัน')
![](../shots/R5/R5.17-lot1-docs.png)
![](../shots/R5/R5.17-lot1-detail.png)
**ผลหลังบ้าน**: lot1 ไม่เปลี่ยน · audit ไม่เพิ่ม
**สถานะ**: ✅ ผ่าน · 🐞 R5-B04

### R5.18 ล็อตบริษัท 2 — ต้องมี 2 เอกสาร
**ทำ**: แท็บ 'ส่งมอบแล้ว' → การ์ด LOT-2569-002 'แนบเอกสาร' → modal 'แนบหลักฐานจัดส่ง — LOT-2569-002' → ช่อง ① แนบ `R5-LOT-CO2-signed.pdf` → ปุ่มยืนยันยัง **disabled** → ปิด → API confirm → 400 **`LOT_MISSING_DELIVERY_PROOF`** → เปิดใหม่ (① ยัง 'แนบแล้ว ✅') → ช่อง '② หลักฐานส่งพัสดุ / Delivered *' แนบ `R5-LOT-CO2-delivery-proof.png` → ปุ่มยืนยัน **enabled**
![](../shots/R5/R5.18-lot2-signed-only.png)
![](../shots/R5/R5.18-lot2-docs-ready.png)
**ผล**: signed_doc_hash `5e644a29…` · delivery_proof_url `…/delivery-proof/d897d801….png` hash `30073ebe…` · audit `update` 2 แถว · lot ยัง `pending_delivery_proof`
**สถานะ**: ✅ ผ่าน

### R5.19 ยืนยันล็อตบริษัท 2 พร้อมกัน 2 ที่ (race)
**ทำ**: context A กด 'ยืนยันส่งมอบสำเร็จ' · context B ยิง PATCH confirm body เดียวกันพร้อมกัน
![](../shots/R5/R5.19-lot2-race.png)
![](../shots/R5/R5.19-delivered-tab.png)
**ผล**: A 200 toast **'ยืนยันส่งมอบ LOT-2569-002 แล้ว' 'เครื่อง 1 เครื่องส่งมอบแล้ว · ปลดล็อกรายการเบิก 2 รายการ'** · B 400 `LOT_ALREADY_CONFIRMED` · lot2 `confirmed` · C5 `handed_over` · fuel 550000 + commission 100000 → `pending_approval` · revenues 0 · audit confirm lot2 **1 แถว** (expenseIdsUnlocked 2, revenueIdsCreated []) · แจ้งเตือน 1 แถวถึง `uat.finance` 'LOT-2569-002 · บริษัท ยูเอที แคปปิตอล จำกัด · 1 เครื่อง — …' · แท็บ 'ในคลัง 0 · ส่งมอบแล้ว 2'
**สถานะ**: ✅ ผ่าน

## F. สิทธิ์ / scope

### R5.20 ผู้ใช้บริษัท
| ผู้ใช้ | บนจอ | API |
|---|---|---|
| `uat.co1.mgr` | แท็บ 'รับเข้าคลัง 0 · ในคลัง 0 · รอส่งมอบ 0 · ส่งมอบแล้ว 1' (LOT-2569-001 เท่านั้น) · รายละเอียดล็อตมีแค่ 'ดูเอกสารแนบ' — ไม่มีปุ่ม action ใด ๆ ไม่มีลิงก์ Export Excel / PDF · ตัวกรองบริษัทมีแค่ 'ทุกบริษัทไฟแนนซ์' (รายการบริษัทโหลดไม่ได้ — R5-B03) | lots = 1 (CO1) · LOT2 → 404 `LOT_NOT_FOUND` · C5 → 404 `ASSET_NOT_FOUND` · C1 → 200 แต่ imeiActual/teamName/agentName/rejectReason/conditionNote = null · pdf / xlsx / documents / confirm / intake → 403 |
| `uat.co2.admin` | 'ส่งมอบแล้ว 1' (LOT-2569-002 เท่านั้น) · ไม่มีปุ่ม action | LOT1 → 404 `LOT_NOT_FOUND` · C1 → 404 `ASSET_NOT_FOUND` (ข้อความเดียวกับ id สุ่ม — ไม่ leak) · C5 → 200 (ฟิลด์ภายใน null) |
![](../shots/R5/R5.20-co1-warehouse.png)
![](../shots/R5/R5.20-co2-warehouse.png)
**console**: 403 จาก `/api/finance-companies?status=active`, `/api/teams?status=active`, `/api/users?roleGroup=inhouse,outsource&status=active` ทุกครั้งที่เปิดหน้า → 🐞 R5-B03
**สถานะ**: ✅ ผ่าน (scope ถูกต้อง) · 🐞 R5-B03

### R5.21 ภายใน: อ่านอย่างเดียว / ผู้จัดการ / หัวหน้าทีม / พนักงาน
| ผู้ใช้ | ผล |
|---|---|
| `uat.finance` | เมนู 'แดชบอร์ด · การเงิน · คลังสินค้า · รายงาน · การตั้งค่า' · ส่งมอบแล้ว 2 · รายละเอียดล็อตมี 'Export Excel / ใบส่งมอบ PDF / ดูเอกสารแนบ' (PDF 200) · ไม่มีปุ่ม action · intake → 403 · console 403 `/api/users?roleGroup=…` (R5-B03) ✅ |
| `uat.account` | เหมือนการเงิน ✅ |
| `uat.exec` | เหมือนการเงิน (Export ได้ — ❓ R5-Q3) ✅ |
| `uat.mgr.in` / `uat.sup.in` / `uat.mgr.out` | **เมนู 'คลังสินค้า' โผล่** แต่ `GET /api/assets` / `GET /api/handover-lots` = **403** → ทุกแท็บขึ้น 'ไม่มีสิทธิ์ใช้งาน — บัญชีนี้ไม่มีสิทธิ์ทำรายการที่ร้องขอ' + 'ลองใหม่' → 🐞 **BUG-076 ยืนยัน** |
| `uat.agent.in1` | ไม่มีเมนูคลัง · `/warehouse` เด้งไป `/dashboard` · API 403 ✅ |
![](../shots/R5/R5.21-finance-lot1-detail.png)
![](../shots/R5/R5.21-mgr.in-warehouse.png)
ภาพอื่น: `R5.21-finance-warehouse`, `-account-`, `-exec-`, `-sup.in-`, `-mgr.out-`, `-agent.in1-warehouse.png`
**สถานะ**: ✅ ผ่าน (อ่านอย่างเดียวถูก) · 🐞 BUG-076

## G. ตรวจปลายรอบ

### R5.22 แจ้งเตือนทั้งรอบ
**ผล**: notifications หลัง T0 = **3 แถว**: `asset.intake_rejected` → `uat.agent.in1` (C2, 20:13) · `lot.confirmed` → `uat.finance` ×2 (LOT-2569-001 20:21, LOT-2569-002 20:22) · ไม่มีแจ้งเตือนตอนรับเข้า/สร้างล็อต/แนบเอกสาร · กระดิ่งการเงิน '2 ยังไม่อ่าน' → คลิก → `/finance?tab=revenue` (รายได้ที่ยังไม่ถูกรวมรอบ 0)
![](../shots/R5/R5.22-finance-bell.png)
![](../shots/R5/R5.22-finance-revenue.png)
**สถานะ**: ✅ ผ่าน

### R5.23 audit ทั้งรอบ
**ผล**: **17 แถว** (ไม่นับ login) actor ธุรการทุกแถว: status_change assets ×4 · approve case_evidences ×4 (reason 'หลักฐานปิดงานผ่านอัตโนมัติ — คลังรับเครื่องเข้าแล้ว') · reject assets ×1 (มี reason) · create handover_lots ×2 · update handover_lots ×4 · confirm handover_lots ×2 · probe ที่ล้ม / คำขอ race ที่แพ้ **ไม่มี audit**
**สถานะ**: ✅ ผ่าน

### R5.24 invariant ปลายรอบ
```
revenues 0 · assets_handed 4 · assets_nohash 0 · lots_confirmed 2 · lots_nosigned 0 · exp_all 18 · exp_locked 0
exp_pending 15 · exp_sup 3 · exp_active_sum 1020000 · ev_approved 4 · ev_pending 1 · ev_rejected 1
C1 handed_over imei_ok t 7 LOT-2569-001 · C2 t 2 LOT-2569-001 · C4 t 2 LOT-2569-001 · C5 t 2 LOT-2569-002
lot_seq 2 · dlv_seq 2
```
pm2 error log ไม่ถูกเขียนระหว่างรอบ · ไม่มี 500 ใน serverErrors
**สถานะ**: ✅ ผ่าน — ตรงตาราง I ของ step sheet ทุกช่อง

## ตารางสถานะปลาย R5 (ส่งต่อ R6)
| เคส | asset | ล็อต | evidence | expenses (active) | revenue |
|---|---|---|---|---|---|
| C1 UAT-CO1-001 | `handed_over` · IMEI ตรง · ปกติ · รูป 7 | LOT-2569-001 / DLV-2569-001 (finance_pickup, confirmed) | approved | 20000 + 15000 + 50000 `pending_approval` | 0 |
| C2 UAT-CO1-002 | `handed_over` · ตีกลับ 1 ครั้ง → รับใหม่ · รูป 2 | LOT-2569-001 | approved | 20000 + 15000 + 50000 `pending_approval` | 0 |
| C3 UAT-CO2-003 | — | — | pending | 20000 + 15000 + 20000 `pending_approval` | — |
| C4 UAT-CO1-004 | `handed_over` · อุปกรณ์ขาดหาย + note · รูป 2 | LOT-2569-001 | v1 rejected · v2 approved | ใหม่ 20000 + 15000 + 50000 `pending_approval` · เดิม 3 `superseded` | 0 |
| C5 UAT-CO2-005 | `handed_over` · รูป 2 | LOT-2569-002 / DLV-2569-002 (we_deliver, confirmed) | approved | 550000 + 100000 `pending_approval` | 0 |
| hotel in1 | — | — | — | 60000 `pending_approval` | — |

## ไฟล์ที่อัปโหลดขึ้น Storage รอบนี้ (bucket `case-documents` — ห้ามลบ)
- รูปรับเข้า 13: `assets/c7d95a2c…/intake/{front 89c8f04b, back 63b21884, top ee2c7376, bottom b878d23d, left a02f9e2e, right db33bc48, imei 665f7933}-R5-C1-intake-*.png` · `assets/09ceddf8…/intake/{front 034ce4f8, imei e1699a39}` · `assets/aed32462…/intake/{front 0a03db40, imei 94d8f966}` · `assets/e23d8891…/intake/{front 13c28961, imei a565699a}`
- รูปปลอม **2** (ขยะ): `assets/aed32462…/intake/front/ccddbd4b-1045-4abe-8eff-0017dd1a4676-R5-fake-photo.jpg` + อีก 1 ไฟล์จากการรันรอบแรกของ s07 (path ไม่ถูกบันทึก — อยู่ใต้ `assets/aed32462…/intake/front/*-R5-fake-photo.jpg`)
- เอกสารล็อต 5: fake signed (ขยะ — `handover-lots/dc03dc55…/signed-doc/<uuid>.pdf` uuid ไม่ถูกบันทึก) · CO1 v1 `…/signed-doc/77e65b67-1f6d-4ae1-a99b-cd20d351d281.pdf` · CO1 v2 `…/signed-doc/97091b88-5aa9-4de9-821b-421b1a03ed46.pdf` · CO2 signed `handover-lots/2a5843ba…/signed-doc/8a07794a-fb21-4396-a232-ae2b08db19c5.pdf` · CO2 proof `…/delivery-proof/d897d801-36fd-4a72-9220-668562e09d60.png`
- **รวม 20 object** (แผน 19 + รูปปลอมเพิ่ม 1 จากการรันซ้ำ)

---

## 🐞 บั๊กที่พบ

### ยืนยันบั๊กที่สงสัยจาก step sheet
| BUG | ระดับ | ผล | หลักฐาน |
|---|---|---|---|
| BUG-074 รับเข้าได้โดยไม่กรอก IMEI | S3 | **ยืนยัน** — ช่อง IMEI ว่างไม่มีคำเตือนใด ๆ บนจอ (R5.03 ข้อ 6) · API `imeiActual:null` ผ่าน Zod ไปล้มที่ condition (R5.04 h) — ไม่ได้ยิงให้ 200 จริง (จะ mutate) | `R5.03-imei-empty.png` |
| BUG-075 ตีกลับไม่บันทึก IMEI ที่พบ | S4 | **ยืนยัน** — `assets.imei_actual` NULL · audit `{"imeiActual": null}` · modal 'IMEI ที่พบ (ไม่ได้บันทึก)' · ทางอ้อม = พิมพ์ลงเหตุผล | R5.06 |
| BUG-076 ผู้จัดการ/หัวหน้าทีมเห็นเมนูคลังแต่ 403 | S3 | **ยืนยัน** — mgr.in / sup.in / mgr.out เห็นเมนู ทุกแท็บขึ้น error state 'ไม่มีสิทธิ์ใช้งาน' | `R5.21-mgr.in-warehouse.png` |
| BUG-077 'วันที่รับเข้า' ไม่มีเวลา | S5 | **ยืนยัน** — drill ในคลัง + รายละเอียดล็อต 'วันที่รับเข้าคลัง' = `03/10/2569` · แถว 'ตีกลับ' ไม่แสดงเวลา (ต้องเปิด 'ดูเหตุผล') · modal 'ดู' มีเวลา | R5.09/13 |
| BUG-078 trim IMEI | needs-decision | หลักฐาน: R5.04 g ได้ `INTAKE_MISSING_CONDITION` (ช่องว่างหน้าถูก trim แล้วผ่าน) | R5.04 |

### บั๊กใหม่
| รหัส | ระดับ | ชนิด | สรุป | step |
|---|---|---|---|---|
| R5-B01 | S4 | code | ใบส่งมอบ PDF: ชื่อผู้รับมอบตัวหนาตัดอักษรท้าย — 'บริษัท ยูเอที ลิสซิ่ง **จำกั**' ('ด' หาย) (`@react-pdf` ตัดคำภาษาไทย/ความกว้างกล่อง) | R5.13 |
| R5-B02 | S5 | code | ใบส่งมอบ PDF ไม่แสดงวันนัดรับ/กำหนดส่ง ทั้งที่ 'ดูตัวอย่างใบส่งมอบ' แสดง 'วันนัดรับ: 03/10/2569 19:46' (PDF มีแค่วันที่พิมพ์) | R5.11/13 |
| R5-B03 | S5 | code | หน้า `/warehouse` ยิง `/api/finance-companies`, `/api/teams`, `/api/users?roleGroup=…` เพื่อเติมตัวกรอง → 403 สำหรับผู้ใช้บริษัท (3 ตัว) และการเงิน/บัญชี (users) → console error ทุกครั้งที่เปิดหน้า + ตัวกรองว่าง (ผู้ใช้บริษัทเลือกบริษัทตัวเองไม่ได้) | R5.20/21 |
| R5-B04 | S5 | code | modal 'เอกสารที่แนบ' แสดง path ภายใน Storage (`handover-lots/<uuid>/signed-doc/<uuid>.pdf`) แทนชื่อเอกสาร/ชื่อไฟล์ | R5.17 |
| R5-B05 | S5 | code | IMEI รูปแบบผิด (14 หลัก / มีขีด) ขึ้นกล่องแดง 'IMEI ที่ตรวจจริงไม่ตรงกับสัญญา — ระบบบันทึกค่าที่ตรวจจริงไว้แล้วและรับเข้าคลังต่อได้' คู่กับ 'รูปแบบ IMEI ไม่ถูกต้อง' — ข้อความขัดกัน (บันทึก/รับเข้าไม่ได้จริง) | R5.03 |

ข้อสังเกต (ไม่เปิดบั๊ก): input file ในช่องรูปได้ชื่อ accessible 'ลบรูป' เพราะ label ครอบปุ่มลบ (a11y — ต่อจากข้อสังเกต "label ไม่ผูก input") · `received_at` ใช้เวลาก่อนตรวจไฟล์ (~3 วินาทีก่อน audit) · ผู้ใช้บริษัทได้ `photos` (path Storage) ใน `GET /api/assets/:id` — ไม่ได้ทดสอบว่าเปิด signed URL ได้หรือไม่ · สร้างล็อตด้วยวันนัดในอดีตได้ (spec ไม่มีกติกา)

## ❓ ต้องตัดสินใจ
- **❓ R5-Q1 (= BUG-078 / ❓-R5-2)** `44` §10 "ห้าม trim" แต่ schema trim ช่องว่างหัวท้าย — ยอมรับเป็นการสแกน หรือปฏิเสธ
- **❓ R5-Q2 (= BUG-076 + ❓-R5-3)** ผู้จัดการ/หัวหน้าทีม: ก) ให้ capability อ่านคลังของทีมตัวเองตาม `06` §7.2 (+ รับเข้า/ตีกลับตาม `44` §13?) · ข) ซ่อนเมนูคลังสำหรับ audience `team_lead`
- **❓ R5-Q3** บริหาร (`uat.exec`) Export PDF/Excel ใบส่งมอบได้ (200) ทั้งที่ `44` §13 ระบุแค่ ธุรการ/การเงิน/บัญชี — คงไว้หรือปิด
- สิ่งที่ตัดสินเอง: ไม่กด 'ยืนยันรับทั้งที่ IMEI ไม่ตรง' (มติ ❓-R5-1) · BUG-074 ยืนยันแบบไม่ mutate (ไม่ยิง IMEI null + condition ครบ) · R5.07 รันซ้ำทำให้รูปปลอมค้าง 2 ไฟล์ · R5.15 รันต่อจากจุดล้ม (v1 แนบแล้วใน DB) — ไม่มีผลต่อข้อมูลปลายรอบ
