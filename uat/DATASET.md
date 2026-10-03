# uat/DATASET.md — ข้อมูลทดสอบ UAT + ค่าคาดหวัง (golden values) · **v3**

> ## Changelog
> **v3 — 04/10/2569 (หลัง merge มติ PO Q21 + fixer G ก่อน R6 · ฐาน dev = `R3-end-v3` · เล่น R4–R5 ใหม่ · เช็คอินทุกเคสลงวันที่ 04/10/2569)**
> - **Q21 (DEC-012)** ค่าน้ำมัน `DAILY_FLAT` + เบี้ยเลี้ยง = **วันละ 1 ครั้งต่อพนักงานต่อวันปฏิทินไทยที่มีเช็คอิน** · กระจายเท่ากันทุกเคสที่เช็คอินวันนั้น (เศษสตางค์ลงเคสที่เช็คอินแรกสุดของวัน — `splitDailyAmountSatang()` ใน `lib/field/expense-calc.ts`) · **ไม่สร้างตอนปิดงานแล้ว** — เกิดจาก job `daily_field_allowance` (`lib/field/daily-allowance-job.ts`) 1 แถว `field_day_settlements` ต่อ (พนักงาน, วัน) · ปิดงานสร้างแค่ `commission`/`no_success_fee` (Q2 คงเดิม)
> - ⇒ §ภาคสนาม เพิ่มตาราง **D-DAY** (แถวรายวัน) · E3 ใหม่: ต่อเคส in1/in2 = fuel **10000** + allowance **7500** (เดิม 20000 + 15000) · ผูกเคส active **890000** (เดิม 960000) · active ทั้งหมด **950000 / 15 แถว** (เดิม 1020000) · ทั้งหมด **16 แถว** (superseded เหลือ **1** = commission เดิมของ C4 — แถวรายวันไม่ถูก supersede ตาม `41` §10.1 v2.14)
> - E5/E6: in1 ฐาน **195000** → WHT **5850** · IN-1 net **489150** (เดิม 523100) · in2 ฐาน **105000** → WHT **3150** · IN-2 net **301850** (เดิม 335800) · out1 / OUT-2 ไม่เปลี่ยน · E8 แถว 3 = **−4,891.50** · E9/A1 PND3 = **28500** (15 ใบ) · F1 รวม GP **183000 / 17.05%** · F4 รวม **980000 / 28500 / 951500** · billing CO1/CO2 + revenue (E4/E7) ไม่เปลี่ยน
> - **มติ PO 04/10/2569 (จังหวะเวลา)**: เช็คอินครบทุกพนักงานแล้ว (ท้าย R4a) → Superadmin `admin` สั่ง `POST /api/dev/trigger-job {"jobType":"daily_field_allowance","payload":{"date":"2026-10-04"}}` ได้เลย (ไม่ต้องรอเที่ยงคืน) · **ADV3 overdue ย้ายไป R7** (รอข้ามเที่ยงคืน 04→05/10 จริง)
> - เกตรายได้ใหม่ `field_days_not_settled` (`lib/warehouse/revenue-service.ts`): เคสที่มีวันเช็คอินยังไม่ settle → ไม่เกิด revenue แม้ expense อนุมัติครบ ⇒ R6 ต้องเล่น**หลัง** settle เสมอ
>
> **v2 — 03/10/2569 (หลังแก้ตามมติ PO 20 ข้อ `uat/PO-DECISIONS-2569-10-03.md` · ฐาน dev = `R3-end-v2` · เล่น R4 ใหม่ทั้งรอบ)**
> - **Q2** ปิดงานสร้าง `commission` (สำเร็จ) / `no_success_fee` (ไม่สำเร็จ) เป็น expense ด้วย (`planCaseExpenses()` ใน `lib/field/expense-calc.ts`) ⇒ E3: C1/C2/C4 +50000, C3 +20000, C5 +100000 · ต้นทุนเคส active **960000** (เดิม 690000) · F1/F4/E2 คำนวณใหม่
> - **Q4** น้ำมัน DAILY_FLAT = อัตรา × จำนวนวันที่ลงพื้นที่ (นับแบบเบี้ยเลี้ยง) — UAT ลงพื้นที่**วันเดียวทุกเคส** ⇒ ยอดเท่าเดิม (C5 = 550000 × 1)
> - **Q5** WHT เทียบเกณฑ์ ฿1,000 ด้วย**ฐานรวมของ payee ทั้งรอบจ่าย** (`calculatePayeeBatchWht()` ใน `lib/finance/wht-calc.ts`, เรียกจาก `lib/payout/queries.ts`) ⇒ in1/in2 ถูกหักแล้ว (เดิม 0) · E5/E6/E9/A1 คำนวณใหม่
> - **มติ orchestrator** เพิ่มค่าที่พัก (hotel) ของ in1 ฿600 = 60000 วันเดียวกับปิด C1 → เข้า IN-1 (ฐาน WHT ของ in1 ทั้งรอบ)
> - **Q3** ใช้เงินทดรองเกิน → เคลียร์ได้ คืน 0 + สร้างคำขอเบิกส่วนเกิน (`manual`) อัตโนมัติ ⇒ ADV-OVER เปลี่ยนเป็น **ADV4 (out1)** เล่นจริงใน R6 (ดู §เงินทดรอง) · ยกเลิก `USED_EXCEEDS_REQUEST_NO_TOPUP`
> - **Q8** กำหนดเคลียร์ย้อนหลังไม่ได้ ⇒ ADV3 due = **วันที่ขอ (วันนี้)** แล้วรอข้ามเที่ยงคืนเวลาไทยก่อนสั่ง `advance_overdue` ใน R6
> - **Q6** revenue มี snapshot `vat_mode` (E4) · **Q16** C3 ต้องเลือกเหตุผลไม่สำเร็จ · **Q15** บันทึกเพิ่มเติมเก็บที่ `case_evidences.note` · **Q20** อัตราสำเร็จ = ปิดสำเร็จ ÷ ปิดแล้ว (O3 in1 = 100% — เดิม 66.67%) · **Q14** หลักฐานผ่านอัตโนมัติ (R5/R6) · **Q19** ไม่กระทบ golden
> - ตัด ⚠️ S1/S2/S3/S5/S6/S7 ที่ปิดแล้ว · ❓ Q1/D1/D4/D6/D7/S1 ปิดแล้ว
> - ⚠️ ข้อมูล `R3-end-v2` สร้างด้วยโค้ดก่อน Q17 ⇒ **ไม่มีแจ้งเตือน `assignment.created`** ของการมอบหมายใน R3 (probe 03/10/2569: กระดิ่ง in1 มีแค่ `assignment.reassignment_timeout_resolved` 1 แถว) — แจ้งเตือนใหม่ทดสอบได้ตั้งแต่ "กดรับงาน" ใน R4
>
> **v1 — 03/10/2569** ชุดแรก (golden ตามโค้ดก่อนมติ PO)

> Source of truth ของข้อมูล UAT R1–R9 · เงิน = satang INTEGER (แสดงคู่บาท) · วันที่บนจอ = พ.ศ. `DD/MM/YYYY`
> **หลักค่าคาดหวัง (มติ orchestrator)**: ยึด **พฤติกรรมโค้ดปัจจุบัน** เป็นค่าหลัก — ส่วนที่ยังขัด spec อยู่หัวข้อ ⚠️ (ไม่บล็อก UAT)
> ปัดเศษ: `pctOfSatang(b,p) = round(round(b×p×100)/10000)` · VAT include = `round(a×r/(100+r))` · ตัวเลขทุกตัวเลือกให้**ไม่มีเศษ .5** จึงไม่ขึ้นกับวิธีปัด
> ค่า seed จริง (query 03/10/2569): `vat_rate_history` 7.00% ตั้งแต่ 2025-10-01 ไม่มีวันสิ้นสุด · tax_profiles: **"Outsource Standard 3%"** (PND3) และ **"Juristic Entity 3%"** (PND53) — ทั้งคู่ before_vat, threshold 100000 (฿1,000) · งวด ตุลาคม 2569 = collecting · approval_matrices / assignment_policy_settings / bank_accounts / finance_companies = ว่าง
> **สมมติฐานเวลา (v3)**: เช็คอินทุกครั้งของ R4 อยู่ใน**วันเดียว = 04/10/2569 (เวลาไทย)** ⇒ in1 / in2 / out1 มีวันลงพื้นที่คนละ 1 วัน = `field_day_settlements` **3 แถว** · ถ้าเช็คอินของใครข้ามเที่ยงคืน → พนักงานคนนั้นได้ 2 วัน (อัตราเต็ม × 2 แล้วกระจายตามวัน) — ให้หยุดคำนวณใหม่ · **ห้ามเช็คอินเพิ่มหลังสั่ง job** (เช็คอินที่มาหลัง settle ไม่ได้ส่วนแบ่ง — วันนั้นถือว่าคิดครบแล้ว) · ADV3 overdue ทดสอบใน **R7** (หลังเที่ยงคืน 05/10)

---

## M1 บริษัทไฟแนนซ์ (ฟอร์มมี `vat_mode` + `wht_withheld_by_customer_pct` แล้ว — BUG-001)
| คีย์ | name | shortName | taxId | vat_mode | wht_withheld_by_customer_pct | template | vatRegistered | billingDay | paymentDueDays |
|---|---|---|---|---|---|---|---|---|---|
| M1.CO1 | บริษัท ยูเอที ลิสซิ่ง จำกัด | UATL | 0105561000011 | exclude_vat | **3** | M2.T1 | true | 25 | 30 |
| M1.CO2 | บริษัท ยูเอที แคปปิตอล จำกัด | UATC | 0105561000020 | **include_vat** | **NULL** | M2.T2 | true | 5 | 15 |
ที่อยู่ CO1: 99 ถนนสาทร แขวงยานนาวา เขตสาทร กรุงเทพมหานคร 10120 · โทร 021000001 · ผู้ติดต่อ มาลี ลิสซิ่ง 0810000012 · ผู้ลงนาม นายใหญ่ ลิสซิ่ง
ที่อยู่ CO2: 88 ถนนงามวงศ์วาน ตำบลบางกระสอ อำเภอเมืองนนทบุรี นนทบุรี 11000 · โทร 021000002 · ผู้ติดต่อ ศิริ แคปปิตอล 0810000014 · ผู้ลงนาม นางโต แคปปิตอล
(taxId 13 หลัก — Zod ไม่ตรวจ checksum แต่ค่าที่ให้ผ่าน mod-11 อยู่แล้ว)

## M2 Service Fee Template (สร้างก่อน M1 เพราะ serviceFeeTemplateId บังคับ)
| คีย์ | name | model | base_satang | rate_pct | basis | chargeOnFail | chargePerTrackingRound |
|---|---|---|---|---|---|---|---|
| M2.T1 | UAT Success 5% | SUCCESS_FEE | 0 | 5.00 | debt_amount | false | false |
| M2.T2 | UAT Flat 7,490 | FLAT | **749000 (฿7,490.00)** | 0 | null | **false** | false |

> **หลัง R1 (03/10/2569)**: T1/T2 ที่ใช้งานจริงคือ **version 2** — R1 ลืมเอาติ๊ก "คิดค่าบริการต่อรอบการติดตาม" ออกตอนสร้าง (ฟอร์ม default = ติ๊ก ตาม `02`) จึงแก้ผ่านหน้าแก้ไข ได้ v2 ที่ `charge_per_tracking_round = false` · ยอดเงินเท่าเดิม · ค่าคาดหวังที่อ้าง "v1" ให้อ่านเป็น v2 (case snapshot ตอน approved ต้องเป็น v2)
- basis ต้องเป็น debt_amount (ฟอร์มเคสไม่มี assetValue) · T2 charge_on_fail=false ⇒ C3 (fail) ไม่มี revenue
- T2 = ราคารวม VAT (CO2 include_vat): VAT = 749000×7/107 = **49000**, ก่อน VAT = **700000**

## M3 ทีม (สร้างหลัง M5 เพราะ compensationPlanId บังคับ; supervisor/manager ผูกหลังสร้างผู้ใช้)
| คีย์ | name | side | compensationPlanId | provinces | supervisorId | managerIds |
|---|---|---|---|---|---|---|
| M3.TEAM_A | UAT ทีม A กรุงเทพ | inhouse | M5.PLAN_IN | [กรุงเทพมหานคร, สมุทรปราการ] | uat.sup.in | [uat.mgr.in] |
| M3.TEAM_B | UAT ทีม B นนทบุรี (ว่าง) | inhouse | M5.PLAN_IN | [นนทบุรี] | — | [uat.mgr.in] |
| M3.TEAM_C | UAT ทีม C ปทุมธานี (OS) | outsource | M5.PLAN_OUT | [ปทุมธานี] | — | [uat.mgr.out] |

## M4 ผู้ใช้ (บทบาท/สังกัดตาม `uat/personas.json` — **รหัสผ่านไม่อยู่ในไฟล์นี้**)
username ผ่าน `/^[a-z0-9][a-z0-9._-]{2,49}$/` · phone 10 หลัก · email ไม่บังคับ (ใช้ `<username>@uat.test`)
| username | fullName | phone | teamId / companyId |
|---|---|---|---|
| uat.admin | สมใจ ธุรการดี | 0810000001 | — |
| uat.approver | วิภา ตรวจเคส | 0810000002 | — |
| uat.finance | กมล การเงิน | 0810000003 | — |
| uat.account | ปรีดา บัญชีงาม | 0810000004 | — |
| uat.exec | อำนาจ บริหารกิจ | 0810000005 | — |
| uat.mgr.in | ชัยวัฒน์ จัดการทีม | 0810000006 | TEAM_A (+ manager ของ TEAM_B ผ่าน managerIds) |
| uat.sup.in | สุริยา หัวหน้าเอ | 0810000007 | TEAM_A |
| uat.agent.in1 | อนันต์ ตามทรัพย์ | 0810000008 | TEAM_A |
| uat.agent.in2 | บุญมี ภาคสนาม | 0810000009 | TEAM_A |
| uat.mgr.out | ธนา เอาท์ซอร์ส | 0810000010 | TEAM_C |
| uat.agent.out1 | ประเสริฐ รับเหมา | 0810000011 | TEAM_C |
| uat.co1.mgr | มาลี ลิสซิ่ง | 0810000012 | CO1 (POST /api/finance-companies/:id/users) |
| uat.co1.sup | นิพนธ์ ลิสซิ่ง | 0810000013 | CO1 |
| uat.co2.admin | ศิริ แคปปิตอล | 0810000014 | CO2 |
Negative: สร้าง `uat.admin` ซ้ำ → `DUPLICATE_USERNAME`

## M5 Compensation Plan (effectiveFrom = `2026-10-01` ใน `<input type="date">`)
| คีย์ | name | fuelMode | fuel_daily_flat | allowance/วัน | commission | no_success_fee | hotelMax/คืน | hotelReceiptRequired | whtPct (plan) |
|---|---|---|---|---|---|---|---|---|---|
| M5.PLAN_IN | UAT Inhouse | DAILY_FLAT | 20000 (฿200) | 15000 (฿150) | 50000 (฿500) | 20000 (฿200) | 80000 (฿800) | true | 3.00 |
| M5.PLAN_OUT | UAT Outsource เหมา | DAILY_FLAT | **550000 (฿5,500)** (ชื่อ "เหมาต่อเคส" — หลัง Q21 = **ต่อพนักงานต่อวัน**) | 0 | 100000 (฿1,000) | 0 | 0 | true | **5.00** (≠ payee 3% โดยตั้งใจ) |
- ไม่ใช้ PER_KM (พึ่ง Google Distance Matrix ภายนอก) · ทั้งสองแผนมี whtPct ⇒ ไม่ชนหนี้ #3 โดยไม่ตั้งใจ · DB ยืนยัน 03/10/2569: ทั้งสองแผน **version 1** effective 2026-10-01
- PLAN_OUT fuel ฿5,500 > เพดาน ฿5,000 ⇒ รายการ fuel ของ C5 ต้องผ่าน**บริหาร** (แถว 2) · commission C5 ฿1,000 = แถว 1 (matrix เลือก**ต่อรายการ**)
- Q21: อัตราในแผน = ยอด **ต่อพนักงานต่อวัน** (D) ไม่ใช่ต่อเคส · out1 ไป C5 เคสเดียวใน 04/10 ⇒ C5 ได้ fuel เต็ม 550000 · allowance ของ PLAN_OUT = 0 ⇒ **ไม่มีแถว allowance** (ส่วนแบ่ง 0 ไม่สร้างแถว — D10) · ถ้า out1 ไป 2 เคสในวันเดียว แต่ละเคสได้ 275000

## M6 Payee + Tax Profile (payee-level) + บัญชีธนาคาร (เลขสมมติ)
| payee | payeeType | taxProfileId | nationalId | bankName | accountName | accountNumber | verified |
|---|---|---|---|---|---|---|---|
| uat.agent.in1 | individual | Outsource Standard 3% | 1103700000011 | กสิกรไทย | อนันต์ ตามทรัพย์ | 1234567810 | verify ใน R6 ก่อน IN-1 |
| uat.agent.in2 | individual | Outsource Standard 3% | 1103700000020 | กรุงเทพ | บุญมี ภาคสนาม | 2345678921 | ❌ ปล่อย unverified (ต้องถูกกันออกจาก IN-1) → verify ใน R6 ก่อน IN-2 |
| uat.agent.out1 | individual | Outsource Standard 3% (**Payee 3% ชนะ Plan 5%**) | 1103700000038 | ไทยพาณิชย์ | ประเสริฐ รับเหมา | 3456789032 | verify ใน R6 ก่อน OUT-1 |
ไม่มีการสร้าง Tax Profile ใหม่ (ใช้ของ seed) · DB 03/10/2569 (`R3-end-v2`): payee ทั้ง 3 `is_verified = false` ผูก "Outsource Standard 3%" (before_vat, threshold 100000) ตามมติ orchestrator "verify ใน R6"

## M7 Approval Matrix (approvalFlow = ชื่อ role ไทยตรงตัว)
| ลำดับ | condition | conditionThresholdSatang | approvalFlow | SoD |
|---|---|---|---|---|
| 1 | ยอดไม่เกิน 5,000 บาท | 500000 | [ผู้จัดการทีมติดตามทรัพย์, การเงิน] | true |
| 2 | ยอดเกิน 5,000 บาท | NULL | [ผู้จัดการทีมติดตามทรัพย์, การเงิน, บริหาร] | true |
เลือกแถวแรกที่ `amount ≤ threshold` **ต่อรายการ expense** (฿5,000.00 พอดี = แถว 1) · reason (5–500 ตัวอักษร) เช่น "ตั้งสายอนุมัติสำหรับ UAT รอบที่ 1"

## M8 finance_policy_settings
คงค่า: requirePayeeIdDocument=false, arAgingBuckets={30,60,90}, writeOffToleranceSatang=5000 (฿50) · **แก้**: advanceMaxAmountPerRequestSatang NULL → **500000 (฿5,000)**

## M9 งวดบัญชี
ไม่สร้างงวดเอง — ระบบสร้างจากเดือนแรกที่มีกิจกรรม · งวด **ตุลาคม 2569** มีอยู่แล้ว (collecting) · R8 ล็อก ต.ค. 2569

## M10 บัญชีธนาคารบริษัท
bankName กสิกรไทย · accountName บริษัท แอสเซ็ท รีคัฟเวอรี่ (UAT) จำกัด · accountNumber 9990001112 · accountType ออมทรัพย์ · usage **both** · isPrimary true · isPayoutAccount true · autoMatchToleranceDays **7**

## M11 Bank file format
bankName กสิกรไทย · fileType **CSV** · encoding **UTF_8** (UI: UTF-8) · column mapping ตามค่าเริ่มต้นของฟอร์ม

## M12 รอบ AR/AP (ไม่บังคับ)
ถ้าจะตั้ง: AR CO1 cutoff month_end, due net_days 30 · AR CO2 cutoff month_end, due net_days 15 — ไม่มีผลกับ golden

---

## เคส C1–C8 (R2) — ข้อมูลลูกหนี้สมมติ
ฟิลด์บังคับ: caseRef, financeCompanyId, debtorName, debtorNationality=TH, nationalId 13 หลัก, debtorPhoneMobile 10 หลัก, addressCurrent(province+detail), addressIdCard(province+detail+postalCode), assetType, assetBrandModel, assetImeiSerial, outstandingDebtSatang · เอกสาร: contract_doc, national_id_doc, product_photo (1–8 รูป)
| เคส | caseRef | บริษัท | debtorName | nationalId | มือถือ | ที่อยู่ปัจจุบัน (province / detail) | ที่อยู่บัตร (province / detail / postal) | assetType / brandModel | IMEI | outstandingDebt |
|---|---|---|---|---|---|---|---|---|---|---|
| C1 | UAT-CO1-001 | CO1 | นายสมชาย ใจดีมาก | 1103700000046 | 0891000001 | กรุงเทพมหานคร / 12 ซ.ลาดพร้าว 15 แขวงจอมพล เขตจตุจักร | กรุงเทพมหานคร / 12 ซ.ลาดพร้าว 15 / 10900 | smartphone / Samsung Galaxy A55 | 356789100000011 | 1850000 (฿18,500) |
| C2 | UAT-CO1-002 | CO1 | นางสาวสุดา รักษ์ดี | 1103700000054 | 0891000002 | กรุงเทพมหานคร / 45 ถ.พระราม 9 แขวงห้วยขวาง | กรุงเทพมหานคร / 45 ถ.พระราม 9 / 10310 | smartphone / iPhone 15 128GB | 356789100000029 | 2490000 (฿24,900) |
| C3 | UAT-CO2-003 | CO2 | นายวีระ หายไป | 1103700000062 | 0891000003 | กรุงเทพมหานคร / 7 ถ.บางนา-ตราด แขวงบางนา | สมุทรปราการ / 7 ม.3 ต.บางพลีใหญ่ / 10540 | smartphone / OPPO Reno 11 | 356789100000037 | 1200000 (฿12,000) |
| C4 | UAT-CO1-004 | CO1 | นางมณี ส่งช้า | 1103700000071 | 0891000004 | กรุงเทพมหานคร / 88 ถ.รัชดาภิเษก แขวงดินแดง | กรุงเทพมหานคร / 88 ถ.รัชดาภิเษก / 10400 | tablet / iPad Air M2 | 356789100000045 | 3120000 (฿31,200) |
| C5 | UAT-CO2-005 | CO2 | นายประยุทธ์ ไกลบ้าน | 1103700000089 | 0891000005 | ปทุมธานี / 9 ม.2 ต.คลองหนึ่ง อ.คลองหลวง | ปทุมธานี / 9 ม.2 ต.คลองหนึ่ง / 12120 | smartphone / vivo V30 | 356789100000052 | 1590000 (฿15,900) |
| C6 | UAT-CO1-001 (ซ้ำ C1) แล้ว UAT-CO1-006 (2 แท็บพร้อมกัน) | CO1 | นายทดสอบ ซ้ำซ้อน | 3103700000115 | 0891000006 | กรุงเทพมหานคร / 1 ถ.สุขุมวิท แขวงคลองเตย | กรุงเทพมหานคร / 1 ถ.สุขุมวิท / 10110 | smartphone / Redmi Note 13 | 356789100000060 | 2000000 (฿20,000) |
| C7 | UAT-CO2-007 | CO2 | นางสาวปิยะ เงียบ | 3103700000123 | 0891000007 | กรุงเทพมหานคร / 3 ถ.เพชรเกษม แขวงบางแค | กรุงเทพมหานคร / 3 ถ.เพชรเกษม / 10160 | smartphone / Samsung Galaxy A35 | 356789100000078 | 980000 (฿9,800) |
| C8 | UAT-CO1-008 | CO1 | นายไม่ผ่าน เกณฑ์ | 3103700000131 | 0891000008 | กรุงเทพมหานคร / 5 ถ.จรัญสนิทวงศ์ แขวงบางพลัด | กรุงเทพมหานคร / 5 ถ.จรัญฯ / 10700 | smartphone / iPhone 13 | 356789100000086 | 1600000 (฿16,000) |
- เส้นทาง: C1,C2 → TEAM_A/in1 · C3,**C4 → TEAM_A/in2** · C5 → TEAM_C/out1 · C7 → TEAM_A มอบหมาย in2 → ไม่รับ → `reassign_timeout` → มอบหมายใหม่ให้ in1 (รับแต่ไม่ปิดงาน — ค้าง active) · **C8 ถูกปัดใน R2 ไม่มอบหมาย** reason: "เอกสารสัญญาไม่ครบ ขาดสำเนาบัตรผู้ค้ำประกัน" · C6: `UAT-CO1-001` ต้องโดนปัดซ้ำ, `UAT-CO1-006` 2 แท็บ → สร้างได้ **1** ใบ (ค้าง pending_review ไม่เข้าเงิน/รายงานเงิน)
- ทีมที่ระบบเสนอ (province ที่อยู่ปัจจุบัน): C1–C4,C6–C8 → TEAM_A · C5 → TEAM_C · C7 (CO2 กรุงเทพ) → TEAM_A
- ส่งเคส**ไม่ตรวจ IMEI** (15 หลัก → cases.imei, อื่น → serialNo) ⇒ probe IMEI ย้ายไป R5

## ภาคสนาม (R4) — ปิดงานต้องมี check-in ≥1 (GPS), รูป ≥1, วิดีโอ ≥1, รูปสินค้า ≥1 (เฉพาะ success), **เหตุผลไม่สำเร็จ (เฉพาะ fail — Q16)** · server ตรวจไฟล์เอง (Q13)
| เคส | ผู้รับ | ผล | วัน check-in | ค่าที่พัก (hotel) | หมายเหตุ |
|---|---|---|---|---|---|
| C1 | in1 | closed_success | 1 | **ยื่น ฿600 (60000) วันที่เข้าพัก = วันปิด C1 (TODAY)** แนบใบเสร็จ `uat/fixtures/files/R4-C1-photo.jpg` · ผ่านหน้า "เบิกค่าใช้จ่าย" → แท็บ "เบิกแยก" → "เบิกที่พัก" (พักคนเดียว) | hotel ไม่ผูกเคส · `pending_approval` ทันที (ไม่ผ่านคลัง) |
| C2 | in1 | closed_success (ปิดบน desktop) · บันทึกเพิ่มเติม "ลูกหนี้คืนเครื่องที่หน้าบ้าน กล่องและสายชาร์จครบ" | 1 | ไม่ยื่น | "ไม่เบิกเพิ่ม" — commission เกิดตอนปิดงาน · fuel+allowance เกิดจาก job รายวัน (D-DAY) · `case_evidences.note` (Q15) |
| C3 | in2 | closed_fail · เหตุผล **"ไม่พบลูกหนี้"** (`debtor_not_found`) · อธิบาย "ไปบ้านตามที่อยู่ปัจจุบัน บ้านปิด เพื่อนบ้านแจ้งย้ายออกแล้ว" · บันทึกเพิ่มเติม "นัดลูกหนี้ทางโทรศัพท์ไม่ได้ 3 ครั้ง" | 1 | ไม่ยื่น | ไม่ผ่านคลัง · `case_evidences.fail_reason = debtor_not_found` + `fail_reason_detail` + `note` |
| C4 | in2 | closed_success → approver ตีกลับผ่านหน้าจอ ("รูปสินค้าไม่เห็น IMEI") → แก้รูป**โดยไม่เพิ่ม check-in** (โค้ดไม่ให้: `add_checkin` ทำได้เฉพาะ `scheduled` — `lib/field/field-status.ts`; `needs_revision` → 400 `ASSIGNMENT_INVALID_STATUS`) → resubmit_close | 1 | ไม่ยื่น | **commission เดิม 1 ใบ** = `superseded` + commission ใหม่ 1 ใบ (ราคา/plan/`expense_date` = ปิดครั้งแรก — Q7) · **แถวรายวัน fuel/allowance ของ C4 ไม่ถูกแตะ** (`supersedeCaseExpenses()` กรอง `field_day_settlement_id IS NULL` — `41` §10.1 v2.14) |
| C5 | out1 | closed_success | 1 | ไม่ยื่น | fuel ฿5,500 (แถวรายวัน) → บริหาร · commission ฿1,000 → แถว 1 |
- hotel ของ in1: payee มี Tax Profile ⇒ ไม่ชนหนี้ #3 · โค้ด**ไม่ตรวจเพดาน hotelMax ฿800** (ไม่ snapshot compPlan ให้ hotel) — ยอด 600 อยู่ในเพดานอยู่แล้ว · ใบเสร็จ hotel **ไม่ผ่าน** server-verify ของ Q13 (`submitHotelClaim()` ไม่เรียก `verifyUploadedFile`) — ข้อสังเกต ไม่บล็อก
- หลัง Q14: `case_evidences.status` ค้าง `pending` ตลอด R4 · C1/C2/C4/C5 → `approved` อัตโนมัติเมื่อคลังรับเข้า (R5) · C3 → `approved` เมื่อค่าตอบแทนของเคสอนุมัติครบ**ทุกแถวรวมแถวรายวัน** (R6 — `lib/field/evidence-approval.ts` อ่าน expense ทุกแถวของเคส)

### D-DAY แถวรายวัน (Q21 · job `daily_field_allowance` วันที่ 2026-10-04) — เกิด**ท้าย R4a** หลังเช็คอิน/ปิดงานครบ 5 เคส (ก่อน R4b)
แผน = เวอร์ชันของแผนทีมที่เช็คอินแรกของวันนั้นสังกัด (snapshot ณ วันลงพื้นที่) · ลำดับเคส = เวลาเช็คอินแรกของเคสในวัน (เท่ากันใช้ caseId) · `expense_date` = **2026-10-04** · `calculation_source` = `compensation_plan` · `field_day_settlement_id` ชี้แถว settlement · audit actor = ระบบ (`actor_id` NULL) reason `[job:<jobId>] คำนวณค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยงรายวันของวันที่ 2026-10-04 …`
| พนักงาน | แผน (v1) | เคสที่เช็คอิน 04/10 (ลำดับ) | fuel D → ต่อเคส | allowance D → ต่อเคส | `field_day_settlements` (fuel_total / allowance_total / case_count) | expense ใหม่ |
|---|---|---|---|---|---|---|
| in1 | PLAN_IN | C1 (R4.07) → C2 (R4.11) | 20000 → **10000 / 10000** | 15000 → **7500 / 7500** | 20000 / 15000 / **2** | 4 |
| in2 | PLAN_IN | C3 (R4.16) → C4 (R4.17) | 20000 → **10000 / 10000** | 15000 → **7500 / 7500** | 20000 / 15000 / **2** | 4 |
| out1 | PLAN_OUT | C5 (R4.19) | 550000 → **550000** | 0 → ไม่มีแถว | 550000 / 0 / **1** | 1 |
| **รวม** | | 5 เคส | 590000 | 30000 | **3 แถว** | **9** (`expensesCreated` = 9, `settled` = 3) |
- หารลงตัวทุกตัว ⇒ ไม่มีเศษสตางค์ (ถ้ามีเศษ จะลงเคสแรก: in1 = C1, in2 = C3) · C3 เป็นเคสไม่สำเร็จ + คนละบริษัทกับ C4 ก็ได้ส่วนแบ่งเท่ากัน (กติกาไม่ดู outcome/บริษัท)
- **สถานะเริ่มต้น** (`initialFieldDayExpenseStatus()`): เคสสำเร็จที่ทรัพย์ยังไม่ผ่านคลัง (C1/C2/C4/C5 — asset `pending_intake`) → `pending_warehouse_confirm` · เคสไม่สำเร็จ (C3) → `pending_approval` · (ถ้า settle หลังล็อต confirmed แล้ว → `pending_approval` ทันที — ไม่เกิดใน UAT)
- `approval_step_total` = 2 (ค่า default ของตาราง — สายจริงเลือกตอนอนุมัติ) · ไม่มีแจ้งเตือนจาก job (C3 แถวรายวันเข้าคิวอนุมัติเงียบ ๆ — ข้อสังเกต R4v3-B)
- **idempotent**: สั่งซ้ำนาทีเดียวกัน → `duplicate: true` ได้ job เดิม (`outcome: 'skipped'`) · สั่งนาทีถัดไป → job ใหม่ `completed` แต่ `result.settled = 0`, `expensesCreated = 0` (ไม่มีแถว (พนักงาน, วัน) ค้าง) · UNIQUE `uniq_field_day_settlements_org_agent_date` กันชนพร้อมกัน · `date` วันอนาคต / รูปแบบผิด → 400 `REQUIRED_MISSING` fields.date · **ไม่ส่ง `date`** = settle เฉพาะวันที่ < วันนี้ ⇒ 04/10 ไม่ถูกคิด (ห้ามลืม payload)

## R5 คลัง — IMEI probe (imeiActual `/^\d{15}$/`) · ผู้เล่น = **ธุรการ `uat.admin`** (Q1)
| probe | ค่า | คาด |
|---|---|---|
| ตรงสัญญา | ตาม IMEI เคส | รับเข้า in_custody ไม่มีเตือน |
| 14 หลัก | 35678910000001 | ถูกปัด (validation 400) |
| มีขีด | 356789-100000011 | ถูกปัด (validation 400) |
| 15 หลักไม่ตรง (ใช้กับ C1 แล้วแก้กลับ หรือทดลองก่อนยืนยัน) | 356789100000999 | เตือน `IMEI_MISMATCH` ไม่บล็อก |
ล็อต: LOT CO1 = {C1, C2, C4} · LOT CO2 = {C5} · ยัด C5 เข้าล็อต CO1 ต้องถูกปัด · C3 ต้องไม่อยู่ในคลัง · หลัง confirm: **ยังไม่มี revenue แม้แต่แถวเดียว** (ทุกเคสมี expense ที่ยังไม่ approved — ดู D2) และ expense **ทั้ง 3 ชนิดต่อเคส (แถวรายวัน fuel/allowance + commission — C5 = fuel + commission)** เปลี่ยน pending_warehouse_confirm → pending_approval (ล็อต CO1 ปลด **9** แถว · ล็อต CO2 ปลด **2** แถว — `expenseIdsUnlocked` นับรวมแถวรายวัน) · หลักฐาน C1/C2/C4(แถว pending)/C5 → `approved` ตอนรับเข้า (Q14)

## เงินทดรอง (R4b ขอผ่านหน้าจอ `/field/advances` → R6 อนุมัติ/เคลียร์)
| คีย์ | ผู้ขอ | ขอ | due_clear_date | เส้นทาง | คาด |
|---|---|---|---|---|---|
| ADV1 | in1 | 300000 (฿3,000) | วันนี้+7 | อนุมัติเต็ม (approved 300000) → **เข้า IN-1** → เคลียร์ used 245000 | return = 300000 − 245000 = **55000 (฿550.00)** (`22` §6.13: GREATEST(0, approved − used)) · ไม่มีคำขอเบิกส่วนเกิน |
| ADV2 | in1 | 100000 | วันนี้+7 | ขอขณะ ADV1 **pending** → สร้างได้ (pending ไม่บล็อก) | R6: หลังอนุมัติ ADV1 → อนุมัติ ADV2 ถูกปัด `ADVANCE_PENDING_SETTLEMENT` → ตีกลับพร้อมเหตุผล → `rejected` (ก่อนสร้าง IN-1) |
| ADV3 | in2 | 200000 (฿2,000) | **04/10/2569 (วันที่ขอ)** — Q8 ห้ามย้อนหลัง | R6: อนุมัติเต็ม → เข้า IN-2 (หลัง verify in2) · **R7 (หลังเที่ยงคืน 05/10 เวลาไทย)**: `advance_overdue` job → `overdue` · รันซ้ำไม่เปลี่ยน/ไม่แจ้งซ้ำ (มติ PO 04/10/2569) | ค้างใน F5 · ถ้าสั่ง job ใน R6 (ยัง 04/10) → ไม่เปลี่ยนสถานะ (due = วันนี้ ยังไม่เลย) — ถูกต้อง ไม่ใช่บั๊ก |
| ADV-MAX | out1 | 600000 | วันนี้+7 | — | `ADVANCE_EXCEEDS_MAX` (เพดาน M8 500000) ไม่มีแถว |
| **ADV4 (= ADV-OVER, Q3)** | out1 | **100000 (฿1,000)** | วันนี้+7 | R6: อนุมัติเต็ม**ก่อนสร้าง OUT-1** → เข้า OUT-1 → OUT-1 completed → out1 เคลียร์ used **130000 (฿1,300)** | return = **0** (ไม่ติดลบ) · excess = 130000 − 100000 = **30000 (฿300)** → ระบบสร้าง expense `manual` ของ out1 `pending_approval` อัตโนมัติ (ทรานแซกชันเดียวกับเคลียร์) → อนุมัติ (แถว 1) → **OUT-2** (ดู E6) |
| probe วันย้อนหลัง | in2 | 200000 | เมื่อวาน | — | หน้าจอ: `min` ของช่องวันที่ = วันนี้ · API: 400 `REQUIRED_MISSING` fields.dueClearDate "กำหนดเคลียร์ยอดต้องเป็นวันนี้หรือวันถัดไป — เลือกวันที่ผ่านมาแล้วไม่ได้" |
ลำดับ R6 สำคัญ: อนุมัติ ADV1 → ปัด ADV2 → **สร้าง IN-1 ก่อนเคลียร์ ADV1** (ใบ cleared ไม่เข้ารอบ) · อนุมัติ ADV4 → สร้าง OUT-1 → completed → เคลียร์ ADV4 → อนุมัติคำขอส่วนเกิน → OUT-2
- เหตุผลที่เลือก ADV4 แทนการ "ลองกดดู" กับ ADV1: หลัง Q3 การเคลียร์เกินยอด**บันทึกจริงและปิดใบ** ทดลองกับ ADV1 ไม่ได้ (golden ADV1 คืน 550 จะหาย) · ใช้ out1 เพราะไม่มีใบค้าง (ADV-MAX ถูกปัด) และแยกผลออกจากรอบ inhouse
- ถ้า orchestrator **ไม่เอา ADV-OVER**: R6 ตีกลับ ADV4 พร้อมเหตุผล → `rejected` · ใช้ค่าในวงเล็บ "(ไม่มี ADV4)" ใน E6/E10

---

## E — ค่าคาดหวัง (golden)

### E1 ประมาณการรายได้ ตอนส่งเคส (`38` §6.5)
| C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 |
|---|---|---|---|---|---|---|---|
| 92500 (฿925) = 1850000×5% | 124500 | 749000 (FLAT=base) | 156000 | 749000 | 100000 | 749000 | 80000 |
CO2 = ราคารวม VAT (base) — ดู D5 · ไม่เปลี่ยนใน v2

### E2 Service fee snapshot (ตอน **approved** ไม่ใช่ตอนสร้าง — `92` §7.1)
ก่อน approved = NULL ทุกช่อง · CO1 เคส: SUCCESS_FEE / base 0 / rate 5.00 / basis debt_amount / charge_on_fail false · CO2 เคส: FLAT / base 749000 / rate 0 / basis null / charge_on_fail false · C6/C8 ไม่มี snapshot · ไม่เปลี่ยนใน v2

### E3 ค่าใช้จ่ายต่อเคส (`22` §6.2 fuel DAILY_FLAT / §6.3 allowance = **D ต่อพนักงานต่อวัน กระจายเท่ากันทุกเคสของวัน** (Q21 — ตาราง D-DAY) · §6.4 commission/no_success ค่าตายตัวต่อ outcome ตอนปิดงาน)
| เคส/ผู้รับ | fuel (แถวรายวัน) | allowance (แถวรายวัน) | commission / no_success (ตอนปิดงาน) | **รวม** | สายอนุมัติ (ต่อรายการ) | สถานะปลาย R4 |
|---|---|---|---|---|---|---|
| C1/in1 | **10000** | **7500** | commission 50000 | **67500 (฿675)** | แถว 1 ทุกใบ | `pending_warehouse_confirm` ×3 |
| C2/in1 | **10000** | **7500** | commission 50000 | **67500** | แถว 1 | `pending_warehouse_confirm` ×3 |
| C3/in2 | **10000** | **7500** | no_success_fee 20000 | **37500 (฿375)** | แถว 1 | **`pending_approval`** ×3 (ไม่ผ่านคลัง) |
| C4/in2 | **10000** (เดิม ไม่ถูกแทนที่) | **7500** (เดิม ไม่ถูกแทนที่) | commission **ใบใหม่** 50000 (+ใบเดิม 50000 = `superseded` ไม่นับ) | **67500** | แถว 1 | `pending_warehouse_confirm` ×3 |
| C5/out1 | **550000** | 0 (ไม่มีแถว) | commission 100000 | **650000 (฿6,500)** | fuel **แถว 2 → บริหาร** · commission แถว 1 | `pending_warehouse_confirm` ×2 |
| **รวมผูกเคส (active)** | 590000 | 30000 | 270000 (commission 250000 + no_success 20000) | **890000 (฿8,900)** | | 14 แถว (รายวัน 9 + ปิดงาน 5) |
| hotel in1 (ไม่ผูกเคส) | | | | **60000 (฿600)** | แถว 1 | `pending_approval` |
| **รวม active ทั้งหมด** | | | | **950000 (฿9,500)** | | **15 แถว** (+ superseded **1** = **16**) |
- ต่อพนักงานต่อวัน (ตรวจผลรวม): in1 fuel 10000+10000 = 20000 · allowance 7500+7500 = 15000 · in2 เหมือน in1 · out1 fuel 550000 = อัตราเต็มของแผนทุกคน
- **ลำดับเวลาที่แถวเกิด**: ปิดงานแต่ละเคส (R4a) → commission/no_success **1 แถว/เคส** (5 แถว) · ท้าย R4a สั่ง job → แถวรายวัน 9 แถว · R4b resubmit C4 → commission เดิม `superseded` + ใบใหม่ 1 แถว ⇒ ปลาย R4 = 16 แถว
- ก่อนสั่ง job (ระหว่าง R4a): expense มีแค่ 5 แถว (commission C1/C2/C4/C5 + no_success C3) = **270000** · หน้า 'เบิกค่าใช้จ่าย' แสดง 'ค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยง — รอคำนวณหลังจบวัน' + 'วันที่ลงพื้นที่: 04/10/2569'
ตีกลับทดสอบ R6: การเงินตีกลับ allowance (แถวรายวัน 7500) ของ C3 ที่ขั้น 2 → `needs_revision`, approval_step_current = 1 → resubmit → ผ่านใหม่ทั้ง 2 ขั้น (ยอดไม่เปลี่ยน)

### E4 Revenue (`22` §6.5/6.6/6.8, VAT 7.00 จาก vat_rate_history, revenue_date = วันที่ closedAt เวลาไทย) — ยอดไม่เปลี่ยน · v2 เพิ่ม `vat_mode` snapshot (Q6)
| เคส | gross (ก่อน VAT) | VAT | total | fee_model_snapshot | vat_mode snapshot | เกิดเมื่อ |
|---|---|---|---|---|---|---|
| C1 | 92500 (฿925.00) | 6475 (฿64.75) = 92500×7% | 98975 (฿989.75) | SUCCESS_FEE | exclude_vat | R6 expense ใบสุดท้ายของเคส (แถวรายวัน + commission) approved (lot confirmed แล้ว + วันลงพื้นที่ settle แล้ว) |
| C2 | 124500 (฿1,245.00) | 8715 | 133215 (฿1,332.15) | SUCCESS_FEE | exclude_vat | R6 (เหมือน C1 — ไม่ใช่ R5, ดู D2) |
| C3 | — ไม่มีแถว | | | | | fail + charge_on_fail=false |
| C4 | 156000 (฿1,560.00) | 10920 | 166920 (฿1,669.20) | SUCCESS_FEE | exclude_vat | R6 หลัง active ครบ 3 ใบ approved (แถวรายวัน 2 + commission ใหม่) |
| C5 | 700000 (฿7,000.00) | 49000 = 749000×7/107 | 749000 (฿7,490.00) | FLAT | include_vat | R6 หลังบริหารอนุมัติ fuel + commission approved |
| C6/C7/C8 | — | | | | | |
| **รวม** | **1073000** | **75110** | **1148110** | | | 1 แถวต่อเคส (idempotent) · ยอดไม่เปลี่ยนใน v3 · ถ้าวันลงพื้นที่ยังไม่ settle → skip `field_days_not_settled` |

### E5 WHT (`22` §6.9 — ฐาน before_vat, **Payee ชนะ Plan**, เกณฑ์ ฿1,000 เทียบ **ฐานรวมของ payee ต่อรอบจ่าย** (Q5) แล้วกระจายลงรายการแบบ largest remainder)
| ผู้รับ / รอบ | รายการ (gross) | ฐานรวม payee | ≥ 100000? | อัตรา | WHT รวม | WHT ต่อรายการ |
|---|---|---|---|---|---|---|
| in1 / IN-1 | C1: fuel 10000, allowance 7500, commission 50000 · C2: เหมือน C1 · hotel 60000 | **195000** | ✅ | 3% payee | **5850 (฿58.50)** = 195000×3% | 300 / 225 / 1500 / 300 / 225 / 1500 / 1800 |
| in2 / IN-2 | C3: fuel 10000, allowance 7500, no_success 20000 · C4: fuel 10000, allowance 7500, commission ใหม่ 50000 | **105000** | ✅ (เกินเกณฑ์แค่ 5000) | 3% payee | **3150 (฿31.50)** | 300 / 225 / 600 / 300 / 225 / 1500 |
| out1 / OUT-1 | C5: fuel 550000, commission 100000 | **650000** | ✅ | **3% payee** (ไม่ใช่ plan 5%) | **19500 (฿195.00)** | 16500 / 3000 |
| out1 / OUT-2 | คำขอเบิกส่วนเกิน ADV4 (`manual`) 30000 | **30000** | ❌ | 3% payee | **0** | 0 |
| advance | ADV1 / ADV3 / ADV4 | — | — | — | 0 (advance ไม่หัก ไม่นับในฐาน) | |
- ทุกยอด × 3% ลงตัว (7500×3% = 225) ⇒ ไม่มีเศษให้กระจาย · ถ้าคิดต่อรายการแบบเดิม (ก่อน Q5) in1/in2 = 0, out1 = 16500 (เฉพาะ fuel) — ใช้แยกบั๊กถอยหลัง
- ⚠️ **in2 ฐานชิดเกณฑ์**: ถ้ารายการใดของ in2 ขาดตอนสร้าง IN-2 (เช่น allowance C3 ที่ถูกตีกลับยังไม่ผ่านรอบสอง → ฐาน 97500) ⇒ **WHT ทั้งรอบ = 0** · R6 ต้องให้ทั้ง 6 รายการ approved ก่อนสร้าง IN-2
- ⚠️ **ฐานขึ้นกับรายการที่อนุมัติครบก่อนสร้างรอบ**: ถ้า hotel ของ in1 ยังไม่ approved ตอนสร้าง IN-1 → ฐาน 135000 → WHT 4050 · ถ้า C5 commission เข้ารอบแต่ fuel ยังรอบริหาร → OUT-1 ฐาน 100000 → WHT 3000 ⇒ R6 ต้องอนุมัติครบทุกใบของ payee ก่อนกดสร้างรอบ
- ถ้า fallback plan (บั๊ก) out1 = 650000×5% = 32500
- หน้าคิวอนุมัติแสดง "ภาษีประมาณต่อรายการ" (ยอดจริงคิดตอนสร้างรอบ) — อาจต่างจากรอบจ่าย (คำถามนักบัญชีข้อ 3) จดเป็นข้อสังเกต ไม่ใช่บั๊ก

### E6 รอบจ่าย (`22` §6.10)
| รอบ | รายการ | gross | WHT | **net** | สถานะเป้าหมาย |
|---|---|---|---|---|---|
| IN-1 (in2 unverified ถูกกัน) | C1 ×3 (67500) + C2 ×3 (67500) + hotel 60000 + ADV1 300000 = **8 รายการ** | **495000 (฿4,950.00)** | **5850** | **489150 (฿4,891.50)** | `file_generated` — **ห้ามกด completed ก่อน R7** (auto-match เงินออกจับเฉพาะ file_generated) |
| IN-2 (หลัง verify in2) | C3 ×3 (37500) + C4 active ×3 (67500) + ADV3 200000 = **7 รายการ** | **305000 (฿3,050.00)** | **3150** | **301850 (฿3,018.50)** | completed (manual) |
| OUT-1 | C5 fuel 550000 + C5 commission 100000 + ADV4 100000 = **3 รายการ** | **750000 (฿7,500.00)** (ไม่มี ADV4: 650000) | **19500** | **730500 (฿7,305.00)** (ไม่มี ADV4: 630500) | completed (manual) |
| OUT-2 | คำขอเบิกส่วนเกิน ADV4 30000 = 1 รายการ | **30000 (฿300.00)** | **0** (ต่ำกว่าเกณฑ์ทั้งรอบ) | **30000** | completed (manual) · (ไม่มี ADV4: ไม่มีรอบนี้) |
สร้างไฟล์โอนซ้ำ → `DUPLICATE_PAYMENT_FILE` เตือน + ได้ไฟล์เดิม · idempotency_key กันโอนซ้ำ

### E7 Billing / รับเงิน / AR (`22` §6.8, §6.11 + A1) — ไม่เปลี่ยนใน v2 (revenue เท่าเดิม)
| batch | revenues | ก่อน VAT | VAT | **total** | ลูกค้าหัก (pctOfSatang(Σgross, pct)) | **ยอดโอนจริง** | หลังรับ |
|---|---|---|---|---|---|---|---|
| CO1 | C1, C2, C4 | 373000 | 26110 | **399110 (฿3,991.10)** | 373000×3% = **11190 (฿111.90)** | **387920 (฿3,879.20)** | received 387920 + wht 11190 = total → `paid`, AR **0** |
| CO2 | C5 | 700000 | 49000 | **749000 (฿7,490.00)** | 0 (NULL) | **749000** | `paid`, AR 0 |
AR หลังส่ง billing ก่อนรับเงิน = 399110 + 749000 = **1148110** (ทั้งหมดในช่วงยังไม่ถึง/≤30 วัน)

### E8 Bank statement R7 (`uat/fixtures/bank-R7.csv`)
header `วันที่,รายละเอียด,อ้างอิง,เงินเข้า,เงินออก` · ยอดเป็นบาททศนิยม 2 ตำแหน่ง · **orchestrator ต้องแทน `{{R7_DATE}}`** ด้วยวันที่ ≥ วันส่ง billing / สร้างไฟล์โอน และห่างไม่เกิน 7 วัน (แนะนำ = วันนั้น + 1 วัน, รูปแบบ `YYYY-MM-DD` หรือ `DD/MM/พ.ศ.`) — ส่งเข้า importer เป็น JSON text
| แถว | เงินเข้า/ออก | คาด |
|---|---|---|
| 1 รับโอน CO1 | +3,879.20 | auto_matched กับ billing CO1 แบบ total − withheld (A1) → `paid` |
| 2 รับโอน CO2 | +7,490.00 | auto_matched billing CO2 ยอดเต็ม → `paid` |
| 3 จ่าย IN-1 | **−4,891.50** (v2 = −5,231.00 · v1 = −3,700.00) | auto_matched payout IN-1 (file_generated) |
| 4 ไม่ทราบที่มา | +123.45 | unmatched → manual / unmatched_resolved |
⚠️ **ไฟล์ fixture แถว 3 ต้องเป็น `4891.50` ก่อน R7** (orchestrator ตรวจค่าปัจจุบันในไฟล์ — v1 `3700.00` / v2 `5231.00` ผิดทั้งคู่) (step-sheet updater ไม่มีสิทธิ์แก้ fixture) · นำเข้าไฟล์เดิมซ้ำ → **imported = 0, duplicates = 4** (กันซ้ำรายแถวด้วย วันที่\|ยอด\|description — statement ไม่มี DUPLICATE_PAYMENT_FILE)

### E9 เอกสารภาษี (R7)
- ใบกำกับภาษี 2 ใบ (ตามบันทึกขายต่อ billing): CO1 373000 / 26110 / 399110 · CO2 700000 / 49000 / 749000 · เลขต่อเนื่องไม่กระโดด, ดับเบิลคลิกได้ใบเดียว
- 50 ทวิ ออก **1 ใบต่อรายการในรอบจ่ายที่ WHT > 0** (`syncWhtCertificatesFromPayout()` — คำถามนักบัญชีข้อ 1 ยังเปิด) ⇒ **15 ใบ รวม 28500 (฿285.00)**: in1 7 ใบ (5850 ฐาน 195000 — ออกเมื่อ IN-1 `completed` ผ่าน auto-match R7) · in2 6 ใบ (3150 ฐาน 105000) · out1 2 ใบ (16500 ฐาน 550000 + 3000 ฐาน 100000) · OUT-2 ไม่มีใบ · ทั้งหมด PND3 · ออกซ้ำไม่ได้ (idempotent) · ยกเลิกใบ (reason) แล้วออกใหม่ → ยอดนับครั้งเดียว
- ภ.ง.ด.3 ต.ค. 2569 = **28500** · ภ.ง.ด.53 = 0

### E10 Golden ของรายงาน R9 (ช่วง ต.ค. 2569, หลัง R7 ก่อน Adjustment R8)
| รหัส | สิ่งที่ต้องเห็น |
|---|---|
| **F1** กำไรขั้นต้น (`22` §6.12 — ไม่รวม VAT, direct cost = fuel+allowance+commission+no_success_fee ที่ **approved** และ**ผูกเคส**; hotel/manual ไม่นับ; C4 ใบเดิม superseded ไม่นับ) | ราย**บริษัท**: CO1 rev 373000 / cost 202500 (C1+C2+C4 = 67500×3) / GP **170500** / **45.71%** · CO2 rev 700000 / cost 687500 (C5 650000 + C3 37500) / GP **12500** / **1.79%** · **รวม 1073000 / 890000 / 183000 / 17.05%** · ราย**ทีม**: A 373000 / 240000 (C1+C2+C4 202500 + C3 37500) / **133000** / **35.66%** · C 700000 / 650000 / **50000** / **7.14%** · B: ไม่มีแถว หรือ margin **N/A** · (แถวรายวันนับเป็นต้นทุนของเคสที่ได้ส่วนแบ่ง — เหตุผลของการกระจายตาม Q21) |
| **F2** สรุปรายได้ (ก่อน VAT) | CO1 373000, 3 เคส, ต่อเคส round(373000/3)=124333 · CO2 700000, 1 เคส · รวม 1073000, 4 เคส, ต่อเคส 268250 · % สำเร็จ (ปิดสำเร็จ ÷ ปิดแล้ว — Q20): CO1 100% (3/3), CO2 50% (1/2) |
| **F3** อายุหนี้ | หลัง R7: ค้าง 0 ทุกช่วง · snapshot ระหว่าง R6→R7: 1148110 ช่วงแรก (CO1 399110, CO2 749000) |
| **F4** ค่าตอบแทน (snapshot `payout_batch_items` เฉพาะที่มาจาก expense — ไม่รวม advance) | in1 gross **195000** (commission 100000 · fuel 20000 · allowance 15000 · อื่น ๆ hotel 60000) WHT **5850** net **189150** · in2 **105000** (commission 50000 · fuel 20000 · allowance 15000 · อื่น ๆ no_success 20000) / **3150** / **101850** · out1 **680000** (commission 100000 · fuel 550000 · อื่น ๆ manual 30000) / **19500** / **660500** · **รวม 980000 / 28500 / 951500** · (ไม่มี ADV4: out1 650000 / 19500 / 630500 · รวม 950000 / 28500 / 921500) |
| **F5** เงินทดรองค้างเคลียร์ | 1 แถว: in2 ADV3 200000 `overdue` · ADV1/ADV4 cleared ไม่โผล่ · ADV2 rejected / ADV-MAX ไม่มีแถว ไม่โผล่ |
| **O1** อัตราความสำเร็จ (ปิดสำเร็จ ÷ ปิดแล้ว — Q20) | รวม 4/5 = **80%** · ทีม A 3/4 = 75% · ทีม C 1/1 = 100% · CO1 100% · CO2 50% (ไม่เปลี่ยน) |
| **O3** ปริมาณงานรายพนักงาน (% = ปิดสำเร็จ ÷ ปิดแล้ว — Q20 · `reassigned_away` ไม่นับเป็นงานคนเดิม · **ไม่เปลี่ยนใน v3** — ไม่ขึ้นกับยอดเงิน) | in1: รับ 3 (C1, C2, C7 ค้าง) ปิด 2 สำเร็จ 2 → **100%** (v1 = 66.67%) · in2: C3, C4 → 1/2 = **50%** (C7 reassigned_away ไม่นับ) · out1 1/1 = 100% |
| **O5** คลัง | คงเหลือ ณ ปัจจุบัน: รอรับเข้า 0 / ในคลัง 0 / รอส่งมอบ 0 · ส่งมอบแล้วในช่วง 4 ชิ้น (C1, C2, C4, C5) ใน 2 ล็อต confirmed · C3 ไม่มี |
| **A1** WHT รายเดือน | ต.ค. 2569: PND3 **28500**, PND53 0, รวม 28500 (ใบ cancelled ไม่นับ) |
| **A2** ใบกำกับภาษี | 2 ใบ active: ก่อน VAT 1073000 / VAT 75110 / รวม 1148110 |
| **E2** scorecard บริษัท | CO1: rev 373000, GP 170500, 45.71%, สำเร็จ 100%, AR 0 · CO2: rev 700000, GP 12500, 1.79%, สำเร็จ 50%, AR 0 |
| E1/E3/O2/O4/A3/A4 | ไม่กำหนดตัวเลข (ขึ้นกับเวลา/SLA/จำนวน export) · ตรวจเชิงคุณภาพ: การเงินเรียก E1 → 403 · A3 มี version 1,2 SHA-256 ต่างกัน |
| R8 หลัง Adjustment | ต้นฉบับ revenue ไม่เปลี่ยน · ยอดสุทธิในรายงาน = ต้นฉบับ ± adjustment (กำหนดตัวเลขใน step sheet R8: แนะนำ decrease C1 10000 → F2 CO1 = 363000) |
- margin ปัด 2 ตำแหน่ง: 170500/373000 = 45.7105% · 12500/700000 = 1.7857% · 183000/1073000 = **17.05499%** (ปัดเป็น 17.05 — ชิดขอบ .055: ถ้าเห็น 17.06 = ปัดผิด) · 133000/373000 = 35.6568% · 50000/700000 = 7.1429%

### หนี้ #3 — reproduce จงใจ 1 จุด (R6)
uat.sup.in (ไม่มี payee/Tax Profile) ยื่น **Manual Claim** 50000 (฿500) "ค่าทางด่วนตามงาน UAT" → payee อัตโนมัติไม่มี tax profile + ไม่มี compPlanId ⇒ คาด **500** ที่คิวอนุมัติค่าตอบแทน (ทั้งหน้า) — จดเป็น known, แล้ว**ลบ/ปัดรายการนั้นหรือ restore snapshot** ก่อนสร้างรอบจ่าย (ไม่งั้น IN-1/IN-2 สร้างไม่ได้ทั้งรอบ) · หมายเหตุ: คำขอเบิกส่วนเกินของเงินทดรอง (Q3) snapshot แผนทีมเป็น fallback จึงไม่ชนหนี้ #3

---

## ⚠️ โค้ดไม่ตรง spec ที่ยังเปิด (golden ใช้ค่าโค้ด)
- **S4** AR = total − (received + wht ลูกค้าหัก) (`lib/finance/ar-calc.ts`) vs `22` §6.11 = total − received (โค้ดตาม A1 — `22` ยังไม่อัปเดต · BUG-012 doc fix)
- **S8 (ใหม่)** ใบเสร็จค่าที่พัก (`POST /api/field/expenses/hotel`) ไม่ผ่าน server-verify ของ Q13 (ไม่ตรวจ path/มีจริง/ชนิดไฟล์) และไม่ตรวจเพดาน hotelMax ของแผน — ต่างจากหลักฐานปิดงาน/เอกสารเคส
- ~~S1 คอมมิชชัน~~ (Q2) · ~~S2/S3 เงินทดรอง~~ (Q3) · ~~S5 DAILY_FLAT~~ (Q4) · ~~S6 WHT ต่อรายการ~~ (Q5) · ~~S7 ฟอร์มบริษัท~~ (BUG-001) — ปิดแล้ว

## ❓ ต้องตัดสินใจ (ไม่บล็อก UAT)
- **D2** กิ่ง "สำเร็จแต่ไม่มี expense" (DEC-006/D6 — revenue เกิดทันทีตอน lot confirmed) **ทำไม่ได้ด้วยชุดนี้** (commission เกิดตอนปิดงาน + แถวรายวันจาก job เสมอ) · ยึดทาง ก) R5 ตรวจว่ายังไม่มี revenue แล้วเกิดใน R6
- **D5** ประมาณการรายได้ CO2 (include_vat) แสดง 749000 (รวม VAT) ขณะ revenue gross = 700000 — รายงานควรเทียบด้วยฐานไหน
- **D8 (ใหม่ — ADV-OVER)** เล่น ADV4 (out1 ฿1,000 ใช้ ฿1,300 → คำขอส่วนเกิน ฿300 → OUT-2) ใน R6 (แนะนำ — ทดสอบ Q3 + Q5 "ต่ำกว่าเกณฑ์ทั้งรอบ" ได้ในตัว) **หรือ** ตีกลับ ADV4 แล้วใช้ค่า "(ไม่มี ADV4)"
- **D9 (ใหม่)** คำถามนักบัญชี 3 ข้อใน PO-DECISIONS (เกณฑ์ต่อ payee ต่อรอบ / 50 ทวิ ต่อรายการ 15 ใบ / WHT ของคำขอส่วนเกิน) — golden ยึดโค้ดปัจจุบัน

## สมมติฐาน
R4 วันเดียว (เช็คอินทุกครั้ง 04/10/2569 · 1 วันลงพื้นที่ต่อพนักงาน) · settle 04/10 ด้วย dev trigger ท้าย R4a ก่อนมีเช็คอินอื่น · hotel 1 ใบ (in1 ฿600) · C7 ค้าง active ไม่เข้าเงิน (ไม่เคยเช็คอิน) · C6 ค้าง pending_review · F1 ต้นทุนนับเฉพาะ expense approved ที่ผูกเคส (รวมแถวรายวัน) · R6 อนุมัติครบทุกใบของ payee ก่อนสร้างรอบ · ADV3 overdue ใน R7 · jobs ที่สั่งได้ผ่าน dev trigger (Superadmin `admin` เท่านั้น — `manage_jobs`): reassign_timeout, advance_overdue, wht_summary, export_pack, bank_file, **daily_field_allowance**
