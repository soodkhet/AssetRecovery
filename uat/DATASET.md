# uat/DATASET.md — ข้อมูลทดสอบ UAT + ค่าคาดหวัง (golden values) · **v1**

> Source of truth ของข้อมูล UAT R1–R9 · เงิน = satang INTEGER (แสดงคู่บาท) · วันที่บนจอ = พ.ศ. `DD/MM/YYYY`
> **หลักค่าคาดหวัง (มติ orchestrator)**: ยึด **พฤติกรรมโค้ดปัจจุบัน** เป็นค่าหลัก — ค่าตาม spec ที่ต่างไว้ในคอลัมน์ "ตาม spec" และหัวข้อ ⚠️ (ไม่บล็อก UAT)
> ปัดเศษ: `pctOfSatang(b,p) = round(round(b×p×100)/10000)` · VAT include = `round(a×r/(100+r))` · ตัวเลขทุกตัวเลือกให้**ไม่มีเศษ .5** จึงไม่ขึ้นกับวิธีปัด
> ค่า seed จริง (query 03/10/2569): `vat_rate_history` 7.00% ตั้งแต่ 2025-10-01 ไม่มีวันสิ้นสุด · tax_profiles: **"Outsource Standard 3%"** (PND3) และ **"Juristic Entity 3%"** (PND53) — ทั้งคู่ before_vat, threshold 100000 (฿1,000) · งวด ตุลาคม 2569 = collecting · approval_matrices / assignment_policy_settings / bank_accounts / finance_companies = ว่าง
> **สมมติฐานเวลา**: ทั้ง R4 ทำเสร็จใน**วันเดียว** ⇒ ทุกเคสมีวัน check-in = 1 วัน (ถ้าข้ามวัน allowance = 15000 × จำนวนวันจริง — ให้คำนวณใหม่)

---

## M1 บริษัทไฟแนนซ์ (⏳ รอ Q1 — ฟอร์ม/Zod ยังไม่มี `vat_mode` และ `wht_withheld_by_customer_pct`; DB default wht = 3.00 ⇒ ถ้าไม่เติมฟอร์ม CO2 จะถูกหัก 3% ผิดแผน)
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
| M5.PLAN_OUT | UAT Outsource เหมา | DAILY_FLAT | **550000 (฿5,500)** ("เหมาต่อเคส") | 0 | 100000 (฿1,000) | 0 | 0 | true | **5.00** (≠ payee 3% โดยตั้งใจ) |
- ไม่ใช้ PER_KM (พึ่ง Google Distance Matrix ภายนอก) · ทั้งสองแผนมี whtPct ⇒ ไม่ชนหนี้ #3 โดยไม่ตั้งใจ
- PLAN_OUT fuel ฿5,500 > เพดาน ฿5,000 ⇒ รายการ fuel ของ C5 ต้องผ่าน**บริหาร** (คอมมิชชันไม่ถูกสร้างเป็น expense — ดู S1)

## M6 Payee + Tax Profile (payee-level) + บัญชีธนาคาร (เลขสมมติ)
| payee | payeeType | taxProfileId | nationalId | bankName | accountName | accountNumber | verified |
|---|---|---|---|---|---|---|---|
| uat.agent.in1 | individual | Outsource Standard 3% | 1103700000011 | กสิกรไทย | อนันต์ ตามทรัพย์ | 1234567810 | ✅ R1 |
| uat.agent.in2 | individual | Outsource Standard 3% | 1103700000020 | กรุงเทพ | บุญมี ภาคสนาม | 2345678921 | ❌ **ไม่ verify ใน R1** (ต้องถูกกันออกจาก IN-1) → verify ใน R6 ก่อน IN-2 |
| uat.agent.out1 | individual | Outsource Standard 3% (**Payee 3% ชนะ Plan 5%**) | 1103700000038 | ไทยพาณิชย์ | ประเสริฐ รับเหมา | 3456789032 | ✅ R1 |
ไม่มีการสร้าง Tax Profile ใหม่ (ใช้ของ seed)

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

## ภาคสนาม (R4) — ปิดงานต้องมี check-in ≥1 (GPS), รูป ≥1, วิดีโอ ≥1, รูปสินค้า ≥1 (เฉพาะ success)
| เคส | ผู้รับ | ผล | วัน check-in | ค่าที่พัก (hotelClaim) | หมายเหตุ |
|---|---|---|---|---|---|
| C1 | in1 | closed_success | 1 | ไม่ยื่น | |
| C2 | in1 | closed_success | 1 | ไม่ยื่น | "ไม่เบิกเพิ่ม" — fuel+allowance ยังเกิดอัตโนมัติ (ดู D2) |
| C3 | in2 | closed_fail | 1 | ไม่ยื่น | ไม่ผ่านคลัง |
| C4 | in2 | closed_success → approver `reject_evidence` ("รูปสินค้าไม่เห็น IMEI") → แก้รูป**โดยไม่เพิ่ม check-in** → resubmit_close | 1 | ไม่ยื่น | ใบเดิม 2 ใบ (fuel, allowance) = `superseded` + ใบใหม่ 2 ใบ |
| C5 | out1 | closed_success | 1 | ไม่ยื่น | fuel ฿5,500 → บริหาร |
ไม่มีการยื่นค่าที่พักในชุดหลัก (เลี่ยงหนี้ #3 — hotelClaim ไม่มี compPlanId)

## R5 คลัง — IMEI probe (imeiActual `/^\d{15}$/`)
| probe | ค่า | คาด |
|---|---|---|
| ตรงสัญญา | ตาม IMEI เคส | รับเข้า in_custody ไม่มีเตือน |
| 14 หลัก | 35678910000001 | ถูกปัด (validation 400) |
| มีขีด | 356789-100000011 | ถูกปัด (validation 400) |
| 15 หลักไม่ตรง (ใช้กับ C1 แล้วแก้กลับ หรือทดลองก่อนยืนยัน) | 356789100000999 | เตือน `IMEI_MISMATCH` ไม่บล็อก |
ล็อต: LOT CO1 = {C1, C2, C4} · LOT CO2 = {C5} · ยัด C5 เข้าล็อต CO1 ต้องถูกปัด · C3 ต้องไม่อยู่ในคลัง · หลัง confirm: **ยังไม่มี revenue แม้แต่แถวเดียว** (ทุกเคสมี expense ที่ยังไม่ approved — ดู D2) และ expense เปลี่ยน pending_warehouse_confirm → pending_approval

## เงินทดรอง
| คีย์ | ผู้ขอ | ขอ | due_clear_date | เส้นทาง | คาด |
|---|---|---|---|---|---|
| ADV1 | in1 | 300000 (฿3,000) | วันนี้+7 | อนุมัติเต็ม (approved 300000) → **เข้า IN-1** → เคลียร์ used 245000 | return = 300000 − 245000 = **55000 (฿550.00)** (โค้ด: approved − used) |
| ADV2 | in1 | 100000 | วันนี้+7 | ขอขณะ ADV1 approved | ถูกปัด (ใบซ้อน approved/overdue) · ถ้า ADV1 ยัง pending ไม่บล็อก |
| ADV3 | in2 | 200000 (฿2,000) | **เมื่อวาน** | อนุมัติเต็ม → `advance_overdue` job → `overdue` · รันซ้ำไม่เปลี่ยน/ไม่แจ้งซ้ำ · เข้า IN-2 (หลัง verify in2) | ค้างใน F5 |
| ADV-MAX | out1 | 600000 | วันนี้+7 | — | `ADVANCE_EXCEEDS_MAX` (เพดาน M8 500000) |
| ADV-OVER | (ทดลองตอนเคลียร์ ADV1 ก่อนกดจริง) used 310000 | | | | `USED_EXCEEDS_REQUEST_NO_TOPUP` (โค้ดบล็อก — ดู ⚠️ S3) |
ลำดับ R6 สำคัญ: อนุมัติ ADV1 → **สร้าง IN-1 ก่อนเคลียร์ ADV1** (ใบ cleared ไม่เข้ารอบ)

---

## E — ค่าคาดหวัง (golden)

### E1 ประมาณการรายได้ ตอนส่งเคส (`38` §6.5)
| C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 |
|---|---|---|---|---|---|---|---|
| 92500 (฿925) = 1850000×5% | 124500 | 749000 (FLAT=base) | 156000 | 749000 | 100000 | 749000 | 80000 |
CO2 = ราคารวม VAT (base) — ดู D5

### E2 Service fee snapshot (ตอน **approved** ไม่ใช่ตอนสร้าง — `92` §7.1)
ก่อน approved = NULL ทุกช่อง · CO1 เคส: SUCCESS_FEE / base 0 / rate 5.00 / basis debt_amount / charge_on_fail false · CO2 เคส: FLAT / base 749000 / rate 0 / basis null / charge_on_fail false · C6/C8 ไม่มี snapshot

### E3 ค่าใช้จ่ายต่อเคส (`22` §6.2–6.4) — 1 วัน check-in
| เคส/ผู้รับ | fuel §6.2 | allowance §6.3 | commission/no_success §6.4 | **รวม (โค้ด)** | รวม (ตาม spec) | สายอนุมัติ |
|---|---|---|---|---|---|---|
| C1/in1 | 20000 | 15000 | (spec 50000 — โค้ดไม่สร้าง S1) | **35000 (฿350)** | 85000 | แถว 1 |
| C2/in1 | 20000 | 15000 | (spec 50000) | **35000** | 85000 | แถว 1 |
| C3/in2 | 20000 | 15000 | (spec no_success 20000) | **35000** | 55000 | แถว 1 |
| C4/in2 ใบใหม่ | 20000 | 15000 | (spec 50000) | **35000** (+ใบเดิม 35000 = superseded ไม่นับ) | 85000 | แถว 1 |
| C5/out1 | **550000** | 0 (ไม่มีแถว) | (spec 100000) | **550000 (฿5,500)** | 650000 | **แถว 2 → บริหาร** |
| รวม | 630000 | 60000 | (spec 270000) | **690000** | 960000 | |
ตีกลับทดสอบ: การเงินตีกลับ allowance ของ C3 ที่ขั้น 2 → `needs_revision`, approval_step_current = 1 → resubmit → ผ่านใหม่ทั้ง 2 ขั้น (ยอดไม่เปลี่ยน)

### E4 Revenue (`22` §6.5/6.6/6.8, VAT 7.00 จาก vat_rate_history, revenue_date = วันที่ closedAt เวลาไทย)
| เคส | gross (ก่อน VAT) | VAT | total | fee_model_snapshot | เกิดเมื่อ |
|---|---|---|---|---|---|
| C1 | 92500 (฿925.00) | 6475 (฿64.75) = 92500×7% | 98975 (฿989.75) | SUCCESS_FEE | R6 expense ใบสุดท้าย approved (lot confirmed แล้ว) |
| C2 | 124500 (฿1,245.00) | 8715 | 133215 (฿1,332.15) | SUCCESS_FEE | R6 (เหมือน C1 — ไม่ใช่ R5, ดู D2) |
| C3 | — ไม่มีแถว | | | | fail + charge_on_fail=false |
| C4 | 156000 (฿1,560.00) | 10920 | 166920 (฿1,669.20) | SUCCESS_FEE | R6 หลังใบ**ใหม่** approved |
| C5 | 700000 (฿7,000.00) | 49000 = 749000×7/107 | 749000 (฿7,490.00) | FLAT | R6 หลังบริหารอนุมัติ |
| C6/C7/C8 | — | | | | |
| **รวม** | **1073000** | **75110** | **1148110** | | 1 แถวต่อเคส (idempotent) |

### E5 WHT ต่อรายการ (`22` §6.9 — ฐาน before_vat, threshold ของ profile 100000, **Payee ชนะ Plan**, คิด**ต่อรายการ**)
| ผู้รับ | รายการ | gross | อัตราที่ใช้ | WHT (โค้ด) | ถ้าผิด (ใช้ plan) |
|---|---|---|---|---|---|
| in1 | C1/C2 fuel 20000, allowance 15000 ×2 | 70000 | 3% payee | 0 ทุกใบ (< 100000) | 0 |
| in2 | C3/C4 fuel, allowance | 70000 | 3% payee | 0 | 0 |
| out1 | C5 fuel | 550000 | **3% payee** | **16500 (฿165.00)** | 27500 (5% = บั๊ก) |
| advance | ADV1/ADV3 | — | — | 0 (advance ไม่หัก) | |
ตาม spec ที่ต่าง: ถ้ามีคอมมิชชัน out1 commission 100000×3% = 3000 → out1 รวม 19500 · ถ้า threshold รวมต่อ payee (D4) in1 = 70000 ยังต่ำกว่าเกณฑ์ → 0 เหมือนเดิม; out1 = 16500 เท่าเดิม (ชุดนี้ไม่ไวต่อ D4)

### E6 รอบจ่าย (`22` §6.10)
| รอบ | รายการ | gross | WHT | **net** | สถานะเป้าหมาย |
|---|---|---|---|---|---|
| IN-1 (in2 unverified ถูกกัน) | C1 35000 + C2 35000 + ADV1 300000 | 370000 | 0 | **370000 (฿3,700.00)** | `file_generated` — **ห้ามกด completed ก่อน R7** (auto-match เงินออกจับเฉพาะ file_generated) |
| IN-2 (หลัง verify in2) | C3 35000 + C4 35000 + ADV3 200000 | 270000 | 0 | **270000 (฿2,700.00)** | completed (manual) |
| OUT-1 | C5 fuel 550000 | 550000 | 16500 | **533500 (฿5,335.00)** | completed (manual) |
สร้างไฟล์โอนซ้ำ → `DUPLICATE_PAYMENT_FILE` เตือน + ได้ไฟล์เดิม · idempotency_key กันโอนซ้ำ

### E7 Billing / รับเงิน / AR (`22` §6.8, §6.11 + A1)
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
| 3 จ่าย IN-1 | −3,700.00 | auto_matched payout IN-1 (file_generated) |
| 4 ไม่ทราบที่มา | +123.45 | unmatched → manual / unmatched_resolved |
นำเข้าไฟล์เดิมซ้ำ → **imported = 0, duplicates = 4** (กันซ้ำรายแถวด้วย วันที่\|ยอด\|description — statement ไม่มี DUPLICATE_PAYMENT_FILE)

### E9 เอกสารภาษี (R7)
- ใบกำกับภาษี 2 ใบ (ตามบันทึกขายต่อ billing): CO1 373000 / 26110 / 399110 · CO2 700000 / 49000 / 749000 · เลขต่อเนื่องไม่กระโดด, ดับเบิลคลิกได้ใบเดียว
- 50 ทวิ จากรอบจ่าย: **ใบเดียวที่มี WHT > 0 = out1 16500** (ฐาน 550000, PND3) · ออกซ้ำไม่ได้ · ยกเลิกใบ (reason) แล้วออกใหม่ → ยอดนับครั้งเดียว (ถ้าออกใหม่ไม่ได้ → ยอด 0 ดู D7)
- ภ.ง.ด.3 ต.ค. 2569 = 16500 · ภ.ง.ด.53 = 0

### E10 Golden ของรายงาน R9 (ช่วง ต.ค. 2569, หลัง R7 ก่อน Adjustment R8)
| รหัส | สิ่งที่ต้องเห็น |
|---|---|
| **F1** กำไรขั้นต้น (ไม่รวม VAT, ต้นทุน = fuel+allowance+commission+no_success ที่ approved; C4 ใบเดิม superseded ไม่นับ) | ราย**บริษัท**: CO1 rev 373000 / cost 105000 / GP **268000** / **71.85%** · CO2 700000 / 585000 / **115000** / **16.43%** · รวม 1073000 / 690000 / **383000** / **35.69%** · ราย**ทีม**: A 373000 / 140000 / 233000 / 62.47% · C 700000 / 550000 / 150000 / 21.43% · B: ไม่มีแถว หรือ margin **N/A** · (ตาม spec: CO1 GP 118000/31.64%, CO2 −5000/−0.71%, รวม 113000/10.53%) |
| **F2** สรุปรายได้ (ก่อน VAT) | CO1 373000, 3 เคส, ต่อเคส round(373000/3)=124333 · CO2 700000, 1 เคส · รวม 1073000, 4 เคส, ต่อเคส 268250 · % สำเร็จ (ปิดแล้ว): CO1 100% (3/3), CO2 50% (1/2) |
| **F3** อายุหนี้ | หลัง R7: ค้าง 0 ทุกช่วง · snapshot ระหว่าง R6→R7: 1148110 ช่วงแรก (CO1 399110, CO2 749000) |
| **F4** ค่าตอบแทน (ไม่รวม advance) | in1 gross 70000 (fuel 40000, allowance 30000) WHT 0 net 70000 · in2 70000 / 0 / 70000 · out1 550000 / 16500 / 533500 · รวม 690000 / 16500 / **673500** |
| **F5** เงินทดรองค้างเคลียร์ | 1 แถว: in2 ADV3 200000 `overdue` · ADV1 cleared ไม่โผล่ · ADV2/ADV-MAX ไม่โผล่ |
| **O1** อัตราความสำเร็จ (success/(success+fail)) | รวม 4/5 = **80%** · ทีม A 3/4 = 75% · ทีม C 1/1 = 100% · CO1 100% · CO2 50% |
| **O3** ปริมาณงานรายพนักงาน (สำเร็จ/ที่ได้รับ) | in1: C1, C2, C7(ค้าง) → 2/3 = **66.67%** · in2: C3, C4 → 1/2 = 50% (C7 reassigned_away ไม่นับ — ดู D6) · out1 1/1 = 100% |
| **O5** คลัง | คงเหลือ ณ ปัจจุบัน: รอรับเข้า 0 / ในคลัง 0 / รอส่งมอบ 0 · ส่งมอบแล้วในช่วง 4 ชิ้น (C1, C2, C4, C5) ใน 2 ล็อต confirmed · C3 ไม่มี |
| **A1** WHT รายเดือน | ต.ค. 2569: PND3 **16500**, PND53 0, รวม 16500 (ใบ cancelled ไม่นับ) |
| **A2** ใบกำกับภาษี | 2 ใบ active: ก่อน VAT 1073000 / VAT 75110 / รวม 1148110 |
| **E2** scorecard บริษัท | CO1: rev 373000, GP 268000, 71.85%, สำเร็จ 100%, AR 0 · CO2: rev 700000, GP 115000, 16.43%, สำเร็จ 50%, AR 0 |
| E1/E3/O2/O4/A3/A4 | ไม่กำหนดตัวเลข (ขึ้นกับเวลา/SLA/จำนวน export) · ตรวจเชิงคุณภาพ: การเงินเรียก E1 → 403 · A3 มี version 1,2 SHA-256 ต่างกัน |
| R8 หลัง Adjustment | ต้นฉบับ revenue ไม่เปลี่ยน · ยอดสุทธิในรายงาน = ต้นฉบับ ± adjustment (กำหนดตัวเลขใน step sheet R8: แนะนำ decrease C1 10000 → F2 CO1 = 363000) |

### หนี้ #3 — reproduce จงใจ 1 จุด (R6)
uat.sup.in (ไม่มี payee/Tax Profile) ยื่น **Manual Claim** 50000 (฿500) "ค่าทางด่วนตามงาน UAT" → payee อัตโนมัติไม่มี tax profile + ไม่มี compPlanId ⇒ คาด **500** ที่คิวอนุมัติค่าตอบแทน (ทั้งหน้า) — จดเป็น known, แล้ว**ลบ/ปัดรายการนั้นหรือ restore snapshot** ก่อนสร้างรอบจ่าย (ไม่งั้น IN-1/IN-2 สร้างไม่ได้ทั้งรอบ)

---

## ⚠️ โค้ดไม่ตรง spec (golden ใช้ค่าโค้ด · ค่า spec อยู่ในคอลัมน์ "ตาม spec")
- **S1 (สงสัยบั๊ก)** ค่าคอมมิชชัน / no_success_fee **ไม่ถูกสร้างเป็น expense** ตอนปิดงาน — `commissionSatang()` (`lib/finance/compensation-calc.ts`) ไม่มีที่เรียกนอกเทสต์ ⇒ ขัด `22` §6.4 · ผลต่อ golden: ต้นทุน 690000 (โค้ด) vs 960000 (spec), WHT out1 16500 vs 19500
- **S2** เงินคืน advance = **approved − used** (`lib/finance/advance-calc.ts`) vs `22` §6.13/`15` = requested − used (ADV1 อนุมัติเต็มจึงไม่ต่าง)
- **S3** used > requested → โยน `USED_EXCEEDS_REQUEST_NO_TOPUP` (บล็อก) vs `22` §6.13 ให้ return = 0 แล้วเบิกเพิ่มแยก (`15` เรียกว่า "เตือน")
- **S4** AR = total − (received + wht ลูกค้าหัก) (`lib/finance/ar-calc.ts`) vs `22` §6.11 = total − received (โค้ดตาม A1 — `22` ยังไม่อัปเดต)
- **S5** DAILY_FLAT จ่ายครั้งเดียวต่อเคส (ตรง `22` §6.2) แต่ `11` §81 นิยามหน่วย "บาท/วัน"
- **S6** WHT threshold คิด**ต่อรายการ** — `13` §121 พูดถึง "ยอดจ่าย" ไม่ระบุว่าต่อรายการหรือต่อการจ่าย
- **S7** ฟอร์มบริษัทไม่มี `vat_mode` / `wht_withheld_by_customer_pct` (DB default wht 3.00) ⇒ ตั้ง CO2 = NULL / include_vat ผ่าน UI ไม่ได้ (Q1)

## ❓ ต้องตัดสินใจ (ไม่บล็อก UAT — PO ตัดสินทีหลัง)
- **Q1** เติม `vat_mode` + `wht_withheld_by_customer_pct` ในฟอร์มบริษัทก่อน R1? ก) เติม (แนะนำ — ไม่งั้น A1 ทาง NULL และ include_vat ทดสอบไม่ได้) ข) ตั้งค่าตรง DB ชั่วคราว (ผิดกติกา audit) ค) ตัดกิ่ง include_vat แล้วใช้ CO2 exclude_vat (ต้องคำนวณ E4/E7 ใหม่: T2 base 700000 → VAT 49000 total 749000 — ตัวเลข total เท่าเดิม)
- **D1** DAILY_FLAT ต่อเคส หรือ × วัน (S5) — แนะนำยึด `22` (ต่อเคส) แล้วแก้ `11` ให้ตรง
- **D2** กิ่ง "สำเร็จแต่ไม่มี expense" (DEC-006/D6 — revenue เกิดทันทีตอน lot confirmed) **ทำไม่ได้ด้วยชุดนี้** เพราะ fuel/allowance เกิดอัตโนมัติเสมอ · ก) ยอมรับ: R5 ตรวจว่า C2 **ยังไม่มี** revenue (blockedBy expense_not_approved) แล้วเกิดใน R6 (แนะนำ — แก้ R5 ใน UAT_PLAN) ข) เพิ่ม `M5.PLAN_ZERO` (fuel 0, allowance 0, whtPct 3) + ทีม D + agent อีกคน ⇒ ต้องเพิ่ม persona
- **D4** threshold ต่อรายการ vs ต่อ payee/รอบ (S6) — ชุดนี้ไม่ไวต่อค่า (ผลเท่ากันทั้งสองแบบ)
- **D5** ประมาณการรายได้ CO2 (include_vat) แสดง 749000 (รวม VAT) ขณะ revenue gross = 700000 — รายงานควรเทียบด้วยฐานไหน
- **D6** O3 นับเคสที่ถูก reassign ออก (reassigned_away) เป็นงานของคนเดิมหรือไม่ — golden ข้างบนสมมติ "ไม่นับ"
- **D7** ยกเลิก 50 ทวิ แล้วออกใหม่ได้หรือไม่ (ถ้าไม่ได้ A1 = 0 หลังยกเลิก) · ADV3 ตั้ง due_clear_date ย้อนหลังได้ไหม (schema ไม่ห้าม) — ถ้าไม่ได้ต้องรอข้ามวันก่อนรัน `advance_overdue`
- **S1** ต้องแก้โค้ดให้สร้าง commission/no_success_fee expense หรือแก้ spec — กระทบเงินจริง ⇒ PO + นักบัญชี

## สมมติฐาน
R4 วันเดียว (1 วัน check-in/เคส) · ไม่มี hotel claim · C7 ค้าง active ไม่เข้าเงิน · C6 ค้าง pending_review · F1 ต้นทุนนับเฉพาะ expense approved · jobs ที่สั่งได้: reassign_timeout, advance_overdue, wht_summary, export_pack, bank_file
