# R4a v3 — ภาคสนามบนมือถือ (`uat.agent.in1` / `uat.agent.in2` / `uat.agent.out1` + ธุรการ `uat.admin` + Superadmin `admin`)

> เล่นใหม่หลัง merge **มติ PO Q21**: ค่าน้ำมันเหมาจ่าย + เบี้ยเลี้ยง คิดวันละครั้งต่อพนักงาน โดย job `daily_field_allowance` · step sheet `uat/steps/R4.md` **v3** · golden `uat/DATASET.md` **v3**
> วันที่ทดสอบ: **04/10/2569** 00:40–00:49 น. เวลาไทย (เช็คอินทั้ง 5 ครั้งอยู่ในวันไทย 2026-10-04) · ต้นรอบ: `R3-end-v3b` (ฐานที่ orchestrator ซ่อมแล้ว) · ปลายรอบ: orchestrator snapshot `R4a-end-v3` ได้ (เล่นถึง R4.23b แล้ว)
> ผู้เล่น: role agent ผ่าน Playwright (Chrome headless · จำลอง iPhone 14 · R4.11 ใช้ desktop 1440×900) · สคริปต์ `uat/bin/r4v3/s02…s11b-*.mjs` + probe อ่านอย่างเดียว `p00`/`p01`/`p02` · log `uat/bin/r4v3/run.log` · ภาพ `uat/shots/R4v3/` (**59 ภาพ**)
> **ผล: ✅ 24 / 🐞 2 ใหม่ (S4 ทั้งคู่) + 1 env (fixed) / ⚠️ 0 / ❓ 1** (24 step R4.01–R4.23b) · **หลังซ่อมฐานไม่มี 500 เลย** (pm2 log สะอาดตั้งแต่ 00:40) · console error มีแค่ `ERR_INTERNET_DISCONNECTED` (ตั้งใจปิดเน็ต), 400 ของ autosave ที่ตั้งใจให้ถูกปัด (R4.20), 404 ของ `/finance/approvals` (R4v3-B03)
> T0 (UTC) = `2026-10-03 17:40:00+00` · อัปโหลดขึ้น Supabase Storage จริง **15 ไฟล์** (14 ไฟล์หลักฐานจริง + 1 ไฟล์ .mp4 ปลอมที่ server ปัด — ห้ามลบ)

## สรุปผลต่อ step

| Step | เรื่อง | ผล | Step | เรื่อง | ผล |
|---|---|---|---|---|---|
| R4.01 | fixture + baseline | ✅ (ครั้งแรก 🐞 R4v3-B01 env — fixed) | R4.13 | in2 รับ C3/C4 + จัดวันตอนเน็ตหลุด | ✅ |
| R4.02 | แดชบอร์ด (N/A) + รอรับงาน + กระดิ่ง | ✅ | R4.14 | probe scope ระหว่างพนักงาน | ✅ |
| R4.03 | รับ C1 (ดับเบิลคลิก) + แจ้งเตือน accepted | ✅ | R4.15 | GPS ไม่ให้สิทธิ์ + Draft ตอนเน็ตหลุด | ✅ |
| R4.04 | รับ C2 ผ่าน modal | ✅ (toast มีเลขเคสแล้ว) | R4.16 | C3 ไม่สำเร็จ + เหตุผลบังคับ + บันทึกเพิ่มเติม | ✅ |
| R4.05 | รับ C7 แล้วปล่อยไว้ | ✅ | R4.17 | C4 ปิดสำเร็จ (รูปสินค้า v1) | ✅ |
| R4.06 | จัดวันที่ C1 วันนี้ (+ probe เมื่อวาน) | ✅ | R4.18 | in2 หน้าเบิก/รายได้/แดชบอร์ด | ✅ |
| R4.07 | เช็คอิน GPS C1 | ✅ | R4.19 | out1 รับ/จัดวัน/เช็คอิน C5 | ✅ |
| R4.08 | probe หลักฐานไม่ครบ | ✅ | R4.20 | .mp4 ปลอม + path นอกขอบเขต | ✅ |
| R4.09 | probe ไฟล์ผิดชนิด (browser) | ✅ | R4.21 | C5 ปิดงานด้วย race 2 คำขอ | ✅ |
| R4.10 | แนบหลักฐาน + ปิดงาน C1 (ดับเบิลคลิก) | ✅ | R4.22 | out1 หน้าเบิก/รายได้/แดชบอร์ด | ✅ |
| R4.11 | C2 บน desktop + บันทึกเพิ่มเติม | ✅ | R4.23 | ธุรการเห็นงานรอรับเข้าคลัง | ✅ |
| R4.12 | in1 หน้าเบิก/รายได้/จบงาน/แดชบอร์ด | ✅ | **R4.23b** | **settle รายวัน (job)** | ✅ + 🐞 R4v3-B02, B03 |

## ผลยืนยันพฤติกรรมตามที่สั่งให้ตรวจ

| เรื่อง | ผล | หลักฐาน |
|---|---|---|
| ปิดงานไม่สร้างค่าน้ำมัน/เบี้ยเลี้ยง | ✅ ก่อน R4.23b มี expense 5 แถว = commission 4 (250000) + no_success_fee 1 (20000) · fuel/allowance 0 | R4.10, R4.14, ก่อน R4.23b |
| หน้าเบิกแสดง "รอคำนวณหลังจบวัน" | ✅ in1/in2/out1 เห็นกล่อง 'ค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยง — รอคำนวณหลังจบวัน' + 'วันที่ลงพื้นที่: 04/10/2569' (ไม่มียอดประมาณ) · API `pendingFieldDates=["2026-10-04"]` · หลัง settle กล่องหาย + `[]` | R4.12, R4.18, R4.22, R4.23b |
| toast แสดงรายการที่สร้างจริง | ✅ 'ระบบสร้างรายการเบิกให้อัตโนมัติ: คอมมิชชั่น ฿500.00' (C1/C2/C4) · 'เบี้ยเสี่ยง ฿200.00' (C3) · C5 API `createdExpenses=[commission 100000]` | R4.10, R4.11, R4.16, R4.17, R4.21 |
| C3 ต้องเลือกเหตุผลไม่สำเร็จ | ✅ radiogroup 5 ปุ่ม · ไม่เลือก → 'ยังขาด: เหตุผลที่ไม่สำเร็จ' ไม่มี request · API ไม่มีเหตุผล / 'other'+ว่าง → 400 `CLOSE_FAIL_REASON_REQUIRED` · 'อื่น ๆ' ว่าง → ยังขาด · จริง `debtor_not_found` | R4.16 |
| บันทึกเพิ่มเติมถูกเก็บ | ✅ C2 / C3 `case_evidences.note` ตรงที่กรอก · C3 `fail_reason_detail` ตรง | R4.11, R4.16 |
| ไฟล์ปลอมถูก server ปัด (ฟอร์มเอาไฟล์ออกเอง) | ✅ autosave 400 `UPLOAD_FILE_TYPE_INVALID` · toast 'ไฟล์ "R4-fake-video.mp4" ถูกปฏิเสธ — นำออกจากฟอร์มแล้ว …' · ฟอร์มไม่มีวิดีโอค้าง (ปุ่ม 'ลบวิดีโอลำดับที่ 1' = 0) · autosave ถัดไป 200 ⇒ **R4v2-D แก้แล้ว** · path รูป C1 → draft C5 = 400 `UPLOAD_PATH_OUT_OF_SCOPE` | R4.20 |
| แจ้งเตือนถูกคน | ✅ accepted 11 แถว (ทีม A: mgr.in + sup.in ต่อเคส · C5: mgr.out 1) ไม่ซ้ำแม้ดับเบิลคลิก · closed_success 4 → `uat.admin` · closed_fail 2 → mgr.in + sup.in · expense queue 1 → mgr.in · `uat.mgr.out` ได้ 0 แถวจากทีม A | R4.03–R4.05, R4.13, R4.16, R4.19, R4.23 |
| R4.23b settle รายวัน | ✅ fds 3 แถว / expense รายวัน 9 แถว ตรง golden · ผลรวมต่อพนักงาน = อัตราเต็ม · สั่งซ้ำนาทีเดียวกัน `duplicate:true` · นาทีใหม่ `settled:0` · วันอนาคต/วันผิด 400 · การเงิน 403 | R4.23b |
| R4v3-A (settle วันนี้ เช็คอินที่มาหลังไม่ได้ส่วนแบ่ง) | **ไม่ได้ทดสอบจริง** (กติกาห้ามเช็คอินหลัง settle) — ตามโค้ด/สเปคเป็นพฤติกรรมตั้งใจ · ยืนยันว่าไม่มีคำเตือนใดใน response ของ dev trigger | R4.23b |
| R4v3-B (job ไม่ส่งแจ้งเตือน) | **ยืนยัน** — notifications ก่อน/หลัง job = 29/29 · แจ้งเตือนตอนปิด C3 บอก '1 รายการ' แต่คิว mgr.in มี 3 | R4.16, R4.23b |
| R4v3-C (รายได้/แดชบอร์ดนับแค่คอมมิชชั่น) | **ยืนยัน** — income + 'คอมมิชชั่นเดือนนี้' ของทั้ง 3 คนไม่เปลี่ยนหลัง settle (in1 ฿1,000 · in2 ฿500 + ฿200 · out1 ฿1,000) | R4.23b |
| known จากรอบก่อน | BUG-065 (toast จาก modal ไม่มีเลขเคส) **ไม่เกิดแล้ว** · BUG-068 ป้ายวันเป็น 'วันอาทิตย์ 04/10/2569' **ไม่เกิดแล้ว** · BUG-067 รูปเป็นภาพย่อ (วิดีโอเป็นไอคอน+ชื่อไฟล์) · BUG-062 ไม่มี console `ERR_NAME_NOT_RESOLVED` รอบนี้ | ภาพ 10-c1-form, 06-c1-tracking |

---

# คู่มือภาคสนาม (ทำตามได้บนมือถือ)

## A. เตรียม

### R4.01 ตรวจไฟล์ตัวอย่าง + สภาพฐานต้นรอบ
**ทำ**: `shasum -a 256` ไฟล์ R4 ทั้ง 16 ไฟล์เทียบ `SHA256SUMS-R4.tsv` → **ตรงทั้ง 16** · `TODAY` = 2026-10-04 · T0 = 17:40 UTC
**ผลหลังบ้าน**: assignment 6 ใบ `pending_accept` · check_ins/case_evidences/close_case_drafts/expenses/field_day_settlements/assets/advances/revenues = 0 · jobs `daily_field_allowance` = 0 · payee 3 คน `is_verified=false` · ธุรการ manage `intake_asset` · การเงิน manage `approve_advance` · `manage_jobs` view สำหรับ การเงิน/บัญชี/บริหาร · notifications 11 · role_capabilities 79 · `prisma migrate status` = up to date
**ประวัติ**: ครั้งแรก (00:34) พบ **R4v3-B01** — ฐานยังไม่ลง migration 3 ตัว (`expenses.receipt_file_hash`/`field_day_settlement_id` ไม่มี → `GET /api/field/expenses` 500) · หยุดก่อนเขียนข้อมูล · orchestrator ซ่อม (ลบตารางกำพร้า → resolve → `db:deploy` 33 ตัว → seed → snapshot `R3-end-v3b`) แล้วเริ่มใหม่ 00:40
**สถานะ**: ✅ ผ่าน (R4v3-B01 = env fixed)

## B. พนักงาน in1 (อนันต์ ตามทรัพย์) — C1, C2, C7

### R4.02 ดูหน้าแรก งานรอรับ และกระดิ่ง
**เมนู**: หน้าแรก → รอรับงาน → กระดิ่ง
![](../shots/R4v3/02-in1-dashboard.png)
![](../shots/R4v3/02-in1-pending.png)
![](../shots/R4v3/02-in1-bell.png)
**ผลบนจอ**: '3 รอรับงาน · 0 กำลังติดตาม · 0 สำเร็จ' · **'N/A' % ความสำเร็จสะสม** · '฿0.00 คอมมิชชั่นเดือนนี้' · การ์ด C7 'มอบหมายเมื่อ 03/10/2569 16:43', C2/C1 '15:41' ทุกใบ 'จะได้รับถ้าจบงานสำเร็จ ฿500.00' · กระดิ่ง '1 ยังไม่อ่าน' = 'คำขอเปลี่ยนผู้รับผิดชอบหมดเวลารอคำตอบ' (ข้อมูล R3 — known)
**สถานะ**: ✅ ผ่าน

### R4.03 รับงาน C1 (กดสองครั้งติด)
**เมนู**: รอรับงาน → การ์ด UAT-CO1-001 → 'รับงาน' (ดับเบิลคลิก)
![](../shots/R4v3/03-c1-accepted.png)
![](../shots/R4v3/03-mgr-in-bell.png)
**ผลบนจอ**: toast 'รับงานแล้ว UAT-CO1-001 — ไปจัดวันที่ติดตามได้ที่แท็บ "รับงานแล้ว"' 1 ครั้ง · ส่ง POST /accept แค่ 1 ครั้ง (ปุ่มกันกดซ้ำ)
**ผลหลังบ้าน**: C1 `accepted_unscheduled` · audit `status_change` 1 แถว · noti `assignment.accepted` 'พนักงานกดรับงานแล้ว' body '…รับงานเมื่อ 04/10/2569 00:40' → `uat.mgr.in` 1 + `uat.sup.in` 1 · กระดิ่ง mgr.in เห็นแถว → คลิกไป `/cases/assign`
**สถานะ**: ✅ ผ่าน

### R4.04 รับงาน C2 ผ่านหน้ารายละเอียด
![](../shots/R4v3/04-c2-detail.png)
**ทำ**: 'ดูรายละเอียด' → ตรวจ IMEI 356789100000029 / มูลหนี้ ฿24,900.00 (มีทั้งคู่) → 'รับงาน'
**ผลบนจอ**: toast 'รับงานแล้ว UAT-CO1-002 — …' (มีเลขเคสแล้ว — BUG-065 ไม่เกิด)
**ผลหลังบ้าน**: C2 `accepted_unscheduled` · noti → mgr.in + sup.in
**สถานะ**: ✅ ผ่าน

### R4.05 รับงาน C7 แล้วปล่อยไว้
![](../shots/R4v3/05-pending-empty.png)
![](../shots/R4v3/05-in1-accepted.png)
**ผลบนจอ**: 'ไม่มีเคสรอรับงาน' · แท็บ 'รับงานแล้ว' มี 3 ใบพร้อม 'รับงานเมื่อ 04/10/2569 00:4x' · **C7 ห้ามจัดวันจนจบ UAT**
**สถานะ**: ✅ ผ่าน

### R4.06 จัดวันที่ C1 = วันนี้
![](../shots/R4v3/06-c1-calendar.png)
![](../shots/R4v3/06-c1-tracking.png)
**ทำ**: 'รับงานแล้ว' → C1 'จัดวันที่' → (วันที่ 3 = เมื่อวาน กดไม่ได้ ✅) → วันที่ 4 → 'ยืนยันเลือกวันนี้'
**ผลบนจอ**: toast 'จัดวันที่ติดตามแล้ว UAT-CO1-001 → 04/10/2569' · หัวกลุ่ม 'วันอาทิตย์ 04/10/2569'
**ผลหลังบ้าน**: C1 `scheduled` order 1 · `cases.status` `active`
**สถานะ**: ✅ ผ่าน

### R4.07 เช็คอิน GPS ที่บ้านลูกหนี้
![](../shots/R4v3/07-c1-checkin.png)
**ทำ**: 'กำลังติดตาม' → 'เริ่มงาน' → 'สำเร็จ' → 'แตะเพื่อเช็คอินตำแหน่งปัจจุบัน'
**ผลบนจอ**: toast 'เช็คอินตำแหน่งปัจจุบันแล้ว' · '13.816600, 100.561200' · 'จุดที่ 1: ที่อยู่ปัจจุบันของลูกหนี้ · 04/10/2569 00:41 · พิกัดล็อกไว้ แก้ไขไม่ได้' · ไม่มีขั้นจุดเริ่มเดินทาง
**ผลหลังบ้าน**: `check_ins` C1 13.8166000/100.5612000 `address` · draft `closed_success`
**สถานะ**: ✅ ผ่าน

### R4.08 ลองปิดงานตอนหลักฐานยังไม่ครบ
![](../shots/R4v3/08-c1-missing.png)
**ผลบนจอ**: กล่องแดง 'ยังขาด: รูปถ่ายอย่างน้อย 1 รูป · วิดีโออย่างน้อย 1 คลิป · รูปสินค้ายืนยันอย่างน้อย 1 รูป' · ไม่มี request /close
**API**: 400 `CLOSE_PHOTO_REQUIRED` `missing=[PHOTO, VIDEO, PRODUCT_PHOTO]` · ไม่มีแถวใหม่
**สถานะ**: ✅ ผ่าน

### R4.09 ลองแนบไฟล์ที่ไม่ใช่รูป
![](../shots/R4v3/09-wrong-type.png)
**ผลบนจอ**: toast 'เพิ่มรูปถ่ายไม่สำเร็จ' + '“รูปถ่าย” รับเฉพาะไฟล์รูปภาพ — ไฟล์ not-an-image.txt ไม่รองรับ' · ไม่มีอัปโหลด
**สถานะ**: ✅ ผ่าน

### R4.10 แนบหลักฐาน C1 แล้วปิดงาน
![](../shots/R4v3/10-c1-form.png)
![](../shots/R4v3/10-c1-closed.png)
**ทำ**: รูปถ่าย `R4-C1-photo.jpg` · วิดีโอ `R4-C1-video.mp4` · รูปสินค้ายืนยัน `R4-C1-product.jpg` → ดับเบิลคลิก 'ยืนยันปิดงาน'
**ผลบนจอ**: รูปเป็นภาพย่อ วิดีโอเป็นไอคอน+ชื่อไฟล์ · toast **'ปิดงานเรียบร้อย' + 'ระบบสร้างรายการเบิกให้อัตโนมัติ: คอมมิชชั่น ฿500.00'** · POST /close 1 ครั้ง · 'จบงาน' 'ปิดงานเมื่อ 04/10/2569 00:41'
**ผลหลังบ้าน**: ก่อนกด draft 3 path + `file_hashes` 3 key · หลังกด draft ถูกลบ · assignment/case `closed_success` · `case_evidences` `pending` p1 v1 pp1 hashed 3 · SHA-256 ของ server ตรง `SHA256SUMS-R4.tsv` ทั้ง 3 · **expense 1 แถว commission 50000 `pending_warehouse_confirm`** src `compensation_plan` daily=f date 2026-10-04 plan v1 step_total 2 · asset `pending_intake` · noti `uat.admin` 'ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง' link `/warehouse` · ยิง close ซ้ำ → 400 `ASSIGNMENT_INVALID_STATUS`, expense ยัง 1
**สถานะ**: ✅ ผ่าน

### R4.11 ปิดงาน C2 บนคอมพิวเตอร์ + บันทึกเพิ่มเติม
![](../shots/R4v3/11-c2-desktop-form.png)
![](../shots/R4v3/11-c2-desktop-closed.png)
**ทำ**: desktop (sidebar 260px fixed) → จัดวันที่วันนี้ → เริ่มงาน → สำเร็จ → เช็คอิน → แนบ 3 ไฟล์ → 'บันทึกเพิ่มเติม' = 'ลูกหนี้คืนเครื่องที่หน้าบ้าน กล่องและสายชาร์จครบ' → 'ยืนยันปิดงาน'
**ผลบนจอ**: ข้อความ/ปุ่ม/toast ชุดเดียวกับมือถือ ('…คอมมิชชั่น ฿500.00')
**ผลหลังบ้าน**: เหมือน C1 + **`case_evidences.note` = ข้อความที่กรอก** · expense commission 50000 1 แถว · asset `pending_intake` · noti admin 1
**สถานะ**: ✅ ผ่าน

### R4.12 in1 ดูหน้าเบิก / สรุปรายได้ / จบงาน / หน้าแรก (ก่อน settle)
![](../shots/R4v3/12-in1-expenses-pending-day.png)
![](../shots/R4v3/12-in1-income.png)
![](../shots/R4v3/12-in1-closed.png)
![](../shots/R4v3/12-in1-dashboard.png)
**ผลบนจอ**: เบิก 'ผูกกับเคส' **'รอดำเนินการ' ฿1,000.00** · C1/C2 'คอมมิชชั่น' ฿500.00 'รอยืนยันคืนคลัง' · ไม่มีค่าน้ำมัน/เบี้ยเลี้ยง · **กล่อง 'ค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยง — รอคำนวณหลังจบวัน' + 'วันที่ลงพื้นที่: 04/10/2569'** · API `pendingFieldDates=["2026-10-04"]` · income 'รายได้รวม (คอมมิชชั่น)' ฿1,000.00 'จากเคสสำเร็จ 2 เคส' · จบงาน 2 · หน้าแรก '2 สำเร็จ' '100.00%' '฿1,000.00 คอมมิชชั่นเดือนนี้'
**สถานะ**: ✅ ผ่าน

## C. พนักงาน in2 (บุญมี ภาคสนาม) — C3 ไม่สำเร็จ, C4 สำเร็จ

### R4.13 รับงาน C3, C4 และจัดวันที่ (ลองตอนเน็ตหลุด)
![](../shots/R4v3/13-offline-toast.png)
![](../shots/R4v3/13-in2-tracking.png)
**ผลบนจอ**: หน้าแรก 'N/A' · รับ 2 ใบ toast มีเลขเคส · ปิดเน็ตแล้ว 'ยืนยันเลือกวันนี้' → toast 'เชื่อมต่อระบบไม่สำเร็จ / กรุณาลองใหม่' · C3 ยัง `accepted_unscheduled` · เปิดเน็ต → จัด C3 (ลำดับ 1) แล้ว C4 ('จะเป็นลำดับที่ 2')
**ผลหลังบ้าน**: C3/C4 `scheduled` 1/2 · noti accepted → mgr.in + sup.in ต่อเคส
**สถานะ**: ✅ ผ่าน

### R4.14 ตรวจว่าพนักงานแตะเคสคนอื่นไม่ได้
![](../shots/R4v3/14-in1-team-tab.png)
**ผล**: in1 GET C4 = 200 (มุมมองทีม อ่านอย่างเดียว) · checkin/close C4 = 404 `ASSIGNMENT_NOT_FOUND` · out1 GET C1/C4 = 404 · แท็บ 'ทีม' ไม่มีปุ่มจัดวัน/เริ่มงาน · ข้อมูล = commission 2 / 100000 เท่านั้น
**สถานะ**: ✅ ผ่าน

### R4.15 ไม่ให้สิทธิ์ GPS + บันทึก Draft ตอนเน็ตหลุด
![](../shots/R4v3/15-gps-denied.png)
![](../shots/R4v3/15b-draft-offline.png)
**ผลบนจอ**: toast 'เช็คอินไม่สำเร็จ' + 'อุปกรณ์ปิดสิทธิ์ตำแหน่งไว้ — …' · ไม่มี POST checkin · API 0,0 → 400 `CHECKIN_GPS_PERMISSION_DENIED` · 95,100 → 400 `REQUIRED_MISSING` (latitude) · Draft ตอนเน็ตหลุด → toast แดง 'เชื่อมต่อระบบไม่สำเร็จ' อย่างเดียว · dialog ยังเปิด
**ผลหลังบ้าน**: check_ins C3 = 0 · draft ไม่มีข้อความทดสอบ
**สถานะ**: ✅ ผ่าน

### R4.16 ปิดงาน C3 ไม่สำเร็จ (ต้องเลือกเหตุผล)
![](../shots/R4v3/16-fail-reason-missing.png)
![](../shots/R4v3/16-fail-reason-other-empty.png)
![](../shots/R4v3/16-c3-form.png)
![](../shots/R4v3/16-c3-closed-fail.png)
**ทำ**: ไม่สำเร็จ → เช็คอิน → รูป `R4-C3-photo.jpg` + วิดีโอ `R4-C3-video.mp4` → (probe ตามตาราง) → เลือก 'ไม่พบลูกหนี้' · อธิบาย 'ไปบ้านตามที่อยู่ปัจจุบัน บ้านปิด เพื่อนบ้านแจ้งย้ายออกแล้ว' · บันทึก 'นัดลูกหนี้ทางโทรศัพท์ไม่ได้ 3 ครั้ง' → 'ยืนยันปิดงาน'
**ผลบนจอ**: ไม่มีช่องรูปสินค้า · หัว 'เหตุผลที่ไม่สำเร็จ (บังคับ)' + radio 5 ปุ่ม · ไม่เลือก → 'ยังขาด: เหตุผลที่ไม่สำเร็จ' · 'อื่น ๆ' ว่าง → ยังขาด (placeholder เปลี่ยนเป็น 'อธิบายเหตุผล (บังคับเมื่อเลือก “อื่น ๆ”)') · toast 'ปิดงานเรียบร้อย' + **'…เบี้ยเสี่ยง ฿200.00'**
**ผลหลังบ้าน**: API ไม่มีเหตุผล / other+ว่าง → 400 `CLOSE_FAIL_REASON_REQUIRED` · `closed_fail` · evidence pp 0 hashed 2 `fail_reason=debtor_not_found` + detail + note · **expense no_success_fee 20000 `pending_approval` 1 แถว** · ไม่มี asset · noti `case.closed_fail` → mgr.in + sup.in · `expense.case_bound_created` '…มีรายการเบิก 1 รายการเข้าคิวอนุมัติ' → mgr.in เท่านั้น · mgr.out 0 แถว (กระดิ่ง 'ยังไม่มีการแจ้งเตือน')
**สถานะ**: ✅ ผ่าน

### R4.17 ปิดงาน C4 สำเร็จด้วยรูปสินค้า v1
![](../shots/R4v3/17-c4-form.png)
**ผล**: toast '…คอมมิชชั่น ฿500.00' · expense commission 50000 `pending_warehouse_confirm` id `ad7e5be8-1ce5-426f-afda-abeef28e5b1a` (ใช้ตรวจ R4.27) · asset `pending_intake` · evidence hashed 3 · path รูปสินค้า v1 = `cases/d4d82f78-…/field_evidence/product_photo/7d4827ac-37aa-4601-bc23-ca0e692d0520-R4-C4-product-v1.jpg` · noti admin 1
**สถานะ**: ✅ ผ่าน

### R4.18 in2 ดูหน้าเบิก / สรุปรายได้ / หน้าแรก (ก่อน settle)
![](../shots/R4v3/18-in2-expenses.png)
![](../shots/R4v3/18-in2-income.png)
**ผล**: 'รอดำเนินการ' **฿700.00** (C3 'เบี้ยเสี่ยง' ฿200.00 'รออนุมัติจ่าย' · C4 'คอมมิชชั่น' ฿500.00 'รอยืนยันคืนคลัง') · กล่องรอคำนวณ + `pendingFieldDates=["2026-10-04"]` · income ฿500.00 'จากเคสสำเร็จ 1 เคส' · '฿200.00 (เบี้ยเสี่ยง)' · หน้าแรก **50.00%**
**สถานะ**: ✅ ผ่าน

## D. พนักงาน out1 (ประเสริฐ รับเหมา) — C5 สำเร็จ (ทีม C)

### R4.19 รับงาน จัดวันที่ เช็คอิน C5
![](../shots/R4v3/19-out1-pending.png)
![](../shots/R4v3/19-c5-checkin.png)
**ผล**: หน้าแรก 'N/A' · การ์ด 'จะได้รับถ้าจบงานสำเร็จ ฿1,000.00' · C5 `scheduled` · check_in 14.0640000/100.6460000 (00:46 — **เช็คอินครั้งสุดท้ายของวัน**) · noti accepted → `uat.mgr.out` 1 แถวเท่านั้น
**สถานะ**: ✅ ผ่าน

### R4.20 ลองแนบวิดีโอปลอม + path ของเคสอื่น
![](../shots/R4v3/20-fake-mp4-rejected.png)
**ผลบนจอ**: browser อัปโหลดขึ้น Storage ได้ → autosave 400 `UPLOAD_FILE_TYPE_INVALID` → toast 'ไฟล์ "R4-fake-video.mp4" ถูกปฏิเสธ — นำออกจากฟอร์มแล้ว' + 'เนื้อไฟล์ไม่ตรงกับชนิดที่ช่องนี้รับ … — กรุณาแนบไฟล์ใหม่แทน' · **ฟอร์มถอดไฟล์ออกเอง** (ไม่มีปุ่มลบวิดีโอค้าง) · autosave ถัดไป 200
**ผลหลังบ้าน**: draft C5 ไม่มีไฟล์ปลอม · path รูป C1 → `close-draft` C5 = 400 `UPLOAD_PATH_OUT_OF_SCOPE` 'ที่อยู่ไฟล์ไม่ถูกต้อง' · draft ไม่เปลี่ยน
**ไฟล์ขยะใน bucket `case-documents`** (ห้ามลบ — จดไว้ลบตอน go-live): `cases/7de5741e-1dfd-4a5b-ad7b-7df4206d5314/field_evidence/video/c6a8bc1e-c486-41f1-99e2-66424183fdd4-R4-fake-video.mp4`
**สถานะ**: ✅ ผ่าน (ข้อความ toast ต่างจาก step sheet — ใช้ชื่อไฟล์เป็นหัวแทน 'ชนิดไฟล์ไม่รองรับ' — ดีกว่าเดิม ไม่นับเป็นบั๊ก)

### R4.21 ปิดงาน C5 ด้วยคำขอพร้อมกัน 2 ครั้ง
![](../shots/R4v3/21-c5-form.png)
![](../shots/R4v3/21-c5-closed.png)
**ผล**: A = 200 (`createdExpenses=[commission 100000]`) · B = 400 `ASSIGNMENT_INVALID_STATUS` · evidence C5 1 แถว hashed 3 · **expense commission 100000 `pending_warehouse_confirm` 1 แถว** (step_total 2) · asset `pending_intake` · noti admin 1 (ไม่ซ้ำ)
**สถานะ**: ✅ ผ่าน

### R4.22 out1 ดูหน้าเบิก / สรุปรายได้ (ก่อน settle)
![](../shots/R4v3/22-out1-expenses.png)
**ผล**: 'รอดำเนินการ' **฿1,000.00** ('คอมมิชชั่น' ฿1,000.00) + กล่องรอคำนวณ + `pendingFieldDates=["2026-10-04"]` · income ฿1,000.00 'จากเคสสำเร็จ 1 เคส' · หน้าแรก 100.00%
**สถานะ**: ✅ ผ่าน

### R4.23 ธุรการเห็นงานรอรับเข้าคลัง (ดูอย่างเดียว)
![](../shots/R4v3/23-admin-bell.png)
![](../shots/R4v3/23-admin-warehouse.png)
**ผล**: กระดิ่ง 4 แถว 'ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง' (C1/C2/C4/C5) คลิก → `/warehouse` · การ์ด 'รับเข้าคลัง' **4** · ตารางมี C1/C2/C4/C5 ไม่มี C3 · ไม่กดรับเข้า (mutation เดียว = อ่านแจ้งเตือน)
**invariant ก่อน R4.23b**: expenses 5 / 270000 (commission 4 = 250000 · no_success_fee 1 = 20000 · fuel/allowance 0) · fds 0 · assets 4 `pending_intake` · check_ins 5 (วันไทย 2026-10-04 ทั้งหมด) · evidences 5 · drafts 0 · revenues 0 · noti รอบนี้: accepted 11 / closed_success 4 / closed_fail 2 / expense queue 1 → **ตรงทุกค่า**
**สถานะ**: ✅ ผ่าน

### R4.23b ปิดวัน — Superadmin สั่งคำนวณค่าน้ำมันเหมา/เบี้ยเลี้ยงรายวัน
**ทำ** (`admin` ผ่าน `POST /api/dev/trigger-job`, 04/10/2569 00:47:56):
1. probe `uat.finance` → **403 `PERMISSION_DENIED`**
2. probe `admin` `date=2026-10-05` / `2026-02-30` → **400 `REQUIRED_MISSING`** fields.date 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD และไม่เกินวันนี้' · jobs/fds ไม่เพิ่ม
3. ทำจริง `{"jobType":"daily_field_allowance","payload":{"date":"2026-10-04"}}` → 200 `duplicate:false` `outcome:completed` job `4c0dc15d-e5e3-4254-afa2-dcd717fdb569` result `{settled:3, alreadySettled:0, periodLocked:0, expensesCreated:9, revenueIdsCreated:[]}`
4. สั่งซ้ำนาทีเดียวกัน → 200 `duplicate:true` job เดิม `outcome:skipped` · นาทีใหม่ → job ใหม่ `e3e03bfe-…` `completed` `settled:0 expensesCreated:0` · fds ยัง 3 · expenses ยัง 14

**ผลหลังบ้าน**:

| พนักงาน | field_date | fuel_total | allowance_total | case_count | plan v | n_exp | sum_exp |
|---|---|---|---|---|---|---|---|
| uat.agent.in1 | 2026-10-04 | 20000 | 15000 | 2 | 1 | 4 | 35000 |
| uat.agent.in2 | 2026-10-04 | 20000 | 15000 | 2 | 1 | 4 | 35000 |
| uat.agent.out1 | 2026-10-04 | 550000 | 0 | 1 | 1 | 1 | 550000 |

- แถวรายวัน 9: C1/C2/C4 fuel 10000 + allowance 7500 `pending_warehouse_confirm` · C5 fuel 550000 `pending_warehouse_confirm` · C3 fuel 10000 + allowance 7500 `pending_approval` · ทุกแถว daily=t, src `compensation_plan`, date 2026-10-04, `created_by` = พนักงานเจ้าของ, `job_id` = job จริง · out1 ไม่มีแถว allowance
- ผลรวมต่อพนักงาน = อัตราเต็ม (in1/in2 fuel 20000 + allowance 15000 · out1 fuel 550000) · กันซ้ำต่อรอบติดตาม (แถวตอนปิดงาน) 0 แถวซ้ำ
- audit: `create field_day_settlements` 3 + `create expenses` 9 (actor NULL · reason '[job:4c0dc15d-…] คำนวณค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยงรายวันของวันที่ 2026-10-04 — …' · events `expense.case_bound_created`) + `create jobs` 1 (admin) + `status_change jobs` 1 (ระบบ)
- revenues 0 · notifications ใหม่จาก job **0** (29 → 29)

**ผลบนจอหลัง settle**:
![](../shots/R4v3/23b-in1-expenses-settled.png)
![](../shots/R4v3/23b-in2-expenses-settled.png)
![](../shots/R4v3/23b-out1-expenses-settled.png)
![](../shots/R4v3/23b-mgr-in-comp-queue.png)
- in1: กล่องรอคำนวณ**หาย** · 'รอดำเนินการ' **฿1,350.00** · C1/C2 กลุ่มละ '3 รายการ ฿675.00': 'เบี้ยเลี้ยง · 04/10/2569 ฿75.00' / 'ค่าน้ำมัน ฿100.00' / 'คอมมิชชั่น ฿500.00' 'รอยืนยันคืนคลัง' · `pendingFieldDates=[]`
- in2: **฿1,050.00** · C3 ฿375.00 'รออนุมัติจ่าย' (75 / 100 / เบี้ยเสี่ยง 200) · C4 ฿675.00 'รอยืนยันคืนคลัง'
- out1: **฿6,500.00** ('ค่าน้ำมัน' ฿5,500.00 + 'คอมมิชชั่น' ฿1,000.00) · ไม่มีเบี้ยเลี้ยง
- income + 'คอมมิชชั่นเดือนนี้' ของทั้ง 3 คน**ไม่เปลี่ยน** (R4v3-C ยืนยัน)
- `uat.mgr.in`: ลิงก์ในแจ้งเตือน `/finance/approvals` = **หน้า 'ไม่พบหน้าที่ต้องการ' (404)** → 🐞 R4v3-B03 · คิวจริงที่ `/finance?tab=comp` แท็บ 'ค่าตอบแทน' เห็นเฉพาะ C3 **3 แถว** (เบี้ยเลี้ยง ฿75.00 / ค่าน้ำมัน ฿100.00 / เบี้ยเสี่ยง ฿200.00 'ขั้น 1/2: รอ ผู้จัดการทีมติดตามทรัพย์') ✅ — แต่ช่อง 'สูตร / ฐานคิด' ของแถวรายวันเขียน '1 วัน × 150.00 บาท/วัน' คู่กับยอด ฿75.00 → 🐞 R4v3-B02 · ไม่ได้กดอนุมัติ (บล็อก non-GET = 0)

**invariant จบ R4a**: expenses **14 แถว 890000** (fuel 5 = 590000 · allowance 4 = 30000 · commission 4 = 250000 · no_success_fee 1 = 20000) · แถวรายวัน 9 · fds 3 · superseded 0 · `pending_warehouse_confirm` 11 · `pending_approval` 3 · assets 4 `pending_intake` · check_ins 5 · revenues 0 → **ตรง golden v3 ทุกค่า**
**สถานะ**: ✅ ผ่าน + 🐞 R4v3-B02, R4v3-B03

---

## ตารางปลายรอบ (หลัง R4.23b)

| เคส | พนักงาน | ชนิด | ยอด (satang) | สถานะ | รายวัน |
|---|---|---|---|---|---|
| C1 UAT-CO1-001 | in1 | commission / fuel / allowance | 50000 / 10000 / 7500 | pending_warehouse_confirm | f / t / t |
| C2 UAT-CO1-002 | in1 | commission / fuel / allowance | 50000 / 10000 / 7500 | pending_warehouse_confirm | f / t / t |
| C3 UAT-CO2-003 | in2 | no_success_fee / fuel / allowance | 20000 / 10000 / 7500 | pending_approval | f / t / t |
| C4 UAT-CO1-004 | in2 | commission / fuel / allowance | 50000 / 10000 / 7500 | pending_warehouse_confirm | f / t / t |
| C5 UAT-CO2-005 | out1 | commission / fuel | 100000 / 550000 | pending_warehouse_confirm | f / t |

assets: C1/C2/C4/C5 `pending_intake` · case_evidences 5 แถว `pending` (C3 `closed_fail`) · `counts.sh`: assets 4 · audit_logs 236 · case_evidences 5 · check_ins 5 · expenses 14 · field_day_settlements 3 · jobs 5 · notifications 29 · role_capabilities 79 · _prisma_migrations 34

---

## 🐞 บั๊กที่พบ

| เลข | ระดับ | ชนิด | step | สรุป |
|---|---|---|---|---|
| R4v3-B01 | S2 | env | R4.01 | ฐาน dev หลัง restore `R3-end-v3` ยังไม่ลง migration 150000/160000/170000 (ตาราง `field_day_settlements` กำพร้าอยู่ใน dump) → `GET /api/field/expenses` 500 `receipt_file_hash does not exist` · **fixed โดย orchestrator** (resolve + `db:deploy` + snapshot `R3-end-v3b` + `restore.sh` ไม่ซ่อน error แล้ว) |
| R4v3-B02 | S4 | code | R4.23b | หน้า 'ค่าตอบแทน' (คิวอนุมัติ) ช่อง 'สูตร / ฐานคิด' ของแถวรายวันแสดงอัตราเต็มต่อวัน ('1 วัน × 150.00 บาท/วัน', 'เหมาจ่ายรายวัน 200.00 บาท/วัน') คู่กับยอดที่ถูกแบ่งแล้ว ฿75.00 / ฿100.00 — ไม่บอกว่าหารเฉลี่ย 2 เคสของวัน ผู้อนุมัติอ่านแล้วเหมือนยอดผิด · คาด: แสดงฐานคิดแบบแบ่ง เช่น '150.00 บาท/วัน ÷ 2 เคส (04/10/2569)' |
| R4v3-B03 | S4 | code | R4.16/R4.23b | แจ้งเตือน `expense.case_bound_created` ลิงก์ `/finance/approvals` (`lib/notifications/messages.ts:307`) → หน้า 'ไม่พบหน้าที่ต้องการ' (404) · คิวจริงอยู่ที่ `/finance?tab=comp` (หลัง R6-A/BUG-085) |

ข้อสังเกตจากโค้ดใน step sheet:
- **R4v3-A** ไม่ได้ทดสอบจริง (กติกา) — dev trigger ไม่เตือนอะไรเมื่อ settle วันที่ = วันนี้ (ยืนยันจาก response) · คงเป็นข้อสังเกต S4 ตามเดิม
- **R4v3-B** ยืนยัน (S5) — job ไม่ส่งแจ้งเตือน · แจ้งเตือนตอนปิด C3 บอก '1 รายการ' แต่คิวจริงมี 3
- **R4v3-C** ยืนยัน (S5) — income/แดชบอร์ดนับเฉพาะคอมมิชชั่น/เบี้ยเสี่ยง
- **R4v2-D** แก้แล้ว — ฟอร์มถอดไฟล์ที่ server ปัดออกเอง autosave ถัดไปผ่าน
- BUG-065 / BUG-068 ไม่เกิดในรอบนี้ (ให้ orchestrator พิจารณาปิด)

## ❓ ต้องตัดสินใจ
- **❓-R4v3-a** R4v3-B02 (ฐานคิดของแถวรายวัน) ควรแสดงอย่างไร — [ก (แนะนำ)] 'อัตรา/วัน ÷ จำนวนเคสของวัน (วันที่)' ทั้งหน้าอนุมัติและ 'ดูสูตร' | [ข] คงอัตราเต็มแต่เพิ่มบรรทัด 'ส่วนแบ่ง 1/2' | [ค] คงเดิม
