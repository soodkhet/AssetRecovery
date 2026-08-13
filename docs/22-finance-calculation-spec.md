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

### 6.2 ค่าน้ำมัน (Fuel) — โหมด DAILY_FLAT (อ้างอิงไฟล์ 11)

```
ยอดจ่ายจริง = daily_flat_rate (ค่าคงที่ ไม่คำนวณระยะทาง)
```

### 6.3 เบี้ยเลี้ยง (Allowance) — แก้ไขแล้ว (ดู Changelog v2)

```
จำนวนวันที่ลงพื้นที่จริง = COUNT(DISTINCT วันที่ของ check_ins ที่ผูกกับเคสนั้น)
                          (นับจากตาราง check_ins ตาม 02-database-schema-design.md §7 — 1 วันปฏิทิน = 1 วัน แม้มีหลาย check-in ในวันเดียวกัน)

ยอดจ่ายจริง = allowance_rate (บาท/วัน) × จำนวนวันที่ลงพื้นที่จริง
```

> ยืนยันกับ Product Owner แล้ว (03/07/2569): allowance คำนวณ**ต่อวัน** ไม่ใช่ค่าคงที่ต่อเคส — ตรงกับหน่วย "บาท/วัน" ที่นิยามไว้ใน `11-compensation.md` §10

### 6.4 Commission / No-Success Fee (อ้างอิงไฟล์ 11)

```
ถ้า outcome = closed_success: ยอดจ่ายจริง = commission_amount (ค่าตายตัวต่อเคส ไม่ใช่ % ของมูลหนี้)
ถ้า outcome = closed_fail:    ยอดจ่ายจริง = no_success_fee_amount (เบี้ยเสี่ยง — exclusive กับ commission)
หมายเหตุ: ไม่มีการหารเฉลี่ยตามจำนวนเคสต่อวัน (กฎหาร 4 ถูกยกเลิกแล้ว)
```

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

ถ้า ฐานหัก < wht_min_threshold (ค่าเริ่มต้น 1,000 บาท): wht_amount = 0
ถ้า ฐานหัก >= wht_min_threshold:
  wht_amount = ฐานหัก × (wht_rate / 100)   (ค่าเริ่มต้น wht_rate = 3% สำหรับค่าจ้างทำของ มาตรา 40(7)/40(8))

net_amount = gross_amount - wht_amount
```

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

### 6.13 เงินทดรองจ่าย — ยอดคืน (อ้างอิงไฟล์ 15)

```
ถ้า used_amount <= requested_amount:
  return_amount = requested_amount - used_amount
ถ้า used_amount > requested_amount:
  return_amount = 0   (ส่วนที่เกินต้องสร้าง Claim เพิ่มแยกต่างหาก ไม่ใช่ return_amount ติดลบ)
```

## 7. Data Entities / Required Objects

ไม่มี entity ใหม่ของตัวเอง — ไฟล์นี้เป็น "สูตร" ที่ใช้กับ field ที่กำหนดไว้แล้วในไฟล์ 11/12/13/17/18/19/21

## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้)

ไฟล์นี้เป็นเอกสารอ้างอิงสูตรเชิงเทคนิค ไม่มี UI/Workflow/Permission ของตัวเอง — ดูรายละเอียดเชิง business ที่ไฟล์ต้นทางแต่ละสูตรอ้างถึง

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Allowance คำนวณต่อวันที่ลงพื้นที่จริง** (`rate × จำนวนวันที่มี check-in`) ไม่ใช่ค่าคงที่ต่อเคส — แก้ไขแล้วให้ตรงกับหน่วย "บาท/วัน" ในไฟล์ 11 (§6.3)
- **Revenue เกิดที่จุด `expense.approved`** ไม่ใช่ตอน `closed_success` ตรงๆ — สอดคล้องกับ Warehouse gate ในไฟล์ 19 (§6.5)
- **WHT Rate Priority: Payee level ชนะ Plan level เสมอ** — fallback ไป Plan level เฉพาะเมื่อ Payee ไม่มี Tax Profile (§6.9)
- **VAT snapshot ที่ Revenue Record เสมอ** ไม่ดึงอัตราสดทุกครั้งที่แสดงผล (§6.8)
- **Commission/No-Success Fee เป็น mutually exclusive ตาม outcome** ไม่มีการหารเฉลี่ยเคสต่อวัน "กฎหาร 4" ถูกยกเลิกแล้ว (§6.4)
- **Margin % ต้องไม่หารด้วย 0** — แสดง "N/A" เมื่อ revenue = 0 (§6.12)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- 🔶 ทุกจุดที่มีเครื่องหมาย 🔶 ในไฟล์ต้นทาง (11, 12, 13, 19) ที่สูตรเหล่านี้อ้างอิง ยังต้องนักบัญชียืนยันก่อนใช้คำนวณเงินจริง

---

*เอกสารนี้เป็นไฟล์แรกในหมวด Finance Reference (22–29) ต่อด้วย `23-finance-state-machines.md`*
