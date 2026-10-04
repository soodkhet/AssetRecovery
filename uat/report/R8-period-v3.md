# R8 v3 — บริหาร: ปิดงวด ต.ค. 2569 · ทดสอบการเขียนหลังล็อก · รายการปรับปรุง (Adjustment) · อนุมัติยกเว้น · Export Pack v3 · ปลดล็อก → ล็อกใหม่ (uat.exec · uat.finance · uat.account · uat.agent.in1 · uat.mgr.in · uat.co1.mgr · admin)

> วันที่ทดสอบ: 04/10/2569 12:52–13:11 น. · snapshot ต้นรอบ: `R7-end-v3` · ปลายรอบ: พร้อมให้ orchestrator snapshot **`R8-end-v3`** (งวด `locked`) · step sheet `uat/steps/R8.md` v1 (R8.01–R8.35)
> T0 = `2026-10-04 05:51:54+00` · สคริปต์ `uat/bin/r8v3/s01-05.mjs … s30-34.mjs` (+ `x20-explore.mjs` สำรวจฟอร์ม) · log `uat/bin/r8v3/run.log` · ภาพ `uat/shots/R8v3/` (58 ภาพ) · ไฟล์ดาวน์โหลด `uat/fixtures/downloads-R8v3/export-pack-v3.zip`
> **ผล: ✅ 33 ขั้น / 🐞 บั๊กใหม่ 8 ตัว (S4 ×5, S5 ×3 — ไม่มี S1/S2) / ⚠️ รู้แล้ว 2 / ❓ 4**
> จุดย้อน `R8-locked-v3`: สคริปต์เดินต่อหลังล็อก (ตามคำสั่ง) — ใช้ `R7-end-v3` + ขั้นล็อก R8.06 แทน · **probe เขียน 13 จุดหลังล็อกไม่มีจุดไหนเขียนลงฐานเลย** จึงไม่ต้อง restore

---

## 0. ก่อนเริ่ม
ค่าต้นรอบตรง 0.1 ทุกช่อง: งวด `sent_to_accountant` · มี 1 งวด · adj 0 · exception resolved:critical · export 2 · bank unmatched 0 · advances cleared,rejected,overdue,cleared · 50 ทวิ 15/28500 · ใบกำกับ 2 · billing paid:399110:387920:11190 + paid:749000:749000:0 · รอบจ่าย 4 completed · รายได้ gross 1073000 · `/login` 200
**ลายนิ้วมือ "ไม่มีการเขียน" (Q-FP)** — ขยายจาก 0.2 โดยเพิ่ม exceptions/export_records: FP0 = `adv 4 · exp 17 · pb 4 · bb 2 · ti active,active · wht 15 active+1 cancelled · bt 4 · er_cc 0 · adj 0 · per 1 · exc 1 · exp_rec 2 · audit 359` (นับ audit โดยไม่รวม login/logout)

---

# R8a — ก่อนล็อก (งวด "ส่งสำนักงานบัญชีแล้ว")

### R8.01 ดูแท็บ "รอบส่งบัญชี"
**เมนู**: บัญชี → แท็บ **รอบส่งบัญชี**
![](../shots/R8v3/01-exec-closing-sent.png)
**ผลบนจอ** (`uat.exec`): แถว "ตุลาคม 2569" · ป้าย **ส่งสำนักงานบัญชีแล้ว** + "จำกัด — เฉพาะฟิลด์ที่ไม่กระทบยอดที่ส่งไปแล้ว" · 0 วิกฤต · Export ล่าสุด 04/10/2569 · "ส่ง: ปรีดา บัญชีงาม" · ปุ่ม **ตรวจความพร้อม / ล็อกงวด** · ไม่มีปุ่มปลดล็อก
`uat.account` เห็นเหมือนกัน + ปุ่ม **Export** ![](../shots/R8v3/01-account-closing-sent.png)
**สถานะ**: ✅ (ข้อสังเกตเล็ก: แถว "ส่ง:" ไม่มีเวลา ส่วนแถว "ล็อก:" มีเวลา)

### R8.02 นโยบายการล็อกรอบ (อ่านอย่างเดียว)
**เมนู**: การตั้งค่า → ตั้งค่าบัญชี/การเงิน → **การล็อกรอบและ Adjustment**
![](../shots/R8v3/02-exec-settings-lock.png)
**ผลบนจอ**: ตาราง 3 แถวตรงกับสเปค — กำลังรวบรวม: แก้ไขได้อิสระ / ไม่ต้องใช้ Adjustment / ผู้อนุมัติ **การเงิน** · ส่งสำนักงานบัญชีแล้ว: จำกัด / บางกรณี / **การเงิน + บริหาร** · ปิดรอบแล้ว: แก้ไขโดยตรงไม่ได้ / บังคับใช้ Adjustment 100% / **บริหาร** · ไม่มีปุ่มแก้ · API `GET /api/settings/period-lock-policy` 200 ตรงกัน
`uat.account` เปิด URL เดียวกัน → ถูกพาไปแดชบอร์ด (เมนูตั้งค่าบัญชี/การเงินเปิดให้เฉพาะ Superadmin/บริหาร — ตามที่ออกแบบไว้)
**สถานะ**: ✅

### R8.03 ตรวจสิทธิ์ล็อก/ดูรอบ (ไม่เขียน)
| ผู้ใช้ | คำขอ | ผล |
|---|---|---|
| uat.finance | lock | 403 `PERMISSION_DENIED` |
| uat.finance | GET periods | 403 · เปิด `/accounting` → พาไปแดชบอร์ด · เมนูไม่มี "บัญชี" (**R8-N1 ยืนยัน**) |
| uat.mgr.in | lock / GET adjustments / เปิด `/accounting` | 403 / 403 / พาไปแดชบอร์ด |
| uat.agent.in1 | GET periods / POST adjustments | 403 / 403 |
| uat.co1.mgr | GET periods / GET adjustments | 403 / 403 (ไม่ leak) |
| uat.account | unlock | 403 **`UNLOCK_REQUIRES_EXECUTIVE`** |
| uat.exec | send | 403 `PERMISSION_DENIED` |

Q-FP = FP0 · audit ไม่เพิ่ม · **สถานะ**: ✅

### R8.04 นโยบาย "จำกัด" ของงวดที่ส่งแล้ว
- ยกเลิก 50 ทวิ WHT-2569-016 → **400 `PERIOD_LOCKED_DIRECT_EDIT`** (`periodStatus: sent_to_accountant`, `affectsAmount: true`) · หัวข้อ "รอบบัญชีถูกล็อกแล้ว" ทั้งที่ยังไม่ล็อก = ⚠️ BUG-121 / R8-N2 (รู้แล้ว)
- กำหนดศูนย์ต้นทุน (งานจัดหมวด) → **ผ่านยามงวด** แล้วตกที่ 404 `COST_CENTER_NOT_FOUND`
Q-FP = FP0 · **สถานะ**: ✅ (+⚠️ known BUG-121)

### R8.05 รายงานกำไร baseline (ก่อนปรับปรุง)
**เมนู**: การเงิน → **กำไรและต้นทุน**
![](../shots/R8v3/05-exec-profit-baseline.png)
CO1 ฿3,730.00 / ฿2,025.00 / ฿1,705.00 / 45.71% · CO2 ฿7,000.00 / ฿6,875.00 / ฿125.00 / 1.79% · รวม ฿10,730.00 / ฿8,900.00 / ฿1,830.00 / 17.05% · ทีม A 373000/240000/133000/35.66% · ทีม C 700000/650000/50000/7.14% · "ข้อมูลจากแคชรายวัน · ข้อมูล ณ 04/10/2569 12:53"
**สถานะ**: ✅

### R8.06 ผู้บริหารล็อกงวด ต.ค. 2569
**เมนู**: `uat.exec` → บัญชี → รอบส่งบัญชี → ปุ่ม **ล็อกงวด**
![](../shots/R8v3/06a-lock-modal-empty.png)
**ทำ**: API เหตุผลว่าง / ช่องว่าง / ไม่ส่ง → 400 `REQUIRED_MISSING` (fields.reason) · modal **"ล็อกรอบบัญชี (ปิดงวด) — ตุลาคม 2569"** มีคำเตือน "ล็อกแล้วห้ามแก้ข้อมูลต้นทางโดยตรงทุกกรณี…" · ปุ่ม "ยืนยันล็อกงวด" กดไม่ได้เมื่อว่าง/ช่องว่าง · กรอก `ปิดงวด ต.ค. 2569 — สำนักงานบัญชีรับชุดเอกสาร v2 แล้ว UAT R8` → **ดับเบิลคลิก**
![](../shots/R8v3/06c-closing-locked.png)
**ผลบนจอ**: toast "ยืนยันล็อกงวดแล้ว — ตุลาคม 2569 / ปิดรอบแล้ว" · ป้าย **ปิดรอบแล้ว** · "ล็อก: อำนาจ บริหารกิจ · 04/10/2569 12:54" · ปุ่มล็อกหาย ปุ่ม **ปลดล็อก** โผล่ (บัญชีไม่เห็นปุ่มปลดล็อก — ![](../shots/R8v3/06d-account-closing-locked.png)) · ล็อกซ้ำ → 400 `PERIOD_INVALID_STATUS`
**ผลหลังบ้าน**: `locked · locked_by = uat.exec · sent_at คงเดิม (sent_by = uat.account)` · audit **1 แถว** (ดับเบิลคลิกไม่ซ้ำ): `lock · บริหาร · เหตุผล · sent_to_accountant → locked` · FP1 = FP0 + audit 1
**สถานะ**: ✅ · orchestrator: ไม่ได้หยุดรอ snapshot `R8-locked-v3` (ใช้ `R7-end-v3` + R8.06)

---

# R8b — ทดสอบการเขียนหลังล็อก (ทุกข้อ 400 `PERIOD_LOCKED_DIRECT_EDIT`)

| ขั้น | ใคร / ช่องทาง | คำขอ | ผล | targetType |
|---|---|---|---|---|
| R8.07 | in1 มือถือ (UI) | ขอเงินทดรอง ฿500.00 | 400 · InlineAlert + toast "รอบบัญชีถูกล็อกแล้ว / …ต้องสร้างรายการปรับปรุง (Adjustment) แทน" · ไม่มีรหัสดิบ | advances |
| R8.08 | การเงิน (UI) | เคลียร์ ADV3 ใช้จริง 2,000.00 | 400 · ADV3 ยัง **overdue** | advances |
| R8.09 | in1 API | POST claim manual 10000 วันที่ 04/10 | 400 | expenses |
| R8.10 | การเงิน API | POST รอบจ่าย inhouse | 400 (ยามมาก่อนการคัดรายการ) | payout_batches |
| R8.11 | การเงิน API | POST รอบวางบิล CO1 | 400 | billing_batches |
| R8.12 | บัญชี API | ยกเลิก INV-0002 | 400 · ยัง active | tax_invoices |
| R8.13 | บัญชี (UI) | ยกเลิก WHT-2569-016 ไม่ออกแทน | 400 · toast error · ยัง 15/28500 | wht_certificates |
| R8.14 | บัญชี API | กำหนดศูนย์ต้นทุน (เหมือน R8.04) | **400** (`affectsAmount:false`) — ก่อนล็อกได้ 404 ⇒ "ปิด" ≠ "จำกัด" ✅ | expense_records |
| R8.15 | บัญชี API | นำเข้า statement 1 แถว 04/10 | 400 · bank_transactions ยัง 4 | bank_transactions |
| R8.16 | บัญชี API | lock / send / unlock | 400 `PERIOD_INVALID_STATUS` ×2 / 403 `UNLOCK_REQUIRES_EXECUTIVE` · UI ไม่มีปุ่มปลดล็อก | — |
| R8.16 | การเงิน API | unlock | 403 `PERMISSION_DENIED` | — |

![](../shots/R8v3/07c-in1-advance-blocked.png) ![](../shots/R8v3/08b-finance-settle-adv3-blocked.png) ![](../shots/R8v3/13b-wht016-cancel-blocked.png)
**ผลหลังบ้าน**: ตรวจ Q-FP หลังทุกกลุ่ม = FP1 ทุกช่อง (7 ครั้ง) · audit ใหม่ 0 แถว · ไม่มี 5xx
**สถานะ**: ✅ ทั้ง 13 จุด (ไม่มี mutation)

### R8.17 BUG-093 (ทาง ก ตามมติ O23 — ไม่สร้างเช็คอินใหม่)
`admin` POST `/api/dev/trigger-job {jobType:'daily_field_allowance', payload:{date:'2026-10-04'}}` → 200 · job completed · result `settled 0 · periodLocked 0 · alreadySettled 0 · expensesCreated 0` (ไม่มีวันค้าง — พิสูจน์ branch `period_locked` ไม่ได้) · jobs 8→9 + audit 2 แถว (create/status_change jobs — ข้อยกเว้นของ Q-FP) · ข้อเสนอ fixer: เพิ่ม unit test ของ branch `period_locked` ใน `lib/field/daily-allowance-job.ts`
**สถานะ**: ✅ (ตามขอบเขต)

---

# R8c — รายการปรับปรุงของรอบที่ล็อกแล้ว

### R8.18 ตัวเลือกรายการต้นทาง 4 ชนิด (DEC-004)
`uat.finance` `GET /api/adjustments/targets?targetType=…` → revenue 4 · expense **17** · billing_batch 2 · payout_batch 4 · ทุกแถว `periodStatusAtTarget:'locked'` · `requiredApproverRoles:['บริหาร']` · ป้าย "รอบปิดแล้ว — ผู้บริหารอนุมัติเท่านั้น พร้อมบันทึก audit แยก" · `directEditBlocked:true` · ค้น UAT-CO1-001 = 1, "ตุลาคม 2569" = 2, OUT-2 = 1 · `uat.account` → 403 · constraint `adjustments_one_target` = CHECK ผลรวม 4 FK = 1 ✅
(step sheet คาด expense ≥ 19 — ฐานมี expenses 17 แถว ทั้งหมดถูกแสดง ⇒ ค่าคาดในชีตคลาดเคลื่อน ไม่ใช่บั๊ก)
**สถานะ**: ✅

### R8.19 ตรวจความถูกต้องของคำขอ (ไม่เขียน)
reason ว่าง / "ลด" → 400 `REASON_REQUIRED` · amount 0 / -10000 / 100.5 → 400 field error ("ต้องมากกว่า 0" / "ต้องไม่ติดลบ" / "ต้องเป็นจำนวนเต็มสตางค์") · targetId สุ่ม → 404 `ADJUSTMENT_TARGET_NOT_FOUND` · targetType ผิด → 400 · บัญชี/บริหาร POST → 403 · adjustments ยัง 0
**สถานะ**: ✅

### R8.20 การเงินสร้าง A1 (ลดรายได้ C1 100.00 บาทก่อน VAT — มติ O20)
**เมนู**: การเงิน → แท็บ **ปรับปรุง** → **+ สร้าง Adjustment**
![](../shots/R8v3/20c-a1-form-filled.png)
**ทำ**: ประเภท = รายได้ · ค้น `UAT-CO1-001` → เลือก (แสดง ฿989.75 = ยอดรวม VAT — ❓-R8-1/O20) · กล่อง "สถานะรอบบัญชีของรายการต้นทาง: ปิดรอบแล้ว · ต้องผ่านการอนุมัติ: บริหาร · รายการนี้แก้ยอดตรงไม่ได้แล้ว…" · ลดยอด · 100.00 · เหตุผลสั้น "ลด" → ปุ่มสร้างกดไม่ได้ · กรอกเหตุผลเต็ม → **สร้างรายการ** (ดับเบิลคลิก)
![](../shots/R8v3/20d-a1-pending.png)
**ผลบนจอ**: toast "สร้างรายการปรับปรุงแล้ว / UAT-CO1-001 — รออนุมัติตามระดับ: บริหาร" · แถว −฿100.00 · ปิดรอบแล้ว · ต้องผู้บริหาร · รออนุมัติ · KPI "รออนุมัติของรอบที่ปิดแล้ว" = 1
**ผลหลังบ้าน**: 1 แถว (ดับเบิลคลิกไม่ซ้ำ) `decrease · 10000 · pending_approval · locked · revenue_id=C1 / expense,billing,payout = NULL` · audit `create · การเงิน · เหตุผล · locked` · แจ้งเตือนถึงผู้บริหาร **0** (กระดิ่ง uat.exec ว่าง — ![](../shots/R8v3/20e-exec-bell.png) — **R8-N4 ยืนยัน**)
**สถานะ**: ✅ + 🐞 R8v3-B01 (วันที่ในรายการต้นทางเป็น ค.ศ./UTC) · 🐞 R8v3-B02 (รหัส error บนจอ — R8-N3)

### R8.21 การเงินพยายามอนุมัติ/ปฏิเสธ A1
![](../shots/R8v3/21b-finance-approve-403.png)
การเงินเห็นปุ่ม "✓ อนุมัติ / ปฏิเสธ" (**R8-N5 ยืนยัน** → R8v3-B07) · กดอนุมัติ → 403 **`INSUFFICIENT_APPROVAL_LEVEL`** · toast "ระดับผู้อนุมัติไม่พอ / …" · API reject → 403 เดียวกัน · ยัง pending · ไม่มี audit approve/reject
**สถานะ**: ✅ + 🐞 R8v3-B07

### R8.22 ผู้บริหารปฏิเสธแบบไม่มีเหตุผล
`rejectionReason:''` และ `'ไม่'` → 400 `REJECTION_REASON_REQUIRED` · A1 ยัง pending · **สถานะ**: ✅

### R8.23 ผู้บริหารอนุมัติ A1
![](../shots/R8v3/23b-exec-approve-modal.png)
**ทำ**: `uat.exec` แท็บปรับปรุง → อนุมัติ → modal "อนุมัติรายการปรับปรุง" (กล่อง "รอบบัญชีปิดแล้ว") · หมายเหตุ `อนุมัติส่วนลดตามหนังสือตกลงกับ CO1 — …` → **ยืนยันอนุมัติ** (ดับเบิลคลิก)
![](../shots/R8v3/23c-exec-adjustment-approved.png)
**ผลบนจอ**: toast "อนุมัติรายการปรับปรุงแล้ว / UAT-CO1-001 — ฿100.00" · ป้าย อนุมัติแล้ว · "โดย: อำนาจ บริหารกิจ · 04/10/2569 12:57" · อนุมัติซ้ำ / ปฏิเสธหลังอนุมัติ → 400 `ADJUSTMENT_INVALID_STATUS`
**ผลหลังบ้าน**: `approved · approved_by = uat.exec` · audit 3 แถว: `create (การเงิน)` · `approve (บริหาร, signed -10000, reason = หมายเหตุ)` · `unlock (บริหาร, locked_period_adjustment=true, reason "อนุมัติรายการปรับปรุงของรอบบัญชีที่ปิดแล้ว — …")`
**หน้าบันทึกการใช้งาน**: แถว audit แยกแสดงการกระทำว่า **"ปลดล็อกงวด"** บนเป้าหมาย "รายการปรับปรุง" ทั้งที่งวดไม่ได้ถูกปลด ![](../shots/R8v3/23d-audit-log-page.png) → **R8-N6 ยืนยัน** = 🐞 R8v3-B04
**สถานะ**: ✅ + 🐞 R8v3-B04

### R8.24 รายการต้นทางไม่ถูกแก้
revenue C1 `92500 · 6475 · 98975 · billed` · billing CO1 `paid · 399110 · 387920 · 11190` · INV-0001 active 399110 · INV-0002 active 749000 · งวด locked
**สถานะ**: ✅

### R8.25 รายงานแสดงยอดสุทธิ (+ แคช)
![](../shots/R8v3/25a-profit-cached-before-refresh.png)
**ก่อนกดรีเฟรช** (หลังอนุมัติ 2 นาที): ยังแสดง **CO1 ฿3,730.00 / รวม 17.05%** "ข้อมูลจากแคชรายวัน · ณ 12:53" → **R8-N7 ยืนยัน** = 🐞 R8v3-B05 · `refresh=1` → 400 (ต้องใช้ `refresh=true` ตามที่แจ้ง)
**กด "รีเฟรชตอนนี้"** ![](../shots/R8v3/25b-profit-after-refresh-company.png)

| รายงาน | แถว | ผลจริง | golden | |
|---|---|---|---|---|
| F1 บริษัท | CO1 | 363000 / 202500 / 160500 / 44.21% | เท่ากัน | ✅ |
| F1 บริษัท | CO2 | 700000 / 687500 / 12500 / 1.79% | เท่ากัน | ✅ |
| F1 บริษัท | รวม | 1063000 / 890000 / 173000 / 16.27% | เท่ากัน | ✅ |
| F1 ทีม | A / C | 363000/240000/123000/33.88% · 700000/650000/50000/7.14% | เท่ากัน | ✅ |
| F2 สรุปรายได้ (company) | CO1 / รวม | 363000 · 3 เคส · 121000/เคส · รวม 1063000 · 4 เคส · 265750/เคส | เท่ากัน | ✅ |
| E2 scorecard | CO1 | rev 363000 · GP 160500 · 44.21% · AR 0 (หน้า `/reports/company-scorecard` ระบุ "ยอดหลังรายการปรับปรุงที่อนุมัติแล้ว") | เท่ากัน | ✅ |
| E3 ทีม | A | ต้นทุน 240000 · GP 123000 | เท่ากัน | ✅ |
| F3 AR | — | 0 แถว | AR 0 | ✅ |
| F4 ค่าตอบแทน | รวม | 980000 / 28500 / 951500 | ไม่เปลี่ยน | ✅ |
| A1 WHT | ต.ค. | ภ.ง.ด.3 28500 · ภ.ง.ด.53 0 | ไม่เปลี่ยน | ✅ |
| A2 ใบกำกับ | ต.ค. | 2 ใบ · 1073000 / 75110 / 1148110 | ไม่เปลี่ยน | ✅ |
| F5 เงินทดรองค้าง | — | 0 แถว | ADV3 overdue | ⚠️ ข้อจำกัดที่รู้ O15 |

**สถานะ**: ✅ golden ตรงทุกตัว + 🐞 R8v3-B05 (แคชไม่ล้างหลังอนุมัติ)

---

# R8d — ข้อยกเว้นหลังปิดงวด + อนุมัติยกเว้น + Export Pack v3

### R8.26 บัญชีบันทึกข้อยกเว้นวิกฤตในงวดที่ล็อกแล้ว
**เมนู**: `uat.account` → บัญชี → **เอกสารไม่ครบ** → บันทึกข้อยกเว้น
![](../shots/R8v3/26a-exception-form.png)
critical · โมดูล **วางบิล** · รอบ "ตุลาคม 2569 · ปิดรอบแล้ว" · หัวข้อ/รายละเอียดตามชีต → 201 · toast "บันทึกข้อยกเว้นใหม่แล้ว / ตุลาคม 2569" · audit `create exceptions` (ไม่มี reason — ไม่บังคับ)
ป้ายโมดูลแสดง "วางบิล" **ไม่มีเลขสเปค** → **R8-N8 หักล้าง** (แก้แล้วใน fixer O)
**สถานะ**: ✅

### R8.27 Export ถูกปัด + สิทธิ์อนุมัติยกเว้น
UI สร้างชุดเอกสาร → 400 **`EXPORT_BLOCKED_CRITICAL`** toast "ส่งข้อมูลบัญชีไม่ได้ / ยังมีข้อยกเว้นระดับวิกฤต…" ![](../shots/R8v3/27c-export-blocked-toast.png) · API เดียวกัน 400 · export_records ยัง 2 · บัญชี/การเงิน authorize → 403
ข้อสังเกต: ปุ่ม "ดาวน์โหลดไฟล์ (.zip)" ใน modal ยังกดได้ขณะมี critical (ปัดที่ API) — UX เล็กน้อย
**สถานะ**: ✅

### R8.28 ผู้บริหารอนุมัติยกเว้น
![](../shots/R8v3/28c-authorize-modal-filled.png)
API เหตุผลช่องว่าง → 400 **`AUTHORIZED_EXCEPTION_REASON_REQUIRED`** · modal "อนุมัติยกเว้น (ผู้บริหารเท่านั้น)" · กรอกเหตุผล → 200 · toast "อนุมัติยกเว้นสำหรับ ตุลาคม 2569 แล้ว / ปลดบล็อกเฉพาะรอบบัญชีนี้…" · สถานะ **authorized** ("ผ่านแบบมีข้อยกเว้น") ไม่ใช่ resolved · ซ้ำ → 400 `EXCEPTION_INVALID_STATUS` · audit `approve exceptions · บริหาร · reason` · แถวงวดยัง "0 วิกฤต"
**สถานะ**: ✅

### R8.29 Export Pack v3
![](../shots/R8v3/29b-export-history-v3.png)
`uat.account` สร้างชุดเอกสาร note `UAT R8 ชุดที่ 3 หลังรายการปรับปรุง A1` (ทำได้แม้ล็อก) → 200 · **version 3 (ป้าย v1.2) generated** · v1/v2 hash เดิม (v2 ยัง `sent`) · ดาวน์โหลด 200 zip 41826 B

| version | สถานะ | file_hash (sha256) |
|---|---|---|
| 1 | generated | `dacb70e1aa7a29d8…` |
| 2 | sent | `cf67c2a09f79f8be…` |
| 3 | generated | `2ae7a4f14cdf8356e9384cb3c5b597e6cd0cab8d87e6ec658cfe97bf265bdaca` (= sha ของไฟล์ที่ดาวน์โหลด) |

ใน zip (9 ไฟล์ · key Storage ASCII `…/2569-10/v3/20261004-0605170-7d6ae4e4/…`):
- **`07_Adjustment_Log.csv`** 1 แถว: `ADJ-2569-10-001 · revenue · UAT-CO1-001 · -100.00 · เหตุผล · อำนาจ บริหารกิจ · 04/10/2569` (วันที่ พ.ศ. ✅ · เลขที่คำนวณจากลำดับ — R8-N10)
- `01_Revenue.csv` C1 gross 925.00 (ยอดเดิม) · `05_WHT_Data.csv` 15 แถว รวม 285.00 บาท ✅
- `08_Document_Checklist.xlsx`: แถว billing = **"ครบถ้วน"** severity/summary ว่าง — ข้อยกเว้นที่ "อนุมัติยกเว้น" (ยังไม่ได้ 50 ทวิ ต้นฉบับ) **ไม่ปรากฏ** ในไฟล์ส่งสำนักงานบัญชี → 🐞 R8v3-B06 / ❓
audit `export · บัญชี · reason = note` · **สถานะ**: ✅ + 🐞 R8v3-B06

---

# R8e — ปลดล็อก → Adjustment ระดับ "ส่งแล้ว" → ล็อกใหม่

### R8.30 ผู้บริหารปลดล็อก
![](../shots/R8v3/30a-unlock-modal-empty.png)
API เหตุผลว่าง → 400 field error · modal **"ปลดล็อกรอบบัญชี (ผู้บริหารเท่านั้น) — ตุลาคม 2569"** ("…กลับไปสถานะ “ส่งสำนักงานบัญชีแล้ว” (ไม่กลับไปกำลังรวบรวม)…") · ปุ่มกดไม่ได้เมื่อว่าง · กรอกเหตุผล → ดับเบิลคลิก → 200 (1 คำขอ) · toast "ยืนยันปลดล็อกแล้ว — ตุลาคม 2569 / ส่งสำนักงานบัญชีแล้ว" ![](../shots/R8v3/30c-closing-unlocked.png)
**ผลหลังบ้าน**: `sent_to_accountant · locked_at/locked_by NULL · sent_at คงเดิม` · audit `unlock · บริหาร · reason` · ปลดซ้ำ → 400 `PERIOD_INVALID_STATUS` · ตรวจซ้ำ R8.04: WHT cancel ยัง 400 `PERIOD_LOCKED_DIRECT_EDIT` · cost center ผ่านยาม → 404
**สถานะ**: ✅

### R8.31 การเงินสร้าง A2 (รอบจ่าย OUT-2 +50.00)
![](../shots/R8v3/31a-a2-form.png)
ประเภท รอบจ่ายเงิน · ค้น OUT-2 (ป้าย "รอบจ่าย outsource · สร้าง 2026-10-03" · คอลัมน์วันที่ 03/10/2569 — ที่จริงสร้าง 04/10/2569 เวลาไทย → R8v3-B01) · เพิ่มยอด 50.00 → 201 · toast "…รออนุมัติตามระดับ: การเงิน + บริหาร"
**ผลหลังบ้าน**: `increase · 5000 · pending_approval · sent_to_accountant · payout_batch_id = OUT-2 · อีก 3 FK NULL`
**สถานะ**: ✅

### R8.32 อนุมัติ 2 ระดับ — การเงินก่อน
![](../shots/R8v3/32b-a2-partial.png)
`uat.finance` (ผู้สร้างเอง) อนุมัติ → 200 · สถานะยัง `pending_approval` · API `approvedRoles:['การเงิน'] · missingApproverRoles:['บริหาร']` · audit `approve · after.approved_roles=['การเงิน'] · missing=['บริหาร']` · อนุมัติซ้ำ → 400 `ADJUSTMENT_INVALID_STATUS` (`missingRoles:['บริหาร']`)
- toast บนจอ: **"บันทึกการอนุมัติแล้ว / ยังรออนุมัติจาก: การเงิน, บริหาร"** — ผิด (การเงินเพิ่งอนุมัติ) → 🐞 R8v3-B03
- ผู้สร้างอนุมัติเองได้ (`selfApprovalAllowed=false` ไม่ถูกบังคับ) → **R8-N9 ยืนยัน**
**สถานะ**: ✅ + 🐞 R8v3-B03

### R8.33 ผู้บริหารปฏิเสธ A2
![](../shots/R8v3/33c-a2-rejected.png)
modal "ปฏิเสธรายการปรับปรุง" (แสดง "อนุมัติแล้ว: การเงิน") · ปุ่มกดไม่ได้เมื่อว่าง · กรอกเหตุผล → 200 · toast "ปฏิเสธรายการแล้ว / UAT OUT-2 — ฿50.00" · แถวแสดง "เหตุผลที่ปฏิเสธ: …" · อนุมัติ/ปฏิเสธซ้ำ → 400 `ADJUSTMENT_INVALID_STATUS` · `rejected · rejection_reason` · audit `reject · บริหาร · reason` · Export v3 ไม่ต้องทำใหม่ (07 นับเฉพาะ approved)
**สถานะ**: ✅

### R8.34 บัญชีล็อกใหม่
![](../shots/R8v3/34b-closing-relocked.png)
`uat.account` ล็อกงวด เหตุผล `ล็อกงวด ต.ค. 2569 อีกครั้งหลังพิจารณารายการปรับปรุง OUT-2 แล้ว UAT R8` → 200 · "ล็อก: ปรีดา บัญชีงาม" · `locked_by = uat.account` · audit `lock` ครั้งที่ 2 · ยกเลิก INV-0002 → 400 `PERIOD_LOCKED_DIRECT_EDIT`
**สถานะ**: ✅ (พิสูจน์ล็อกได้ทั้งสายบัญชีและผู้บริหาร)

### R8.35 ตรวจปลายรอบ
| รายการ | ผล | คาด |
|---|---|---|
| งวด | locked | ✅ |
| adjustments | `decrease:10000:approved:locked increase:5000:rejected:sent_to_accountant` · bad_fk 0 | ✅ |
| exceptions | resolved:critical, authorized:critical | ✅ |
| export | 1:generated, 2:sent, 3:generated | ✅ |
| รายได้ gross / 50 ทวิ / ใบกำกับ / advances / งวด | 1073000 / 15·28500 / 2 / cleared,rejected,overdue,cleared / 1 | ✅ |
| audit (4 ชนิดเป้าหมาย) | 12 แถว ตามลำดับ lock → adj create → approve → unlock(แยก) → exc create → exc approve → export → period unlock → A2 create → approve(การเงิน) → reject → lock · ทุกแถวมี reason ยกเว้น exc create | ✅ |
| Q-FP เทียบ FP0 | เปลี่ยนเฉพาะ adj 0→2 · exc 1→2 · exp_rec 2→3 · audit 359→373 (+12 + 2 ของ job) | ✅ |
| pm2 log | ไม่มี 500 ช่วง 12:52–13:11 (error ที่พบเป็นของ R7 เวลา 12:01–12:02) | ✅ |
| Storage | +1 ชุด (v3: 9 object + zip) — ไม่ลบอะไร | ✅ |

`counts.sh` (ตารางที่เกี่ยว): accounting_periods 1 · adjustments 2 · advances 4 · audit_logs 417 · bank_transactions 4 · billing_batches 2 · exceptions 2 · expenses 17 · export_records 3 · jobs 9 · notifications 62 · payout_batches 4 · revenues 4 · tax_invoices 2 · wht_certificates 16

---

## 🐞 บั๊กที่พบ
| รหัส | severity | ที่ | อาการ | หลักฐาน |
|---|---|---|---|---|
| R8v3-B01 | S4 | ฟอร์มสร้าง Adjustment — รายการต้นทาง | ป้ายแสดงวันที่ ISO ค.ศ. ("รายได้ 2026-10-04", "สร้าง 2026-10-03") = `DISPLAY_CE_YEAR` · และรอบจ่ายใช้วันที่ UTC (`toDateOnlyIso(createdAt)` ใน `lib/adjustments/queries.ts`) → OUT-2 แสดง 03/10/2569 ทั้งที่สร้าง 04/10/2569 เวลาไทย (การหางวดใช้เวลาไทยถูกแล้ว — ผิดแค่การแสดง) · ป้ายมี enum ดิบ "outsource" | 20c, 31a |
| R8v3-B02 | S5 | ฟอร์ม Adjustment | ข้อความบนจอมีรหัส error: hint "(REASON_REQUIRED)" และกล่องใน modal อนุมัติ "(ผู้ไม่มีสิทธิ์จะได้ INSUFFICIENT_APPROVAL_LEVEL)" (R8-N3 · Rule 05) | 20b, 21a |
| R8v3-B03 | S4 | modal อนุมัติ Adjustment หลายระดับ | หลังการเงินอนุมัติ toast บอก "ยังรออนุมัติจาก: การเงิน, บริหาร" — ใช้ค่าก่อนอนุมัติ (`components/finance/adjustment-review-modal.tsx:70`) แทน `missingApproverRoles` จาก response (= บริหาร) | 32b + log |
| R8v3-B04 | S4 | หน้า Audit Log | แถว audit แยกของการอนุมัติ Adjustment งวดล็อก (`action='unlock'` บน adjustments) แสดงเป็น "ปลดล็อกงวด" — ผู้ตรวจเข้าใจว่างวดถูกปลด (R8-N6) | 23d |
| R8v3-B05 | S4 | แคชรายงาน | อนุมัติ Adjustment ไม่ล้างแคชรายวัน — ผู้บริหารยังเห็น CO1 373000 / 17.05% จนกดรีเฟรช (หรือหมดวัน) (R8-N7) | 25a |
| R8v3-B06 | S4 (spec) | Export Pack `08_Document_Checklist.xlsx` | ข้อยกเว้นที่ "อนุมัติยกเว้น" ถูกนับเป็น "ครบถ้วน" และลบระดับ/หัวข้อทิ้ง (`checklistDocStatus` ใน `lib/exports/pack.ts`) — สำนักงานบัญชีไม่รู้ว่ายังขาด 50 ทวิ ต้นฉบับ (เครดิตภาษี 111.90 ใช้ไม่ได้) · ดู ❓-1 | zip v3 |
| R8v3-B07 | S5 | แท็บปรับปรุง (การเงิน) | การเงินเห็นปุ่มอนุมัติ/ปฏิเสธบนรายการงวดล็อกแล้วได้ 403 (R8-N5) | 21b |
| R8v3-B08 | S5 | หน้า Audit Log ตัวกรองเป้าหมาย | มีชื่อตารางดิบ: `assignment_policy_settings`, `cash_receipts`, `close_case_drafts`, `jobs` | 23d |

⚠️ รู้แล้ว: BUG-121 (ข้อความ `PERIOD_LOCKED_DIRECT_EDIT` ตอนงวดส่งแล้วบอก "ล็อกแล้ว") · F5 วันนี้ 0 แถว (O15)

## ยืนยัน/หักล้าง R8-N
| N | ผล |
|---|---|
| N1 การเงินดูรอบบัญชีไม่ได้ | ✅ ยืนยัน (403 + ไม่มีเมนูบัญชี) |
| N2 ถ้อยคำงวดส่งแล้ว | ✅ ยืนยัน = BUG-121 (รู้แล้ว) |
| N3 รหัส error บนฟอร์ม | ✅ ยืนยัน → B02 |
| N4 ไม่แจ้งเตือนผู้อนุมัติ | ✅ ยืนยัน (notifications ใหม่ 0) |
| N5 การเงินเห็นปุ่มอนุมัติ | ✅ ยืนยัน → B07 |
| N6 audit `unlock` สับสน | ✅ ยืนยัน → B04 |
| N7 แคชไม่ล้าง | ✅ ยืนยัน → B05 |
| N8 เลขสเปคในป้ายโมดูล | ❌ หักล้าง (แสดง "วางบิล") |
| N9 ผู้สร้างอนุมัติเอง | ✅ ยืนยัน |
| N10 ไม่มีใบลดหนี้/เลขที่ Adjustment | ✅ ยืนยัน (export ใช้ `ADJ-2569-10-001` ที่คำนวณ) |
| N11 ล็อกเดือนปัจจุบันได้ | ✅ ยืนยัน (ยอมรับใน UAT — O25) |

## ❓ ต้องตัดสินใจ (บัญชีเสนอตามมาตรฐานไทย)
1. **ข้อยกเว้นที่อนุมัติยกเว้นใน Document Checklist** (B06) — **ก (แนะนำ)** แสดงเป็นสถานะแยก "ผ่านแบบมีข้อยกเว้น" พร้อมหัวข้อ/เหตุผลผู้บริหาร เพื่อให้สำนักงานบัญชีไม่นำภาษีถูกหัก 111.90 บาทไปเครดิตใน ภ.ง.ด.50/51 จนได้ต้นฉบับ (สอดคล้อง B4) · ข คงเดิม (นับเป็นครบถ้วน)
2. **ฟอร์มรายได้แสดงยอดรวม VAT แต่ Adjustment ปรับฐานก่อน VAT** (O20) — **ก (แนะนำ)** ฟอร์มแสดงทั้งยอดก่อน VAT และรวม VAT + ระบุว่า "ยอดที่ปรับ = ก่อน VAT" · ใบลดหนี้ 100.00 + VAT 7.00 ออกโดยสำนักงานบัญชีในเดือนที่ออก (ม.86/10)
3. **Adjustment ที่อนุมัติหลังล็อกใน export ถัดไป** (B2) — **ก (แนะนำ)** แยกหัวข้อ "ปรับปรุงงวดก่อน" ใน 07 พร้อมวันอนุมัติ เพื่อสมุดบัญชีบันทึกในงวดปัจจุบัน (TAS 8 — ไม่มีสาระสำคัญ)
4. **ล็อกงวดเดือนที่ยังไม่สิ้นเดือน** (N11/O25) — **ก (แนะนำ)** production ห้าม send/lock ก่อนวันสุดท้ายของเดือน (หรือเตือนยืนยัน 2 ชั้น) เพราะธุรกรรมเงินทั้งเดือนหยุดทันที

## สถานะส่งต่อ R9
งวด ต.ค. 2569 **`locked`** (ประวัติ: ล็อกโดยผู้บริหาร 12:54 → ปลดล็อกโดยผู้บริหาร 13:10 → ล็อกโดยบัญชี 13:10) · A1 approved / A2 rejected · golden หลัง Adjustment ตรง · แคชรายงานคำนวณใหม่เมื่อ 12:59 ด้วยยอดหลัง A1 แล้ว (R9 กดรีเฟรชซ้ำได้) · export 3 version · exception open 0
