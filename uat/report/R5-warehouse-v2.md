# R5 v2 — คลังสินค้า: รับเข้า C1/C2/C4/C5 → ล็อตบริษัท 1 (C1,C2,C4) + ล็อตบริษัท 2 (C5) → แนบเอกสาร → ยืนยันส่งมอบ (ธุรการ `uat.admin`)

> step sheet `uat/steps/R5.md` **v2** (R5.01–R5.24) · golden `uat/DATASET.md` v3 §R5 + §D-DAY + E3 · ต้นรอบ = `R4-end-v3` · ปลายรอบ = `R5-end-v3` (orchestrator snapshot)
> วันที่ทดสอบ: 04/10/2569 (พ.ศ.) 01:39–01:52 น. เวลาไทย · T0 (UTC) `2026-10-03 18:39:36+00`
> ผู้เล่น: role agent ผ่าน Playwright (Chrome headless · desktop 1440×900 · พนักงานจำลอง iPhone 14) · สคริปต์ `uat/bin/r5v2/*.mjs` (คัดลอกจาก `uat/bin/r5/` แล้วปรับ id) · log `uat/bin/r5v2/run.log` · ภาพ `uat/shots/R5v2/*.png` (**55 ภาพ**) + `R5.13-DLV-2569-003.pdf` + `R5.13-LOT-2569-003.xlsx`
> **ผล: ✅ 24/24 step · ไม่มี S1/S2 · ไม่มี 500 · probe ทุกตัวล้มก่อนทรานแซกชัน (ไม่มี 2xx ที่ไม่ตั้งใจ)** · บั๊กเก่า BUG-074…084 ยังอยู่ครบ (ยืนยันซ้ำ) · BUG-071 แก้แล้วจริง · บั๊กใหม่ 2 (S5) · ⚠️ 3 (ข้อต่างจาก step sheet) · ❓ 1 ใหม่ + 3 เดิม
> มติ ❓-R5-1 = ก — **ไม่กด "ยืนยันรับทั้งที่ IMEI ไม่ตรง"** (ดูแค่ปุ่ม/คำเตือนแล้วยกเลิก)

## ⚠️ ข้อต่างจาก step sheet (อ่านก่อน)

1. **เลขล็อตเป็น `LOT-2569-003` / `LOT-2569-004` (DLV-2569-003/004) ไม่ใช่ 001/002** — ต้นรอบ sequence `seq_handover_lot_2569`/`seq_handover_dlv_2569` **มีอยู่แล้ว last_value = 2** (ค้างจาก R5 v1) ทั้งที่ `handover_lots` = 0 แถว · สาเหตุ: `uat/bin/restore.sh` ใช้ `pg_restore --clean` ซึ่งลบเฉพาะ object ที่อยู่ใน dump — sequence ที่สร้างแบบ dynamic หลัง snapshot จึงรอด (🐞 R5v2-B01) · ไม่ใช่บั๊กเลขกระโดดของแอป (probe ไม่เผาเลข — seq คงที่ 2 จนสร้างล็อตจริง แล้วขึ้น 3, 4 พอดี) · รอบถัดไปที่อ้างเลข LOT/DLV ต้องใช้ 003/004
2. **id ของ asset ใน §0.6 ล้าสมัย** (asset ถูกสร้างใหม่ใน R4 v3) — ใช้ id จริง: C1 `2666a107-4e89-44f9-8212-31232a8c05af` · C2 `98a74df2-dc68-43b9-9877-3d5ea2186c59` · C4 `aa1a2872-d1c0-46c7-98a0-44c3f84fea1f` · C5 `5cad8233-fbe1-4ba6-ab92-f886e4434689` (case id / user id / company id ตรงเดิม) · LOT1 (CO1) `15db3c66-d183-4a3a-bbb0-2d9decee40af` · LOT2 (CO2) `469803a8-82b7-4d51-8dc7-e07a10e0d004` · รอบแรกของ R5.04 ยิงด้วย id เก่า → 404 `ASSET_NOT_FOUND` ทุกข้อ (ไม่มี mutation) แล้วยิงใหม่ด้วย id จริง
3. **สคริปต์ `s07`/`s15` ของรอบเก่าเป็นรุ่น "ต่อ" (b)** ที่ข้ามขั้นแรก — ผลคือ
   - R5.07 ทำ 1 (รูปปลอม → server ปัด) **ย้ายไปทำที่ modal ของ C5** ใน R5.08 ก่อนตั้ง race (ผลเหมือนกัน: 'ชนิดไฟล์ไม่รองรับ' · asset ไม่เปลี่ยน · audit 0) · C4 ยังมีรูปปลอมที่อัปโหลดแล้วลบออกจากฟอร์ม 1 ไฟล์ (ไม่เคยส่ง server)
   - R5.15 ใบเซ็นรับล็อต CO1 ได้ลำดับ **v2 → (ปลอม ถูกปัด) → v1 → v2** แทน ปลอม → v1 → v2 ⇒ audit `update` ของล็อต CO1 = **3** แถว (คาด 2) · audit ทั้งรอบ = **18** (คาด 17) · ไฟล์เอกสารล็อตใน bucket 6 (คาด 5) · ปลายทางเหมือนคาด (signed_doc_hash = v2 `bdc13b27…`) และยืนยันเรื่องเวอร์ชันได้ครบ (path ใหม่ทุกครั้ง · before ของแต่ละแถวชี้ไฟล์ก่อนหน้า)

## สรุปผลต่อ step

| Step | เรื่อง | ผล |
|---|---|---|
| R5.01 | baseline + fixture (19 ไฟล์ sha ตรง) | ✅ (+⚠️ sequence ค้าง = R5v2-B01) |
| R5.02 | ธุรการเปิดคลัง + กระดิ่ง | ✅ — C4 ไม่ซ้ำแล้ว (BUG-071 แก้แล้ว: 'ส่งหลักฐานใหม่แล้ว — UAT-CO1-004') |
| R5.03 | probe หน้าจอ modal C1 (0 request) | ✅ + 🐞 BUG-074 (ช่อง IMEI ว่างไม่เตือน) · 🐞 BUG-083 |
| R5.04 | probe API intake/reject 10 ตัว | ✅ + 🐞 BUG-074 (h) · ❓ BUG-078 (g) |
| R5.05 | C1 รับเข้า 7 มุม + ดับเบิลคลิก | ✅ (1 request) |
| R5.06 | C2 ตีกลับ → probe → ดูเหตุผล → รับใหม่ · กระดิ่ง in1 | ✅ + 🐞 BUG-075 |
| R5.07 | C4 อุปกรณ์ขาดหาย · approver ตีกลับหลักฐานไม่ได้ | ✅ (⚠️ probe รูปปลอมทำที่ C5) |
| R5.08 | C5 race รับเข้า 2 คำขอ | ✅ |
| R5.09 | แท็บในคลัง / วันที่ / รายละเอียดเครื่อง | ✅ + 🐞 BUG-077 |
| R5.10 | probe สร้างล็อต 8 ตัว (ไม่เผาเลข) | ✅ |
| R5.11 | ล็อต CO1 finance_pickup + ดับเบิลคลิก → LOT-2569-003 | ✅ (⚠️ เลข 003) |
| R5.12 | ล็อต CO2 we_deliver → LOT-2569-004 | ✅ |
| R5.13 | probe หลังมีล็อต + PDF/Excel | ✅ + 🐞 BUG-079, BUG-080 |
| R5.14 | ยืนยันโดยไม่แนบ → `LOT_MISSING_SIGNED_DOC` | ✅ |
| R5.15 | แนบใบเซ็นรับ ปลอม / v1 / v2 + probe 5 ตัว | ✅ (⚠️ ลำดับ v2→ปลอม→v1→v2) |
| R5.16 | ยืนยันล็อต CO1 (ดับเบิลคลิก) — transaction 4 ขั้น ปลด 9 แถวรวมรายวัน 6 | ✅ + 🐞 R5v2-B02 |
| R5.17 | probe หลังยืนยัน + modal เอกสาร | ✅ + 🐞 BUG-082 |
| R5.18 | ล็อต CO2 แนบไม่ครบ → `LOT_MISSING_DELIVERY_PROOF` → ครบ | ✅ |
| R5.19 | ยืนยันล็อต CO2 race 2 context — ปลด 2 แถว | ✅ |
| R5.20 | ผู้ใช้บริษัท CO1/CO2 scope | ✅ + 🐞 BUG-081 |
| R5.21 | การเงิน/บัญชี/บริหาร/ผู้จัดการ/หัวหน้าทีม/พนักงาน | ✅ + 🐞 BUG-076 · BUG-084 |
| R5.22 | แจ้งเตือนทั้งรอบ = 3 แถว | ✅ |
| R5.23 | audit ทั้งรอบ = 18 แถว (คาด 17 — ส่วนเกินคือแนบ v2 ซ้ำ ดู ⚠️3) | ✅ |
| R5.24 | invariant ปลายรอบ | ✅ |

## ผลยืนยันจุดที่ต้องดูเป็นพิเศษ

| เรื่อง | ผล | step |
|---|---|---|
| ไม่กด "ยืนยันรับทั้งที่ IMEI ไม่ตรง" | ✅ กดยืนยันครั้งเดียว → ปุ่มเปลี่ยนเป็น 'ยืนยันรับทั้งที่ IMEI ไม่ตรง' แล้วแก้ IMEI/ยกเลิก (C1) · C2 เห็นกล่องไม่ตรงแล้ว 'ยกเลิก' → ตีกลับ · imei_ok ปลายรอบ = true ทุกเครื่อง | R5.03/06 |
| รับเข้า ⇒ หลักฐานผ่านอัตโนมัติ (Q14) | ✅ C1/C2/C4(v2)/C5 `pending → approved` reviewed_by = ธุรการ ในวินาทีเดียวกับ audit `status_change` · C4 v1 `rejected` ไม่แตะ · C3 `pending` · ตีกลับ intake ไม่ทำให้หลักฐานผ่าน · approver: `evidence-approved` + ไม่มีปุ่มตีกลับ · API → `EVIDENCE_REJECT_AFTER_FINAL` | R5.05–08 |
| ตรวจรูปฝั่ง server (Q13) | ✅ path เครื่องอื่น → `UPLOAD_PATH_OUT_OF_SCOPE` · ไม่มีไฟล์ → `UPLOAD_FILE_NOT_FOUND` · รูปปลอม → 'ชนิดไฟล์ไม่รองรับ' (400 ทั้งคำขอ) · photo_hashes 13 คีย์ sha ตรง `SHA256SUMS-R5.tsv` | R5.04/05/08 |
| ยืนยันล็อต = `$transaction` 4 ขั้น | ✅ ① assets → `handed_over` · ② **ปลดล็อก expense ทุกแถวของเคสในล็อต รวมแถวรายวัน**: CO1 `expenseIdsUnlocked` 9 id (ในนั้น `field_day_settlement_id` ไม่ NULL **6**) · CO2 2 id (fuel รายวัน 550000 + commission 100000) · `pending_warehouse_confirm` ของเคสในล็อตเหลือ 0 · superseded C4 ไม่แตะ · ③ audit `confirm` 1 แถว/ล็อต · ④ `revenueIdsCreated []`, `revenueEligibleCaseIds []` → **revenues = 0** | R5.16/19 |
| skip reason ≠ `field_days_not_settled` | ✅ ทางอ้อม — audit `lot.confirmed` **ไม่บันทึก skip reason เลย** (🐞 R5v2-B02) · ตรวจเกต: `field_day_settlements` 3 แถว (in1/in2/out1 วันที่ 2026-10-04 ครอบทุกเคส) ⇒ `fieldDaysSettled = true` · เกตที่ติดจึงเป็นด่านถัดไป `expense_not_approved` (`lib/finance/revenue-trigger-rules.ts`) | R5.16 |
| เอกสารล็อตขึ้นเวอร์ชันใหม่ไม่ทับ | ✅ แนบซ้ำได้ path uuid ใหม่ทุกครั้ง (`…/signed-doc/c4826624…` → `778bc708…`(v1) → `366c808c…`(v2)) · audit before = ไฟล์ก่อนหน้า + hash · ไฟล์ v1 ยังอยู่ (probe d → `UPLOAD_HASH_MISMATCH`) · หลัง confirmed แนบใหม่ → `LOT_ALREADY_CONFIRMED` | R5.15/17 |
| ไฟล์ปลอมถูก server ปัด | ✅ รูปปลอม (intake) + `R5-fake-signed.pdf` (toast 'แนบไฟล์ไม่สำเร็จ' · signed_doc_url ไม่เปลี่ยน) | R5.08/15 |
| ดับเบิลคลิก / race ไม่สร้างซ้ำ | ✅ ดับเบิลคลิก รับเข้า/สร้างล็อต/ยืนยันล็อต = 1 request ทุกปุ่ม · race รับเข้า C5: B 200 / A 400 `ASSET_INVALID_STATUS` (modal 'สถานะของเครื่องไม่รองรับการกระทำนี้') · race ยืนยัน CO2: A 200 / B 400 `LOT_ALREADY_CONFIRMED` · audit/แจ้งเตือน 1 ครั้ง | R5.05/08/11/16/19 |
| เลขล็อต พ.ศ. + ไม่ recycle | ✅ `LOT-2569-003/004`, `DLV-2569-003/004` · probe 8+4 ตัวไม่เผาเลข · seq ปลายรอบ 4/4 | R5.10–13 |
| scope บริษัท | ✅ co1.mgr เห็นเฉพาะ LOT-2569-003, co2.admin เฉพาะ LOT-2569-004 · นอก scope = 404 ข้อความเดียวกับ id สุ่ม · `imeiActual/teamName/agentName/rejectReason` = null สำหรับผู้ใช้บริษัท · PDF/Excel/แนบ/ยืนยัน/รับเข้า = 403 | R5.20 |
| แจ้งเตือน | ✅ 3 แถว: in1 ตีกลับ C2 · finance × 2 'ยืนยันส่งมอบล็อตแล้ว … ยังไม่เกิดรายได้ในล็อตนี้ (รออนุมัติค่าตอบแทน)' → `/finance?tab=revenue` · ไม่ถึงบริหาร/บัญชี/ผู้ใช้บริษัท | R5.22 |

---

# คู่มือ — ธุรการทำงานคลังสินค้า (`uat.admin` สมใจ ธุรการดี)

ภาพรวม 4 ขั้น: **รับเข้าคลัง** (ตรวจ IMEI + สภาพ + รูป) → **นัดวันส่งมอบ** (1 ล็อต = 1 บริษัท) → **แนบเอกสาร** (ใบเซ็นรับ / หลักฐานจัดส่ง) → **ยืนยันส่งมอบ** (ปิดล็อต ปลดล็อกรายการเบิก)

## A. เตรียม

### R5.01 baseline + fixture
**ทำ**: ตรวจ sha `uat/fixtures/files/R5-*` 19 ไฟล์กับ `SHA256SUMS-R5.tsv` → ตรงทุกไฟล์ · รัน SQL มาตรฐาน
**ผลหลังบ้าน**: assets 4 แถว `pending_intake` (imei_actual NULL, photos 0) · handover_lots 0 · evidence C1/C2/C5 `pending`, C4 `rejected`+`pending`, C3 `pending` · expenses **16** — `pending_warehouse_confirm` 11 (852500 · รายวัน 7) · `pending_approval` 4 (97500 · รายวัน 2) · `superseded` 1 (50000) · active **950000** · `field_day_settlements` 3 · revenues 0 — ตรงตาราง I ของ R4 v3 · ⚠️ sequence `seq_handover_lot_2569`/`_dlv_2569` มีแล้ว last_value 2 (R5v2-B01)
**สถานะ**: ✅ ผ่าน

### R5.02 เปิดหน้าคลังสินค้า + ดูกระดิ่ง
**เมนู**: คลังสินค้า (`/warehouse`) — เมนูธุรการ 'แดชบอร์ด | จัดการเคส | คลังสินค้า | การตั้งค่า'
![](../shots/R5v2/R5.02-admin-warehouse.png)
**ผลบนจอ**: แท็บ 'รับเข้าคลัง 4 · ในคลัง 0 · รอส่งมอบ 0 · ส่งมอบแล้ว 0' · 4 แถว (UAT-CO2-005 ทีม C / ประเสริฐ รับเหมา · UAT-CO1-004 ทีม A / บุญมี · UAT-CO1-002, UAT-CO1-001 ทีม A / อนันต์) ทุกแถว 'รอรับเข้าคลัง' สภาพ '—' วันปิดเคส `04/10/2569` ปุ่ม 'รับเข้าคลัง' + 'ตีกลับ' · **ไม่มี** UAT-CO2-003 / UAT-CO2-007
![](../shots/R5v2/R5.02-admin-bell.png)
**กระดิ่ง**: 11 ยังไม่อ่าน · 'ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง' 4 แถว (C1 00:41, C2 00:42, C4 00:45, C5 00:46) + 'ส่งหลักฐานใหม่แล้ว — UAT-CO1-004' 00:56 (BUG-071 แก้แล้ว ไม่ซ้ำ)
**สถานะ**: ✅ ผ่าน

## B. ตรวจกติกาการรับเข้าก่อนทำจริง (ไม่มีข้อมูลเปลี่ยน)

### R5.03 ฟอร์ม 'รับเครื่องเข้าคลัง' ตรวจให้ก่อนส่ง
**เมนู**: แท็บ 'รับเข้าคลัง' → แถว UAT-CO1-001 → 'รับเข้าคลัง' → modal 'รับเครื่องเข้าคลัง'
**ทำ / ผลบนจอ** (request ไป `/api/assets/*/intake|reject-intake` = **0**):
1. IMEI `356789100000011` (กล่องเขียว 'ตรงกับสัญญา') ไม่เลือกสภาพ → ยืนยัน → **'ยังไม่ได้เลือกสภาพเครื่อง'**
![](../shots/R5v2/R5.03-no-condition.png)
2. 'ปกติ' + `35678910000001` → **'รูปแบบ IMEI ไม่ถูกต้อง'** + ใต้ช่อง 'ต้องเป็นตัวเลข 15 หลัก' — แต่กล่องแดงข้างล่างยังเขียน 'ระบบบันทึกค่าที่ตรวจจริงไว้แล้วและรับเข้าคลังต่อได้' (🐞 BUG-083)
![](../shots/R5v2/R5.03-imei14.png)
3. `356789-100000011` → ช่องเหลือ `356789-10000001` (maxLength 15) + ข้อความรูปแบบผิด
![](../shots/R5v2/R5.03-imei-dash.png)
4. `356789100000999` → 'IMEI ที่ตรวจจริงไม่ตรงกับสัญญา' → กดยืนยัน 1 ครั้ง → ปุ่ม **'ยืนยันรับทั้งที่ IMEI ไม่ตรง'** + 'กด “ยืนยันรับทั้งที่ IMEI ไม่ตรง” อีกครั้งเพื่อรับเข้าคลัง…' → **ไม่กดต่อ**
![](../shots/R5v2/R5.03-imei-mismatch.png)
5. IMEI ตรง + 'ชำรุด' ไม่กรอกรายละเอียด → **'ต้องระบุรายละเอียดสภาพเครื่อง'** + ป้าย 'รายละเอียดสภาพเครื่อง*'
![](../shots/R5v2/R5.03-damaged-no-note.png)
6. ล้างช่อง IMEI → **ไม่มีคำเตือน IMEI ใด ๆ** (🐞 BUG-074) → 'ยกเลิก'
![](../shots/R5v2/R5.03-imei-empty.png)
**ผลหลังบ้าน**: C1 ยัง `pending_intake`
**สถานะ**: ✅ ผ่าน + 🐞 BUG-074 · BUG-083 (ยังอยู่)

### R5.04 probe API การรับเข้า (ไม่มี mutation)
**ผล** (ธุรการ, asset C1 id จริง): a `35678910000001` → 400 `REQUIRED_MISSING` fields.imeiActual · b มีขีด → 400 `REQUIRED_MISSING` · c condition null → 400 `INTAKE_MISSING_CONDITION` · d damaged ไม่มี note → 400 `INTAKE_MISSING_NOTE` · e path ของ C2 → 400 `UPLOAD_PATH_OUT_OF_SCOPE` · f ไฟล์ไม่มี → 400 `UPLOAD_FILE_NOT_FOUND` · **g `' 356789100000011'` → `INTAKE_MISSING_CONDITION` (= trim แล้วผ่าน — BUG-078)** · **h imeiActual null → `INTAKE_MISSING_CONDITION` (= null ผ่าน Zod — BUG-074)** · i เหตุผล '   ' → 400 `REJECT_MISSING_REASON` · j id สุ่ม → 404 `ASSET_NOT_FOUND`
**ผลหลังบ้าน**: C1 ไม่เปลี่ยน · audit หลัง T0 = 0
**สถานะ**: ✅ ผ่าน + 🐞 BUG-074 · ❓ BUG-078

## C. รับเข้าคลัง

### R5.05 รับเครื่อง C1 ครบ 7 มุม
**ทำ**: แถว UAT-CO1-001 → 'รับเข้าคลัง' → IMEI `356789100000011` ('ตรงกับสัญญา') → 'ปกติ' → แนบ `R5-C1-intake-<มุม>.png` ทั้ง 7 ช่อง (ทุกช่อง 'ถ่ายแล้ว' · คำเตือนรูปหายไป)
![](../shots/R5v2/R5.05-c1-photos.png)
→ **ดับเบิลคลิก** 'ยืนยันรับเข้าคลัง'
![](../shots/R5v2/R5.05-c1-done.png)
**ผลบนจอ**: toast เขียว 'รับเครื่องเข้าคลังแล้ว' 'UAT-CO1-001 · Samsung Galaxy A55' · แถวหาย · 'รับเข้าคลัง 3 · ในคลัง 1'
**ผลหลังบ้าน**: POST intake **1 ครั้ง** (200) · C1 `in_custody` imei_actual ตรง · `normal` · photos 7 (`assets/2666a107…/intake/<มุม>/<uuid>-R5-C1-intake-<มุม>.png`) · photo_hashes 7 คีย์ sha ตรงทุกไฟล์ · evidence C1 → `approved` (01:41:24 · reviewed_by ธุรการ) · audit 2 แถว: `status_change` assets (imeiMatch true, photosCount 7, evidenceApprovedId, events `["asset.intake"]`) + `approve` case_evidences 'หลักฐานปิดงานผ่านอัตโนมัติ — คลังรับเครื่องเข้าแล้ว' · expense C1 ยัง `pending_warehouse_confirm` · ไม่มีแจ้งเตือน
**สถานะ**: ✅ ผ่าน

### R5.06 ตีกลับ C2 → ดูเหตุผล → รับใหม่
**ทำ 1**: แถว UAT-CO1-002 → 'รับเข้าคลัง' → IMEI `356789100000999` → กล่อง IMEI ไม่ตรง → 'ยกเลิก' → 'ตีกลับ' → 'ยืนยันตีกลับ' ว่าง (→ 'ต้องระบุเหตุผลที่ตีกลับ') → กรอก 'IMEI บนเครื่อง 356789100000999 ไม่ตรงกับสัญญา 356789100000029 — ให้พนักงานตรวจเครื่องอีกครั้ง' → 'ยืนยันตีกลับ'
![](../shots/R5v2/R5.06-c2-rejected.png)
**ผล 1**: toast 'ตีกลับเครื่องแล้ว / UAT-CO1-002' · แถวสถานะ 'ตีกลับ' ปุ่ม 'ดูเหตุผล' + 'รับใหม่' · audit `reject` assets reason ครบ events `["asset.intake_rejected"]` — **after `imeiActual: null`** (🐞 BUG-075) · evidence C2 ยัง `pending` · แจ้งเตือน 1 แถวถึง `uat.agent.in1` 'คลังตีกลับการรับเข้า' link `/field/closed`
**ทำ 2 (probe)**: ตีกลับซ้ำ → 400 `ASSET_INVALID_STATUS` · สร้างล็อตด้วย C2 → 400 `ASSET_NOT_IN_CUSTODY` (assetIds=[C2]) · handover_lots 0 · seq ยัง 2
**ทำ 3**: 'ดูเหตุผล' → 'เหตุผลที่ตีกลับ' + 'ตีกลับเมื่อ 04/10/2569 01:41' + 'IMEI ที่พบ (ไม่ได้บันทึก)' → 'ปิดหน้าต่าง'
![](../shots/R5v2/R5.06-c2-reason.png)
**ทำ 4**: 'รับใหม่' → 'รับเครื่องเข้าคลังอีกครั้ง' → IMEI `356789100000029` → 'ปกติ' → แนบด้านหน้า + IMEI บนเครื่อง (คำเตือน 'ยังไม่ได้ถ่ายอีก 5 มุม … — รับเข้าคลังต่อได้') → ยืนยัน
![](../shots/R5v2/R5.06-c2-retry-done.png)
**ผล 4**: toast 'รับเครื่องเข้าคลังอีกครั้งแล้ว / UAT-CO1-002 · iPhone 15 128GB' · C2 `in_custody` photos 2 hashed 2 · reject_reason/rejected_at/rejected_by ล้างเป็น NULL · evidence C2 `approved` · audit `status_change` events `["asset.intake_retry","asset.intake"]` + `approve`
**กระดิ่ง in1** (มือถือ): 'คลังตีกลับการรับเข้า' 'คลังสินค้า · 04/10/2569 01:41' → คลิกไป `/field/closed`
![](../shots/R5v2/R5.06-in1-bell.png)
**สถานะ**: ✅ ผ่าน + 🐞 BUG-075 (ยังอยู่)

### R5.07 C4 สภาพ "อุปกรณ์ขาดหาย" + approver ตีกลับหลักฐานไม่ได้
**ทำ**: แถว UAT-CO1-004 → IMEI `356789100000045` → 'อุปกรณ์ขาดหาย' → 'ไม่มีกล่องและสายชาร์จ ตัวเครื่องปกติ' → ด้านหน้าแนบ `R5-fake-photo.jpg` ('ถ่ายแล้ว') → **'ลบรูป'** (ป้ายกลับเป็น 'ยังไม่ถ่าย') → แนบ `R5-C4-intake-front.png` + `R5-C4-intake-imei.png` → ยืนยัน
![](../shots/R5v2/R5.07-c4-done.png)
**ผล**: toast 'รับเครื่องเข้าคลังแล้ว / UAT-CO1-004 · iPad Air M2' · C4 `in_custody` `partial_loss` note ตรง photos 2 (**ไม่มี path ไฟล์ปลอม**) · evidence v2 → `approved` · v1 `rejected` ไม่เปลี่ยน · audit 2 แถว
**ส่ง server ด้วยรูปปลอม** (⚠️ ทำที่ modal ของ C5 แทน): 400 → กล่องแดง **'ชนิดไฟล์ไม่รองรับ'** 'เนื้อไฟล์ไม่ตรงกับชนิดที่ช่องนี้รับ…' · modal ไม่ปิด · C5 ยัง `pending_intake` photos 0 · audit 0
![](../shots/R5v2/R5.07-fake-rejected-c5.png)
**approver** (`/cases/submit`): UAT-CO1-004 และ UAT-CO1-001 กล่อง 'หลักฐานปิดงาน' — 'หลักฐานชุดนี้ผ่านแล้ว' 'ผ่านอัตโนมัติเมื่อคลังรับเครื่องเข้า — ตีกลับไม่ได้แล้ว' (`data-testid="evidence-approved"`) ไม่มีปุ่มตีกลับ · API reject-evidence C4/C1 → 400 `EVIDENCE_REJECT_AFTER_FINAL`
![](../shots/R5v2/R5.07-approver-no-reject.png)
**สถานะ**: ✅ ผ่าน

### R5.08 C5 — กดรับเข้าพร้อมกัน 2 ที่
**ทำ**: A (หน้าจอ) แถว UAT-CO2-005 → IMEI `356789100000052` → 'ปกติ' → (probe รูปปลอมข้างบน → 'ลบรูป') → แนบด้านหน้า + IMEI บนเครื่อง → ตั้ง route ให้ B ยิงคำขอเดียวกันพร้อมกัน → ยืนยัน
![](../shots/R5v2/R5.08-c5-race.png)
**ผล**: B 200 · A 400 `ASSET_INVALID_STATUS` → กล่องแดง 'สถานะของเครื่องไม่รองรับการกระทำนี้' (ไม่ใช่ 500) · C5 `in_custody` photos 2 · evidence C5 `approved` ครั้งเดียว · audit `status_change` 1 + `approve` 1
**สถานะ**: ✅ ผ่าน

### R5.09 หลังรับเข้าครบ
![](../shots/R5v2/R5.09-custody-cards.png)
**ผลบนจอ**: 'รับเข้าคลัง 0 · ในคลัง 4' · การ์ด 'บริษัท ยูเอที ลิสซิ่ง จำกัด 3 เครื่องทั้งหมด พร้อมส่ง 3 (2 ปกติ · 1 อุปกรณ์ขาดหาย)' + 'บริษัท ยูเอที แคปปิตอล จำกัด 1 พร้อมส่ง 1'
![](../shots/R5v2/R5.09-custody-co1.png)
drill ลิสซิ่ง '3 เครื่องในคลัง · พร้อมส่ง 3 · อยู่ในล็อตแล้ว 0' · คอลัมน์ 'วันที่รับเข้า' = `04/10/2569` **ไม่มีเวลา** (🐞 BUG-077) · ไม่มีแถวข้ามบริษัท
![](../shots/R5v2/R5.09-asset-detail.png)
modal 'ข้อมูลเครื่องในคลัง' 'วันที่รับเข้า 04/10/2569 01:41' · 'รูปหลักฐาน (7)' · กดรูปด้านหน้า → signed URL 200 `image/png`
**SQL**: evidence C1/C2/C4(v2)/C5 `approved` · C4 v1 `rejected` · C3 `pending` · expenses เหมือน R5.01 · revenues 0
**สถานะ**: ✅ ผ่าน + 🐞 BUG-077

## D. สร้างล็อต

### R5.10 probe สร้างล็อตทาง API
**ผล**: a ว่าง → `EMPTY_LOT` · b [C1,C5] → `MIXED_COMPANY_LOT` · c [C5] ในล็อตบริษัท 1 → `MIXED_COMPANY_LOT` · d id สุ่ม → 404 `ASSET_NOT_FOUND` · e [C1,C1] → `REQUIRED_MISSING` 'เลือกเครื่องซ้ำกัน' · f we_deliver ไม่มีที่อยู่ → `REQUIRED_MISSING` fields.deliveryAddr · g ปี 2569 → `REQUIRED_MISSING` fields.scheduledAt 'ปีของวันเวลาต้องเป็น ค.ศ.…' · h `uat.co1.mgr` → 403
**หลังบ้าน**: handover_lots 0 · seq ยัง 2 (ไม่เผาเลข) · assets 4 `in_custody` lot_id NULL · audit 0
**สถานะ**: ✅ ผ่าน

### R5.11 นัดวันส่งมอบล็อตบริษัท 1 (ไฟแนนซ์มารับที่คลัง)
**ทำ**: 'ในคลัง' → การ์ดลิสซิ่ง → 'เลือกทุกเครื่องที่พร้อมส่ง' → 'นัดวันส่งมอบ (3)' → modal '3 เครื่อง · 1 ล็อต = 1 บริษัทไฟแนนซ์เสมอ' (ปุ่มบันทึก disabled จนเลือกรูปแบบ) → '🏢 ไฟแนนซ์มารับที่คลัง' → บันทึกโดยวันว่าง (→ **'ต้องระบุวันนัดรับ'**)
![](../shots/R5v2/R5.11-no-datetime.png)
→ วันเวลา 04/10/2569 01:14 → 'คุณวิภา ฝ่ายติดตามทรัพย์ (UAT)' → หมายเหตุ 'UAT R5 ล็อตบริษัท 1' → 'ดูตัวอย่างใบส่งมอบ' (วันที่ `04/10/2569`, `04/10/2569 01:14` — พ.ศ.)
![](../shots/R5v2/R5.11-preview.png)
→ **ดับเบิลคลิก** 'บันทึกการนัด'
![](../shots/R5v2/R5.11-lot1-created.png)
**ผลบนจอ**: toast **'สร้างล็อต LOT-2569-003 แล้ว'** '3 เครื่อง · ใบส่งมอบ DLV-2569-003 · ไปต่อที่แท็บ “รอส่งมอบ”' · 'รอส่งมอบ 1' การ์ด '⏳ ใบส่งมอบที่มีลายเซ็นผู้รับ รอแนบ' 'นัดรับ: 04/10/2569 01:14' · ในคลัง checkbox C1 disabled title 'อยู่ในล็อตส่งมอบแล้ว'
**ผลหลังบ้าน**: POST 1 ครั้ง (201) · `LOT-2569-003`/`DLV-2569-003` `finance_pickup` **`pending_attach`** CO1 scheduled_at 18:14 UTC · assets C1/C2/C4 `handover_pending` · audit `create` events `["lot.created"]` assetIds 3 · seq 3/3 · expense ไม่เปลี่ยน
**สถานะ**: ✅ ผ่าน (⚠️ เลข 003 — R5v2-B01)

### R5.12 นัดวันส่งมอบล็อตบริษัท 2 (เราจัดส่งไปให้)
**ทำ**: การ์ดแคปปิตอล → 'เลือก UAT-CO2-005' → 'นัดวันส่งมอบ (1)' → '🚚 เราจัดส่งไปให้' → กำหนดส่ง 04/10/2569 01:34 → ที่อยู่ตั้งต้น '88 ถนนงามวงศ์วาน…นนทบุรี 11000' → ลบให้ว่าง → บันทึก (→ 'ล็อตแบบ "เราจัดส่งไปให้" ต้องระบุที่อยู่จัดส่ง') → '99 อาคารยูเอที ถ.วิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร 10900' → เลขพัสดุ 'TH-UAT-R5-0001' → บันทึก
![](../shots/R5v2/R5.12-lot-co2.png)
**ผล**: toast 'สร้างล็อต LOT-2569-004 แล้ว / 1 เครื่อง · ใบส่งมอบ DLV-2569-004 · ไปต่อที่แท็บ “ส่งมอบแล้ว”' · ไปแท็บ 'ส่งมอบแล้ว 1' ทันที การ์ด 'รอแนบหลักฐานจัดส่ง' ⏳×2 'กำหนดส่ง: 04/10/2569 01:34' · DB `pending_delivery_proof` `we_deliver` ที่อยู่/เลขพัสดุตรง · C5 `handover_pending` · seq 4/4
**สถานะ**: ✅ ผ่าน

### R5.13 ตรวจหลังมีล็อต + ใบส่งมอบ PDF / Excel
**probe**: ล็อตใหม่ด้วย C1 → `ASSET_ALREADY_IN_LOT` lotNumbers `["LOT-2569-003"]` · C5 → `["LOT-2569-004"]` · ตีกลับ C1 → `ASSET_INVALID_STATUS` · seq ยัง 4
![](../shots/R5v2/R5.13-lot1-detail.png)
**หน้าจอ**: รายละเอียดล็อต 3 เครื่อง + 'Export Excel' / 'ใบส่งมอบ PDF' / 'แนบเอกสาร & ยืนยัน' · PDF 200 `LOT-2569-003.pdf` · xlsx 200
![](../shots/R5v2/R5.13-DLV-2569-003-pdf.png)
**PDF**: 'เลขที่: DLV-2569-003' 'วันที่: 04/10/2569' (พ.ศ.) · ชื่อผู้รับมอบตัวหนาเป็น 'บริษัท ยูเอที ลิสซิ่ง **จำกั**' (🐞 BUG-079) · ไม่มีวันนัดรับ (🐞 BUG-080)
**สถานะ**: ✅ ผ่าน + 🐞 BUG-079 · BUG-080

## E. เอกสารล็อต + ยืนยันส่งมอบ

### R5.14 ยืนยันโดยยังไม่แนบใบเซ็นรับ
![](../shots/R5v2/R5.14-confirm-disabled.png)
**ผล**: modal 'แนบใบเซ็นรับ — LOT-2569-003' ปุ่ม 'ยืนยันส่งมอบสำเร็จ' disabled · API PATCH confirm `{}` → 400 `LOT_MISSING_SIGNED_DOC` · ล็อต/assets/expense ไม่เปลี่ยน · audit 0
**สถานะ**: ✅ ผ่าน

### R5.15 แนบใบเซ็นรับ (ปลอม / v1 / v2)
**ทำ**: ช่อง ① แนบ `R5-fake-signed.pdf` → toast แดง **'แนบไฟล์ไม่สำเร็จ'** 'เนื้อไฟล์ไม่ตรงกับชนิดที่ช่องนี้รับ…' (DB ไม่เปลี่ยน)
![](../shots/R5v2/R5.15-fake-signed.png)
→ แนบ `R5-LOT-CO1-signed-v1.pdf` → 'แนบแล้ว ✅' 'แนบไฟล์ใหม่แทน' 'ดูไฟล์ที่แนบ' · DB `…/signed-doc/778bc708….pdf` hash `c2f53e93…`
![](../shots/R5v2/R5.15-v1-attached.png)
→ 'แนบไฟล์ใหม่แทน' `R5-LOT-CO1-signed-v2.pdf` → DB `…/signed-doc/366c808c….pdf` hash `bdc13b27…` · audit before = path v1 + hash v1
![](../shots/R5v2/R5.15-v2-attached.png)
(⚠️ ก่อนหน้านี้สคริปต์รุ่นเก่าแนบ v2 ไปแล้วหนึ่งครั้ง `c4826624….pdf` — audit `update` CO1 รวม 3 แถว)
**probe** (signed_doc_url ไม่เปลี่ยน): a path ล็อต CO2 → `UPLOAD_PATH_OUT_OF_SCOPE` · b โฟลเดอร์ delivery-proof → `UPLOAD_PATH_OUT_OF_SCOPE` · c ไฟล์ไม่มี → `UPLOAD_FILE_NOT_FOUND` · d V1PATH + hash ศูนย์ → **`UPLOAD_HASH_MISMATCH`** (ไฟล์ v1 ยังอยู่) · e `uat.co1.mgr` → 403
**สถานะ**: ✅ ผ่าน

### R5.16 ยืนยันส่งมอบล็อตบริษัท 1
**ทำ**: 'ดูรายการ' → 'แนบเอกสาร & ยืนยัน' → ① 'แนบแล้ว ✅' → 'วันเวลาที่ผู้รับมารับจริง' ค่าตั้งต้น 2026-10-04T01:47 → **ดับเบิลคลิก** 'ยืนยันส่งมอบสำเร็จ'
![](../shots/R5v2/R5.16-lot1-confirmed.png)
**ผลบนจอ**: toast **'ยืนยันส่งมอบ LOT-2569-003 แล้ว' 'เครื่อง 3 เครื่องส่งมอบแล้ว · ปลดล็อกรายการเบิก 9 รายการ'** · 'รอส่งมอบ 0' ('ไม่มีล็อตในแท็บ “รอส่งมอบ”') · ล็อตอยู่แท็บ 'ส่งมอบแล้ว' ป้าย 'ยืนยันแล้ว'
**ผลหลังบ้าน**: PATCH 1 ครั้ง (200) · lot `confirmed` confirmed_by ธุรการ 18:47:49 UTC delivered_at 18:47 · ① C1/C2/C4 `handed_over` · ② 9 แถว → `pending_approval` (fuel 10000 + allowance 7500 รายวัน ×3 + commission 50000 ×3) · superseded C4 ไม่แตะ · C5 ยัง `pending_warehouse_confirm` · ③ audit `confirm` 1 แถว: assetIdsHandedOver 3, expenseIdsUnlocked **9** (รายวัน **6**), revenueIdsCreated `[]`, revenueEligibleCaseIds `[]`, events `["lot.doc_attached","lot.confirmed"]` · ④ revenues **0** · แจ้งเตือน 1 แถวถึง `uat.finance` เท่านั้น 'LOT-2569-003 · บริษัท ยูเอที ลิสซิ่ง จำกัด · 3 เครื่อง — ยังไม่เกิดรายได้ในล็อตนี้ (รออนุมัติค่าตอบแทน)'
**skip reason**: audit ไม่มีฟิลด์เหตุผลที่ข้ามรายได้ (🐞 R5v2-B02) — ตรวจทางอ้อมว่าไม่ใช่ `field_days_not_settled` (settlement 3 แถวครบ)
**สถานะ**: ✅ ผ่าน + 🐞 R5v2-B02

### R5.17 หลังยืนยัน — ล็อตแก้ไม่ได้
**probe**: PATCH confirm → `LOT_ALREADY_CONFIRMED` · แนบ V1PATH → `LOT_ALREADY_CONFIRMED` · ล็อตใหม่ด้วย C1 → `ASSET_ALREADY_IN_LOT` · intake C1 → `ASSET_INVALID_STATUS` (handed_over)
![](../shots/R5v2/R5.17-lot1-docs.png)
**หน้าจอ**: การ์ดเหลือ 'ดูรายการ' + 'เอกสาร' · modal 'เอกสารที่แนบ — LOT-2569-003' 'เลขที่ใบส่งมอบ DLV-2569-003' 'ส่งมอบจริง 04/10/2569 01:47' 'ยืนยันเมื่อ 04/10/2569 01:47 · สมใจ ธุรการดี' · ชื่อเอกสารแสดงเป็น path ภายใน `handover-lots/15db3c66…/signed-doc/366c808c….pdf` (🐞 BUG-082) · รายละเอียดล็อตมี 'ดูเอกสารแนบ' ไม่มี 'แนบเอกสาร & ยืนยัน'
![](../shots/R5v2/R5.17-lot1-detail.png)
**สถานะ**: ✅ ผ่าน + 🐞 BUG-082

### R5.18 ล็อตบริษัท 2 — แนบไม่ครบ → ครบ
**ทำ**: แท็บ 'ส่งมอบแล้ว' → LOT-2569-004 'แนบเอกสาร' → modal 'แนบหลักฐานจัดส่ง — LOT-2569-004' → ① `R5-LOT-CO2-signed.pdf` → ปุ่มยืนยันยัง disabled
![](../shots/R5v2/R5.18-lot2-signed-only.png)
→ ปิด → API confirm → 400 **`LOT_MISSING_DELIVERY_PROOF`** → เปิดใหม่ → ② `R5-LOT-CO2-delivery-proof.png` → 'แนบแล้ว ✅' ×2 ปุ่ม enabled
![](../shots/R5v2/R5.18-lot2-docs-ready.png)
**ผลหลังบ้าน**: signed `5e644a29…` · proof `…/delivery-proof/230acf93….png` `30073ebe…` · audit `update` 2 แถว · ยัง `pending_delivery_proof`
**สถานะ**: ✅ ผ่าน

### R5.19 ยืนยันล็อตบริษัท 2 พร้อมกัน 2 ที่
![](../shots/R5v2/R5.19-lot2-race.png)
**ผล**: A 200 toast 'ยืนยันส่งมอบ LOT-2569-004 แล้ว / เครื่อง 1 เครื่องส่งมอบแล้ว · ปลดล็อกรายการเบิก 2 รายการ' · B 400 `LOT_ALREADY_CONFIRMED` · lot2 `confirmed` ครั้งเดียว · C5 `handed_over` · fuel 550000 (รายวัน) + commission 100000 → `pending_approval` · revenues 0 · audit `confirm` 1 แถว (unlocked 2) · แจ้งเตือน 1 แถวถึง finance 'LOT-2569-004 · บริษัท ยูเอที แคปปิตอล จำกัด · 1 เครื่อง — ยังไม่เกิดรายได้ในล็อตนี้ (รออนุมัติค่าตอบแทน)'
![](../shots/R5v2/R5.19-delivered-tab.png)
**สถานะ**: ✅ ผ่าน

## F. สิทธิ์ / scope

### R5.20 ผู้ใช้บริษัท
![](../shots/R5v2/R5.20-co1-warehouse.png)
**`uat.co1.mgr`**: แท็บ 'รับเข้าคลัง 0 · ในคลัง 0 · รอส่งมอบ 0 · ส่งมอบแล้ว 1' (LOT-2569-003 เท่านั้น) · ไม่มีปุ่ม action · รายละเอียดมีแค่ 'ดูเอกสารแนบ' (ไม่มี Export) · API: lots = 1 · LOT2 → 404 `LOT_NOT_FOUND` · C5 → 404 `ASSET_NOT_FOUND` · C1 200 แต่ imeiActual/teamName/agentName/rejectReason = null · PDF/xlsx/แนบ/ยืนยัน/รับเข้า → 403 · console 403 ของ `/api/teams`, `/api/finance-companies`, `/api/users` (🐞 BUG-081)
![](../shots/R5v2/R5.20-co2-warehouse.png)
**`uat.co2.admin`**: เห็น LOT-2569-004 เท่านั้น · LOT1 → 404 `LOT_NOT_FOUND` · C1 → 404 (ข้อความเดียวกับ id สุ่ม) · C5 ฟิลด์ภายใน null
**สถานะ**: ✅ ผ่าน + 🐞 BUG-081

### R5.21 ภายในแบบอ่านอย่างเดียว / ผู้จัดการ / พนักงาน
| ผู้ใช้ | ผล |
|---|---|
| `uat.finance` / `uat.account` | เมนู 'คลังสินค้า' · ส่งมอบแล้ว 2 · Export Excel/PDF มี (PDF 200) · intake 403 · console 403 `/api/users` (BUG-081) |
| `uat.exec` | เหมือนกัน + PDF 200 (🐞 BUG-084 — `44` §13 ไม่ได้ให้บริหาร) |
| `uat.mgr.in` / `uat.sup.in` / `uat.mgr.out` | **เมนู 'คลังสินค้า' โผล่** แต่หน้าแสดง 'ไม่มีสิทธิ์ใช้งาน…' · `GET /api/assets` / `/api/handover-lots` = 403 (🐞 BUG-076) |
| `uat.agent.in1` | ไม่มีเมนูคลัง (อยู่ `/dashboard`) · API 403 |

ภาพ `R5.21-finance-warehouse` `R5.21-finance-lot1-detail` `R5.21-account-warehouse` `R5.21-exec-warehouse` `R5.21-mgr.in-warehouse` `R5.21-sup.in-warehouse` `R5.21-mgr.out-warehouse` `R5.21-agent.in1-warehouse`
![](../shots/R5v2/R5.21-mgr.in-warehouse.png)
**สถานะ**: ✅ ผ่าน + 🐞 BUG-076 · BUG-084 (ยังอยู่)

## G. ตรวจปลายรอบ

### R5.22 แจ้งเตือนทั้งรอบ
**ผล**: 3 แถวพอดี — `asset.intake_rejected` → in1 (01:41) · `lot.confirmed` → finance ×2 (01:47 LOT-2569-003, 01:48 LOT-2569-004) · ไม่มีแจ้งตอนรับเข้า/สร้างล็อต/แนบ · กระดิ่ง finance '2 ยังไม่อ่าน' → คลิกไป `/finance?tab=revenue`
![](../shots/R5v2/R5.22-finance-bell.png)
**สถานะ**: ✅ ผ่าน

### R5.23 audit ทั้งรอบ
**ผล**: 18 แถว (ไม่นับ login) ทุกแถว actor role 'ธุรการ' — `status_change` assets 4 · `approve` case_evidences 4 · `reject` assets 1 · `create` handover_lots 2 · `update` handover_lots **5** (CO1 3: v2, v1, v2 · CO2 2) · `confirm` 2 · probe ที่ล้ม/คำขอ race ที่แพ้ ไม่มี audit
**สถานะ**: ✅ ผ่าน (ส่วนต่าง +1 จาก ⚠️3)

### R5.24 invariant ปลายรอบ
| ค่า | ได้ | คาด |
|---|---|---|
| revenues | 0 | 0 |
| assets handed_over / ไม่มี hash | 4 / 0 | 4 / 0 |
| lots confirmed / ไม่มีใบเซ็นรับ | 2 / 0 | 2 / 0 |
| expenses ทั้งหมด / locked / pending_approval / superseded | 16 / 0 / 15 / 1 | 16 / 0 / 15 / 1 |
| ผลรวม active | **950000** | 950000 |
| แถวรายวัน pending_approval | 9 | 9 |
| field_day_settlements | 3 | 3 |
| evidence approved / pending / rejected | 4 / 1 / 1 | 4 / 1 / 1 |
| imei_ok ทุกเครื่อง · photos C1/C2/C4/C5 | true · 7/2/2/2 | true · 7/2/2/2 |
| lot_seq / dlv_seq | 4 / 4 | 2 / 2 (⚠️ ต้นรอบค้าง 2) |

ไม่มี 500 (serverErrors ว่างทุกสคริปต์ · pm2 error log ไม่มีบรรทัดใหม่หลัง 00:35 ซึ่งเป็นของ R4) · console error มีแค่ 400 จาก probe ที่ตั้งใจ + 403 ของ BUG-081
**สถานะ**: ✅ ผ่าน

## ตารางปลายรอบ (ส่งต่อ R6)
| เคส | asset | ล็อต | evidence | expenses (active) | revenue |
|---|---|---|---|---|---|
| C1 | `handed_over` ปกติ รูป 7 | LOT-2569-003 / DLV-2569-003 (CO1 finance_pickup confirmed) | approved | 10000ร + 7500ร + 50000 = 67500 `pending_approval` | 0 |
| C2 | `handed_over` ตีกลับ→รับใหม่ รูป 2 | LOT-2569-003 | approved | 67500 `pending_approval` | 0 |
| C3 | — | — | pending | 10000ร + 7500ร + 20000 = 37500 `pending_approval` | — |
| C4 | `handed_over` อุปกรณ์ขาดหาย รูป 2 | LOT-2569-003 | v1 rejected · v2 approved | 67500 `pending_approval` (+ superseded 50000) | 0 |
| C5 | `handed_over` รูป 2 | LOT-2569-004 / DLV-2569-004 (CO2 we_deliver confirmed) | approved | 550000ร + 100000 = 650000 `pending_approval` | 0 |
| hotel in1 | — | — | — | 60000 `pending_approval` | — |
- รวม: expenses 16 · active 15 = **950000** (ผูกเคส 890000) · `pending_approval` 15 (รายวัน 9) · superseded 1 · `pending_warehouse_confirm` 0 · revenues 0 · audit รอบนี้ 18 · แจ้งเตือนรอบนี้ 3

## ไฟล์ใน Storage รอบนี้ (bucket `case-documents` — ห้ามลบ · 21 ไฟล์)
- รูปรับเข้าที่ใช้จริง 13: C1 7 (`assets/2666a107…/intake/*`) · C2 2 (`assets/98a74df2…/intake/{front/2544a8bc…,imei/d8db226c…}`) · C4 2 (`f4d7a2e9…`, `d7e4fc15…`) · C5 2 (`70ee75ff…`, `813d34ee…`)
- **ขยะ** (ไม่ถูกอ้างจาก DB) 4:
  - `assets/aa1a2872-d1c0-46c7-98a0-44c3f84fea1f/intake/front/69ba4721-5567-4c24-8eff-7c5693f3105b-R5-fake-photo.jpg` (C4 — ลบออกจากฟอร์มก่อนส่ง)
  - `assets/5cad8233-fbe1-4ba6-ab92-f886e4434689/intake/front/<uuid>-R5-fake-photo.jpg` (C5 — ถูก server ปัด · uuid ไม่ได้จด)
  - `handover-lots/15db3c66-d183-4a3a-bbb0-2d9decee40af/signed-doc/ffc7dd0c-3993-4476-9c97-dd7c86d693…pdf` (fake signed — ถูกปัด)
  - `handover-lots/15db3c66-d183-4a3a-bbb0-2d9decee40af/signed-doc/c4826624-a978-4a7b-af42-b93a3a4c68b3.pdf` (v2 ครั้งแรก — ถูกแทนแล้ว)
- เวอร์ชันเก่าที่ตั้งใจเก็บ 1: `…/signed-doc/778bc708-6e6b-4b6d-b37c-5a3dad55696f.pdf` (v1) · ใช้จริง 3: CO1 `366c808c….pdf` · CO2 `signed-doc/da84599f….pdf` + `delivery-proof/230acf93….png`

---

## 🐞 บั๊กที่พบ

### ใหม่
| รหัส | ระดับ | ชนิด | เรื่อง |
|---|---|---|---|
| R5v2-B01 | S5 | tooling | `uat/bin/restore.sh` (`pg_restore --clean`) ไม่ลบ sequence ที่สร้างแบบ dynamic หลัง snapshot (`seq_handover_lot_2569`/`_dlv_2569`) → เล่นรอบซ้ำแล้วเลขล็อตต่อจากรอบเก่า (ได้ 003/004 แทน 001/002) · golden/รอบถัดไปที่อ้างเลขล็อตต้องปรับ หรือให้ restore ลบ `seq_handover_*` ที่ไม่อยู่ใน dump |
| R5v2-B02 | S5 | code | audit `lot.confirmed` ไม่บันทึกเหตุผลที่รายได้ยังไม่เกิดต่อเคส (`blockedBy` จาก `evaluateRevenueTrigger`) — เก็บแค่ `revenueEligibleCaseIds []` ⇒ ตามรอยไม่ได้ว่าติดเกตไหน (เช่น `field_days_not_settled` กับ `expense_not_approved`) |

### เดิม — ยืนยันซ้ำว่ายังอยู่
BUG-074 (S3 รับเข้าได้โดยไม่กรอก IMEI) · BUG-075 (S4 ตีกลับไม่บันทึก IMEI ที่พบ) · BUG-076 (S3 ผู้จัดการ/หัวหน้าทีมเห็นเมนูคลังแต่ 403) · BUG-077 (S5 'วันที่รับเข้า' ไม่มีเวลา) · BUG-078 (S5 trim IMEI) · BUG-079 (S4 PDF ตัด 'ด' ท้าย 'จำกัด') · BUG-080 (S5 PDF ไม่มีวันนัดรับ) · BUG-081 (S5 403 ของ API เติมตัวกรอง) · BUG-082 (S5 modal เอกสารแสดง path) · BUG-083 (S5 IMEI รูปแบบผิดขึ้นข้อความ 'บันทึกค่าที่ตรวจจริงไว้แล้ว') · BUG-084 (S5 บริหาร Export ได้)
**แก้แล้วจริง**: BUG-071 (กระดิ่งธุรการไม่แจ้งปิดงานซ้ำ — เป็น 'ส่งหลักฐานใหม่แล้ว — UAT-CO1-004')

### ข้อสังเกตเอกสาร (ไม่ใช่บั๊กแอป)
- step sheet R5 v2 §0.6 id ของ asset ล้าสมัย (ดู ⚠️2) · §0.6 "ยังไม่มี sequence" ไม่จริงบนฐานนี้
- สคริปต์ `uat/bin/r5/s07.mjs`, `s15.mjs` เป็นรุ่นต่อ (b) ไม่ใช่รุ่นเต็ม — รอบถัดไปที่คัดลอกควรเขียนขั้นแรกกลับ (ใน `uat/bin/r5v2/` ทำแล้ว: `s08.mjs` มี probe รูปปลอม, `s15c.mjs` มี ปลอม→v1→v2)

## ❓ ต้องตัดสินใจ
- **❓-R5v2-1 เลขล็อตใน golden**: ยอมรับ `LOT-2569-003/004` สำหรับ R6+ (ก — แนะนำ ไม่ต้องเล่นใหม่ เพราะไม่กระทบเงิน) | ข แก้ `restore.sh` แล้ว restore `R4-end-v3` เล่น R5 ใหม่ให้ได้ 001/002
- เดิมจาก step sheet: ❓-R5-1 (ใช้ ก) · ❓-R5-2 / BUG-078 (trim IMEI) · ❓-R5-3 + BUG-076 (ผู้จัดการทีมกับงานคลัง)
