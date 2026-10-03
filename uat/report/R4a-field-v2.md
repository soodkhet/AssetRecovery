# R4a v2 — ภาคสนามบนมือถือ (พนักงานติดตามทรัพย์ `uat.agent.in1` / `uat.agent.in2` / `uat.agent.out1` + ธุรการ `uat.admin`)

> **เล่นใหม่หลังแก้ตามมติ PO 20 ข้อ** (`uat/PO-DECISIONS-2569-10-03.md`) — step sheet `uat/steps/R4.md` **v2** · golden `uat/DATASET.md` **v2** · รายงานรอบเก่า (ก่อนแก้) `uat/report/R4a-field.md` เก็บไว้เทียบ ไม่ได้เขียนทับ
> วันที่ทดสอบ: 03/10/2569 (พ.ศ.) 19:28–19:40 น. เวลาไทย (วันเดียวกันทั้งรอบ ⇒ fuel DAILY_FLAT 1 วัน + allowance 1 วัน/เคส ตาม golden) · snapshot ต้นรอบ: `R3-end-v2` · ปลายรอบ: orchestrator snapshot `R4a-end-v2` ได้
> ผู้เล่น: role agent ผ่าน Playwright (Chrome headless · จำลอง iPhone 14 · R4.11 ใช้ desktop 1440×900) · สคริปต์ `uat/bin/r4v2/s02…s11-*.mjs` (log `uat/bin/r4v2/run.log`) · ภาพ `uat/shots/R4v2/` (**54 ภาพ**)
> **ผล: ✅ 21 / 🐞 2 (S5 ทั้งคู่) / ⚠️ 0 / ❓ 0** (23 step R4.01–R4.23) · **ไม่มี 500 ตลอดรอบ** (pm2 log สะอาดตั้งแต่ 19:28) · console error มีแค่ `ERR_NAME_NOT_RESOLVED` (แผนที่ BUG-062 known), `ERR_INTERNET_DISCONNECTED` (ตั้งใจปิดเน็ต), 400 ของ autosave ที่ตั้งใจให้ถูกปัด (R4.20)
> T0 (UTC) สำหรับ query audit/noti: `2026-10-03 12:28:00+00` · อัปโหลดขึ้น Supabase Storage จริง **15 ไฟล์** (14 ไฟล์หลักฐานจริง + 1 ไฟล์ .mp4 ปลอมที่ server ปัด — ห้ามลบ)

## สรุปผลต่อ step

| Step | เรื่อง | ผล | Step | เรื่อง | ผล |
|---|---|---|---|---|---|
| R4.01 | fixture + baseline | ✅ | R4.13 | in2 รับ C3/C4 + จัดวันตอนเน็ตหลุด | ✅ |
| R4.02 | แดชบอร์ด (N/A) + รอรับงาน + กระดิ่ง | ✅ | R4.14 | probe scope ระหว่างพนักงาน | ✅ |
| R4.03 | รับ C1 (ดับเบิลคลิก) + แจ้งเตือน accepted | ✅ | R4.15 | GPS ไม่ให้สิทธิ์ + Draft ตอนเน็ตหลุด (BUG-053) | ✅ |
| R4.04 | รับ C2 ผ่าน modal | ✅ (BUG-065 known) | R4.16 | C3 ปิดไม่สำเร็จ + เหตุผลบังคับ + บันทึกเพิ่มเติม | ✅ |
| R4.05 | รับ C7 แล้วปล่อยไว้ | ✅ | R4.17 | C4 ปิดสำเร็จ (รูปสินค้า v1) | ✅ |
| R4.06 | จัดวันที่ C1 วันนี้ (+ probe เมื่อวาน) | ✅ (BUG-068 known) | R4.18 | in2 หน้าเบิก/รายได้/แดชบอร์ด | ✅ |
| R4.07 | เช็คอิน GPS C1 | ✅ (BUG-062 known) | R4.19 | out1 รับ/จัดวัน/เช็คอิน C5 | ✅ |
| R4.08 | probe หลักฐานไม่ครบ | ✅ | R4.20 | probe .mp4 ปลอม + path นอกขอบเขต | ✅ + 🐞 R4v2-B02 |
| R4.09 | probe ไฟล์ผิดชนิด (browser) | ✅ | R4.21 | C5 ปิดงานด้วย race 2 คำขอ | ✅ |
| R4.10 | แนบหลักฐาน + ปิดงาน C1 (ดับเบิลคลิก) | ✅ + 🐞 R4v2-B01 | R4.22 | out1 หน้าเบิก/รายได้/แดชบอร์ด | ✅ |
| R4.11 | C2 บน desktop + บันทึกเพิ่มเติม | ✅ | R4.23 | ธุรการเห็นงานรอรับเข้าคลัง | ✅ |
| R4.12 | in1 หน้าเบิก/รายได้/จบงาน/แดชบอร์ด | ✅ | | | |

## ผลยืนยันพฤติกรรมใหม่ตามมติ PO

| มติ | ผล | หลักฐาน |
|---|---|---|
| **Q2** คอมมิชชัน/เบี้ยเสี่ยงสร้างตอนปิดงาน + หน้า income/การ์ดตรง expense | ✅ สำเร็จ 3 แถว/เคส (fuel 20000 + allowance 15000 + commission 50000), C3 3 แถว (+no_success_fee 20000), C5 2 แถว (fuel 550000 + commission 100000) · income in1 ฿1,000 / in2 ฿500 + เบี้ยเสี่ยง ฿200 / out1 ฿1,000 = ตรง expense | R4.10, R4.16, R4.21, R4.12/18/22 |
| **Q13** server ตรวจไฟล์เอง | ✅ .mp4 ปลอม → autosave 400 `UPLOAD_FILE_TYPE_INVALID` toast 'ชนิดไฟล์ไม่รองรับ' · draft ไม่มีไฟล์ปลอม · path รูป C1 ยิงเข้า draft C5 → 400 `UPLOAD_PATH_OUT_OF_SCOPE` · `case_evidences.file_hashes` ครบทุกแถว (14 key) SHA-256 ตรง `SHA256SUMS-R4.tsv` ทุกไฟล์ | R4.10, R4.20 |
| **Q15** บันทึกเพิ่มเติมถูกเก็บ | ✅ C2 note = 'ลูกหนี้คืนเครื่องที่หน้าบ้าน กล่องและสายชาร์จครบ' · C3 note = 'นัดลูกหนี้ทางโทรศัพท์ไม่ได้ 3 ครั้ง' อยู่ใน `case_evidences.note` | R4.11, R4.16 |
| **Q16** ปิดไม่สำเร็จต้องเลือกเหตุผล | ✅ radiogroup 5 ปุ่ม · ไม่เลือก → 'ยังขาด: เหตุผลที่ไม่สำเร็จ' ไม่มี request · API ไม่มี failReason / 'other'+ว่าง → 400 `CLOSE_FAIL_REASON_REQUIRED` · เลือก 'อื่น ๆ' ว่าง → ยังขาด · ทำจริง `fail_reason=debtor_not_found` + detail | R4.16 |
| **Q17** แจ้งเตือน | ✅ accepted 11 แถว (ทีม A: mgr.in+sup.in ต่อเคส, C5: mgr.out 1) ไม่ซ้ำแม้ดับเบิลคลิก · ปิดสำเร็จ → `uat.admin` 4 แถว 'ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง' link `/warehouse` · C3 → closed_fail mgr.in+sup.in, expense queue mgr.in · **`uat.mgr.out` ได้ 0 แถวจากเคสทีม A** (กระดิ่ง 'ยังไม่มีการแจ้งเตือน' ก่อนรับ C5) | R4.03, R4.16, R4.19, R4.23 |
| **Q20** อัตราสำเร็จก่อนมีเคสปิด = N/A | ✅ in1/in2/out1 แดชบอร์ด 'N/A' · หลังปิด in1 100.00% (2/2), in2 50.00% (1/2), out1 100.00% (1/1) = ปิดสำเร็จ ÷ ปิดแล้ว | R4.02, R4.13, R4.19, R4.12/18/22 |
| **BUG-053** บันทึก Draft ล้มต้องไม่โชว์ toast สำเร็จ | ✅ ปิดเน็ต → 'บันทึก Draft' → toast 'เชื่อมต่อระบบไม่สำเร็จ / กรุณาลองใหม่' อย่างเดียว · dialog ยังเปิด | R4.15 |
| ข้อสังเกตจากโค้ด R4v2-A (toast ปิดงานไม่พูดถึงคอมมิชชัน) | **ยืนยัน** → R4v2-B01 | R4.10/11/16/17 |
| ข้อสังเกตจากโค้ด R4v2-D (ฟอร์มถือไฟล์ปลอมค้าง autosave ล้มซ้ำ) | **ยืนยัน** → R4v2-B02 (ข้อความที่พิมพ์ไม่หาย — ถูกบันทึกทันทีหลังลบไฟล์ปลอม) | R4.20 |
| known: R3-end-v2 ไม่มี `assignment.created` | ยืนยันตามคาด — กระดิ่ง in1 มีแค่ 'คำขอเปลี่ยนผู้รับผิดชอบหมดเวลารอคำตอบ' 1 แถว (ไม่นับเป็นบั๊ก) | R4.02 |

---

# คู่มือภาคสนาม (ทำตามได้บนมือถือ)

## A. เตรียม

### R4.01 ตรวจไฟล์ตัวอย่าง + สภาพฐานต้นรอบ
**ทำ**: `ls uat/fixtures/files/R4-*` (ครบ 16 ไฟล์ + `not-an-image.txt`) · `shasum -a 256` ทุกไฟล์เทียบ `SHA256SUMS-R4.tsv` → **ตรงทั้ง 16 ไฟล์** (MP4 magic `ftypisom`) · `select now()` = 12:28 UTC → T0
**ผลหลังบ้าน**: assignment 6 ใบ `pending_accept` (C1,C2,C7→in1 · C3,C4→in2 · C5→out1) · `check_ins/case_evidences/close_case_drafts/expenses/assets/advances/revenues` = 0 · payee 3 คน `is_verified=false` · ธุรการ manage `intake_asset` · การเงิน manage `approve_advance` · notifications เดิม 11 แถว
**สถานะ**: ✅ ผ่าน

## B. พนักงาน in1 (อนันต์ ตามทรัพย์) — C1, C2, C7

### R4.02 ดูหน้าแรก งานรอรับ และกระดิ่ง
**เมนู**: หน้าแรก → รอรับงาน → กระดิ่ง
![](../shots/R4v2/02-in1-dashboard.png)
![](../shots/R4v2/02-in1-pending.png)
![](../shots/R4v2/02-in1-bell.png)
**ผลบนจอ**: '3 รอรับงาน · 0 กำลังติดตาม · 0 สำเร็จ' · **'N/A' % ความสำเร็จสะสม** · '฿0.00 คอมมิชชั่นเดือนนี้' · การ์ด C7 'มอบหมายเมื่อ 03/10/2569 16:43', C2/C1 '15:41' ทุกใบ 'จะได้รับถ้าจบงานสำเร็จ ฿500.00' · กระดิ่ง '1 ยังไม่อ่าน' = 'คำขอเปลี่ยนผู้รับผิดชอบหมดเวลารอคำตอบ' (ข้อมูล R3)
**สถานะ**: ✅ ผ่าน (ไม่มี 'คุณได้รับมอบหมายเคสใหม่' = known ของ R3-end-v2)

### R4.03 รับงาน C1 (ทดสอบกดสองครั้งติด)
**เมนู**: รอรับงาน → การ์ด UAT-CO1-001 → 'รับงาน'
![](../shots/R4v2/03-c1-accepted.png)
**ทำ**: ดับเบิลคลิก 'รับงาน'
**ผลบนจอ**: toast 'รับงานแล้ว UAT-CO1-001 — ไปจัดวันที่ติดตามได้ที่แท็บ "รับงานแล้ว"' 1 ครั้ง · มี `POST …/accept` แค่ 1 คำขอ (ปุ่มล็อกหลังกด)
**ผลหลังบ้าน**: C1 `accepted_unscheduled` · audit `status_change` 1 แถว · noti `assignment.accepted` 'พนักงานกดรับงานแล้ว' body 'เคส UAT-CO1-001 — อนันต์ ตามทรัพย์ รับงานเมื่อ 03/10/2569 19:28' link `/cases/assign` → `uat.mgr.in` 1 + `uat.sup.in` 1 (ไม่ถึง in1/mgr.out)
**ตรวจหน้าจอผู้จัดการ**: `uat.mgr.in` กระดิ่งเห็น 'พนักงานกดรับงานแล้ว' → คลิกแล้วไป `/cases/assign`
![](../shots/R4v2/03-mgr-in-bell.png)
**สถานะ**: ✅ ผ่าน

### R4.04 รับงาน C2 จากหน้ารายละเอียด
**เมนู**: การ์ด UAT-CO1-002 → 'ดูรายละเอียด' → 'รับงาน'
![](../shots/R4v2/04-c2-detail.png)
**ผลบนจอ**: modal แสดง IMEI 356789100000029 · มูลหนี้ ฿24,900.00 · 'จะได้รับ (ถ้าจบงานสำเร็จ) ฿500.00' · toast 'รับงานแล้ว ไปจัดวันที่…' (ไม่มีเลขเคส = BUG-065 known)
**ผลหลังบ้าน**: C2 `accepted_unscheduled` · noti accepted → sup.in + mgr.in (2 แถว)
**สถานะ**: ✅ ผ่าน

### R4.05 รับงาน C7 แล้วปล่อยไว้
![](../shots/R4v2/05-pending-empty.png)
![](../shots/R4v2/05-in1-accepted.png)
**ผลบนจอ**: toast 'รับงานแล้ว UAT-CO2-007 …' · รอรับงาน 'ไม่มีเคสรอรับงาน' · แท็บ 'รับงานแล้ว' มี C7/C2/C1 ปุ่ม 'จัดวันที่'
**ผลหลังบ้าน**: C7 `accepted_unscheduled` · noti → sup.in + mgr.in · **ห้ามจัดวัน C7 จนจบ UAT**
**สถานะ**: ✅ ผ่าน

### R4.06 จัดวันที่ C1 เป็นวันนี้
**เมนู**: รับงานแล้ว → การ์ด C1 → 'จัดวันที่'
![](../shots/R4v2/06-c1-calendar.png)
![](../shots/R4v2/06-c1-confirm.png)
**ทำ**: ปุ่มวันที่ 2 (เมื่อวาน) `disabled=true` · คลิก 3 → 'ยืนยันเลือกวันนี้'
**ผลบนจอ**: toast 'จัดวันที่ติดตามแล้ว UAT-CO1-001 → 03/10/2569' · ป้าย 'วันส 03/10/2569' (BUG-068 known) · ปฏิทินแนะนำ 'มี บุญมี ภาคสนาม มีเคสในจังหวัดกรุงเทพมหานคร ด้วย…'
**ผลหลังบ้าน**: C1 `scheduled` order 1 · `cases.status=active`
**สถานะ**: ✅ ผ่าน

### R4.07 เริ่มงาน C1 + เช็คอิน GPS
**เมนู**: กำลังติดตาม → 'เริ่มงาน' → 'สำเร็จ' → 'แตะเพื่อเช็คอินตำแหน่งปัจจุบัน'
![](../shots/R4v2/07-c1-checkin.png)
**ผลบนจอ**: toast 'เช็คอินตำแหน่งปัจจุบันแล้ว' · 'จุดที่ 1: ที่อยู่ปัจจุบันของลูกหนี้ · 03/10/2569 19:29 · พิกัดล็อกไว้ แก้ไขไม่ได้' · ไม่มีขั้นจุดเริ่มเดินทาง (DAILY_FLAT) · แผนที่รูปเสีย (BUG-062 known)
**ผลหลังบ้าน**: `check_ins` C1 13.8166000/100.5612000 `address` · draft outcome `closed_success`
**สถานะ**: ✅ ผ่าน

### R4.08 ลองกดปิดงานทั้งที่หลักฐานยังไม่ครบ
![](../shots/R4v2/08-c1-missing.png)
**ผลบนจอ**: กล่องแดง 'ยังขาด: รูปถ่ายอย่างน้อย 1 รูป · วิดีโออย่างน้อย 1 คลิป · รูปสินค้ายืนยันอย่างน้อย 1 รูป' · ไม่มี request `/close`
**API**: 400 `CLOSE_PHOTO_REQUIRED` `missing=[CLOSE_PHOTO_REQUIRED, CLOSE_VIDEO_REQUIRED, CLOSE_PRODUCT_PHOTO_REQUIRED]` · expense/evidence ยัง 0
**สถานะ**: ✅ ผ่าน

### R4.09 ลองแนบไฟล์ที่ไม่ใช่รูป
![](../shots/R4v2/09-wrong-type.png)
**ผลบนจอ**: toast 'เพิ่มรูปถ่ายไม่สำเร็จ — “รูปถ่าย” รับเฉพาะไฟล์รูปภาพ — ไฟล์ not-an-image.txt ไม่รองรับ' · ไม่มีอัปโหลด
**สถานะ**: ✅ ผ่าน

### R4.10 แนบหลักฐาน C1 แล้วยืนยันปิดงาน
**ทำ**: รูปถ่าย ← `R4-C1-photo.jpg` · วิดีโอ ← `R4-C1-video.mp4` · รูปสินค้ายืนยัน ← `R4-C1-product.jpg` → ดับเบิลคลิก 'ยืนยันปิดงาน'
![](../shots/R4v2/10-c1-form.png)
![](../shots/R4v2/10-c1-closed.png)
**ผลบนจอ**: ไฟล์แนบแสดงเป็นไอคอน ไม่ใช่ภาพย่อ (BUG-067 known) · toast 'ปิดงานเรียบร้อย — ระบบสร้างรายการเบิกค่าน้ำมัน/เบี้ยเลี้ยงให้อัตโนมัติ' 1 ครั้ง (ไม่พูดถึงคอมมิชชั่น → R4v2-B01) · `POST /close` 1 คำขอ · 'จบงาน' มี C1 'ปิดงานเมื่อ 03/10/2569 19:29'
**ผลหลังบ้าน**:
- ก่อนกด: draft 3 path + `close_case_drafts.file_hashes` 3 key (server ตรวจตอน autosave) · หลังกด draft ถูกลบ
- assignment `closed_success` + `completed_at` · `cases.status=closed_success`
- `case_evidences` 1 แถว `pending` p=1 v=1 pp=1 **hashed=3** · SHA-256 ที่ server คำนวณ = `SHA256SUMS-R4.tsv` ทั้ง 3 ไฟล์ (c49a02…, 27de18…, bfa365…) · note NULL
- **expenses 3 แถว** fuel 20000 / allowance 15000 / **commission 50000** `pending_warehouse_confirm` expense_date 2026-10-03 · comp_plan_version 1 · approval_step_total 2
- asset C1 `pending_intake` · noti `uat.admin` 1 แถว 'ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง' link `/warehouse` (ไม่ถึง mgr/sup)
- ยิง `/close` ซ้ำ → 400 `ASSIGNMENT_INVALID_STATUS` · expense ยัง 3
**สถานะ**: ✅ ผ่าน + 🐞 R4v2-B01 (S5 ข้อความ toast)

### R4.11 ปิดงาน C2 บนคอมพิวเตอร์ + บันทึกเพิ่มเติม
![](../shots/R4v2/11-c2-desktop-accepted.png)
![](../shots/R4v2/11-c2-desktop-form.png)
![](../shots/R4v2/11-c2-desktop-closed.png)
**ทำ**: จัดวันที่วันนี้ → เริ่มงาน → สำเร็จ → เช็คอิน → แนบ C2 photo/video/product → 'บันทึกเพิ่มเติม' = 'ลูกหนี้คืนเครื่องที่หน้าบ้าน กล่องและสายชาร์จครบ' → ยืนยันปิดงาน
**ผลบนจอ**: sidebar 260px `fixed` · ข้อความ/ปุ่ม/toast ชุดเดียวกับมือถือ
**ผลหลังบ้าน**: 3 expenses 20000/15000/50000 `pending_warehouse_confirm` · asset C2 `pending_intake` · hashed=3 (SHA ตรง) · **`case_evidences.note` = 'ลูกหนี้คืนเครื่องที่หน้าบ้าน กล่องและสายชาร์จครบ'** · noti uat.admin 1 · C2 schedule_order 1 (C1 ปิดแล้ว)
**สถานะ**: ✅ ผ่าน

### R4.12 in1 ดูยอดเบิก / รายได้ / งานที่จบ / หน้าแรก
![](../shots/R4v2/12-in1-expenses.png)
![](../shots/R4v2/12-in1-income.png)
![](../shots/R4v2/12-in1-closed.png)
![](../shots/R4v2/12-in1-closed-detail.png)
![](../shots/R4v2/12-in1-dashboard.png)
**ผลบนจอ**:
- เบิกค่าใช้จ่าย 'ผูกกับเคส': **รอดำเนินการ ฿1,700.00** · อนุมัติแล้ว ฿0.00 · จัดกลุ่มต่อเคส C1/C2 '3 รายการ ฿850.00 รอยืนยันคืนคลัง' (แตะกลุ่มเพื่อดูรายการ 'ค่าน้ำมัน/เบี้ยเลี้ยง/คอมมิชชั่น') · 'เบิกแยก' ว่าง
- สรุปรายได้: 'รายได้รวม (คอมมิชชั่น) ฿1,000.00 จากเคสสำเร็จ 2 เคส' · เคสไม่สำเร็จ '฿0.00 (เบี้ยเสี่ยง)' · C1/C2 ฿500.00 ต่อเคส = **ตรง expense commission**
- จบงาน: ทั้งหมด 2 · สำเร็จ 2 · ไม่สำเร็จ 'ไม่พบเคสตามเงื่อนไขที่กรอง' · วันเวลา พ.ศ.
- หน้าแรก: '2 สำเร็จ' · **'100.00%'** · '฿1,000.00 คอมมิชชั่นเดือนนี้' · '1 เคสยังไม่ได้จัดวัน' (C7)
**สถานะ**: ✅ ผ่าน

## C. พนักงาน in2 (บุญมี ภาคสนาม) — C3 ไม่สำเร็จ, C4 สำเร็จ

### R4.13 รับงาน C3, C4 · จัดวันที่ตอนเน็ตหลุด
![](../shots/R4v2/13-in2-dashboard.png)
![](../shots/R4v2/13-in2-pending.png)
![](../shots/R4v2/13-offline-toast.png)
![](../shots/R4v2/13-in2-tracking.png)
**ผลบนจอ**: หน้าแรก 'N/A' · รับ C3/C4 toast มีเลขเคส · ปิดเน็ตแล้ว 'ยืนยันเลือกวันนี้' → toast 'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่' ไม่มี request · เปิดเน็ต → จัด C3 แล้ว C4 ('จะเป็นลำดับที่ 2')
**ผลหลังบ้าน**: ระหว่างเน็ตหลุด C3 ยัง `accepted_unscheduled` · สุดท้าย C3 order 1, C4 order 2 `scheduled` · noti C3 → mgr.in + sup.in · C4 → sup.in + mgr.in
**สถานะ**: ✅ ผ่าน

### R4.14 ตรวจว่าพนักงานแก้งานของคนอื่นไม่ได้
![](../shots/R4v2/14-in1-team-tab.png)
![](../shots/R4v2/14-out1-team-tab.png)
**ผล**: in1 `GET C4` 200 อ่านอย่างเดียว (Q9 ยอมรับ) · in1 checkin C4 → 404 `ASSIGNMENT_NOT_FOUND` · in1 close C4 → 404 · out1 `GET C1`/`GET C4` → 404 · แท็บ 'ทีม' in1 เห็นแค่ C7 ของตัวเอง (อ่านอย่างเดียว ไม่มีปุ่ม) · out1 'ทีมยังไม่มีเคสรอจัดวันที่' · expense = fuel 2/40000 · allowance 2/30000 · **commission 2/100000** · ไม่มีแถวเพิ่ม
**สถานะ**: ✅ ผ่าน

### R4.15 เช็คอินเมื่อปิดสิทธิ์ GPS + บันทึก Draft ตอนเน็ตหลุด
![](../shots/R4v2/15-gps-denied.png)
![](../shots/R4v2/15b-draft-offline.png)
**ผลบนจอ**: toast 'เช็คอินไม่สำเร็จ — อุปกรณ์ปิดสิทธิ์ตำแหน่งไว้ — เปิดสิทธิ์ตำแหน่งให้เบราว์เซอร์แล้วลองใหม่' · ไม่มี `POST …/checkin` · API 0,0 → 400 `CHECKIN_GPS_PERMISSION_DENIED` · 95,100 → 400 `REQUIRED_MISSING` (fields.latitude)
**BUG-053**: พิมพ์บันทึกเพิ่มเติม 'ทดสอบร่างตอนเน็ตหลุด' → ปิดเน็ต → 'บันทึก Draft' → **toast แดง 'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่' อย่างเดียว · dialog ยังเปิด** → เปิดเน็ต ลบข้อความทิ้ง (draft note ว่าง)
**ผลหลังบ้าน**: `check_ins` C3 = 0
**สถานะ**: ✅ ผ่าน (BUG-053 แก้แล้ว)

### R4.16 ปิดงาน C3 แบบไม่สำเร็จ (ต้องเลือกเหตุผล)
![](../shots/R4v2/16-fail-reason-missing.png)
![](../shots/R4v2/16-fail-reason-other-empty.png)
![](../shots/R4v2/16-c3-form.png)
![](../shots/R4v2/16-c3-closed-fail.png)
**ทำ**: การ์ด C3 ขึ้นป้าย 'Draft' ปุ่ม 'จบงาน' → 'ไม่สำเร็จ' → เช็คอิน → รูปถ่าย/วิดีโอ C3
**ผลบนจอ**: ไม่มีช่อง 'รูปสินค้ายืนยัน' · หัว 'เหตุผลที่ไม่สำเร็จ (บังคับ)' + radiogroup 5 ปุ่ม 'ไม่พบลูกหนี้ / ลูกหนี้ปฏิเสธคืน / ย้ายที่อยู่ติดต่อไม่ได้ / ทรัพย์สูญหายหรือเสียหาย / อื่น ๆ (ระบุ)' · ช่อง 'อธิบายเหตุผลเพิ่มเติม' placeholder 'อธิบายเพิ่มเติม (ไม่บังคับ)'
- **ไม่เลือกเหตุผล** → 'ยังขาด: เหตุผลที่ไม่สำเร็จ' · ไม่มี request `/close`
- **API** ไม่มี failReason → 400 `CLOSE_FAIL_REASON_REQUIRED` `missing=[CLOSE_FAIL_REASON_REQUIRED]` · `other`+ว่าง → 400 เหมือนกัน · expense/evidence C3 = 0
- **'อื่น ๆ (ระบุ)' ว่าง** → placeholder เปลี่ยนเป็น 'อธิบายเหตุผล (บังคับเมื่อเลือก “อื่น ๆ”)' · ยัง 'ยังขาด: เหตุผลที่ไม่สำเร็จ'
- ทำจริง: 'ไม่พบลูกหนี้' (`aria-checked=true`) · อธิบาย 'ไปบ้านตามที่อยู่ปัจจุบัน บ้านปิด เพื่อนบ้านแจ้งย้ายออกแล้ว' · บันทึกเพิ่มเติม 'นัดลูกหนี้ทางโทรศัพท์ไม่ได้ 3 ครั้ง' → toast 'ปิดงานเรียบร้อย…' · จบงาน แท็บ 'ไม่สำเร็จ' มี C3 'รออนุมัติจ่าย'
**ผลหลังบ้าน**: assignment/case `closed_fail` · evidence `closed_fail` pp=0 hashed=2 · **`fail_reason=debtor_not_found`** · detail/note ตามที่กรอก · **expenses 3 แถว `pending_approval`**: fuel 20000 / allowance 15000 / **no_success_fee 20000** · ไม่มี asset · check_in 13.6681000/100.6340000
**noti**: `case.closed_fail` 'ปิดงานไม่สำเร็จ' link `/cases/assign` → mgr.in + sup.in · `expense.case_bound_created` 'มีรายการเบิกใหม่รออนุมัติ' body '…มีรายการเบิก 3 รายการเข้าคิวอนุมัติ' link `/finance/approvals` → mgr.in เท่านั้น · **`uat.mgr.out` 0 แถว** — กระดิ่ง mgr.out '0 ยังไม่อ่าน · ยังไม่มีการแจ้งเตือน'
![](../shots/R4v2/16-mgr-out-bell.png)
**สถานะ**: ✅ ผ่าน

### R4.17 ปิดงาน C4 สำเร็จ (รูปสินค้า v1 — จะถูกตีกลับใน R4b)
![](../shots/R4v2/17-c4-form.png)
![](../shots/R4v2/17-c4-closed.png)
**ผลหลังบ้าน**: expenses `pending_warehouse_confirm` fuel 20000 `cd96ffe9-515b-46ab-b66c-5e8dd6ef33be` · allowance 15000 `db6f0455-5e66-427e-87e2-4a4e67718e58` · commission 50000 `9675c9c1-7446-4e4d-85e1-3ca179104d49` · asset C4 `pending_intake` (IMEI 356789100000045) · evidence `pending` hashed=3 (SHA ตรง) path:
`…/photo/44755bef-278b-4014-82b9-3133ea58fb45-R4-C4-photo.jpg` · `…/video/0789ce59-ee7d-437a-b343-584fbd31b9cc-R4-C4-video.mp4` · `…/product_photo/4ec05723-39bb-4815-886e-8a6cc07d1f19-R4-C4-product-v1.jpg` (prefix `cases/d4d82f78-7500-4e10-94ae-c703483b7272/field_evidence`) · noti uat.admin 1
**สถานะ**: ✅ ผ่าน

### R4.18 in2 ดูยอดเบิก / รายได้ / หน้าแรก
![](../shots/R4v2/18-in2-expenses.png)
![](../shots/R4v2/18-in2-expense-c3.png)
![](../shots/R4v2/18-in2-income.png)
![](../shots/R4v2/18-in2-dashboard.png)
**ผลบนจอ**: **รอดำเนินการ ฿1,400.00** · C3 '3 รายการ ฿550.00 รออนุมัติจ่าย' แตะแล้วเห็น '🛡️ เบี้ยเสี่ยง ฿200.00 · 🍽️ เบี้ยเลี้ยง ฿150.00 · ⛽ ค่าน้ำมัน ฿200.00' · C4 '3 รายการ ฿850.00 รอยืนยันคืนคลัง' · รายได้ 'รายได้รวม (คอมมิชชั่น) ฿500.00 จากเคสสำเร็จ 1 เคส' · เคสไม่สำเร็จ **'฿200.00 (เบี้ยเสี่ยง)'** · หน้าแรก **'50.00%'** '฿500.00 คอมมิชชั่นเดือนนี้'
**สถานะ**: ✅ ผ่าน

## D. พนักงาน out1 (ประเสริฐ รับเหมา — ทีม C แผนเหมา) — C5

### R4.19 รับงาน + จัดวันที่ + เช็คอิน C5
![](../shots/R4v2/19-out1-pending.png)
![](../shots/R4v2/19-c5-checkin.png)
**ผลบนจอ**: หน้าแรก 'N/A' · การ์ด 'จะได้รับถ้าจบงานสำเร็จ ฿1,000.00' · รับงาน/จัดวันที่/เช็คอิน toast ถูกต้อง
**ผลหลังบ้าน**: C5 `scheduled` · check_in 14.0640000/100.6460000 · noti accepted → **`uat.mgr.out` 1 แถว** (ไม่ถึง mgr.in/sup.in)
**สถานะ**: ✅ ผ่าน

### R4.20 ลองแนบวิดีโอปลอม (.mp4 ที่เป็นข้อความ) + path นอกขอบเขต
![](../shots/R4v2/20-fake-mp4-rejected.png)
**ทำ**: วิดีโอ ← `R4-fake-video.mp4`
**ผลบนจอ**: browser อัปโหลดขึ้น Storage 200 → autosave `POST …/close-draft` = **400 `UPLOAD_FILE_TYPE_INVALID`** → toast **'ชนิดไฟล์ไม่รองรับ — เนื้อไฟล์ไม่ตรงกับชนิดที่ช่องนี้รับ (เช่น รูปภาพ / วิดีโอ / เสียง / PDF) — กรุณาเลือกไฟล์ที่ถูกต้อง'** · `close_case_drafts` C5 videos ว่าง
**ข้อสังเกต R4v2-D (ยืนยัน)**: ฟอร์มยังถือไฟล์ปลอม (มีปุ่ม 'ลบวิดีโอลำดับที่ 1') → พิมพ์บันทึกเพิ่มเติมแล้ว blur → autosave 400 `UPLOAD_FILE_TYPE_INVALID` อีกครั้ง + toast เดิมซ้ำ · draft note ไม่ถูกบันทึก → กด 'ลบวิดีโอลำดับที่ 1' → autosave 200 ทันทีและบันทึก note ที่ค้างอยู่ (ข้อความไม่หาย) → ลบ note ทิ้ง → R4v2-B02
**probe path นอกขอบเขต**: out1 ส่ง path รูป C1 (`cases/a10492d4-…/photo/eac0fa4a-…-R4-C1-photo.jpg`) เข้า draft C5 → **400 `UPLOAD_PATH_OUT_OF_SCOPE`** 'ที่อยู่ไฟล์ไม่ถูกต้อง' · draft C5 ไม่เปลี่ยน
**object ปลอมค้างใน bucket (ห้ามลบ)**: `case-documents/cases/7de5741e-1dfd-4a5b-ad7b-7df4206d5314/field_evidence/video/aa8879c5-b474-4cd8-bf71-f8d170e48831-R4-fake-video.mp4`
**สถานะ**: ✅ ผ่าน (BUG-050 แก้แล้ว) + 🐞 R4v2-B02 (S5)

### R4.21 ปิดงาน C5 (ยิง 2 คำขอพร้อมกัน)
![](../shots/R4v2/21-c5-form.png)
![](../shots/R4v2/21-c5-closed.png)
**ทำ**: แนบ C5 photo/video/product.png ผ่านหน้าจอ (autosave 200 ×3, draft hashed=3) → อ่าน draft ผ่าน API → `Promise.all` 2 คำขอ `/close`
**ผล**: A = **200** (`events: case.closed_success, expense.case_bound_created`) · B = **400 `ASSIGNMENT_INVALID_STATUS`** · ไม่มี 500
**ผลหลังบ้าน**: evidence C5 **1 แถว** hashed=3 (image/png 25124 ไบต์ SHA ตรง) · **expenses 2 แถว** fuel **550000** + commission **100000** `pending_warehouse_confirm` (ไม่มี allowance) · approval_step_total = 2 ทั้งคู่ (ค่า default ตอนสร้าง — ดู "สิ่งที่ตัดสินเอง") · asset C5 `pending_intake` · noti uat.admin 1 (ไม่ซ้ำ) · draft 0
**สถานะ**: ✅ ผ่าน

### R4.22 out1 ดูยอดเบิก / รายได้ / หน้าแรก
![](../shots/R4v2/22-out1-expenses.png)
![](../shots/R4v2/22-out1-income.png)
![](../shots/R4v2/22-out1-dashboard.png)
**ผลบนจอ**: **รอดำเนินการ ฿6,500.00** · C5 '2 รายการ' แตะแล้ว '💰 คอมมิชชั่น ฿1,000.00 · ⛽ ค่าน้ำมัน ฿5,500.00' 'รอยืนยันคืนคลัง' · รายได้ '฿1,000.00 จากเคสสำเร็จ 1 เคส' · หน้าแรก **'100.00%'** '฿1,000.00 คอมมิชชั่นเดือนนี้'
**สถานะ**: ✅ ผ่าน

### R4.23 ธุรการเห็นงานรอรับเข้าคลัง (อ่านอย่างเดียว)
**เมนู**: `uat.admin` → กระดิ่ง → คลิก 'ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง'
![](../shots/R4v2/23-admin-bell.png)
![](../shots/R4v2/23-admin-warehouse.png)
**ผลบนจอ**: กระดิ่ง **4 แถว** 'ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง' (C5 19:39, C4 19:37, C2 19:30, C1 19:29) ป้าย 'ภาคสนาม' · คลิกแล้วไป `/warehouse` · การ์ด 'รับเข้าคลัง' **4** · ในคลัง/รอส่งมอบ/ส่งมอบแล้ว 0 · ตารางมี C1/C2/C4/C5 'รอรับเข้าคลัง' ปุ่ม 'รับเข้าคลัง'/'ตีกลับ' · **ไม่มี C3** · ไม่ได้กดรับเข้า (mutation เดียว = `PATCH /api/notifications/:id/read` จากการคลิกแถวแจ้งเตือน)
**สถานะ**: ✅ ผ่าน

---

## ตารางปลายรอบ R4a v2

**มอบหมาย**
| เคส | พนักงาน | assignment | case | scheduled / order |
|---|---|---|---|---|
| C1 UAT-CO1-001 | in1 | closed_success | closed_success | 2026-10-03 / 1 |
| C2 UAT-CO1-002 | in1 | closed_success | closed_success | 2026-10-03 / 1 |
| C3 UAT-CO2-003 | in2 | closed_fail | closed_fail | 2026-10-03 / 1 |
| C4 UAT-CO1-004 | in2 | closed_success | closed_success | 2026-10-03 / 2 |
| C5 UAT-CO2-005 | out1 | closed_success | closed_success | 2026-10-03 / 1 |
| C7 UAT-CO2-007 | in1 | accepted_unscheduled | approved | — |

**expenses (14 แถว · ผลรวม 960000 = golden ✅ · superseded 0)** — expense_date 2026-10-03 · comp_plan_version 1 · approval_step_total 2 ทุกแถว
| เคส | fuel | allowance | commission | no_success_fee | สถานะ |
|---|---|---|---|---|---|
| C1 | 20000 | 15000 | 50000 | — | pending_warehouse_confirm |
| C2 | 20000 | 15000 | 50000 | — | pending_warehouse_confirm |
| C3 | 20000 | 15000 | — | 20000 | pending_approval |
| C4 | 20000 | 15000 | 50000 | — | pending_warehouse_confirm |
| C5 | 550000 | — | 100000 | — | pending_warehouse_confirm |
รวมตามชนิด: fuel 5/630000 · allowance 4/60000 · commission 4/250000 · no_success_fee 1/20000

**assets**: C1 356789100000011 · C2 356789100000029 · C4 356789100000045 · C5 356789100000052 — ทั้งหมด `pending_intake`

**case_evidences (5 แถว ทั้งหมด `pending` · file_hashes ครบ 14 key)**
| เคส | outcome | p/v/pp | hashed | fail_reason | fail_reason_detail | note |
|---|---|---|---|---|---|---|
| C1 | closed_success | 1/1/1 | 3 | — | — | — |
| C2 | closed_success | 1/1/1 | 3 | — | — | ลูกหนี้คืนเครื่องที่หน้าบ้าน กล่องและสายชาร์จครบ |
| C3 | closed_fail | 1/1/0 | 2 | debtor_not_found | ไปบ้านตามที่อยู่ปัจจุบัน บ้านปิด เพื่อนบ้านแจ้งย้ายออกแล้ว | นัดลูกหนี้ทางโทรศัพท์ไม่ได้ 3 ครั้ง |
| C4 | closed_success | 1/1/1 | 3 | — | — | — |
| C5 | closed_success | 1/1/1 | 3 | — | — | — |

**invariant**: check_ins 5 · drafts 0 · revenues 0 · advances 0 · noti ในรอบ: `assignment.accepted` 11 · `case.closed_success` 4 (admin) · `case.closed_fail` 2 · `expense.case_bound_created` 1 (ตรง step sheet ทุกตัว) · audit ในรอบ (ไม่รวม login): status_change case_assignments 16 · create check_ins 5 · update close_case_drafts 28 · create expenses 14 (หลักฐาน/asset/expenseIds อยู่ใน `after_data` ของ status_change ปิดงาน)
**counts.sh**: assets 4 · audit_logs 234 · case_assignments 8 · case_evidences 5 · cases 8 · check_ins 5 · expenses 14 · notifications 29 · payee_profiles 3 (close_case_drafts/advances/revenues ไม่มีแถว)

## สิ่งที่ตัดสินเองระหว่างทาง
1. **probe BUG-053 ทำที่ C3 ใน R4.15** (ก่อนเช็คอินจริง) — note ชั่วคราวลบทิ้งแล้ว draft note ว่างก่อนกรอกจริงใน R4.16
2. **ยืนยัน R4v2-D ด้วยการพิมพ์บันทึกเพิ่มเติมแล้ว blur** ขณะฟอร์มถือไฟล์ปลอม (ไม่อัปโหลดไฟล์เพิ่ม → ไม่มี object ใหม่ใน bucket) แล้วลบข้อความทิ้งหลังลบไฟล์ปลอม — draft C5 note กลับเป็น NULL ก่อนแนบไฟล์จริง
3. **approval_step_total = 2 ทุกแถว** (รวม fuel C5 550000 ที่เกิน 5,000 บาท) — เป็นค่า default `@default(2)` ตอนสร้าง; โค้ด `lib/compensation/approval-queries.ts` resolve matrix ใหม่ (`flow.totalSteps`) ตอนอนุมัติ ⇒ ไม่นับเป็นบั๊กใน R4 · **R6 ต้องตรวจว่า fuel C5 ขึ้น 3 ขั้น (ถึงบริหาร)**
4. หน้า 'เบิกค่าใช้จ่าย' แสดงเป็นกลุ่มต่อเคส ('3 รายการ ฿850.00') ไม่ใช่ 6 แถวแบน — แตะกลุ่มแล้วเห็นป้ายชนิดครบ ถือว่าตรงความหมายของ step sheet
5. การ์ด 'กำลังติดตาม' ไม่มีเลขเคส → ระบุการ์ดด้วยชื่อลูกหนี้ (BUG-066 known)

## 🐞 บั๊กที่พบ

| รหัส | ระดับ / ชนิด | step | อาการ | คาดหวัง |
|---|---|---|---|---|
| **R4v2-B01** (= ข้อสังเกต R4v2-A) | S5 · code | R4.10, R4.11, R4.16, R4.17 | toast หลังปิดงานทุกเคสยังเขียน 'ระบบสร้างรายการเบิกค่าน้ำมัน/เบี้ยเลี้ยงให้อัตโนมัติ' แม้ระบบสร้าง `commission` (สำเร็จ) / `no_success_fee` (ไม่สำเร็จ) ด้วยแล้ว | ข้อความรวมคอมมิชชั่น/เบี้ยเสี่ยงตาม Q2 (`components/field/close-case-modal.tsx` ~บรรทัด 623) |
| **R4v2-B02** (= ข้อสังเกต R4v2-D) | S5 · code (UX) | R4.20 | หลัง server ปัดไฟล์ปลอม ฟอร์มยังถือไฟล์นั้น → การแก้ไขครั้งถัดไป (เช่น พิมพ์บันทึกเพิ่มเติม) autosave 400 `UPLOAD_FILE_TYPE_INVALID` ซ้ำ + toast ซ้ำ จนกว่าผู้ใช้จะกด 'ลบวิดีโอลำดับที่ 1' เอง (ข้อความที่พิมพ์ไม่หาย — ถูกบันทึกหลังลบ) | ถอดไฟล์ที่ server ปัดออกจากฟอร์มอัตโนมัติ หรือชี้ว่าต้องลบไฟล์ไหน |

บั๊กเดิมที่ยังเห็น (ไม่เปิดซ้ำ): BUG-062 แผนที่รูปเสีย · BUG-065 toast รับงานจาก modal ไม่มีเลขเคส · BUG-066 การ์ดไม่มีเลขเคส · BUG-067 ไฟล์แนบเป็นไอคอน · BUG-068 ป้าย 'วันส'

## ❓ ต้องตัดสินใจ
- ไม่มีข้อใหม่ใน R4a v2 · ส่งต่อให้ R6: ยืนยันจำนวนขั้นอนุมัติจริงของ fuel C5 (550000 > เพดาน 500000 ⇒ ควร 3 ขั้น) เพราะ `approval_step_total` ที่เก็บตอนสร้างเป็น 2

## ก่อน / หลังแก้ (เทียบ `R4a-field.md` รอบเก่า)

| พฤติกรรม | ก่อนแก้ (R4a v1) | หลังแก้ (R4a v2) |
|---|---|---|
| expense ตอนปิดงาน (Q2 / BUG-010) | มีแค่ fuel + allowance (9 แถว) · ไม่มี commission/no_success_fee | สำเร็จ 3 แถว / ไม่สำเร็จ 3 แถว / C5 2 แถว · 14 แถว รวม 960000 = golden |
| หน้า 'สรุปรายได้' / การ์ด (BUG-054) | แสดงคอมมิชชันจากพรีวิวแผน ไม่ตรง expense จริง | ตรง expense commission/no_success_fee ที่ active |
| .mp4 ปลอม (Q13 / BUG-050) | ถูกรับเข้า draft และหลักฐาน ไม่มีคำเตือน | server ปัด `UPLOAD_FILE_TYPE_INVALID` + toast 'ชนิดไฟล์ไม่รองรับ' · draft ไม่มีไฟล์ปลอม |
| path ไฟล์ของเคสอื่น (Q13) | ไม่ตรวจ | `UPLOAD_PATH_OUT_OF_SCOPE` |
| hash หลักฐาน (หนี้ #1) | ไม่มี SHA-256 ฝั่ง server | `case_evidences.file_hashes` {sha256, mimeType, sizeBytes} ครบทุกไฟล์ ตรง fixture |
| บันทึกเพิ่มเติม (Q15 / BUG-048) | หายหลังยืนยันปิดงาน | เก็บใน `case_evidences.note` |
| ปิดไม่สำเร็จ (Q16 / BUG-057) | ไม่มีช่องเหตุผล | radiogroup 5 เหตุผลบังคับ + `CLOSE_FAIL_REASON_REQUIRED` · 'อื่น ๆ' ต้องอธิบาย |
| บันทึก Draft ตอนเน็ตหลุด (BUG-053) | toast เขียว 'บันทึก Draft แล้ว' ทั้งที่ล้ม | toast แดง 'เชื่อมต่อระบบไม่สำเร็จ' อย่างเดียว dialog ยังเปิด |
| แจ้งเตือน (Q17 / BUG-064) | ไม่มี accepted · mgr.out ได้แจ้งเตือนเคสทีม A | accepted ถึงผู้มอบหมาย+หัวหน้า/ผู้จัดการ · ธุรการได้ 'รอรับทรัพย์เข้าคลัง' · mgr.out 0 แถวจากทีม A |
| อัตราสำเร็จก่อนมีเคสปิด (Q20) | '-' | 'N/A' · หลังปิด = ปิดสำเร็จ ÷ ปิดแล้ว |
| ธุรการเห็นงานรอรับเข้าคลัง (Q1) | ไม่มี step | กระดิ่ง 4 แถว → `/warehouse` การ์ด 'รับเข้าคลัง' 4 ไม่มี C3 |
