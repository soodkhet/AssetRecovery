# 22-finance-calculation-spec.md

# 22 — Finance Calculation Spec (สูตรคำนวณรวมทั้งระบบ)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — แก้สูตร Allowance)
> Document Level: Finance Reference — เอกสารอ้างอิงเชิงเทคนิค ไม่มีหน้าจอ UI ของตัวเอง
> เอกสารอ้างอิง: สรุปรวมจากไฟล์ 11, 12, 13, 15, 17, 18, 19, 21 ที่เขียนสเปคไว้แล้ว, `02-database-schema-design.md` §7 (check_ins table)
> 🔶 ดูหมายเหตุสำคัญเรื่องการตรวจทานโดยนักบัญชีในไฟล์ 10 — ใช้กับไฟล์นี้เป็นพิเศษ เพราะรวมสูตรคำนวณเงินทั้งหมดของระบบไว้ที่เดียว

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — สูตรคำนวณ fuel/allowance/commission/VAT/WHT/GP รวม 13 สูตร |
| v2 | 03/07/2569 | **แก้ไข §6.3 (Allowance)**: เดิมเขียนว่า "ค่าคงที่ต่อเคสที่ปิดงาน" ซึ่ง**ขัดแย้ง**กับ `11-compensation.md` §10 ที่นิยามหน่วยเป็น "บาท/**วัน**" อย่างชัดเจน — ยืนยันกับ Product Owner แล้วว่า **allowance คำนวณต่อวันที่ลงพื้นที่จริง** (`rate × จำนวนวันที่มี check-in`) ไม่ใช่ค่าคงที่ต่อเคส — แก้สูตรให้ถูกต้องแล้ว + Reformat header ตามมาตรฐานเอกสารชุดใหม่ |
| v3 | 03/10/2569 | **§6.4 จุดเกิดรายการ** ตามมติ PO 03/10/2569 (UAT Q2 · BUG-010/054): ค่าคอมมิชชั่น (`closed_success`) / เบี้ยเสี่ยง (`closed_fail`) **ระบบสร้างเป็นรายการเบิก (`expenses.expense_type = commission / no_success_fee`) อัตโนมัติตอนปิดงาน** ในชุดเดียวกับ fuel/allowance — snapshot แผน (`comp_plan_id` + version) · สถานะเริ่มต้นกติกาเดียวกัน (สำเร็จ = `pending_warehouse_confirm`, ไม่สำเร็จ = `pending_approval`) · เข้าอนุมัติ/รอบจ่ายตามปกติ · resubmit สร้างชุดใหม่หลัง supersede ด้วย · ยอด 0 ไม่สร้างแถว (D10) — สูตรไม่เปลี่ยน |
| v3.1 | 03/10/2569 | **แก้ §6.2 (Fuel DAILY_FLAT)** ตามมติ PO 03/10/2569 (UAT Q4 · BUG-013): เดิมเขียนว่า "ค่าคงที่" (โค้ดตีความเป็นต่อเคส) ซึ่งขัดกับหน่วย "บาท/วัน" ของ `11` §7.1 — แก้เป็น **`daily_flat_rate × จำนวนวันที่ลงพื้นที่จริง`** นับวันแบบเดียวกับเบี้ยเลี้ยง §6.3 (COUNT DISTINCT วันปฏิทินไทยของ check-in ของเคสนั้น) |
| v3.2 | 03/10/2569 | **แก้ §6.13 ตามมติ PO 03/10/2569 (UAT Q3, BUG-011)**: (1) ฐานยอดคืนเปลี่ยนจาก requested เป็น **approved** (= เงินที่ออกจริง ตรงกับ generated column ใน `02` §5 ที่ใช้อยู่แล้ว) · (2) ใช้เกินยอด → **เคลียร์ยอดได้ ไม่บล็อก** ยอดคืน 0 และระบบ**สร้างคำขอเบิกส่วนเกินอัตโนมัติ** (Manual Claim ของ payee เดียวกัน) แทนการปฏิเสธ — `USED_EXCEEDS_REQUEST_NO_TOPUP` ถูกยกเลิกจาก `24` |
| v3.3 | 03/10/2569 | **แก้ §6.9 ตามมติ PO 03/10/2569 (UAT Q5, BUG-014)**: เกณฑ์ขั้นต่ำ WHT (ค่าเริ่มต้น ฿1,000) เทียบกับ **ฐานรวมของ payee ต่อรอบจ่าย** (เดิมโค้ดเทียบต่อรายการ) แล้วกระจายภาษีกลับลงรายการแบบ largest remainder ให้ `net = gross − wht` ทุกแถวและผลรวมตรงไม่มีเศษหาย · 🔶 นักบัญชียืนยันก่อน go-live |
| v3.6 | 05/10/2569 | **มติ PO 05/10/2569 (U16)** — §6.9.1 เพิ่มค่าตั้ง "40(2) อัตรา 0%: ออก 50 ทวิ + รวมใน ภ.ง.ด.1" (ค่าเริ่มต้น = ออก · effective-dated + snapshot ลงรอบจ่าย) — **สูตรภาษีไม่เปลี่ยน** (ภาษี = 0 ตามเดิม) เปลี่ยนเฉพาะเงื่อนไขการออกใบ · 40(8) ต่ำกว่าเกณฑ์ ฿1,000 ไม่เกี่ยว |
| v3.5 | 05/10/2569 | **แก้ §6.9 ตามมติ PO 05/10/2569 (UAT U3–U8)** — ค่าตั้งภาษีหัก ณ ที่จ่าย (effective-dated + snapshot ลงรอบจ่าย): (1) **ฐาน WHT เลือกชนิดรายการได้** — ค่าเริ่มต้น คอมมิชชัน/เบี้ยเสี่ยง/น้ำมัน/เบี้ยเลี้ยง = รวม · ค่าที่พัก/เบิกตามใบเสร็จ/รายการกรอกเอง = ไม่รวม (จ่ายเต็ม ไม่นับเกณฑ์) — A1: in1 ฐาน ฿1,950 → ฐาน WHT ฿1,350 → หัก ฿40.50 (เดิม ฿58.50) (2) **ประเภทเงินได้** 40(8) ทั้งหมด (ค่าเริ่มต้น) / 40(2) ทั้งหมด / แยกตามประเภททีม (inhouse = 40(2)) — **40(2) ใช้อัตราต่อคน** `payee_profiles.wht_40_2_pct` ไม่มีเกณฑ์ ฿1,000 ไม่คำนวณอัตราก้าวหน้า (Hybrid Boundary) |
| v3.7 | 05/10/2569 | **มติ PO 05/10/2569 (U14 — บันทึกใบลดหนี้ที่สำนักงานบัญชีออก)**: เพิ่ม §6.8.1 VAT ของใบลดหนี้ = มูลค่าที่ลด × `credit_notes.vat_rate_pct_used` (snapshot อัตราของใบกำกับเดิม) (ปัดครึ่งขึ้นครั้งเดียว) · รับยอดตามเอกสารที่ต่างไม่เกิน 1 สตางค์ · ยอดรวมคิดที่ server · ห้ามเกินยอดคงเหลือของใบกำกับ |
| v3.8 | 05/10/2569 | **มติ PO 05/10/2569 (U19/U21)**: §6.8.1 ครอบคลุม**ใบเพิ่มหนี้** — VAT สูตรเดียวกัน (อัตราใบกำกับเดิม ± 1 สตางค์) · ใบเพิ่มหนี้ไม่มีเพดาน · ยอดคงเหลือที่ลดหนี้ได้ = ใบกำกับ − ใบลดหนี้ active (ไม่นับใบเพิ่มหนี้) · ยอดตามเอกสาร = ใบกำกับ − ใบลดหนี้ + ใบเพิ่มหนี้ · หลายอัตรา VAT คงปฏิเสธ (ข้อความชัด) |
| v3.4 | 03/10/2569 | **แก้ §6.2/§6.3 ตามมติ PO 03/10/2569 (UAT Q21 · DEC-012)** — แทนการคิดต่อเคสของ v3.1/Q4: ค่าน้ำมัน `DAILY_FLAT` และเบี้ยเลี้ยง (ทุกโหมดน้ำมัน) = **วันละ 1 ครั้งต่อพนักงานต่อวันปฏิทินไทย** ที่มีเช็คอินอย่างน้อย 1 เคส (ไปกี่เคสก็ได้ก้อนเดียว) · อัตราจากแผน (เวอร์ชัน) ของทีม ณ วันนั้น · **กระจายเท่ากันทุกเคสที่เช็คอินวันนั้น** `floor(D/N)` เศษสตางค์ลงเคสที่เช็คอินแรกสุดของวัน (ผลรวมต่อวัน = D เป๊ะ) · สร้างหลังจบวันโดย job `daily_field_allowance` (`91` §6.1) · `PER_KM` ยังคิดต่อเคสตามระยะทาง (§6.1) |

ขอบเขตเอกสารนี้: รวมสูตรคำนวณทางการเงิน/บัญชีทั้งหมดของระบบไว้ในที่เดียว เป็น single source of truth สำหรับทีมพัฒนา — ป้องกันสูตรไม่ตรงกันระหว่างโมดูล

**ไม่รวมอยู่ในไฟล์นี้**: State machine ของแต่ละ entity (ดู `23-finance-state-machines.md`), Validation rules ที่ไม่ใช่สูตรคำนวณ (ดู `24-finance-validation-rules.md`)

---

## 1. Summary

รวมสูตรคำนวณทางการเงิน/บัญชีทั้งหมดของระบบไว้ในที่เดียว เป็น single source of truth สำหรับทีมพัฒนา — ป้องกันสูตรไม่ตรงกันระหว่างโมดูล

## 2. Purpose

เมื่อ implement จริง นักพัฒนาควรอ้างอิงไฟล์นี้สำหรับ logic การคำนวณ แทนการไปเดาเองจากแต่ละหน้าจอ

## 3. In Scope

สูตรคำนวณทั้งหมดที่เกี่ยวกับ: ค่าตอบแทนทีมงาน (ไฟล์ 11), รายได้จากบริษัทไฟแนนซ์ (ไฟล์ 12/19), ภาษีหัก ณ ที่จ่ายและ VAT (ไฟล์ 13), ยอดจ่ายสุทธิ (ไฟล์ 17), กำไรขั้นต้น (ไฟล์ 21)

## 4. Out of Scope

- State machine ของแต่ละ entity (ไฟล์ 23)
- Validation rules ที่ไม่ใช่สูตรคำนวณ (ไฟล์ 24)

## 5. Actors & Responsibilities

ไม่มี — เอกสารนี้เป็น technical reference ล้วน ไม่มีผู้ใช้งานโต้ตอบโดยตรง (ดูไฟล์ต้นทางแต่ละสูตรสำหรับ actor ที่เกี่ยวข้อง)

## 6. สูตรคำนวณทั้งหมด

### 6.1 ค่าน้ำมัน (Fuel) — โหมด PER_KM (อ้างอิงไฟล์ 11, 41 §6.4.2)

```
ระยะทางจริง = คำนวณจาก travel_origin → checkin[1] → checkin[2] → ... → checkin[n]
              ผ่าน Google Maps Distance Matrix API (สะสมตามลำดับเวลาจริง)

ยอดดิบ = ระยะทางจริง (กม.) × rate_per_km

ยอดจ่ายจริง = MIN(ยอดดิบ, max_per_case)   ถ้าตั้งค่า max_per_case ไว้
            = ยอดดิบ                        ถ้าไม่ได้ตั้งค่าเพดาน
```

### 6.2 ค่าน้ำมัน (Fuel) — โหมด DAILY_FLAT (อ้างอิงไฟล์ 11) — แก้ไขแล้ว (ดู Changelog v3.4)

```
หน่วยคิดเงิน = (พนักงาน, วันปฏิทินไทย) ที่พนักงานมี check_in อย่างน้อย 1 เคส
D_fuel        = daily_flat_rate (บาท/วัน) ของแผน (เวอร์ชัน) ที่ทีมผูก ณ วันนั้น      — 1 ครั้งต่อพนักงานต่อวัน ไม่คำนวณระยะทาง

กระจายลงเคส  : N = จำนวนเคส (distinct) ที่พนักงานเช็คอินในวันนั้น
               ส่วนแบ่งต่อเคส = floor(D_fuel / N)
               เศษ = D_fuel − floor(D_fuel / N) × N  → บวกให้เคสที่เช็คอินแรกสุดของวัน
               ⇒ ผลรวมทุกเคสของวันนั้น = D_fuel เป๊ะ · ส่วนแบ่ง 0 ไม่สร้าง record (D10)
```

> มติ PO 03/10/2569 (UAT Q21 — แทน Q4): "เหมาจ่ายก็คือเหมาจ่าย" ไปกี่เคสในวันเดียวก็ได้ก้อนเดียว (ต้องการตามจริงให้ทีมใช้โหมด `PER_KM`) · ส่วนแบ่งต่อเคสใช้คิดกำไรต่อเคส/ต่อบริษัท (§6.12) · สร้างเป็น expense ต่อเคสหลังจบวันโดย job `daily_field_allowance` · implement: `fieldDayTotalsSatang()` / `splitDailyAmountSatang()` / `planFieldDayExpenses()` ใน `lib/field/expense-calc.ts`

### 6.3 เบี้ยเลี้ยง (Allowance) — แก้ไขแล้ว (ดู Changelog v2, v3.4)

```
หน่วยคิดเงิน   = (พนักงาน, วันปฏิทินไทย) ที่มี check_in อย่างน้อย 1 เคส (ทุกโหมดน้ำมัน)
D_allowance    = allowance_rate (บาท/วัน) ของแผน (เวอร์ชัน) ที่ทีมผูก ณ วันนั้น       — 1 ครั้งต่อพนักงานต่อวัน
กระจายลงเคส   = แบบเดียวกับ §6.2 ทุกประการ (floor(D/N) · เศษลงเคสที่เช็คอินแรกสุดของวัน · ผลรวม = D เป๊ะ)
```

> ยืนยันกับ Product Owner แล้ว (03/07/2569): allowance คำนวณ**ต่อวัน** ไม่ใช่ค่าคงที่ต่อเคส — ตรงกับหน่วย "บาท/วัน" ที่นิยามไว้ใน `11-compensation.md` §10
> มติ PO 03/10/2569 (UAT Q21): "ต่อวัน" = ต่อ**พนักงาน**ต่อวัน ไม่ใช่ต่อเคสต่อวัน — 2 เคสวันเดียวได้เบี้ยเลี้ยงวันเดียว แล้วเฉลี่ยลง 2 เคส
>
> **Golden**: พนักงาน in1 ไป C1 + C2 วันเดียวกัน · แผน fuel เหมา ฿200/วัน + เบี้ยเลี้ยง ฿150/วัน ⇒ D_fuel = 20,000 สต. · D_allowance = 15,000 สต. ⇒ C1: fuel 10,000 + allowance 7,500 · C2: fuel 10,000 + allowance 7,500 (รวมวันนั้น 35,000 สต. = ฿350) · ถ้า 3 เคส: allowance 5,000/5,000/5,000 · fuel 6,668/6,666/6,666

### 6.4 Commission / No-Success Fee (อ้างอิงไฟล์ 11)

```
ถ้า outcome = closed_success: ยอดจ่ายจริง = commission_amount (ค่าตายตัวต่อเคส ไม่ใช่ % ของมูลหนี้)
ถ้า outcome = closed_fail:    ยอดจ่ายจริง = no_success_fee_amount (เบี้ยเสี่ยง — exclusive กับ commission)
หมายเหตุ: ไม่มีการหารเฉลี่ยตามจำนวนเคสต่อวัน (กฎหาร 4 ถูกยกเลิกแล้ว)
```

> **จุดเกิดรายการ (v3 — มติ PO 03/10/2569 UAT Q2)**: ยอดนี้ถูกบันทึกเป็นรายการเบิก `expense_type = commission` หรือ `no_success_fee` ที่ระบบสร้างเองตอน `submit_close_case` / `resubmit_close_case` (`41` §6.6) พร้อม snapshot แผน — หน้า "รายได้" ของพนักงาน รายงาน F4 และต้นทุนตรง §6.12 อ่านจากรายการเบิกนี้ **ไม่อ่านจากแผนตรง** · ยอด 0 ไม่สร้างแถว

### 6.5 รายได้จาก Service Fee — Model SUCCESS_FEE (อ้างอิงไฟล์ 12, 19)

```
หมายเหตุ timing: Revenue เกิดเมื่อ expense ของเคสนั้นเข้าสู่ approved แล้วเท่านั้น
                  (ไม่ใช่ทันทีที่ outcome = closed_success — ดูไฟล์ 19 §6.1 สำหรับเหตุผลเต็ม)

ถ้า outcome != closed_success: revenue_gross = 0
ถ้า outcome = closed_success และ expense.status = approved:
  ฐานคำนวณ = debt_amount  หรือ  asset_value  (ตามที่ตั้งค่า basis ไว้ในเทมเพลต)
  revenue_gross = ฐานคำนวณ × (rate / 100)
```

### 6.6 รายได้จาก Service Fee — Model FLAT (อ้างอิงไฟล์ 12)

```
ถ้า charge_on_fail = true:  revenue_gross = base  (ทุก outcome)
ถ้า charge_on_fail = false: revenue_gross = base  เฉพาะ closed_success, ไม่ใช่ = 0 เมื่อ closed_fail
```

### 6.7 รายได้จาก Service Fee — Model HYBRID (อ้างอิงไฟล์ 12)

```
ส่วน base:
  ถ้า charge_on_fail = true:  ได้ base ทุก outcome
  ถ้า charge_on_fail = false: ได้ base เฉพาะ closed_success

ส่วน rate × basis (ได้เฉพาะ closed_success เท่านั้น เสมอ ไม่มีเงื่อนไข charge_on_fail):
  ฐานคำนวณ = debt_amount หรือ asset_value (ตามที่ตั้งค่า)
  ส่วนเพิ่ม = ฐานคำนวณ × (rate / 100)

revenue_gross = base_component + (ส่วนเพิ่ม ถ้า closed_success, มิฉะนั้น 0)
```

### 6.8 VAT (อ้างอิงไฟล์ 13 §6.5, 19 §6.3)

```
หาอัตรา VAT ที่ effective ณ revenue_date:
  vat_rate = vat_rate_history ที่ effective_from <= revenue_date <= (effective_to หรือ ยังไม่มีวันสิ้นสุด)

ถ้า บริษัทไฟแนนซ์ vat_mode = no_vat:        vat_amount = 0
ถ้า vat_mode = exclude_vat (ราคาก่อน VAT แยกบรรทัด):
  vat_amount = revenue_gross × (vat_rate / 100)
  total_amount = revenue_gross + vat_amount
ถ้า vat_mode = include_vat (ราคารวม VAT):
  vat_amount = revenue_gross × vat_rate / (100 + vat_rate)
  total_amount = revenue_gross  (ราคาที่ตกลงรวม VAT แล้ว ไม่บวกเพิ่ม)

snapshot vat_rate_used ไว้ที่ Revenue Record เสมอ ไม่ดึงอัตราสดทุกครั้ง
```

#### 6.8.1 VAT ของใบลดหนี้ (มติ PO 05/10/2569 U14 · มติบัญชี B1 · ม.86/10)

ใบลดหนี้ออกโดยสำนักงานบัญชีนอกระบบ — ระบบบันทึกยอดตามเอกสารแล้วตรวจความสอดคล้อง:

```
vat_rate_pct_used    = อัตรา VAT ของใบกำกับเดิม (revenues.vat_rate_pct_used ของรอบวางบิล — ต้องมีอัตราเดียว)
expected_vat         = round_half_up(amount_before_vat × vat_rate_pct_used / 100)   (ตัวคูณกลาง pctOfSatang)
vat_amount           = ยอดตามเอกสาร (ไม่กรอก = expected_vat) · |vat_amount − expected_vat| ≤ 1 สตางค์
total_amount         = amount_before_vat + vat_amount   (คิดที่ server เสมอ)
ยอดคงเหลือของใบกำกับ = ยอดใบกำกับ − Σ ใบลดหนี้ที่ active (ทั้งก่อน VAT และยอดรวม) — ใบลดหนี้ใหม่ห้ามเกินยอดคงเหลือ
```

**ใบเพิ่มหนี้ (มติ PO 05/10/2569 U19 · ม.86/9)** — สูตร VAT / ยอดรวม เดียวกันทุกบรรทัดข้างบน ยกเว้น:

```
ใบเพิ่มหนี้: amount_before_vat > 0 · ไม่มีเพดานยอดใบกำกับ
ยอดคงเหลือที่ลดหนี้ได้ = ยอดใบกำกับ − Σ ใบลดหนี้ active   (ไม่นับใบเพิ่มหนี้ — ยกเลิกใบเพิ่มหนี้ภายหลังต้องไม่ทำให้ลดหนี้ทะลุใบกำกับ)
ยอดตามเอกสาร         = ยอดใบกำกับ − Σ ใบลดหนี้ active + Σ ใบเพิ่มหนี้ active   (ทีละช่อง: ก่อน VAT / VAT / รวม)
รอบวางบิลมีหลายอัตรา VAT ⇒ ปฏิเสธ CREDIT_NOTE_VAT_MISMATCH (ข้อความบอกเหตุผล — U21)
```

implement ใบเพิ่มหนี้: `netInvoiceAmounts` / `creditableInvoiceBalance` / `sumActiveDebitNotes` (ไฟล์เดียวกัน) · portal `applyCreditNotes(invoiced, credit, debit)`

implement: `lib/credit-notes/credit-note.ts` (`resolveCreditNoteAmounts` / `assertWithinInvoiceBalance`)

### 6.9 ภาษีหัก ณ ที่จ่าย (WHT) (อ้างอิงไฟล์ 13 §6.4, 17, 18)

> **WHT Rate Priority Rule** (ดูรายละเอียดเต็มที่ไฟล์ 18 §6.3):
> Payee Profile level ชนะ Plan level เสมอ
> ```
> WHT rate = PayeeProfile.tax_profile.wht_rate   (ถ้ามี)
>          = CompensationPlan.wht_rate            (fallback ถ้า Payee ยังไม่มี Tax Profile)
> ```

```
ดึง tax_profile ของ Payee นั้น (ไฟล์ 18) → ได้ wht_rate, wht_basis, wht_min_threshold

ฐานหัก = gross_amount                           ถ้า wht_basis = before_vat (มาตรฐานทั่วไป)
       = gross_amount + vat_amount               ถ้า wht_basis = gross_amount (ไม่ปกติ แต่รองรับได้)

เกณฑ์ขั้นต่ำเทียบ "ต่อ payee ต่อรอบจ่าย" (มติ PO 03/10/2569 — UAT Q5):
  ฐานรวม_payee = SUM(ฐานหัก) ของทุกรายการค่าตอบแทนของ payee นั้นในรอบจ่ายเดียวกัน
                 (ไม่รวมเงินทดรองจ่าย — ไม่ใช่เงินได้ ไม่หัก WHT)

ถ้า ฐานรวม_payee < wht_min_threshold (ค่าเริ่มต้น 1,000 บาท): wht_amount = 0 ทุกรายการของ payee
ถ้า ฐานรวม_payee >= wht_min_threshold:
  จัดกลุ่มรายการของ payee ตาม wht_rate ที่ resolve ได้ (ปกติกลุ่มเดียว — อัตราจาก Tax Profile ของ payee)
  wht_กลุ่ม = round(ฐานรวม_กลุ่ม × (wht_rate / 100))   ปัดครั้งเดียวต่อกลุ่ม (ค่าเริ่มต้น wht_rate = 3% มาตรา 40(7)/40(8))
  กระจาย wht_กลุ่ม ลงแต่ละรายการตามสัดส่วนฐานหัก แบบ largest remainder:
    ส่วนแบ่ง_i = floor(wht_กลุ่ม × ฐาน_i / ฐานรวม_กลุ่ม)
    เศษที่เหลือ (wht_กลุ่ม − SUM(ส่วนแบ่ง)) แจกทีละ 1 สตางค์ให้รายการที่เศษหารมากสุดก่อน (เสมอกัน = รายการที่มาก่อน)
  ⇒ SUM(wht_amount ของรายการ) = wht_กลุ่ม เป๊ะ ไม่มีเศษสตางค์หาย

net_amount = gross_amount - wht_amount   (ทุกแถว)
```

> ตัวอย่าง: payee อัตรา 3% มี 3 รายการ × ฿600 ในรอบเดียว → ฐานรวม ฿1,800 ≥ ฿1,000 → หักรวม ฿54 (รายการละ ฿18) · ถ้ามี 2 รายการ × ฿350 → ฐานรวม ฿700 → ไม่หัก
> ใบ 50 ทวิ ออกตามรูปแบบที่ snapshot ไว้กับรอบ (ต่อผู้รับต่อรอบ = ค่าเริ่มต้น / ต่อรายการ — `33`) และสรุป ภ.ง.ด. = ผลรวมของรายการ ⇒ ตรงกับยอดรวมของ payee โดยอัตโนมัติทั้งสองแบบ
> pure module: `lib/finance/wht-calc.ts` (`calculatePayeeBatchWht()`) · 🔶 นักบัญชียืนยันก่อน go-live

#### 6.9.1 ค่าตั้งภาษีหัก ณ ที่จ่าย (มติ PO 05/10/2569 — UAT U3/U5/U7/U8)

ค่าตั้ง 3 ตัวอยู่ที่ `wht_policy_history` (effective-dated insert-only แบบ `vat_rate_history` — ไฟล์ 13 §6.4.2) · รอบจ่ายใช้แถวที่ `effective_from` ใหม่สุดที่ ≤ **วันสร้างรอบ (ปฏิทินไทย)** แล้ว **snapshot** ลง `payout_batches` (`wht_base_expense_types` / `wht_certificate_mode` / `wht_income_type_mode`) + ต่อรายการ (`wht_base_included`, `wht_income_category`) — เปลี่ยนค่าตั้งภายหลัง **ห้ามคำนวณรอบเดิมใหม่** · ไม่มีแถว = ค่าเริ่มต้นตามมติ · รอบที่สร้างก่อนมีค่าตั้ง (snapshot NULL) = พฤติกรรมเดิม (ทุกชนิดในฐาน · ใบต่อรายการ · 40(8))

```
ในฐาน_i = expense_type_i ∈ policy.base_expense_types        (ค่าเริ่มต้น: commission, no_success_fee, fuel, allowance)
          เงินทดรองจ่าย = ไม่ใช่เงินได้ ⇒ ไม่อยู่ในฐานเสมอ
ฐาน_i   = ฐานหัก (ตาม wht_basis) ถ้า ในฐาน_i · ไม่งั้น 0 (รายการนั้น wht = 0, net = gross — จ่ายเต็มตามปกติ)

ประเภทเงินได้ของ payee ในรอบ = 40(8)                   ถ้า mode = all_40_8 (ค่าเริ่มต้น)
                             = 40(2)                   ถ้า mode = all_40_2
                             = 40(2) ถ้าฝั่งผู้รับ inhouse · 40(8) ถ้า outsource   ถ้า mode = by_team_side (ฝั่ง ณ วันสร้างรอบ)

40(8): สูตรเดิมด้านบนทุกประการ แต่ใช้ ฐาน_i (เกณฑ์ ฿1,000 เทียบกับ SUM(ฐาน_i) ของ payee ต่อรอบ)
40(2): wht_rate = payee_profiles.wht_40_2_pct (กรอกเอง — สำนักงานบัญชีคำนวณให้ · 0.00 ได้)
       ไม่มีเกณฑ์ขั้นต่ำ · ฐาน before_vat · wht_payee = round(SUM(ฐาน_i) × rate/100) กระจาย largest remainder
       ผู้รับ 40(2) ที่มีรายการในฐานแต่ wht_40_2_pct IS NULL ⇒ ปัดการสร้างรอบ WHT_40_2_RATE_MISSING (+ รายชื่อ)

ออก 50 ทวิ ของกลุ่ม (ผู้รับต่อรอบ / รายการ) = wht_กลุ่ม > 0
                                          OR ( policy.issue_zero_rate_40_2_certificate        -- มติ PO 05/10/2569 U16 · ค่าเริ่มต้น true
                                               AND ประเภทเงินได้ = 40(2) AND wht_กลุ่ม = 0
                                               AND SUM(gross ของรายการในฐาน) > 0 )
       ใบ 0%: gross = SUM(gross ในฐาน) · wht = 0 · filing_form = PND1 (นับจำนวน/เงินได้ใน ภ.ง.ด.1 แต่ภาษี 0)
       40(8) ต่ำกว่าเกณฑ์ (wht = 0) ⇒ ไม่ออกเหมือนเดิมเสมอ · snapshot NULL (รอบเก่า) ⇒ ถือเป็น false
```

> A1 (golden UAT): in1 คอมมิชชัน ฿1,000 + น้ำมัน ฿200 + เบี้ยเลี้ยง ฿150 + ค่าที่พัก ฿600 = ฿1,950 → ฐาน WHT ฿1,350 → หัก **4,050 สตางค์** → โอน ฿1,909.50
> pure module: `lib/settings/wht-policy.ts` (`isInWhtBase()`/`resolveIncomeCategory()`/`resolveWhtPolicyAt()`) + `calculatePayeeBatchWht(items, { incomeCategory, section402Pct })` · การออกใบ 0% (U16) = `shouldIssueZeroRate402Certificate()` ใน `lib/wht/wht.ts` · 🔶 ประเภทเงินได้จริงรอนักบัญชียืนยัน (A3)

### 6.10 ยอด Payout Batch รวม (อ้างอิงไฟล์ 17)

```
batch.gross_amount = SUM(item.gross_amount) ของทุกรายการใน batch
batch.wht_amount   = SUM(item.wht_amount)
batch.net_amount   = batch.gross_amount - batch.wht_amount   (= SUM(item.net_amount))
```

### 6.11 AR คงค้าง (อ้างอิงไฟล์ 19 §6.4)

```
ar_outstanding = billing_batch.total_amount - billing_batch.received_amount
```

### 6.12 กำไรขั้นต้น (Gross Profit) — ไฟล์ 21 (Actual เท่านั้น ไม่ใช่ projection)

```
revenue = SUM(revenue_gross + vat_amount หรือไม่รวม VAT แล้วแต่นิยาม — ใช้ revenue_gross ไม่รวม VAT เพราะ VAT ไม่ใช่รายได้จริงของบริษัท)
direct_cost = SUM(fuel + allowance + commission/no_success_fee) ของมิติเดียวกันในช่วงเวลาเดียวกัน

gross_profit = revenue - direct_cost
margin_pct = (gross_profit / revenue) × 100   ถ้า revenue > 0, มิฉะนั้นแสดง "N/A" ไม่หารด้วย 0
```

### 6.13 เงินทดรองจ่าย — ยอดคืน (อ้างอิงไฟล์ 15) — แก้ไขแล้ว (มติ PO 03/10/2569 — UAT Q3)

```
ฐาน = approved_amount (ยอดที่อนุมัติ = เงินที่จ่ายออกไปจริง — ตรงกับ generated column `advances.return_satang` ใน `02` §5)

return_amount = max(0, approved_amount - used_amount)          ห้ามติดลบเด็ดขาด
excess_amount = max(0, used_amount - approved_amount)

ถ้า excess_amount > 0:
  เคลียร์ยอดได้ตามปกติ (ไม่บล็อก) → return_amount = 0
  ระบบสร้าง "คำขอเบิกส่วนเกิน" อัตโนมัติในทรานแซกชันเดียวกับการเคลียร์ยอด:
    expense_type = manual, gross_amount = excess_amount, case_id = NULL
    payee = payee เดียวกับเงินทดรอง (WHT ใช้ Tax Profile ของ payee — §6.9)
    comp_plan snapshot = แผนของทีมผู้รับเงิน ณ ตอนเคลียร์ยอด (fallback อัตรา WHT เท่านั้น)
    status = pending_approval (เข้าสายอนุมัติค่าตอบแทนตามปกติ แล้วจ่ายผ่านรอบจ่าย)
```

> ตัวอย่าง: อนุมัติ ฿3,000 ใช้ ฿2,450 → คืน ฿550 · ใช้ ฿3,000 → คืน 0 · ใช้ ฿3,100 → คืน 0 + คำขอเบิกส่วนเกิน ฿100
> pure module: `lib/finance/advance-calc.ts` (`advanceSettlement()`)

## 7. Data Entities / Required Objects

ไม่มี entity ใหม่ของตัวเอง — ไฟล์นี้เป็น "สูตร" ที่ใช้กับ field ที่กำหนดไว้แล้วในไฟล์ 11/12/13/17/18/19/21

## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้)

ไฟล์นี้เป็นเอกสารอ้างอิงสูตรเชิงเทคนิค ไม่มี UI/Workflow/Permission ของตัวเอง — ดูรายละเอียดเชิง business ที่ไฟล์ต้นทางแต่ละสูตรอ้างถึง

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Allowance คำนวณต่อวันที่ลงพื้นที่จริง** ไม่ใช่ค่าคงที่ต่อเคส — แก้ไขแล้วให้ตรงกับหน่วย "บาท/วัน" ในไฟล์ 11 (§6.3)
- **ค่าน้ำมันเหมาจ่าย + เบี้ยเลี้ยง = วันละครั้งต่อพนักงาน แล้วเฉลี่ยทุกเคสของวันนั้น · เกิดหลังจบวัน** — มติ PO 03/10/2569 (UAT Q21 · DEC-012) (§6.2/§6.3)
- **Revenue เกิดที่จุด `expense.approved`** ไม่ใช่ตอน `closed_success` ตรงๆ — สอดคล้องกับ Warehouse gate ในไฟล์ 19 (§6.5)
- **WHT Rate Priority: Payee level ชนะ Plan level เสมอ** — fallback ไป Plan level เฉพาะเมื่อ Payee ไม่มี Tax Profile (§6.9)
- **VAT snapshot ที่ Revenue Record เสมอ** ไม่ดึงอัตราสดทุกครั้งที่แสดงผล (§6.8)
- **Commission/No-Success Fee เป็น mutually exclusive ตาม outcome** ไม่มีการหารเฉลี่ยเคสต่อวัน "กฎหาร 4" ถูกยกเลิกแล้ว (§6.4)
- **Margin % ต้องไม่หารด้วย 0** — แสดง "N/A" เมื่อ revenue = 0 (§6.12)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- 🔶 ทุกจุดที่มีเครื่องหมาย 🔶 ในไฟล์ต้นทาง (11, 12, 13, 19) ที่สูตรเหล่านี้อ้างอิง ยังต้องนักบัญชียืนยันก่อนใช้คำนวณเงินจริง

---

*เอกสารนี้เป็นไฟล์แรกในหมวด Finance Reference (22–29) ต่อด้วย `23-finance-state-machines.md`*
